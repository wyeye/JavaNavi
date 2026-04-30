import { Modal, Spin } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';

import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';
import {
  SECURITY_UPDATE_MODAL_CLASS,
  getSecurityUpdateShellSurfaceStyle,
} from '../utils/securityUpdateVisuals';
import { DEFAULT_LANGUAGE, translate, type AppLanguage } from '../i18n';

interface SecurityUpdateProgressModalProps {
  open: boolean;
  stageText: string;
  detailText?: string;
  overlayTheme: OverlayWorkbenchTheme;
  language?: AppLanguage;
  surfaceOpacity?: number;
}

const SecurityUpdateProgressModal = ({
  open,
  stageText,
  detailText,
  overlayTheme,
  language = DEFAULT_LANGUAGE,
  surfaceOpacity = 1,
}: SecurityUpdateProgressModalProps) => {
  return (
    <Modal
      rootClassName={SECURITY_UPDATE_MODAL_CLASS}
      open={open}
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      width={420}
      centered
      styles={{
        content: getSecurityUpdateShellSurfaceStyle(overlayTheme, surfaceOpacity),
        header: { display: 'none' },
        body: { padding: 28 },
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 18,
            display: 'grid',
            placeItems: 'center',
            background: overlayTheme.iconBg,
            color: overlayTheme.iconColor,
            fontSize: 22,
          }}
        >
          <SafetyCertificateOutlined />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: overlayTheme.titleText }}>
          {stageText}
        </div>
        <div style={{ fontSize: 13, color: overlayTheme.mutedText, lineHeight: 1.7 }}>
          {detailText ?? translate(language, 'security.updatePendingDetail')}
        </div>
        <Spin size="large" />
      </div>
    </Modal>
  );
};

export type { SecurityUpdateProgressModalProps };
export default SecurityUpdateProgressModal;
