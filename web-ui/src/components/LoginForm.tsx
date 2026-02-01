import { useState } from 'react';
import { Form, Input, Button, Alert, Card, Typography, Space } from 'antd';
import { CloudDownloadOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';
import * as api from '../services/api';

const { Title, Text } = Typography;

interface LoginFormValues {
  username: string;
  password: string;
}

export function LoginForm() {
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: LoginFormValues) => {
    setError(null);
    setLoading(true);

    try {
      const response = await api.login(values);
      login(response.token, response.user);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Failed to login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111827',
      }}
    >
      <div style={{ width: '100%', maxWidth: 400, padding: '0 16px' }}>
        <Space direction="vertical" align="center" style={{ width: '100%', marginBottom: 32 }}>
          <CloudDownloadOutlined style={{ fontSize: 64, color: '#6366f1' }} />
          <Title level={2} style={{ margin: 0 }}>
            Video Download Manager
          </Title>
          <Text type="secondary">Sign in to continue</Text>
        </Space>

        <Card>
          <Form layout="vertical" onFinish={handleSubmit} autoComplete="off">
            {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}

            <Form.Item
              label="Username"
              name="username"
              rules={[{ required: true, message: 'Please enter your username' }]}
            >
              <Input placeholder="Enter your username" autoFocus />
            </Form.Item>

            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: 'Please enter your password' }]}
            >
              <Input.Password placeholder="Enter your password" />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={loading} block>
                Sign In
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  );
}
