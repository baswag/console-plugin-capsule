import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { ListPageHeader, Timestamp, DocumentTitle } from '@openshift-console/dynamic-plugin-sdk';
import { Button, Label, Pagination, Spinner } from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import type { DataViewTr } from '@patternfly/react-data-view';
import {
  DataView,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
  DataViewToolbar,
} from '@patternfly/react-data-view';
import type { GlobalResourceQuota } from '../utils/capsule';
import { CAPSULE_APIS, CapsuleClient } from '../utils/capsule';
import { grqNamespaceCount, readyConditionStatus } from '../utils/common';
import { useNameFilter, useSortedPaginated } from '../utils/useListPage';

const globalResourceQuotasApi = new CapsuleClient<GlobalResourceQuota>(
  CAPSULE_APIS.GLOBAL_RESOURCE_QUOTAS,
);

const COLUMN_KEYS = ['name', 'namespaces', 'ready', 'created'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
const UNSORTABLE: ColumnKey[] = ['ready'];

const getSortValue = (grq: GlobalResourceQuota, key: ColumnKey): string | number => {
  switch (key) {
    case 'name':
      return grq.metadata.name;
    case 'namespaces':
      return grqNamespaceCount(grq.status);
    case 'created':
      return grq.metadata.creationTimestamp;
    default:
      return '';
  }
};

function ReadyLabel({ grq }: { grq: GlobalResourceQuota }) {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const status = readyConditionStatus(grq.status?.conditions);
  if (status === 'True') return <Label color="green">{t('Ready')}</Label>;
  if (status === 'False') return <Label color="red">{t('Not Ready')}</Label>;
  return <Label color="grey">{t('Unknown')}</Label>;
}

export default function GlobalResourceQuotasPage() {
  const { t } = useTranslation('plugin__console-plugin-capsule');
  const navigate = useNavigate();

  const [quotas, setQuotas] = useState<GlobalResourceQuota[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    setLoaded(false);
    setLoadError(null);
    globalResourceQuotasApi
      .fetch()
      .then((data) => {
        setQuotas(data.items);
        setLoaded(true);
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : t('Failed to fetch GlobalResourceQuotas'));
        setLoaded(true);
      });
  }, [t, refreshToken]);

  const { filtered, filters, onSetFilters } = useNameFilter(quotas);
  const { sorted, paginated, page, perPage, onSetPage, onPerPageSelect, buildColumns } =
    useSortedPaginated(filtered, COLUMN_KEYS, getSortValue, UNSORTABLE);

  const columnLabels: Record<ColumnKey, string> = {
    name: t('Name'),
    namespaces: t('Namespaces'),
    ready: t('Ready'),
    created: t('Created'),
  };

  const columns = buildColumns(columnLabels);

  const rows: DataViewTr[] = paginated.map((grq) => [
    <Button
      key="name"
      variant="link"
      isInline
      onClick={() => {
        navigate(`/capsule-global-resource-quotas/${grq.metadata.name}`);
      }}
    >
      {grq.metadata.name}
    </Button>,
    grqNamespaceCount(grq.status),
    <ReadyLabel key="ready" grq={grq} />,
    <Timestamp key="ts" timestamp={grq.metadata.creationTimestamp} />,
  ]);

  const activeState = !loaded
    ? DataViewState.loading
    : loadError
      ? DataViewState.error
      : filtered.length === 0
        ? DataViewState.empty
        : undefined;

  return (
    <>
      <DocumentTitle>{t('Global Resource Quotas')}</DocumentTitle>
      <ListPageHeader title={t('Global Resource Quotas')}>
        <Button
          variant="plain"
          aria-label={t('Refresh')}
          onClick={() => {
            setRefreshToken((n) => n + 1);
          }}
        >
          <SyncAltIcon />
        </Button>
      </ListPageHeader>
      <DataView activeState={activeState}>
        <DataViewToolbar
          filters={
            <DataViewTextFilter
              filterId="name"
              title={t('Name')}
              value={filters.name}
              onChange={(_e, val) => {
                onSetFilters({ name: val });
              }}
            />
          }
          pagination={
            <Pagination
              itemCount={sorted.length}
              page={page}
              perPage={perPage}
              onSetPage={onSetPage}
              onPerPageSelect={onPerPageSelect}
              isCompact
            />
          }
        />
        <DataViewTable
          columns={columns}
          rows={rows}
          bodyStates={{
            [DataViewState.loading]: <Spinner aria-label={t('Loading GlobalResourceQuotas')} />,
            [DataViewState.error]: <>{loadError}</>,
            [DataViewState.empty]: <>{t('No GlobalResourceQuotas found.')}</>,
          }}
        />
      </DataView>
    </>
  );
}
