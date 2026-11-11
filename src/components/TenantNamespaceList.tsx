import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom-v5-compat';
import { Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import {
  ActionList,
  ActionListGroup,
  ActionListItem,
  Alert,
  AlertActionCloseButton,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Pagination,
  Spinner,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Tooltip,
} from '@patternfly/react-core';
import { TrashIcon } from '@patternfly/react-icons';
import type { DataViewTr } from '@patternfly/react-data-view';
import {
  DataView,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
} from '@patternfly/react-data-view';
import CreateNamespaceModal from './CreateNamespaceModal';
import type { Tenant } from '../utils/capsule';
import { CapsuleClient } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';
import { useNameFilter, useSortedPaginated } from '../utils/useListPage';
import { usePluginConfig } from '../utils/pluginConfig';
import { CreateNamespaceActions } from '../addons/CreateNamespaceActions';
import './Gauges.css';

const MAX_PENDING_NAMESPACE_ATTEMPTS = 15;

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
      .authCanI({ verb: 'delete', name: ns.metadata.name, namespace: ns.metadata.name })
      .then(setCanDelete)
      .catch(() => {
        setCanDelete(false);
      });
  }, [ns.metadata.name]);

  const deleteNamespace = () => {
    setDeleting(true);
    setDeleteError(null);
    namespacesApiClient
      .fetch({ name: ns.metadata.name, method: 'DELETE' })
      .then(() => {
        setDeleteOpen(false);
        setDeleting(false);
        onDeleted();
      })
      .catch((e: unknown) => {
        setDeleteError(e instanceof Error ? e.message : t('Failed to delete namespace'));
        setDeleting(false);
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
        <Modal
          isOpen
          onClose={() => {
            setDeleteOpen(false);
          }}
          variant="small"
        >
          <ModalHeader title={t('Delete Namespace')} />
          <ModalBody>
            {deleteError && (
              <Alert
                variant="danger"
                title={t('Error')}
                isInline
                className="console-plugin-capsule__alert"
              >
                {deleteError}
              </Alert>
            )}
            {t('Are you sure you want to delete namespace {{name}}? This cannot be undone.', {
              name: ns.metadata.name,
            })}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="danger"
              onClick={deleteNamespace}
              isDisabled={deleting}
              isLoading={deleting}
            >
              {t('Delete')}
            </Button>
            <Button
              variant="link"
              onClick={() => {
                setDeleteOpen(false);
              }}
              isDisabled={deleting}
            >
              {t('Cancel')}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}

interface TenantNamespaceListProps {
  /** Tenant whose namespaces are listed; empty while none is selected. */
  tenantName: string;
  /** The tenant object, once loaded (needed for its prefix setting and addon create buttons). */
  tenant: Tenant | undefined;
  /** Bump to re-fetch the list (e.g. from a page-level refresh button). */
  refreshToken?: number;
  /** Extra toolbar items placed before the name filter (e.g. a tenant selector). */
  toolbarStart?: ReactNode;
  /** When set, the built-in "Create Namespace" button is disabled with this text as tooltip. */
  createDisabledReason?: string;
  /** Called after a namespace was created (once it shows up) or deleted. */
  onNamespacesChanged?: () => void;
}

/**
 * Filterable, sortable namespace table for one tenant, with the create buttons (built-in and
 * addon `createNamespace` widgets) and per-row delete. Shared by the Tenant Namespaces page and
 * the tenant overview page.
 */
export function TenantNamespaceList({
  tenantName,
  tenant,
  refreshToken = 0,
  toolbarStart,
  createDisabledReason,
  onNamespacesChanged,
}: TenantNamespaceListProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const navigate = useNavigate();
  const pluginConfig = usePluginConfig();

  const [fetchResult, setFetchResult] = useState<{
    fetchedFor: string;
    namespaces: V1NamespaceString[];
    loadError: string | null;
  }>({ fetchedFor: '', namespaces: [], loadError: null });
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [pendingNamespace, setPendingNamespace] = useState<string | null>(null);
  const [pendingNamespaceTimedOut, setPendingNamespaceTimedOut] = useState(false);
  const pendingAttemptsRef = useRef(0);

  const fetchKey = tenantName
    ? `${tenantName}:${String(refreshToken)}:${String(localRefresh)}`
    : '';
  const loaded = !fetchKey || fetchResult.fetchedFor === fetchKey;

  useEffect(() => {
    if (!pendingNamespace || !loaded) return;
    const found = fetchResult.namespaces.some((ns) => ns.metadata.name === pendingNamespace);
    if (found) {
      pendingAttemptsRef.current = 0;
      setPendingNamespace(null);
      onNamespacesChanged?.();
      return;
    }
    if (pendingAttemptsRef.current >= MAX_PENDING_NAMESPACE_ATTEMPTS) {
      pendingAttemptsRef.current = 0;
      setPendingNamespace(null);
      setPendingNamespaceTimedOut(true);
      return;
    }
    const timer = setTimeout(() => {
      pendingAttemptsRef.current += 1;
      setLocalRefresh((n) => n + 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [pendingNamespace, loaded, fetchResult.namespaces, onNamespacesChanged]);

  useEffect(() => {
    if (!fetchKey) return;
    namespacesApiClient
      .fetch({
        labelSelector: {
          'capsule.clastix.io/tenant': tenantName,
        },
      })
      .then((data) => {
        setFetchResult({ fetchedFor: fetchKey, namespaces: data.items, loadError: null });
      })
      .catch((e: unknown) => {
        setFetchResult({
          fetchedFor: fetchKey,
          namespaces: [],
          loadError: e instanceof Error ? e.message : t('Failed to fetch namespaces'),
        });
      });
  }, [fetchKey, tenantName, t]);

  const onNamespaceCreated = (name: string) => {
    setPendingNamespace(name);
    setLocalRefresh((n) => n + 1);
  };

  const { filtered, filters, onSetFilters } = useNameFilter(fetchResult.namespaces);
  const { sorted, paginated, page, perPage, onSetPage, onPerPageSelect, buildColumns } =
    useSortedPaginated(filtered, COLUMN_KEYS, getSortValue);

  const columns = buildColumns({
    name: t('Name'),
    status: t('Status'),
    created: t('Created'),
  });

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
      key="delete"
      ns={ns}
      onDeleted={() => {
        setLocalRefresh((n) => n + 1);
        onNamespacesChanged?.();
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

  const createButton = (
    <Button
      variant="primary"
      isAriaDisabled={!tenantName || !!createDisabledReason}
      onClick={() => {
        setCreateModalOpen(true);
      }}
      data-test="create-namespace"
    >
      {t('Create Namespace')}
    </Button>
  );

  return (
    <>
      {pendingNamespaceTimedOut && (
        <Alert
          variant="info"
          isInline
          title={t(
            'Namespace creation is taking longer than expected. It may still complete in the background.',
          )}
          className="console-plugin-capsule__alert"
          actionClose={
            <AlertActionCloseButton
              onClose={() => {
                setPendingNamespaceTimedOut(false);
              }}
            />
          }
        />
      )}
      <DataView activeState={activeState}>
        {/* A plain Toolbar rather than DataViewToolbar: the latter wraps `actions` in a
            ToolbarItem we can't align, and the create buttons belong on the right. */}
        <Toolbar>
          <ToolbarContent>
            {toolbarStart}
            <ToolbarItem>
              <DataViewTextFilter
                filterId="name"
                title={t('Name')}
                value={filters.name}
                onChange={(_e, val) => {
                  onSetFilters({ name: val });
                }}
              />
            </ToolbarItem>
            <ToolbarItem align={{ default: 'alignEnd' }}>
              <ActionList>
                <ActionListGroup>
                  {/* Addon buttons first, so the built-in "Create Namespace" is right-most. */}
                  <CreateNamespaceActions
                    tenant={tenant}
                    globalForceTenantPrefix={pluginConfig.forceTenantPrefix}
                    onCreated={onNamespaceCreated}
                  />
                  <ActionListItem>
                    {createDisabledReason ? (
                      <Tooltip content={createDisabledReason}>{createButton}</Tooltip>
                    ) : (
                      createButton
                    )}
                  </ActionListItem>
                </ActionListGroup>
              </ActionList>
            </ToolbarItem>
            <ToolbarItem
              variant="pagination"
              className="console-plugin-capsule__toolbar-pagination"
            >
              <Pagination
                itemCount={sorted.length}
                page={page}
                perPage={perPage}
                onSetPage={onSetPage}
                onPerPageSelect={onPerPageSelect}
                isCompact
              />
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
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
          tenant={tenantName}
          forceTenantPrefix={
            pluginConfig.forceTenantPrefix || (tenant?.spec.forceTenantPrefix ?? false)
          }
          onClose={() => {
            setCreateModalOpen(false);
          }}
          onCreated={(name) => {
            setCreateModalOpen(false);
            onNamespaceCreated(name);
          }}
        />
      )}
    </>
  );
}
