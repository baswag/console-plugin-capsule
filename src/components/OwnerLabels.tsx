import type { ReactNode } from 'react';
import { Label, LabelGroup } from '@patternfly/react-core';
import type { LabelProps } from '@patternfly/react-core';
import { CogIcon, UserIcon, UsersIcon } from '@patternfly/react-icons';
import type { TenantOwner } from '../utils/capsule';

// Fixed colour + icon per owner kind, so users, groups and service accounts are told apart
// at a glance without spelling the kind out next to every name.
const OWNER_KIND_STYLE: Record<string, { color: LabelProps['color']; icon: ReactNode }> = {
  User: { color: 'blue', icon: <UserIcon /> },
  Group: { color: 'purple', icon: <UsersIcon /> },
  ServiceAccount: { color: 'orange', icon: <CogIcon /> },
};

export function OwnerLabels({ owners }: { owners: TenantOwner[] }) {
  if (owners.length === 0) return <>—</>;
  return (
    <LabelGroup numLabels={5}>
      {owners.map((o) => {
        const style = OWNER_KIND_STYLE[o.kind] ?? { color: 'grey' as const, icon: undefined };
        return (
          <Label
            key={`${o.kind}/${o.name}`}
            color={style.color}
            icon={style.icon}
            title={`${o.name} (${o.kind})`}
          >
            {o.name}
          </Label>
        );
      })}
    </LabelGroup>
  );
}
