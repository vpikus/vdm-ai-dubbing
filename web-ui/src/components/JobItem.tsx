import { useEffect, useMemo } from 'react';
import { Card, Button, Space, Typography, Tag, Alert, App } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';
import type { Job } from '../types';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { useJobStore } from '../store/jobStore';
import { socketClient } from '../services/socket';

const { Text } = Typography;

const ACTIVE_STATUSES = ['QUEUED', 'DOWNLOADING', 'DOWNLOADED', 'DUBBING', 'DUBBED', 'MUXING'];

interface JobItemProps {
  job: Job;
  onSelect: (job: Job) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function extractTitle(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube')) {
      const videoId = parsed.searchParams.get('v');
      if (videoId) return `YouTube: ${videoId}`;
    }
    return parsed.hostname + parsed.pathname.slice(0, 30);
  } catch {
    return url.slice(0, 50);
  }
}

export function JobItem({ job, onSelect }: JobItemProps) {
  const { progress, cancelJob, retryJob, resumeJob, deleteJob } = useJobStore();
  const jobProgress = progress[job.id];

  // Use Ant Design's App.useApp() hook to access modal.confirm()
  // This creates modals imperatively, outside the React component tree,
  // so there's no event bubbling through React's synthetic event system
  const { modal } = App.useApp();

  useEffect(() => {
    if (ACTIVE_STATUSES.includes(job.status)) {
      socketClient.subscribe(job.id);
      return () => {
        socketClient.unsubscribe(job.id);
      };
    }
  }, [job.id, job.status]);

  const isActive = useMemo(() => ACTIVE_STATUSES.includes(job.status), [job.status]);

  const canCancel = useMemo(() => ACTIVE_STATUSES.includes(job.status), [job.status]);

  const canRetry = useMemo(() => ['FAILED', 'CANCELED'].includes(job.status), [job.status]);

  const canResume = useMemo(
    () => job.status === 'FAILED' && job.requestedDubbing,
    [job.status, job.requestedDubbing]
  );

  const canDelete = useMemo(
    () => ['COMPLETE', 'FAILED', 'CANCELED'].includes(job.status),
    [job.status]
  );

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    cancelJob(job.id);
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    retryJob(job.id);
  };

  const handleResume = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await resumeJob(job.id);
      if (result.resumedFrom) {
        console.log(`Resumed job from ${result.resumedFrom}`);
      }
    } catch {
      // Error is handled by the store
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Use modal.confirm() which creates the modal imperatively,
    // completely outside the React component tree
    modal.confirm({
      title: 'Delete Job',
      icon: <ExclamationCircleFilled />,
      content: 'Are you sure you want to delete this job? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      centered: true,
      onOk() {
        deleteJob(job.id);
      },
    });
  };

  return (
    <Card hoverable onClick={() => onSelect(job)} styles={{ body: { padding: 16 } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space style={{ marginBottom: 4 }}>
            <StatusBadge status={job.status} />
            {job.requestedDubbing && <Tag color="purple">Dub: {job.targetLang}</Tag>}
          </Space>
          <Text
            strong
            style={{ display: 'block', marginBottom: 4 }}
            ellipsis={{ tooltip: extractTitle(job.url) }}
          >
            {extractTitle(job.url)}
          </Text>
          <Text
            type="secondary"
            style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
            ellipsis={{ tooltip: job.url }}
          >
            {job.url}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Created: {formatDate(job.createdAt)}
          </Text>
        </div>

        <Space>
          {canCancel && (
            <Button size="small" onClick={handleCancel}>
              Cancel
            </Button>
          )}
          {canResume && (
            <Button
              size="small"
              type="primary"
              style={{ background: '#16a34a' }}
              onClick={handleResume}
              title="Resume from last successful step"
            >
              Resume
            </Button>
          )}
          {canRetry && (
            <Button
              size="small"
              type="primary"
              onClick={handleRetry}
              title="Restart from beginning"
            >
              Retry
            </Button>
          )}
          {canDelete && (
            <Button size="small" danger onClick={handleDelete}>
              Delete
            </Button>
          )}
        </Space>
      </div>

      {job.error && <Alert message={job.error} type="error" style={{ marginTop: 8 }} showIcon />}

      {isActive && jobProgress && (
        <div style={{ marginTop: 12 }}>
          <ProgressBar
            percent={jobProgress.percent}
            stage={jobProgress.stage}
            speed={jobProgress.speed}
            eta={jobProgress.eta}
          />
        </div>
      )}
    </Card>
  );
}
