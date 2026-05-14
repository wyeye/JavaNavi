import { translate, type AppLanguage } from '../i18n';

export type PaginationStateLike = {
  current: number;
  pageSize: number;
  total: number;
  totalKnown?: boolean;
  totalApprox?: boolean;
  approximateTotal?: number;
  totalCountLoading?: boolean;
  totalCountCancelled?: boolean;
};

const toFiniteNonNegativeNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const resolveApproximateTotal = (pagination: PaginationStateLike): number | null => {
  if (!pagination.totalApprox) return null;
  const approximateTotal = toFiniteNonNegativeNumber(pagination.approximateTotal);
  return approximateTotal !== null && approximateTotal > 0 ? approximateTotal : null;
};

const resolveCurrentCount = (pagination: PaginationStateLike): number => {
  const total = toFiniteNonNegativeNumber(pagination.total) ?? 0;
  const rangeStart = Math.max(0, (pagination.current - 1) * pagination.pageSize + (total > 0 ? 1 : 0));
  const hasValidRange = total > 0 && rangeStart > 0;
  if (!hasValidRange) return 0;
  const rangeEnd = Math.min(total, rangeStart + pagination.pageSize - 1);
  return Math.max(0, rangeEnd - rangeStart + 1);
};

export const resolvePaginationSummaryText = (params: {
  pagination: PaginationStateLike;
  prefersManualTotalCount: boolean;
  supportsApproximateTableCount: boolean;
  language?: AppLanguage;
}): string => {
  const { pagination, prefersManualTotalCount, supportsApproximateTableCount, language = 'en' } = params;
  const currentCount = resolveCurrentCount(pagination);
  const total = toFiniteNonNegativeNumber(pagination.total) ?? 0;
  const approximateTotal = resolveApproximateTotal(pagination);

  if (pagination.totalKnown === false) {
    if (prefersManualTotalCount) {
      if (pagination.totalCountLoading) return translate(language, 'dataGrid.pagination.summary.countingExact', { currentCount });
      if (supportsApproximateTableCount && approximateTotal !== null) return translate(language, 'dataGrid.pagination.summary.approximate', { currentCount, total: approximateTotal });
      if (pagination.totalCountCancelled) return translate(language, 'dataGrid.pagination.summary.cancelled', { currentCount });
      return translate(language, 'dataGrid.pagination.summary.unknown', { currentCount });
    }
    return translate(language, 'dataGrid.pagination.summary.counting', { currentCount });
  }

  if (!Number.isFinite(total) || total <= 0) {
    return translate(language, 'dataGrid.pagination.summary.empty');
  }

  return translate(language, 'dataGrid.pagination.summary.known', { currentCount, total });
};

export const resolvePaginationPageText = (params: {
  pagination: PaginationStateLike;
  supportsApproximateTotalPages: boolean;
  language?: AppLanguage;
}): string => {
  const { pagination, supportsApproximateTotalPages, language = 'en' } = params;
  const exactTotal = toFiniteNonNegativeNumber(pagination.total) ?? 0;
  const approximateTotal = resolveApproximateTotal(pagination);
  const effectiveTotal =
    pagination.totalKnown !== false
      ? exactTotal
      : supportsApproximateTotalPages && approximateTotal !== null
        ? approximateTotal
        : 0;

  if (effectiveTotal <= 0) return translate(language, 'dataGrid.pagination.page.current', { current: pagination.current });

  const totalPages = Math.max(1, Math.ceil(effectiveTotal / Math.max(1, pagination.pageSize)));
  if (pagination.totalKnown === false && !(supportsApproximateTotalPages && approximateTotal !== null)) {
    return translate(language, 'dataGrid.pagination.page.current', { current: pagination.current });
  }
  return translate(language, 'dataGrid.pagination.page.currentTotal', { current: pagination.current, total: totalPages });
};

export const resolvePaginationTotalForControl = (params: {
  pagination: PaginationStateLike;
  supportsApproximateTotalPages: boolean;
}): number => {
  const { pagination, supportsApproximateTotalPages } = params;
  const exactTotal = toFiniteNonNegativeNumber(pagination.total) ?? 0;
  const approximateTotal = resolveApproximateTotal(pagination);
  if (pagination.totalKnown !== false) return exactTotal;
  if (supportsApproximateTotalPages && approximateTotal !== null) return approximateTotal;
  return exactTotal;
};
