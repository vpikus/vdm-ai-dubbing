import { useState, useEffect } from 'react';
import { Layout, Typography, Badge, Menu, Flex } from 'antd';
import { UserOutlined, LogoutOutlined, PlusOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useAuthStore } from './store/authStore';
import { useJobStore } from './store/jobStore';
import { Header, LoginForm, JobList, JobDetail, AddJobDialog } from './components';
import type { Job } from './types';
import { socketClient } from './services/socket';

const { Content, Sider } = Layout;
const { Title } = Typography;

type MenuItem = Required<MenuProps>['items'][number];

function App() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const { fetchJob, selectedJob, clearSelectedJob } = useJobStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

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

  const siderMenuItems: MenuItem[] = [
    {
      key: 'add-download',
      icon: <PlusOutlined />,
      label: 'Add Download',
      onClick: () => setShowAddDialog(true),
    },
    { type: 'divider' },
    {
      key: 'username',
      icon: <UserOutlined />,
      label: user?.username,
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      onClick: logout,
      danger: true,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header collapsed={collapsed} onToggleCollapsed={() => setCollapsed(!collapsed)} />

      <Layout>
        <Content
          style={{
            padding: 24,
            maxWidth: 1200,
            width: '100%',
            margin: '0 auto',
            overflow: 'auto',
          }}
        >
          <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
            <Title level={4} style={{ margin: 0 }}>
              Downloads
            </Title>
            <Badge status="success" text="Connected" />
          </Flex>

          <JobList onSelectJob={handleSelectJob} />
        </Content>

        <Sider
          collapsed={collapsed}
          collapsedWidth={80}
          width={200}
          theme="dark"
          style={{ borderInlineStart: '1px solid #374151' }}
        >
          <Menu
            mode="inline"
            theme="dark"
            inlineCollapsed={collapsed}
            selectable={false}
            items={siderMenuItems}
          />
        </Sider>
      </Layout>

      <AddJobDialog isOpen={showAddDialog} onClose={() => setShowAddDialog(false)} />

      {selectedJob && <JobDetail job={selectedJob} onClose={handleCloseDetail} />}
    </Layout>
  );
}

export default App;
