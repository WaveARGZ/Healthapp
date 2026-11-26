// Pure scheduling policy; the caller must serialize operations for each device.
// The endpoint is a secret bearer URL and must never be logged or returned.
const MAX_DELAY_MS = 24 * 60 * 60 * 1000;

export function validApplePushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      url.hostname.endsWith('.push.apple.com') && url.hostname.length > '.push.apple.com'.length &&
      !url.hash && url.pathname !== '/';
  } catch { return false; }
}

export function decideUpdate(previousVersion, update, now) {
  if (!Number.isSafeInteger(update?.version) || update.version < 1 || update.version <= previousVersion) {
    return { ok: false, reason: 'stale_version' };
  }
  if (update.kind === 'cancel') return { ok: true, version: update.version, alarm: null };
  if (update.kind !== 'schedule' || !Number.isSafeInteger(update.deadline) ||
      update.deadline <= now || update.deadline > now + MAX_DELAY_MS || !validApplePushEndpoint(update.endpoint)) {
    return { ok: false, reason: 'invalid_schedule' };
  }
  return { ok: true, version: update.version, alarm: { deadline: update.deadline, endpoint: update.endpoint } };
}

// Returns no push for a cancelled, stale, early, or very late alarm.
// The runtime must atomically mark it consumed before sending to avoid retries.
export function shouldSend(alarm, now) {
  return Boolean(alarm && Number.isSafeInteger(alarm.deadline) && validApplePushEndpoint(alarm.endpoint) &&
    now >= alarm.deadline && now <= alarm.deadline + 60_000);
}
