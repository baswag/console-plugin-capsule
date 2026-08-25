import { CAPSULE_APIS, CapsuleClient } from './capsule';

describe('CapsuleClient', () => {
  it('builds a cluster-scoped detail URL', () => {
    const client = new CapsuleClient(CAPSULE_APIS.TENANTS);
    expect(client.getDetailUrl('team-a')).toBe(
      '/k8s/cluster/capsule.clastix.io~v1beta2~Tenant/team-a',
    );
  });

  it('builds a namespaced detail URL for core resources', () => {
    const client = new CapsuleClient({
      apiGroup: '',
      apiVersion: 'v1',
      apiKind: 'namespaces',
      apiKindSingle: 'Namespace',
    });
    expect(client.getDetailUrl('team-a-ns', 'team-a-ns')).toBe(
      '/k8s/ns/team-a-ns/~v1~Namespace/team-a-ns',
    );
  });

  it('builds a cluster-scoped create URL', () => {
    const client = new CapsuleClient(CAPSULE_APIS.TENANTS);
    expect(client.getCreateUrl()).toBe('/k8s/cluster/capsule.clastix.io~v1beta2~Tenant/~new');
  });

  it('builds a namespaced create URL', () => {
    const client = new CapsuleClient(CAPSULE_APIS.TENANT_RESOURCES);
    expect(client.getCreateUrl('team-a-ns')).toBe(
      '/k8s/ns/team-a-ns/capsule.clastix.io~v1beta2~TenantResource/~new',
    );
  });
});
