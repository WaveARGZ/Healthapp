import test from 'node:test';
import assert from 'node:assert/strict';
import { decideUpdate, shouldSend, validApplePushEndpoint } from './schedule.mjs';

const endpoint = 'https://web.push.apple.com/3/device/synthetic';
const now = 1_800_000_000_000;
test('accepts only valid Apple HTTPS endpoints', () => {
  assert.equal(validApplePushEndpoint(endpoint), true);
  for (const url of ['http://web.push.apple.com/a', 'https://push.apple.com/a', 'https://web.push.apple.com.attacker.invalid/a', 'https://user@web.push.apple.com/a', 'https://web.push.apple.com:443/', 'https://web.push.apple.com/a#fragment', 'https://127.0.0.1/a', null]) {
    assert.equal(validApplePushEndpoint(url), false);
  }
});
test('newer cancellation wins against late schedule and invalid requests', () => {
  const scheduled = decideUpdate(0, { kind: 'schedule', version: 1, deadline: now + 90_000, endpoint }, now);
  assert.equal(scheduled.ok, true);
  const cancelled = decideUpdate(scheduled.version, { kind: 'cancel', version: 2 }, now);
  assert.deepEqual(cancelled, { ok: true, version: 2, alarm: null });
  assert.equal(decideUpdate(cancelled.version, { kind: 'schedule', version: 1, deadline: now + 90_000, endpoint }, now).ok, false);
  assert.equal(decideUpdate(0, { kind: 'schedule', version: 1, deadline: now + 86_400_001, endpoint }, now).ok, false);
});
test('only due, recent alarms can send', () => {
  const alarm = { deadline: now + 1000, endpoint };
  assert.equal(shouldSend(alarm, now), false);
  assert.equal(shouldSend(alarm, now + 1000), true);
  assert.equal(shouldSend(alarm, now + 61_001), false);
  assert.equal(shouldSend(null, now + 1000), false);
});
