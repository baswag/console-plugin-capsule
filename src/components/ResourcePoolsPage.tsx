import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { ListPageHeader, Timestamp, useAccessReview } from '@openshift-console/dynamic-plugin-sdk';
import DocumentTitle from '../utils/DocumentTitle';
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
import { SyncAltIcon } from '@patternfly/react-icons';
import type { DataViewTr } from '@patternfly/react-data-view';
import {
  DataView,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import type { ResourcePool, Tenant } from '../utils/capsule';
import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import CreateResourcePoolClaimModal from './CreateResourcePoolClaimModal';
import { useNameFilter, useSortedPaginated } from '../utils/useListPage';

const COLUMN_KEYS = ['name', 'tenant', 'used', 'created'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
const UNSORTABLE: ColumnKey[] = ['used'];

const getSortValue = (pool: ResourcePool, key: ColumnKey): string => {
  switch (key) {
    case 'name':
      return pool.metadata.name;
    case 'tenant':
      return pool.metadata.labels?.['capsule.clastix.io/tenant'] ?? '';
    case 'created':
      return pool.metadata.creationTimestamp;
    default:
      return '';
  }
};

export default function ResourcePoolsPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const navigate = useNavigate();

  const tenantApi = new CapsuleClient<Tenant>(CAPSULE_APIS.TENANTS);

  const resourcePoolsApi = new CapsuleClient<ResourcePool>(CAPSULE_APIS.RESOURCE_POOLS);

  const [selectedTenant, setSelectedTenant] = useState('');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantSelectOpen, setTenantSelectOpen] = useState(false);
  const [pools, setPools] = useState<ResourcePool[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimModalPool, setClaimModalPool] = useState<ResourcePool | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [canCreatePool] = useAccessReview({
    group: CAPSULE_APIS.RESOURCE_POOLS.apiGroup,
    resource: CAPSULE_APIS.RESOURCE_POOLS.apiKind,
    verb: 'create',
  });
  const [canCreateClaim] = useAccessReview({
    group: CAPSULE_APIS.RESOURCE_POOL_CLAIMS.apiGroup,
    resource: CAPSULE_APIS.RESOURCE_POOL_CLAIMS.apiKind,
    verb: 'create',
  });

  useEffect(() => {
    tenantApi
      .fetch()
      .then((data) => {
        setTenants(data.items ?? []);
      })
      .catch(() => {
        setTenants([]);
      });
  }, []);

  useEffect(() => {
    setLoaded(false);
    setLoadError(null);
    resourcePoolsApi
      .fetch(
        selectedTenant
          ? { labelSelector: { 'capsule.clastix.io/tenant': selectedTenant } }
          : undefined,
      )
      .then((data) => {
        setPools(data.items ?? []);
        setLoaded(true);
      })
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch resource pools'));
        setLoaded(true);
      });
  }, [selectedTenant, t, refreshToken]);

  const { filtered, filters, onSetFilters } = useNameFilter(pools);
  const { sorted, paginated, page, perPage, onSetPage, onPerPageSelect, buildColumns } =
    useSortedPaginated(filtered, COLUMN_KEYS, getSortValue, UNSORTABLE);

  const columnLabels: Record<ColumnKey, string> = {
    name: t('Name'),
    tenant: t('Tenant'),
    used: t('Used'),
    created: t('Created'),
  };

  const columns = buildColumns(columnLabels);

  const formatQuantity = (q: Record<string, string> | undefined) => {
    if (!q) return '—';
    return Object.entries(q)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  };

  const rows: DataViewTr[] = paginated.map((pool) => {
    const tenant = pool.metadata.labels?.['capsule.clastix.io/tenant'] ?? '';
    return [
      <Button
        key="name"
        variant="link"
        isInline
        onClick={() => {
          navigate(`/capsule-resource-pools/${pool.metadata.name}`);
        }}
      >
        {pool.metadata.name}
      </Button>,
      tenant ? (
        <Label key="tenant" color="blue">
          {tenant}
        </Label>
      ) : (
        '—'
      ),
      formatQuantity(pool.status?.allocation?.used),
      <Timestamp key="ts" timestamp={pool.metadata.creationTimestamp} />,
      canCreateClaim ? (
        <Button
          key="claim"
          variant="secondary"
          size="sm"
          onClick={() => {
            setClaimModalPool(pool);
          }}
        >
          {t('Create Claim')}
        </Button>
      ) : null,
    ].filter(Boolean) as DataViewTr;
  });

  const activeState = !loaded
    ? DataViewState.loading
    : loadError
      ? DataViewState.error
      : filtered.length === 0
        ? DataViewState.empty
        : undefined;

  const tenantToggle = (toggleRef: RefObject<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => {
        setTenantSelectOpen((o) => !o);
      }}
      isExpanded={tenantSelectOpen}
    >
      {selectedTenant ? `${t('Tenant')}: ${selectedTenant}` : t('All tenants')}
    </MenuToggle>
  );

  return (
    <>
      <DocumentTitle>{t('Resource Pools')}</DocumentTitle>
      <ListPageHeader title={t('Resource Pools')}>
        <Button variant="plain" aria-label={t('Refresh')} onClick={() => setRefreshToken((n) => n + 1)}>
          <SyncAltIcon />
        </Button>
        {canCreatePool && (
          <Button
            variant="primary"
            onClick={() => {
              navigate(resourcePoolsApi.getCreateUrl());
            }}
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
                  onSelect={(_e, val) => {
                    setSelectedTenant(val === '' ? '' : String(val));
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
                onChange={(_e, val) => {
                  onSetFilters({ name: val });
                }}
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
            [DataViewState.loading]: <Spinner aria-label={t('Loading resource pools')} />,
            [DataViewState.error]: <>{loadError}</>,
            [DataViewState.empty]: <>{t('No resource pools found.')}</>,
          }}
        />
      </DataView>
      {claimModalPool && (
        <CreateResourcePoolClaimModal
          poolName={claimModalPool.metadata.name}
          poolHard={
            claimModalPool.status?.allocation?.available ??
            claimModalPool.status?.allocation?.hard ??
            claimModalPool.spec.hard ??
            {}
          }
          tenantName={claimModalPool.metadata.labels?.['capsule.clastix.io/tenant'] ?? ''}
          onClose={() => {
            setClaimModalPool(null);
          }}
          onCreated={() => {
            setClaimModalPool(null);
          }}
        />
      )}
    </>
  );
}
