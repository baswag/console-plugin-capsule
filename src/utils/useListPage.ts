import { useMemo } from 'react';
import type { ISortBy, OnSort } from '@patternfly/react-table';
import {
  useDataViewFilters,
  useDataViewPagination,
  useDataViewSort,
} from '@patternfly/react-data-view';

export function useNameFilter<T extends { metadata: { name: string } }>(items: T[]) {
  const { filters, onSetFilters } = useDataViewFilters<{ name: string }>({
    initialFilters: { name: '' },
  });

  const filtered = useMemo(
    () =>
      filters.name
        ? items.filter((item) =>
            item.metadata.name.toLowerCase().includes(filters.name.toLowerCase()),
          )
        : items,
    [items, filters.name],
  );

  return { filtered, filters, onSetFilters };
}

export function useSortedPaginated<T, K extends string>(
  filteredItems: T[],
  columnKeys: readonly K[],
  getSortValue: (item: T, key: K) => string | number,
  unsortable?: readonly K[],
) {
  const {
    onSort: dvOnSort,
    sortBy: sortByKey,
    direction,
  } = useDataViewSort({ initialSort: { sortBy: columnKeys[0], direction: 'asc' } });

  const { page, perPage, onSetPage, onPerPageSelect } = useDataViewPagination({ perPage: 20 });

  const sortIdx = columnKeys.indexOf(sortByKey as K);
  const pfSortBy: ISortBy = { index: sortIdx >= 0 ? sortIdx : 0, direction };
  const pfOnSort: OnSort = (_event, colIdx, sortDir) => {
    dvOnSort(undefined, columnKeys[colIdx], sortDir);
  };

  const sorted = useMemo(() => {
    const key = sortByKey as K;
    if (!key || unsortable?.includes(key)) return filteredItems;
    return [...filteredItems].sort((a, b) => {
      const av = getSortValue(a, key);
      const bv = getSortValue(b, key);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return direction === 'desc' ? -cmp : cmp;
    });
    // getSortValue and unsortable are module-level constants in all callers — stable refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems, sortByKey, direction]);

  const paginated = useMemo(
    () => sorted.slice((page - 1) * perPage, page * perPage),
    [sorted, page, perPage],
  );

  const buildColumns = (labels: Record<K, string>) =>
    columnKeys.map((key, idx) =>
      unsortable?.includes(key)
        ? labels[key]
        : {
            cell: labels[key],
            props: { sort: { sortBy: pfSortBy, onSort: pfOnSort, columnIndex: idx } },
          },
    );

  return { sorted, paginated, page, perPage, onSetPage, onPerPageSelect, buildColumns };
}
