/**
 * REST API Client for Gateway Service
 */

import type {
  Job,
  JobDetail,
  CreateJobRequest,
  LoginRequest,
  LoginResponse,
} from '../types';
import { useAuthStore } from '../store/authStore';

const API_BASE = '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('vdm-auth')
    ? JSON.parse(localStorage.getItem('vdm-auth')!).state?.token
    : null;

  const headers: HeadersInit = {
    ...options.headers,
  };

  // Only set Content-Type for requests with a body
  if (options.body) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // Handle 401 Unauthorized - clear auth state and redirect to login
    if (response.status === 401) {
      useAuthStore.getState().logout();
    }
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(response.status, error.message || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Auth endpoints
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function logout(): Promise<void> {
  return request<void>('/auth/logout', {
    method: 'POST',
  });
}

// Job endpoints
interface JobsResponse {
  jobs: Job[];
  total: number;
  limit: number;
  offset: number;
}

export async function getJobs(status?: string): Promise<Job[]> {
  const params = status ? `?status=${status}` : '';
  const response = await request<JobsResponse>(`/jobs${params}`);
  return response.jobs;
}

export async function getJob(id: string): Promise<JobDetail> {
  return request<JobDetail>(`/jobs/${id}`);
}

export async function createJob(data: CreateJobRequest): Promise<Job> {
  return request<Job>('/jobs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function cancelJob(id: string): Promise<Job> {
  return request<Job>(`/jobs/${id}/cancel`, {
    method: 'POST',
  });
}

export async function retryJob(id: string): Promise<Job> {
  return request<Job>(`/jobs/${id}/retry`, {
    method: 'POST',
  });
}

export async function resumeJob(id: string): Promise<Job & { resumedFrom?: string }> {
  return request<Job & { resumedFrom?: string }>(`/jobs/${id}/resume`, {
    method: 'POST',
  });
}

export async function deleteJob(id: string): Promise<void> {
  return request<void>(`/jobs/${id}`, {
    method: 'DELETE',
  });
}

export { ApiError };
