export const resolveVirtualHorizontalElements = (tableContainer: HTMLElement) => {
    const holderEl = tableContainer.querySelector('.ant-table-tbody-virtual-holder') as HTMLElement | null;
    const innerEl = holderEl?.querySelector('.ant-table-tbody-virtual-holder-inner') as HTMLElement | null;
    const headerEl = tableContainer.querySelector('.ant-table-header') as HTMLElement | null;
    return { holderEl, innerEl, headerEl };
};

export const readVirtualHorizontalOffset = (tableContainer: HTMLElement): number => {
    const { innerEl, headerEl } = resolveVirtualHorizontalElements(tableContainer);
    const marginLeft = innerEl ? Math.abs(parseFloat(innerEl.style.marginLeft) || 0) : 0;
    const headerLeft = headerEl ? Math.max(0, headerEl.scrollLeft) : 0;
    return Math.max(marginLeft, headerLeft);
};

export const applyVirtualHorizontalOffset = ({
    tableContainer,
    nextOffset,
    tableScrollX,
}: {
    tableContainer: HTMLElement;
    nextOffset: number;
    tableScrollX: number;
}): boolean => {
    const { holderEl, innerEl } = resolveVirtualHorizontalElements(tableContainer);
    if (!(holderEl instanceof HTMLElement) || !(innerEl instanceof HTMLElement)) {
        return false;
    }

    const maxScroll = Math.max(0, tableScrollX - holderEl.clientWidth);
    const clampedOffset = Math.max(0, Math.min(maxScroll, nextOffset));
    const currentOffset = Math.abs(parseFloat(innerEl.style.marginLeft) || 0);
    const deltaX = clampedOffset - currentOffset;
    if (Math.abs(deltaX) < 0.5) return true;

    // 通过合成 WheelEvent 驱动 rc-virtual-list 内部 offsetLeft state，
    // 让 rc-table onInternalScroll 自动同步 header scrollLeft。
    // 不直接操作 DOM marginLeft，避免 React re-render 覆盖。
    holderEl.dispatchEvent(new WheelEvent('wheel', {
        deltaX,
        deltaY: 0,
        bubbles: true,
        cancelable: true,
    }));
    return true;
};

export const pickHorizontalScrollTargets = (tableContainer: HTMLElement): HTMLElement[] => {
    const virtualBody = tableContainer.querySelector('.ant-table-tbody-virtual-holder');
    const body = tableContainer.querySelector('.ant-table-body');
    const content = tableContainer.querySelector('.ant-table-content');
    const virtualHolder = tableContainer.querySelector('.rc-virtual-list-holder');
    const candidates = [virtualBody, virtualHolder, body, content].filter((node): node is HTMLElement => node instanceof HTMLElement);
    if (candidates.length === 0) {
        return [];
    }
    const active = candidates.find((target) => target.scrollWidth > target.clientWidth + 1) || candidates[0];
    return active ? [active] : [];
};

export const pickVerticalScrollTarget = (tableContainer: HTMLElement): HTMLElement | null => {
    const virtualHolder = tableContainer.querySelector('.ant-table-tbody-virtual-holder') as HTMLElement | null;
    const rcVirtualHolder = tableContainer.querySelector('.rc-virtual-list-holder') as HTMLElement | null;
    const body = tableContainer.querySelector('.ant-table-body') as HTMLElement | null;
    return virtualHolder || rcVirtualHolder || body;
};

export const resolveHorizontalWheelDelta = (event: WheelEvent): number => {
    if (Math.abs(event.deltaX) > 0.5) {
        return event.deltaX;
    }
    if (event.shiftKey && Math.abs(event.deltaY) > 0.5) {
        return event.deltaY;
    }
    return 0;
};

export const isDataGridTableAreaTarget = (target: EventTarget | null): boolean => {
    const element = target instanceof HTMLElement ? target : null;
    if (!element) return false;
    // 排除外部滚动条与工具栏，其余容器内元素一律视为数据区域
    if (element.closest('.data-grid-external-horizontal-scroll')) return false;
    if (element.closest('.data-grid-toolbar')) return false;
    return true;
};

export const pickVirtualHorizontalFallbackTargets = (tableContainer: HTMLElement): HTMLElement[] => {
    const headerEl = tableContainer.querySelector('.ant-table-header') as HTMLElement | null;
    const contentEl = tableContainer.querySelector('.ant-table-content') as HTMLElement | null;
    return [headerEl, contentEl].filter((el): el is HTMLElement => el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1);
};
