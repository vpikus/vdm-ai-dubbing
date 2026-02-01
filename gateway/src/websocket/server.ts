import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { subscribeToAllEvents } from '../queue/client.js';
import { updateJobStatus, logJobEvent, updateMedia } from '../db/jobs.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  EventMessage,
  ProgressPayload,
  StateChangePayload,
  LogPayload,
  ErrorPayload,
  JobStatus,
} from '../../types/index.js';

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

// Track which sockets are subscribed to which jobs
const socketJobSubscriptions = new Map<string, Set<string>>();
const jobSocketSubscriptions = new Map<string, Set<string>>();

export function initializeWebSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    path: '/socket.io',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`Client connected: ${socket.id}`);

    // Initialize subscription tracking
    socketJobSubscriptions.set(socket.id, new Set());

    // Handle subscribe to job updates
    socket.on('subscribe', (jobIds: string[]) => {
      const socketJobs = socketJobSubscriptions.get(socket.id);
      if (!socketJobs) return;

      for (const jobId of jobIds) {
        socketJobs.add(jobId);

        if (!jobSocketSubscriptions.has(jobId)) {
          jobSocketSubscriptions.set(jobId, new Set());
        }
        jobSocketSubscriptions.get(jobId)!.add(socket.id);

        // Join a room for this job
        socket.join(`job:${jobId}`);
      }

      console.log(`Socket ${socket.id} subscribed to jobs:`, jobIds);
    });

    // Handle unsubscribe from job updates
    socket.on('unsubscribe', (jobIds: string[]) => {
      const socketJobs = socketJobSubscriptions.get(socket.id);
      if (!socketJobs) return;

      for (const jobId of jobIds) {
        socketJobs.delete(jobId);

        const jobSockets = jobSocketSubscriptions.get(jobId);
        if (jobSockets) {
          jobSockets.delete(socket.id);
          if (jobSockets.size === 0) {
            jobSocketSubscriptions.delete(jobId);
          }
        }

        socket.leave(`job:${jobId}`);
      }

      console.log(`Socket ${socket.id} unsubscribed from jobs:`, jobIds);
    });

    // Handle authentication (for future use)
    socket.on('authenticate', (_token: string) => {
      // TODO: Verify JWT token
      socket.emit('authenticated', { success: true });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);

      // Clean up subscriptions
      const socketJobs = socketJobSubscriptions.get(socket.id);
      if (socketJobs) {
        for (const jobId of socketJobs) {
          const jobSockets = jobSocketSubscriptions.get(jobId);
          if (jobSockets) {
            jobSockets.delete(socket.id);
            if (jobSockets.size === 0) {
              jobSocketSubscriptions.delete(jobId);
            }
          }
        }
        socketJobSubscriptions.delete(socket.id);
      }
    });
  });

  return io;
}

// Subscribe to Redis events - can be called before WebSocket initialization
// Database updates will still happen, WebSocket emissions will be queued until io is available
export function subscribeToRedisEvents(): void {
  subscribeToAllEvents(handleRedisEvent);
}

function handleRedisEvent(message: EventMessage): void {
  const { jobId, type, payload } = message;

  // Process different event types
  // Database updates happen regardless of WebSocket availability
  // WebSocket emissions only happen when io is available
  switch (type) {
    case 'progress':
      if (io) {
        io.to(`job:${jobId}`).emit('progress', message as EventMessage<ProgressPayload>);
      }
      break;

    case 'state_change':
      const statePayload = payload as StateChangePayload;

      // Update database (always)
      updateJobStatus(jobId, statePayload.to as JobStatus);
      logJobEvent(jobId, 'state_change', statePayload as unknown as Record<string, unknown>);

      // Forward to WebSocket clients (only if io available)
      if (io) {
        io.to(`job:${jobId}`).emit('state_change', message as EventMessage<StateChangePayload>);
        // Also broadcast to all clients for queue updates
        io.emit('state_change', message as EventMessage<StateChangePayload>);
      }
      break;

    case 'log':
      // Update database (always)
      logJobEvent(jobId, 'log', payload as unknown as Record<string, unknown>);

      // Forward to WebSocket clients (only if io available)
      if (io) {
        io.to(`job:${jobId}`).emit('log', message as EventMessage<LogPayload>);
      }
      break;

    case 'error':
      const errorPayload = payload as ErrorPayload;

      // Update database (always)
      logJobEvent(jobId, 'error', errorPayload as unknown as Record<string, unknown>);
      if (!errorPayload.retryable) {
        updateJobStatus(jobId, 'FAILED', errorPayload.message);
      }

      // Forward to WebSocket clients (only if io available)
      if (io) {
        io.to(`job:${jobId}`).emit('error', message as EventMessage<ErrorPayload>);
      }
      break;

    case 'metadata':
      // Update media table with metadata from downloader (always)
      const metadataPayload = payload as Record<string, unknown>;
      updateMedia(jobId, {
        sourceId: metadataPayload.sourceId as string | undefined,
        sourceTitle: metadataPayload.sourceTitle as string | undefined,
        sourceUploader: metadataPayload.sourceUploader as string | undefined,
        sourceUploadDate: metadataPayload.sourceUploadDate as string | undefined,
        sourceDescription: metadataPayload.sourceDescription as string | undefined,
        sourceThumbnailUrl: metadataPayload.sourceThumbnailUrl as string | undefined,
        durationSec: metadataPayload.durationSec as number | undefined,
        width: metadataPayload.width as number | undefined,
        height: metadataPayload.height as number | undefined,
        fps: metadataPayload.fps as number | undefined,
        videoCodec: metadataPayload.videoCodec as string | undefined,
        audioCodec: metadataPayload.audioCodec as string | undefined,
        fileSizeBytes: metadataPayload.fileSizeBytes as number | undefined,
        videoPath: metadataPayload.filePath as string | undefined,
      });
      break;
  }
}

// =============================================================================
// BROADCAST HELPERS
// =============================================================================

export function broadcastJobAdded(jobId: string, url: string, status: JobStatus): void {
  if (!io) return;
  io.emit('job_added', { jobId, url, status });
}

export function broadcastJobRemoved(jobId: string): void {
  if (!io) return;
  io.emit('job_removed', { jobId });
}

export function broadcastNotification(
  type: 'info' | 'success' | 'warning' | 'error',
  title: string,
  message: string,
  jobId?: string
): void {
  if (!io) return;

  if (jobId) {
    io.to(`job:${jobId}`).emit('notification', { type, title, message, jobId });
  } else {
    io.emit('notification', { type, title, message });
  }
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

export function closeWebSocket(): void {
  if (io) {
    io.close();
    io = null;
  }
}
