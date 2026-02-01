import { Tag } from 'antd';
import type { JobStatus } from '../types';

interface StatusBadgeProps {
  status: JobStatus;
}

const statusConfig: Record<JobStatus, { label: string; color: string }> = {
  QUEUED: { label: 'Queued', color: 'default' },
  DOWNLOADING: { label: 'Downloading', color: 'processing' },
  DOWNLOADED: { label: 'Downloaded', color: 'blue' },
  DUBBING: { label: 'Dubbing', color: 'purple' },
  DUBBED: { label: 'Dubbed', color: 'purple' },
  MUXING: { label: 'Muxing', color: 'cyan' },
  COMPLETE: { label: 'Complete', color: 'success' },
  FAILED: { label: 'Failed', color: 'error' },
  CANCELED: { label: 'Canceled', color: 'warning' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, color: 'default' };

  return <Tag color={config.color}>{config.label}</Tag>;
}
