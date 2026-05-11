import React from 'react';
import { Button } from 'antd';
import Editor from '@monaco-editor/react';

export type DataGridFocusedCellInfo<TRecord = any> = {
    record: TRecord;
    dataIndex: string;
    title: string;
};

export type DataGridPreviewPanelProps<TRecord = any> = {
    visible: boolean;
    darkMode: boolean;
    focusedCellInfo: DataGridFocusedCellInfo<TRecord> | null;
    columnMetaMap: Record<string, { type?: string }>;
    columnMetaMapByLowerName: Record<string, { type?: string }>;
    dataPanelIsJson: boolean;
    dataPanelValue: string;
    canModifyData: boolean;
    onFormatJson: () => void;
    onSave: () => void;
    onValueChange: (value: string) => void;
};

export const DataGridPreviewPanel = <TRecord,>(props: DataGridPreviewPanelProps<TRecord>) => {
    if (!props.visible) return null;

    return (
        <div style={{
            height: 200,
            borderTop: props.darkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
            display: 'flex',
            flexDirection: 'column',
            background: props.darkMode ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.6)',
            flexShrink: 0,
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 10px',
                fontSize: 12,
                borderBottom: props.darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
                flexShrink: 0,
            }}>
                <span style={{ color: props.darkMode ? '#aaa' : '#666', fontWeight: 500 }}>
                    {props.focusedCellInfo ? props.focusedCellInfo.dataIndex : '点击单元格查看数据'}
                </span>
                {props.focusedCellInfo && (() => {
                    const meta = props.columnMetaMap[props.focusedCellInfo.dataIndex] || props.columnMetaMapByLowerName[props.focusedCellInfo.dataIndex.toLowerCase()];
                    return meta?.type ? <span style={{ color: '#888', fontSize: 11 }}>({meta.type})</span> : null;
                })()}
                <div style={{ flex: 1 }} />
                {props.dataPanelIsJson && (
                    <Button size="small" onClick={props.onFormatJson}>格式化 JSON</Button>
                )}
                {props.canModifyData && props.focusedCellInfo && (
                    <Button size="small" type="primary" onClick={props.onSave}>保存</Button>
                )}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                {props.focusedCellInfo ? (
                    <Editor
                        height="100%"
                        language={props.dataPanelIsJson ? 'json' : 'plaintext'}
                        theme={props.darkMode ? 'transparent-dark' : 'transparent-light'}
                        value={props.dataPanelValue}
                        onChange={(val) => props.onValueChange(val || '')}
                        options={{
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            fontSize: 13,
                            tabSize: 2,
                            automaticLayout: true,
                            readOnly: !props.canModifyData,
                            lineNumbers: 'off',
                            glyphMargin: false,
                            folding: false,
                            lineDecorationsWidth: 4,
                            padding: { top: 6, bottom: 6 },
                        }}
                    />
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: 13 }}>
                        点击表格中的单元格以预览完整数据
                    </div>
                )}
            </div>
        </div>
    );
};
