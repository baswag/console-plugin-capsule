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
import './Gauges.css';

// Kubernetes namespace name validation: lowercase alphanumeric and hyphens, max 63 chars
const NS_PATTERN = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/;

const namespacesApi = new CapsuleClient<V1NamespaceString>({
  apiGroup: '',
  apiVersion: 'v1',
  apiKind: 'namespaces',
  apiKindSingle: 'Namespace',
});

interface CreateNamespaceModalProps {
  tenant: string;
  /** When set, the namespace name is forced to `<tenant>-<suffix>` and only the suffix is editable. */
  forceTenantPrefix: boolean;
  onClose: () => void;

  onCreated: (name: string) => void;
}

export default function CreateNamespaceModal({
  tenant,
  forceTenantPrefix,
  onClose,
  onCreated,
}: CreateNamespaceModalProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefix = forceTenantPrefix ? `${tenant}-` : '';
  const name = `${prefix}${input}`;
  const isValid = input.length > 0 && NS_PATTERN.test(name);
  const showValidation = input.length > 0 && !isValid;

  const handleSubmit = () => {
    if (!isValid) return;
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
            labels: {
              'capsule.clastix.io/tenant': tenant,
            },
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
      <ModalHeader title={t('Create Namespace')} />
      <ModalBody>
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
            {forceTenantPrefix ? (
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
