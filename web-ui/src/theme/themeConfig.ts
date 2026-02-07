import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

const themeConfig: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#6366f1',
    colorBgContainer: '#1f2937',
    colorBgElevated: '#374151',
    colorBgLayout: '#111827',
    colorBorder: '#374151',
    colorText: 'rgba(255, 255, 255, 0.87)',
    colorTextSecondary: '#9ca3af',
    borderRadius: 8,
    fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
  },
  components: {
    Button: {
      primaryShadow: 'none',
    },
    Card: {
      colorBgContainer: '#1f2937',
    },
    Modal: {
      contentBg: '#1f2937',
      headerBg: '#1f2937',
    },
    Input: {
      colorBgContainer: '#374151',
      colorBorder: '#4b5563',
    },
    Select: {
      colorBgContainer: '#374151',
    },
    Layout: {
      headerBg: '#1f2937',
      bodyBg: '#111827',
      siderBg: '#1f2937',
    },
    Menu: {
      darkItemBg: '#1f2937',
      darkSubMenuItemBg: '#1f2937',
    },
    Notification: {
      colorBgElevated: '#1f2937',
      colorText: 'rgba(255, 255, 255, 0.87)',
      colorTextHeading: 'rgba(255, 255, 255, 0.95)',
      colorIcon: '#6366f1',
    },
  },
};

export default themeConfig;
