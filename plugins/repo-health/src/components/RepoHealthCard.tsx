import { useState } from 'react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  InfoCard,
  Link,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { useApi } from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import Box from '@material-ui/core/Box';
import IconButton from '@material-ui/core/IconButton';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import Tooltip from '@material-ui/core/Tooltip';
import Typography from '@material-ui/core/Typography';
import RefreshIcon from '@material-ui/icons/Refresh';
import type { RepoHealthReport } from '@internal/backstage-plugin-repo-health-common';
import { repoHealthApiRef } from '../api';
import { SeverityChip, StatusChip } from './StatusChip';
import { relativeTime } from './time';
import { useAsyncValue } from './useAsyncValue';

const TOP_FINDINGS = 5;

function sourceLabel(source: string) {
  return source === 'csproj' ? 'project' : source;
}

function DotnetSection({ report }: { report: RepoHealthReport }) {
  const dotnet = report.dotnet!;
  return (
    <Box mb={2}>
      <Box display="flex" alignItems="center" mb={1} style={{ gap: 8 }}>
        <Typography variant="subtitle2">.NET</Typography>
        <StatusChip status={dotnet.status} />
      </Box>
      <Table size="small">
        <TableBody>
          {dotnet.targets.map((t, i) => (
            <TableRow key={`${t.file}-${t.raw}-${i}`}>
              <TableCell>
                <b>{t.source === 'global.json' ? `SDK ${t.raw}` : t.raw}</b>
                <Typography
                  variant="caption"
                  display="block"
                  color="textSecondary"
                >
                  {sourceLabel(t.source)}: {t.file}
                </Typography>
              </TableCell>
              <TableCell>
                {t.product} {t.channel}
                {t.releaseType ? ` (${t.releaseType.toUpperCase()})` : ''}
              </TableCell>
              <TableCell>
                <StatusChip status={t.status} />
              </TableCell>
              <TableCell>
                <Typography variant="caption">
                  {t.eolDate
                    ? `${t.status === 'eol' ? 'Ended' : 'Ends'} ${t.eolDate}`
                    : ''}
                  {t.latestInChannel && t.latestInChannel !== t.raw
                    ? `${t.eolDate ? ' · ' : ''}latest ${t.latestInChannel}`
                    : ''}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function PackagesSection({ report }: { report: RepoHealthReport }) {
  const p = report.packages!;
  const total = p.vulnerabilities.length;
  const outdated = p.packages
    .filter(x => (x.majorsBehind ?? 0) >= 2)
    .sort((a, b) => (b.majorsBehind ?? 0) - (a.majorsBehind ?? 0));
  return (
    <Box mb={2}>
      <Box display="flex" alignItems="center" mb={1} style={{ gap: 8 }}>
        <Typography variant="subtitle2">
          Vulnerable packages: {total}
        </Typography>
        {(['critical', 'high', 'moderate', 'low'] as const).map(s =>
          p.counts[s] ? (
            <SeverityChip key={s} severity={s} count={p.counts[s]} />
          ) : null,
        )}
      </Box>
      <Typography variant="caption" color="textSecondary" display="block">
        {p.packages.length} NuGet package{p.packages.length === 1 ? '' : 's'}{' '}
        checked against OSV.dev
        {p.unchecked ? `, ${p.unchecked} not checked (no exact version)` : ''}.
      </Typography>
      {total > 0 && (
        <Table size="small">
          <TableBody>
            {p.vulnerabilities.slice(0, TOP_FINDINGS).map(v => (
              <TableRow key={`${v.id}-${v.package}-${v.version}`}>
                <TableCell>
                  <SeverityChip severity={v.severity} />
                </TableCell>
                <TableCell>
                  <b>{v.package}</b> {v.version}
                  {v.transitive ? ' (transitive)' : ''}
                  {v.fixedIn ? (
                    <Typography
                      variant="caption"
                      display="block"
                      color="textSecondary"
                    >
                      fixed in {v.fixedIn}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Link to={v.url}>{v.id}</Link>
                  {v.aliases.filter(a => a.startsWith('CVE-')).length ? (
                    <Typography variant="caption" display="block">
                      {v.aliases.filter(a => a.startsWith('CVE-')).join(', ')}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{v.summary}</Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {total > TOP_FINDINGS && (
        <Typography variant="caption">
          …and {total - TOP_FINDINGS} more. See{' '}
          <Link to="/repo-health">Repo Health</Link>.
        </Typography>
      )}
      {outdated.length > 0 && (
        <Box mt={1}>
          <Typography variant="subtitle2">
            2+ major versions behind: {outdated.length}
          </Typography>
          <Typography variant="caption">
            {outdated
              .map(o => `${o.name} ${o.version} → ${o.latestStable}`)
              .join(' · ')}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function NodeSection({ report }: { report: RepoHealthReport }) {
  const node = report.node!;
  return (
    <Box mb={2} display="flex" alignItems="center" style={{ gap: 8 }}>
      <Typography variant="subtitle2">Node.js</Typography>
      <StatusChip status={node.status} />
      <Typography variant="body2">
        {node.targets.map(t => `${t.raw} (${t.file})`).join(', ')}
      </Typography>
    </Box>
  );
}

/** Entity overview card. Displays stored scan results only. */
export function RepoHealthCard() {
  const { entity } = useEntity();
  const api = useApi(repoHealthApiRef);
  const entityRef = stringifyEntityRef(entity);
  const [refreshing, setRefreshing] = useState(false);
  const {
    loading,
    value: report,
    error,
    reload,
  } = useAsyncValue(() => api.getReport(entityRef), [api, entityRef]);

  const rescan = async () => {
    setRefreshing(true);
    try {
      await api.rescan(entityRef);
    } finally {
      setRefreshing(false);
      reload();
    }
  };

  const action = (
    <Tooltip title="Scan this repo now">
      <span>
        <IconButton aria-label="Rescan" onClick={rescan} disabled={refreshing}>
          <RefreshIcon />
        </IconButton>
      </span>
    </Tooltip>
  );

  let body: JSX.Element;
  if (loading || refreshing) {
    body = <Progress />;
  } else if (error) {
    body = <ResponseErrorPanel error={error} />;
  } else if (!report) {
    body = (
      <Typography variant="body2">
        Not scanned yet. Scans run on a schedule; use the refresh button to scan
        now.
      </Typography>
    );
  } else if (report.skipped || report.error) {
    body = (
      <Typography
        variant="body2"
        color={report.error ? 'error' : 'textSecondary'}
      >
        {report.error ? `Scan failed: ${report.error}` : report.skipped}
      </Typography>
    );
  } else {
    body = (
      <>
        {report.dotnet && <DotnetSection report={report} />}
        {report.packages && <PackagesSection report={report} />}
        {report.node && <NodeSection report={report} />}
        {!report.dotnet && !report.node && !report.packages && (
          <Typography variant="body2">
            No .NET or Node.js projects found in this repo.
          </Typography>
        )}
        {report.warnings.length > 0 && (
          <Box mt={1}>
            {report.warnings.map(w => (
              <Typography
                key={w}
                variant="caption"
                display="block"
                color="textSecondary"
              >
                ⚠ {w}
              </Typography>
            ))}
          </Box>
        )}
      </>
    );
  }

  const subheader = report?.repo
    ? `${report.repo}${report.path ? `/${report.path}` : ''}${
        report.ref ? ` @ ${report.ref}` : ''
      } · scanned ${relativeTime(report.scannedAt)}`
    : undefined;

  return (
    <InfoCard title="Repo health" subheader={subheader} action={action}>
      {body}
    </InfoCard>
  );
}
