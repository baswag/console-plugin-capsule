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
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@patternfly/react-core';
import { CapsuleClient } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';

// Kubernetes namespace name validation: lowercase alphanumeric and hyphens, max 63 chars
const NS_PATTERN = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/;

interface CreateNamespaceModalProps {
  tenant: string;
  onClose: () => void;

  onCreated: (name: string) => void;
}

export default function CreateNamespaceModal({
  tenant,
  onClose,
  onCreated,
}: CreateNamespaceModalProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const namespacesApi = new CapsuleClient<V1NamespaceString>({
    apiGroup: '',
    apiVersion: 'v1',
    apiKind: 'namespaces',
    apiKindSingle: 'Namespace',
  });

  const isValid = NS_PATTERN.test(name);
  const showValidation = name.length > 0 && !isValid;

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
      .catch((e: Error) => {
        setError(e.message ?? t('Failed to create namespace'));
        setSubmitting(false);
      });
  };

  return (
    <Modal isOpen onClose={onClose} variant="small">
      <ModalHeader title={t('Create Namespace')} />
      <ModalBody>
        <p>{t('Namespace will be assigned to tenant: {{tenant}}', { tenant })}</p>
        {error && (
          <Alert variant="danger" title={t('Error')} isInline style={{ marginBottom: '1rem' }}>
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
            <TextInput
              id="ns-name"
              value={name}
              onChange={(_e, val) => {
                setName(val);
              }}
              validated={showValidation ? 'error' : 'default'}
              autoFocus
            />
            {showValidation && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">
                    {t(
                      'Must be lowercase alphanumeric characters or hyphens, and start/end with an alphanumeric character.',
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
