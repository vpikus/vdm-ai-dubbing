import { Layout, Button, Typography, Space } from 'antd';
import { PlusOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';

const { Text, Title } = Typography;

interface HeaderProps {
  onAddJob: () => void;
}

export function Header({ onAddJob }: HeaderProps) {
  const { user, logout } = useAuthStore();

  return (
    <Layout.Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: '1px solid #374151',
      }}
    >
      <Space>
        <CloudDownloadOutlined style={{ fontSize: 28, color: '#6366f1' }} />
        <Title level={4} style={{ margin: 0 }}>
          Video Download Manager
        </Title>
      </Space>

      <Space size="middle">
        <Button type="primary" icon={<PlusOutlined />} onClick={onAddJob}>
          Add Download
        </Button>

        {user && (
          <Space>
            <Text type="secondary">{user.username}</Text>
            <Button type="text" onClick={logout}>
              Logout
            </Button>
          </Space>
        )}
      </Space>
    </Layout.Header>
  );
}
