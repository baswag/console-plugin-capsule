import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { ListPageHeader, ResourceLink, Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import DocumentTitle from '../utils/DocumentTitle';
import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Grid,
  GridItem,
  Label,
  LabelGroup,
  MenuToggle,
  Modal,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  TextInput,
  TextInputGroup,
  TextInputGroupMain,
  Title,
} from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon, SyncAltIcon } from '@patternfly/react-icons';
import { CapsuleClient, CAPSULE_APIS } from '../utils/capsule';
import type { ResourcePool, ResourcePoolClaim } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';
import type { V1ResourceQuota } from '@kubernetes/client-node';
import { UsageGauge } from '../utils/common';
import { ResourcePoolClaimsTable } from './ResourcePoolClaimsTable';
import CreateResourcePoolClaimModal from './CreateResourcePoolClaimModal';
import './ResourcePoolDetailPage.css';

const namespacesApiClient = new CapsuleClient<V1NamespaceString>({
  apiGroup: '',
  apiVersion: 'v1',
  apiKind: 'namespaces',
  apiKindSingle: 'Namespace',
});

const resourceQuotasApi = new CapsuleClient<V1ResourceQuota>({
  apiGroup: '',
  apiVersion: 'v1',
  apiKind: 'resourcequotas',
  apiKindSingle: 'ResourceQuota',
});

const resourcePoolsApi = new CapsuleClient<ResourcePool>(CAPSULE_APIS.RESOURCE_POOLS);

const resourcePoolClaimsApi = new CapsuleClient<ResourcePoolClaim>(
  CAPSULE_APIS.RESOURCE_POOL_CLAIMS,
);

const HIDDEN_ANNOTATION_KEYS = ['kubectl.kubernetes.io/last-applied-configuration'];

// --- Annotation helpers ---
interface KVRow {
  id: number;
  key: string;
  value: string;
}

let _nextId = 0;
const nextId = () => _nextId++;

function toRows(record: Record<string, string> | undefined, hidden?: string[]): KVRow[] {
  if (!record) return [];
  return Object.entries(record)
    .filter(([key]) => !hidden?.includes(key))
    .map(([key, value]) => ({ id: nextId(), key, value }));
}

function toRecord(rows: KVRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((r) => r.key).map((r) => [r.key, r.value]));
}

function visibleAnnotations(raw: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw ?? {}).filter(([k]) => !HIDDEN_ANNOTATION_KEYS.includes(k)),
  );
}

// --- Label helpers ---
function labelsToStrings(labels: Record<string, string> | undefined): string[] {
  return Object.entries(labels ?? {}).map(([k, v]) => (v ? `${k}=${v}` : k));
}

function stringsToRecord(strs: string[]): Record<string, string> {
  return Object.fromEntries(
    strs.map((s) => {
      const idx = s.indexOf('=');
      return idx === -1 ? [s, ''] : [s.slice(0, idx), s.slice(idx + 1)];
    }),
  );
}

// --- EditLabelsModal ---
interface EditLabelsModalProps {
  namespace: V1NamespaceString;
  onClose: () => void;
  onSaved: (updated: V1NamespaceString) => void;
}

function EditLabelsModal({ namespace, onClose, onSaved }: EditLabelsModalProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const name = namespace.metadata.name!;

  const [labels, setLabels] = useState<string[]>(() =>
    labelsToStrings(namespace.metadata?.labels),
  );
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLabel = (raw: string) => {
    const trimmed = raw.trim().replace(/,$/, '');
    if (trimmed && !labels.includes(trimmed)) {
      setLabels((prev) => [...prev, trimmed]);
    }
    setInputValue('');
  };

  const removeLabel = (label: string) => {
    setLabels((prev) => prev.filter((l) => l !== label));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue) addLabel(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && labels.length > 0) {
      removeLabel(labels[labels.length - 1]);
    }
  };

  const handleSave = () => {
    setSaving(true);
    setError(null);
    const newLabels = stringsToRecord(labels);
    const currentLabels = namespace.metadata?.labels ?? {};

    const labelPatch: Record<string, string | null> = { ...newLabels };
    for (const key of Object.keys(currentLabels)) {
      if (!(key in newLabels)) labelPatch[key] = null;
    }

    namespacesApiClient
      .patch(name, { metadata: { labels: labelPatch } })
      .then((updated) => onSaved(updated))
      .catch((e: Error) => {
        setError(e.message ?? t('Failed to save labels'));
        setSaving(false);
      });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="medium"
      title={t('Edit labels')}
      actions={[
        <Button
          key="save"
          variant="primary"
          onClick={handleSave}
          isDisabled={saving}
          isLoading={saving}
        >
          {t('Save')}
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={saving}>
          {t('Cancel')}
        </Button>,
      ]}
    >
      {error && (
        <Alert variant="danger" title={t('Error')} isInline style={{ marginBottom: '1rem' }}>
          {error}
        </Alert>
      )}
      <p>
        {t(
          'Labels help you organize and select resources. Adding labels below will let you query for objects that have similar, overlapping or dissimilar labels.',
        )}
      </p>
      <p style={{ marginTop: '0.75rem' }}>
        <strong>
          {t('Labels for')} {name}
        </strong>
      </p>
      <TextInputGroup style={{ marginTop: '0.5rem' }}>
        <TextInputGroupMain
          value={inputValue}
          onChange={(_e, val) => setInputValue(val)}
          onKeyDown={handleKeyDown}
          placeholder={labels.length === 0 ? 'app=frontend' : undefined}
        >
          <LabelGroup>
            {labels.map((label) => (
              <Label key={label} onClose={() => removeLabel(label)}>
                {label}
              </Label>
            ))}
          </LabelGroup>
        </TextInputGroupMain>
      </TextInputGroup>
    </Modal>
  );
}

// --- KeyValueEditor (used by EditAnnotationsModal) ---
interface KeyValueEditorProps {
  rows: KVRow[];
  onChange: (rows: KVRow[]) => void;
  idPrefix: string;
}

function KeyValueEditor({ rows, onChange, idPrefix }: KeyValueEditorProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');

  const addRow = () => onChange([...rows, { id: nextId(), key: '', value: '' }]);
  const removeRow = (id: number) => onChange(rows.filter((r) => r.id !== id));
  const updateRow = (id: number, field: 'key' | 'value', val: string) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: val } : r)));

  return (
    <div>
      {rows.map((row) => (
        <Grid key={row.id} hasGutter className="console-plugin-capsule__kv-row">
          <GridItem span={5}>
            <TextInput
              id={`${idPrefix}-key-${row.id}`}
              aria-label={t('Key')}
              placeholder={t('Key')}
              value={row.key}
              onChange={(_e, val) => updateRow(row.id, 'key', val)}
            />
          </GridItem>
          <GridItem span={6}>
            <TextInput
              id={`${idPrefix}-value-${row.id}`}
              aria-label={t('Value')}
              placeholder={t('Value')}
              value={row.value}
              onChange={(_e, val) => updateRow(row.id, 'value', val)}
            />
          </GridItem>
          <GridItem span={1}>
            <Button variant="plain" aria-label={t('Remove')} onClick={() => removeRow(row.id)}>
              <MinusCircleIcon />
            </Button>
          </GridItem>
        </Grid>
      ))}
      <Button variant="link" icon={<PlusCircleIcon />} onClick={addRow}>
        {t('Add more')}
      </Button>
    </div>
  );
}

// --- EditAnnotationsModal ---
interface EditAnnotationsModalProps {
  namespace: V1NamespaceString;
  onClose: () => void;
  onSaved: (updated: V1NamespaceString) => void;
}

function EditAnnotationsModal({ namespace, onClose, onSaved }: EditAnnotationsModalProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const name = namespace.metadata.name!;

  const [rows, setRows] = useState<KVRow[]>(() =>
    toRows(namespace.metadata?.annotations, HIDDEN_ANNOTATION_KEYS),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setSaving(true);
    setError(null);
    const newAnnotationsVisible = toRecord(rows);
    const currentAnnotations = namespace.metadata?.annotations ?? {};

    const annotationPatch: Record<string, string | null> = { ...newAnnotationsVisible };
    for (const key of Object.keys(currentAnnotations)) {
      if (!HIDDEN_ANNOTATION_KEYS.includes(key) && !(key in newAnnotationsVisible)) {
        annotationPatch[key] = null;
      }
    }

    const hiddenAnnotations = Object.fromEntries(
      Object.entries(currentAnnotations).filter(([key]) => HIDDEN_ANNOTATION_KEYS.includes(key)),
    );

    namespacesApiClient
      .patch(name, {
        metadata: { annotations: { ...annotationPatch, ...hiddenAnnotations } },
      })
      .then((updated) => onSaved(updated))
      .catch((e: Error) => {
        setError(e.message ?? t('Failed to save annotations'));
        setSaving(false);
      });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="medium"
      title={t('Edit annotations')}
      actions={[
        <Button
          key="save"
          variant="primary"
          onClick={handleSave}
          isDisabled={saving}
          isLoading={saving}
        >
          {t('Save')}
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={saving}>
          {t('Cancel')}
        </Button>,
      ]}
    >
      {error && (
        <Alert variant="danger" title={t('Error')} isInline style={{ marginBottom: '1rem' }}>
          {error}
        </Alert>
      )}
      <KeyValueEditor rows={rows} onChange={setRows} idPrefix="annotations" />
    </Modal>
  );
}

// --- TenantNamespaceDetailPage ---
export default function TenantNamespaceDetailPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const { name } = useParams<{ name: string }>();

  const [namespace, setNamespace] = useState<V1NamespaceString | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [openModal, setOpenModal] = useState<'labels' | 'annotations' | null>(null);

  // Quotas section state
  const [quotaNames, setQuotaNames] = useState<string[]>([]);
  const [quotasLoaded, setQuotasLoaded] = useState(false);
  const [quotaSelectOpen, setQuotaSelectOpen] = useState(false);
  const [selectedQuotaName, setSelectedQuotaName] = useState('');
  // Individually fetched quota (has status.hard/used populated)
  const [selectedQuota, setSelectedQuota] = useState<V1ResourceQuota | null>(null);
  const [quotaLoaded, setQuotaLoaded] = useState(false);
  const [pool, setPool] = useState<ResourcePool | null>(null);
  const [poolName, setPoolName] = useState<string | null>(null);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [claims, setClaims] = useState<ResourcePoolClaim[]>([]);
  const [claimsLoaded, setClaimsLoaded] = useState(false);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);

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
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch namespace'));
        setLoaded(true);
      });
  }, [name, t, refreshToken]);

  // List ResourceQuotas to populate the dropdown
  useEffect(() => {
    if (!name) return;
    setQuotasLoaded(false);
    resourceQuotasApi
      .fetch({ namespace: name })
      .then((data) => {
        const names = (data.items ?? [])
          .map((q) => q.metadata?.name ?? '')
          .filter(Boolean);
        setQuotaNames(names);
        setQuotasLoaded(true);
        setSelectedQuotaName((prev) => (!prev && names.length > 0 ? names[0] : prev));
      })
      .catch(() => {
        setQuotasLoaded(true);
      });
  }, [name, refreshToken]);

  // Fetch the selected quota individually to get status.hard/used
  useEffect(() => {
    if (!name || !selectedQuotaName) {
      setSelectedQuota(null);
      setPool(null);
      setPoolName(null);
      return;
    }
    setQuotaLoaded(false);
    setSelectedQuota(null);
    resourceQuotasApi
      .fetch({ name: selectedQuotaName, namespace: name })
      .then((data) => {
        setSelectedQuota(data);
        setQuotaLoaded(true);
        // Derive pool from ownerReference
        const poolRef = data.metadata?.ownerReferences?.find((r) => r.kind === 'ResourcePool');
        const derivedPoolName =
          poolRef?.name ??
          (data.metadata?.name?.startsWith('capsule-pool-')
            ? data.metadata.name.slice('capsule-pool-'.length)
            : null);
        setPoolName(derivedPoolName);
      })
      .catch(() => {
        setQuotaLoaded(true);
        setPoolName(null);
      });
  }, [name, selectedQuotaName, refreshToken]);

  // Fetch the ResourcePool when poolName is known
  useEffect(() => {
    if (!poolName) {
      setPool(null);
      setPoolLoaded(true);
      return;
    }
    setPoolLoaded(false);
    resourcePoolsApi
      .fetch({ name: poolName })
      .then((data) => {
        setPool(data);
        setPoolLoaded(true);
      })
      .catch(() => {
        setPool(null);
        setPoolLoaded(true);
      });
  }, [poolName]);

  // Fetch all claims globally, filter client-side by pool + namespace (matches ResourcePoolDetailPage pattern)
  useEffect(() => {
    if (!name || !poolName) {
      setClaims([]);
      setClaimsLoaded(true);
      return;
    }
    setClaimsLoaded(false);
    setClaimsError(null);
    resourcePoolClaimsApi
      .fetch()
      .then((data) => {
        const filtered = (data.items ?? []).filter(
          (c) => c.spec.pool === poolName && c.metadata.namespace === name,
        );
        setClaims(filtered);
        setClaimsLoaded(true);
      })
      .catch((e: Error) => {
        setClaimsError(e.message ?? t('Failed to fetch claims'));
        setClaimsLoaded(true);
      });
  }, [name, poolName, refreshToken, t]);

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

  const labelEntries = Object.entries(namespace?.metadata?.labels ?? {});
  const annotationCount = Object.keys(visibleAnnotations(namespace?.metadata?.annotations)).length;

  const quotaHard = (selectedQuota?.status?.hard ?? {}) as Record<string, string>;
  const quotaUsed = (selectedQuota?.status?.used ?? {}) as Record<string, string>;
  const tenant = pool?.metadata?.labels?.['capsule.clastix.io/tenant'] ?? '';
  const poolAvailable =
    pool?.status?.allocation?.available ??
    pool?.status?.allocation?.hard ??
    pool?.spec.hard ??
    {};

  return (
    <>
      <DocumentTitle>{t('Namespace: {{name}}', { name })}</DocumentTitle>
      <ListPageHeader title={`${t('Namespace')}: ${name}`}>
        <Button
          variant="plain"
          aria-label={t('Refresh')}
          onClick={() => setRefreshToken((n) => n + 1)}
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
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}
        >
          <Title headingLevel="h2" size="lg">
            {t('Labels')}
          </Title>
          <Button variant="link" onClick={() => setOpenModal('labels')}>
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
          <span style={{ color: 'var(--pf-v5-global--Color--200)' }}>{t('No labels')}</span>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginTop: '2rem',
            marginBottom: '0.5rem',
          }}
        >
          <Title headingLevel="h2" size="lg">
            {t('Annotations')}
          </Title>
          <Button variant="link" onClick={() => setOpenModal('annotations')}>
            {t('Edit')}
          </Button>
        </div>
        <span>
          {annotationCount} {t('annotations')}
        </span>
      </PageSection>

      <PageSection className="console-plugin-capsule__claims-section">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}
        >
          <Title headingLevel="h2" size="lg">
            {t('Quotas')}
          </Title>
          {pool && (
            <Button variant="primary" onClick={() => setClaimModalOpen(true)}>
              {t('Create Claim')}
            </Button>
          )}
        </div>

        {!quotasLoaded && <Spinner aria-label={t('Loading quotas')} />}

        {quotasLoaded && quotaNames.length === 0 && (
          <span>{t('No resource quotas for this namespace.')}</span>
        )}

        {quotasLoaded && quotaNames.length > 0 && (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <Select
                isOpen={quotaSelectOpen}
                selected={selectedQuotaName}
                onSelect={(_e, val) => {
                  setSelectedQuotaName(String(val));
                  setQuotaSelectOpen(false);
                }}
                onOpenChange={setQuotaSelectOpen}
                toggle={(toggleRef) => (
                  <MenuToggle
                    ref={toggleRef}
                    onClick={() => setQuotaSelectOpen((o) => !o)}
                    isExpanded={quotaSelectOpen}
                  >
                    {selectedQuotaName || t('Select quota')}
                  </MenuToggle>
                )}
                shouldFocusToggleOnSelect
              >
                <SelectList>
                  {quotaNames.map((qName) => (
                    <SelectOption
                      key={qName}
                      value={qName}
                      isSelected={qName === selectedQuotaName}
                    >
                      {qName}
                    </SelectOption>
                  ))}
                </SelectList>
              </Select>
            </div>

            {!quotaLoaded && selectedQuotaName && (
              <Spinner aria-label={t('Loading quota')} />
            )}

            {quotaLoaded && selectedQuota && (
              <>
                <Title headingLevel="h3" size="md" style={{ marginBottom: '0.75rem' }}>
                  {t('Current usage')}
                </Title>
                <div className="console-plugin-capsule__gauges" style={{ marginBottom: '1.5rem' }}>
                  {Object.keys(quotaHard).map((resource) => (
                    <UsageGauge
                      key={resource}
                      resource={resource}
                      used={quotaUsed[resource]}
                      hard={quotaHard[resource]}
                    />
                  ))}
                  {Object.keys(quotaHard).length === 0 && (
                    <span>{t('No resource limits defined.')}</span>
                  )}
                </div>

                {poolName && (
                  <>
                    <Title headingLevel="h3" size="md" style={{ marginBottom: '0.75rem' }}>
                      {t('ResourcePoolClaims')}
                    </Title>
                    {!poolLoaded ? (
                      <Spinner aria-label={t('Loading pool')} />
                    ) : (
                      <ResourcePoolClaimsTable
                        claims={claims}
                        claimsLoaded={claimsLoaded}
                        claimsError={claimsError}
                        pool={pool}
                        onRefresh={() => setRefreshToken((n) => n + 1)}
                        emptyMessage={t('No claims for this namespace.')}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </PageSection>

      {openModal === 'labels' && namespace && (
        <EditLabelsModal
          namespace={namespace}
          onClose={() => setOpenModal(null)}
          onSaved={(updated) => {
            setNamespace(updated);
            setOpenModal(null);
          }}
        />
      )}
      {openModal === 'annotations' && namespace && (
        <EditAnnotationsModal
          namespace={namespace}
          onClose={() => setOpenModal(null)}
          onSaved={(updated) => {
            setNamespace(updated);
            setOpenModal(null);
          }}
        />
      )}
      {claimModalOpen && pool && (
        <CreateResourcePoolClaimModal
          poolName={pool.metadata.name}
          poolHard={poolAvailable}
          tenantName={tenant}
          defaultNamespace={name}
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
