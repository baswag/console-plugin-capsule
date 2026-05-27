import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import {
  ListPageHeader,
  ResourceLink,
  Timestamp,
  useAccessReview,
} from '@openshift-console/dynamic-plugin-sdk';
import DocumentTitle from '../utils/DocumentTitle';
import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Modal,
  PageSection,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { CAPSULE_APIS, CapsuleClient, ResourcePoolClaim } from '../utils/capsule';
import './ResourcePoolDetailPage.css';
import type { V1ResourceQuota } from '@kubernetes/client-node';
import { UsageGauge } from '../utils/common';

export default function ResourcePoolClaimDetailPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const navigate = useNavigate();

  const resourcePoolClaimsApi = new CapsuleClient<ResourcePoolClaim>(
    CAPSULE_APIS.RESOURCE_POOL_CLAIMS,
  );

  const resourceQuotasApi = new CapsuleClient<V1ResourceQuota>({
    apiGroup: '',
    apiVersion: 'v1',
    apiKind: 'resourcequotas',
    apiKindSingle: 'ResourceQuota',
  });

  const [claim, setClaim] = useState<ResourcePoolClaim | null>(null);
  const [quota, setQuota] = useState<V1ResourceQuota | null>(null);
  const [claimLoaded, setClaimLoaded] = useState(false);
  const [quotaLoaded, setQuotaLoaded] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [canDeleteClaim] = useAccessReview({
    group: CAPSULE_APIS.RESOURCE_POOL_CLAIMS.apiGroup,
    resource: CAPSULE_APIS.RESOURCE_POOL_CLAIMS.apiKind,
    namespace: namespace ?? '',
    verb: 'delete',
  });

  const handleDelete = () => {
    if (!namespace || !name) return;
    setDeleting(true);
    setDeleteError(null);

    resourcePoolClaimsApi
      .fetch({ name, namespace, method: 'DELETE' })
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
    resourcePoolClaimsApi
      .fetch({ name, namespace })
      .then((data) => {
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
    resourceQuotasApi
      .fetch({ name, namespace })
      .then((data: V1ResourceQuota) => {
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
        <Modal
          isOpen
          onClose={() => setDeleteModalOpen(false)}
          variant="small"
          title={t('Delete ResourcePoolClaim?')}
          actions={[
            <Button
              key="delete"
              variant="danger"
              onClick={handleDelete}
              isDisabled={deleting}
              isLoading={deleting}
            >
              {t('Delete')}
            </Button>,
            <Button
              key="cancel"
              variant="link"
              onClick={() => setDeleteModalOpen(false)}
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
          {t('Are you sure you want to delete {{name}}? This cannot be undone.', { name })}
        </Modal>
      )}
    </>
  );
}
