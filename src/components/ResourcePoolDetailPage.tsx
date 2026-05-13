import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  DocumentTitle,
  ListPageHeader,
  Timestamp,
  consoleFetchJSON,
  useAccessReview,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  ActionGroup,
  Alert,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { TrashIcon } from '@patternfly/react-icons';
import {
  CAPSULE,
  ResourcePool,
  ResourcePoolClaim,
  ResourceQuantity,
  getPoolTenant,
  parseResourceValue,
} from '../utils/capsule';
import CreateResourcePoolClaimModal from './CreateResourcePoolClaimModal';
import './ResourcePoolDetailPage.css';

const POOLS_URL = `${CAPSULE.PROXY_BASE}/apis/${CAPSULE.API_BASE}/${CAPSULE.RESOURCE_POOLS.API_VERSION}/${CAPSULE.RESOURCE_POOLS.API_KIND}`;
const CLAIMS_URL = `${CAPSULE.PROXY_BASE}/apis/${CAPSULE.API_BASE}/${CAPSULE.RESOURCE_POOL_CLAIMS.API_VERSION}/${CAPSULE.RESOURCE_POOL_CLAIMS.API_KIND}`;

interface UsageGaugeProps {
  resource: string;
  used: string | undefined;
  hard: string | undefined;
}

function UsageGauge({ resource, used, hard }: UsageGaugeProps) {
  const usedNum = parseResourceValue(used ?? '0');
  const hardNum = parseResourceValue(hard ?? '0');
  const pct = hardNum > 0 ? Math.min(100, Math.round((usedNum / hardNum) * 100)) : 0;

  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 52;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * r;
  const progressLen = (pct / 100) * circumference;

  const strokeColor =
    pct > 90
      ? 'var(--pf-t--global--color--status--danger--default)'
      : pct > 70
        ? 'var(--pf-t--global--color--status--warning--default)'
        : 'var(--pf-t--global--color--status--info--default)';

  return (
    <div className="console-plugin-capsule__gauge">
      <span className="console-plugin-capsule__gauge-title">{resource}</span>
      <div className="console-plugin-capsule__gauge-ring">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            style={{
              fill: 'none',
              stroke: 'var(--pf-t--global--border--color--default)',
              strokeWidth: `${strokeWidth}`,
            }}
          />
          {pct > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              style={{
                fill: 'none',
                stroke: strokeColor,
                strokeWidth: `${strokeWidth}`,
                strokeDasharray: `${progressLen} ${circumference}`,
                strokeLinecap: 'round',
              }}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )}
        </svg>
        <div className="console-plugin-capsule__gauge-center">
          <span className="console-plugin-capsule__gauge-pct">{pct}&nbsp;%</span>
          <span className="console-plugin-capsule__gauge-used-label">used</span>
        </div>
      </div>
      <span className="console-plugin-capsule__gauge-subtext">
        {used ?? '0'} of {hard ?? '0'}
      </span>
    </div>
  );
}

function resourcePoolClaimDetailUrl(claim: ResourcePoolClaim): string {
  const { namespace, name } = claim.metadata;
  return `/capsule-resource-pool-claims/${namespace}/${name}`;
}

function formatQuantity(q: ResourceQuantity | undefined): string {
  if (!q) return '—';
  return Object.entries(q)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

export default function ResourcePoolDetailPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  const [pool, setPool] = useState<ResourcePool | null>(null);
  const [claims, setClaims] = useState<ResourcePoolClaim[]>([]);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [claimsLoaded, setClaimsLoaded] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const [canCreateClaim] = useAccessReview({
    group: CAPSULE.API_BASE,
    resource: CAPSULE.RESOURCE_POOL_CLAIMS.API_KIND,
    verb: 'create',
  });

  const [canDeleteClaim] = useAccessReview({
    group: CAPSULE.API_BASE,
    resource: CAPSULE.RESOURCE_POOL_CLAIMS.API_KIND,
    verb: 'delete',
  });

  const [claimToDelete, setClaimToDelete] = useState<ResourcePoolClaim | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteClaim = () => {
    if (!claimToDelete) return;
    const { namespace, name: claimName } = claimToDelete.metadata;
    setDeleting(true);
    setDeleteError(null);
    consoleFetchJSON
      .delete(
        `${CAPSULE.PROXY_BASE}/apis/${CAPSULE.API_BASE}/${CAPSULE.RESOURCE_POOL_CLAIMS.API_VERSION}/namespaces/${namespace}/${CAPSULE.RESOURCE_POOL_CLAIMS.API_KIND}/${claimName}`,
      )
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
    consoleFetchJSON(`${POOLS_URL}/${name}`)
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
    consoleFetchJSON(CLAIMS_URL)
      .then((data: { items: ResourcePoolClaim[] }) => {
        const filtered = (data.items ?? []).filter(
          (c) => c.spec.pool === name,
        );
        setClaims(filtered);
        setClaimsLoaded(true);
      })
      .catch((e: Error) => {
        setClaimsError(e.message ?? t('Failed to fetch claims'));
        setClaimsLoaded(true);
      });
  }, [name, t, refreshToken]);

  const tenant = pool ? getPoolTenant(pool) : '';
  const hard = pool?.status?.allocation?.hard ?? pool?.spec.hard ?? {};
  const used = pool?.status?.allocation?.used ?? {};
  const available = pool?.status?.allocation?.available;

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

  return (
    <>
      <DocumentTitle>{t('Resource Pool: {{name}}', { name })}</DocumentTitle>
      <ListPageHeader title={`${t('Resource Pool')}: ${name}`}>
        {canCreateClaim && (
          <Button variant="primary" onClick={() => setClaimModalOpen(true)}>
            {t('Create Claim')}
          </Button>
        )}
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
          {Object.keys(hard).length === 0 && (
            <span>{t('No resource limits defined.')}</span>
          )}
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

        {!claimsLoaded && <Spinner aria-label={t('Loading claims')} />}
        {claimsError && (
          <Alert variant="warning" title={t('Could not load claims')} isInline>
            {claimsError}
          </Alert>
        )}
        {claimsLoaded && !claimsError && (
          <Table aria-label={t('ResourcePoolClaims')} variant="compact">
            <Thead>
              <Tr>
                <Th>{t('Claim')}</Th>
                <Th>{t('Namespace')}</Th>
                <Th>{t('Requested')}</Th>
                <Th>{t('Status')}</Th>
                <Th>{t('Created')}</Th>
                {canDeleteClaim && <Th aria-label={t('Actions')} />}
              </Tr>
            </Thead>
            <Tbody>
              {claims.length === 0 ? (
                <Tr>
                  <Td colSpan={canDeleteClaim ? 6 : 5}>{t('No claims for this pool.')}</Td>
                </Tr>
              ) : (
                claims.map((claim) => (
                  <Tr key={`${claim.metadata.namespace}/${claim.metadata.name}`}>
                    <Td>
                      <Button
                        variant="link"
                        isInline
                        onClick={() => navigate(resourcePoolClaimDetailUrl(claim))}
                      >
                        {claim.metadata.name}
                      </Button>
                    </Td>
                    <Td>{claim.metadata.namespace}</Td>
                    <Td>{formatQuantity(claim.spec.claim)}</Td>
                    <Td>{claim.status?.condition?.message ?? '—'}</Td>
                    <Td>
                      <Timestamp timestamp={claim.metadata.creationTimestamp} />
                    </Td>
                    {canDeleteClaim && (
                      <Td isActionCell>
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
                      </Td>
                    )}
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        )}
      </PageSection>

      {claimToDelete && (
        <Modal isOpen onClose={() => setClaimToDelete(null)} variant="small">
          <ModalHeader title={t('Delete ResourcePoolClaim?')} />
          <ModalBody>
            {deleteError && (
              <Alert variant="danger" title={t('Error')} isInline style={{ marginBottom: '1rem' }}>
                {deleteError}
              </Alert>
            )}
            {t('Are you sure you want to delete {{name}}? This cannot be undone.', {
              name: claimToDelete.metadata.name,
            })}
          </ModalBody>
          <ModalFooter>
            <ActionGroup>
              <Button
                variant="danger"
                onClick={handleDeleteClaim}
                isDisabled={deleting}
                isLoading={deleting}
              >
                {t('Delete')}
              </Button>
              <Button variant="link" onClick={() => setClaimToDelete(null)} isDisabled={deleting}>
                {t('Cancel')}
              </Button>
            </ActionGroup>
          </ModalFooter>
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
