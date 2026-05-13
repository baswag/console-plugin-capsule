import { useEffect, useMemo, useState, MouseEvent, RefObject } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  DocumentTitle,
  ListPageHeader,
  Timestamp,
  consoleFetchJSON,
  useAccessReview,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  Button,
  Label,
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
import {
  CAPSULE,
  ResourcePool,
  ResourcePoolFilters,
  Tenant,
  getPoolTenant,
} from '../utils/capsule';
import CreateResourcePoolClaimModal from './CreateResourcePoolClaimModal';

const TENANTS_URL = `${CAPSULE.PROXY_BASE}/apis/${CAPSULE.API_BASE}/${CAPSULE.TENANTS.API_VERSION}/${CAPSULE.TENANTS.API_KIND}`;
const POOLS_URL = `${CAPSULE.PROXY_BASE}/apis/${CAPSULE.API_BASE}/${CAPSULE.RESOURCE_POOLS.API_VERSION}/${CAPSULE.RESOURCE_POOLS.API_KIND}`;

const COLUMN_KEYS = ['name', 'tenant', 'hard', 'used', 'created'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const getSortValue = (pool: ResourcePool, key: ColumnKey): string => {
  switch (key) {
    case 'name':
      return pool.metadata.name;
    case 'tenant':
      return getPoolTenant(pool);
    case 'created':
      return pool.metadata.creationTimestamp;
    default:
      return '';
  }
};

export default function ResourcePoolsPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const navigate = useNavigate();
  const location = useLocation();

  const selectedTenant = new URLSearchParams(location.search).get('tenant') ?? '';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantSelectOpen, setTenantSelectOpen] = useState(false);
  const [pools, setPools] = useState<ResourcePool[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimModalPool, setClaimModalPool] = useState<ResourcePool | null>(null);

  const [canCreatePool] = useAccessReview({
    group: CAPSULE.API_BASE,
    resource: CAPSULE.RESOURCE_POOLS.API_KIND,
    verb: 'create',
  });
  const [canCreateClaim] = useAccessReview({
    group: CAPSULE.API_BASE,
    resource: CAPSULE.RESOURCE_POOL_CLAIMS.API_KIND,
    verb: 'create',
  });

  useEffect(() => {
    consoleFetchJSON(TENANTS_URL)
      .then((data: { items: Tenant[] }) => setTenants(data.items ?? []))
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    consoleFetchJSON(POOLS_URL)
      .then((data: { items: ResourcePool[] }) => {
        setPools(data.items ?? []);
        setLoaded(true);
      })
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch resource pools'));
        setLoaded(true);
      });
  }, [t]);

  const onTenantSelect = (_: MouseEvent | undefined, value: string | number | undefined) => {
    const name = String(value);
    setTenantSelectOpen(false);
    navigate(`${location.pathname}?tenant=${name}`);
  };

  const visiblePools = useMemo(
    () =>
      selectedTenant ? pools.filter((p) => getPoolTenant(p) === selectedTenant) : pools,
    [pools, selectedTenant],
  );

  const { filters, onSetFilters } = useDataViewFilters<ResourcePoolFilters>({
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
        ? visiblePools.filter((p) =>
            p.metadata.name.toLowerCase().includes(filters.name.toLowerCase()),
          )
        : visiblePools,
    [visiblePools, filters.name],
  );

  const sortIdx = COLUMN_KEYS.indexOf(sortByKey as ColumnKey);
  const pfSortBy: ISortBy = { index: sortIdx >= 0 ? sortIdx : 0, direction };
  const pfOnSort: OnSort = (_event, colIdx, sortDir) => {
    dvOnSort(undefined, COLUMN_KEYS[colIdx], sortDir);
  };

  const sorted = useMemo(() => {
    const key = sortByKey as ColumnKey;
    if (!key || key === 'hard' || key === 'used') return filtered;
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
    tenant: t('Tenant'),
    hard: t('Hard Limits'),
    used: t('Used'),
    created: t('Created'),
  };

  const columns: DataViewTh[] = COLUMN_KEYS.map((key, idx) =>
    key === 'hard' || key === 'used'
      ? columnLabels[key]
      : {
          cell: columnLabels[key],
          props: { sort: { sortBy: pfSortBy, onSort: pfOnSort, columnIndex: idx } },
        },
  );

  const formatQuantity = (q: Record<string, string> | undefined) => {
    if (!q) return '—';
    return Object.entries(q)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  };

  const rows: DataViewTr[] = paginated.map((pool) => {
    const tenant = getPoolTenant(pool);
    return [
      <Button
        key="name"
        variant="link"
        isInline
        onClick={() => navigate(`/capsule-resource-pools/${pool.metadata.name}`)}
      >
        {pool.metadata.name}
      </Button>,
      tenant ? <Label key="tenant" color="blue">{tenant}</Label> : '—',
      formatQuantity(pool.spec.hard),
      formatQuantity(pool.status?.allocation?.used),
      <Timestamp key="ts" timestamp={pool.metadata.creationTimestamp} />,
      canCreateClaim ? (
        <Button
          key="claim"
          variant="secondary"
          size="sm"
          onClick={() => setClaimModalPool(pool)}
        >
          {t('Create Claim')}
        </Button>
      ) : null,
    ].filter(Boolean) as DataViewTr;
  });

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

  return (
    <>
      <DocumentTitle>{t('Resource Pools')}</DocumentTitle>
      <ListPageHeader title={t('Resource Pools')}>
        {canCreatePool && (
          <Button
            variant="primary"
            onClick={() =>
              navigate(
                `/k8s/cluster/${CAPSULE.API_BASE}~${CAPSULE.RESOURCE_POOLS.API_VERSION}~${CAPSULE.RESOURCE_POOLS.API_KIND_SINGLE}/~new`,
              )
            }
          >
            {t('Create Resource Pool')}
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
                  onSelect={onTenantSelect}
                  onOpenChange={setTenantSelectOpen}
                  toggle={tenantToggle}
                  shouldFocusToggleOnSelect
                >
                  <SelectList>
                    <SelectOption value="" isSelected={!selectedTenant}>
                      {t('All tenants')}
                    </SelectOption>
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
              <DataViewFilters<ResourcePoolFilters>
                onChange={(_key: string, newValues: Partial<ResourcePoolFilters>) =>
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
            [DataViewState.loading]: <Spinner aria-label={t('Loading resource pools')} />,
            [DataViewState.error]: <>{loadError}</>,
          }}
        />
      </DataView>
      {claimModalPool && (
        <CreateResourcePoolClaimModal
          poolName={claimModalPool.metadata.name}
          poolHard={claimModalPool.status?.allocation?.available ?? (claimModalPool.status?.allocation?.hard ?? claimModalPool.spec.hard ?? {})}
          tenantName={getPoolTenant(claimModalPool)}
          onClose={() => setClaimModalPool(null)}
          onCreated={() => setClaimModalPool(null)}
        />
      )}
    </>
  );
}
