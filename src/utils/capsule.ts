import { consoleFetchJSON } from '@openshift-console/dynamic-plugin-sdk';
import type { V1ObjectMetaString } from './k8s-types';

interface FetchOptions {
  labelSelector?: Record<string, string>;
  namespace?: string;
  name?: string;
  method?: 'POST' | 'GET' | 'DELETE';
}

export class CapsuleClient<T> {
  private proxyBase= '/api/proxy/plugin/console-plugin-capsule/capsule'
  constructor(
    private resource: {
      apiGroup: string;
      apiVersion: string;
      apiKind: string;
      apiKindSingle: string;
    },
  ) {}

  private get proxyUrl(): string {
    if (this.resource.apiGroup && this.resource.apiGroup !== '') {
      return [
        this.proxyBase,
        'apis',
        this.resource.apiGroup,
        this.resource.apiVersion,
        this.resource.apiKind,
      ].join('/');
    }
    return [this.proxyBase, 'api', this.resource.apiVersion, this.resource.apiKind].join('/');
  }

  private getNamespacedProxyUrl(namespace: string): string {
    if (this.resource.apiGroup && this.resource.apiGroup !== '') {
      return [
        this.proxyBase,
        'apis',
        this.resource.apiGroup,
        this.resource.apiVersion,
        'namespaces',
        namespace,
        this.resource.apiKind,
      ].join('/');
    }
    return [
      this.proxyBase,
      'api',
      this.resource.apiVersion,
      'namespaces',
      namespace,
      this.resource.apiKind,
    ].join('/');
  }

  async fetch(options: { name: string } & FetchOptions, json?: any): Promise<T>;
  async fetch(options?: FetchOptions, json?: any): Promise<{ items: T[] }>;
  async fetch(options?: FetchOptions, json?: any) {
    let url = this.proxyUrl;

    if (options?.namespace) {
      url = this.getNamespacedProxyUrl(options.namespace);
    }

    if (options?.name) {
      url = `${url}/${options.name}`;
    }

    if (options?.labelSelector) {
      let labelSelectorStrings: string[] = [];
      for (const selector of Object.keys(options.labelSelector)) {
        labelSelectorStrings.push(`${selector}=${options.labelSelector[selector]}`);
      }
      const query = new URLSearchParams({
        labelSelector: labelSelectorStrings.join(','),
      }).toString();
      url = `${url}/?${query}`;
    }

    if (options?.method === 'POST') {
      return consoleFetchJSON.post(url, json);
    }
    return consoleFetchJSON(url, options?.method);
  }

  getDetailUrl(name: string, namespace?: string) {
    if (namespace) {
      return `/k8s/ns/${namespace}/${this.resource.apiGroup}~${this.resource.apiVersion}~${this.resource.apiKindSingle}/${name}`;
    }
    return `/k8s/cluster/${this.resource.apiGroup}~${this.resource.apiVersion}~${this.resource.apiKindSingle}/${name}`;
  }

  getCreateUrl(namespace?: string) {
    if (namespace) {
      return `/k8s/ns/${namespace}/${this.resource.apiGroup}~${this.resource.apiVersion}~${this.resource.apiKindSingle}/~new`;
    }

    return `/k8s/cluster/${this.resource.apiGroup}~${this.resource.apiVersion}~${this.resource.apiKindSingle}/~new`;
  }
}

const CAPSULE_API_GROUP = 'capsule.clastix.io';

export const CAPSULE_APIS = {
  TENANTS: {
    apiGroup: CAPSULE_API_GROUP,
    apiKind: 'tenants',
    apiKindSingle: 'Tenant',
    apiVersion: 'v1beta2',
  },
  RESOURCE_POOLS: {
    apiGroup: CAPSULE_API_GROUP,
    apiKind: 'resourcepools',
    apiKindSingle: 'ResourcePool',
    apiVersion: 'v1beta2',
  },
  RESOURCE_POOL_CLAIMS: {
    apiGroup: CAPSULE_API_GROUP,
    apiKind: 'resourcepoolclaims',
    apiKindSingle: 'ResourcePoolClaim',
    apiVersion: 'v1beta2',
  },
  TENANT_RESOURCES: {
    apiGroup: CAPSULE_API_GROUP,
    apiKind: 'tenantresources',
    apiKindSingle: 'TenantResource',
    apiVersion: 'v1beta2',
  },
};

export interface TenantOwner {
  name: string;
  kind: string;
}

export interface Tenant {
  metadata: V1ObjectMetaString;
  spec: {
    owners?: TenantOwner[];
  };
  status?: {
    namespaces?: string[];
    size?: number;
    state?: string;
  };
}

export type ResourceQuantity = Record<string, string>;

export interface ResourcePool {
  metadata: V1ObjectMetaString;
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
  metadata: V1ObjectMetaString;
  spec: {
    pool: string;
    claim: ResourceQuantity;
  };
  status?: {
    hard?: ResourceQuantity;
    condition: {
      message: string;
    };
  };
}

export interface TenantResource {
  metadata: V1ObjectMetaString;
  spec: {
    resyncPeriod: string;
    pruningOnDelete?: boolean;
    resources?: {
      additionalMetadata?: {
        annotations?: Record<string, string>;
        labels?: Record<string, string>;
      };
      namespaceSelector?: {
        matchExpressions?: {
          key: string;
          operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
          values?: string[];
        }[];
        matchLabels?: Record<string, string>;
      };
      namespacedItems?: {
        kind: string;
        namespace: string;
        selector: {
          matchExpressions?: {
            key: string;
            operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
            values?: string[];
          }[];
          matchLabels?: Record<string, string>;
        };
        apiVersion?: string;
      };
      rawItems?: Object[];
    }[];
  };
  status: {
    processedItems: {
      kind: string;
      name: string;
      namespace: string;
      apiVersion?: string;
    }[];
  };
}
