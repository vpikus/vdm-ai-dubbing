import { Layout, Button, Typography, Flex } from 'antd';
import { CloudDownloadOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';

const { Title } = Typography;

interface HeaderProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Header({ collapsed, onToggleCollapsed }: HeaderProps) {
  return (
    <Layout.Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '0 24px',
        borderBottom: '1px solid #374151',
      }}
    >
      <Flex align="center" justify="space-between" style={{ height: '100%' }}>
        <Flex align="center" gap="small">
          <CloudDownloadOutlined style={{ fontSize: 28, color: '#6366f1' }} />
          <Title level={4} style={{ margin: 0 }}>
            Video Download Manager
          </Title>
        </Flex>

        <Button
          type="default"
          onClick={onToggleCollapsed}
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        />
      </Flex>
    </Layout.Header>
  );
}
