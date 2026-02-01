import { useEffect } from 'react';
import { Spin, Alert, Empty, Space, Button, Typography } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import type { Job } from '../types';
import { JobItem } from './JobItem';
import { useJobStore } from '../store/jobStore';
import { socketClient } from '../services/socket';

const { Text } = Typography;

interface JobListProps {
  onSelectJob: (job: Job) => void;
}

export function JobList({ onSelectJob }: JobListProps) {
  const { jobs, loading, error, fetchJobs, updateJobStatus, updateJobProgress } =
    useJobStore();

  useEffect(() => {
    fetchJobs();

    socketClient.connect();

    const unsubProgress = socketClient.onProgress((event) => {
      updateJobProgress(event.jobId, event.progress);
    });

    const unsubState = socketClient.onState((event) => {
      updateJobStatus(event.jobId, event.status, event.error);
    });

    return () => {
      unsubProgress();
      unsubState();
    };
  }, []);

  if (loading && jobs.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 256,
        }}
      >
        <Spin tip="Loading jobs..." size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Error"
        description={error}
        type="error"
        showIcon
        action={
          <Button size="small" danger onClick={() => fetchJobs()}>
            Retry
          </Button>
        }
      />
    );
  }

  if (jobs.length === 0) {
    return (
      <Empty
        image={<CloudUploadOutlined style={{ fontSize: 64, color: '#4b5563' }} />}
        imageStyle={{ height: 80 }}
        description={
          <Space direction="vertical" size={0}>
            <Text>No downloads yet</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Add a URL to start downloading
            </Text>
          </Space>
        }
      />
    );
  }

  const sortedJobs = [...jobs].sort((a, b) => {
    const activeStatuses = ['DOWNLOADING', 'DUBBING', 'MUXING', 'QUEUED'];
    const aActive = activeStatuses.includes(a.status);
    const bActive = activeStatuses.includes(b.status);

    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {sortedJobs.map((job) => (
        <JobItem key={job.id} job={job} onSelect={onSelectJob} />
      ))}
    </Space>
  );
}
