import type { MouseEvent, RefObject } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom-v5-compat';
import { ListPageHeader, Timestamp, DocumentTitle } from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Button,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Pagination,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  ToolbarItem,
} from '@patternfly/react-core';
import CreateNamespaceModal from './CreateNamespaceModal';
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
import type { V1NamespaceString } from '../utils/k8s-types';
import { useNameFilter, useSortedPaginated } from '../utils/useListPage';
import { SyncAltIcon, TrashIcon } from '@patternfly/react-icons';

const COLUMN_KEYS = ['name', 'status', 'created'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

const getSortValue = (ns: V1NamespaceString, key: ColumnKey): string => {
  switch (key) {
    case 'name':
      return ns.metadata.name;
    case 'status':
      return ns.status?.phase ?? '';
    case 'created':
      return ns.metadata.creationTimestamp;
  }
};

const namespacesApiClient = new CapsuleClient<V1NamespaceString>({
  apiGroup: '',
  apiVersion: 'v1',
  apiKind: 'namespaces',
  apiKindSingle: 'Namespace',
});

function NamespaceDeleteTr({ ns, onDeleted }: { ns: V1NamespaceString; onDeleted: () => void }) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const [canDelete, setCanDelete] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    namespacesApiClient
      .authCanI({ verb: 'delete', name: ns.metadata?.name, namespace: ns.metadata?.name })
      .then(setCanDelete);
  }, [ns.metadata?.name]);

  const deleteNamespace = () => {
    setDeleting(true);
    setDeleteError(null);
    namespacesApiClient.fetch({ name: ns.metadata.name, method: 'DELETE' }).then(() => {
      setDeleteOpen(false);
      setDeleting(false);
      onDeleted();
    });
  };

  return (
    <>
      {canDelete && (
        <Button
          variant="plain"
          aria-label={t('Delete {{name}}', { name: ns.metadata.name })}
          onClick={() => {
            setDeleteOpen(true);
          }}
        >
          <TrashIcon />
        </Button>
      )}
      {deleteOpen && (
        <Modal isOpen onClose={() => setDeleteOpen(false)} variant="small">
          <ModalHeader title={t('Delete Namespace')} />
          <ModalBody>
            {deleteError && (
              <Alert variant="danger" title={t('Error')} isInline style={{ marginBottom: '1rem' }}>
                {deleteError}
              </Alert>
            )}
            {t('Are you sure you want to delete namespace {{name}}? This cannot be undone.', {
              name: ns.metadata.name,
            })}
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={deleteNamespace} isDisabled={deleting} isLoading={deleting}>
              {t('Delete')}
            </Button>
            <Button variant="link" onClick={() => setDeleteOpen(false)} isDisabled={deleting}>
              {t('Cancel')}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}

export default function TenantNamespacesPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const location = useLocation();
  const navigate = useNavigate();

  const namespacesApi = new CapsuleClient<V1NamespaceString>({
    apiGroup: '',
    apiVersion: 'v1',
    apiKind: 'namespaces',
    apiKindSingle: 'Namespace',
  });

  const tenantApi = new CapsuleClient<Tenant>(CAPSULE_APIS.TENANTS);

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
    if (!selectedTenant && tenants.length > 0) {
      const first = tenants[0].metadata.name;
      navigate(`${location.pathname}?tenant=${first}`, { replace: true });
    }
  }, [tenants, selectedTenant, navigate, location.pathname]);

  useEffect(() => {
    if (!pendingNamespace || !loaded) return;
    const found = fetchResult.namespaces.some((ns) => ns.metadata.name === pendingNamespace);
    const timer = found
      ? setTimeout(() => {
          setPendingNamespace(null);
        }, 0)
      : setTimeout(() => {
          setRefreshToken((n) => n + 1);
        }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [pendingNamespace, loaded, fetchResult.namespaces]);

  useEffect(() => {
    if (!fetchKey) return;
    namespacesApi
      .fetch({
        labelSelector: {
          'capsule.clastix.io/tenant': selectedTenant,
        },
      })
      .then((data) => {
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

  const { filtered, filters, onSetFilters } = useNameFilter(fetchResult.namespaces);
  const { sorted, paginated, page, perPage, onSetPage, onPerPageSelect, buildColumns } =
    useSortedPaginated(filtered, COLUMN_KEYS, getSortValue);

  const columnLabels: Record<ColumnKey, string> = {
    name: t('Name'),
    status: t('Status'),
    created: t('Created'),
  };

  const columns = buildColumns(columnLabels);

  const rows: DataViewTr[] = paginated.map((ns) => [
    <Button
      key="name"
      variant="link"
      isInline
      onClick={() => {
        navigate(`/capsule-namespaces/${ns.metadata.name}`);
      }}
    >
      {ns.metadata.name}
    </Button>,
    ns.status?.phase ?? '—',
    <Timestamp key="ts" timestamp={ns.metadata.creationTimestamp} />,
    <NamespaceDeleteTr
      ns={ns}
      onDeleted={() => {
        setRefreshToken((n) => n + 1);
      }}
    />,
  ]);

  const activeState = !loaded
    ? DataViewState.loading
    : fetchResult.loadError
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
      {t('Tenant')}: {selectedTenant || t('Select tenant')}
    </MenuToggle>
  );

  return (
    <>
      <DocumentTitle>{t('Tenant Namespaces')}</DocumentTitle>
      <ListPageHeader title={t('Tenant Namespaces')}>
        <Button variant="plain" aria-label={t('Refresh')} onClick={() => setRefreshToken((n) => n + 1)}>
          <SyncAltIcon />
        </Button>
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
          actions={
            <Button
              variant="primary"
              isDisabled={!selectedTenant}
              onClick={() => {
                setCreateModalOpen(true);
              }}
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
            [DataViewState.empty]: <>{t('No namespaces found.')}</>,
          }}
        />
      </DataView>
      {createModalOpen && (
        <CreateNamespaceModal
          tenant={selectedTenant}
          onClose={() => {
            setCreateModalOpen(false);
          }}
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
