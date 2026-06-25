import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { ListPageHeader } from '@openshift-console/dynamic-plugin-sdk';
import DocumentTitle from '../utils/DocumentTitle';
import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
  PageSection,
  Spinner,
  Title,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import type { ResourcePool, ResourcePoolClaim } from '../utils/capsule';
import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import CreateResourcePoolClaimModal from './CreateResourcePoolClaimModal';
import './ResourcePoolDetailPage.css';
import { UsageGauge } from '../utils/common';
import { ResourcePoolClaimsTable } from './ResourcePoolClaimsTable';

export default function ResourcePoolDetailPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const { name } = useParams<{ name: string }>();

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
    if (!name || refreshToken === 0) return;
    resourcePoolsApi
      .fetch({ name })
      .then((data: ResourcePool) => setPool(data))
      .catch(() => {});
  }, [name, refreshToken]);

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
        <Button
          variant="plain"
          aria-label={t('Refresh')}
          onClick={() => setRefreshToken((n) => n + 1)}
        >
          <SyncAltIcon />
        </Button>
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

        <ResourcePoolClaimsTable
          claims={claims}
          claimsLoaded={claimsLoaded}
          claimsError={claimsError}
          pool={pool}
          onRefresh={() => setRefreshToken((n) => n + 1)}
          emptyMessage={t('No claims for this pool.')}
        />
      </PageSection>

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
