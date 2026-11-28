import type { Knex } from 'knex';
import {
  RepoHealthReport,
  RepoHealthSummary,
  summarizeReport,
} from '@internal/backstage-plugin-repo-health-common';

const TABLE = 'repo_health_reports';

/**
 * Migrations are inline (no migration files to package). Plain Knex schema
 * builder calls, so they work on SQLite and Postgres alike.
 */
const migrations: Record<string, Knex.Migration> = {
  '20261128_001_init': {
    async up(knex) {
      await knex.schema.createTable(TABLE, t => {
        t.string('entity_ref', 255).primary();
        t.string('repo', 255).notNullable();
        t.string('scanned_at', 40).notNullable();
        t.string('dotnet_status', 20).nullable();
        t.integer('vuln_critical').notNullable().defaultTo(0);
        t.integer('vuln_high').notNullable().defaultTo(0);
        t.integer('vuln_other').notNullable().defaultTo(0);
        t.text('report').notNullable();
      });
    },
    async down(knex) {
      await knex.schema.dropTable(TABLE);
    },
  },
};

class InlineMigrationSource implements Knex.MigrationSource<string> {
  async getMigrations() {
    return Object.keys(migrations).sort();
  }
  getMigrationName(name: string) {
    return name;
  }
  async getMigration(name: string) {
    return migrations[name];
  }
}

export class ReportStore {
  static async create(knex: Knex, options: { skipMigrations?: boolean } = {}) {
    if (!options.skipMigrations) {
      await knex.migrate.latest({
        migrationSource: new InlineMigrationSource(),
        tableName: 'repo_health__knex_migrations',
      });
    }
    return new ReportStore(knex);
  }

  private constructor(private readonly knex: Knex) {}

  async upsert(report: RepoHealthReport): Promise<void> {
    const s = summarizeReport(report);
    await this.knex(TABLE)
      .insert({
        entity_ref: report.entityRef,
        repo: report.repo,
        scanned_at: report.scannedAt,
        dotnet_status: s.dotnetStatus ?? null,
        vuln_critical: s.vulnCritical,
        vuln_high: s.vulnHigh,
        vuln_other: s.vulnOther,
        report: JSON.stringify(report),
      })
      .onConflict('entity_ref')
      .merge();
  }

  async get(entityRef: string): Promise<RepoHealthReport | undefined> {
    const row = await this.knex(TABLE)
      .where({ entity_ref: entityRef.toLowerCase() })
      .first();
    return row ? (JSON.parse(row.report) as RepoHealthReport) : undefined;
  }

  async list(): Promise<RepoHealthSummary[]> {
    const rows = await this.knex(TABLE).select('report').orderBy('entity_ref');
    return rows.map(r => summarizeReport(JSON.parse(r.report)));
  }

  /** Removes reports for entities that are no longer in the catalog. */
  async retainOnly(entityRefs: string[]): Promise<number> {
    const keep = new Set(entityRefs.map(r => r.toLowerCase()));
    const rows = await this.knex(TABLE).select('entity_ref');
    const stale = rows
      .map(r => r.entity_ref as string)
      .filter(r => !keep.has(r));
    for (let i = 0; i < stale.length; i += 100) {
      await this.knex(TABLE)
        .whereIn('entity_ref', stale.slice(i, i + 100))
        .delete();
    }
    return stale.length;
  }
}
