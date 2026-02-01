import { useMemo } from 'react';
import { Progress, Space, Typography } from 'antd';

const { Text } = Typography;

interface ProgressBarProps {
  percent: number;
  stage?: string;
  speed?: number;
  eta?: number;
  showLabel?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  // Round total seconds first to avoid "59m 60s" edge case
  const totalSecs = Math.round(seconds);
  if (totalSecs < 60) return `${totalSecs}s`;
  if (totalSecs < 3600) {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  return `${hours}h ${mins}m`;
}

const stageColors: Record<string, string> = {
  download: '#3b82f6',
  dub: '#a855f7',
  mux: '#22c55e',
  default: '#6366f1',
};

export function ProgressBar({
  percent,
  stage,
  speed,
  eta,
  showLabel = true,
}: ProgressBarProps) {
  const clampedPercent = useMemo(
    () => Math.min(100, Math.max(0, percent)),
    [percent]
  );

  const strokeColor = stageColors[stage || 'default'] || stageColors.default;

  return (
    <div style={{ width: '100%' }}>
      <Progress
        percent={clampedPercent}
        strokeColor={strokeColor}
        size="small"
        format={(p) => `${(p || 0).toFixed(1)}%`}
        status={clampedPercent === 100 ? 'success' : 'active'}
      />
      {(showLabel || speed !== undefined || eta !== undefined) && (
        <Space
          style={{
            width: '100%',
            justifyContent: 'space-between',
            marginTop: 4,
          }}
        >
          {showLabel && (
            <Text type="secondary" style={{ fontSize: 12, textTransform: 'capitalize' }}>
              {stage || 'Processing'}
            </Text>
          )}
          <Space size="middle">
            {speed !== undefined && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {formatBytes(speed)}/s
              </Text>
            )}
            {eta !== undefined && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                ETA: {formatDuration(eta)}
              </Text>
            )}
          </Space>
        </Space>
      )}
    </div>
  );
}
