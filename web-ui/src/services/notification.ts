/**
 * Global Notification Service
 */

import { notification } from 'antd';

const darkStyle = {
  background: '#1f2937',
  color: 'rgba(255, 255, 255, 0.87)',
};

export function showError(message: string, description?: string): void {
  notification.error({
    message,
    description,
    placement: 'topRight',
    duration: 5,
    style: darkStyle,
  });
}

export function showSuccess(message: string, description?: string): void {
  notification.success({
    message,
    description,
    placement: 'topRight',
    duration: 3,
    style: darkStyle,
  });
}

export function showWarning(message: string, description?: string): void {
  notification.warning({
    message,
    description,
    placement: 'topRight',
    duration: 4,
    style: darkStyle,
  });
}
