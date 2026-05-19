import { useState, useEffect, MouseEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { consoleFetchJSON } from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
  Button,
  Form,
  FormGroup,
  MenuToggle,
  Modal,
  Select,
  SelectList,
  SelectOption,
  TextInput,
} from '@patternfly/react-core';
import { CAPSULE, ResourceQuantity } from '../utils/capsule';

interface CreateResourcePoolClaimModalProps {
  poolName: string;
  poolHard: ResourceQuantity;
  tenantName: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateResourcePoolClaimModal({
  poolName,
  poolHard,
  tenantName,
  onClose,
  onCreated,
}: CreateResourcePoolClaimModalProps) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [nsSelectOpen, setNsSelectOpen] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [resources, setResources] = useState<ResourceQuantity>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initial: ResourceQuantity = {};
    for (const key of Object.keys(poolHard ?? {})) {
      initial[key] = '';
    }
    setResources(initial);
  }, [poolHard]);

  useEffect(() => {
    if (!tenantName) return;
    const url = `${CAPSULE.PROXY_BASE}/api/v1/namespaces?labelSelector=${encodeURIComponent(`capsule.clastix.io/tenant=${tenantName}`)}`;
    consoleFetchJSON(url)
      .then((data: { items: Array<{ metadata: { name: string } }> }) => {
        const names = (data.items ?? []).map((ns) => ns.metadata.name);
        setNamespaces(names);
        if (names.length > 0) setSelectedNamespace(names[0]);
      })
      .catch(() => setNamespaces([]));
  }, [tenantName]);

  const handleSubmit = () => {
    if (!selectedNamespace) return;
    setSubmitting(true);
    setError(null);

    const hard: ResourceQuantity = {};
    for (const [key, val] of Object.entries(resources)) {
      if (val.trim()) hard[key] = val.trim();
    }

    const claimName = `${poolName}-${selectedNamespace}`;
    const url = `${CAPSULE.PROXY_BASE}/apis/${CAPSULE.API_BASE}/${CAPSULE.RESOURCE_POOL_CLAIMS.API_VERSION}/namespaces/${selectedNamespace}/${CAPSULE.RESOURCE_POOL_CLAIMS.API_KIND}`;

    consoleFetchJSON
      .post(url, {
        apiVersion: `${CAPSULE.API_BASE}/${CAPSULE.RESOURCE_POOL_CLAIMS.API_VERSION}`,
        kind: CAPSULE.RESOURCE_POOL_CLAIMS.API_KIND_SINGLE,
        metadata: { name: claimName, namespace: selectedNamespace },
        spec: { pool: poolName , claim: hard },
      })
      .then(() => onCreated())
      .catch((e: Error) => {
        setError(e.message ?? t('Failed to create ResourcePoolClaim'));
        setSubmitting(false);
      });
  };

  const nsToggle = (toggleRef: RefObject<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => setNsSelectOpen((o) => !o)}
      isExpanded={nsSelectOpen}
    >
      {selectedNamespace || t('Select namespace')}
    </MenuToggle>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="medium"
      title={t('Create ResourcePoolClaim')}
      actions={[
        <Button
          key="create"
          variant="primary"
          onClick={handleSubmit}
          isDisabled={!selectedNamespace || submitting}
          isLoading={submitting}
        >
          {t('Create')}
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose} isDisabled={submitting}>
          {t('Cancel')}
        </Button>,
      ]}
    >
      <p>{t('Claim resources from pool: {{poolName}}', { poolName })}</p>
      {error && (
        <Alert variant="danger" title={t('Error')} isInline style={{ marginBottom: '1rem' }}>
          {error}
        </Alert>
      )}
      <Form>
        <FormGroup label={t('Namespace')} isRequired fieldId="claim-namespace">
          <Select
            isOpen={nsSelectOpen}
            selected={selectedNamespace}
            onSelect={(_: MouseEvent | undefined, val: string | number | undefined) => {
              setSelectedNamespace(String(val));
              setNsSelectOpen(false);
            }}
            onOpenChange={setNsSelectOpen}
            toggle={nsToggle}
            shouldFocusToggleOnSelect
          >
            <SelectList>
              {namespaces.map((ns) => (
                <SelectOption key={ns} value={ns} isSelected={ns === selectedNamespace}>
                  {ns}
                </SelectOption>
              ))}
            </SelectList>
          </Select>
        </FormGroup>
        {Object.keys(poolHard ?? {}).map((resource) => (
          <FormGroup
            key={resource}
            label={`${resource} (${t('max')}: ${poolHard[resource]})`}
            fieldId={`claim-${resource}`}
          >
            <TextInput
              id={`claim-${resource}`}
              value={resources[resource] ?? ''}
              placeholder={poolHard[resource]}
              onChange={(_e, val) => setResources((prev) => ({ ...prev, [resource]: val }))}
            />
          </FormGroup>
        ))}
      </Form>
    </Modal>
  );
}
