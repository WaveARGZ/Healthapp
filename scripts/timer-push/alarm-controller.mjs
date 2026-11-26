import { decideUpdate, shouldSend } from './schedule.mjs';
const CLEANUP_DELAY_MS = 25 * 60 * 60 * 1000;

// Storage and alarm changes must be run in one isolated Durable Object event.
// The persisted value intentionally has no uid, timer text, health data, or logs.
export async function applyTimerUpdate(storage, update, now) {
  let decision;
  // The read, validation, and writes must share one SQLite transaction.
  await storage.transaction(async () => {
    const previous = await storage.get('version') ?? 0;
    decision = decideUpdate(previous, update, now);
    if (!decision.ok) return;
    await storage.put('version', decision.version);
    if (decision.alarm) {
      await storage.put('pending', decision.alarm);
      await storage.delete('cleanupAt');
      await storage.setAlarm(decision.alarm.deadline);
    } else {
      await storage.delete('pending');
      // Keep the sequence long enough for delayed requests to become invalid.
      await storage.put('cleanupAt', now + CLEANUP_DELAY_MS);
      await storage.setAlarm(now + CLEANUP_DELAY_MS);
    }
  });
  if (!decision || !decision.ok) return decision ?? { ok: false, reason: 'not_available' };
  return { ok: true, version: decision.version };
}

// Mark consumed before calling the push service: an interrupted send can be lost,
// but must not create repeated notifications on automatic alarm retries.
export async function fireTimerAlarm(storage, now, send) {
  let pending;
  await storage.transaction(async () => {
    pending = await storage.get('pending');
    if (!pending) {
      const cleanupAt = await storage.get('cleanupAt');
      if (!Number.isSafeInteger(cleanupAt)) return;
      if (now < cleanupAt) { await storage.setAlarm(cleanupAt); return; }
      await storage.delete('version');
      await storage.delete('quota');
      await storage.delete('cleanupAt');
      return;
    }
    if (pending && now < pending.deadline) {
      await storage.setAlarm(pending.deadline);
      pending = null;
      return;
    }
    await storage.delete('pending');
    await storage.put('cleanupAt', now + CLEANUP_DELAY_MS);
    await storage.setAlarm(now + CLEANUP_DELAY_MS);
  });
  if (!shouldSend(pending, now)) return { sent: false };
  try { await send(pending.endpoint); return { sent: true }; }
  catch { return { sent: false }; }
}
