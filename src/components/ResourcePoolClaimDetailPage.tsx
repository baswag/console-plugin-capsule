import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  DocumentTitle,
  ListPageHeader,
  ResourceLink,
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
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { CAPSULE, ResourcePoolClaim, ResourceQuantity, parseResourceValue } from '../utils/capsule';
import './ResourcePoolDetailPage.css';

const CLAIMS_URL = `${CAPSULE.PROXY_BASE}/apis/${CAPSULE.API_BASE}/${CAPSULE.RESOURCE_POOL_CLAIMS.API_VERSION}`;

interface ResourceQuota {
  metadata: { name: string; namespace: string };
  status?: {
    hard?: ResourceQuantity;
    used?: ResourceQuantity;
  };
}

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

export default function ResourcePoolClaimDetailPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const navigate = useNavigate();

  const [claim, setClaim] = useState<ResourcePoolClaim | null>(null);
  const [quota, setQuota] = useState<ResourceQuota | null>(null);
  const [claimLoaded, setClaimLoaded] = useState(false);
  const [quotaLoaded, setQuotaLoaded] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [canDeleteClaim] = useAccessReview({
    group: CAPSULE.API_BASE,
    resource: CAPSULE.RESOURCE_POOL_CLAIMS.API_KIND,
    namespace: namespace ?? '',
    verb: 'delete',
  });

  const handleDelete = () => {
    if (!namespace || !name) return;
    setDeleting(true);
    setDeleteError(null);
    consoleFetchJSON
      .delete(
        `${CLAIMS_URL}/namespaces/${namespace}/${CAPSULE.RESOURCE_POOL_CLAIMS.API_KIND}/${name}`,
      )
      .then(() => {
        navigate(-1);
      })
      .catch((e: Error) => {
        setDeleteError(e.message ?? t('Failed to delete claim'));
        setDeleting(false);
      });
  };

  useEffect(() => {
    if (!namespace || !name) return;
    setClaimLoaded(false);
    consoleFetchJSON(
      `${CLAIMS_URL}/namespaces/${namespace}/${CAPSULE.RESOURCE_POOL_CLAIMS.API_KIND}/${name}`,
    )
      .then((data: ResourcePoolClaim) => {
        setClaim(data);
        setClaimLoaded(true);
      })
      .catch((e: Error) => {
        setClaimError(e.message ?? t('Failed to fetch claim'));
        setClaimLoaded(true);
      });
  }, [namespace, name, t]);

  useEffect(() => {
    if (!namespace || !name) return;
    setQuotaLoaded(false);
    consoleFetchJSON(`${CAPSULE.PROXY_BASE}/api/v1/namespaces/${namespace}/resourcequotas/${name}`)
      .then((data: ResourceQuota) => {
        setQuota(data);
        setQuotaLoaded(true);
      })
      .catch(() => {
        setQuotaLoaded(true);
      });
  }, [namespace, name]);

  if (!claimLoaded) {
    return (
      <PageSection>
        <Spinner aria-label={t('Loading claim')} />
      </PageSection>
    );
  }

  if (claimError) {
    return (
      <PageSection>
        <Alert variant="danger" title={t('Error loading claim')} isInline>
          {claimError}
        </Alert>
      </PageSection>
    );
  }

  const hard = quota?.status?.hard ?? claim?.spec.claim ?? {};
  const used = quota?.status?.used ?? {};

  return (
    <>
      <DocumentTitle>{t('ResourcePoolClaim: {{name}}', { name })}</DocumentTitle>
      <ListPageHeader title={`${t('ResourcePoolClaim')}: ${name}`}>
        {canDeleteClaim && (
          <Button
            variant="danger"
            onClick={() => {
              setDeleteError(null);
              setDeleteModalOpen(true);
            }}
          >
            {t('Delete')}
          </Button>
        )}
      </ListPageHeader>

      <PageSection>
        <Title headingLevel="h2" size="lg">
          {t('Current usage')}
        </Title>

        {!quotaLoaded && <Spinner aria-label={t('Loading usage')} />}
        {quotaLoaded && (
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
        )}

        <DescriptionList className="console-plugin-capsule__detail-meta" isHorizontal>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Name')}</DescriptionListTerm>
            <DescriptionListDescription>{name}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Namespace')}</DescriptionListTerm>
            <DescriptionListDescription>
              <ResourceLink
                key="namespaceName"
                groupVersionKind={{ group: 'project.openshift.io', version: 'v1', kind: 'Project' }}
                name={namespace}
              ></ResourceLink>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Pool')}</DescriptionListTerm>
            <DescriptionListDescription>
              <Button
                key="resourcePoolName"
                variant="link"
                isInline
                onClick={() => navigate(`/capsule-resource-pools/${claim?.spec.pool}`)}
                disabled={!claim?.spec.pool}
              >
                {claim?.spec.pool ?? '—'}
              </Button>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Status')}</DescriptionListTerm>
            <DescriptionListDescription>
              {claim?.status?.condition?.message ?? '—'}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Created')}</DescriptionListTerm>
            <DescriptionListDescription>
              {claim?.metadata.creationTimestamp ? (
                <Timestamp timestamp={claim.metadata.creationTimestamp} />
              ) : (
                '—'
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </PageSection>
      {deleteModalOpen && (
        <Modal isOpen onClose={() => setDeleteModalOpen(false)} variant="small">
          <ModalHeader title={t('Delete ResourcePoolClaim?')} />
          <ModalBody>
            {deleteError && (
              <Alert variant="danger" title={t('Error')} isInline style={{ marginBottom: '1rem' }}>
                {deleteError}
              </Alert>
            )}
            {t('Are you sure you want to delete {{name}}? This cannot be undone.', { name })}
          </ModalBody>
          <ModalFooter>
            <ActionGroup>
              <Button
                variant="danger"
                onClick={handleDelete}
                isDisabled={deleting}
                isLoading={deleting}
              >
                {t('Delete')}
              </Button>
              <Button
                variant="link"
                onClick={() => setDeleteModalOpen(false)}
                isDisabled={deleting}
              >
                {t('Cancel')}
              </Button>
            </ActionGroup>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
