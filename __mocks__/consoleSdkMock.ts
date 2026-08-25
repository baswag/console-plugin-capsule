// The real @openshift-console/dynamic-plugin-sdk is an ESM-only package provided by the
// console host at runtime. Jest doesn't transform node_modules by default, so unit tests
// that only exercise pure logic (URL building, etc.) use this stub instead.
export const consoleFetchJSON = Object.assign(() => Promise.resolve({}), {
  post: () => Promise.resolve({}),
  put: () => Promise.resolve({}),
  patch: () => Promise.resolve({}),
  delete: () => Promise.resolve({}),
});
