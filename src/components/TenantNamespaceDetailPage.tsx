import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import {
  ListPageHeader,
  ResourceLink,
  Timestamp,
  DocumentTitle,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Button,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
  LabelGroup,
  MenuToggle,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Spinner,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import { CapsuleClient, CAPSULE_APIS } from '../utils/capsule';
import type { GlobalResourceQuota } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';
import { UsageGauge } from '../utils/common';
import EditLabelsModal from './EditLabelsModal';
import EditAnnotationsModal, { visibleAnnotations } from './EditAnnotationsModal';
import './Gauges.css';

const namespacesApiClient = new CapsuleClient<V1NamespaceString>({
  apiGroup: '',
  apiVersion: 'v1',
  apiKind: 'namespaces',
  apiKindSingle: 'Namespace',
});

const globalResourceQuotasApi = new CapsuleClient<GlobalResourceQuota>(
  CAPSULE_APIS.GLOBAL_RESOURCE_QUOTAS,
);

// Array index access isn't tracked as possibly-undefined by this project's tsconfig
// (noUncheckedIndexedAccess is off), so an explicit return type is used here to keep this
// particular access honest for an empty array.
function firstOrUndefined<T>(items: T[]): T | undefined {
  return items[0];
}

export default function TenantNamespaceDetailPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  const [namespace, setNamespace] = useState<V1NamespaceString | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [openModal, setOpenModal] = useState<'labels' | 'annotations' | null>(null);

  // Quotas section state
  const [matchingGrqs, setMatchingGrqs] = useState<GlobalResourceQuota[]>([]);
  const [grqsLoaded, setGrqsLoaded] = useState(false);
  const [grqsError, setGrqsError] = useState<string | null>(null);
  const [grqSelectOpen, setGrqSelectOpen] = useState(false);
  const [selectedGrqName, setSelectedGrqName] = useState('');

  useEffect(() => {
    if (!name) return;
    setLoaded(false);
    setLoadError(null);
    namespacesApiClient
      .fetch({ name })
      .then((data) => {
        setNamespace(data);
        setLoaded(true);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : t('Failed to fetch namespace'));
        setLoaded(true);
      });
  }, [name, t, refreshToken]);

  // Fetch all GlobalResourceQuotas and filter client-side to those matching this namespace
  // (GRQ is cluster-scoped, so there's no server-side "quotas for namespace X" query).
  useEffect(() => {
    if (!name) return;
    setGrqsLoaded(false);
    setGrqsError(null);
    globalResourceQuotasApi
      .fetch()
      .then((data) => {
        const matches = data.items.filter((g) =>
          (g.status?.namespaces ?? Object.keys(g.status?.namespaceUsage ?? {})).includes(name),
        );
        setMatchingGrqs(matches);
        setGrqsLoaded(true);
        setSelectedGrqName((prev) =>
          !prev && matches.length > 0 ? matches[0].metadata.name : prev,
        );
      })
      .catch((e: unknown) => {
        setGrqsError(e instanceof Error ? e.message : t('Failed to fetch GlobalResourceQuotas'));
        setGrqsLoaded(true);
      });
  }, [name, t, refreshToken]);

  if (!loaded) {
    return (
      <PageSection>
        <Spinner aria-label={t('Loading namespace')} />
      </PageSection>
    );
  }

  if (loadError) {
    return (
      <PageSection>
        <Alert variant="danger" title={t('Error loading namespace')} isInline>
          {loadError}
        </Alert>
      </PageSection>
    );
  }

  const labelEntries = Object.entries(namespace?.metadata.labels ?? {});
  const annotationCount = Object.keys(visibleAnnotations(namespace?.metadata.annotations)).length;

  const selectedGrq =
    matchingGrqs.find((g) => g.metadata.name === selectedGrqName) ?? firstOrUndefined(matchingGrqs);
  const grqHard = selectedGrq?.spec.quota.hard ?? {};
  const grqUsed = (name ? selectedGrq?.status?.namespaceUsage?.[name]?.used : undefined) ?? {};

  return (
    <>
      <DocumentTitle>{t('Namespace: {{name}}', { name })}</DocumentTitle>
      <ListPageHeader title={t('Namespace: {{name}}', { name })}>
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
        <DescriptionList isHorizontal className="console-plugin-capsule__detail-meta">
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Name')}</DescriptionListTerm>
            <DescriptionListDescription>{name}</DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Status')}</DescriptionListTerm>
            <DescriptionListDescription>
              {namespace?.status?.phase ?? '—'}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('Created')}</DescriptionListTerm>
            <DescriptionListDescription>
              {namespace?.metadata.creationTimestamp ? (
                <Timestamp timestamp={namespace.metadata.creationTimestamp} />
              ) : (
                '—'
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>{t('OpenShift Project')}</DescriptionListTerm>
            <DescriptionListDescription>
              <ResourceLink
                groupVersionKind={{ group: 'project.openshift.io', version: 'v1', kind: 'Project' }}
                name={name}
              />
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </PageSection>

      <PageSection>
        <div className="console-plugin-capsule__section-header">
          <Content component="h2">{t('Labels')}</Content>
          <Button
            variant="link"
            aria-label={t('Edit labels')}
            onClick={() => {
              setOpenModal('labels');
            }}
          >
            {t('Edit')}
          </Button>
        </div>
        {labelEntries.length > 0 ? (
          <LabelGroup>
            {labelEntries.map(([k, v]) => (
              <Label key={k} color="blue">
                {v ? `${k}=${v}` : k}
              </Label>
            ))}
          </LabelGroup>
        ) : (
          <span className="console-plugin-capsule__muted-text">{t('No labels')}</span>
        )}

        <div className="console-plugin-capsule__section-header console-plugin-capsule__section-header--spaced">
          <Content component="h2">{t('Annotations')}</Content>
          <Button
            variant="link"
            aria-label={t('Edit annotations')}
            onClick={() => {
              setOpenModal('annotations');
            }}
          >
            {t('Edit')}
          </Button>
        </div>
        <span>{t('{{count}} annotation', { count: annotationCount })}</span>
      </PageSection>

      <PageSection className="console-plugin-capsule__table-section">
        <Content component="h2" className="console-plugin-capsule__section-title">
          {t('Quotas')}
        </Content>

        {!grqsLoaded && <Spinner aria-label={t('Loading quotas')} />}

        {grqsLoaded && grqsError && (
          <Alert variant="danger" title={t('Error')} isInline>
            {grqsError}
          </Alert>
        )}

        {grqsLoaded && !grqsError && matchingGrqs.length === 0 && (
          <span>{t('No GlobalResourceQuotas match this namespace.')}</span>
        )}

        {grqsLoaded && !grqsError && matchingGrqs.length > 0 && (
          <>
            <div className="console-plugin-capsule__section-header">
              {matchingGrqs.length > 1 && (
                <Select
                  isOpen={grqSelectOpen}
                  selected={selectedGrqName}
                  onSelect={(_e, val) => {
                    setSelectedGrqName(String(val));
                    setGrqSelectOpen(false);
                  }}
                  onOpenChange={setGrqSelectOpen}
                  toggle={(toggleRef) => (
                    <MenuToggle
                      ref={toggleRef}
                      onClick={() => {
                        setGrqSelectOpen((o) => !o);
                      }}
                      isExpanded={grqSelectOpen}
                    >
                      {selectedGrqName || t('Select quota')}
                    </MenuToggle>
                  )}
                  shouldFocusToggleOnSelect
                >
                  <SelectList>
                    {matchingGrqs.map((g) => (
                      <SelectOption
                        key={g.metadata.name}
                        value={g.metadata.name}
                        isSelected={g.metadata.name === selectedGrqName}
                      >
                        {g.metadata.name}
                      </SelectOption>
                    ))}
                  </SelectList>
                </Select>
              )}
              {selectedGrq && (
                <Button
                  variant="link"
                  isInline
                  onClick={() => {
                    navigate(`/capsule-global-resource-quotas/${selectedGrq.metadata.name}`);
                  }}
                >
                  {matchingGrqs.length > 1
                    ? t('View quota details')
                    : t('Quota: {{name}}', { name: selectedGrq.metadata.name })}
                </Button>
              )}
            </div>

            <Content component="h3" className="console-plugin-capsule__subsection-title">
              {t('Current usage')}
            </Content>
            <div className="console-plugin-capsule__gauges">
              {Object.keys(grqHard).map((resource) => (
                <UsageGauge
                  key={resource}
                  resource={resource}
                  used={grqUsed[resource]}
                  hard={grqHard[resource]}
                />
              ))}
              {Object.keys(grqHard).length === 0 && <span>{t('No resource limits defined.')}</span>}
            </div>
          </>
        )}
      </PageSection>

      {openModal === 'labels' && namespace && (
        <EditLabelsModal
          namespace={namespace}
          onClose={() => {
            setOpenModal(null);
          }}
          onSaved={(updated) => {
            setNamespace(updated);
            setOpenModal(null);
          }}
        />
      )}
      {openModal === 'annotations' && namespace && (
        <EditAnnotationsModal
          namespace={namespace}
          onClose={() => {
            setOpenModal(null);
          }}
          onSaved={(updated) => {
            setNamespace(updated);
            setOpenModal(null);
          }}
        />
      )}
    </>
  );
}
