import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  InputGroup,
  InputGroupItem,
  InputGroupText,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core';
import { CapsuleClient } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';
import { isLabelValue } from '../utils/k8sValidation';
import './Gauges.css';

// Kubernetes namespace name validation: lowercase alphanumeric and hyphens, max 63 chars
const NS_PATTERN = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/;

const namespacesApi = new CapsuleClient<V1NamespaceString>({
  apiGroup: '',
  apiVersion: 'v1',
  apiKind: 'namespaces',
  apiKindSingle: 'Namespace',
});

const TENANT_LABEL = 'capsule.clastix.io/tenant';

/** A label or annotation the user fills in when creating the namespace. */
export interface NamespaceMetadataField {
  kind: 'label' | 'annotation';
  key: string;
  /** Field label (friendly name). */
  title: string;
  /** Shown as `e.g. <example>` placeholder. */
  example?: string;
  help?: string;
  default?: string;
  /** Empty optional fields are left out of the namespace. */
  required?: boolean;
}

interface CreateNamespaceModalProps {
  tenant: string;
  /** When set, the namespace name is forced to `<tenant>-<suffix>` and only the suffix is editable. */
  forceTenantPrefix: boolean;
  /**
   * Fixed prefix for the namespace name when `forceTenantPrefix` is off; only the rest of the
   * name is editable. Ignored when `forceTenantPrefix` is set.
   */
  namePrefix?: string;
  /** Dialog title; defaults to "Create Namespace". */
  title?: string;
  description?: string;
  /** Labels set on the namespace without being shown. The tenant label always wins. */
  presetLabels?: Record<string, string>;
  /** Annotations set on the namespace without being shown. */
  presetAnnotations?: Record<string, string>;
  fields?: NamespaceMetadataField[];
  onClose: () => void;

  onCreated: (name: string) => void;
}

const fieldId = (f: NamespaceMetadataField) => `ns-${f.kind}-${f.key}`;

function fieldError(
  field: NamespaceMetadataField,
  value: string,
  t: (key: string) => string,
): string | null {
  if (value === '') return field.required ? t('This field is required.') : null;
  if (field.kind === 'label' && !isLabelValue(value)) {
    return t(
      'Must be at most 63 characters: letters, digits, "-", "_" or ".", starting and ending with a letter or digit.',
    );
  }
  return null;
}

export default function CreateNamespaceModal({
  tenant,
  forceTenantPrefix,
  namePrefix = '',
  title,
  description,
  presetLabels = {},
  presetAnnotations = {},
  fields = [],
  onClose,
  onCreated,
}: CreateNamespaceModalProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const [input, setInput] = useState('');
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [fieldId(f), f.default ?? ''])),
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefix = forceTenantPrefix ? `${tenant}-` : namePrefix;
  const name = `${prefix}${input}`;
  const nameValid = input.length > 0 && NS_PATTERN.test(name);
  const showValidation = input.length > 0 && !nameValid;
  const fieldErrors = Object.fromEntries(
    fields.map((f) => [fieldId(f), fieldError(f, values[fieldId(f)] ?? '', t)]),
  );
  const isValid = nameValid && Object.values(fieldErrors).every((e) => e === null);

  const handleSubmit = () => {
    if (!isValid) return;
    const filled = (kind: NamespaceMetadataField['kind']) =>
      Object.fromEntries(
        fields
          .filter((f) => f.kind === kind && values[fieldId(f)] !== '')
          .map((f) => [f.key, values[fieldId(f)]]),
      );
    const annotations = { ...presetAnnotations, ...filled('annotation') };
    setSubmitting(true);
    setError(null);

    namespacesApi
      .fetch(
        { method: 'POST' },
        {
          apiVersion: 'v1',
          kind: 'Namespace',
          metadata: {
            name,
            labels: { ...presetLabels, ...filled('label'), [TENANT_LABEL]: tenant },
            ...(Object.keys(annotations).length > 0 && { annotations }),
          },
        },
      )
      .then(() => {
        onCreated(name);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t('Failed to create namespace'));
        setSubmitting(false);
      });
  };

  return (
    <Modal isOpen onClose={onClose} variant="small">
      <ModalHeader title={title ?? t('Create Namespace')} />
      <ModalBody>
        {description && <p>{description}</p>}
        <p>{t('Namespace will be assigned to tenant: {{tenant}}', { tenant })}</p>
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
        <Form
          id="create-namespace-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <FormGroup label={t('Name')} isRequired fieldId="ns-name">
            {prefix ? (
              <InputGroup>
                <InputGroupText id="ns-name-prefix">{prefix}</InputGroupText>
                <InputGroupItem isFill>
                  <TextInput
                    id="ns-name"
                    aria-describedby="ns-name-prefix"
                    value={input}
                    onChange={(_e, val) => {
                      setInput(val);
                    }}
                    validated={showValidation ? 'error' : 'default'}
                    autoFocus
                  />
                </InputGroupItem>
              </InputGroup>
            ) : (
              <TextInput
                id="ns-name"
                value={input}
                onChange={(_e, val) => {
                  setInput(val);
                }}
                validated={showValidation ? 'error' : 'default'}
                autoFocus
              />
            )}
            {forceTenantPrefix && !showValidation && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>
                    {t('This tenant requires namespaces to be prefixed with the tenant name.')}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
            {showValidation && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t(
                      'Must be lowercase alphanumeric characters or hyphens, start/end with an alphanumeric character, and be at most 63 characters long.',
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
          {fields.map((field) => {
            const id = fieldId(field);
            const fieldErr = touched[id] ? fieldErrors[id] : null;
            const keyHint =
              field.kind === 'label'
                ? t('Label {{labelKey}}', { labelKey: field.key })
                : t('Annotation {{annotationKey}}', { annotationKey: field.key });
            return (
              <FormGroup key={id} label={field.title} isRequired={field.required} fieldId={id}>
                <TextInput
                  id={id}
                  value={values[id] ?? ''}
                  placeholder={
                    field.example ? t('e.g. {{example}}', { example: field.example }) : undefined
                  }
                  onChange={(_e, val) => {
                    setValues((v) => ({ ...v, [id]: val }));
                  }}
                  onBlur={() => {
                    setTouched((tc) => ({ ...tc, [id]: true }));
                  }}
                  validated={fieldErr ? 'error' : 'default'}
                  data-test={`ns-field-${field.kind}-${field.key}`}
                />
                <FormHelperText>
                  <HelperText>
                    {fieldErr ? (
                      <HelperTextItem variant="error">{fieldErr}</HelperTextItem>
                    ) : (
                      <HelperTextItem>{field.help ?? keyHint}</HelperTextItem>
                    )}
                  </HelperText>
                </FormHelperText>
              </FormGroup>
            );
          })}
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={handleSubmit}
          isDisabled={!isValid || submitting}
          isLoading={submitting}
        >
          {t('Create')}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={submitting}>
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
