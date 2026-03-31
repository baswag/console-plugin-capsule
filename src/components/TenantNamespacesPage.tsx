import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom-v5-compat';
import {
  DocumentTitle,
  ListPageHeader,
  Timestamp,
  consoleFetchJSON,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  MenuToggle,
  Pagination,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  ToolbarItem,
} from '@patternfly/react-core';
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
import { DataViewFilters } from '@patternfly/react-data-view/dist/esm/DataViewFilters';

const PROXY_BASE = '/api/proxy/plugin/console-plugin-capsule/capsule';
const TENANTS_URL = `${PROXY_BASE}/apis/capsule.clastix.io/v1beta2/tenants`;

interface Tenant {
  metadata: { name: string };
}

interface Namespace {
  metadata: {
    name: string;
    creationTimestamp: string;
  };
  status?: {
    phase?: string;
  };
}

interface NamespaceFilters {
  name: string;
}

const COLUMN_KEYS = ['name', 'status', 'created'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const getSortValue = (ns: Namespace, key: ColumnKey): string => {
  switch (key) {
    case 'name':
      return ns.metadata.name;
    case 'status':
      return ns.status?.phase ?? '';
    case 'created':
      return ns.metadata.creationTimestamp;
  }
};

export default function TenantNamespacesPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const location = useLocation();
  const navigate = useNavigate();

  const queryTenant = new URLSearchParams(location.search).get('tenant') ?? '';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState(queryTenant);
  const [tenantSelectOpen, setTenantSelectOpen] = useState(false);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch tenant list for the dropdown
  useEffect(() => {
    consoleFetchJSON(TENANTS_URL)
      .then((data: { items: Tenant[] }) => setTenants(data.items ?? []))
      .catch(() => setTenants([]));
  }, []);

  // Select first tenant automatically when list loads
  useEffect(() => {
    if (!selectedTenant && tenants.length > 0) {
      const first = tenants[0].metadata.name;
      setSelectedTenant(first);
      navigate(`${location.pathname}?tenant=${first}`, { replace: true });
    }
  }, [tenants, selectedTenant, navigate, location.pathname]);

  // Fetch namespaces for selected tenant
  useEffect(() => {
    if (!selectedTenant) return;
    setLoaded(false);
    setLoadError(null);
    const url = `${PROXY_BASE}/api/v1/namespaces?labelSelector=${encodeURIComponent(`capsule.clastix.io/tenant=${selectedTenant}`)}`;
    consoleFetchJSON(url)
      .then((data: { items: Namespace[] }) => {
        setNamespaces(data.items ?? []);
        setLoaded(true);
      })
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch namespaces'));
        setLoaded(true);
      });
  }, [selectedTenant, t]);

  const onTenantSelect = (_: React.MouseEvent | undefined, value: string | number | undefined) => {
    const name = String(value);
    setSelectedTenant(name);
    setTenantSelectOpen(false);
    navigate(`${location.pathname}?tenant=${name}`);
    setLoaded(false);
  };

  const { filters, onSetFilters } = useDataViewFilters<NamespaceFilters>({
    initialFilters: { name: '' },
  });

  const { onSort: dvOnSort, sortBy: sortByKey, direction } = useDataViewSort({
    initialSort: { sortBy: 'name', direction: 'asc' },
  });

  const { page, perPage, onSetPage, onPerPageSelect } = useDataViewPagination({ perPage: 20 });

  const filtered = useMemo(
    () =>
      filters.name
        ? namespaces.filter((ns) =>
            ns.metadata.name.toLowerCase().includes(filters.name.toLowerCase()),
          )
        : namespaces,
    [namespaces, filters.name],
  );

  const sortIdx = COLUMN_KEYS.indexOf(sortByKey as ColumnKey);
  const pfSortBy: ISortBy = { index: sortIdx >= 0 ? sortIdx : 0, direction };

  const pfOnSort: OnSort = (_event, colIdx, sortDir) => {
    dvOnSort(undefined, COLUMN_KEYS[colIdx], sortDir);
  };

  const sorted = useMemo(() => {
    const key = sortByKey as ColumnKey;
    if (!key) return filtered;
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
    status: t('Status'),
    created: t('Created'),
  };

  const columns: DataViewTh[] = COLUMN_KEYS.map((key, idx) => ({
    cell: columnLabels[key],
    props: { sort: { sortBy: pfSortBy, onSort: pfOnSort, columnIndex: idx } },
  }));

  const rows: DataViewTr[] = paginated.map((ns) => [
    ns.metadata.name,
    ns.status?.phase ?? '—',
    <Timestamp key="ts" timestamp={ns.metadata.creationTimestamp} />,
  ]);

  const activeState = !loaded
    ? DataViewState.loading
    : loadError
      ? DataViewState.error
      : undefined;

  const tenantToggle = (toggleRef: React.RefObject<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => setTenantSelectOpen((o) => !o)}
      isExpanded={tenantSelectOpen}
    >
      {t('Tenant')}: {selectedTenant || t('Select tenant')}
    </MenuToggle>
  );

  return (
    <>
      <DocumentTitle>{t('Tenant Namespaces')}</DocumentTitle>
      <ListPageHeader title={t('Tenant Namespaces')} />
      <DataView activeState={activeState}>
        <DataViewToolbar
          filters={
            <>
              <ToolbarItem>
                <Select
                  isOpen={tenantSelectOpen}
                  selected={selectedTenant}
                  onSelect={onTenantSelect}
                  onOpenChange={setTenantSelectOpen}
                  toggle={tenantToggle}
                  shouldFocusToggleOnSelect
                >
                  <SelectList>
                    {tenants.map((tenant) => (
                      <SelectOption
                        key={tenant.metadata.name}
                        value={tenant.metadata.name}
                        isSelected={tenant.metadata.name === selectedTenant}
                      >
                        {tenant.metadata.name}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
              </ToolbarItem>
              <DataViewFilters<NamespaceFilters>
                onChange={(_key: string, newValues: Partial<NamespaceFilters>) =>
                  onSetFilters(newValues)
                }
                values={filters}
              >
                <DataViewTextFilter
                  filterId="name"
                  title={t('Name')}
                  value={filters.name}
                  onChange={(_e, val) => onSetFilters({ name: val })}
                />
              </DataViewFilters>
            </>
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
            [DataViewState.loading]: <Spinner aria-label={t('Loading namespaces')} />,
            [DataViewState.error]: <>{loadError}</>,
          }}
        />
      </DataView>
    </>
  );
}
