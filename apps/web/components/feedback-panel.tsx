'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from './session';
import { api } from '../lib/platform';
import { connectionDiagnostics } from '../lib/client-diagnostics';
import { LocaleView, NoTranslate, LocalizedDate } from './i18n';
interface Report {
  id: string;
  kind: string;
  subject: string;
  details: string;
  context: Record<string, string>;
  status: string;
  admin_note: string;
  created_at: string;
  player: string;
}
export function FeedbackPanel() {
  const { profile } = useSession(),
    dialog = useRef<HTMLDialogElement>(null),
    pending = useRef<{ id: string; signature: string } | null>(null);
  const [open, setOpen] = useState(false),
    [inbox, setInbox] = useState(false),
    [reports, setReports] = useState<Report[]>([]),
    [status, setStatus] = useState('open'),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sent, setSent] = useState(''),
    [diagnostics, setDiagnostics] = useState(true);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    setReports([]);
    setInbox(false);
    setSent('');
    pending.current = null;
  }, [profile?.id]);
  useEffect(() => {
    if (!open || !inbox || !profile?.isAdmin) return;
    let active = true;
    void api<Report[]>(`/admin/feedback?status=${status}`)
      .then((r) => {
        if (active) setReports(r);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [open, inbox, profile?.id, profile?.isAdmin, status, revision]);
  return (
    <LocaleView>
      <button
        className="outline-button feedback-trigger"
        aria-label="Feedback and bug reports"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">!</span>
        <span>Feedback / Report a bug</span>
      </button>
      <dialog
        ref={dialog}
        className="game-dialog menu-window feedback-dialog"
        onCancel={() => setOpen(false)}
      >
        <button className="dialog-close" aria-label="Close feedback" onClick={() => setOpen(false)}>
          ×
        </button>
        <h2>Playtest feedback</h2>
        {profile?.isAdmin && (
          <div className="ladder-tabs">
            <button aria-pressed={!inbox} onClick={() => setInbox(false)}>
              Send feedback
            </button>
            <button aria-pressed={inbox} onClick={() => setInbox(true)}>
              Reports inbox
            </button>
          </div>
        )}
        {inbox && profile?.isAdmin ? (
          <>
            <div className="feedback-filters">
              <label>
                Status
                <select
                  name="feedback-panel-select-1"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {['open', 'reviewing', 'resolved', 'dismissed', 'all'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <button className="outline-button" onClick={() => setRevision((r) => r + 1)}>
                Refresh
              </button>
            </div>
            {!reports.length && <p>No reports in this view.</p>}
            {reports.map((r) => (
              <article className="feedback-report" key={r.id}>
                <small>
                  <NoTranslate>{r.player}</NoTranslate> ·{' '}
                  <LocalizedDate value={r.created_at} format="datetime" /> · {r.kind}
                </small>
                <h3>
                  <NoTranslate>{r.subject}</NoTranslate>
                </h3>
                <p>
                  <NoTranslate>{r.details}</NoTranslate>
                </p>
                <details>
                  <summary>Diagnostics</summary>
                  <pre>{JSON.stringify(r.context, null, 2)}</pre>
                </details>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError('');
                    const values = new FormData(e.currentTarget);
                    try {
                      await api(`/admin/feedback/${r.id}`, {
                        status: values.get('status'),
                        note: values.get('note'),
                      });
                      setRevision((n) => n + 1);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <select name="status" defaultValue={r.status} aria-label="Report status">
                    {['open', 'reviewing', 'resolved', 'dismissed'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <textarea
                    name="note"
                    aria-label="Private admin note"
                    placeholder="Private admin note"
                    maxLength={2000}
                    defaultValue={r.admin_note}
                  />
                  <button disabled={busy} className="outline-button">
                    Save report
                  </button>
                </form>
              </article>
            ))}
          </>
        ) : sent ? (
          <>
            <p role="status">Report received. Thank you for helping test the game.</p>
            <p>
              <NoTranslate>#{sent.slice(0, 8)}</NoTranslate>
            </p>
            <button
              className="outline-button"
              onClick={() => {
                setSent('');
                setError('');
              }}
            >
              Send another report
            </button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || !profile) return;
              setBusy(true);
              setError('');
              const form = new FormData(e.currentTarget),
                body = {
                  kind: form.get('kind'),
                  subject: form.get('subject'),
                  details: form.get('details'),
                  context: diagnostics
                    ? {
                        page: location.pathname,
                        version: '0.1.2',
                        browser: navigator.userAgent,
                        matchId: profile.activeMatchId ?? '',
                        timings: connectionDiagnostics(),
                      }
                    : {},
                };
              const signature = JSON.stringify([body.kind, body.subject, body.details]);
              if (pending.current?.signature !== signature)
                pending.current = { id: crypto.randomUUID(), signature };
              try {
                const receipt = await api<{ id: string }>('/feedback', {
                  ...body,
                  requestId: pending.current.id,
                });
                pending.current = null;
                setSent(receipt.id);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>Found a bug or have a suggestion? Send it directly to the playtest team.</p>
            <label>
              Type
              <select name="kind">
                <option value="bug">Bug report</option>
                <option value="feedback">Suggestion / feedback</option>
              </select>
            </label>
            <label>
              Title
              <input
                name="subject"
                required
                minLength={3}
                maxLength={120}
                placeholder="What happened?"
              />
            </label>
            <label>
              Details
              <textarea
                name="details"
                required
                minLength={10}
                maxLength={4000}
                rows={6}
                placeholder="What did you do, what happened, and what did you expect?"
              />
            </label>
            <label className="checkbox-label">
              <input
                name="feedback-panel-input-2"
                type="checkbox"
                checked={diagnostics}
                onChange={(e) => setDiagnostics(e.target.checked)}
              />
              Include page, browser, connection timings and audio loading details
            </label>
            <p className="feedback-privacy">
              Do not include passwords or other private information. Reports are visible only to
              administrators.
            </p>
            <button className="primary-button" disabled={busy || !profile}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </dialog>
    </LocaleView>
  );
}
