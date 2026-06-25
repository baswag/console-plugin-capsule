import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Form, FormGroup, Modal, TextInput } from '@patternfly/react-core';
import type { ResourcePoolClaim, ResourceQuantity } from '../utils/capsule';
import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';

interface EditResourcePoolClaimModalProps {
  claim: ResourcePoolClaim;
  poolHard: ResourceQuantity;
  onClose: () => void;
  onEdited: () => void;
}

export default function EditResourcePoolClaimModal({
  claim,
  poolHard,
  onClose,
  onEdited,
}: EditResourcePoolClaimModalProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const [resources, setResources] = useState<ResourceQuantity>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resourcePoolClaimsApi = new CapsuleClient<ResourcePoolClaim>(
    CAPSULE_APIS.RESOURCE_POOL_CLAIMS,
  );

  useEffect(() => {
    const initial: ResourceQuantity = {};
    for (const key of Object.keys(poolHard)) {
      initial[key] = claim.spec.claim[key] ?? '';
    }
    setResources(initial);
  }, [poolHard, claim]);

  const handleSubmit = () => {
    const { name, namespace } = claim.metadata;
    if (!name || !namespace) return;
    setSubmitting(true);
    setError(null);

    const updated: ResourceQuantity = {};
    for (const [key, val] of Object.entries(resources)) {
      if (val.trim()) updated[key] = val.trim();
    }

    resourcePoolClaimsApi
      .patch(name, { spec: { claim: updated } }, namespace)
      .then(() => {
        onEdited();
      })
      .catch((e: Error) => {
        setError(e.message ?? t('Failed to update ResourcePoolClaim'));
        setSubmitting(false);
      });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="medium"
      title={t('Edit ResourcePoolClaim')}
      actions={[
        <Button
          key="save"
          variant="primary"
          onClick={handleSubmit}
          isDisabled={submitting}
          isLoading={submitting}
        >
          {t('Save')}
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={submitting}>
          {t('Cancel')}
        </Button>,
      ]}
    >
      {error && (
        <Alert variant="danger" title={t('Error')} isInline style={{ marginBottom: '1rem' }}>
          {error}
        </Alert>
      )}
      <p>{t('Edit claim for pool: {{poolName}}', { poolName: claim.spec.pool })}</p>
      <Form>
        {Object.keys(poolHard).map((resource) => (
          <FormGroup
            key={resource}
            label={`${resource} (${t('max')}: ${poolHard[resource]})`}
            fieldId={`edit-${resource}`}
          >
            <TextInput
              id={`edit-${resource}`}
              value={resources[resource] ?? ''}
              placeholder={poolHard[resource]}
              onChange={(_e, val) => {
                setResources((prev) => ({ ...prev, [resource]: val }));
              }}
            />
          </FormGroup>
        ))}
        {Object.keys(poolHard).length === 0 && <span>{t('No resource limits defined.')}</span>}
      </Form>
    </Modal>
  );
}
