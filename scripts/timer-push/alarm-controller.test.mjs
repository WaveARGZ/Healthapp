import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTimerUpdate, fireTimerAlarm } from './alarm-controller.mjs';

function memoryStorage() {
  const values = new Map(); let alarm = null;
  const tx = { get: async key => values.get(key), put: async (key, value) => values.set(key, value), delete: async key => values.delete(key), setAlarm: async value => { alarm = value; }, deleteAlarm: async () => { alarm = null; } };
  return { ...tx, transaction: async fn => fn(tx), alarm: () => alarm };
}
const endpoint = 'https://web.push.apple.com/3/device/synthetic';
const now = 1_800_000_000_000;
test('newer pause cancels schedule and old network requests cannot restore it', async () => {
  const storage = memoryStorage();
  await applyTimerUpdate(storage, { kind: 'schedule', version: 1, endpoint, deadline: now + 90000 }, now);
  assert.equal(storage.alarm(), now + 90000);
  await applyTimerUpdate(storage, { kind: 'cancel', version: 3 }, now);
  assert.equal(storage.alarm(), now + 25 * 60 * 60 * 1000);
  assert.equal((await applyTimerUpdate(storage, { kind: 'schedule', version: 2, endpoint, deadline: now + 100000 }, now)).ok, false);
  assert.deepEqual(await fireTimerAlarm(storage, now + 90000, () => { throw Error('must not send'); }), { sent: false });
  assert.equal((await applyTimerUpdate(storage, { kind: 'schedule', version: 2, endpoint, deadline: now + 100000 }, now + 90000)).ok, false, 'a spurious old alarm must not erase the cancellation version');
});
test('sends once and consumes even when network send fails', async () => {
  const storage = memoryStorage();
  await applyTimerUpdate(storage, { kind: 'schedule', version: 1, endpoint, deadline: now + 1000 }, now);
  assert.deepEqual(await fireTimerAlarm(storage, now, () => { throw Error('early'); }), { sent: false });
  assert.equal(storage.alarm(), now + 1000);
  assert.deepEqual(await fireTimerAlarm(storage, now + 1000, async () => { throw Error('network'); }), { sent: false });
  assert.deepEqual(await fireTimerAlarm(storage, now + 1001, () => { throw Error('duplicate'); }), { sent: false });
});
