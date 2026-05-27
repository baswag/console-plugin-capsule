import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { ListPageHeader, Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import DocumentTitle from '../utils/DocumentTitle';
import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
  Modal,
  PageSection,
  Pagination,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { TrashIcon } from '@patternfly/react-icons';
import {
  CAPSULE_APIS,
  CapsuleClient,
  ResourcePool,
  ResourcePoolClaim,
  ResourceQuantity,
} from '../utils/capsule';
import CreateResourcePoolClaimModal from './CreateResourcePoolClaimModal';
import './ResourcePoolDetailPage.css';
import { UsageGauge } from '../utils/common';
import {
  DataView,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
  DataViewToolbar,
  DataViewTr,
} from '@patternfly/react-data-view';
import { useNameFilter, useSortedPaginated } from '../utils/useListPage';

function formatQuantity(q: ResourceQuantity | undefined): string {
  if (!q) return '—';
  return Object.entries(q)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

const COLUMN_KEYS = ['name', 'namespace', 'requested', 'status', 'created'] as const;
const UNSORTABLE: ColumnKey[] = ['requested', 'status'];
type ColumnKey = (typeof COLUMN_KEYS)[number];

const getSortValue = (claim: ResourcePoolClaim, key: ColumnKey): string => {
  switch (key) {
    case 'name':
      return claim.metadata!.name!;
    case 'created':
      return claim.metadata!.creationTimestamp;
    case 'namespace':
      return claim.metadata!.namespace!;
    default:
      return '';
  }
};

export default function ResourcePoolDetailPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  const resourcePoolsApi = new CapsuleClient<ResourcePool>(CAPSULE_APIS.RESOURCE_POOLS);

  const resourcePoolClaimsApi = new CapsuleClient<ResourcePoolClaim>(
    CAPSULE_APIS.RESOURCE_POOL_CLAIMS,
  );

  const [pool, setPool] = useState<ResourcePool | null>(null);
  const [claims, setClaims] = useState<ResourcePoolClaim[]>([]);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [claimsLoaded, setClaimsLoaded] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const [claimToDelete, setClaimToDelete] = useState<ResourcePoolClaim | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        setRefreshToken((n) => n + 1);
      })
      .catch((e: Error) => {
        setDeleteError(e.message ?? t('Failed to delete claim'));
        setDeleting(false);
      });
  };

  useEffect(() => {
    if (!name) return;
    setPoolLoaded(false);
    resourcePoolsApi
      .fetch({ name })
      .then((data: ResourcePool) => {
        setPool(data);
        setPoolLoaded(true);
      })
      .catch((e: Error) => {
        setPoolError(e.message ?? t('Failed to fetch resource pool'));
        setPoolLoaded(true);
      });
  }, [name, t]);

  useEffect(() => {
    if (!name) return;
    setClaimsLoaded(false);
    resourcePoolClaimsApi
      .fetch()
      .then((data) => {
        const filtered = (data.items ?? []).filter((c) => c.spec.pool === name);
        setClaims(filtered);
        setClaimsLoaded(true);
      })
      .catch((e: Error) => {
        setClaimsError(e.message ?? t('Failed to fetch claims'));
        setClaimsLoaded(true);
      });
  }, [name, t, refreshToken]);

  const tenant = pool ? (pool.metadata.labels?.['capsule.clastix.io/tenant'] ?? '') : '';
  const hard = pool?.status?.allocation?.hard ?? pool?.spec.hard ?? {};
  const used = pool?.status?.allocation?.used ?? {};
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

  if (!poolLoaded) {
    return (
      <PageSection>
        <Spinner aria-label={t('Loading resource pool')} />
      </PageSection>
    );
  }

  if (poolError) {
    return (
      <PageSection>
        <Alert variant="danger" title={t('Error loading resource pool')} isInline>
          {poolError}
        </Alert>
      </PageSection>
    );
  }

  const columnLabels: Record<ColumnKey, string> = {
    name: t('Name'),
    namespace: t('Namespace'),
    requested: t('Requested'),
    status: t('Status'),
    created: t('Created'),
  };

  const columns = buildColumns(columnLabels);

  const rows: DataViewTr[] = paginated.map((claim) => [
    <Button
      variant="link"
      isInline
      onClick={() =>
        navigate(`/capsule-resource-pool-claims/${claim.metadata.namespace}/${claim.metadata.name}`)
      }
    >
      {claim.metadata.name}
    </Button>,
    claim.metadata.namespace,
    formatQuantity(claim.spec.claim),
    claim.status?.condition?.message ?? '—',
    <Timestamp timestamp={claim.metadata.creationTimestamp} />,
    <Button
      variant="plain"
      aria-label={t('Delete {{name}}', { name: claim.metadata.name })}
      onClick={() => {
        setDeleteError(null);
        setClaimToDelete(claim);
      }}
    >
      <TrashIcon />
    </Button>,
  ]);

  return (
    <>
      <DocumentTitle>{t('Resource Pool: {{name}}', { name })}</DocumentTitle>
      <ListPageHeader title={`${t('Resource Pool')}: ${name}`}>
        <Button variant="primary" onClick={() => setClaimModalOpen(true)}>
          {t('Create Claim')}
        </Button>
      </ListPageHeader>

      <PageSection>
        <Title headingLevel="h2" size="lg">
          {t('Resource Pool details')}
        </Title>

        <div className="console-plugin-capsule__gauges">
          {Object.keys(hard).map((resource) => (
            <UsageGauge
              key={resource}
              resource={resource}
              used={used[resource]}
              hard={hard[resource]}
            />
          ))}
          {Object.keys(hard).length === 0 && <span>{t('No resource limits defined.')}</span>}
        </div>

        <DescriptionList className="console-plugin-capsule__detail-meta" isHorizontal>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Name')}</DescriptionListTerm>
            <DescriptionListDescription>{name}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Tenant')}</DescriptionListTerm>
            <DescriptionListDescription>
              {tenant ? <Label color="blue">{tenant}</Label> : '—'}
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </PageSection>

      <PageSection className="console-plugin-capsule__claims-section">
        <Title headingLevel="h2" size="lg" style={{ marginBottom: '1rem' }}>
          {t('ResourcePoolClaims')}
        </Title>

        <DataView activeState={activeState}>
          <DataViewToolbar
            filters={
              <>
                <DataViewTextFilter
                  filterId="name"
                  title={t('Name')}
                  value={filters.name}
                  onChange={(_e, val) => onSetFilters({ name: val })}
                ></DataViewTextFilter>
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
              ></Pagination>
            }
          ></DataViewToolbar>
          <DataViewTable
            columns={columns}
            rows={rows}
            bodyStates={{
              [DataViewState.loading]: <Spinner aria-label={t('Loading Resource Pool Claims')} />,
              [DataViewState.error]: <>{claimsError}</>,
              [DataViewState.empty]: <>{t('No claims for this pool.')}</>,
            }}
          ></DataViewTable>
        </DataView>
      </PageSection>

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

      {claimModalOpen && pool && (
        <CreateResourcePoolClaimModal
          poolName={pool.metadata.name}
          poolHard={available ?? hard}
          tenantName={tenant}
          onClose={() => setClaimModalOpen(false)}
          onCreated={() => {
            setClaimModalOpen(false);
            setRefreshToken((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
