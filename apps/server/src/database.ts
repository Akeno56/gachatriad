import { PGlite } from '@electric-sql/pglite';
import type { PostgresPool, PostgresPoolClient } from 'kysely';
import { AsyncLocalStorage } from 'node:async_hooks';
export type Sql = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
/** Serial leases protect the embedded PostgreSQL connection across Kysely and game transactions. */
export class Database {
  readonly pg: PGlite;
  private lane = new AsyncLocalStorage<'background'>();
  private held = false;
  private interactive: ((release: () => void) => void)[] = [];
  private backgroundQueue: ((release: () => void) => void)[] = [];
  private foregroundRun = 0;
  background<T>(work: () => Promise<T>): Promise<T> {
    return this.lane.run('background', work);
  }
  get queued() {
    return this.interactive.length + this.backgroundQueue.length;
  }
  constructor(path?: string) {
    this.pg = new PGlite(path);
  }
  async lease() {
    return new Promise<() => void>((resolve) => {
      (this.lane.getStore() === 'background' ? this.backgroundQueue : this.interactive).push(
        resolve,
      );
      if (!this.held) {
        this.held = true;
        this.grant();
      }
    });
  }
  private grant() {
    const background =
      this.backgroundQueue.length && (!this.interactive.length || this.foregroundRun >= 8);
    const next = background ? this.backgroundQueue.shift() : this.interactive.shift();
    if (!next) {
      this.held = false;
      return;
    }
    this.foregroundRun = background ? 0 : this.foregroundRun + 1;
    let released = false;
    next(() => {
      if (released) return;
      released = true;
      // Yield to socket I/O between embedded database leases, rather than draining microtasks.
      setImmediate(() => this.grant());
    });
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
