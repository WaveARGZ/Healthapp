const tokenUrl = "https://oauth2.googleapis.com/token";
const datastoreScope = "https://www.googleapis.com/auth/datastore";
const testProject = "bodymake-test-14a3f";
const testFirestore = "https://firestore.googleapis.com/v1/projects/" + testProject + "/databases/(default)/documents";
const accountPattern = /^[a-z0-9-]+@bodymake-test-14a3f\.iam\.gserviceaccount\.com$/;
const accessEmailPattern = /^[^@/\\\s\p{Cc}]+@[^@/\\\s\p{Cc}]+$/u;
const mealTypes = new Set(["breakfast", "lunch", "dinner"]);
const encoder = new TextEncoder();

function readCredentials(credentials) {
  let account;
  try {
    account = JSON.parse(credentials);
  } catch {
    throw new Error("Invalid meal reminder credentials");
  }
  if (typeof account?.client_email !== "string" || !accountPattern.test(account.client_email)
      || typeof account.private_key !== "string") {
    throw new Error("Meal reminders require a shared-test service account");
  }
  const match = /^-----BEGIN PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END PRIVATE KEY-----\s*$/.exec(account.private_key.trim());
  if (!match) throw new Error("Invalid meal reminder signing key");
  return { email: account.client_email, key: Uint8Array.from(atob(match[1].replace(/\s/g, "")), value => value.charCodeAt(0)) };
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function dateIsValid(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const instant = new Date(date + "T00:00:00Z");
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === date;
}

function equals(fieldPath, stringValue) {
  return { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue } } };
}

export function createMealPresenceReader({ credentials, fetcher = fetch, now = Date.now }) {
  const account = readCredentials(credentials);
  const signingAlgorithm = "RSASSA-PKCS1-v1_5";
  let signingKey;
  let cachedToken;
  let exchange;

  async function mintToken() {
    signingKey ??= crypto.subtle.importKey("pkcs8", account.key, { name: signingAlgorithm, hash: "SHA-256" }, false, ["sign"]);
    const issuedAt = Math.floor(now() / 1000);
    const header = base64Url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
    const claims = base64Url(encoder.encode(JSON.stringify({
      iss: account.email, aud: tokenUrl, scope: datastoreScope, iat: issuedAt, exp: issuedAt + 300,
    })));
    const unsigned = header + "." + claims;
    const signature = new Uint8Array(await crypto.subtle.sign(signingAlgorithm, await signingKey, encoder.encode(unsigned)));
    const started = now();
    const response = await fetcher(tokenUrl, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: unsigned + "." + base64Url(signature),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Meal reminder authorization failed");
    const result = await response.json().catch(() => null);
    if (typeof result?.access_token !== "string" || !/^[A-Za-z0-9._~+/=-]{1,4096}$/.test(result.access_token)
        || typeof result.token_type !== "string" || result.token_type.toLowerCase() !== "bearer"
        || !Number.isSafeInteger(result.expires_in) || result.expires_in <= 0) {
      throw new Error("Invalid meal reminder authorization response");
    }
    cachedToken = { value: result.access_token, expiresAt: started + Math.min(result.expires_in, 3600) * 1000 };
    return cachedToken;
  }

  async function accessToken() {
    if (cachedToken && cachedToken.expiresAt - 60_000 > now()) return cachedToken;
    exchange ??= mintToken().finally(() => { exchange = undefined; });
    return exchange;
  }

  async function queryFirestore(path, options) {
    const token = await accessToken();
    const response = await fetcher(testFirestore + path, {
      ...options,
      headers: { ...options.headers, Authorization: "Bearer " + token.value },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 && cachedToken === token) cachedToken = undefined;
    return response;
  }

  async function hasMeal(uid, date, mealType) {
    if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !dateIsValid(date) || !mealTypes.has(mealType)) {
      throw new Error("Invalid meal reminder lookup");
    }
    const response = await queryFirestore("/users/" + uid + ":runAggregationQuery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredAggregationQuery: {
          structuredQuery: {
            from: [{ collectionId: "meals" }],
            where: { compositeFilter: { op: "AND", filters: [equals("recordedAt", date), equals("mealType", mealType)] } },
            limit: 1,
          },
          aggregations: [{ count: {}, alias: "matches" }],
        },
      }),
    });
    if (!response.ok) throw new Error("Meal reminder lookup failed");
    const rows = await response.json().catch(() => null);
    const matches = Array.isArray(rows) ? rows.filter(row => row?.result) : [];
    const count = matches[0]?.result.aggregateFields?.matches?.integerValue;
    if (matches.length !== 1 || (count !== "0" && count !== "1")) throw new Error("Invalid meal reminder lookup response");
    return count === "1";
  }

  hasMeal.isAllowed = async function isAllowed(email) {
    if (typeof email !== "string" || email.length > 320 || !accessEmailPattern.test(email)) {
      throw new Error("Invalid meal reminder access lookup");
    }
    const response = await queryFirestore("/developerAccess/" + encodeURIComponent(email) + "?mask.fieldPaths=enabled", {
      method: "GET",
      headers: { "Cache-Control": "no-store" },
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("Meal reminder access lookup failed");
    const data = await response.json().catch(() => null);
    const enabled = data?.fields?.enabled?.booleanValue;
    if (typeof enabled !== "boolean") throw new Error("Invalid meal reminder access response");
    return enabled;
  };

  return hasMeal;
}
