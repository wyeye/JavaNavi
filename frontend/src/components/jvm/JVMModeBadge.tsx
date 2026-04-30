import React from 'react';
import { Tooltip } from 'antd';

import { resolveJVMModeMeta } from '../../utils/jvmRuntimePresentation';

type JVMModeBadgeProps = {
  mode: string;
  label?: string;
  reason?: string;
};

const JVMModeBadge: React.FC<JVMModeBadgeProps> = ({
  mode,
  label,
  reason,
}) => {
  const meta = resolveJVMModeMeta(mode);
  const displayLabel = String(label || meta.label || 'Unknown').trim() || 'Unknown';
  const content = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 20,
          padding: '0 8px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          color: meta.color,
          background: meta.backgroundColor,
          flexShrink: 0,
        }}
      >
        {displayLabel}
      </span>
      {reason ? (
        <span
          style={{
            fontSize: 12,
            color: '#cf1322',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {reason}
        </span>
      ) : null}
    </span>
  );

  if (!reason) {
    return content;
  }

  return <Tooltip title={reason}>{content}</Tooltip>;
};

export default JVMModeBadge;
