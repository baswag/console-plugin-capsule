import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import {
  ListPageHeader,
  Timestamp,
  useAccessReview,
  DocumentTitle,
} from '@openshift-console/dynamic-plugin-sdk';
import { Button, Label, LabelGroup, Pagination, Spinner } from '@patternfly/react-core';
import type { LabelProps } from '@patternfly/react-core';
import { CogIcon, SyncAltIcon, UserIcon, UsersIcon } from '@patternfly/react-icons';
import type { DataViewTr } from '@patternfly/react-data-view';
import {
  DataView,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import type { Tenant, TenantOwner } from '../utils/capsule';
import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import { tenantNamespaceCount } from '../utils/common';
import { useNameFilter, useSortedPaginated } from '../utils/useListPage';
import { AddonSlot } from '../addons/AddonSlot';
import { useAddonWidgets } from '../addons/registry';

// Fixed colour + icon per owner kind, so users, groups and service accounts are told apart
// at a glance without spelling the kind out next to every name.
const OWNER_KIND_STYLE: Record<string, { color: LabelProps['color']; icon: ReactNode }> = {
  User: { color: 'blue', icon: <UserIcon /> },
  Group: { color: 'purple', icon: <UsersIcon /> },
  ServiceAccount: { color: 'orange', icon: <CogIcon /> },
};

function OwnerLabels({ owners }: { owners: TenantOwner[] }) {
  if (owners.length === 0) return <>—</>;
  return (
    <LabelGroup numLabels={5}>
      {owners.map((o) => {
        const style = OWNER_KIND_STYLE[o.kind] ?? { color: 'grey' as const, icon: undefined };
        return (
          <Label
            key={`${o.kind}/${o.name}`}
            color={style.color}
            icon={style.icon}
            title={`${o.name} (${o.kind})`}
          >
            {o.name}
          </Label>
        );
      })}
    </LabelGroup>
  );
}

const COLUMN_KEYS = ['name', 'state', 'namespaceCount', 'owners', 'created'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number] | 'extensions';
// The "extensions" column is appended last (only when addons target tenant rows), so the
// indices of the regular columns, which sorting relies on, don't move.
const COLUMN_KEYS_WITH_EXTENSIONS: readonly ColumnKey[] = [...COLUMN_KEYS, 'extensions'];
const UNSORTABLE: ColumnKey[] = ['owners', 'extensions'];

const tenantApi = new CapsuleClient<Tenant>(CAPSULE_APIS.TENANTS);

const getSortValue = (tenant: Tenant, key: ColumnKey): string | number => {
  switch (key) {
    case 'name':
      return tenant.metadata.name;
    case 'state':
      return tenant.status?.state ?? '';
    case 'namespaceCount':
      return tenantNamespaceCount(tenant.status);
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
        setTenants(data.items);
        setLoaded(true);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : t('Failed to fetch tenants'));
        setLoaded(true);
      });
  }, [t, refreshToken]);

  const { widgets: addonWidgets } = useAddonWidgets('tenant.row');
  const hasExtensions = addonWidgets.length > 0;
  const onTenantUpdated = useCallback((updated: Tenant) => {
    setTenants((prev) =>
      prev.map((tn) => (tn.metadata.name === updated.metadata.name ? updated : tn)),
    );
  }, []);

  const { filtered, filters, onSetFilters } = useNameFilter(tenants);
  const { sorted, paginated, page, perPage, onSetPage, onPerPageSelect, buildColumns } =
    useSortedPaginated(
      filtered,
      hasExtensions ? COLUMN_KEYS_WITH_EXTENSIONS : COLUMN_KEYS,
      getSortValue,
      UNSORTABLE,
    );

  const columnLabels: Record<ColumnKey, string> = {
    name: t('Name'),
    state: t('State'),
    namespaceCount: t('Namespace count'),
    owners: t('Owners'),
    created: t('Created'),
    extensions: t('Extensions'),
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
    String(tenantNamespaceCount(tenant.status)),
    <OwnerLabels key="owners" owners={tenant.status?.owners ?? []} />,
    <Timestamp key="ts" timestamp={tenant.metadata.creationTimestamp} />,
    ...(hasExtensions
      ? [
          <AddonSlot
            key="extensions"
            slot="tenant.row"
            resource={tenant}
            widgets={addonWidgets}
            onUpdated={onTenantUpdated}
            compact
          />,
        ]
      : []),
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
        <Button
          variant="plain"
          aria-label={t('Refresh')}
          onClick={() => {
            setRefreshToken((n) => n + 1);
          }}
        >
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
