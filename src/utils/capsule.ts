import { consoleFetchJSON } from '@openshift-console/dynamic-plugin-sdk';
import type { V1ObjectMetaString } from './k8s-types';

interface FetchOptions {
  labelSelector?: Record<string, string>;
  namespace?: string;
  name?: string;
  method?: 'POST' | 'GET' | 'DELETE';
}

export class CapsuleClient<T> {
  private proxyBase = '/api/proxy/plugin/console-plugin-capsule/capsule';
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
      const labelSelectorStrings: string[] = [];
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

  async patch(name: string, json: unknown, namespace?: string): Promise<T> {
    let url = this.proxyUrl;
    if (namespace) {
      url = this.getNamespacedProxyUrl(namespace);
    }
    url = `${url}/${name}`;
    return consoleFetchJSON(url, 'PATCH', {
      headers: { 'Content-Type': 'application/merge-patch+json' },
      body: JSON.stringify(json),
    });
  }

  async authCanI(opts: { verb: string; name?: string; namespace?: string }): Promise<boolean> {
    const ssarUrl = [
      this.proxyBase,
      'apis',
      'authorization.k8s.io',
      'v1',
      'selfsubjectaccessreviews',
    ].join('/');

    const result = await consoleFetchJSON.post(ssarUrl, {
      apiVersion: 'authorization.k8s.io/v1',
      kind: 'SelfSubjectAccessReview',
      spec: {
        resourceAttributes: {
          group: this.resource.apiGroup,
          name: opts.name,
          namespace: opts.namespace,
          resource: this.resource.apiKind,
          version: this.resource.apiVersion,
          verb: opts.verb,
        },
      },
    });
    return result.status.allowed ?? false;
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

export function addQuantity(a: string | undefined, b: string | undefined): string {
  if (!a) return b ?? '0';
  if (!b || b === '0') return a;
  const milliRe = /^(\d+(?:\.\d+)?)m$/;
  const binaryRe = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|Ei)$/;
  const plainRe = /^(\d+(?:\.\d+)?)$/;
  const am = a.match(milliRe),
    bm = b.match(milliRe);
  const ab = a.match(binaryRe),
    bb = b.match(binaryRe);
  const ap = a.match(plainRe),
    bp = b.match(plainRe);
  if (am && bm) return `${parseFloat(am[1]) + parseFloat(bm[1])}m`;
  if (ab && bb && ab[2] === bb[2]) return `${parseFloat(ab[1]) + parseFloat(bb[1])}${ab[2]}`;
  if (ap && bp) return String(parseFloat(ap[1]) + parseFloat(bp[1]));
  return a;
}

export interface ResourcePool {
  metadata: V1ObjectMetaString;
  spec: {
    hard: ResourceQuantity;
    selectors?: {
      matchLabels?: Record<string, string>;
    }[];
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
    pool: {
      name: string;
      uid: string;
    };
    conditions: {
      message: string;
      reason: string;
      status: 'True' | 'False';
      type: string;
      lastTransitionTime: string;
      observedGeneration: number;
    }[];
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
      rawItems?: object[];
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
