import { useEffect, useMemo, useState, RefObject } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import {
  ListPageHeader,
  Timestamp,
  consoleFetchJSON,
  useAccessReview,
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
import { CAPSULE, Tenant, TenantResource, TenantResourceFilters } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';

const { API_BASE, PROXY_BASE, TENANT_RESOURCES: TR, TENANTS } = CAPSULE;

const ALL_NS = '';
const ALL_TENANTS = '';

const TENANTS_URL = `${PROXY_BASE}/apis/${API_BASE}/${TENANTS.API_VERSION}/${TENANTS.API_KIND}`;

function nsUrl(tenant: string): string {
  if (tenant) {
    return `${PROXY_BASE}/api/v1/namespaces?labelSelector=${encodeURIComponent(`capsule.clastix.io/tenant=${tenant}`)}`;
  }
  return `${PROXY_BASE}/api/v1/namespaces`;
}

function apiUrl(namespace: string, tenant: string): string {
  const labelSelector = tenant
    ? `?labelSelector=${encodeURIComponent(`capsule.clastix.io/managed-by=${tenant}`)}`
    : '';
  if (!namespace) {
    return `${PROXY_BASE}/apis/${API_BASE}/${TR.API_VERSION}/${TR.API_KIND}${labelSelector}`;
  }
  return `${PROXY_BASE}/apis/${API_BASE}/${TR.API_VERSION}/namespaces/${namespace}/${TR.API_KIND}${labelSelector}`;
}

function detailUrl(namespace: string, name: string): string {
  return `/k8s/ns/${namespace}/${API_BASE}~${TR.API_VERSION}~${TR.API_KIND_SINGLE}/${name}`;
}

function createUrl(namespace: string): string {
  if (!namespace) {
    return `/k8s/all-namespaces/${API_BASE}~${TR.API_VERSION}~${TR.API_KIND_SINGLE}/~new`;
  }
  return `/k8s/ns/${namespace}/${API_BASE}~${TR.API_VERSION}~${TR.API_KIND_SINGLE}/~new`;
}

const COLUMN_KEYS = ['name', 'namespace', 'resources', 'processedItems', 'created'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const getSortValue = (item: TenantResource, key: ColumnKey): string | number => {
  switch (key) {
    case 'name':
      return item.metadata.name;
    case 'namespace':
      return item.metadata.namespace ?? '';
    case 'resources':
      return item.spec.resources?.length ?? 0;
    case 'processedItems':
      return item.status?.processedItems?.length ?? 0;
    case 'created':
      return item.metadata.creationTimestamp;
    default:
      return '';
  }
};

export default function TenantResourcePage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const navigate = useNavigate();

  const [selectedTenant, setSelectedTenant] = useState(ALL_TENANTS);
  const [tenantSelectOpen, setTenantSelectOpen] = useState(false);
  const [tenants, setTenants] = useState<string[]>([]);

  const [selectedNamespace, setSelectedNamespace] = useState(ALL_NS);
  const [nsSelectOpen, setNsSelectOpen] = useState(false);
  const [namespaces, setNamespaces] = useState<string[]>([]);

  const [items, setItems] = useState<TenantResource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [canCreate] = useAccessReview({
    group: API_BASE,
    resource: TR.API_KIND,
    namespace: selectedNamespace,
    verb: 'create',
  });

  useEffect(() => {
    consoleFetchJSON(TENANTS_URL)
      .then((data: { items: Tenant[] }) => {
        setTenants((data.items ?? []).map((tenant) => tenant.metadata.name));
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    setSelectedNamespace(ALL_NS);
    consoleFetchJSON(nsUrl(selectedTenant))
      .then((data: { items: V1NamespaceString[] }) => {
        setNamespaces((data.items ?? []).map((ns) => ns.metadata.name));
      })
      .catch(() => setNamespaces([]));
  }, [selectedTenant]);

  useEffect(() => {
    setLoaded(false);
    setLoadError(null);
    consoleFetchJSON(apiUrl(selectedNamespace, selectedTenant))
      .then((data: { items: TenantResource[] }) => {
        setItems(data.items ?? []);
        setLoaded(true);
      })
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch TenantResources'));
        setLoaded(true);
      });
  }, [selectedNamespace, selectedTenant, t]);

  const { filters, onSetFilters } = useDataViewFilters<TenantResourceFilters>({
    initialFilters: { name: '' },
  });

  const {
    onSort: dvOnSort,
    sortBy: sortByKey,
    direction,
  } = useDataViewSort({ initialSort: { sortBy: 'name', direction: 'asc' } });

  const { page, perPage, onSetPage, onPerPageSelect } = useDataViewPagination({ perPage: 20 });

  const filtered = useMemo(
    () =>
      filters.name
        ? items.filter((item) =>
            item.metadata.name.toLowerCase().includes(filters.name.toLowerCase()),
          )
        : items,
    [items, filters.name],
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
    namespace: t('Namespace'),
    resources: t('Resources'),
    processedItems: t('Processed items'),
    created: t('Created'),
  };

  const columns: DataViewTh[] = COLUMN_KEYS.map((key, idx) => ({
    cell: columnLabels[key],
    props: { sort: { sortBy: pfSortBy, onSort: pfOnSort, columnIndex: idx } },
  }));

  const rows: DataViewTr[] = paginated.map((item) => [
    <Button
      key="name"
      variant="link"
      isInline
      onClick={() => navigate(detailUrl(item.metadata.namespace ?? '', item.metadata.name))}
    >
      {item.metadata.name}
    </Button>,
    item.metadata.namespace ?? '—',
    String(item.spec.resources?.length ?? 0),
    String(item.status?.processedItems?.length ?? 0),
    <Timestamp key="ts" timestamp={item.metadata.creationTimestamp} />,
  ]);

  const activeState = !loaded ? DataViewState.loading : loadError ? DataViewState.error : undefined;

  const tenantToggle = (toggleRef: RefObject<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => setTenantSelectOpen((o) => !o)}
      isExpanded={tenantSelectOpen}
    >
      {selectedTenant ? `${t('Tenant')}: ${selectedTenant}` : t('All tenants')}
    </MenuToggle>
  );

  const nsToggle = (toggleRef: RefObject<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => setNsSelectOpen((o) => !o)}
      isExpanded={nsSelectOpen}
    >
      {selectedNamespace ? `${t('Namespace')}: ${selectedNamespace}` : t('All namespaces')}
    </MenuToggle>
  );

  return (
    <>
      <DocumentTitle>{t('Tenant Resources')}</DocumentTitle>
      <ListPageHeader title={t('Tenant Resources')}>
        {canCreate && (
          <Button variant="primary" onClick={() => navigate(createUrl(selectedNamespace))}>
            {t('Create TenantResource')}
          </Button>
        )}
      </ListPageHeader>
      <DataView activeState={activeState}>
        <DataViewToolbar
          filters={
            <>
              <ToolbarItem>
                <Select
                  isOpen={tenantSelectOpen}
                  selected={selectedTenant}
                  onSelect={(_e, val) => {
                    setSelectedTenant(val === '' ? ALL_TENANTS : String(val));
                    setTenantSelectOpen(false);
                  }}
                  onOpenChange={setTenantSelectOpen}
                  toggle={tenantToggle}
                  shouldFocusToggleOnSelect
                >
                  <SelectList>
                    <SelectOption value="" isSelected={!selectedTenant}>
                      {t('All tenants')}
                    </SelectOption>
                    {tenants.map((tenant) => (
                      <SelectOption key={tenant} value={tenant} isSelected={tenant === selectedTenant}>
                        {tenant}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
              </ToolbarItem>
              <ToolbarItem>
                <Select
                  isOpen={nsSelectOpen}
                  selected={selectedNamespace}
                  onSelect={(_e, val) => {
                    setSelectedNamespace(val === '' ? ALL_NS : String(val));
                    setNsSelectOpen(false);
                  }}
                  onOpenChange={setNsSelectOpen}
                  toggle={nsToggle}
                  shouldFocusToggleOnSelect
                >
                  <SelectList>
                    <SelectOption value="" isSelected={!selectedNamespace}>
                      {t('All namespaces')}
                    </SelectOption>
                    {namespaces.map((ns) => (
                      <SelectOption key={ns} value={ns} isSelected={ns === selectedNamespace}>
                        {ns}
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
            [DataViewState.loading]: <Spinner aria-label={t('Loading TenantResources')} />,
            [DataViewState.error]: <>{loadError}</>,
          }}
        />
      </DataView>
    </>
  );
}
