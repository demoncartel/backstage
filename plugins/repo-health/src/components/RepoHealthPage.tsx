import {
  Content,
  ContentHeader,
  Header,
  Link,
  Page,
  ResponseErrorPanel,
  SupportButton,
  Table,
  TableColumn,
  TableFilter,
} from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { parseEntityRef } from '@backstage/catalog-model';
import Box from '@material-ui/core/Box';
import Typography from '@material-ui/core/Typography';
import {
  RepoHealthSummary,
  SUPPORT_STATUS_RANK,
} from '@internal/backstage-plugin-repo-health-common';
import { repoHealthApiRef } from '../api';
import { SeverityChip, STATUS_LABEL, StatusChip } from './StatusChip';
import { relativeTime } from './time';
import { useAsyncValue } from './useAsyncValue';

type Row = RepoHealthSummary & {
  name: string;
  ownerLabel: string;
  systemLabel: string;
  statusLabel: string;
  versionsLabel: string;
  vulnTotal: number;
};

function statusLabelOf(s: RepoHealthSummary): string {
  if (s.skipped) return 'Not scanned';
  if (s.error) return 'Scan failed';
  return s.dotnetStatus ? STATUS_LABEL[s.dotnetStatus] : 'No .NET';
}

function toRow(s: RepoHealthSummary): Row {
  return {
    ...s,
    name: s.title ?? parseEntityRef(s.entityRef).name,
    ownerLabel: s.owner ?? '',
    systemLabel: s.system ?? '',
    statusLabel: statusLabelOf(s),
    versionsLabel: [...s.dotnetVersions, ...s.nodeVersions].join(', '),
    vulnTotal: s.vulnCritical + s.vulnHigh + s.vulnOther,
  };
}

const columns: TableColumn<Row>[] = [
  {
    title: 'Service',
    field: 'name',
    highlight: true,
    render: r => (
      <EntityRefLink entityRef={r.entityRef}>{r.name}</EntityRefLink>
    ),
  },
  {
    title: 'Owner',
    field: 'ownerLabel',
    render: r =>
      r.owner ? (
        <EntityRefLink entityRef={r.owner} defaultKind="group" />
      ) : null,
  },
  { title: 'System', field: 'systemLabel' },
  {
    title: 'Versions',
    field: 'versionsLabel',
    render: r =>
      r.versionsLabel || (
        <Typography variant="caption" color="textSecondary">
          none detected
        </Typography>
      ),
  },
  {
    title: '.NET status',
    field: 'statusLabel',
    defaultSort: 'desc',
    customSort: (a, b) =>
      (a.dotnetStatus ? SUPPORT_STATUS_RANK[a.dotnetStatus] : -1) -
      (b.dotnetStatus ? SUPPORT_STATUS_RANK[b.dotnetStatus] : -1),
    render: r =>
      r.dotnetStatus && !r.error && !r.skipped ? (
        <StatusChip status={r.dotnetStatus} />
      ) : (
        <Typography
          variant="caption"
          color={r.error ? 'error' : 'textSecondary'}
        >
          {r.statusLabel}
        </Typography>
      ),
  },
  {
    title: 'Critical',
    field: 'vulnCritical',
    type: 'numeric',
    render: r =>
      r.vulnCritical ? (
        <SeverityChip severity="critical" count={r.vulnCritical} />
      ) : (
        0
      ),
  },
  {
    title: 'High',
    field: 'vulnHigh',
    type: 'numeric',
    render: r =>
      r.vulnHigh ? <SeverityChip severity="high" count={r.vulnHigh} /> : 0,
  },
  {
    title: 'Other',
    field: 'vulnOther',
    type: 'numeric',
    render: r =>
      r.vulnOther ? (
        <SeverityChip severity="moderate" count={r.vulnOther} />
      ) : (
        0
      ),
  },
  { title: '2+ majors behind', field: 'outdatedMajor', type: 'numeric' },
  {
    title: 'Last scanned',
    field: 'scannedAt',
    render: r => (
      <span title={new Date(r.scannedAt).toLocaleString()}>
        {relativeTime(r.scannedAt)}
      </span>
    ),
  },
  { title: 'Repo', field: 'repo', hidden: true },
];

const filters: TableFilter[] = [
  { column: '.NET status', type: 'multiple-select' },
  { column: 'Owner', type: 'select' },
  { column: 'System', type: 'select' },
];

/** Estate-wide view of the stored scan results. */
export function RepoHealthPage() {
  const api = useApi(repoHealthApiRef);
  const { loading, value, error } = useAsyncValue(
    () => api.listReports(),
    [api],
  );
  const rows = (value ?? []).map(toRow);
  return (
    <Page themeId="tool">
      <Header
        title="Repo Health"
        subtitle=".NET versions, support status and vulnerable packages across the catalog"
      />
      <Content>
        <ContentHeader title="">
          <SupportButton>
            Scheduled scan of each component's GitHub repo. Status comes from
            Microsoft's .NET release metadata, vulnerabilities from OSV.dev.
          </SupportButton>
        </ContentHeader>
        {error ? (
          <ResponseErrorPanel error={error} />
        ) : (
          <Table<Row>
            title={`Components (${rows.length})`}
            isLoading={loading}
            columns={columns}
            data={rows}
            filters={filters}
            options={{
              paging: true,
              pageSize: 20,
              search: true,
              padding: 'dense',
            }}
            emptyContent={
              <Box p={2}>
                <Typography>
                  No scan results yet. The first scan runs shortly after the
                  backend starts. See the <Link to="/docs">docs</Link>.
                </Typography>
              </Box>
            }
          />
        )}
      </Content>
    </Page>
  );
}
