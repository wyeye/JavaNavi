import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Tabs, Dropdown } from 'antd';
import type { MenuProps, TabsProps } from 'antd';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { useStore } from '../store';
import { translate, type I18nKey } from '../i18n';
import type { TabData } from '../types';
import { buildTabDisplayTitle } from '../utils/tabDisplay';
import { resolveConnectionAccentColor } from '../utils/connectionVisual';
import { buildTableHoverTitle } from '../utils/tableHoverTitle';

const DataViewer = lazy(() => import('./DataViewer'));
const QueryEditor = lazy(() => import('./QueryEditor'));
const TableDesigner = lazy(() => import('./TableDesigner'));
const RedisViewer = lazy(() => import('./RedisViewer'));
const RedisCommandEditor = lazy(() => import('./RedisCommandEditor'));
const RedisMonitor = lazy(() => import('./RedisMonitor'));
const TriggerViewer = lazy(() => import('./TriggerViewer'));
const DefinitionViewer = lazy(() => import('./DefinitionViewer'));
const TableOverview = lazy(() => import('./TableOverview'));

const TabWorkspaceFallback: React.FC<{ language: import('../i18n').AppLanguage }> = ({ language }) => (
  <div
    style={{
      alignItems: 'center',
      color: 'rgba(120, 120, 120, 0.86)',
      display: 'flex',
      height: '100%',
      justifyContent: 'center',
      minHeight: 240,
    }}
  >
    {translate(language, 'generic.fallback.loadingWorkspace')}
  </div>
);

type SortableTabLabelProps = {
  displayTitle: string;
  hoverTitle: string;
  menuItems: MenuProps['items'];
  accentColor?: string;
};

const SortableTabLabel: React.FC<SortableTabLabelProps> = ({
  displayTitle,
  hoverTitle,
  menuItems,
  accentColor,
}) => {
  const labelStyle = accentColor
    ? ({ '--connection-accent': accentColor } as React.CSSProperties)
    : undefined;

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['contextMenu']}>
      <span
        className={`tab-dnd-label${accentColor ? ' has-connection-accent' : ''}`}
        onContextMenu={(e) => e.preventDefault()}
        title={hoverTitle}
        style={labelStyle}
      >
        {accentColor ? <span className="tab-connection-accent" aria-hidden="true" /> : null}
        <span className="tab-title-text">{displayTitle}</span>
      </span>
    </Dropdown>
  );
};


type InsertSqlEventDetail = {
  sql?: string;
  runImmediately?: boolean;
  connectionId?: string;
  dbName?: string;
};

type DraggableTabNodeProps = {
  node: React.ReactElement;
};

const DraggableTabNode: React.FC<DraggableTabNodeProps> = ({ node }) => {
  const tabId = String(node.key || '').trim();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tabId });
  const style: React.CSSProperties = {
    ...(node.props.style || {}),
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
    opacity: isDragging ? 0.88 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
    zIndex: isDragging ? 2 : node.props.style?.zIndex,
  };

  return React.cloneElement(node, {
    ref: setNodeRef,
    style,
    ...attributes,
    ...listeners,
    className: `${node.props.className || ''} tab-dnd-node${isDragging ? ' is-dragging' : ''}`,
  });
};

const shouldShowConnectionAccent = (tab: TabData): boolean => tab.type !== 'table' && tab.type !== 'table-overview';

const buildTabHoverTitle = (
  tab: TabData,
  displayTitle: string,
  t: (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => string,
): string => {
  if (tab.type !== 'table' && tab.type !== 'design') {
    return displayTitle;
  }
  return buildTableHoverTitle({
    tableName: displayTitle,
    comment: tab.tableComment,
    tableNameLabel: t('table.hover.name'),
    commentLabel: t('table.hover.comment'),
  });
};

const TabManager: React.FC = () => {
  const tabs = useStore(state => state.tabs);
  const connections = useStore(state => state.connections);
  const theme = useStore(state => state.theme);
  const language = useStore(state => state.language);
  const t = React.useCallback((key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => translate(language, key, params), [language]);
  const activeTabId = useStore(state => state.activeTabId);
  const setActiveTab = useStore(state => state.setActiveTab);
  const addTab = useStore(state => state.addTab);
  const closeTab = useStore(state => state.closeTab);
  const closeOtherTabs = useStore(state => state.closeOtherTabs);
  const closeTabsToLeft = useStore(state => state.closeTabsToLeft);
  const closeTabsToRight = useStore(state => state.closeTabsToRight);
  const closeAllTabs = useStore(state => state.closeAllTabs);
  const moveTab = useStore(state => state.moveTab);
  const tabsNavBorderColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.08)';
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const onChange = (newActiveKey: string) => {
    setActiveTab(newActiveKey);
  };

  const onEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove') {
      closeTab(targetKey as string);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const sourceId = String(event.active.id || '').trim();
    setDraggingTabId(sourceId || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const sourceId = String(event.active.id || '').trim();
    const targetId = String(event.over?.id || '').trim();
    setDraggingTabId(null);
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }
    suppressClickUntilRef.current = Date.now() + 120;
    moveTab(sourceId, targetId);
  };

  const handleDragCancel = () => {
    setDraggingTabId(null);
  };

  const activeTab = useMemo(() => tabs.find(tab => tab.id === activeTabId), [activeTabId, tabs]);

  useEffect(() => {
    window.__JAVANAVI_ALLOW_F5__ = activeTab?.type === 'table' || activeTab?.type === 'design' || activeTab?.type === 'table-overview';
    return () => {
      window.__JAVANAVI_ALLOW_F5__ = false;
    };
  }, [activeTab]);

  useEffect(() => {
    const handleWorkspaceF5 = (event: KeyboardEvent) => {
      if ((event.key !== 'F5' && event.code !== 'F5') || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }
      if (activeTab?.type === 'table') {
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent('javanavi:refresh-active-table'));
        return;
      }
      if (activeTab?.type === 'design') {
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent('javanavi:refresh-active-design'));
        return;
      }
      if (activeTab?.type === 'table-overview') {
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent('javanavi:refresh-active-table-overview'));
      }
    };

    window.addEventListener('keydown', handleWorkspaceF5, true);
    return () => {
      window.removeEventListener('keydown', handleWorkspaceF5, true);
    };
  }, [activeTab]);

  React.useEffect(() => {
    const handleGlobalInsertSql = (e: CustomEvent<InsertSqlEventDetail>) => {
      const { sql, runImmediately, connectionId: eventConnId, dbName: eventDbName } = e.detail;
      if (!sql) return;

      const activeTab = tabs.find(t => t.id === activeTabId);
      
      // 🔧 runImmediately（点击"执行"）始终新建独立 tab，避免追加到已有 tab 导致 SQL 重复
      if (runImmediately) {
        const newTabId = 'tab-' + Date.now();
        const resolvedConnId = eventConnId || activeTab?.connectionId || (connections.length > 0 ? connections[0].id : '');
        const resolvedDbName = eventConnId ? (eventDbName || '') : (activeTab?.dbName || '');
        addTab({
            id: newTabId,
            type: 'query',
            title: t('generic.fallback.newQuery'),
            query: sql,
            connectionId: resolvedConnId,
            dbName: resolvedDbName
        });
        setActiveTab(newTabId);
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('javanavi:insert-sql-to-tab', {
                detail: { tabId: newTabId, sql, runImmediately: true, connectionId: resolvedConnId, dbName: resolvedDbName }
            }));
        }, 300);
        return;
      }
      
      // 插入模式：追加到已有 tab 或新建 tab
      if (activeTab && activeTab.type === 'query') {
        window.dispatchEvent(new CustomEvent('javanavi:insert-sql-to-tab', {
          detail: { tabId: activeTab.id, sql, runImmediately: false, connectionId: eventConnId, dbName: eventDbName }
        }));
      } else {
        const newTabId = 'tab-' + Date.now();
        const resolvedConnId = eventConnId || activeTab?.connectionId || (connections.length > 0 ? connections[0].id : '');
        const resolvedDbName = eventConnId ? (eventDbName || '') : (activeTab?.dbName || '');
        addTab({
            id: newTabId,
            type: 'query',
            title: t('generic.fallback.newQuery'),
            query: sql,
            connectionId: resolvedConnId,
            dbName: resolvedDbName
        });
        setActiveTab(newTabId);
      }
    };
    window.addEventListener('javanavi:insert-sql', handleGlobalInsertSql as EventListener);
    return () => window.removeEventListener('javanavi:insert-sql', handleGlobalInsertSql as EventListener);
  }, [tabs, activeTabId, addTab, setActiveTab, connections, t]);

  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);

  const renderTabBar: TabsProps['renderTabBar'] = (tabBarProps, DefaultTabBar) => (
    <DefaultTabBar {...tabBarProps}>
      {(node) => <DraggableTabNode key={node.key} node={node} />}
    </DefaultTabBar>
  );

  const items = useMemo(() => tabs.map((tab, index) => {
    const connection = connections.find((conn) => conn.id === tab.connectionId);
    const displayTitle = buildTabDisplayTitle(tab, connection, language);
    const hoverTitle = buildTabHoverTitle(tab, displayTitle, t);
    const accentColor = connection && shouldShowConnectionAccent(tab) ? resolveConnectionAccentColor(connection) : undefined;
    const tabIsActive = tab.id === activeTabId;
    let content: React.ReactNode = null;
    if (tab.type === 'query') {
      content = <QueryEditor tab={tab} isActive={tabIsActive} />;
    } else if (tab.type === 'table') {
      content = <DataViewer tab={tab} isActive={tabIsActive} />;
    } else if (tab.type === 'design') {
      content = <TableDesigner tab={tab} />;
    } else if (tab.type === 'redis-keys') {
      content = <RedisViewer connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
    } else if (tab.type === 'redis-command') {
      content = <RedisCommandEditor connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
    } else if (tab.type === 'redis-monitor') {
      content = <RedisMonitor connectionId={tab.connectionId} redisDB={tab.redisDB ?? 0} />;
    } else if (tab.type === 'trigger') {
      content = <TriggerViewer tab={tab} />;
    } else if (tab.type === 'view-def' || tab.type === 'routine-def') {
      content = <DefinitionViewer tab={tab} />;
    } else if (tab.type === 'table-overview') {
      content = <TableOverview tab={tab} />;
    }

    const menuItems: MenuProps['items'] = [
      {
        key: 'close-other',
        label: t('tab.menu.closeOther'),
        disabled: tabs.length <= 1,
        onClick: () => closeOtherTabs(tab.id),
      },
      {
        key: 'close-left',
        label: t('tab.menu.closeLeft'),
        disabled: index === 0,
        onClick: () => closeTabsToLeft(tab.id),
      },
      {
        key: 'close-right',
        label: t('tab.menu.closeRight'),
        disabled: index === tabs.length - 1,
        onClick: () => closeTabsToRight(tab.id),
      },
      { type: 'divider' },
      {
        key: 'close-all',
        label: t('tab.menu.closeAll'),
        disabled: tabs.length === 0,
        onClick: () => closeAllTabs(),
      },
    ];
    
    return {
      label: (
        <SortableTabLabel
          displayTitle={displayTitle}
          hoverTitle={hoverTitle}
          menuItems={menuItems}
          accentColor={accentColor}
        />
      ),
      key: tab.id,
      children: (
        <Suspense fallback={<TabWorkspaceFallback language={language} />}>
          {content}
        </Suspense>
      ),
    };
  }), [tabs, connections, activeTabId, closeOtherTabs, closeTabsToLeft, closeTabsToRight, closeAllTabs, language, t]);

  return (
    <>
        <style>{`
            .main-tabs {
              height: 100%;
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }
            .main-tabs .ant-tabs-nav {
              flex: 0 0 auto;
            }
            .main-tabs .ant-tabs-content-holder {
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            .main-tabs .ant-tabs-content {
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
              display: flex;
              flex-direction: column;
            }
            .main-tabs .ant-tabs-tabpane {
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }
            .main-tabs .ant-tabs-tabpane > div {
              flex: 1 1 auto;
              min-height: 0;
              min-width: 0;
            }
            .main-tabs .ant-tabs-tabpane-hidden {
              display: none !important;
            }
            .main-tabs .ant-tabs-nav::before {
                border-bottom: 1px solid ${tabsNavBorderColor} !important;
            }
            .main-tabs .ant-tabs-tab {
              transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background-color 120ms ease;
            }
            .main-tabs .tab-dnd-label {
              user-select: none;
              -webkit-user-select: none;
              display: inline-flex;
              align-items: center;
              gap: 7px;
              max-width: 100%;
            }
            .main-tabs .tab-dnd-label.has-connection-accent {
              position: relative;
            }
            .main-tabs .tab-connection-accent {
              width: 9px;
              height: 9px;
              border-radius: 999px;
              background: var(--connection-accent);
              box-shadow: 0 0 0 2px color-mix(in srgb, var(--connection-accent) 22%, transparent);
              flex: 0 0 auto;
            }
            .main-tabs .tab-title-text {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .main-tabs .tab-dnd-node.is-dragging,
            .main-tabs .tab-dnd-node.is-dragging .tab-dnd-label {
              cursor: grabbing !important;
            }
            body[data-theme='dark'] .main-tabs .ant-tabs-tab-btn:focus-visible {
              outline: none !important;
              border-radius: 6px;
              box-shadow: 0 0 0 2px rgba(255, 214, 102, 0.72);
              background: rgba(255, 214, 102, 0.16);
            }
            body[data-theme='light'] .main-tabs .ant-tabs-tab-btn:focus-visible {
              outline: none !important;
              border-radius: 6px;
              box-shadow: 0 0 0 2px rgba(9, 109, 217, 0.32);
              background: rgba(9, 109, 217, 0.08);
            }
            body[data-theme='light'] .main-tabs .ant-tabs-tab.ant-tabs-tab-active {
              background: rgba(24, 144, 255, 0.10) !important;
              border-color: rgba(24, 144, 255, 0.28) !important;
            }
            body[data-theme='dark'] .main-tabs .ant-tabs-tab.ant-tabs-tab-active {
              background: rgba(255, 214, 102, 0.12) !important;
              border-color: rgba(255, 214, 102, 0.4) !important;
            }
        `}</style>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <Tabs
                className="main-tabs"
                type="editable-card"
                destroyInactiveTabPane={false}
                onChange={(newActiveKey) => {
                  if (Date.now() < suppressClickUntilRef.current) return;
                  onChange(newActiveKey);
                }}
                activeKey={activeTabId || undefined}
                onEdit={onEdit}
                items={items}
                hideAdd
                renderTabBar={renderTabBar}
            />
          </SortableContext>
        </DndContext>
    </>
  );
};

export default TabManager;
