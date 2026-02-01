/**
 * Global Notification Service
 */

import { notification } from 'antd';

export function showError(message: string, description?: string): void {
  notification.error({
    message,
    description,
    placement: 'topRight',
    duration: 5,
  });
}

export function showSuccess(message: string, description?: string): void {
  notification.success({
    message,
    description,
    placement: 'topRight',
    duration: 3,
  });
}

export function showWarning(message: string, description?: string): void {
  notification.warning({
    message,
    description,
    placement: 'topRight',
    duration: 4,
  });
}
