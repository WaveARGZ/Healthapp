import test from 'node:test';
import assert from 'node:assert/strict';
import { exportJWK, generateKeyPair, jwtVerify, importJWK } from 'jose';
import { createTimerHandler, sendApplePush, TimerMailbox } from './worker.ts';

const origin = 'https://healthapp-14a3f.web.app';
const endpoint = 'https://web.push.apple.com/3/device/synthetic';
const device = 'a'.repeat(43);
const configuredKeys = await generateKeyPair('ES256', { extractable: true });
const configuredPrivate = await exportJWK(configuredKeys.privateKey);
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(configuredPrivate.x, 'base64url'), Buffer.from(configuredPrivate.y, 'base64url')]).toString('base64url');
function setup(verify = async () => ({ uid: 'synthetic-user' })) {
  const received = [];
  const env = { VAPID_JWK: JSON.stringify(configuredPrivate), VAPID_PUBLIC_KEY: publicKey, TIMER_MAILBOX: { idFromName: name => name, get: id => ({ fetch: async req => { if (new URL(req.url).pathname === '/update') received.push({ id, body: await req.json() }); return Response.json({ ok: true }); } }) } };
  return { handle: createTimerHandler(verify), env, received };
}
function request(payload, headers = {}) {
  return new Request('https://timer.invalid/v1/update', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer fake', ...headers }, body: JSON.stringify(payload) });
}
test('requires allowed origin and authenticated user before routing', async () => {
  const h = setup(async () => { throw Error('unauthorized'); });
  assert.equal((await h.handle(request({ device, kind: 'cancel', version: 1 }), h.env)).status, 400);
  assert.equal(h.received.length, 0);
  assert.equal((await h.handle(request({ device, kind: 'cancel', version: 1 }, { Origin: 'https://evil.invalid' }), h.env)).status, 403);
});
test('isolates same device identifier per user and never sends credentials to mailbox', async () => {
  const first = setup(), second = setup(async () => ({ uid: 'another-user' }));
  const p = { device, kind: 'schedule', version: 1, deadline: Date.now() + 60000, endpoint };
  assert.equal((await first.handle(request(p), first.env)).status, 200);
  assert.equal((await second.handle(request(p), second.env)).status, 200);
  assert.notEqual(first.received[0].id, second.received[0].id);
  assert.deepEqual(first.received[0].body, { kind: 'schedule', version: 1, deadline: p.deadline, endpoint });
});
test('rejects oversized requests and missing configuration', async () => {
  const h = setup();
  assert.equal((await h.handle(request({ device, kind: 'schedule', padding: 'x'.repeat(5000) }), h.env)).status, 400);
  assert.equal(h.received.length, 0);
  h.env.VAPID_JWK = '';
  assert.equal((await h.handle(request({ device, kind: 'cancel', version: 1 }), h.env)).status, 503);
});
test('sends bodyless, short-lived push with a verifiable VAPID signature', async () => {
  const keys = await generateKeyPair('ES256', { extractable: true });
  const privateJwk = await exportJWK(keys.privateKey), publicJwk = await exportJWK(keys.publicKey);
  let call;
  await sendApplePush(endpoint, { VAPID_JWK: JSON.stringify(privateJwk), VAPID_PUBLIC_KEY: 'B'.repeat(87) }, async (url, options) => { call = { url, options }; return new Response(null, { status: 201 }); });
  assert.equal(call.url, endpoint);
  assert.equal(call.options.body, undefined);
  assert.equal(call.options.redirect, 'error');
  assert.equal(call.options.headers.TTL, '30');
  const token = /^vapid t=([^,]+), k=/.exec(call.options.headers.Authorization)[1];
  const claims = await jwtVerify(token, await importJWK(publicJwk, 'ES256'), { audience: 'https://web.push.apple.com' });
  assert.equal(claims.payload.sub, 'https://healthapp-14a3f.web.app/');
});
test('per-user quota fails closed while cancellation stays outside the quota', async () => {
  const records = new Map();
  const storage = { get: async k => records.get(k), put: async (k,v) => { records.set(k,v); }, delete: async k => records.delete(k), setAlarm: async () => {}, transaction: async f => f() };
  const mailbox = new TimerMailbox({ storage, blockConcurrencyWhile: async f => f() }, {});
  for (let i = 0; i < 200; i++) assert.equal((await mailbox.fetch(new Request('https://timer.internal/admit/user', { method: 'POST' }))).status, 200);
  assert.equal((await mailbox.fetch(new Request('https://timer.internal/admit/user', { method: 'POST' }))).status, 429);
  const response = await mailbox.fetch(new Request('https://timer.internal/update', { method: 'POST', body: JSON.stringify({ kind: 'cancel', version: 1 }) }));
  assert.equal(response.status, 200);
});
