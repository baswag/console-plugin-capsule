import { useEffect, useMemo, useState } from 'react';
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
  PageSection,
  Spinner,
  TextInput,
  Title,
} from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons';
import { CapsuleClient } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';
import './ResourcePoolDetailPage.css';

const namespacesApiClient = new CapsuleClient<V1NamespaceString>({
  apiGroup: '',
  apiVersion: 'v1',
  apiKind: 'namespaces',
  apiKindSingle: 'Namespace',
});

// Suppress the full JSON blob that clutters the annotations editor
const HIDDEN_ANNOTATION_KEYS = ['kubectl.kubernetes.io/last-applied-configuration'];

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

function recordSig(rec: Record<string, string>): string {
  return Object.entries(rec)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}\0${v}`)
    .join('\n');
}

function visibleAnnotations(raw: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw ?? {}).filter(([k]) => !HIDDEN_ANNOTATION_KEYS.includes(k)),
  );
}

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
        {t('Add')}
      </Button>
    </div>
  );
}

export default function TenantNamespaceDetailPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const { name } = useParams<{ name: string }>();

  const [namespace, setNamespace] = useState<V1NamespaceString | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [labelRows, setLabelRows] = useState<KVRow[]>([]);
  const [annotationRows, setAnnotationRows] = useState<KVRow[]>([]);
  const [savedLabels, setSavedLabels] = useState<Record<string, string>>({});
  const [savedAnnotations, setSavedAnnotations] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isDirty = useMemo(
    () =>
      recordSig(toRecord(labelRows)) !== recordSig(savedLabels) ||
      recordSig(toRecord(annotationRows)) !== recordSig(savedAnnotations),
    [labelRows, annotationRows, savedLabels, savedAnnotations],
  );

  useEffect(() => {
    if (!saveSuccess) return;
    const timer = setTimeout(() => {
      setSaveSuccess(false);
    }, 5000);
    return () => {
      clearTimeout(timer);
    };
  }, [saveSuccess]);

  useEffect(() => {
    if (!name) return;
    setLoaded(false);
    setLoadError(null);
    namespacesApiClient
      .fetch({ name })
      .then((data) => {
        setNamespace(data);
        setLabelRows(toRows(data.metadata?.labels));
        setAnnotationRows(toRows(data.metadata?.annotations, HIDDEN_ANNOTATION_KEYS));
        setSavedLabels(data.metadata?.labels ?? {});
        setSavedAnnotations(visibleAnnotations(data.metadata?.annotations));
        setLoaded(true);
      })
      .catch((e: Error) => {
        setLoadError(e.message ?? t('Failed to fetch namespace'));
        setLoaded(true);
      });
  }, [name, t]);

  const handleSave = () => {
    if (!name) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    // Re-attach any hidden annotations that were excluded from the editor
    const hiddenAnnotations = Object.fromEntries(
      Object.entries(namespace?.metadata?.annotations ?? {}).filter(([key]) =>
        HIDDEN_ANNOTATION_KEYS.includes(key),
      ),
    );

    namespacesApiClient
      .patch(name, {
        metadata: {
          labels: toRecord(labelRows),
          annotations: { ...toRecord(annotationRows), ...hiddenAnnotations },
        },
      })
      .then((updated) => {
        setNamespace(updated);
        setLabelRows(toRows(updated.metadata?.labels));
        setAnnotationRows(toRows(updated.metadata?.annotations, HIDDEN_ANNOTATION_KEYS));
        setSavedLabels(updated.metadata?.labels ?? {});
        setSavedAnnotations(visibleAnnotations(updated.metadata?.annotations));
        setSaving(false);
        setSaveSuccess(true);
      })
      .catch((e: Error) => {
        setSaveError(e.message ?? t('Failed to save changes'));
        setSaving(false);
      });
  };

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

  return (
    <>
      <DocumentTitle>{t('Namespace: {{name}}', { name })}</DocumentTitle>
      <ListPageHeader title={`${t('Namespace')}: ${name}`} />

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
        {saveSuccess && (
          <Alert
            variant="success"
            title={t('Changes saved')}
            isInline
            style={{ marginBottom: '1rem' }}
          >
            {t('Labels and annotations updated successfully.')}
          </Alert>
        )}
        {saveError && (
          <Alert
            variant="danger"
            title={t('Error saving changes')}
            isInline
            style={{ marginBottom: '1rem' }}
          >
            {saveError}
          </Alert>
        )}

        <Title headingLevel="h2" size="lg" style={{ marginBottom: '0.75rem' }}>
          {t('Labels')}
        </Title>
        <KeyValueEditor rows={labelRows} onChange={setLabelRows} idPrefix="labels" />

        <Title headingLevel="h2" size="lg" style={{ marginTop: '2rem', marginBottom: '0.75rem' }}>
          {t('Annotations')}
        </Title>
        <KeyValueEditor rows={annotationRows} onChange={setAnnotationRows} idPrefix="annotations" />

        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Button variant="primary" onClick={handleSave} isDisabled={saving} isLoading={saving}>
            {t('Save')}
          </Button>
          {isDirty && !saving && (
            <Label color="orange" isCompact>
              {t('Unsaved changes')}
            </Label>
          )}
        </div>
      </PageSection>
    </>
  );
}
