import type { FilterCondition } from '../../utils/sql';

export type GridFilterCondition = FilterCondition & {
    id: number;
    column: string;
    op: string;
    value: string;
    value2?: string;
    enabled?: boolean;
    logic?: 'AND' | 'OR';
};

export type GridSortInfo = { columnKey: string; order: string; enabled?: boolean };
