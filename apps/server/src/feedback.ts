import { createHmac, randomUUID } from 'node:crypto';
import type { Database } from './database';
import { GameError } from './errors';
const states = ['open', 'reviewing', 'resolved', 'dismissed'];
export class Feedback {
  constructor(
    private db: Database,
    private secret: string,
  ) {}
  async create(profileId: string, network: string, body: Record<string, unknown>) {
    const { requestId, kind, subject, details } = body;
    if (
      typeof requestId !== 'string' ||
      !/^[\w-]{8,80}$/.test(requestId) ||
      !['bug', 'feedback'].includes(String(kind)) ||
      typeof subject !== 'string' ||
      subject.trim().length < 3 ||
      subject.trim().length > 120 ||
      typeof details !== 'string' ||
      details.trim().length < 10 ||
      details.trim().length > 4000
    )
      throw new GameError('Add a title and a description between 10 and 4,000 characters.');
    const context =
      body.context && typeof body.context === 'object'
        ? (body.context as Record<string, unknown>)
        : {};
    const clean = Object.fromEntries(
      ['page', 'version', 'browser', 'matchId', 'timings'].flatMap((key) =>
        typeof context[key] === 'string'
          ? [
              [
                key,
                String(context[key]).slice(
                  0,
                  key === 'timings' ? 3000 : key === 'browser' ? 300 : 160,
                ),
              ],
            ]
          : [],
      ),
    );
    if (clean.page) clean.page = clean.page.split(/[?#]/)[0];
    const hash = createHmac('sha256', this.secret).update(network).digest('hex');
    return this.db.tx(async (sql) => {
      const [old] = await sql<{ id: string; kind: string; subject: string; details: string }>(
        'SELECT id,kind,subject,details FROM feedback_reports WHERE profile_id=$1 AND request_id=$2',
        [profileId, requestId],
      );
      if (old) {
        if (old.kind !== kind || old.subject !== subject.trim() || old.details !== details.trim())
          throw new GameError('This report request has already been used.', 409);
        return { id: old.id };
      }
      const [rate] = await sql<{ recent: number; daily: number }>(
        "SELECT count(*) FILTER(WHERE created_at>now()-interval '5 minutes')::int AS recent,count(*)::int AS daily FROM feedback_reports WHERE network_hash=$1 AND created_at>now()-interval '1 day'",
        [hash],
      );
      if (rate.recent >= 3 || rate.daily >= 10)
        throw new GameError('Please wait before sending another report.', 429);
      const id = randomUUID();
      await sql(
        'INSERT INTO feedback_reports(id,profile_id,request_id,network_hash,kind,subject,details,context) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
        [
          id,
          profileId,
          requestId,
          hash,
          kind,
          subject.trim(),
          details.trim(),
          JSON.stringify(clean),
        ],
      );
      return { id };
    });
  }
  async list(status: unknown) {
    if (status !== undefined && status !== 'all' && !states.includes(String(status)))
      throw new GameError('Choose a report status.');
    return this.db.read((sql) =>
      sql(
        `SELECT r.id,r.profile_id,r.kind,r.subject,r.details,r.context,r.status,r.admin_note,r.created_at,r.updated_at,coalesce(p.name,'Deleted player') AS player FROM feedback_reports r LEFT JOIN profiles p ON p.id=r.profile_id WHERE ($1='all' OR r.status=$1) ORDER BY r.created_at DESC LIMIT 100`,
        [status || 'open'],
      ),
    );
  }
  async update(id: string, status: unknown, note: unknown) {
    if (!states.includes(String(status)) || typeof note !== 'string' || note.length > 2000)
      throw new GameError('Choose a report status and a note up to 2,000 characters.');
    const rows = await this.db.read((sql) =>
      sql(
        'UPDATE feedback_reports SET status=$2,admin_note=$3,updated_at=now() WHERE id=$1 RETURNING id',
        [id, status, note],
      ),
    );
    if (!rows.length) throw new GameError('Report not found.', 404);
    return { ok: true };
  }
}
