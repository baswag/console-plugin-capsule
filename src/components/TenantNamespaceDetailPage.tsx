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
  Grid,
  GridItem,
  Label,
  LabelGroup,
  MenuToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  TextInput,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon, SyncAltIcon } from '@patternfly/react-icons';
import { CapsuleClient, CAPSULE_APIS } from '../utils/capsule';
import type { GlobalResourceQuota } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';
import { UsageGauge } from '../utils/common';
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
  const name = namespace.metadata.name;

  const [labels, setLabels] = useState<string[]>(() => labelsToStrings(namespace.metadata?.labels));
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
      .then((updated) => {
        onSaved(updated);
      })
      .catch((e: Error) => {
        setError(e.message ?? t('Failed to save labels'));
        setSaving(false);
      });
  };

  return (
    <Modal isOpen onClose={onClose} variant="medium">
      <ModalHeader title={t('Edit labels')} />
      <ModalBody>
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
            onChange={(_e, val) => {
              setInputValue(val);
            }}
            onKeyDown={handleKeyDown}
            placeholder={labels.length === 0 ? 'app=frontend' : undefined}
          >
            <LabelGroup>
              {labels.map((label) => (
                <Label
                  key={label}
                  onClose={() => {
                    removeLabel(label);
                  }}
                >
                  {label}
                </Label>
              ))}
            </LabelGroup>
          </TextInputGroupMain>
        </TextInputGroup>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={handleSave} isDisabled={saving} isLoading={saving}>
          {t('Save')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={saving}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
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

  const addRow = () => {
    onChange([...rows, { id: nextId(), key: '', value: '' }]);
  };
  const removeRow = (id: number) => {
    onChange(rows.filter((r) => r.id !== id));
  };
  const updateRow = (id: number, field: 'key' | 'value', val: string) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  };

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
              onChange={(_e, val) => {
                updateRow(row.id, 'key', val);
              }}
            />
          </GridItem>
          <GridItem span={6}>
            <TextInput
              id={`${idPrefix}-value-${row.id}`}
              aria-label={t('Value')}
              placeholder={t('Value')}
              value={row.value}
              onChange={(_e, val) => {
                updateRow(row.id, 'value', val);
              }}
            />
          </GridItem>
          <GridItem span={1}>
            <Button
              variant="plain"
              aria-label={t('Remove')}
              onClick={() => {
                removeRow(row.id);
              }}
            >
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
  const name = namespace.metadata.name;

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
      .then((updated) => {
        onSaved(updated);
      })
      .catch((e: Error) => {
        setError(e.message ?? t('Failed to save annotations'));
        setSaving(false);
      });
  };

  return (
    <Modal isOpen onClose={onClose} variant="medium">
      <ModalHeader title={t('Edit annotations')} />
      <ModalBody>
        {error && (
          <Alert variant="danger" title={t('Error')} isInline style={{ marginBottom: '1rem' }}>
            {error}
          </Alert>
        )}
        <KeyValueEditor rows={rows} onChange={setRows} idPrefix="annotations" />
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={handleSave} isDisabled={saving} isLoading={saving}>
          {t('Save')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={saving}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// --- TenantNamespaceDetailPage ---
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
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch namespace'));
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
        const matches = (data.items ?? []).filter((g) =>
          (g.status?.namespaces ?? Object.keys(g.status?.namespaceUsage ?? {})).includes(name),
        );
        setMatchingGrqs(matches);
        setGrqsLoaded(true);
        setSelectedGrqName((prev) =>
          !prev && matches.length > 0 ? matches[0].metadata.name : prev,
        );
      })
      .catch((e: Error) => {
        setGrqsError(e.message ?? t('Failed to fetch GlobalResourceQuotas'));
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

  const labelEntries = Object.entries(namespace?.metadata?.labels ?? {});
  const annotationCount = Object.keys(visibleAnnotations(namespace?.metadata?.annotations)).length;

  const selectedGrq =
    matchingGrqs.find((g) => g.metadata.name === selectedGrqName) ?? matchingGrqs[0];
  const grqHard = selectedGrq?.spec.quota.hard ?? {};
  const grqUsed = (name ? selectedGrq?.status?.namespaceUsage?.[name]?.used : undefined) ?? {};

  return (
    <>
      <DocumentTitle>{t('Namespace: {{name}}', { name })}</DocumentTitle>
      <ListPageHeader title={`${t('Namespace')}: ${name}`}>
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
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}
        >
          <Content component="h2">{t('Labels')}</Content>
          <Button
            variant="link"
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
          <span style={{ color: 'var(--pf-t--global--text--color--subtle)' }}>
            {t('No labels')}
          </span>
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
          <Content component="h2">{t('Annotations')}</Content>
          <Button
            variant="link"
            onClick={() => {
              setOpenModal('annotations');
            }}
          >
            {t('Edit')}
          </Button>
        </div>
        <span>
          {annotationCount} {t('annotations')}
        </span>
      </PageSection>

      <PageSection className="console-plugin-capsule__table-section">
        <Content component="h2" style={{ marginBottom: '1rem' }}>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1.5rem',
              }}
            >
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

            <Content component="h3" style={{ marginBottom: '0.75rem' }}>
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
