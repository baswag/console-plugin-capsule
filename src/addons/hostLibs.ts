// Loaded as a separate chunk, only when a module addon is actually used: re-exporting the
// whole of PatternFly defeats tree-shaking, so it shouldn't be part of the main bundle.
export * as PatternFly from '@patternfly/react-core';
