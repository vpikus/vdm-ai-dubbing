import { useEffect } from 'react';
import { Modal, Button, Space, Descriptions, Divider, Alert, Tag, Typography, App } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';
import type { JobDetail as JobDetailType } from '../types';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { useJobStore } from '../store/jobStore';
import { socketClient } from '../services/socket';

const { Text } = Typography;

interface JobDetailProps {
  job: JobDetailType;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export function JobDetail({ job, onClose }: JobDetailProps) {
  const { progress, cancelJob, retryJob, resumeJob, deleteJob } = useJobStore();
  const jobProgress = progress[job.id];
  const { modal } = App.useApp();

  useEffect(() => {
    socketClient.subscribe(job.id);
    return () => {
      socketClient.unsubscribe(job.id);
    };
  }, [job.id]);

  const isActive = ['QUEUED', 'DOWNLOADING', 'DOWNLOADED', 'DUBBING', 'DUBBED', 'MUXING'].includes(
    job.status
  );
  const canCancel = ['QUEUED', 'DOWNLOADING', 'DOWNLOADED', 'DUBBING', 'DUBBED', 'MUXING'].includes(
    job.status
  );
  const canRetry = ['FAILED', 'CANCELED'].includes(job.status);
  const canResume = job.status === 'FAILED' && job.requestedDubbing;
  const canDelete = ['COMPLETE', 'FAILED', 'CANCELED'].includes(job.status);

  const handleDelete = () => {
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
        onClose();
      },
    });
  };

  const getEventColor = (event: { event: string; payload?: unknown }) => {
    const payload = event.payload as Record<string, unknown> | undefined;
    if (event.event === 'log' && payload?.level === 'error') return '#f87171';
    if (event.event === 'log' && payload?.level === 'warning') return '#fbbf24';
    if (event.event === 'state_change') return '#60a5fa';
    if (event.event === 'error') return '#f87171';
    if (event.event === 'started') return '#4ade80';
    if (event.event === 'progress') return '#22d3ee';
    return '#d1d5db';
  };

  const getEventMessage = (event: { event: string; payload?: unknown }) => {
    const payload = event.payload as Record<string, unknown> | undefined;
    if (event.event === 'log' && payload) return String(payload.message || '');
    if (event.event === 'state_change' && payload) return `${payload.from} → ${payload.to}`;
    if (event.event === 'error' && payload)
      return String(payload.message || payload.code || 'Error');
    if (event.event === 'started') return 'Job started';
    if (event.event === 'progress' && payload) return `${payload.stage}: ${payload.percent}%`;
    return event.event;
  };

  return (
    <Modal
      title="Job Details"
      open={true}
      onCancel={onClose}
      width={700}
      footer={
        <Space>
          {canCancel && <Button onClick={() => cancelJob(job.id)}>Cancel Job</Button>}
          {canResume && (
            <Button
              type="primary"
              style={{ background: '#16a34a' }}
              onClick={() => resumeJob(job.id)}
              title="Resume from last successful step"
            >
              Resume
            </Button>
          )}
          {canRetry && (
            <Button type="primary" onClick={() => retryJob(job.id)}>
              Retry Job
            </Button>
          )}
          {canDelete && (
            <Button danger onClick={handleDelete}>
              Delete Job
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </Space>
      }
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space>
          <StatusBadge status={job.status} />
          {job.requestedDubbing && (
            <Tag color="purple">
              Dubbing: {job.targetLang}
              {job.useLivelyVoice && ' (Lively)'}
            </Tag>
          )}
        </Space>

        {isActive && jobProgress && (
          <ProgressBar
            percent={jobProgress.percent}
            stage={jobProgress.stage}
            speed={jobProgress.speed}
            eta={jobProgress.eta}
          />
        )}

        {job.error && <Alert message={job.error} type="error" showIcon />}

        <Descriptions column={2} size="small">
          <Descriptions.Item label="URL" span={2}>
            <Text copyable style={{ wordBreak: 'break-all' }}>
              {job.url}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="Created">{formatDate(job.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="Updated">{formatDate(job.updatedAt)}</Descriptions.Item>
          {job.completedAt && (
            <Descriptions.Item label="Completed">{formatDate(job.completedAt)}</Descriptions.Item>
          )}
          <Descriptions.Item label="Format">{job.formatPreset}</Descriptions.Item>
          <Descriptions.Item label="Container">
            {job.outputContainer.toUpperCase()}
          </Descriptions.Item>
          <Descriptions.Item label="Retries">{job.retries}</Descriptions.Item>
        </Descriptions>

        {job.media && (
          <>
            <Divider>Media Info</Divider>
            <Descriptions column={2} size="small">
              {job.media.sourceTitle && (
                <Descriptions.Item label="Title" span={2}>
                  {job.media.sourceTitle}
                </Descriptions.Item>
              )}
              {job.media.sourceUploader && (
                <Descriptions.Item label="Uploader">{job.media.sourceUploader}</Descriptions.Item>
              )}
              {job.media.durationSec && (
                <Descriptions.Item label="Duration">
                  {formatDuration(job.media.durationSec)}
                </Descriptions.Item>
              )}
              {job.media.width && job.media.height && (
                <Descriptions.Item label="Resolution">
                  {job.media.width}x{job.media.height}
                </Descriptions.Item>
              )}
              {job.media.fileSizeBytes && (
                <Descriptions.Item label="File Size">
                  {formatBytes(job.media.fileSizeBytes)}
                </Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}

        {job.events && job.events.length > 0 && (
          <>
            <Divider>Event Log</Divider>
            <div
              style={{
                maxHeight: 200,
                overflowY: 'auto',
                background: '#111827',
                borderRadius: 8,
                padding: 8,
              }}
            >
              {job.events.map((event) => (
                <div
                  key={event.id}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(event.ts).toLocaleTimeString()}
                  </Text>{' '}
                  <span style={{ color: getEventColor(event) }}>{getEventMessage(event)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Space>
    </Modal>
  );
}
