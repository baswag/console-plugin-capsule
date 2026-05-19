import { RefObject, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import {
  ListPageHeader,
  Timestamp,
  consoleFetchJSON,
  useAccessReview,
} from '@openshift-console/dynamic-plugin-sdk';
import DocumentTitle from '../utils/DocumentTitle';
import {
  Alert,
  Button,
  MenuToggle,
  PageSection,
  Select,
  SelectList,
  SelectOption,
  Spinner,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { CAPSULE, Tenant, TenantResource } from '../utils/capsule';
import type { V1NamespaceString } from '../utils/k8s-types';

const { API_BASE, PROXY_BASE, TENANT_RESOURCES: TR, TENANTS } = CAPSULE;

const ALL_NS = '';
const ALL_TENANTS = '';

const TENANTS_URL = `${PROXY_BASE}/apis/${API_BASE}/${TENANTS.API_VERSION}/${TENANTS.API_KIND}`;

function nsUrl(tenant: string): string {
  if (tenant) {
    return `${PROXY_BASE}/api/v1/namespaces?labelSelector=${encodeURIComponent(`capsule.clastix.io/tenant=${tenant}`)}`;
  }
  return `${PROXY_BASE}/api/v1/namespaces`;
}

function apiUrl(namespace: string, tenant: string): string {
  const labelSelector = tenant
    ? `?labelSelector=${encodeURIComponent(`capsule.clastix.io/managed-by=${tenant}`)}`
    : '';
  if (!namespace) {
    return `${PROXY_BASE}/apis/${API_BASE}/${TR.API_VERSION}/${TR.API_KIND}${labelSelector}`;
  }
  return `${PROXY_BASE}/apis/${API_BASE}/${TR.API_VERSION}/namespaces/${namespace}/${TR.API_KIND}${labelSelector}`;
}

function detailUrl(namespace: string, name: string): string {
  return `/k8s/ns/${namespace}/${API_BASE}~${TR.API_VERSION}~${TR.API_KIND_SINGLE}/${name}`;
}

function createUrl(namespace: string): string {
  if (!namespace) {
    return `/k8s/all-namespaces/${API_BASE}~${TR.API_VERSION}~${TR.API_KIND_SINGLE}/~new`;
  }
  return `/k8s/ns/${namespace}/${API_BASE}~${TR.API_VERSION}~${TR.API_KIND_SINGLE}/~new`;
}

export default function TenantResourcePage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const navigate = useNavigate();

  const [selectedTenant, setSelectedTenant] = useState(ALL_TENANTS);
  const [tenantSelectOpen, setTenantSelectOpen] = useState(false);
  const [tenants, setTenants] = useState<string[]>([]);

  const [selectedNamespace, setSelectedNamespace] = useState(ALL_NS);
  const [nsSelectOpen, setNsSelectOpen] = useState(false);
  const [namespaces, setNamespaces] = useState<string[]>([]);

  const [items, setItems] = useState<TenantResource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [canCreate] = useAccessReview({
    group: API_BASE,
    resource: TR.API_KIND,
    namespace: selectedNamespace,
    verb: 'create',
  });

  useEffect(() => {
    consoleFetchJSON(TENANTS_URL)
      .then((data: { items: Tenant[] }) => {
        setTenants((data.items ?? []).map((tenant) => tenant.metadata.name));
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    setSelectedNamespace(ALL_NS);
    consoleFetchJSON(nsUrl(selectedTenant))
      .then((data: { items: V1NamespaceString[] }) => {
        setNamespaces((data.items ?? []).map((ns) => ns.metadata.name));
      })
      .catch(() => setNamespaces([]));
  }, [selectedTenant]);

  useEffect(() => {
    setLoaded(false);
    setError(null);
    consoleFetchJSON(apiUrl(selectedNamespace, selectedTenant))
      .then((data: { items: TenantResource[] }) => {
        setItems(data.items ?? []);
        setLoaded(true);
      })
      .catch((e: Error) => {
        setError(e.message ?? t('Failed to fetch TenantResources'));
        setLoaded(true);
      });
  }, [selectedNamespace, selectedTenant, t]);

  const tenantToggle = (toggleRef: RefObject<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => setTenantSelectOpen((o) => !o)}
      isExpanded={tenantSelectOpen}
    >
      {selectedTenant || t('All Tenants')}
    </MenuToggle>
  );

  const nsToggle = (toggleRef: RefObject<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => setNsSelectOpen((o) => !o)}
      isExpanded={nsSelectOpen}
    >
      {selectedNamespace || t('All Namespaces')}
    </MenuToggle>
  );

  return (
    <>
      <DocumentTitle>{t('Tenant Resources')}</DocumentTitle>
      <ListPageHeader title={t('Tenant Resources')}>
        {canCreate && (
          <Button variant="primary" onClick={() => navigate(createUrl(selectedNamespace))}>
            {t('Create TenantResource')}
          </Button>
        )}
      </ListPageHeader>

      <PageSection>
        <Toolbar>
          <ToolbarContent>
            <ToolbarItem>
              <Select
                isOpen={tenantSelectOpen}
                selected={selectedTenant || t('All Tenants')}
                onSelect={(_e, val) => {
                  setSelectedTenant(val === t('All Tenants') ? ALL_TENANTS : String(val));
                  setTenantSelectOpen(false);
                }}
                onOpenChange={setTenantSelectOpen}
                toggle={tenantToggle}
                shouldFocusToggleOnSelect
              >
                <SelectList>
                  <SelectOption value={t('All Tenants')} isSelected={!selectedTenant}>
                    {t('All Tenants')}
                  </SelectOption>
                  {tenants.map((tenant) => (
                    <SelectOption key={tenant} value={tenant} isSelected={tenant === selectedTenant}>
                      {tenant}
                    </SelectOption>
                  ))}
                </SelectList>
              </Select>
            </ToolbarItem>
            <ToolbarItem>
              <Select
                isOpen={nsSelectOpen}
                selected={selectedNamespace || t('All Namespaces')}
                onSelect={(_e, val) => {
                  setSelectedNamespace(val === t('All Namespaces') ? ALL_NS : String(val));
                  setNsSelectOpen(false);
                }}
                onOpenChange={setNsSelectOpen}
                toggle={nsToggle}
                shouldFocusToggleOnSelect
              >
                <SelectList>
                  <SelectOption value={t('All Namespaces')} isSelected={!selectedNamespace}>
                    {t('All Namespaces')}
                  </SelectOption>
                  {namespaces.map((ns) => (
                    <SelectOption key={ns} value={ns} isSelected={ns === selectedNamespace}>
                      {ns}
                    </SelectOption>
                  ))}
                </SelectList>
              </Select>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>

        {!loaded && <Spinner aria-label={t('Loading TenantResources')} />}
        {error && (
          <Alert variant="danger" title={t('Error loading TenantResources')} isInline>
            {error}
          </Alert>
        )}
        {loaded && !error && (
          <Table aria-label={t('TenantResources')} variant="compact">
            <Thead>
              <Tr>
                <Th>{t('Name')}</Th>
                <Th>{t('Namespace')}</Th>
                <Th>{t('Resources')}</Th>
                <Th>{t('Processed items')}</Th>
                <Th>{t('Created')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {items.length === 0 ? (
                <Tr>
                  <Td colSpan={5}>{t('No TenantResources found.')}</Td>
                </Tr>
              ) : (
                items.map((item) => (
                  <Tr key={`${item.metadata.namespace}/${item.metadata.name}`}>
                    <Td>
                      <Button
                        variant="link"
                        isInline
                        onClick={() =>
                          navigate(detailUrl(item.metadata.namespace ?? '', item.metadata.name))
                        }
                      >
                        {item.metadata.name}
                      </Button>
                    </Td>
                    <Td>{item.metadata.namespace}</Td>
                    <Td>{item.spec.resources?.length ?? 0}</Td>
                    <Td>{item.status?.processedItems?.length ?? 0}</Td>
                    <Td>
                      <Timestamp timestamp={item.metadata.creationTimestamp} />
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        )}
      </PageSection>
    </>
  );
}
