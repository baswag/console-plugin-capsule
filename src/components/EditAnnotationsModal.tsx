import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Grid,
  GridItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core';
import { MinusCircleIcon, PlusCircleIcon } from '@patternfly/react-icons';
import { CapsuleClient } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';
import './Gauges.css';

const namespacesApiClient = new CapsuleClient<V1NamespaceString>({
  apiGroup: '',
  apiVersion: 'v1',
  apiKind: 'namespaces',
  apiKindSingle: 'Namespace',
});

export const HIDDEN_ANNOTATION_KEYS = ['kubectl.kubernetes.io/last-applied-configuration'];

interface KVRow {
  id: number;
  key: string;
  value: string;
}

function toRows(record: Record<string, string> | undefined, hidden: string[]): KVRow[] {
  if (!record) return [];
  let id = 0;
  return Object.entries(record)
    .filter(([key]) => !hidden.includes(key))
    .map(([key, value]) => ({ id: id++, key, value }));
}

function toRecord(rows: KVRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((r) => r.key).map((r) => [r.key, r.value]));
}

export function visibleAnnotations(
  raw: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw ?? {}).filter(([k]) => !HIDDEN_ANNOTATION_KEYS.includes(k)),
  );
}

interface KeyValueEditorProps {
  rows: KVRow[];
  onChange: (rows: KVRow[]) => void;
  idPrefix: string;
  nextId: () => number;
}

function KeyValueEditor({ rows, onChange, idPrefix, nextId }: KeyValueEditorProps) {
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
              id={`${idPrefix}-key-${String(row.id)}`}
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
              id={`${idPrefix}-value-${String(row.id)}`}
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

interface EditAnnotationsModalProps {
  namespace: V1NamespaceString;
  onClose: () => void;
  onSaved: (updated: V1NamespaceString) => void;
}

export default function EditAnnotationsModal({
  namespace,
  onClose,
  onSaved,
}: EditAnnotationsModalProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const name = namespace.metadata.name;

  const [rows, setRows] = useState<KVRow[]>(() =>
    toRows(namespace.metadata.annotations, HIDDEN_ANNOTATION_KEYS),
  );
  // Continues numbering rows added via "Add more" past the ones toRows already assigned.
  const nextIdRef = useRef(rows.length);
  const nextId = () => nextIdRef.current++;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setSaving(true);
    setError(null);
    const newAnnotationsVisible = toRecord(rows);
    const currentAnnotations = namespace.metadata.annotations ?? {};

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
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t('Failed to save annotations'));
        setSaving(false);
      });
  };

  return (
    <Modal isOpen onClose={onClose} variant="medium">
      <ModalHeader title={t('Edit annotations')} />
      <ModalBody>
        {error && (
          <Alert
            variant="danger"
            title={t('Error')}
            isInline
            className="console-plugin-capsule__alert"
          >
            {error}
          </Alert>
        )}
        <KeyValueEditor rows={rows} onChange={setRows} idPrefix="annotations" nextId={nextId} />
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
