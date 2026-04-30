import React from 'react';
import { Checkbox, Input, Modal, Typography } from 'antd';

const { Text } = Typography;

type ConnectionPackagePasswordModalMode = 'import' | 'export';

export interface ConnectionPackagePasswordModalProps {
  open: boolean;
  title: string;
  mode?: ConnectionPackagePasswordModalMode;
  includeSecrets?: boolean;
  useFilePassword?: boolean;
  password: string;
  error?: string;
  confirmLoading?: boolean;
  confirmText?: string;
  cancelText?: string;
  exportPasswordsText?: string;
  useFilePasswordText?: string;
  exportPasswordPlaceholder?: string;
  importPasswordPlaceholder?: string;
  exportNoSecretsHelpText?: string;
  exportPasswordHelpText?: string;
  exportPasswordRecommendedHelpText?: string;
  onIncludeSecretsChange?: (value: boolean) => void;
  onUseFilePasswordChange?: (value: boolean) => void;
  onPasswordChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConnectionPackagePasswordModal({
  open,
  title,
  mode = 'import',
  includeSecrets = true,
  useFilePassword = false,
  password,
  error,
  confirmLoading,
  confirmText = '确认',
  cancelText = '取消',
  exportPasswordsText = '导出连接密码',
  useFilePasswordText = '设置文件保护密码',
  exportPasswordPlaceholder = '请输入文件保护密码（可选）',
  importPasswordPlaceholder = '请输入恢复包密码',
  exportNoSecretsHelpText = '将仅导出连接配置，不包含密码。',
  exportPasswordHelpText = '请通过单独渠道将密码告知接收方，不要和文件一起发送。',
  exportPasswordRecommendedHelpText = '密码已加密保护。如需通过公网传输，建议设置文件保护密码。',
  onIncludeSecretsChange,
  onUseFilePasswordChange,
  onPasswordChange,
  onConfirm,
  onCancel,
}: ConnectionPackagePasswordModalProps) {
  const isExportMode = mode === 'export';
  const showFilePasswordInput = isExportMode ? useFilePassword : true;
  const placeholder = isExportMode ? exportPasswordPlaceholder : importPasswordPlaceholder;
  const helperText = !includeSecrets
    ? exportNoSecretsHelpText
    : (useFilePassword
      ? exportPasswordHelpText
      : exportPasswordRecommendedHelpText);

  return (
    <Modal
      open={open}
      title={title}
      okText={confirmText}
      cancelText={cancelText}
      confirmLoading={confirmLoading}
      onOk={onConfirm}
      onCancel={onCancel}
      destroyOnClose={false}
      maskClosable={false}
    >
      {isExportMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Checkbox
            checked={includeSecrets}
            onChange={(event) => onIncludeSecretsChange?.(event.target.checked)}
          >
            {exportPasswordsText}
          </Checkbox>
          <Checkbox
            checked={useFilePassword}
            disabled={!includeSecrets}
            onChange={(event) => onUseFilePasswordChange?.(event.target.checked)}
          >
            {useFilePasswordText}
          </Checkbox>
        </div>
      ) : null}
      {showFilePasswordInput ? (
        <Input.Password
          autoFocus
          value={password}
          placeholder={placeholder}
          disabled={isExportMode && !useFilePassword}
          onChange={(event) => onPasswordChange(event.target.value)}
        />
      ) : null}
      {isExportMode ? (
        <Text type={useFilePassword ? 'warning' : 'secondary'} style={{ display: 'block', marginTop: 8 }}>
          {helperText}
        </Text>
      ) : null}
      {error ? (
        <Text type="danger" style={{ display: 'block', marginTop: 8 }}>
          {error}
        </Text>
      ) : null}
    </Modal>
  );
}
