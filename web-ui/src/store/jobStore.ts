import { create } from 'zustand';
import type { Job, JobDetail, ProgressPayload, JobStatus } from '../types';
import * as api from '../services/api';
import { showError, showSuccess } from '../services/notification';

interface JobProgress {
  stage: string;
  percent: number;
  speed?: number;
  eta?: number;
}

interface JobState {
  jobs: Job[];
  selectedJob: JobDetail | null;
  progress: Record<string, JobProgress>;
  loading: boolean;
  error: string | null;

  // Actions
  fetchJobs: () => Promise<void>;
  fetchJob: (id: string) => Promise<void>;
  createJob: (url: string, options?: Partial<Parameters<typeof api.createJob>[0]>) => Promise<Job>;
  cancelJob: (id: string) => Promise<void>;
  retryJob: (id: string) => Promise<void>;
  resumeJob: (id: string) => Promise<{ resumedFrom?: string }>;
  deleteJob: (id: string) => Promise<void>;
  clearSelectedJob: () => void;

  // Real-time updates
  updateJobStatus: (jobId: string, status: JobStatus, error?: string) => void;
  updateJobProgress: (jobId: string, progress: ProgressPayload) => void;
}

export const useJobStore = create<JobState>((set) => ({
  jobs: [],
  selectedJob: null,
  progress: {},
  loading: false,
  error: null,

  fetchJobs: async () => {
    set({ loading: true, error: null });
    try {
      const jobs = await api.getJobs();
      set({ jobs, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch jobs';
      set({ error: message, loading: false });
      showError('Failed to load jobs', message);
    }
  },

  fetchJob: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const job = await api.getJob(id);
      set({ selectedJob: job, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch job';
      set({ loading: false });
      showError('Failed to load job details', message);
    }
  },

  createJob: async (url: string, options = {}) => {
    set({ loading: true, error: null });
    try {
      const job = await api.createJob({ url, ...options });
      set((state) => ({
        jobs: [job, ...state.jobs],
        loading: false,
      }));
      showSuccess('Download added', 'Job has been queued for download');
      return job;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create job';
      set({ loading: false });
      showError('Failed to create download', message);
      throw err;
    }
  },

  cancelJob: async (id: string) => {
    try {
      const job = await api.cancelJob(id);
      set((state) => ({
        jobs: state.jobs.map((j) => (j.id === id ? job : j)),
      }));
      showSuccess('Job canceled', 'Job has been stopped');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel job';
      showError('Failed to cancel job', message);
    }
  },

  retryJob: async (id: string) => {
    try {
      const job = await api.retryJob(id);
      set((state) => ({
        jobs: state.jobs.map((j) => (j.id === id ? job : j)),
      }));
      showSuccess('Job restarted', 'Job has been queued for retry');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to retry job';
      showError('Failed to retry job', message);
    }
  },

  resumeJob: async (id: string) => {
    try {
      const result = await api.resumeJob(id);
      set((state) => ({
        jobs: state.jobs.map((j) => (j.id === id ? result : j)),
      }));
      showSuccess('Job resumed', result.resumedFrom ? `Resumed from ${result.resumedFrom}` : 'Job has been resumed');
      return { resumedFrom: result.resumedFrom };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume job';
      showError('Failed to resume job', message);
      throw err;
    }
  },

  deleteJob: async (id: string) => {
    try {
      await api.deleteJob(id);
      set((state) => ({
        jobs: state.jobs.filter((j) => j.id !== id),
        selectedJob: state.selectedJob?.id === id ? null : state.selectedJob,
      }));
      showSuccess('Job deleted', 'Job has been removed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete job';
      showError('Failed to delete job', message);
    }
  },

  clearSelectedJob: () => {
    set({ selectedJob: null });
  },

  updateJobStatus: (jobId: string, status: JobStatus, error?: string) => {
    set((state) => {
      // Check if job exists in the store
      const jobExists = state.jobs.some((j) => j.id === jobId);

      if (!jobExists) {
        // Job not in store yet (race condition) - ignore for now
        // The job will be fetched with correct status when API returns
        console.log(`Received status update for unknown job ${jobId}, ignoring`);
        return state;
      }

      return {
        jobs: state.jobs.map((j) =>
          j.id === jobId ? { ...j, status, error: error ?? undefined, updatedAt: new Date().toISOString() } : j
        ),
        selectedJob:
          state.selectedJob?.id === jobId
            ? { ...state.selectedJob, status, error: error ?? undefined, updatedAt: new Date().toISOString() }
            : state.selectedJob,
      };
    });
  },

  updateJobProgress: (jobId: string, progress: ProgressPayload) => {
    set((state) => ({
      progress: {
        ...state.progress,
        [jobId]: {
          stage: progress.stage,
          percent: progress.percent,
          speed: progress.speed,
          eta: progress.eta,
        },
      },
    }));
  },
}));
