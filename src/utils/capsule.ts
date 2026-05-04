export const CAPSULE = {
  PROXY_BASE: '/api/proxy/plugin/console-plugin-capsule/capsule',
  API_BASE: 'capsule.clastix.io',
  TENANTS: {
    API_KIND: "tenants",
    API_KIND_SINGLE: 'Tenant',
    API_VERSION: "v1beta2"
  }
}


export interface TenantOwner {
  name: string;
  kind: string;
}

export interface Tenant {
  metadata: {
    name: string;
    creationTimestamp: string;
  };
  spec: {
    owners?: TenantOwner[];
  };
  status?: {
    namespaces?: string[];
    size?: number;
    state?: string;
  };
}

export interface TenantFilters {
  name: string;
}