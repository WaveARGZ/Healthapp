import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code = readFileSync(new URL('../../public/timer-push-worker.js', import.meta.url), 'utf8');
test('a push shows only the fixed timer message and no supplied payload', async () => {
  const handlers = {}, shown = [];
  const self = { location: { origin: 'https://example.test' }, addEventListener: (name, fn) => { handlers[name] = fn; }, registration: { showNotification: async (...args) => shown.push(args) }, clients: {} };
  vm.runInNewContext(code, { self, URL });
  let work;
  handlers.push({ data: { text: () => 'private data should never be used' }, waitUntil: promise => { work = promise; } });
  await work;
  assert.equal(shown.length, 1);
  assert.equal(shown[0][0], 'BodyMake');
  assert.equal(shown[0][1].body, '休憩タイマーが終了しました。');
});
