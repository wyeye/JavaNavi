import { Button, Modal } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import type { CSSProperties } from 'react';

import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import {
  SECURITY_UPDATE_ACTION_BUTTON_CLASS,
  SECURITY_UPDATE_MODAL_CLASS,
  getSecurityUpdateActionButtonStyle,
  getSecurityUpdateShellSurfaceStyle,
} from '../utils/securityUpdateVisuals';
import { DEFAULT_LANGUAGE, translate, type AppLanguage } from '../i18n';

interface SecurityUpdateIntroModalProps {
  open: boolean;
  loading?: boolean;
  darkMode: boolean;
  overlayTheme: OverlayWorkbenchTheme;
  language?: AppLanguage;
  surfaceOpacity?: number;
  onStart: () => void;
  onPostpone: () => void;
  onViewDetails: () => void;
}

const actionButtonStyle: CSSProperties = {
  ...getSecurityUpdateActionButtonStyle(),
  height: 38,
  paddingInline: 18,
};

const SecurityUpdateIntroModal = ({
  open,
  loading = false,
  darkMode,
  overlayTheme,
  language = DEFAULT_LANGUAGE,
  surfaceOpacity = 1,
  onStart,
  onPostpone,
  onViewDetails,
}: SecurityUpdateIntroModalProps) => {
  return (
    <Modal
      rootClassName={SECURITY_UPDATE_MODAL_CLASS}
      title={(
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              display: 'grid',
              placeItems: 'center',
              background: overlayTheme.iconBg,
              color: overlayTheme.iconColor,
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            <SafetyCertificateOutlined />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: overlayTheme.titleText }}>
              {translate(language, 'security.savedConfigUpdateTitle')}
            </div>
            <div style={{ marginTop: 3, color: overlayTheme.mutedText, fontSize: 12 }}>
              {translate(language, 'security.savedConfigUpdateSubtitle')}
            </div>
          </div>
        </div>
      )}
      open={open}
      closable={!loading}
      maskClosable={!loading}
      keyboard={!loading}
      onCancel={onPostpone}
      width={560}
      styles={{
        content: getSecurityUpdateShellSurfaceStyle(overlayTheme, surfaceOpacity),
        header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
        body: { paddingTop: 8 },
        footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 },
      }}
      footer={[
        <Button
          key="details"
          className={SECURITY_UPDATE_ACTION_BUTTON_CLASS}
          type="primary"
          ghost
          style={actionButtonStyle}
          onClick={onViewDetails}
          disabled={loading}
        >
          {translate(language, 'security.manageTitle')}
        </Button>,
        <Button
          key="later"
          className={SECURITY_UPDATE_ACTION_BUTTON_CLASS}
          type="primary"
          ghost
          style={actionButtonStyle}
          onClick={onPostpone}
          disabled={loading}
        >
          {translate(language, 'security.remindLater')}
        </Button>,
        <Button
          key="start"
          className={SECURITY_UPDATE_ACTION_BUTTON_CLASS}
          type="primary"
          style={actionButtonStyle}
          loading={loading}
          onClick={onStart}
        >
          {translate(language, 'security.updateNow')}
        </Button>,
      ]}
    >
      <div
        style={{
          padding: '12px 0 6px',
          color: darkMode ? 'rgba(255,255,255,0.82)' : '#2f3b52',
          lineHeight: 1.8,
          fontSize: 14,
        }}
      >
        {translate(language, 'security.savedConfigUpdateBody')}
      </div>
    </Modal>
  );
};

export type { SecurityUpdateIntroModalProps };
export default SecurityUpdateIntroModal;
