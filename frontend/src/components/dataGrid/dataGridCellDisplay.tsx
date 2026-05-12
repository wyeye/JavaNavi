import React from 'react';
import { findDataGridTextRanges } from '../../utils/dataGridFind';
import { formatCellDisplayText } from './dataGridValue';

export const renderHighlightedCellText = (text: string, query: string): React.ReactNode => {
    const ranges = findDataGridTextRanges(text, query);
    if (ranges.length === 0) return text;

    const nodes: React.ReactNode[] = [];
    let cursor = 0;
    ranges.forEach((range, index) => {
        if (range.start > cursor) {
            nodes.push(text.slice(cursor, range.start));
        }
        nodes.push(
            <mark key={`${range.start}-${range.end}-${index}`} className="data-grid-find-highlight">
                {text.slice(range.start, range.end)}
            </mark>,
        );
        cursor = range.end;
    });
    if (cursor < text.length) {
        nodes.push(text.slice(cursor));
    }
    return <>{nodes}</>;
};

export const renderCellDisplayValue = (val: unknown, query: string): React.ReactNode => {
    const text = formatCellDisplayText(val);
    const content = renderHighlightedCellText(text, query);
    if (val === null) return <span style={{ color: '#ccc' }}>{content}</span>;
    return content;
};

// Cell key helpers for batch selection/fill.
// Use a control character separator to avoid collisions with rowKey/columnName contents (e.g. `new-123`).
const CELL_KEY_SEP = '\u0001';

export const makeCellKey = (rowKey: string, colName: string) => `${rowKey}${CELL_KEY_SEP}${colName}`;

export const splitCellKey = (cellKey: string): { rowKey: string; colName: string } | null => {
    const sepIndex = cellKey.indexOf(CELL_KEY_SEP);
    if (sepIndex === -1) return null;
    return {
        rowKey: cellKey.slice(0, sepIndex),
        colName: cellKey.slice(sepIndex + CELL_KEY_SEP.length),
    };
};
