import { V1ObjectMeta, V1Namespace } from '@kubernetes/client-node';

export type V1ObjectMetaString = Omit<
  V1ObjectMeta,
  'creationTimestamp' | 'deletionTimestamp' | 'name'
> & {
  name: string;
  creationTimestamp: string;
  deletionTimestamp?: string;
};

export type V1NamespaceString = Omit<V1Namespace, 'metadata'> & {
  metadata: V1ObjectMetaString;
};
