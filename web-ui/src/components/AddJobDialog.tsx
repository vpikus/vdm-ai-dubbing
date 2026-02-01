import { useState } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Checkbox,
  Collapse,
  Alert,
  Row,
  Col,
  Divider,
  Typography,
} from 'antd';
import { useJobStore } from '../store/jobStore';
import type { FormatPreset, OutputContainer } from '../types';

const { Text } = Typography;

interface AddJobDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormValues {
  url: string;
  formatPreset: FormatPreset;
  outputContainer: OutputContainer;
  downloadSubtitles: boolean;
  requestedDubbing: boolean;
  targetLang: string;
  useLivelyVoice: boolean;
  cookies: string;
}

const formatOptions = [
  { value: 'bestvideo+bestaudio', label: 'Best Quality' },
  { value: 'best', label: 'Best (Single File)' },
  { value: 'bestaudio', label: 'Audio Only' },
  { value: 'worst', label: 'Lowest Quality' },
];

const containerOptions = [
  { value: 'mp4', label: 'MP4' },
  { value: 'mkv', label: 'MKV' },
  { value: 'webm', label: 'WebM' },
];

// VOT.js (Yandex Voice-Over Translation) only supports these languages
const languageOptions = [
  { value: 'ru', label: 'Russian' },
  { value: 'en', label: 'English' },
  { value: 'kk', label: 'Kazakh' },
];

export function AddJobDialog({ isOpen, onClose }: AddJobDialogProps) {
  const { createJob, loading } = useJobStore();
  const [form] = Form.useForm<FormValues>();
  const [error, setError] = useState<string | null>(null);

  const requestedDubbing = Form.useWatch('requestedDubbing', form);

  const handleSubmit = async (values: FormValues) => {
    setError(null);

    try {
      await createJob(values.url.trim(), {
        requestedDubbing: values.requestedDubbing || false,
        targetLang: values.requestedDubbing ? values.targetLang : 'en',
        useLivelyVoice: values.requestedDubbing ? values.useLivelyVoice : false,
        formatPreset: values.formatPreset,
        outputContainer: values.outputContainer,
        downloadSubtitles: values.downloadSubtitles || false,
        cookies: values.cookies?.trim() || undefined,
      });
      form.resetFields();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setError(null);
    onClose();
  };

  return (
    <Modal
      title="Add Download"
      open={isOpen}
      onOk={() => form.submit()}
      onCancel={handleCancel}
      okText={loading ? 'Adding...' : 'Add Download'}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          formatPreset: 'bestvideo+bestaudio',
          outputContainer: 'mp4',
          targetLang: 'ru',
          downloadSubtitles: false,
          requestedDubbing: false,
          useLivelyVoice: false,
        }}
      >
        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item
          label="Video URL"
          name="url"
          rules={[
            { required: true, message: 'Please enter a URL' },
            { type: 'url', message: 'Please enter a valid URL' },
          ]}
        >
          <Input placeholder="https://youtube.com/watch?v=..." autoFocus />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Format" name="formatPreset">
              <Select options={formatOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Container" name="outputContainer">
              <Select options={containerOptions} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="downloadSubtitles" valuePropName="checked">
          <Checkbox>Download subtitles</Checkbox>
        </Form.Item>

        <Divider />

        <Form.Item name="requestedDubbing" valuePropName="checked">
          <Checkbox>Enable AI Dubbing</Checkbox>
        </Form.Item>

        {requestedDubbing && (
          <>
            <Form.Item label="Target Language" name="targetLang">
              <Select options={languageOptions} />
            </Form.Item>

            <Form.Item name="useLivelyVoice" valuePropName="checked">
              <Checkbox>
                Use Lively Voice{' '}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  (More natural AI voice)
                </Text>
              </Checkbox>
            </Form.Item>
          </>
        )}

        <Collapse
          ghost
          items={[
            {
              key: 'advanced',
              label: 'Advanced Options',
              children: (
                <Form.Item
                  label="Cookies (Netscape format)"
                  name="cookies"
                  extra="Optional. Paste cookies for authenticated downloads (e.g., age-restricted videos). Use browser extensions like 'Get cookies.txt' to export."
                >
                  <Input.TextArea
                    rows={4}
                    placeholder={"# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tFALSE\t0\tcookie_name\tcookie_value"}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </Form.Item>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}
