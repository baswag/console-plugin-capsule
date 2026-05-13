export const CAPSULE = {
  PROXY_BASE: '/api/proxy/plugin/console-plugin-capsule/capsule',
  API_BASE: 'capsule.clastix.io',
  TENANTS: {
    API_KIND: 'tenants',
    API_KIND_SINGLE: 'Tenant',
    API_VERSION: 'v1beta2',
  },
  RESOURCE_POOLS: {
    API_KIND: 'resourcepools',
    API_KIND_SINGLE: 'ResourcePool',
    API_VERSION: 'v1beta2',
  },
  RESOURCE_POOL_CLAIMS: {
    API_KIND: 'resourcepoolclaims',
    API_KIND_SINGLE: 'ResourcePoolClaim',
    API_VERSION: 'v1beta2',
  },
};

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

export type ResourceQuantity = Record<string, string>;

export interface ResourcePool {
  metadata: {
    name: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
  };
  spec: {
    hard: ResourceQuantity;
    selectors?: Array<{
      matchLabels?: Record<string, string>;
    }>;
  };
  status?: {
    allocation?: {
      available?: ResourceQuantity;
      hard?: ResourceQuantity;
      used?: ResourceQuantity;
    };
  };
}

export interface ResourcePoolClaim {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
  };
  spec: {
    pool: string;
    claim: ResourceQuantity;
  };
  status?: {
    hard?: ResourceQuantity;
    condition: {
      message: string
    }
  };
}

export interface ResourcePoolFilters {
  name: string;
}

export function getPoolTenant(pool: ResourcePool): string {
  for (const sel of pool.spec.selectors ?? []) {
    const tenant = sel.matchLabels?.['capsule.clastix.io/tenant'];
    if (tenant) return tenant;
  }
  return pool.metadata.labels?.['capsule.clastix.io/tenant'] ?? '';
}

export function parseResourceValue(val: string): number {
  if (!val) return 0;
  const s = val.trim();
  if (s.endsWith('m')) return parseFloat(s) / 1000;
  if (s.endsWith('Ki')) return parseFloat(s) * 1024;
  if (s.endsWith('Mi')) return parseFloat(s) * 1024 ** 2;
  if (s.endsWith('Gi')) return parseFloat(s) * 1024 ** 3;
  if (s.endsWith('Ti')) return parseFloat(s) * 1024 ** 4;
  if (s.endsWith('K')) return parseFloat(s) * 1000;
  if (s.endsWith('M')) return parseFloat(s) * 1000 ** 2;
  if (s.endsWith('G')) return parseFloat(s) * 1000 ** 3;
  if (s.endsWith('T')) return parseFloat(s) * 1000 ** 4;
  return parseFloat(s) || 0;
}
