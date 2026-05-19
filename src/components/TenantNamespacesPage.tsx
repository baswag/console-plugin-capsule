import { useEffect, useMemo, useState, MouseEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom-v5-compat';
import {
  ListPageHeader,
  ResourceLink,
  Timestamp,
  consoleFetchJSON,
} from '@openshift-console/dynamic-plugin-sdk';
import DocumentTitle from '../utils/DocumentTitle';
import {
  Button,
  MenuToggle,
  Pagination,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  ToolbarItem,
} from '@patternfly/react-core';
import CreateNamespaceModal from './CreateNamespaceModal';
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
import {CAPSULE, Tenant} from '../utils/capsule'
import type { V1NamespaceString } from '../utils/k8s-types';


const TENANTS_URL = `${CAPSULE.PROXY_BASE}/apis/${CAPSULE.API_BASE}/${CAPSULE.TENANTS.API_VERSION}/${CAPSULE.TENANTS.API_KIND}`;

interface NamespaceFilters {
  name: string;
}

const COLUMN_KEYS = ['name', 'status', 'created'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const getSortValue = (ns: V1NamespaceString, key: ColumnKey): string => {
  switch (key) {
    case 'name':
      return ns.metadata!.name!;
    case 'status':
      return ns.status?.phase ?? '';
    case 'created':
      return ns.metadata!.creationTimestamp;
  }
};

export default function TenantNamespacesPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const location = useLocation();
  const navigate = useNavigate();

  const selectedTenant = new URLSearchParams(location.search).get('tenant') ?? '';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantSelectOpen, setTenantSelectOpen] = useState(false);
  const [fetchResult, setFetchResult] = useState<{
    fetchedFor: string;
    namespaces: V1NamespaceString[];
    loadError: string | null;
  }>({ fetchedFor: '', namespaces: [], loadError: null });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [pendingNamespace, setPendingNamespace] = useState<string | null>(null);

  const fetchKey = selectedTenant ? `${selectedTenant}:${refreshToken}` : '';
  const loaded = !fetchKey || fetchResult.fetchedFor === fetchKey;

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
      navigate(`${location.pathname}?tenant=${first}`, { replace: true });
    }
  }, [tenants, selectedTenant, navigate, location.pathname]);

  useEffect(() => {
    if (!pendingNamespace || !loaded) return;
    const found = fetchResult.namespaces.some((ns) => ns.metadata.name === pendingNamespace);
    const timer = found
      ? setTimeout(() => setPendingNamespace(null), 0)
      : setTimeout(() => setRefreshToken((n) => n + 1), 1000);
    return () => clearTimeout(timer);
  }, [pendingNamespace, loaded, fetchResult.namespaces]);

  // Fetch namespaces for selected tenant
  useEffect(() => {
    if (!fetchKey) return;
    const url = `${CAPSULE.PROXY_BASE}/api/v1/namespaces?labelSelector=${encodeURIComponent(`capsule.clastix.io/tenant=${selectedTenant}`)}`;
    consoleFetchJSON(url)
      .then((data: { items: V1NamespaceString[] }) => {
        setFetchResult({ fetchedFor: fetchKey, namespaces: data.items ?? [], loadError: null });
      })
      .catch((e: Error) => {
        setFetchResult({
          fetchedFor: fetchKey,
          namespaces: [],
          loadError: e.message ?? t('Failed to fetch namespaces'),
        });
      });
  }, [fetchKey, selectedTenant, t]);

  const onTenantSelect = (_: MouseEvent | undefined, value: string | number | undefined) => {
    const name = String(value);
    setTenantSelectOpen(false);
    navigate(`${location.pathname}?tenant=${name}`);
  };

  const { filters, onSetFilters } = useDataViewFilters<NamespaceFilters>({
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
        ? fetchResult.namespaces.filter((ns) =>
            ns.metadata.name.toLowerCase().includes(filters.name.toLowerCase()),
          )
        : fetchResult.namespaces,
    [fetchResult.namespaces, filters.name],
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
    <ResourceLink
      key="name"
      groupVersionKind={{ group: 'project.openshift.io', version: 'v1', kind: 'Project' }}
      name={ns.metadata.name}
    />,
    ns.status?.phase ?? '—',
    <Timestamp key="ts" timestamp={ns.metadata.creationTimestamp} />,
  ]);

  const activeState = !loaded
    ? DataViewState.loading
    : fetchResult.loadError
      ? DataViewState.error
      : undefined;

  const tenantToggle = (toggleRef: RefObject<HTMLButtonElement>) => (
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
              
                <DataViewTextFilter
                  filterId="name"
                  title={t('Name')}
                  value={filters.name}
                  onChange={(_e, val) => onSetFilters({ name: val })}
                />
              
            </>
          }
          actions={
            <Button
              variant="primary"
              isDisabled={!selectedTenant}
              onClick={() => setCreateModalOpen(true)}
            >
              {t('Create Namespace')}
            </Button>
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
            [DataViewState.error]: <>{fetchResult.loadError}</>,
          }}
        />
      </DataView>
      {createModalOpen && (
        <CreateNamespaceModal
          tenant={selectedTenant}
          onClose={() => setCreateModalOpen(false)}
          onCreated={(name) => {
            setCreateModalOpen(false);
            setPendingNamespace(name);
            setRefreshToken((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
