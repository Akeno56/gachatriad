'use client';
import { useRef, useState } from 'react';
import { useSession } from './session';
import { api } from '../lib/platform';
export function AdminGrant({ playerId, name }: { playerId: string; name: string }) {
  const { profile, refresh } = useSession(),
    [kind, setKind] = useState('prisms'),
    [amount, setAmount] = useState(150),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const pending = useRef<{ signature: string; id: string } | null>(null);
  if (!profile?.isAdmin) return null;
  return (
    <details className="menu-window admin-grant">
      <summary>Admin testing grants · {name}</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const body = { profileId: playerId, kind, amount },
              signature = JSON.stringify(body);
            if (pending.current?.signature !== signature)
              pending.current = { signature, id: crypto.randomUUID() };
            await api('/admin/grants', { ...body, requestId: pending.current.id });
            pending.current = null;
            setMessage(
              `Granted ${amount} ${kind === 'prisms' ? 'Stellar Prisms' : 'boosters'} to ${name}.`,
            );
            await refresh();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Grant
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setAmount(e.target.value === 'prisms' ? 150 : 3);
            }}
          >
            <option value="prisms">Stellar Prisms</option>
            <option value="boosters">Universe I boosters</option>
          </select>
        </label>
        <label>
          Amount
          <input
            type="number"
            min="1"
            max={kind === 'prisms' ? 1000000 : 100}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            required
          />
        </label>
        <button className="outline-button" disabled={busy}>
          Grant to {name}
        </button>
      </form>
      <p role="status">{message}</p>
    </details>
  );
}
