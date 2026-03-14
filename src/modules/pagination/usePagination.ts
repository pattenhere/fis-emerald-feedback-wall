import { useMemo } from "react";

export interface PaginationState<T> {
  pageItems: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startItem: number;
  endItem: number;
}

export const usePagination = <T>(
  items: T[],
  page: number,
  pageSize: number,
): PaginationState<T> => {
  return useMemo(() => {
    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const pageItems = items.slice(startIndex, startIndex + pageSize);
    const startItem = totalItems === 0 ? 0 : startIndex + 1;
    const endItem = totalItems === 0 ? 0 : Math.min(startIndex + pageSize, totalItems);

    return {
      pageItems,
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      startItem,
      endItem,
    };
  }, [items, page, pageSize]);
};
