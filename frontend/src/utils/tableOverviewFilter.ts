export const TABLE_OVERVIEW_RENDER_BATCH_SIZE = 300;

export type TableOverviewSortField = 'name' | 'rows' | 'dataSize';
export type TableOverviewSortOrder = 'asc' | 'desc';

export interface TableOverviewFilterRow {
  name: string;
  comment?: string;
  rows: number;
  dataSize: number;
  indexSize: number;
}

export interface TableOverviewSearchIndexItem<T extends TableOverviewFilterRow> {
  row: T;
  searchText: string;
  sortName: string;
}

export const buildTableOverviewSearchIndex = <T extends TableOverviewFilterRow>(
  rows: T[],
): TableOverviewSearchIndexItem<T>[] => rows.map((row) => ({
    row,
    searchText: `${row.name}\n${row.comment || ''}`.toLowerCase(),
    sortName: row.name.toLowerCase(),
  }));

export const filterAndSortTableOverviewRows = <T extends TableOverviewFilterRow>(
  indexedRows: TableOverviewSearchIndexItem<T>[],
  rawSearchText: string,
  sortField: TableOverviewSortField,
  sortOrder: TableOverviewSortOrder,
): T[] => {
  const keyword = String(rawSearchText || '').trim().toLowerCase();
  const matched = keyword
    ? indexedRows.filter((item) => item.searchText.includes(keyword))
    : [...indexedRows];

  matched.sort((a, b) => {
    let cmp = 0;
    if (sortField === 'name') {
      cmp = a.sortName.localeCompare(b.sortName);
    } else if (sortField === 'rows') {
      cmp = a.row.rows - b.row.rows;
    } else if (sortField === 'dataSize') {
      cmp = a.row.dataSize - b.row.dataSize;
    }
    return sortOrder === 'asc' ? cmp : -cmp;
  });

  return matched.map((item) => item.row);
};

export const resolveTableOverviewVisibleRows = <T>(
  rows: T[],
  rawLimit: number,
): { visibleRows: T[]; hiddenCount: number; totalCount: number } => {
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), rows.length)
    : Math.min(TABLE_OVERVIEW_RENDER_BATCH_SIZE, rows.length);
  return {
    visibleRows: rows.slice(0, limit),
    hiddenCount: Math.max(0, rows.length - limit),
    totalCount: rows.length,
  };
};
