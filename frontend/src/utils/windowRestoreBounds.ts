export type WindowRestoreBounds = {
  width: number;
  height: number;
  x: number;
  y: number;
};

type VisibleViewport = {
  availWidth: number;
  availHeight: number;
  availLeft?: number;
  availTop?: number;
};

const MIN_VISIBLE_WIDTH = 160;
const MIN_VISIBLE_HEIGHT = 120;

export const resolveVisibleStartupWindowBounds = (
  bounds: WindowRestoreBounds,
  viewport: VisibleViewport,
): WindowRestoreBounds => {
  const visibleWidth = Math.trunc(Number(viewport.availWidth) || 0);
  const visibleHeight = Math.trunc(Number(viewport.availHeight) || 0);
  if (visibleWidth <= 0 || visibleHeight <= 0) {
    return bounds;
  }

  const visibleLeft = Math.trunc(Number(viewport.availLeft) || 0);
  const visibleTop = Math.trunc(Number(viewport.availTop) || 0);
  const visibleRight = visibleLeft + visibleWidth;
  const visibleBottom = visibleTop + visibleHeight;

  const overlapWidth = Math.min(bounds.x + bounds.width, visibleRight) - Math.max(bounds.x, visibleLeft);
  const overlapHeight = Math.min(bounds.y + bounds.height, visibleBottom) - Math.max(bounds.y, visibleTop);
  if (
    overlapWidth >= Math.min(MIN_VISIBLE_WIDTH, bounds.width) &&
    overlapHeight >= Math.min(MIN_VISIBLE_HEIGHT, bounds.height)
  ) {
    return bounds;
  }

  return {
    ...bounds,
    x: visibleLeft + Math.max(0, Math.trunc((visibleWidth - bounds.width) / 2)),
    y: visibleTop + Math.max(0, Math.trunc((visibleHeight - bounds.height) / 2)),
  };
};
