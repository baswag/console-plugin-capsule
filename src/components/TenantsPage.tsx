import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import {
  ListPageHeader,
  Timestamp,
  consoleFetchJSON,
  useAccessReview,
} from '@openshift-console/dynamic-plugin-sdk';
import DocumentTitle from '../utils/DocumentTitle';
import { Button, Pagination, Spinner } from '@patternfly/react-core';
import { ISortBy, OnSort } from '@patternfly/react-table';
import {
  DataView,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
  DataViewTh,
  DataViewToolbar,
  DataViewTr,
  useDataViewFilters,
  useDataViewPagination,
  useDataViewSort,
} from '@patternfly/react-data-view';
import { useState } from 'react';
import {CAPSULE, Tenant, TenantFilters} from '../utils/capsule'

const TENANTS_URL = `${CAPSULE.PROXY_BASE}/apis/${CAPSULE.API_BASE}/${CAPSULE.TENANTS.API_VERSION}/${CAPSULE.TENANTS.API_KIND}`;

const COLUMN_KEYS = ['name', 'state', 'namespaceCount', 'owners', 'created'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
const UNSORTABLE: ColumnKey[] = ['owners'];

const getSortValue = (tenant: Tenant, key: ColumnKey): string | number => {
  switch (key) {
    case 'name':
      return tenant.metadata.name;
    case 'state':
      return tenant.status?.state ?? '';
    case 'namespaceCount':
      return tenant.status?.size ?? tenant.status?.namespaces?.length ?? 0;
    case 'created':
      return tenant.metadata.creationTimestamp;
    default:
      return '';
  }
};

export default function TenantsPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const navigate = useNavigate();

  const [canCreate] = useAccessReview({
    group: CAPSULE.API_BASE,
    resource: CAPSULE.TENANTS.API_KIND,
    verb: 'create',
  });

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    consoleFetchJSON(TENANTS_URL)
      .then((data: { items: Tenant[] }) => {
        setTenants(data.items ?? []);
        setLoaded(true);
      })
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch tenants'));
        setLoaded(true);
      });
  }, [t]);

  const { filters, onSetFilters } = useDataViewFilters<TenantFilters>({
    initialFilters: { name: '' },
  });

  const {
    onSort: dvOnSort,
    sortBy: sortByKey,
    direction,
  } = useDataViewSort({
    initialSort: { sortBy: 'name', direction: 'asc' },
  });

  const { page, perPage, onSetPage, onPerPageSelect } = useDataViewPagination({ perPage: 20 });

  const filtered = useMemo(
    () =>
      filters.name
        ? tenants.filter((t) => t.metadata.name.toLowerCase().includes(filters.name.toLowerCase()))
        : tenants,
    [tenants, filters.name],
  );

  const sortIdx = COLUMN_KEYS.indexOf(sortByKey as ColumnKey);
  const pfSortBy: ISortBy = { index: sortIdx >= 0 ? sortIdx : 0, direction };

  const pfOnSort: OnSort = (_event, colIdx, sortDir) => {
    dvOnSort(undefined, COLUMN_KEYS[colIdx], sortDir);
  };

  const sorted = useMemo(() => {
    const key = sortByKey as ColumnKey;
    if (!key || UNSORTABLE.includes(key)) return filtered;
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, key);
      const bv = getSortValue(b, key);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return direction === 'desc' ? -cmp : cmp;
    });
  }, [filtered, sortByKey, direction]);

  const paginated = useMemo(
    () => sorted.slice((page - 1) * perPage, page * perPage),
    [sorted, page, perPage],
  );

  const columnLabels: Record<ColumnKey, string> = {
    name: t('Name'),
    state: t('State'),
    namespaceCount: t('Namespace count'),
    owners: t('Owners'),
    created: t('Created'),
  };

  const columns: DataViewTh[] = COLUMN_KEYS.map((key, idx) =>
    UNSORTABLE.includes(key)
      ? columnLabels[key]
      : {
          cell: columnLabels[key],
          props: { sort: { sortBy: pfSortBy, onSort: pfOnSort, columnIndex: idx } },
        },
  );

  const rows: DataViewTr[] = paginated.map((tenant) => [
    <Button
      key="name"
      variant="link"
      isInline
      onClick={() => navigate(`/capsule-namespaces?tenant=${tenant.metadata.name}`)}
    >
      {tenant.metadata.name}
    </Button>,
    tenant.status?.state ?? '—',
    String(tenant.status?.size ?? tenant.status?.namespaces?.length ?? 0),
    (tenant.spec.owners ?? []).map((o) => `${o.name} (${o.kind})`).join(', ') || '—',
    <Timestamp key="ts" timestamp={tenant.metadata.creationTimestamp} />,
  ]);

  const activeState = !loaded ? DataViewState.loading : loadError ? DataViewState.error : undefined;

  return (
    <>
      <DocumentTitle>{t('Capsule Tenants')}</DocumentTitle>
      <ListPageHeader title={t('Capsule Tenants')}>
        {canCreate && (
          <Button
            variant="primary"
            onClick={() => navigate(`/k8s/cluster/${CAPSULE.API_BASE}~${CAPSULE.TENANTS.API_VERSION}~${CAPSULE.TENANTS.API_KIND_SINGLE}/~new`)}
          >
            {t('Create Tenant')}
          </Button>
        )}
      </ListPageHeader>
      <DataView activeState={activeState}>
        <DataViewToolbar
          filters={
            
              <DataViewTextFilter
                filterId="name"
                title={t('Name')}
                value={filters.name}
                onChange={(_e, val) => onSetFilters({ name: val })}
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
          rows={rows}
          bodyStates={{
            [DataViewState.loading]: <Spinner aria-label={t('Loading tenants')} />,
            [DataViewState.error]: <>{loadError}</>,
          }}
        />
      </DataView>
    </>
  );
}
