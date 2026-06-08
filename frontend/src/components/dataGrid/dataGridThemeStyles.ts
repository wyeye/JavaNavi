type BuildDataGridThemeStylesParams = {
    darkMode: boolean;
    opacity: number;
    blur: number;
};

type BuildDataGridCssTextParams = {
    gridId: string;
    darkMode: boolean;
    opacity: number;
    panelRadius: number;
    tableBodyBottomPadding: number;
    dataTableVerticalBorderColor: string;
    floatingScrollbarHeight: number;
    floatingScrollbarInset: number;
    floatingScrollbarBottomOffset: number;
    horizontalScrollbarTrackBg: string;
    horizontalScrollbarTrackBorderColor: string;
    horizontalScrollbarTrackShadow: string;
    horizontalScrollbarThumbBorderColor: string;
    horizontalScrollbarThumbShadow: string;
    themeStyles: DataGridThemeStyles;
};

export const DATA_GRID_BODY_FONT_WEIGHT = 400;
export const DATA_GRID_BODY_FONT_WEIGHT_CSS = String(DATA_GRID_BODY_FONT_WEIGHT);

export type DataGridThemeStyles = {
    bgContent: string;
    bgFilter: string;
    bgContextMenu: string;
    rowAddedBg: string;
    rowModBg: string;
    rowAddedHover: string;
    rowModHover: string;
    selectionAccentHex: string;
    selectionAccentRgb: string;
    columnMetaHintColor: string;
    columnMetaTooltipColor: string;
    panelFrameColor: string;
    floatingScrollbarThumbBg: string;
    floatingScrollbarThumbBorderColor: string;
    floatingScrollbarThumbShadow: string;
    verticalScrollbarTrackBg: string;
    horizontalScrollbarThumbBg: string;
    toolbarDividerColor: string;
    paginationShellBg: string;
    paginationShellBorderColor: string;
    paginationShellShadow: string;
    paginationChipBg: string;
    paginationChipBorderColor: string;
    paginationHoverBg: string;
    paginationPrimaryTextColor: string;
    paginationSecondaryTextColor: string;
    paginationAccentBg: string;
    paginationAccentBorderColor: string;
    paginationActiveItemBg: string;
    paginationActiveItemBorderColor: string;
    paginationActiveItemTextColor: string;
};

export const buildDataGridThemeStyles = ({ darkMode, opacity, blur }: BuildDataGridThemeStylesParams): DataGridThemeStyles => {
      const _getBg = (darkHex: string) => {
          if (!darkMode) return `rgba(255, 255, 255, ${opacity})`;
          const hex = darkHex.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${opacity})`;
      };
      const _rowBg = (r: number, g: number, b: number) => `rgba(${r}, ${g}, ${b}, ${opacity})`;
      const _glassMode = opacity < 0.999 || blur > 0;

      return {
          bgContent: _getBg('#1d1d1d'),
          bgFilter: _getBg('#262626'),
          bgContextMenu: darkMode ? '#1f1f1f' : '#ffffff',
          rowAddedBg: darkMode ? _rowBg(22, 43, 22) : _rowBg(246, 255, 237),
          rowModBg: darkMode ? _rowBg(22, 34, 56) : _rowBg(230, 247, 255),
          rowAddedHover: darkMode ? _rowBg(31, 61, 31) : _rowBg(217, 247, 190),
          rowModHover: darkMode ? _rowBg(29, 53, 94) : _rowBg(186, 231, 255),
          selectionAccentHex: darkMode ? '#f6c453' : '#1890ff',
          selectionAccentRgb: darkMode ? '246, 196, 83' : '24, 144, 255',
          columnMetaHintColor: darkMode ? 'rgba(226, 232, 240, 0.72)' : '#64748b',
          columnMetaTooltipColor: darkMode ? 'rgba(255, 236, 179, 0.98)' : '#262626',
          panelFrameColor: darkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.36)',
          floatingScrollbarThumbBg: darkMode ? 'rgba(255,255,255,0.68)' : 'rgba(0,0,0,0.44)',
          floatingScrollbarThumbBorderColor: darkMode ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.52)',
          floatingScrollbarThumbShadow: darkMode ? '0 4px 14px rgba(0,0,0,0.42)' : '0 4px 10px rgba(0,0,0,0.20)',
          verticalScrollbarTrackBg: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          horizontalScrollbarThumbBg: darkMode ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.14)',
          toolbarDividerColor: darkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.34)',
          paginationShellBg: darkMode
              ? `linear-gradient(135deg, rgba(17,22,34,${_glassMode ? Math.max(0.22, opacity * 0.38) : 0.82}) 0%, rgba(10,14,24,${_glassMode ? Math.max(0.28, opacity * 0.46) : 0.9}) 100%)`
              : `linear-gradient(135deg, rgba(255,255,255,${_glassMode ? Math.max(0.24, opacity * 0.36) : 0.96}) 0%, rgba(246,248,252,${_glassMode ? Math.max(0.32, opacity * 0.44) : 0.99}) 100%)`,
          paginationShellBorderColor: darkMode
              ? `rgba(255,255,255,${_glassMode ? 0.10 : 0.08})`
              : `rgba(16,24,40,${_glassMode ? 0.08 : 0.08})`,
          paginationShellShadow: darkMode
              ? `0 16px 34px rgba(0,0,0,${_glassMode ? 0.10 : 0.22})`
              : `0 14px 30px rgba(15,23,42,${_glassMode ? 0.03 : 0.08})`,
          paginationChipBg: darkMode
              ? `rgba(255,255,255,${_glassMode ? Math.max(0.02, opacity * 0.035) : 0.04})`
              : `rgba(255,255,255,${_glassMode ? Math.max(0.18, opacity * 0.26) : 0.86})`,
          paginationChipBorderColor: darkMode
              ? `rgba(255,255,255,${_glassMode ? 0.10 : 0.08})`
              : `rgba(16,24,40,${_glassMode ? 0.10 : 0.08})`,
          paginationHoverBg: darkMode
              ? `rgba(255,255,255,${_glassMode ? Math.max(0.04, opacity * 0.06) : 0.07})`
              : `rgba(255,255,255,${_glassMode ? Math.max(0.24, opacity * 0.34) : 0.96})`,
          paginationPrimaryTextColor: darkMode ? '#f5f7ff' : '#162033',
          paginationSecondaryTextColor: darkMode ? 'rgba(255,255,255,0.54)' : 'rgba(16,24,40,0.56)',
          paginationAccentBg: darkMode ? 'rgba(255,214,102,0.14)' : 'rgba(24,144,255,0.10)',
          paginationAccentBorderColor: darkMode ? 'rgba(255,214,102,0.38)' : 'rgba(24,144,255,0.22)',
          paginationActiveItemBg: darkMode ? 'rgba(255,214,102,0.18)' : 'rgba(24,144,255,0.12)',
          paginationActiveItemBorderColor: darkMode ? 'rgba(255,214,102,0.46)' : 'rgba(24,144,255,0.28)',
          paginationActiveItemTextColor: darkMode ? '#fff7d6' : '#0958d9',
      };
};

export const buildDataGridCssText = ({
    gridId,
    darkMode,
    opacity,
    panelRadius,
    tableBodyBottomPadding,
    dataTableVerticalBorderColor,
    floatingScrollbarHeight,
    floatingScrollbarInset,
    floatingScrollbarBottomOffset,
    horizontalScrollbarTrackBg,
    horizontalScrollbarTrackBorderColor,
    horizontalScrollbarTrackShadow,
    horizontalScrollbarThumbBorderColor,
    horizontalScrollbarThumbShadow,
    themeStyles,
}: BuildDataGridCssTextParams): string => {
    const {
        bgContent,
        bgFilter,
        bgContextMenu,
        rowAddedBg,
        rowModBg,
        rowAddedHover,
        rowModHover,
        selectionAccentHex,
        selectionAccentRgb,
        columnMetaHintColor,
        columnMetaTooltipColor,
        panelFrameColor,
        floatingScrollbarThumbBg,
        floatingScrollbarThumbBorderColor,
        floatingScrollbarThumbShadow,
        verticalScrollbarTrackBg,
        horizontalScrollbarThumbBg,
        paginationShellBg,
        paginationShellBorderColor,
        paginationShellShadow,
        paginationChipBg,
        paginationChipBorderColor,
        paginationHoverBg,
        paginationPrimaryTextColor,
        paginationSecondaryTextColor,
        paginationAccentBg,
        paginationAccentBorderColor,
        paginationActiveItemBg,
        paginationActiveItemBorderColor,
        paginationActiveItemTextColor,
    } = themeStyles;

    return `
                .${gridId} .data-grid-toolbar-scroll {
                    display: grid;
                    grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                    border: none;
                    border-radius: 0;
                    background: transparent;
                    overflow: visible;
                    box-sizing: border-box;
                }
                .${gridId} .data-grid-toolbar-scroll > * {
                    min-width: 0;
                }
                .${gridId} .data-grid-toolbar-main {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    min-width: 0;
                    flex-wrap: wrap;
                }
                .${gridId} .ant-table,
                .${gridId} .ant-table-wrapper,
                .${gridId} .ant-table-container {
                    background: transparent !important;
                    border-radius: ${panelRadius}px !important;
                }
                .${gridId} .ant-table-wrapper,
                .${gridId} .ant-table-container {
                    border: none !important;
                    overflow: hidden !important;
                }
                .${gridId} .ant-table-tbody > tr > td,
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell,
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell { background: transparent !important; border-bottom: 1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} !important; border-inline-end: 1px solid ${dataTableVerticalBorderColor} !important; }
                .${gridId} .ant-table-thead > tr > th { background: transparent !important; border-bottom: 1px solid ${darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} !important; border-inline-end: 1px solid ${dataTableVerticalBorderColor} !important; }
                .${gridId} .ant-table-tbody > tr > td:last-child,
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell:last-child,
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell:last-child,
                .${gridId} .ant-table-thead > tr > th:last-child {
                    border-inline-end-color: transparent !important;
                }
                /* Selection-column alignment: header TH has no class in Ant Design virtual mode, so match :first-child. */
                .${gridId} .ant-table-header th:first-child,
                .${gridId} .ant-table-thead > tr > th:first-child {
                    text-align: center !important;
                    padding-inline-start: 0 !important;
                    padding-inline-end: 0 !important;
                    padding-left: 0 !important;
                    padding-right: 0 !important;
                }
                .${gridId} .ant-table-selection-column {
                    text-align: center !important;
                    padding-inline-start: 0 !important;
                    padding-inline-end: 0 !important;
                }
                /* In narrow-table layouts, rc-table scales the selection column by viewport width; do not lock header width again.
                   Keep header/body padding and alignment consistent so the first column does not push data columns aside. */
                .${gridId} .ant-table-tbody > tr > td.ant-table-selection-column,
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell.ant-table-selection-column,
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell.ant-table-selection-column {
                    text-align: center !important;
                    padding-inline-start: 0 !important;
                    padding-inline-end: 0 !important;
                    padding-left: 0 !important;
                    padding-right: 0 !important;
                }
                .${gridId} .ant-table-thead > tr:first-child > th:first-child,
                .${gridId} .ant-table-header table > thead > tr:first-child > th:first-child {
                    border-top-left-radius: ${panelRadius}px !important;
                }
                .${gridId} .ant-table-thead > tr:first-child > th:last-child,
                .${gridId} .ant-table-header table > thead > tr:first-child > th:last-child {
                    border-top-right-radius: ${panelRadius}px !important;
                }
                .${gridId} .ant-table-body {
                    border-bottom-left-radius: ${panelRadius}px !important;
                    border-bottom-right-radius: ${panelRadius}px !important;
                }
                .${gridId} .ant-table-thead > tr > th::before { display: none !important; }
                .${gridId} .ant-table-thead > tr > th .ant-table-column-sorters { cursor: default !important; }
                .${gridId} .ant-table-thead > tr > th .ant-table-column-sorter,
                .${gridId} .ant-table-thead > tr > th .ant-table-column-sorter * { cursor: pointer !important; }
                .${gridId} .ant-table-tbody > tr:hover > td,
                .${gridId} .ant-table-tbody .ant-table-row:hover > .ant-table-cell { background-color: ${darkMode ? 'rgba(148, 163, 184, 0.10)' : 'rgba(37, 99, 235, 0.035)'} !important; }
                .${gridId} .ant-table-tbody > tr.ant-table-row-selected > td,
                .${gridId} .ant-table-tbody .ant-table-row.ant-table-row-selected > .ant-table-cell { background-color: ${darkMode ? `rgba(${selectionAccentRgb}, 0.18)` : `rgba(${selectionAccentRgb}, 0.08)`} !important; }
                .${gridId} .ant-table-tbody > tr.ant-table-row-selected:hover > td,
                .${gridId} .ant-table-tbody .ant-table-row.ant-table-row-selected:hover > .ant-table-cell { background-color: ${darkMode ? `rgba(${selectionAccentRgb}, 0.28)` : `rgba(${selectionAccentRgb}, 0.12)`} !important; }
                .${gridId} .row-added td,
                .${gridId} .row-added > .ant-table-cell { background-color: ${rowAddedBg} !important; color: ${darkMode ? '#e6fffb' : 'inherit'}; }
                .${gridId} .row-modified td,
                .${gridId} .row-modified > .ant-table-cell { background-color: ${rowModBg} !important; color: ${darkMode ? '#e6f7ff' : 'inherit'}; }
                .${gridId} .ant-table-tbody > tr > td.data-grid-cell-dirty,
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell.data-grid-cell-dirty,
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell.data-grid-cell-dirty {
                    background-color: ${darkMode ? 'rgba(250, 173, 20, 0.24)' : 'rgba(255, 251, 230, 0.98)'} !important;
                    box-shadow: inset 0 0 0 2px ${darkMode ? 'rgba(255, 214, 102, 0.74)' : 'rgba(250, 173, 20, 0.78)'} !important;
                }
                .${gridId} .ant-table-tbody > tr.row-added:hover > td,
                .${gridId} .ant-table-tbody .ant-table-row.row-added:hover > .ant-table-cell { background-color: ${rowAddedHover} !important; }
                .${gridId} .ant-table-tbody > tr.row-modified:hover > td,
                .${gridId} .ant-table-tbody .ant-table-row.row-modified:hover > .ant-table-cell { background-color: ${rowModHover} !important; }
                .${gridId} .ant-table-tbody > tr.row-modified:hover > td.data-grid-cell-dirty,
                .${gridId} .ant-table-tbody .ant-table-row.row-modified:hover > .ant-table-cell.data-grid-cell-dirty,
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row:hover > .ant-table-cell.data-grid-cell-dirty {
                    background-color: ${darkMode ? 'rgba(250, 173, 20, 0.32)' : 'rgba(255, 247, 204, 0.98)'} !important;
                }
                .${gridId} .ant-table-tbody > tr > td[data-col-name],
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell[data-col-name],
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell[data-col-name] {
                    user-select: none;
                    -webkit-user-select: none;
                    cursor: default;
                    font-weight: ${DATA_GRID_BODY_FONT_WEIGHT_CSS} !important;
                }
                .${gridId}.cell-edit-mode .ant-table-tbody > tr > td[data-col-name],
                .${gridId}.cell-edit-mode .ant-table-tbody .ant-table-row > .ant-table-cell[data-col-name],
                .${gridId}.cell-edit-mode .ant-table-tbody-virtual-holder .ant-table-row > .ant-table-cell[data-col-name] {
                    cursor: crosshair;
                }
                .${gridId} .ant-table-tbody > tr,
                .${gridId} .ant-table-tbody .ant-table-row,
                .${gridId} .ant-table-tbody-virtual-holder .ant-table-row,
                .${gridId} .ant-table-tbody-virtual-holder-inner,
                .${gridId} .rc-virtual-list-holder,
                .${gridId} .ant-table-cell[data-col-name],
                .${gridId} .ant-table-cell[data-col-name] * {
                    font-weight: ${DATA_GRID_BODY_FONT_WEIGHT_CSS} !important;
                    font-synthesis: none;
                    font-synthesis-weight: none;
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                    text-shadow: none !important;
                }
                .${gridId} .ant-table-cell[data-col-name] .data-grid-cell-content,
                .${gridId} .ant-table-cell[data-col-name] .data-grid-cell-virtual-wrap,
                .${gridId} .ant-table-cell[data-col-name] .editable-cell-value-wrap {
                    font-weight: ${DATA_GRID_BODY_FONT_WEIGHT_CSS} !important;
                }
                .${gridId} .ant-table-cell[data-col-name] b,
                .${gridId} .ant-table-cell[data-col-name] strong,
                .${gridId} .ant-table-cell[data-col-name] mark {
                    font-weight: ${DATA_GRID_BODY_FONT_WEIGHT_CSS} !important;
                    font-synthesis: none;
                    font-synthesis-weight: none;
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                    text-shadow: none !important;
                }
                .${gridId} .ant-table-tbody > tr > td[data-cell-selected="true"],
                .${gridId} .ant-table-tbody .ant-table-row > .ant-table-cell[data-cell-selected="true"],
                .${gridId} [data-cell-selected="true"] {
                    box-shadow: inset 0 0 0 2px ${selectionAccentHex} !important;
                    background-image: linear-gradient(${darkMode ? `rgba(${selectionAccentRgb}, 0.20)` : `rgba(${selectionAccentRgb}, 0.08)`}, ${darkMode ? `rgba(${selectionAccentRgb}, 0.20)` : `rgba(${selectionAccentRgb}, 0.08)`}) !important;
                }
                .${gridId} .ant-table-content,
                .${gridId} .ant-table-body {
                    scrollbar-gutter: stable;
                }
                .${gridId} .ant-table-body {
                    padding-bottom: ${tableBodyBottomPadding}px;
                    box-sizing: border-box;
                    scroll-padding-bottom: ${tableBodyBottomPadding}px;
                }
                .${gridId} .ant-table-tbody-virtual-holder,
                .${gridId} .rc-virtual-list-holder {
                    padding-bottom: ${tableBodyBottomPadding}px;
                    box-sizing: border-box;
                    scroll-padding-bottom: ${tableBodyBottomPadding}px;
                }
                .${gridId} .ant-table-tbody-virtual-holder-inner {
                    padding-bottom: ${tableBodyBottomPadding}px;
                    box-sizing: border-box;
                }
                .${gridId} .data-grid-table-wrap {
                    width: 100%;
                    max-width: 100%;
                    overflow: hidden;
                }
                .${gridId} .ant-table-sticky-scroll {
                    display: none !important;
                }
                .${gridId} .data-grid-find-highlight {
                    padding: 0 1px;
                    border-radius: 3px;
                    background: ${darkMode ? 'rgba(246, 196, 83, 0.42)' : 'rgba(255, 193, 7, 0.42)'};
                    color: inherit;
                }
                /* Virtual table column alignment: prevent header <table> from stretching to viewport via min-width:100%.
                   This keeps header column widths aligned with virtual body cell widths. */
                .${gridId} .ant-table-header > table {
                    min-width: 0 !important;
                }
                .${gridId} .ant-table-tbody-virtual-scrollbar.ant-table-tbody-virtual-scrollbar-horizontal {
                    display: none !important;
                }
                .${gridId} .data-grid-table-wrap.data-grid-table-wrap-external-active .ant-table-content {
                    overflow-x: hidden !important;
                }
                .${gridId} .data-grid-table-wrap.data-grid-table-wrap-external-active .ant-table-body {
                    overflow-x: hidden !important;
                    overflow-y: auto !important;
                }
                .${gridId} .data-grid-table-wrap.data-grid-table-wrap-external-active .ant-table-tbody-virtual-holder,
                .${gridId} .data-grid-table-wrap.data-grid-table-wrap-external-active .rc-virtual-list-holder {
                    overflow-x: hidden !important;
                }
                .${gridId} .ant-table-body {
                    scrollbar-width: thin;
                    scrollbar-color: ${floatingScrollbarThumbBg} transparent;
                }
                .${gridId} .ant-table-body::-webkit-scrollbar {
                    width: ${floatingScrollbarHeight}px;
                    height: 0;
                }
                .${gridId} .ant-table-body::-webkit-scrollbar-track {
                    background: ${verticalScrollbarTrackBg};
                    margin: 8px 0;
                    border-radius: 999px;
                }
                .${gridId} .ant-table-body::-webkit-scrollbar-thumb {
                    background: ${floatingScrollbarThumbBg};
                    border: 1px solid ${floatingScrollbarThumbBorderColor};
                    border-radius: 999px;
                    box-shadow: ${floatingScrollbarThumbShadow};
                }
                .${gridId} .rc-virtual-list-holder {
                    scrollbar-width: thin;
                    scrollbar-color: ${floatingScrollbarThumbBg} transparent;
                }
                .${gridId} .rc-virtual-list-holder::-webkit-scrollbar {
                    width: ${floatingScrollbarHeight}px;
                    height: 0;
                }
                .${gridId} .rc-virtual-list-holder::-webkit-scrollbar-track {
                    background: ${verticalScrollbarTrackBg};
                    margin: 8px 0;
                    border-radius: 999px;
                }
                .${gridId} .rc-virtual-list-holder::-webkit-scrollbar-thumb {
                    background: ${floatingScrollbarThumbBg};
                    border: 1px solid ${floatingScrollbarThumbBorderColor};
                    border-radius: 999px;
                    box-shadow: ${floatingScrollbarThumbShadow};
                }
                .${gridId} .data-grid-toolbar-button {
                    min-height: 32px;
                    border-radius: 9px !important;
                    box-shadow: none !important;
                    font-weight: 600;
                }
                .${gridId} .data-grid-toolbar-button-strong {
                    border-color: ${darkMode ? 'rgba(96, 165, 250, 0.50)' : 'rgba(37, 99, 235, 0.42)'} !important;
                }
                .${gridId} .data-grid-toolbar-button-danger-soft:not(:hover) {
                    background: ${darkMode ? 'rgba(239, 68, 68, 0.10)' : 'rgba(254, 242, 242, 0.96)'} !important;
                    border-color: ${darkMode ? 'rgba(248, 113, 113, 0.28)' : 'rgba(252, 165, 165, 0.58)'} !important;
                }
                .${gridId} .data-grid-toolbar-divider {
                    width: 1px;
                    height: 18px;
                    margin: 0 2px;
                    flex: 0 0 auto;
                }
                .${gridId} .data-grid-toolbar-status {
                    overflow: hidden;
                    color: ${paginationSecondaryTextColor};
                    font-size: 12px;
                    line-height: 1.4;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                }
                .${gridId} .data-grid-toolbar-status-danger {
                    color: ${darkMode ? '#fca5a5' : '#b91c1c'};
                    font-weight: 600;
                }
                .${gridId} .data-grid-toolbar-more-button {
                    justify-self: end;
                }
                .data-grid-toolbar-more-panel {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    min-width: 176px;
                    padding: 4px;
                }
                .data-grid-toolbar-menu-button {
                    justify-content: flex-start !important;
                    height: 32px;
                    padding: 0 10px !important;
                    border-radius: 8px !important;
                    font-weight: 500;
                    text-align: left;
                }
                .data-grid-toolbar-menu-button > span:not(.anticon) {
                    flex: 1 1 auto;
                    min-width: 0;
                    text-align: left;
                }
                .data-grid-toolbar-menu-caret {
                    margin-left: auto;
                    font-size: 10px;
                    color: ${paginationSecondaryTextColor};
                }
                .data-grid-toolbar-menu-ai {
                    color: #059669 !important;
                    font-weight: 700;
                }
                .${gridId} .data-grid-footer-actions {
                    display: grid;
                    grid-template-columns: minmax(240px, auto) minmax(220px, 1fr) auto;
                    align-items: center;
                    gap: 10px 12px;
                    padding: 8px 0 0;
                }
                .${gridId} .data-grid-footer-left,
                .${gridId} .data-grid-footer-find,
                .${gridId} .data-grid-footer-view {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 0;
                    flex-wrap: nowrap;
                }
                .${gridId} .data-grid-footer-find {
                    justify-content: center;
                }
                .${gridId} .data-grid-footer-find-shell {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 0;
                    padding: 4px 8px 4px 10px;
                    border: 1px solid ${paginationChipBorderColor};
                    border-radius: 999px;
                    background: ${paginationChipBg};
                    box-shadow: ${paginationShellShadow};
                    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
                }
                .${gridId} .data-grid-footer-find-shell:focus-within {
                    border-color: ${paginationAccentBorderColor};
                    background: ${paginationHoverBg};
                    box-shadow: 0 0 0 2px ${paginationAccentBg}, ${paginationShellShadow};
                }
                .${gridId} .data-grid-footer-find-field {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    min-width: 0;
                }
                .${gridId} .data-grid-footer-find-icon {
                    color: ${paginationSecondaryTextColor};
                    font-size: 13px;
                    flex: 0 0 auto;
                }
                .${gridId} .data-grid-footer-view {
                    justify-content: flex-end;
                    color: ${paginationSecondaryTextColor};
                }
                .${gridId} .data-grid-footer-button {
                    border-radius: 999px !important;
                    box-shadow: none !important;
                }
                .${gridId} .data-grid-footer-find-shell .ant-input-affix-wrapper {
                    padding: 0;
                    border: 0;
                    background: transparent;
                    box-shadow: none;
                }
                .${gridId} .data-grid-footer-find-shell .ant-input,
                .${gridId} .data-grid-footer-find-shell .ant-input-affix-wrapper input {
                    height: 24px;
                    padding: 0;
                    background: transparent;
                    color: ${paginationPrimaryTextColor};
                }
                .${gridId} .data-grid-footer-find-input {
                    width: min(240px, 24vw);
                }
                .${gridId} .data-grid-footer-find-nav {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    flex: 0 0 auto;
                }
                .${gridId} .data-grid-footer-find-summary,
                .${gridId} .data-grid-footer-view-label {
                    color: ${paginationSecondaryTextColor};
                    font-size: 12px;
                    white-space: nowrap;
                }
                .${gridId} .data-grid-pagination-wrap {
                    grid-column: 1 / -1;
                    display: flex;
                    justify-content: flex-end;
                    min-width: 0;
                }
                @media (max-width: 1180px) {
                    .${gridId} .data-grid-toolbar-scroll,
                    .${gridId} .data-grid-footer-actions {
                        grid-template-columns: 1fr;
                    }
                    .${gridId} .data-grid-toolbar-more-button {
                        justify-self: start;
                    }
                    .${gridId} .data-grid-footer-find,
                    .${gridId} .data-grid-footer-view,
                    .${gridId} .data-grid-pagination-wrap {
                        justify-content: flex-start;
                    }
                    .${gridId} .data-grid-footer-find-shell {
                        width: 100%;
                        max-width: 100%;
                    }
                    .${gridId} .data-grid-footer-find-input {
                        width: 100%;
                    }
                }
                .${gridId} .data-grid-external-horizontal-scroll {
                    position: absolute;
                    left: ${floatingScrollbarInset}px;
                    right: ${floatingScrollbarInset}px;
                    bottom: ${floatingScrollbarBottomOffset}px;
                    height: ${floatingScrollbarHeight + 2}px;
                    overflow-x: auto;
                    overflow-y: hidden;
                    background: transparent;
                    z-index: 18;
                }
                .${gridId} .data-grid-external-horizontal-scroll::-webkit-scrollbar {
                    height: ${floatingScrollbarHeight}px;
                }
                .${gridId} .data-grid-external-horizontal-scroll::-webkit-scrollbar-track {
                    background: ${horizontalScrollbarTrackBg};
                    border: 1px solid ${horizontalScrollbarTrackBorderColor};
                    border-radius: 999px;
                    box-shadow: ${horizontalScrollbarTrackShadow};
                }
                .${gridId} .data-grid-external-horizontal-scroll::-webkit-scrollbar-thumb {
                    background: ${horizontalScrollbarThumbBg};
                    border: 1px solid ${horizontalScrollbarThumbBorderColor};
                    border-radius: 999px;
                    box-shadow: ${horizontalScrollbarThumbShadow};
                }
                .${gridId} .data-grid-external-horizontal-scroll-inner {
                    height: 1px;
                }
                .${gridId} .data-grid-pagination-shell {
                    display: inline-flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 10px;
                    flex-wrap: wrap;
                    max-width: 100%;
                    padding: 6px 8px;
                    border-radius: 12px;
                    border: 1px solid ${paginationShellBorderColor};
                    background: ${paginationShellBg};
                    box-shadow: none;
                    backdrop-filter: ${opacity < 0.999 ? 'blur(14px)' : 'none'};
                    -webkit-backdrop-filter: ${opacity < 0.999 ? 'blur(14px)' : 'none'};
                }
                .${gridId} .data-grid-pagination-summary,
                .${gridId} .data-grid-pagination-page-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    min-height: 34px;
                    padding: 0 12px;
                    border-radius: 999px;
                    border: 1px solid ${paginationChipBorderColor};
                    background: ${paginationChipBg};
                    color: ${paginationPrimaryTextColor};
                    font-size: 12px;
                    line-height: 1;
                    font-variant-numeric: tabular-nums;
                    white-space: nowrap;
                }
                .${gridId} .data-grid-pagination-kicker {
                    display: inline-flex;
                    align-items: center;
                    height: 20px;
                    padding: 0 8px;
                    border-radius: 999px;
                    background: ${paginationAccentBg};
                    border: 1px solid ${paginationAccentBorderColor};
                    color: ${paginationActiveItemTextColor};
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.02em;
                }
                .${gridId} .data-grid-pagination-summary-value {
                    color: ${paginationPrimaryTextColor};
                    font-weight: 600;
                    font-variant-numeric: tabular-nums;
                }
                .${gridId} .data-grid-pagination-page-chip {
                    color: ${paginationSecondaryTextColor};
                    font-weight: 600;
                }
                .${gridId} .ant-pagination {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    margin: 0;
                    color: ${paginationPrimaryTextColor};
                }
                .${gridId} .ant-pagination .ant-pagination-item,
                .${gridId} .ant-pagination .ant-pagination-prev,
                .${gridId} .ant-pagination .ant-pagination-next,
                .${gridId} .ant-pagination .ant-pagination-jump-prev,
                .${gridId} .ant-pagination .ant-pagination-jump-next {
                    min-width: 34px;
                    height: 34px;
                    margin-inline-end: 0;
                    border-radius: 12px;
                    border: 1px solid ${paginationChipBorderColor};
                    background: ${paginationChipBg};
                    box-shadow: none;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
                }
                .${gridId} .ant-pagination .ant-pagination-item a,
                .${gridId} .ant-pagination .ant-pagination-prev .ant-pagination-item-link,
                .${gridId} .ant-pagination .ant-pagination-next .ant-pagination-item-link,
                .${gridId} .ant-pagination .ant-pagination-prev > *,
                .${gridId} .ant-pagination .ant-pagination-next > * {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    color: ${paginationPrimaryTextColor};
                    font-weight: 600;
                    border: none;
                    background: transparent;
                    border-radius: inherit;
                    line-height: 1;
                }
                .${gridId} .ant-pagination .ant-pagination-item:hover,
                .${gridId} .ant-pagination .ant-pagination-prev:hover,
                .${gridId} .ant-pagination .ant-pagination-next:hover {
                    background: ${paginationHoverBg};
                    border-color: ${paginationActiveItemBorderColor};
                    transform: translateY(-1px);
                }
                .${gridId} .ant-pagination .ant-pagination-item-active {
                    border-color: ${paginationActiveItemBorderColor};
                    background: ${paginationActiveItemBg};
                    box-shadow: inset 0 0 0 1px ${paginationAccentBorderColor};
                }
                .${gridId} .ant-pagination .ant-pagination-item-active a {
                    color: ${paginationActiveItemTextColor};
                }
                .${gridId} .ant-pagination .ant-pagination-disabled,
                .${gridId} .ant-pagination .ant-pagination-disabled:hover {
                    background: transparent;
                    border-color: ${paginationChipBorderColor};
                    transform: none;
                    opacity: 0.42;
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev,
                .${gridId} .ant-pagination .ant-pagination-jump-next {
                    padding: 0;
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-link,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-link {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    padding: 0;
                    margin: 0;
                    line-height: 1;
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-container,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    position: relative;
                    line-height: 1;
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-ellipsis,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-ellipsis,
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-link-icon,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-link-icon {
                    position: absolute !important;
                    top: 0 !important;
                    right: 0 !important;
                    bottom: 0 !important;
                    left: 0 !important;
                    inset: 0 !important;
                    width: fit-content !important;
                    height: fit-content !important;
                    min-width: 0 !important;
                    min-height: 0 !important;
                    margin: auto !important;
                    padding: 0 !important;
                    transform: none !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    line-height: 1 !important;
                    color: ${paginationSecondaryTextColor};
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-ellipsis,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-ellipsis {
                    letter-spacing: 0.18em;
                    text-indent: 0.18em;
                    text-align: center;
                }
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-link-icon .anticon,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-link-icon .anticon,
                .${gridId} .ant-pagination .ant-pagination-jump-prev .ant-pagination-item-link-icon svg,
                .${gridId} .ant-pagination .ant-pagination-jump-next .ant-pagination-item-link-icon svg {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    width: 1em;
                    height: 1em;
                    line-height: 1;
                }
                .${gridId} .data-grid-pagination-nav-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                    font-size: 12px;
                    line-height: 1;
                }
                .${gridId} .data-grid-pagination-nav-icon .anticon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                }
                .${gridId} .data-grid-pagination-size-select {
                    min-width: 112px;
                    height: 34px;
                    display: inline-flex;
                    align-items: stretch;
                }
                .${gridId} .data-grid-pagination-size-select.ant-select-single,
                .${gridId} .data-grid-pagination-size-select.ant-select-single.ant-select-sm {
                    height: 34px;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-selector {
                    height: 34px !important;
                    border-radius: 12px !important;
                    border: 1px solid ${paginationChipBorderColor} !important;
                    background: ${paginationChipBg} !important;
                    box-shadow: none !important;
                    padding: 0 12px !important;
                    display: flex !important;
                    align-items: center !important;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-wrap {
                    display: flex !important;
                    align-items: center !important;
                    height: 100%;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-search,
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-search-input {
                    height: 100% !important;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-item,
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-placeholder {
                    display: flex;
                    align-items: center;
                    height: 100%;
                    line-height: 34px !important;
                    color: ${paginationPrimaryTextColor};
                    font-weight: 600;
                    font-variant-numeric: tabular-nums;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-selection-search {
                    inset-inline-start: 12px !important;
                    inset-inline-end: 32px !important;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-arrow {
                    color: ${paginationSecondaryTextColor};
                    inset-inline-end: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    margin-top: 0;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    height: 16px;
                    line-height: 1;
                }
                .${gridId} .data-grid-pagination-size-select .ant-select-arrow .anticon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    line-height: 1;
                }
  `;
};
