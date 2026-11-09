import { expect, it } from 'vitest';
import { Database } from './database';
it('lets interactive work pass queued bots, without interleaving an active lease', async () => {
  const db = new Database();
  const order: string[] = [];
  try {
    const release = await db.lease();
    const bot = db.background(async () => {
      const r = await db.lease();
      order.push('bot');
      r();
    });
    const person = (async () => {
      const r = await db.lease();
      order.push('person');
      r();
    })();
    expect(order).toEqual([]);
    release();
    await Promise.all([bot, person]);
    expect(order).toEqual(['person', 'bot']);
  } finally {
    await db.close();
  }
});
it('services a background lease despite sustained foreground work', async () => {
  const db = new Database();
  const order: string[] = [];
  try {
    const release = await db.lease();
    const bot = db.background(async () => {
      const r = await db.lease();
      order.push('bot');
      r();
    });
    const people = Array.from({ length: 20 }, (_, i) =>
      (async () => {
        const r = await db.lease();
        order.push(String(i));
        r();
      })(),
    );
    release();
    await Promise.all([...people, bot]);
    expect(order.indexOf('bot')).toBeLessThanOrEqual(8);
  } finally {
    await db.close();
  }
});
