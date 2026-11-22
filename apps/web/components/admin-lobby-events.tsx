'use client';

import { useEffect, useRef, useState } from 'react';
import { supportsTradeOne } from '@gacha-triad/engine';
import type { LobbyEvent } from '@gacha-triad/shared/platform';
import { api } from '../lib/platform';
import { publishSiteUpdate } from '../lib/site-updates';
import { LocaleView, LocalizedDate, NoTranslate } from './i18n';
import { MATCH_RULE_PRESETS, MatchRules, type MatchRulesPreset } from './rule-options';
import { Button, GameDialog } from './ui';

function localTime(value: number) {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function eventTime(value: string, original?: number) {
  if (original !== undefined && localTime(original) === value) return original;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp) || localTime(timestamp) !== value)
    throw Error('Choose a valid local date and time.');
  return timestamp;
}

const dateOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
} as const;

export function LobbyEventDates({ event }: { event: LobbyEvent }) {
  return (
    <span>
      <LocalizedDate value={event.startsAt} format="datetime" options={dateOptions} />
      {' – '}
      <LocalizedDate value={event.endsAt} format="datetime" options={dateOptions} />
    </span>
  );
}

export function AdminLobbyEvents({ events }: { events: LobbyEvent[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LobbyEvent>();
  const [cancelling, setCancelling] = useState<LobbyEvent>();
  const [preset, setPreset] = useState<MatchRulesPreset>('standard');
  const [rules, setRules] = useState(MATCH_RULE_PRESETS.standard.rules);
  const [trade, setTrade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const createId = useRef<string | undefined>(undefined);
  const tradeEligible = supportsTradeOne(rules);
  useEffect(() => {
    if (!tradeEligible) setTrade(false);
  }, [tradeEligible]);

  function select(event?: LobbyEvent) {
    setEditing(event);
    setCancelling(undefined);
    createId.current = undefined;
    setPreset(event ? 'custom' : 'standard');
    setRules(event?.rules ?? MATCH_RULE_PRESETS.standard.rules);
    setTrade(event?.tradeRule === 'one');
    setError('');
    setStatus('');
  }

  async function save(form: HTMLFormElement) {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      const fields = new FormData(form);
      const id = editing?.id ?? (createId.current ??= crypto.randomUUID());
      await api<LobbyEvent>(editing ? `/admin/lobby-events/${id}` : '/admin/lobby-events', {
        id,
        name: fields.get('event-name'),
        startsAt: eventTime(String(fields.get('event-start')), editing?.startsAt),
        endsAt: eventTime(String(fields.get('event-end')), editing?.endsAt),
        rules,
        tradeRule: trade && tradeEligible ? 'one' : 'none',
        allowBots: fields.has('event-bots'),
      });
      if (!editing) form.reset();
      publishSiteUpdate('lobby-events');
      if (!editing) select();
      setStatus(editing ? 'Lobby event updated.' : 'Lobby event scheduled.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelEvent(event: LobbyEvent) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await api(`/admin/lobby-events/${event.id}`, undefined, 'DELETE');
      if (editing?.id === event.id) select();
      setCancelling(undefined);
      publishSiteUpdate('lobby-events');
      setStatus('Lobby event cancelled.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <LocaleView>
      <Button
        variant="ghost"
        onClick={() => {
          select();
          setOpen(true);
        }}
      >
        Manage lobby events
      </Button>
      <GameDialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!busy}
        labelledBy="lobby-events-title"
        className="lobby-events-dialog"
      >
        <h2 id="lobby-events-title">Manage lobby events</h2>
        {events.length > 0 && (
          <ul className="lobby-event-list">
            {events.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>
                    <NoTranslate>{event.name}</NoTranslate>
                  </strong>
                  <LobbyEventDates event={event} />
                </div>
                <div className="lobby-event-actions">
                  <Button disabled={busy} onClick={() => select(event)}>
                    Edit event
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setCancelling(event)}>
                    Cancel event
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {cancelling && (
          <div className="lobby-event-actions">
            <span>Cancel this lobby event?</span>
            <Button disabled={busy} onClick={() => void cancelEvent(cancelling)}>
              Confirm cancellation
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setCancelling(undefined)}>
              Keep event
            </Button>
          </div>
        )}
        <form
          key={editing?.id ?? 'new'}
          onSubmit={(event) => {
            event.preventDefault();
            void save(event.currentTarget);
          }}
        >
          <h3>{editing ? 'Edit lobby event' : 'Schedule a lobby event'}</h3>
          <fieldset disabled={busy} className="lobby-event-form">
            <label>
              Event name
              <input name="event-name" maxLength={60} defaultValue={editing?.name} required />
            </label>
            <div className="lobby-event-times">
              <label>
                Starts
                <input
                  type="datetime-local"
                  name="event-start"
                  defaultValue={editing && localTime(editing.startsAt)}
                  required
                />
              </label>
              <label>
                Ends
                <input
                  type="datetime-local"
                  name="event-end"
                  defaultValue={editing && localTime(editing.endsAt)}
                  required
                />
              </label>
            </div>
            <small>
              Time zone ·{' '}
              <NoTranslate>{Intl.DateTimeFormat().resolvedOptions().timeZone}</NoTranslate>
            </small>
            <MatchRules preset={preset} onPreset={setPreset} rules={rules} onChange={setRules} />
            <div className="lobby-event-actions">
              <label className="check-label">
                <input type="checkbox" name="event-bots" defaultChecked={editing?.allowBots} />
                Allow bots
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={trade && tradeEligible}
                  disabled={!tradeEligible}
                  onChange={(e) => setTrade(e.target.checked)}
                />
                Trade One
              </label>
            </div>
            <div className="lobby-event-actions">
              <Button type="submit" variant="primary" busy={busy}>
                {editing ? 'Save event' : 'Schedule event'}
              </Button>
              {editing && <Button onClick={() => select()}>New event</Button>}
            </div>
          </fieldset>
        </form>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <p role="status">{status}</p>
      </GameDialog>
    </LocaleView>
  );
}
