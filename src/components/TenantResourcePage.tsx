import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { ListPageHeader, Timestamp, useAccessReview, DocumentTitle } from '@openshift-console/dynamic-plugin-sdk';
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
import type { DataViewTr } from '@patternfly/react-data-view';
import {
  DataView,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import { SyncAltIcon } from '@patternfly/react-icons';
import type { Tenant, TenantResource } from '../utils/capsule';
import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';
import { useNameFilter, useSortedPaginated } from '../utils/useListPage';

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

  const namespacesApi = new CapsuleClient<V1NamespaceString>({
    apiGroup: '',
    apiVersion: 'v1',
    apiKind: 'namespaces',
    apiKindSingle: 'Namespace',
  });

  const tenantApi = new CapsuleClient<Tenant>(CAPSULE_APIS.TENANTS);

  const tenantResourceApi = new CapsuleClient<TenantResource>(CAPSULE_APIS.TENANT_RESOURCES);

  const [selectedTenant, setSelectedTenant] = useState('');
  const [tenantSelectOpen, setTenantSelectOpen] = useState(false);
  const [tenants, setTenants] = useState<string[]>([]);

  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [nsSelectOpen, setNsSelectOpen] = useState(false);
  const [namespaces, setNamespaces] = useState<string[]>([]);

  const [items, setItems] = useState<TenantResource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [canCreate] = useAccessReview({
    group: CAPSULE_APIS.TENANT_RESOURCES.apiGroup,
    resource: CAPSULE_APIS.TENANT_RESOURCES.apiKind,
    namespace: selectedNamespace,
    verb: 'create',
  });

  useEffect(() => {
    tenantApi
      .fetch()
      .then((data) => {
        setTenants((data.items ?? []).map((tenant) => tenant.metadata.name));
      })
      .catch(() => {
        setTenants([]);
      });
  }, []);

  useEffect(() => {
    setSelectedNamespace('');
    namespacesApi
      .fetch({ labelSelector: { 'capsule.clastix.io/tenant': selectedTenant } })
      .then((data) => {
        setNamespaces((data.items ?? []).map((ns) => ns.metadata.name));
      })
      .catch(() => {
        setNamespaces([]);
      });
  }, [selectedTenant]);

  useEffect(() => {
    setLoaded(false);
    setLoadError(null);
    tenantResourceApi
      .fetch({
        namespace: selectedNamespace,
        labelSelector: { 'capsule.clastix.io/tenant': selectedTenant },
      })
      .then((data) => {
        setItems(data.items ?? []);
        setLoaded(true);
      })
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch TenantResources'));
        setLoaded(true);
      });
  }, [selectedNamespace, selectedTenant, t, refreshToken]);

  const { filtered, filters, onSetFilters } = useNameFilter(items);
  const { sorted, paginated, page, perPage, onSetPage, onPerPageSelect, buildColumns } =
    useSortedPaginated(filtered, COLUMN_KEYS, getSortValue);

  const columnLabels: Record<ColumnKey, string> = {
    name: t('Name'),
    namespace: t('Namespace'),
    resources: t('Resources'),
    processedItems: t('Processed items'),
    created: t('Created'),
  };

  const columns = buildColumns(columnLabels);

  const rows: DataViewTr[] = paginated.map((item) => [
    <Button
      key="name"
      variant="link"
      isInline
      onClick={() => {
        navigate(tenantResourceApi.getDetailUrl(item.metadata.name, item.metadata.namespace));
      }}
    >
      {item.metadata.name}
    </Button>,
    item.metadata.namespace ?? '—',
    String(item.spec.resources?.length ?? 0),
    String(item.status?.processedItems?.length ?? 0),
    <Timestamp key="ts" timestamp={item.metadata.creationTimestamp} />,
  ]);

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

  const nsToggle = (toggleRef: RefObject<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => {
        setNsSelectOpen((o) => !o);
      }}
      isExpanded={nsSelectOpen}
    >
      {selectedNamespace ? `${t('Namespace')}: ${selectedNamespace}` : t('All namespaces')}
    </MenuToggle>
  );

  return (
    <>
      <DocumentTitle>{t('Tenant Resources')}</DocumentTitle>
      <ListPageHeader title={t('Tenant Resources')}>
        <Button variant="plain" aria-label={t('Refresh')} onClick={() => setRefreshToken((n) => n + 1)}>
          <SyncAltIcon />
        </Button>
        {canCreate && selectedNamespace && (
          <Button
            variant="primary"
            onClick={() => {
              navigate(tenantResourceApi.getCreateUrl(selectedNamespace));
            }}
          >
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
                        key={tenant}
                        value={tenant}
                        isSelected={tenant === selectedTenant}
                      >
                        {tenant}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
              </ToolbarItem>
              {selectedTenant && (
                <ToolbarItem>
                  <Select
                    isOpen={nsSelectOpen}
                    selected={selectedNamespace}
                    onSelect={(_e, val) => {
                      setSelectedNamespace(val === '' ? '' : String(val));
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
              )}
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
            [DataViewState.loading]: <Spinner aria-label={t('Loading TenantResources')} />,
            [DataViewState.error]: <>{loadError}</>,
            [DataViewState.empty]: <>{t('No tenant resources found.')}</>,
          }}
        />
      </DataView>
    </>
  );
}
