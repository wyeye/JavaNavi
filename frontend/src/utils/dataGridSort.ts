export type GridSortInfoItem = {
  columnKey: string;
  order: string;
  enabled?: boolean;
};

type TableSorterLike = {
  field?: unknown;
  columnKey?: unknown;
  order?: unknown;
};

export const resolveGridSortInfoFromTableSorter = ({
  sorter,
}: {
  sorter: TableSorterLike | TableSorterLike[] | null | undefined;
}): GridSortInfoItem[] => {
  const sorters = Array.isArray(sorter)
    ? sorter
    : ((sorter?.field || sorter?.columnKey) ? [sorter] : []);

  if (sorters.length === 0) {
    return [];
  }

  const next: GridSortInfoItem[] = [];
  const seen = new Set<string>();

  for (const item of sorters) {
    const field = String(item?.field || item?.columnKey || '').trim();
    if (!field) continue;

    const order = item?.order as string;
    const normalizedOrder = order === 'ascend' || order === 'descend' ? order : '';
    if (!normalizedOrder) continue;
    const dedupeKey = field.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    next.push({ columnKey: field, order: normalizedOrder, enabled: true });
  }

  return next;
};
