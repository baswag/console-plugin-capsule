// Kubernetes object metadata validation, matching apimachinery's rules.

const DNS_SUBDOMAIN_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
const QUALIFIED_NAME_PART_RE = /^([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]$/;
const LABEL_VALUE_RE = /^(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?$/;

/** Label and annotation keys: `[<dns-subdomain prefix>/]<name>`. */
export function isQualifiedName(key: string): boolean {
  const parts = key.split('/');
  if (parts.length > 2) return false;
  const name = parts[parts.length - 1];
  if (name.length > 63 || !QUALIFIED_NAME_PART_RE.test(name)) return false;
  if (parts.length === 2) {
    const prefix = parts[0];
    return prefix.length > 0 && prefix.length <= 253 && DNS_SUBDOMAIN_RE.test(prefix);
  }
  return true;
}

/** Label values: at most 63 characters, alphanumeric at both ends, `-_.` inside; may be empty. */
export function isLabelValue(value: string): boolean {
  return value.length <= 63 && LABEL_VALUE_RE.test(value);
}
