import { createElement } from 'react';
import type { ComponentType, CSSProperties } from 'react';
import {
  ArchiveIcon,
  BellIcon,
  BoltIcon,
  BugIcon,
  CalendarAltIcon,
  CameraIcon,
  ChartLineIcon,
  CheckCircleIcon,
  ClockIcon,
  CloudIcon,
  CodeBranchIcon,
  CogIcon,
  CubeIcon,
  DatabaseIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FireIcon,
  FlagIcon,
  GlobeIcon,
  HddIcon,
  HeartbeatIcon,
  HistoryIcon,
  HourglassHalfIcon,
  InfoCircleIcon,
  KeyIcon,
  LeafIcon,
  LockIcon,
  LockOpenIcon,
  NetworkWiredIcon,
  PowerOffIcon,
  PuzzlePieceIcon,
  RobotIcon,
  RocketIcon,
  SaveIcon,
  ServerIcon,
  ShieldAltIcon,
  StarIcon,
  TagIcon,
  TimesCircleIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
  WrenchIcon,
} from '@patternfly/react-icons';
import type { SVGIconProps } from '@patternfly/react-icons/dist/esm/createIcon';
import { isSafeRelativePath } from './manifest';

// Curated instead of the whole icon set so tree-shaking keeps the bundle small. Addons
// needing something else can ship an SVG and reference it by relative path.
type IconComponent = ComponentType<SVGIconProps>;

export const PF_ICONS: Record<string, IconComponent> = {
  archive: ArchiveIcon,
  bell: BellIcon,
  bolt: BoltIcon,
  bug: BugIcon,
  'calendar-alt': CalendarAltIcon,
  camera: CameraIcon,
  'chart-line': ChartLineIcon,
  'check-circle': CheckCircleIcon,
  clock: ClockIcon,
  cloud: CloudIcon,
  'code-branch': CodeBranchIcon,
  cog: CogIcon,
  cube: CubeIcon,
  database: DatabaseIcon,
  'exclamation-circle': ExclamationCircleIcon,
  'exclamation-triangle': ExclamationTriangleIcon,
  eye: EyeIcon,
  fire: FireIcon,
  flag: FlagIcon,
  globe: GlobeIcon,
  hdd: HddIcon,
  heartbeat: HeartbeatIcon,
  history: HistoryIcon,
  'hourglass-half': HourglassHalfIcon,
  'info-circle': InfoCircleIcon,
  key: KeyIcon,
  leaf: LeafIcon,
  lock: LockIcon,
  'lock-open': LockOpenIcon,
  'network-wired': NetworkWiredIcon,
  'power-off': PowerOffIcon,
  'puzzle-piece': PuzzlePieceIcon,
  robot: RobotIcon,
  rocket: RocketIcon,
  save: SaveIcon,
  server: ServerIcon,
  'shield-alt': ShieldAltIcon,
  star: StarIcon,
  tag: TagIcon,
  'times-circle': TimesCircleIcon,
  trash: TrashIcon,
  user: UserIcon,
  users: UsersIcon,
  wrench: WrenchIcon,
};

export const FALLBACK_ICON = PuzzlePieceIcon;

/** `pf:<name>` → PatternFly icon component. */
export function getPfIcon(name: string): IconComponent | undefined {
  return name.startsWith('pf:') ? PF_ICONS[name.slice(3)] : undefined;
}

interface AddonIconProps {
  icon: string | undefined;
  baseUrl: string;
  /** How image files are drawn, see `iconMode` in the manifest. */
  mode?: 'image' | 'mask';
  /** Accessible name; empty when the surrounding control already carries it. */
  alt?: string;
  className?: string;
}

export function AddonIcon({ icon, baseUrl, mode = 'image', alt = '', className }: AddonIconProps) {
  if (icon && !icon.startsWith('pf:') && isSafeRelativePath(icon)) {
    const src = `${baseUrl}${icon}`;
    if (mode === 'mask') {
      // The file is the mask, the fill is `currentColor`, so monochrome icons follow the
      // theme like PatternFly's own. The URL can't be known in a stylesheet, hence the
      // custom property.
      return (
        <span
          className={`console-plugin-capsule__addon-img console-plugin-capsule__addon-img--mask ${
            className ?? ''
          }`}
          style={
            {
              '--console-plugin-capsule-addon-icon': `url(${JSON.stringify(src)})`,
            } as CSSProperties
          }
          role={alt ? 'img' : undefined}
          aria-label={alt || undefined}
          aria-hidden={alt ? undefined : true}
          data-test="addon-icon-mask"
        />
      );
    }
    return (
      <img
        src={src}
        alt={alt}
        className={`console-plugin-capsule__addon-img ${className ?? ''}`}
        data-test="addon-icon-img"
      />
    );
  }
  const Icon = (icon ? getPfIcon(icon) : undefined) ?? FALLBACK_ICON;
  return (
    <span className={className} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
      {createElement(Icon, { 'aria-hidden': true })}
    </span>
  );
}
