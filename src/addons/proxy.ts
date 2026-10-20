import { consoleFetchJSON } from '@openshift-console/dynamic-plugin-sdk';
import { CAPSULE_PROXY_BASE } from '../utils/capsule';
import type { AddonProxy } from './types';

function proxyUrl(path: string): string {
  if (!path.startsWith('/') || path.split(/[/?]/).includes('..')) {
    throw new Error(`addon proxy path must be absolute without "..": ${path}`);
  }
  return `${CAPSULE_PROXY_BASE}${path}`;
}

/** Proxy client handed to module addons; paths are Kubernetes API paths like `/api/v1/...`. */
export const addonProxy: AddonProxy = {
  baseUrl: CAPSULE_PROXY_BASE,
  get: (path) => consoleFetchJSON(proxyUrl(path)) as Promise<never>,
  post: (path, body) => consoleFetchJSON.post(proxyUrl(path), body) as Promise<never>,
  patch: (path, body, contentType = 'application/merge-patch+json') =>
    consoleFetchJSON(proxyUrl(path), 'PATCH', {
      headers: { 'Content-Type': contentType },
      body: JSON.stringify(body),
    }) as Promise<never>,
  delete: (path) => consoleFetchJSON(proxyUrl(path), 'DELETE') as Promise<never>,
};
