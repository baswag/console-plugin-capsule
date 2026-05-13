import type { V1ObjectMetaString } from "./k8s-types";


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
  metadata: V1ObjectMetaString
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
  metadata: V1ObjectMetaString
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
  metadata: V1ObjectMetaString
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

export interface TenantResource {
  metadata: V1ObjectMetaString
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
