import React, { useMemo, useState } from 'react';
import { Button, Modal } from 'antd';
import type { CSSProperties } from 'react';
import type { OverlayWorkbenchTheme } from '../utils/overlayWorkbenchTheme';

export type ToolsCenterItem = {
  key: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
};

type ToolsCenterModalProps = {
  open: boolean;
  onClose: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  overlayTheme: OverlayWorkbenchTheme;
  tools: ToolsCenterItem[];
};

const TOOLS_CENTER_MODAL_WIDTH = 720;
const TOOLS_CENTER_GRID_MIN_COLUMN_WIDTH = 260;

export default function ToolsCenterModal({
  open,
  onClose,
  icon,
  title,
  description,
  overlayTheme,
  tools,
}: ToolsCenterModalProps) {
  const [activeItemKey, setActiveItemKey] = useState<string | null>(null);

  const modalContentStyle = useMemo<CSSProperties>(() => ({
    background: overlayTheme.shellBg,
    border: overlayTheme.shellBorder,
    boxShadow: overlayTheme.shellShadow,
    backdropFilter: overlayTheme.shellBackdropFilter,
    WebkitBackdropFilter: overlayTheme.shellBackdropFilter,
  }), [overlayTheme]);

  const titleNode = useMemo(() => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          display: 'grid',
          placeItems: 'center',
          background: overlayTheme.iconBg,
          color: overlayTheme.iconColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: overlayTheme.titleText }}>{title}</div>
        <div style={{ marginTop: 4, color: overlayTheme.mutedText, fontSize: 12, lineHeight: 1.6 }}>{description}</div>
      </div>
    </div>
  ), [description, icon, overlayTheme, title]);

  const gridStyle = useMemo<CSSProperties>(() => ({
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(${TOOLS_CENTER_GRID_MIN_COLUMN_WIDTH}px, 1fr))`,
    gap: 12,
    padding: '12px 0 2px',
  }), []);

  const iconBoxStyle = useMemo<CSSProperties>(() => ({
    width: 34,
    height: 34,
    borderRadius: 12,
    display: 'grid',
    placeItems: 'center',
    background: overlayTheme.iconBg,
    color: overlayTheme.iconColor,
    flexShrink: 0,
    fontSize: 16,
  }), [overlayTheme]);

  const titleStyle = useMemo<CSSProperties>(() => ({
    color: overlayTheme.titleText,
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.25,
  }), [overlayTheme]);

  const descriptionStyle = useMemo<CSSProperties>(() => ({
    color: overlayTheme.mutedText,
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.45,
    marginTop: 6,
    whiteSpace: 'normal',
  }), [overlayTheme]);

  const buildCardStyle = (itemKey: string, itemIndex: number): CSSProperties => {
    const isActive = activeItemKey === itemKey;
    const isLastOddItem = tools.length % 2 === 1 && itemIndex === tools.length - 1;

    return {
      width: '100%',
      minHeight: 92,
      height: '100%',
      borderRadius: 16,
      border: isActive ? `1px solid ${overlayTheme.iconColor}` : overlayTheme.sectionBorder,
      background: isActive ? overlayTheme.hoverBg : overlayTheme.sectionBg,
      color: overlayTheme.titleText,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'flex-start',
      gap: 12,
      padding: 14,
      boxShadow: isActive
        ? (overlayTheme.isDark ? '0 12px 28px rgba(0,0,0,0.22)' : '0 12px 24px rgba(15,23,42,0.10)')
        : 'none',
      textAlign: 'left',
      whiteSpace: 'normal',
      transition: 'background 180ms ease, border-color 180ms ease, box-shadow 180ms ease',
      cursor: 'pointer',
      gridColumn: isLastOddItem ? '1 / -1' : undefined,
    };
  };

  return (
    <Modal
      title={titleNode}
      open={open}
      onCancel={onClose}
      footer={null}
      width={TOOLS_CENTER_MODAL_WIDTH}
      styles={{
        content: modalContentStyle,
        header: { background: 'transparent', borderBottom: 'none', paddingBottom: 8 },
        body: { paddingTop: 8 },
        footer: { background: 'transparent', borderTop: 'none', paddingTop: 10 },
      }}
    >
      <div style={gridStyle}>
        {tools.map((item, index) => (
          <Button
            key={item.key}
            type="text"
            style={buildCardStyle(item.key, index)}
            onClick={item.onClick}
            onMouseEnter={() => setActiveItemKey(item.key)}
            onMouseLeave={() => setActiveItemKey((current) => (current === item.key ? null : current))}
            onFocus={() => setActiveItemKey(item.key)}
            onBlur={() => setActiveItemKey((current) => (current === item.key ? null : current))}
          >
            <span style={iconBoxStyle}>{item.icon}</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
              <span style={titleStyle}>{item.title}</span>
              <span style={descriptionStyle}>{item.description}</span>
            </span>
          </Button>
        ))}
      </div>
    </Modal>
  );
}
