import { useTranslation } from 'react-i18next';
import { ResourceLink } from '@openshift-console/dynamic-plugin-sdk';
import { Pagination } from '@patternfly/react-core';
import type { DataViewTr } from '@patternfly/react-data-view';
import {
  DataView,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import type { GlobalResourceQuota, ResourceQuantity } from '../utils/capsule';
import { formatQuantity } from '../utils/common';
import { useNameFilter, useSortedPaginated } from '../utils/useListPage';

interface NamespaceUsageRow {
  metadata: { name: string };
  used?: ResourceQuantity;
}

const COLUMN_KEYS = ['namespace', 'used'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
const UNSORTABLE: ColumnKey[] = ['used'];

const getSortValue = (row: NamespaceUsageRow, key: ColumnKey): string => {
  switch (key) {
    case 'namespace':
      return row.metadata.name;
    default:
      return '';
  }
};

export function GlobalResourceQuotaNamespaceUsageTable({ grq }: { grq: GlobalResourceQuota }) {
  const { t } = useTranslation('plugin__console-plugin-capsule');

  const namespaceNames = Array.from(
    new Set([...(grq.status?.namespaces ?? []), ...Object.keys(grq.status?.namespaceUsage ?? {})]),
  );
  const rows: NamespaceUsageRow[] = namespaceNames.map((ns) => ({
    metadata: { name: ns },
    used: grq.status?.namespaceUsage?.[ns]?.used,
  }));

  const { filtered, filters, onSetFilters } = useNameFilter(rows);
  const { sorted, paginated, page, perPage, onSetPage, onPerPageSelect, buildColumns } =
    useSortedPaginated(filtered, COLUMN_KEYS, getSortValue, UNSORTABLE);

  const columnLabels: Record<ColumnKey, string> = {
    namespace: t('Namespace'),
    used: t('Used'),
  };

  const columns = buildColumns(columnLabels);

  const dataRows: DataViewTr[] = paginated.map((row) => [
    <ResourceLink
      key="namespace"
      groupVersionKind={{ group: 'project.openshift.io', version: 'v1', kind: 'Project' }}
      name={row.metadata.name}
    />,
    formatQuantity(row.used),
  ]);

  const activeState = filtered.length === 0 ? DataViewState.empty : undefined;

  return (
    <DataView activeState={activeState}>
      <DataViewToolbar
        filters={
          <DataViewTextFilter
            filterId="name"
            title={t('Namespace')}
            value={filters.name}
            onChange={(_e, val) => {
              onSetFilters({ name: val });
            }}
          />
        }
        pagination={
          <Pagination
            itemCount={sorted.length}
            page={page}
            perPage={perPage}
            onSetPage={onSetPage}
            onPerPageSelect={onPerPageSelect}
            isCompact
          />
        }
      />
      <DataViewTable
        columns={columns}
        rows={dataRows}
        bodyStates={{
          [DataViewState.empty]: <>{t('No namespaces currently match this quota.')}</>,
        }}
      />
    </DataView>
  );
}
