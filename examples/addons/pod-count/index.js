// Example module addon: shows the number of pods in the namespace, read through the
// capsule proxy with the console user's token. Plain JS without a build step: React and
// PatternFly come from the host, not from imports (bare `import 'react'` can't resolve here).
export default function createPodCount(host) {
  const { React, PatternFly, proxy, getIcon, widget } = host;
  const { Button, Label, Spinner } = PatternFly;
  const h = React.createElement;
  const CubeIcon = getIcon('pf:cube');
  const warnAbove = (widget.config && widget.config.warnAbove) || Infinity;

  function PodCount({ resource, compact }) {
    const name = resource.metadata.name;
    const [count, setCount] = React.useState(null);
    const [error, setError] = React.useState(null);

    const load = React.useCallback(() => {
      setError(null);
      proxy
        .get(`/api/v1/namespaces/${encodeURIComponent(name)}/pods`)
        .then((list) => setCount(list.items.length))
        .catch((e) => setError(e.message || String(e)));
    }, [name]);

    React.useEffect(() => {
      load();
    }, [load]);

    if (error) return h(Label, { status: 'danger' }, `Pods: ${error}`);
    if (count === null) return h(Spinner, { size: 'sm', 'aria-label': 'Loading pods' });
    return h(
      'span',
      null,
      h(
        Label,
        {
          status: count > warnAbove ? 'warning' : undefined,
          color: count > warnAbove ? undefined : 'blue',
          isCompact: compact,
          icon: CubeIcon ? h(CubeIcon) : undefined,
        },
        `${count} pods`,
      ),
      h(Button, { variant: 'link', isInline: true, onClick: load }, 'Reload'),
    );
  }

  return PodCount;
}
