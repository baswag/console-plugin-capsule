import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { ListPageHeader, Timestamp, useAccessReview } from '@openshift-console/dynamic-plugin-sdk';
import DocumentTitle from '../utils/DocumentTitle';
import { Button, Pagination, Spinner } from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import type { DataViewTr } from '@patternfly/react-data-view';
import {
  DataView,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import type { Tenant } from '../utils/capsule';
import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import { useNameFilter, useSortedPaginated } from '../utils/useListPage';

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

  const tenantApi = new CapsuleClient<Tenant>(CAPSULE_APIS.TENANTS);

  const navigate = useNavigate();

  const [canCreate] = useAccessReview({
    group: CAPSULE_APIS.TENANTS.apiGroup,
    resource: CAPSULE_APIS.TENANTS.apiKind,
    verb: 'create',
  });

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    setLoaded(false);
    setLoadError(null);
    tenantApi
      .fetch()
      .then((data) => {
        setTenants(data.items ?? []);
        setLoaded(true);
      })
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch tenants'));
        setLoaded(true);
      });
  }, [t, refreshToken]);

  const { filtered, filters, onSetFilters } = useNameFilter(tenants);
  const { sorted, paginated, page, perPage, onSetPage, onPerPageSelect, buildColumns } =
    useSortedPaginated(filtered, COLUMN_KEYS, getSortValue, UNSORTABLE);

  const columnLabels: Record<ColumnKey, string> = {
    name: t('Name'),
    state: t('State'),
    namespaceCount: t('Namespace count'),
    owners: t('Owners'),
    created: t('Created'),
  };

  const columns = buildColumns(columnLabels);

  const rows: DataViewTr[] = paginated.map((tenant) => [
    <Button
      key="name"
      variant="link"
      isInline
      onClick={() => {
        navigate(`/capsule-namespaces?tenant=${tenant.metadata.name}`);
      }}
    >
      {tenant.metadata.name}
    </Button>,
    tenant.status?.state ?? '—',
    String(tenant.status?.size ?? tenant.status?.namespaces?.length ?? 0),
    (tenant.spec.owners ?? []).map((o) => `${o.name} (${o.kind})`).join(', ') || '—',
    <Timestamp key="ts" timestamp={tenant.metadata.creationTimestamp} />,
  ]);

  const activeState = !loaded
    ? DataViewState.loading
    : loadError
      ? DataViewState.error
      : filtered.length === 0
        ? DataViewState.empty
        : undefined;

  return (
    <>
      <DocumentTitle>{t('Tenants')}</DocumentTitle>
      <ListPageHeader title={t('Tenants')}>
        <Button variant="plain" aria-label={t('Refresh')} onClick={() => setRefreshToken((n) => n + 1)}>
          <SyncAltIcon />
        </Button>
        {canCreate && (
          <Button
            variant="primary"
            onClick={() => {
              navigate(tenantApi.getCreateUrl());
            }}
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
          rows={rows}
          bodyStates={{
            [DataViewState.loading]: <Spinner aria-label={t('Loading tenants')} />,
            [DataViewState.error]: <>{loadError}</>,
            [DataViewState.empty]: <>{t('No tenants found.')}</>,
          }}
        />
      </DataView>
    </>
  );
}
