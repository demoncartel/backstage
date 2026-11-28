import Chip from '@material-ui/core/Chip';
import { makeStyles } from '@material-ui/core/styles';
import type {
  Severity,
  SupportStatus,
} from '@internal/backstage-plugin-repo-health-common';

const useStyles = makeStyles({
  green: { backgroundColor: '#2e7d32', color: '#fff' },
  amber: { backgroundColor: '#ed6c02', color: '#fff' },
  red: { backgroundColor: '#c62828', color: '#fff' },
  darkred: { backgroundColor: '#7f0000', color: '#fff' },
  grey: { backgroundColor: '#757575', color: '#fff' },
  blue: { backgroundColor: '#1565c0', color: '#fff' },
});

export const STATUS_LABEL: Record<SupportStatus, string> = {
  supported: 'Supported',
  'eol-soon': 'EOL soon',
  eol: 'End of life',
  preview: 'Preview',
  unknown: 'Unknown',
  'n/a': 'n/a',
};

export function StatusChip(props: {
  status?: SupportStatus;
  size?: 'small' | 'medium';
}) {
  const classes = useStyles();
  if (!props.status) return null;
  const cls = {
    supported: classes.green,
    'eol-soon': classes.amber,
    eol: classes.red,
    preview: classes.blue,
    unknown: classes.grey,
    'n/a': classes.grey,
  }[props.status];
  return (
    <Chip
      size={props.size ?? 'small'}
      className={cls}
      label={STATUS_LABEL[props.status]}
    />
  );
}

export function SeverityChip(props: { severity: Severity; count?: number }) {
  const classes = useStyles();
  const cls = {
    critical: classes.darkred,
    high: classes.red,
    moderate: classes.amber,
    low: classes.grey,
    unknown: classes.grey,
  }[props.severity];
  const label =
    props.count === undefined
      ? props.severity
      : `${props.count} ${props.severity}`;
  return <Chip size="small" className={cls} label={label} />;
}
