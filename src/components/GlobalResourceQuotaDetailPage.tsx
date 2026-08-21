import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { DocumentTitle, ListPageHeader, Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Button,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
  PageSection,
  Spinner,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import type { GlobalResourceQuota } from '../utils/capsule';
import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import { readyConditionStatus, UsageGauge } from '../utils/common';
import { GlobalResourceQuotaNamespaceUsageTable } from './GlobalResourceQuotaNamespaceUsageTable';
import './Gauges.css';

const globalResourceQuotasApi = new CapsuleClient<GlobalResourceQuota>(
  CAPSULE_APIS.GLOBAL_RESOURCE_QUOTAS,
);

export default function GlobalResourceQuotaDetailPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const { name } = useParams<{ name: string }>();

  const [grq, setGrq] = useState<GlobalResourceQuota | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!name) return;
    setLoaded(false);
    setLoadError(null);
    globalResourceQuotasApi
      .fetch({ name })
      .then((data) => {
        setGrq(data);
        setLoaded(true);
      })
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch GlobalResourceQuota'));
        setLoaded(true);
      });
  }, [name, t, refreshToken]);

  if (!loaded) {
    return (
      <PageSection>
        <Spinner aria-label={t('Loading GlobalResourceQuota')} />
      </PageSection>
    );
  }

  if (loadError) {
    return (
      <PageSection>
        <Alert variant="danger" title={t('Error loading GlobalResourceQuota')} isInline>
          {loadError}
        </Alert>
      </PageSection>
    );
  }

  const readyStatus = readyConditionStatus(grq?.status?.conditions);
  const readyCondition = grq?.status?.conditions.find((c) => c.type === 'Ready');
  const namespaceCount = grq?.status?.namespaceCount ?? grq?.status?.namespaces?.length ?? 0;
  const hard = grq?.status?.total.hard ?? grq?.spec.quota.hard ?? {};
  const used = grq?.status?.total.used ?? {};

  return (
    <>
      <DocumentTitle>{t('Global Resource Quota: {{name}}', { name })}</DocumentTitle>
      <ListPageHeader title={`${t('Global Resource Quota')}: ${name}`}>
        <Button
          variant="plain"
          aria-label={t('Refresh')}
          onClick={() => {
            setRefreshToken((n) => n + 1);
          }}
        >
          <SyncAltIcon />
        </Button>
      </ListPageHeader>

      <PageSection>
        <Content component="h2">{t('Global Resource Quota details')}</Content>

        <DescriptionList className="console-plugin-capsule__detail-meta" isHorizontal>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Name')}</DescriptionListTerm>
            <DescriptionListDescription>{name}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Ready')}</DescriptionListTerm>
            <DescriptionListDescription>
              {readyStatus === 'True' && <Label color="green">{t('Ready')}</Label>}
              {readyStatus === 'False' && <Label color="red">{t('Not Ready')}</Label>}
              {readyStatus !== 'True' && readyStatus !== 'False' && (
                <Label color="grey">{t('Unknown')}</Label>
              )}
              {readyCondition?.message && (
                <span style={{ marginLeft: '0.5rem' }}>{readyCondition.message}</span>
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Namespaces')}</DescriptionListTerm>
            <DescriptionListDescription>{namespaceCount}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Created')}</DescriptionListTerm>
            <DescriptionListDescription>
              {grq?.metadata.creationTimestamp ? (
                <Timestamp timestamp={grq.metadata.creationTimestamp} />
              ) : (
                '—'
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>

        {!grq?.status ? (
          <Alert
            variant="info"
            title={t('Quota status not yet available.')}
            isInline
            style={{ marginTop: '1rem' }}
          />
        ) : (
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
      </PageSection>

      <PageSection className="console-plugin-capsule__table-section">
        <Content component="h2" style={{ marginBottom: '1rem' }}>
          {t('Namespaces')}
        </Content>

        {grq && <GlobalResourceQuotaNamespaceUsageTable grq={grq} />}
      </PageSection>
    </>
  );
}
