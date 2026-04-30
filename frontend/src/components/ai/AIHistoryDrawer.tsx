import React, { useState } from 'react';
import { Drawer, Button, Tooltip, Input } from 'antd';
import { MenuFoldOutlined, PlusOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useStore } from '../../store';

interface AIHistoryDrawerProps {
    open: boolean;
    onClose: () => void;
    bgColor?: string;
    darkMode: boolean;
    textColor: string;
    mutedColor: string;
    borderColor: string;
    onCreateNew: () => void;
    sessionId: string;
}

export const AIHistoryDrawer: React.FC<AIHistoryDrawerProps> = ({
    open, onClose, bgColor, darkMode, textColor, mutedColor, borderColor, onCreateNew, sessionId
}) => {
    const aiChatSessions = useStore(state => state.aiChatSessions);
    const setAIActiveSessionId = useStore(state => state.setAIActiveSessionId);
    const deleteAISession = useStore(state => state.deleteAISession);
    
    // 阶段4: 历史记录搜索
    const [searchText, setSearchText] = useState('');

    const filteredSessions = aiChatSessions.filter(s => 
        !searchText || (s.title && s.title.toLowerCase().includes(searchText.toLowerCase()))
    );

    return (
        <Drawer
            placement="left"
            closable={false}
            onClose={onClose}
            open={open}
            getContainer={false}
            style={{ position: 'absolute', background: bgColor || (darkMode ? '#1e1e1e' : '#f8f9fa') }}
            width={260}
            bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column' }}
        >
            {/* 侧拉面板头部 */}
            <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: textColor }}>对话历史</span>
                <Tooltip title="收起">
                    <Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={onClose} style={{ color: mutedColor }} />
                </Tooltip>
            </div>

            {/* 新建对话按钮 */}
            <div style={{ padding: '0 12px 12px' }}>
                <Button 
                    type="dashed" 
                    block 
                    icon={<PlusOutlined />} 
                    onClick={() => { onCreateNew(); onClose(); }}
                    style={{ borderColor: borderColor, color: textColor, background: 'transparent' }}
                >
                    开启新对话
                </Button>
            </div>

            {/* 列表搜索 */}
            <div style={{ padding: '0 12px 12px' }}>
                <Input 
                    placeholder="搜索历史记录..." 
                    prefix={<SearchOutlined style={{ color: mutedColor }} />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    variant="filled"
                    size="small"
                    style={{ background: darkMode ? 'rgba(255,255,255,0.04)' : 'transparent', color: textColor }}
                />
            </div>

            {/* 列表容器 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 16px' }} className="ai-history-list">
                {filteredSessions.length === 0 ? (
                    <div style={{ padding: '30px 0', textAlign: 'center', color: mutedColor, fontSize: 12 }}>暂无匹配的对话记录</div>
                ) : (
                    filteredSessions.map(session => (
                        <div 
                            key={session.id}
                            className={`ai-history-item ${sessionId === session.id ? 'active' : ''}`}
                            onClick={() => { setAIActiveSessionId(session.id); onClose(); }}
                            style={{
                                padding: '10px 12px',
                                borderRadius: 6,
                                marginBottom: 4,
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: sessionId === session.id ? (darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent',
                                transition: 'background 0.2s',
                            }}
                        >
                            <div style={{ overflow: 'hidden', flex: 1, paddingRight: 8 }}>
                                <div style={{ fontSize: 13, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: sessionId === session.id ? 600 : 'normal' }}>
                                    {session.title || '新对话'}
                                </div>
                                <div style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}>
                                    {new Date(session.updatedAt).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                            <Tooltip title="删除">
                                <Button 
                                    className="ai-history-delete-btn"
                                    type="text" 
                                    size="small" 
                                    danger 
                                    icon={<DeleteOutlined />} 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteAISession(session.id);
                                    }}
                                    style={{ display: sessionId === session.id ? 'inline-flex' : undefined }}
                                />
                            </Tooltip>
                        </div>
                    ))
                )}
            </div>
        </Drawer>
    );
};
