import { useState, useEffect } from 'react';
import { Layout, Typography, Badge, Space } from 'antd';
import { useAuthStore } from './store/authStore';
import { useJobStore } from './store/jobStore';
import {
  Header,
  LoginForm,
  JobList,
  JobDetail,
  AddJobDialog,
} from './components';
import type { Job } from './types';
import { socketClient } from './services/socket';

const { Content } = Layout;
const { Title } = Typography;

function App() {
  const { isAuthenticated } = useAuthStore();
  const { fetchJob, selectedJob, clearSelectedJob } = useJobStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      socketClient.connect();
    } else {
      socketClient.disconnect();
    }

    return () => {
      socketClient.disconnect();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedJobId) {
      fetchJob(selectedJobId);
    }
  }, [selectedJobId, fetchJob]);

  const handleSelectJob = (job: Job) => {
    setSelectedJobId(job.id);
  };

  const handleCloseDetail = () => {
    setSelectedJobId(null);
    clearSelectedJob();
  };

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header onAddJob={() => setShowAddDialog(true)} />

      <Content
        style={{
          padding: 24,
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          overflow: 'auto',
        }}
      >
        <Space
          style={{
            width: '100%',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            Downloads
          </Title>
          <Badge status="success" text="Connected" />
        </Space>

        <JobList onSelectJob={handleSelectJob} />
      </Content>

      <AddJobDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
      />

      {selectedJob && (
        <JobDetail job={selectedJob} onClose={handleCloseDetail} />
      )}
    </Layout>
  );
}

export default App;
