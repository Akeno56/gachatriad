import { PGlite } from '@electric-sql/pglite';
import type { PostgresPool, PostgresPoolClient } from 'kysely';
export type Sql = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
/** Serial leases protect the embedded PostgreSQL connection across Kysely and game transactions. */
export class Database {
  readonly pg: PGlite;
  private tail: Promise<void> = Promise.resolve();
  constructor(path?: string) {
    this.pg = new PGlite(path);
  }
  async lease() {
    let unlock!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((r) => (unlock = r));
    await previous;
    return unlock;
  }
  async read<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
    const release = await this.lease();
    try {
      return await work(
        async <T>(q: string, p: unknown[] = []) => (await this.pg.query<T>(q, p)).rows,
      );
    } finally {
      release();
    }
  }
  async tx<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
    return this.read(async (sql) => {
      await sql('BEGIN');
      try {
        const result = await work(sql);
        await sql('COMMIT');
        return result;
      } catch (error) {
        await sql('ROLLBACK');
        throw error;
      }
    });
  }
  async exec(sql: string) {
    const release = await this.lease();
    try {
      await this.pg.exec(sql);
    } finally {
      release();
    }
  }
  get pool(): PostgresPool {
    const db = this;
    return {
      async connect() {
        const release = await db.lease();
        return {
          async query(q: string, p: readonly unknown[] = []) {
            const r = await db.pg.query(q, [...p]);
            return {
              rows: r.rows,
              rowCount: r.affectedRows ?? r.rows.length,
              command: q.trim().split(/\s/)[0].toUpperCase(),
            };
          },
          release,
        } as PostgresPoolClient;
      },
      async end() {
        await db.pg.close();
      },
    };
  }
  async close() {
    await this.pg.close();
  }
}
