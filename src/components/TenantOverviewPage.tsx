import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { DocumentTitle, ListPageHeader, Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
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
import type { GlobalResourceQuota, Tenant } from '../utils/capsule';
import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import { readyConditionStatus, tenantNamespaceCount, UsageGauge } from '../utils/common';
import { OwnerLabels } from './OwnerLabels';
import { QuotaStackedBars } from './QuotaStackedBars';
import { TenantNamespaceList } from './TenantNamespaceList';
import './Gauges.css';

const tenantApi = new CapsuleClient<Tenant>(CAPSULE_APIS.TENANTS);
const globalResourceQuotasApi = new CapsuleClient<GlobalResourceQuota>(
  CAPSULE_APIS.GLOBAL_RESOURCE_QUOTAS,
);

function grqNamespaces(grq: GlobalResourceQuota): string[] {
  return grq.status?.namespaces ?? Object.keys(grq.status?.namespaceUsage ?? {});
}

function ReadyLabel({ grq }: { grq: GlobalResourceQuota }) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const status = readyConditionStatus(grq.status?.conditions);
  if (status === 'True') return <Label color="green">{t('Ready')}</Label>;
  if (status === 'False') return <Label color="red">{t('Not Ready')}</Label>;
  return <Label color="grey">{t('Unknown')}</Label>;
}

function TenantGlobalResourceQuotaCard({
  grq,
  tenantNamespaces,
}: {
  grq: GlobalResourceQuota;
  tenantNamespaces: Set<string>;
}) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const navigate = useNavigate();
  const all = grqNamespaces(grq);
  const inTenant = all.filter((ns) => tenantNamespaces.has(ns)).length;

  return (
    <Card isCompact data-test={`tenant-grq-${grq.metadata.name}`}>
      <CardHeader actions={{ actions: <ReadyLabel grq={grq} />, hasNoOffset: true }}>
        <CardTitle>
          <Button
            variant="link"
            isInline
            onClick={() => {
              navigate(`/capsule-global-resource-quotas/${grq.metadata.name}`);
            }}
          >
            {grq.metadata.name}
          </Button>
        </CardTitle>
        <span className="console-plugin-capsule__muted-text">
          {inTenant === all.length
            ? t('Covers {{count}} namespace of this tenant', { count: inTenant })
            : t('Covers {{count}} namespace of this tenant ({{total}} in total)', {
                count: inTenant,
                total: all.length,
              })}
        </span>
      </CardHeader>
      <CardBody>
        <QuotaStackedBars grq={grq} tenantNamespaces={tenantNamespaces} />
      </CardBody>
    </Card>
  );
}

export default function TenantOverviewPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const { name = '' } = useParams<{ name: string }>();

  const [tenant, setTenant] = useState<Tenant | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [grqs, setGrqs] = useState<GlobalResourceQuota[]>([]);
  const [grqsLoaded, setGrqsLoaded] = useState(false);
  const [grqsError, setGrqsError] = useState<string | null>(null);
  // `refreshToken` (header button) reloads everything, including the namespace list;
  // `summaryToken` only reloads the tenant and quotas, after the list itself changed.
  const [refreshToken, setRefreshToken] = useState(0);
  const [summaryToken, setSummaryToken] = useState(0);

  useEffect(() => {
    if (!name) return;
    setLoadError(null);
    tenantApi
      .fetch({ name })
      .then((data) => {
        setTenant(data);
        setLoaded(true);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : t('Failed to fetch tenant'));
        setLoaded(true);
      });
  }, [name, t, refreshToken, summaryToken]);

  // GlobalResourceQuotas are cluster-scoped and select namespaces by label, so there is no
  // server-side "quotas for tenant X" query: fetch all and keep those covering any of the
  // tenant's namespaces.
  useEffect(() => {
    setGrqsError(null);
    globalResourceQuotasApi
      .fetch()
      .then((data) => {
        setGrqs(data.items);
        setGrqsLoaded(true);
      })
      .catch((e: unknown) => {
        setGrqsError(e instanceof Error ? e.message : t('Failed to fetch GlobalResourceQuotas'));
        setGrqsLoaded(true);
      });
  }, [t, refreshToken, summaryToken]);

  const onNamespacesChanged = useCallback(() => {
    setSummaryToken((n) => n + 1);
  }, []);

  if (!loaded) {
    return (
      <PageSection>
        <Spinner aria-label={t('Loading tenant')} />
      </PageSection>
    );
  }

  if (loadError || !tenant) {
    return (
      <PageSection>
        <Alert variant="danger" title={t('Error loading tenant')} isInline>
          {loadError}
        </Alert>
      </PageSection>
    );
  }

  const namespaceCount = tenantNamespaceCount(tenant.status);
  const namespaceQuota = tenant.spec.namespaceOptions?.quota;
  const quotaReached = namespaceQuota !== undefined && namespaceCount >= namespaceQuota;
  const tenantNamespaces = new Set(tenant.status?.namespaces ?? []);
  const tenantGrqs = grqs.filter((g) => grqNamespaces(g).some((ns) => tenantNamespaces.has(ns)));

  return (
    <>
      <DocumentTitle>{t('Tenant: {{name}}', { name })}</DocumentTitle>
      <ListPageHeader title={t('Tenant: {{name}}', { name })}>
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
        <div className="console-plugin-capsule__overview-summary">
          <DescriptionList isHorizontal className="console-plugin-capsule__detail-meta">
            <DescriptionListGroup>
              <DescriptionListTerm>{t('State')}</DescriptionListTerm>
              <DescriptionListDescription>{tenant.status?.state ?? '—'}</DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Owners')}</DescriptionListTerm>
              <DescriptionListDescription data-test="tenant-owners">
                <OwnerLabels owners={tenant.status?.owners ?? []} />
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Namespaces')}</DescriptionListTerm>
              <DescriptionListDescription>
                {namespaceQuota === undefined
                  ? namespaceCount
                  : t('{{used}} of {{hard}}', {
                      used: String(namespaceCount),
                      hard: String(namespaceQuota),
                    })}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t('Created')}</DescriptionListTerm>
              <DescriptionListDescription>
                <Timestamp timestamp={tenant.metadata.creationTimestamp} />
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>
          {namespaceQuota !== undefined && (
            <div data-test="tenant-namespace-quota">
              <UsageGauge
                resource={t('Namespace quota')}
                used={namespaceCount}
                hard={namespaceQuota}
              />
            </div>
          )}
        </div>
      </PageSection>

      <PageSection>
        <Content component="h2" className="console-plugin-capsule__section-title">
          {t('Namespaces')}
        </Content>
        <TenantNamespaceList
          tenantName={name}
          tenant={tenant}
          refreshToken={refreshToken}
          createDisabledReason={
            quotaReached
              ? t('The namespace quota of this tenant ({{quota}}) has been reached.', {
                  quota: namespaceQuota,
                })
              : undefined
          }
          onNamespacesChanged={onNamespacesChanged}
        />
      </PageSection>

      <PageSection>
        <Content component="h2" className="console-plugin-capsule__section-title">
          {t('Global Resource Quotas')}
        </Content>
        {!grqsLoaded && <Spinner size="lg" aria-label={t('Loading GlobalResourceQuotas')} />}
        {grqsLoaded && grqsError && (
          <Alert variant="danger" title={t('Error')} isInline>
            {grqsError}
          </Alert>
        )}
        {grqsLoaded && !grqsError && tenantGrqs.length === 0 && (
          <span className="console-plugin-capsule__muted-text">
            {t('No GlobalResourceQuotas apply to this tenant.')}
          </span>
        )}
        {grqsLoaded && !grqsError && tenantGrqs.length > 0 && (
          <div className="console-plugin-capsule__card-stack">
            {tenantGrqs.map((grq) => (
              <TenantGlobalResourceQuotaCard
                key={grq.metadata.name}
                grq={grq}
                tenantNamespaces={tenantNamespaces}
              />
            ))}
          </div>
        )}
      </PageSection>
    </>
  );
}
