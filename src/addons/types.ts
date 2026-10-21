import type { ComponentType } from 'react';
import type * as ReactNS from 'react';
import type * as PatternFlyNS from '@patternfly/react-core';
import type { V1ObjectMetaString } from '../utils/k8s-types';

export const ADDON_API_VERSION = 'console-plugin-capsule/addons/v1';

/** Places in the plugin's pages where addon widgets can be rendered. */
export const ADDON_SLOTS = ['namespace.detail', 'tenant.row'] as const;
export type AddonSlotName = (typeof ADDON_SLOTS)[number];

/** Any Kubernetes object an addon slot can be bound to (Namespace, Tenant, ...). */
export interface AddonResource {
  apiVersion?: string;
  kind?: string;
  metadata: V1ObjectMetaString;
}

/**
 * A user-visible string from an addon manifest: either plain text, or a map of language code
 * to text (e.g. `{"en": "Backup", "de": "Sicherung"}`), resolved against the console's language.
 */
export type LocalizedText = string | Record<string, string>;

export interface StateText {
  /** Accessible name of the icon/button for this state (screen readers, `alt` of SVG icons). */
  alt?: LocalizedText;
  tooltip?: LocalizedText;
}

/** A Kubernetes label selector (`metav1.LabelSelector`). */
export interface LabelSelector {
  matchLabels?: Record<string, string>;
  matchExpressions?: {
    key: string;
    operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
    values?: string[];
  }[];
}

interface WidgetBase {
  id: string;
  slot: AddonSlotName;
  title?: LocalizedText;
  /** Only show the widget when the object's labels match this selector. */
  when?: LabelSelector;
  /**
   * How image-file icons are drawn: `"image"` (default) as-is in an `<img>`, or `"mask"` as a
   * monochrome silhouette filled with the current text colour (follows dark mode and the
   * toggle's on colour). Has no effect on `pf:` icons.
   */
  iconMode?: 'image' | 'mask';
}

/** A different icon per toggle state; a missing state falls back to the other one. */
export interface StateIcons {
  on?: string;
  off?: string;
}

export interface LabelToggleWidget extends WidgetBase {
  type: 'labelToggle';
  /** Label key that represents the toggle. */
  key: string;
  /** Value written when switched on; the toggle is "on" iff the label has exactly this value. */
  onValue?: string;
  /** Value written when switched off. Omitted: the label is removed instead. */
  offValue?: string;
  /**
   * `"value"` (default): on iff the label has exactly `onValue`. `"exists"`: on iff the label
   * is present, whatever its value; switching on writes `onValue` (default empty).
   */
  match?: 'value' | 'exists';
  /** One icon for both states, or `{ "on": …, "off": … }`. */
  icon?: string | StateIcons;
  /**
   * What happens when `when` doesn't match: `"hide"` (default) or `"disable"` (shown, not
   * clickable, with `text.notMatched` in the tooltip).
   */
  whenNotMatched?: 'hide' | 'disable';
  /** Never clickable, display only (e.g. the label is managed by automation). */
  readOnly?: boolean;
  text?: {
    on?: StateText;
    off?: StateText;
    readOnly?: LocalizedText;
    noPermission?: LocalizedText;
    /** Tooltip reason when disabled by `when` (with `whenNotMatched: "disable"`). */
    notMatched?: LocalizedText;
  };
  /** Confirmation prompts; `false` switches immediately without asking. */
  confirm?: { enable?: LocalizedText; disable?: LocalizedText } | false;
}

export type DateDisplayFormat = string | Intl.DateTimeFormatOptions;

export interface DateFormat {
  type: 'date';
  /** Token pattern (YYYY, MM, DD, HH, mm, ss), `"unix"` (seconds) or `"iso"` (RFC 3339). */
  input?: string;
  /** Token pattern, `Intl.DateTimeFormat` options, or `"relative"`. */
  display?: DateDisplayFormat;
  /** Time zone used to interpret and display the value: `"UTC"` (default) or `"local"`. */
  timezone?: 'UTC' | 'local';
}

export interface LabelValueWidget extends WidgetBase {
  type: 'labelValue';
  source?: 'label' | 'annotation';
  key: string;
  icon?: string;
  /** Text template; `{{value}}`, `{{raw}}`, `{{name}}` and (for dates) `{{days}}` are replaced. */
  text?: LocalizedText;
  alt?: LocalizedText;
  tooltip?: LocalizedText;
  /** Shown when the label/annotation is missing. Omitted: the widget is hidden. */
  emptyText?: LocalizedText;
  format?: DateFormat;
  /** For dates: show as a warning this many days before the date, as danger once it passed. */
  warnDays?: number;
}

export interface ModuleWidget extends WidgetBase {
  type: 'module';
  /** Path of an ES module, relative to the addon directory. */
  module: string;
  /** Named export to use; defaults to `default`. */
  export?: string;
  /** Free-form configuration handed to the module. */
  config?: unknown;
}

export type AddonWidget = LabelToggleWidget | LabelValueWidget | ModuleWidget;

/** A validated widget together with the addon it came from. */
export type LoadedWidget = AddonWidget & {
  addon: string;
  /** URL of the addon directory, with trailing slash. */
  baseUrl: string;
};

export interface AddonManifest {
  apiVersion: typeof ADDON_API_VERSION;
  widgets: AddonWidget[];
}

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  variant?: 'primary' | 'danger';
}

/** Thin client for the `capsule` console proxy, authenticated with the user's token. */
export interface AddonProxy {
  /** Base URL of the proxy, e.g. `/api/proxy/plugin/console-plugin-capsule/capsule`. */
  baseUrl: string;
  get: <T = unknown>(path: string) => Promise<T>;
  post: <T = unknown>(path: string, body: unknown) => Promise<T>;
  patch: <T = unknown>(path: string, body: unknown, contentType?: string) => Promise<T>;
  delete: <T = unknown>(path: string) => Promise<T>;
}

/** Handed to a module addon's factory function once, when the module is loaded. */
export interface AddonHost {
  apiVersion: typeof ADDON_API_VERSION;
  React: typeof ReactNS;
  /** The full `@patternfly/react-core` module bundled with this plugin. */
  PatternFly: typeof PatternFlyNS;
  /** Resolve an icon name (`pf:<name>`) to a component. */
  getIcon: (name: string) => ComponentType | undefined;
  proxy: AddonProxy;
  widget: { id: string; addon: string; baseUrl: string; config: unknown };
  language: string;
}

/** Props of the component a module addon returns. */
export interface AddonComponentProps<R extends AddonResource = AddonResource> {
  resource: R;
  slot: AddonSlotName;
  /** Rendered in a table cell rather than a page section. */
  compact: boolean;
  /** Whether the user may patch `resource`; `undefined` while the check is pending. */
  canPatch: boolean | undefined;
  /** Merge-patch the resource and update the page with the result. */
  patchResource: (patch: unknown) => Promise<R>;
  /** Re-fetch the resource and update the page. */
  refresh: () => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export type AddonModuleFactory = (
  host: AddonHost,
) => ComponentType<AddonComponentProps> | Promise<ComponentType<AddonComponentProps>>;
