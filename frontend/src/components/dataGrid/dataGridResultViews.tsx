import React from 'react';
import { Button } from 'antd';
import Editor from '@monaco-editor/react';

export type DataGridJsonViewProps = {
    darkMode: boolean;
    rowCount: number;
    canModifyData: boolean;
    jsonViewText: string;
    onEditJson: () => void;
};

export type DataGridTextViewProps = {
    darkMode: boolean;
    canModifyData: boolean;
    displayColumnNames: string[];
    textViewRows: Record<string, any>[];
    textRecordIndex: number;
    currentTextRow: Record<string, any> | null;
    formatTextViewValue: (value: any) => string;
    onTextRecordIndexChange: React.Dispatch<React.SetStateAction<number>>;
    onEditCurrentRecord: () => void;
};

export const DataGridJsonView: React.FC<DataGridJsonViewProps> = (props) => (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 10px', borderBottom: props.darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: props.darkMode ? '#999' : '#666' }}>
                {props.rowCount === 0 ? '当前结果集无数据' : `当前结果集 ${props.rowCount} 条记录`}
            </span>
            {props.canModifyData && (
                <Button size="small" type="primary" onClick={props.onEditJson} disabled={props.rowCount === 0}>
                    编辑 JSON
                </Button>
            )}
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: '8px 10px 10px 10px' }}>
            <Editor
                height="100%"
                defaultLanguage="json"
                language="json"
                theme={props.darkMode ? 'transparent-dark' : 'transparent-light'}
                value={props.jsonViewText}
                options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'off',
                    fontSize: 12,
                    tabSize: 2,
                    automaticLayout: true,
                }}
            />
        </div>
    </div>
);

export const DataGridTextView: React.FC<DataGridTextViewProps> = (props) => (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 12px', borderBottom: props.darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button size="small" onClick={() => props.onTextRecordIndexChange((i) => Math.max(0, i - 1))} disabled={props.textViewRows.length === 0 || props.textRecordIndex <= 0}>
                上一条
            </Button>
            <Button size="small" onClick={() => props.onTextRecordIndexChange((i) => Math.min(props.textViewRows.length - 1, i + 1))} disabled={props.textViewRows.length === 0 || props.textRecordIndex >= props.textViewRows.length - 1}>
                下一条
            </Button>
            <span style={{ fontSize: 12, color: props.darkMode ? '#999' : '#666' }}>
                {props.textViewRows.length === 0 ? '当前结果集无数据' : `记录 ${props.textRecordIndex + 1} / ${props.textViewRows.length}`}
            </span>
            {props.canModifyData && (
                <Button size="small" type="primary" onClick={props.onEditCurrentRecord} disabled={props.textViewRows.length === 0}>
                    编辑当前记录
                </Button>
            )}
        </div>
        <div className="custom-scrollbar" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 12px' }}>
            {props.currentTextRow ? props.displayColumnNames.map((col) => (
                <div key={col} style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 10, padding: '6px 0', borderBottom: props.darkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)', alignItems: 'start' }}>
                    <div style={{ fontWeight: 600, color: props.darkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.88)', wordBreak: 'break-all' }}>
                        {col} :
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: props.darkMode ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.88)' }}>
                        {props.formatTextViewValue((props.currentTextRow as any)[col])}
                    </div>
                </div>
            )) : (
                <div style={{ fontSize: 12, color: props.darkMode ? '#999' : '#666', paddingTop: 4 }}>
                    当前结果集无数据
                </div>
            )}
        </div>
    </div>
);
