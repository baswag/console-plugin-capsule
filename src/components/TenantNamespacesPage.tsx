import type { MouseEvent, RefObject } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom-v5-compat';
import { ListPageHeader, DocumentTitle } from '@openshift-console/dynamic-plugin-sdk';
import {
  Button,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  ToolbarItem,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import type { Tenant } from '../utils/capsule';
import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import { TenantNamespaceList } from './TenantNamespaceList';

const tenantApiClient = new CapsuleClient<Tenant>(CAPSULE_APIS.TENANTS);

export default function TenantNamespacesPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const location = useLocation();
  const navigate = useNavigate();

  const selectedTenant = new URLSearchParams(location.search).get('tenant') ?? '';

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantSelectOpen, setTenantSelectOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    tenantApiClient
      .fetch()
      .then((data) => {
        setTenants(data.items);
      })
      .catch(() => {
        setTenants([]);
      });
  }, []);

  useEffect(() => {
    if (!selectedTenant && tenants.length > 0) {
      const first = tenants[0].metadata.name;
      navigate(`${location.pathname}?tenant=${first}`, { replace: true });
    }
  }, [tenants, selectedTenant, navigate, location.pathname]);

  const selectedTenantObj = tenants.find((tenant) => tenant.metadata.name === selectedTenant);

  const onTenantSelect = (_: MouseEvent | undefined, value: string | number | undefined) => {
    const name = String(value);
    setTenantSelectOpen(false);
    navigate(`${location.pathname}?tenant=${name}`);
  };

  const tenantToggle = (toggleRef: RefObject<HTMLButtonElement>) => (
    <MenuToggle
      ref={toggleRef}
      onClick={() => {
        setTenantSelectOpen((o) => !o);
      }}
      isExpanded={tenantSelectOpen}
    >
      {t('Tenant')}: {selectedTenant || t('Select tenant')}
    </MenuToggle>
  );

  return (
    <>
      <DocumentTitle>{t('Tenant Namespaces')}</DocumentTitle>
      <ListPageHeader title={t('Tenant Namespaces')}>
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
      <TenantNamespaceList
        tenantName={selectedTenant}
        tenant={selectedTenantObj}
        refreshToken={refreshToken}
        toolbarStart={
          <ToolbarItem>
            <Select
              isOpen={tenantSelectOpen}
              selected={selectedTenant}
              onSelect={onTenantSelect}
              onOpenChange={setTenantSelectOpen}
              toggle={tenantToggle}
              shouldFocusToggleOnSelect
            >
              <SelectList>
                {tenants.map((tenant) => (
                  <SelectOption
                    key={tenant.metadata.name}
                    value={tenant.metadata.name}
                    isSelected={tenant.metadata.name === selectedTenant}
                  >
                    {tenant.metadata.name}
                  </SelectOption>
                ))}
              </SelectList>
            </Select>
          </ToolbarItem>
        }
      />
    </>
  );
}
