import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import { Alert, Button, Modal, Pagination, Spinner } from '@patternfly/react-core';
import { TrashIcon, PencilAltIcon } from '@patternfly/react-icons';
import type { ResourcePool, ResourcePoolClaim, ResourceQuantity } from '../utils/capsule';
import { addQuantity, CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import EditResourcePoolClaimModal from './EditResourcePoolClaimModal';
import type { DataViewTr } from '@patternfly/react-data-view';
import {
  DataView,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import { useNameFilter, useSortedPaginated } from '../utils/useListPage';

export function formatQuantity(q: ResourceQuantity | undefined): string {
  if (!q) return '—';
  return Object.entries(q)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

export function getClaimBoundStatus(claim: ResourcePoolClaim) {
  return claim.status?.conditions.find((x) => x.type === 'Bound')?.status ?? '-';
}

const COLUMN_KEYS = ['name', 'namespace', 'requested', 'status', 'created'] as const;
const UNSORTABLE: ColumnKey[] = ['requested', 'status'];
type ColumnKey = (typeof COLUMN_KEYS)[number];

const getSortValue = (claim: ResourcePoolClaim, key: ColumnKey): string => {
  switch (key) {
    case 'name':
      return claim.metadata.name;
    case 'created':
      return claim.metadata.creationTimestamp;
    case 'namespace':
      return claim.metadata.namespace!;
    default:
      return '';
  }
};

interface ResourcePoolClaimsTableProps {
  claims: ResourcePoolClaim[];
  claimsLoaded: boolean;
  claimsError: string | null;
  pool: ResourcePool | null;
  onRefresh: () => void;
  emptyMessage?: string;
}

export function ResourcePoolClaimsTable({
  claims,
  claimsLoaded,
  claimsError,
  pool,
  onRefresh,
  emptyMessage,
}: ResourcePoolClaimsTableProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const resourcePoolClaimsApi = new CapsuleClient<ResourcePoolClaim>(
    CAPSULE_APIS.RESOURCE_POOL_CLAIMS,
  );

  const [claimToDelete, setClaimToDelete] = useState<ResourcePoolClaim | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [claimToEdit, setClaimToEdit] = useState<ResourcePoolClaim | null>(null);

  const handleDeleteClaim = () => {
    if (!claimToDelete) return;
    const { namespace, name: claimName } = claimToDelete.metadata;
    setDeleting(true);
    setDeleteError(null);
    resourcePoolClaimsApi
      .fetch({ name: claimName, namespace, method: 'DELETE' })
      .then(() => {
        setClaimToDelete(null);
        setDeleting(false);
        onRefresh();
      })
      .catch((e: Error) => {
        setDeleteError(e.message ?? t('Failed to delete claim'));
        setDeleting(false);
      });
  };

  const hard = pool?.status?.allocation?.hard ?? pool?.spec.hard ?? {};
  const available = pool?.status?.allocation?.available;

  const { filtered, filters, onSetFilters } = useNameFilter(claims);
  const { sorted, paginated, page, perPage, onSetPage, onPerPageSelect, buildColumns } =
    useSortedPaginated(filtered, COLUMN_KEYS, getSortValue, UNSORTABLE);

  const activeState = !claimsLoaded
    ? DataViewState.loading
    : claimsError
      ? DataViewState.error
      : filtered.length === 0
        ? DataViewState.empty
        : undefined;

  const columnLabels: Record<ColumnKey, string> = {
    name: t('Name'),
    namespace: t('Namespace'),
    requested: t('Requested'),
    status: t('Bound'),
    created: t('Created'),
  };

  const columns = buildColumns(columnLabels);

  const rows: DataViewTr[] = paginated.map((claim) => [
    claim.metadata.name,
    claim.metadata.namespace,
    formatQuantity(claim.spec.claim),
    getClaimBoundStatus(claim),
    <Timestamp timestamp={claim.metadata.creationTimestamp} />,
    getClaimBoundStatus(claim) !== 'True' ? (
      <Button
        variant="plain"
        aria-label={t('Edit {{name}}', { name: claim.metadata.name })}
        onClick={() => setClaimToEdit(claim)}
      >
        <PencilAltIcon />
      </Button>
    ) : undefined,
    getClaimBoundStatus(claim) !== 'True' ? (
      <Button
        variant="plain"
        aria-label={t('Delete {{name}}', { name: claim.metadata.name })}
        onClick={() => {
          setDeleteError(null);
          setClaimToDelete(claim);
        }}
      >
        <TrashIcon />
      </Button>
    ) : undefined,
  ]);

  return (
    <>
      <DataView activeState={activeState}>
        <DataViewToolbar
          filters={
            <DataViewTextFilter
              filterId="name"
              title={t('Name')}
              value={filters.name}
              onChange={(_e, val) => onSetFilters({ name: val })}
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
            [DataViewState.loading]: <Spinner aria-label={t('Loading Resource Pool Claims')} />,
            [DataViewState.error]: <>{claimsError}</>,
            [DataViewState.empty]: <>{emptyMessage ?? t('No claims.')}</>,
          }}
        />
      </DataView>

      {claimToDelete && (
        <Modal
          isOpen
          onClose={() => setClaimToDelete(null)}
          variant="small"
          title={t('Delete ResourcePoolClaim?')}
          actions={[
            <Button
              key="delete"
              variant="danger"
              onClick={handleDeleteClaim}
              isDisabled={deleting}
              isLoading={deleting}
            >
              {t('Delete')}
            </Button>,
            <Button
              key="cancel"
              variant="link"
              onClick={() => setClaimToDelete(null)}
              isDisabled={deleting}
            >
              {t('Cancel')}
            </Button>,
          ]}
        >
          {deleteError && (
            <Alert variant="danger" title={t('Error')} isInline style={{ marginBottom: '1rem' }}>
              {deleteError}
            </Alert>
          )}
          {t('Are you sure you want to delete {{name}}? This cannot be undone.', {
            name: claimToDelete.metadata.name,
          })}
        </Modal>
      )}

      {claimToEdit &&
        pool &&
        (() => {
          const effectiveAvailable = available ?? hard;
          const claimEditMaxHard: ResourceQuantity = Object.fromEntries(
            Object.keys(effectiveAvailable).map((r) => [
              r,
              addQuantity(effectiveAvailable[r], claimToEdit.spec.claim[r]),
            ]),
          );
          return (
            <EditResourcePoolClaimModal
              claim={claimToEdit}
              poolHard={claimEditMaxHard}
              onClose={() => setClaimToEdit(null)}
              onEdited={() => {
                setClaimToEdit(null);
                onRefresh();
              }}
            />
          );
        })()}
    </>
  );
}
