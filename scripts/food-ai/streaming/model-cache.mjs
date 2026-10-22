// A bounded init-only RAM layer avoids repeated Drive transfers for the same asset.
// Transformers may call match twice for one model, and needs a fresh Response each time.
export function createDriveModelCache({ cacheUrl, cacheToken, fetchImpl = fetch, maxBytes = 384 * 1024 * 1024 }) {
  const headers = { "X-BodyMake-Bridge": cacheToken };
  const values = new Map(), pending = new Map();
  let retained = 0;
  let transfer = Promise.resolve();
  const serial = (task) => {
    const result = transfer.then(task);
    transfer = result.catch(() => {});
    return result;
  };
  const remember = (key, bytes) => {
    if (bytes.byteLength > maxBytes) throw new Error("Model asset RAM limit exceeded");
    const old = values.get(key);
    if (old) retained -= old.byteLength;
    values.delete(key);
    while (retained + bytes.byteLength > maxBytes && values.size) {
      const oldest = values.keys().next().value;
      retained -= values.get(oldest).byteLength;
      values.delete(oldest);
    }
    values.set(key, bytes);
    retained += bytes.byteLength;
  };
  const boundedBytes = async (response) => {
    const length = Number(response.headers.get("content-length"));
    if (length > maxBytes) { await response.body?.cancel(); throw new Error("Model asset RAM limit exceeded"); }
    const chunks = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error("Model asset RAM limit exceeded");
        chunks.push(value);
      }
    } catch (error) { await reader.cancel(); throw error; }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  };
  return {
    async match(key) {
      key = String(key);
      if (!values.has(key) && !pending.has(key)) {
        pending.set(key, serial(async () => {
          const response = await fetchImpl(cacheUrl(key), { headers });
          if (response.status === 404) { await response.body?.cancel(); return undefined; }
          if (!response.ok) { await response.body?.cancel(); throw new Error("Drive cache read failed"); }
          const bytes = await boundedBytes(response);
          remember(key, bytes);
          return bytes;
        }));
      }
      let bytes = values.get(key);
      if (!bytes) {
        try { bytes = await pending.get(key); }
        finally { pending.delete(key); }
      }
      return bytes ? new Response(bytes) : undefined;
    },
    async put(key, response) {
      return serial(async () => {
        const bytes = await boundedBytes(response);
        const saved = await fetchImpl(cacheUrl(key), { method: "PUT", headers, body: bytes });
        await saved.body?.cancel();
        if (!saved.ok) throw new Error("Drive cache write failed");
        // The bridge already completed a fresh remote SHA-256 readback before replying.
        remember(String(key), bytes);
      });
    },
    clear() { values.clear(); retained = 0; },
  };
}
