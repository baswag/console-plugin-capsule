import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core';
import { CapsuleClient } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';
import './Gauges.css';

const namespacesApiClient = new CapsuleClient<V1NamespaceString>({
  apiGroup: '',
  apiVersion: 'v1',
  apiKind: 'namespaces',
  apiKindSingle: 'Namespace',
});

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

interface EditLabelsModalProps {
  namespace: V1NamespaceString;
  onClose: () => void;
  onSaved: (updated: V1NamespaceString) => void;
}

export default function EditLabelsModal({ namespace, onClose, onSaved }: EditLabelsModalProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const name = namespace.metadata.name;

  const [labels, setLabels] = useState<string[]>(() => labelsToStrings(namespace.metadata.labels));
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

  const handleKeyDown = (e: KeyboardEvent) => {
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
    const currentLabels = namespace.metadata.labels ?? {};

    const labelPatch: Record<string, string | null> = { ...newLabels };
    for (const key of Object.keys(currentLabels)) {
      if (!(key in newLabels)) labelPatch[key] = null;
    }

    namespacesApiClient
      .patch(name, { metadata: { labels: labelPatch } })
      .then((updated) => {
        onSaved(updated);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t('Failed to save labels'));
        setSaving(false);
      });
  };

  return (
    <Modal isOpen onClose={onClose} variant="medium">
      <ModalHeader title={t('Edit labels')} />
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
        <p>
          {t(
            'Labels help you organize and select resources. Adding labels below will let you query for objects that have similar, overlapping or dissimilar labels.',
          )}
        </p>
        <p className="console-plugin-capsule__label-group">
          <strong>
            {t('Labels for')} {name}
          </strong>
        </p>
        <TextInputGroup className="console-plugin-capsule__input-group">
          <TextInputGroupMain
            value={inputValue}
            onChange={(_e, val) => {
              setInputValue(val);
            }}
            onKeyDown={handleKeyDown}
            placeholder={labels.length === 0 ? t('e.g. app=frontend') : undefined}
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
