/**
 * WebSocket Client for Real-time Updates
 */

import { io, Socket } from 'socket.io-client';
import type { ProgressPayload, JobStatus } from '../types';
import { useAuthStore } from '../store/authStore';

export interface ProgressEvent {
  jobId: string;
  progress: ProgressPayload;
}

export interface StateEvent {
  jobId: string;
  status: JobStatus;
  error?: string;
}

export interface LogEvent {
  jobId: string;
  level: string;
  message: string;
  timestamp: string;
}

export interface ErrorEvent {
  jobId: string;
  error: string;
  code?: string;
}

type EventHandler<T> = (data: T) => void;

class SocketClient {
  private socket: Socket | null = null;
  private subscribedJobs: Set<string> = new Set();
  // Reference counting for subscriptions - track how many components subscribed to each job
  private subscriptionCounts: Map<string, number> = new Map();
  private handlers: {
    progress: EventHandler<ProgressEvent>[];
    state: EventHandler<StateEvent>[];
    log: EventHandler<LogEvent>[];
    error: EventHandler<ErrorEvent>[];
  } = {
    progress: [],
    state: [],
    log: [],
    error: [],
  };

  connect(): void {
    if (this.socket?.connected) return;

    const token = localStorage.getItem('vdm-auth')
      ? JSON.parse(localStorage.getItem('vdm-auth')!).state?.token
      : null;

    this.socket = io('/', {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      // Re-subscribe to jobs after reconnect
      if (this.subscribedJobs.size > 0) {
        this.socket?.emit('subscribe', Array.from(this.subscribedJobs));
      }
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
      // Handle authentication errors
      if (error.message?.includes('401') || error.message?.includes('unauthorized') || error.message?.includes('Unauthorized')) {
        useAuthStore.getState().logout();
      }
    });

    this.socket.on('progress', (data: { jobId: string; payload: ProgressPayload }) => {
      this.handlers.progress.forEach((handler) => handler({
        jobId: data.jobId,
        progress: data.payload,
      }));
    });

    this.socket.on('state_change', (data: { jobId: string; payload: { from: string; to: JobStatus; error?: string } }) => {
      this.handlers.state.forEach((handler) => handler({
        jobId: data.jobId,
        status: data.payload.to,
        error: data.payload.error,
      }));
    });

    this.socket.on('log', (data: LogEvent) => {
      this.handlers.log.forEach((handler) => handler(data));
    });

    this.socket.on('error', (data: ErrorEvent) => {
      this.handlers.error.forEach((handler) => handler(data));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.subscribedJobs.clear();
    this.subscriptionCounts.clear();
  }

  subscribe(jobId: string): void {
    // Increment reference count
    const currentCount = this.subscriptionCounts.get(jobId) || 0;
    this.subscriptionCounts.set(jobId, currentCount + 1);

    // Only actually subscribe to server if this is the first subscription
    if (!this.subscribedJobs.has(jobId)) {
      this.subscribedJobs.add(jobId);
      this.socket?.emit('subscribe', [jobId]);
    }
  }

  unsubscribe(jobId: string): void {
    // Decrement reference count
    const currentCount = this.subscriptionCounts.get(jobId) || 0;
    if (currentCount <= 1) {
      // Last subscriber - actually unsubscribe from server
      this.subscriptionCounts.delete(jobId);
      if (this.subscribedJobs.has(jobId)) {
        this.subscribedJobs.delete(jobId);
        this.socket?.emit('unsubscribe', [jobId]);
      }
    } else {
      // Still have other subscribers - just decrement count
      this.subscriptionCounts.set(jobId, currentCount - 1);
    }
  }

  onProgress(handler: EventHandler<ProgressEvent>): () => void {
    this.handlers.progress.push(handler);
    return () => {
      this.handlers.progress = this.handlers.progress.filter((h) => h !== handler);
    };
  }

  onState(handler: EventHandler<StateEvent>): () => void {
    this.handlers.state.push(handler);
    return () => {
      this.handlers.state = this.handlers.state.filter((h) => h !== handler);
    };
  }

  onLog(handler: EventHandler<LogEvent>): () => void {
    this.handlers.log.push(handler);
    return () => {
      this.handlers.log = this.handlers.log.filter((h) => h !== handler);
    };
  }

  onError(handler: EventHandler<ErrorEvent>): () => void {
    this.handlers.error.push(handler);
    return () => {
      this.handlers.error = this.handlers.error.filter((h) => h !== handler);
    };
  }
}

export const socketClient = new SocketClient();
