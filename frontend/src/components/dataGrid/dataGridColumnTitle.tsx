import React from 'react';
import { Tooltip } from 'antd';
import type { ColumnMeta } from './dataGridMetadata';

export type RenderDataGridColumnTitleParams = {
    name: string;
    columnMetaMap: Record<string, ColumnMeta>;
    columnMetaMapByLowerName: Record<string, ColumnMeta>;
    showColumnType: boolean;
    showColumnComment: boolean;
    columnMetaHintColor: string;
    columnMetaTooltipColor: string;
    darkMode: boolean;
};

export const renderDataGridColumnTitle = ({
    name,
    columnMetaMap,
    columnMetaMapByLowerName,
    showColumnType,
    showColumnComment,
    columnMetaHintColor,
    columnMetaTooltipColor,
    darkMode,
}: RenderDataGridColumnTitleParams): React.ReactNode => {
    const normalizedName = String(name || '');
    const meta = columnMetaMap[normalizedName] || columnMetaMapByLowerName[normalizedName.toLowerCase()];
    const hoverLines: string[] = [];
    if (meta?.type) hoverLines.push(`类型：${meta.type}`);
    if (meta?.comment) hoverLines.push(`备注：${meta.comment}`);

    const titleNode = (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
            <span style={{ whiteSpace: 'nowrap' }}>{normalizedName}</span>
            {showColumnType && meta?.type && (
                <span
                    style={{
                        marginTop: 2,
                        fontSize: 11,
                        color: columnMetaHintColor,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                    }}
                >
                    {meta.type}
                </span>
            )}
            {showColumnComment && meta?.comment && (
                <span
                    style={{
                        marginTop: 2,
                        fontSize: 11,
                        color: columnMetaHintColor,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                    }}
                >
                    {meta.comment}
                </span>
            )}
        </div>
    );

    if (hoverLines.length === 0) return titleNode;
    return (
        <Tooltip
            title={<pre style={{ maxHeight: 260, overflow: 'auto', margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', color: darkMode ? columnMetaTooltipColor : '#fff' }}>{hoverLines.join('\n')}</pre>}
            styles={{ root: { maxWidth: 640 } }}
            {...(!darkMode ? { color: 'rgba(0, 0, 0, 0.82)' } : {})}
        >
            <span style={{ display: 'inline-flex', maxWidth: '100%' }}>{titleNode}</span>
        </Tooltip>
    );
};
