import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { getDeploymentBasePath } from "../lib/deployment-base-path.mjs";

const root = new URL("../", import.meta.url);
const sharedEnvironment = {
  NEXT_PUBLIC_BODYMAKE_ENV: "test",
  NEXT_PUBLIC_BODYMAKE_SHARED_TEST: "true",
};

function load(relativePath, environment = {}, modules = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(relativePath, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, process: { env: environment }, Error,
    require(id) {
      assert.ok(Object.hasOwn(modules, id), `unexpected dependency: ${id}`);
      return modules[id];
    },
    ...globals,
  });
  return exports;
}

function runtime(environment) {
  return load("lib/cloud/config.ts", environment);
}

test("shared mode fails closed outside test and preserves the local learning model channel", () => {
  assert.throws(() => runtime({ NEXT_PUBLIC_BODYMAKE_SHARED_TEST: "true" }), /BODYMAKE_ENV=test/);
  assert.equal(runtime(sharedEnvironment).useTestFoodModel, false);
  assert.equal(runtime({ NEXT_PUBLIC_BODYMAKE_ENV: "test" }).useTestFoodModel, true);
  assert.equal(runtime({}).useTestFoodModel, false);
});

test("test Firebase cannot select the production project even without production environment variables", () => {
  const environment = {
    ...sharedEnvironment,
    NEXT_PUBLIC_BODYMAKE_TEST_BACKEND: "firebase",
    NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_API_KEY: "synthetic-public-key",
    NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_AUTH_DOMAIN: "example-test.web.app",
    NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_APP_ID: "synthetic-app-id",
  };
  function configured(testProject, productionProject) {
    const values = { ...environment, NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_PROJECT_ID: testProject,
      ...(productionProject ? { NEXT_PUBLIC_BODYMAKE_FIREBASE_PROJECT_ID: productionProject } : {}) };
    return load("lib/firebase/config.ts", values, { "@/lib/cloud/config": runtime(values) });
  }
  assert.equal(configured("healthapp-14a3f").isFirebaseConfigured, false);
  assert.equal(configured("another-production", "another-production").isFirebaseConfigured, false);
  assert.equal(configured("separate-test-project").isFirebaseConfigured, true);
  assert.throws(() => configured("healthapp-14a3f").assertFirebaseConfigured(), /別プロジェクト/);
});

test("installed test app uses same-origin Google redirect without changing browser login", () => {
  const environment = {
    ...sharedEnvironment,
    NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_AUTH_DOMAIN: "bodymake-test-14a3f.firebaseapp.com",
    NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_STANDALONE_AUTH_DOMAIN: "bodymake-test-14a3f.web.app",
  };
  function authDomain(hostname, { standalone = false, ios = false, mobile = true } = {}) {
    const window = {
      location: { hostname },
      matchMedia(query) {
        return { matches: query === "(pointer: coarse)" ? mobile : query === "(display-mode: standalone)" && standalone };
      },
    };
    const navigator = { userAgent: ios ? "iPhone" : mobile ? "Android" : "Desktop", standalone: ios && standalone };
    return load("lib/firebase/config.ts", environment, { "@/lib/cloud/config": runtime(environment) }, { window, navigator }).firebaseConfig.authDomain;
  }
  assert.equal(authDomain("bodymake-test-14a3f.web.app", { standalone: true }), "bodymake-test-14a3f.web.app");
  assert.equal(authDomain("bodymake-test-14a3f.web.app", { standalone: true, ios: true }), "bodymake-test-14a3f.web.app");
  assert.equal(authDomain("bodymake-test-14a3f.web.app"), "bodymake-test-14a3f.firebaseapp.com");
  assert.equal(authDomain("bodymake-test-14a3f.firebaseapp.com", { standalone: true }), "bodymake-test-14a3f.firebaseapp.com");
  assert.equal(authDomain("localhost", { standalone: true }), "bodymake-test-14a3f.firebaseapp.com");
});

test("shared testing cannot enable training uploads with either endpoint override", () => {
  const environment = { ...sharedEnvironment,
    NEXT_PUBLIC_BODYMAKE_TRAINING_ENDPOINT: "https://production.example.invalid",
    NEXT_PUBLIC_BODYMAKE_TEST_TRAINING_ENDPOINT: "https://test.example.invalid" };
  const settings = load("lib/storage/google-drive-settings.ts", environment, { "@/lib/cloud/config": runtime(environment) });
  assert.equal(settings.getTrainingDataEndpoint(), "");
  assert.equal(settings.getGoogleDriveClientId(), "");
});

test("Firebase CI uses root paths while legacy Pages builds keep their repository prefix", () => {
  const actions = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "example/Healthapp" };
  assert.equal(getDeploymentBasePath(actions), "/Healthapp");
  assert.equal(getDeploymentBasePath({ ...actions, BODYMAKE_HOSTING_TARGET: "firebase" }), "");
  assert.equal(getDeploymentBasePath({}), "");
});

test("shared food candidates are exactly the production label set", () => {
  const json = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
  const production = json("lib/food-ai/photo-labels.json");
  const catalog = load("lib/food-ai/food-catalog.ts", sharedEnvironment, {
    "@/lib/cloud/config": runtime(sharedEnvironment),
    "@/lib/data/food-library.json": json("lib/data/food-library.json"),
    "@/lib/food-ai/photo-labels.json": production,
    "@/lib/food-ai/test-photo-labels.json": json("lib/food-ai/test-photo-labels.json"),
    "@/types/food-database": { foodToMealItem: (food) => food },
  });
  assert.deepEqual(Array.from(catalog.foodCatalog, (food) => food.id), production.map(([id]) => id));
  assert.equal(catalog.foodCatalog.length, 27);
});

test("shared inference uses deployed calibration and never contacts the local learning launcher", async () => {
  const deployedCalibration = { marker: "deployed" };
  let usedCalibration;
  const analyzer = load("lib/food-ai/food-photo-analyzer.ts", sharedEnvironment, {
    "@/lib/cloud/config": runtime(sharedEnvironment),
    "@/lib/food-ai/food-catalog": { foodCatalog: [{ id: "synthetic-food", clipLabel: "synthetic dish", food: {} }] },
    "@/lib/food-ai/deployed-calibration.json": deployedCalibration,
    "@/lib/food-ai/test-calibration.json": { marker: "experimental" },
    "@/lib/food-ai/clip-features.mjs": {},
    "@/lib/food-ai/photo-history": { buildPhotoHistory: () => [] },
    "@/lib/food-ai/food-calibration.mjs": {
      FOOD_BASE_MODEL: "synthetic-model", FOOD_BASE_REVISION: "synthetic-revision",
      applyFoodCalibration(scores, _ids, calibration) { usedCalibration = calibration; return scores; },
    },
    "@huggingface/transformers": { pipeline: async () => async () => [{ label: "synthetic dish", score: 1 }] },
  }, { window: { location: { hostname: "localhost" } }, fetch() { assert.fail("shared tests must not request the owner learning model"); } });
  const result = await analyzer.analyzeFoodPhotoDetailed(new Blob(["synthetic"]));
  assert.equal(result.candidates[0].id, "synthetic-food");
  assert.equal(usedCalibration, deployedCalibration);
});

test("shared test access requires the signed-in verified Google user's private enabled entry", async () => {
  let requestedPath;
  let enabled = true;
  const access = load("lib/auth/shared-test-access.ts", sharedEnvironment, {
    "@/lib/cloud/config": runtime(sharedEnvironment),
    "@/lib/firebase/app": { firebaseDb: () => "synthetic-database" },
    "firebase/firestore": {
      doc(...parts) { requestedPath = parts; return parts; },
      getDocFromServer: async () => ({ exists: () => true, data: () => ({ enabled }) }),
    },
  });
  const user = { email: "developer@example.invalid", emailVerified: true, providerData: [{ providerId: "google.com" }] };
  await access.assertSharedTestAccess(user);
  assert.deepEqual(Array.from(requestedPath), ["synthetic-database", "developerAccess", user.email]);
  enabled = false;
  await assert.rejects(access.assertSharedTestAccess(user), /参加がまだ許可されていません/);
  await assert.rejects(access.assertSharedTestAccess({ ...user, emailVerified: false }), /参加がまだ許可されていません/);
  await assert.rejects(access.assertSharedTestAccess({ ...user, providerData: [{ providerId: "password" }] }), /参加がまだ許可されていません/);
});

test("production login never reads the test developer access list", async () => {
  const access = load("lib/auth/shared-test-access.ts", {}, {
    "@/lib/cloud/config": runtime({}),
    "@/lib/firebase/app": { firebaseDb() { assert.fail("production must not query the test allowlist"); } },
    "firebase/firestore": {},
  });
  await access.assertSharedTestAccess({});
});

test("ordinary shared-test startup restores persistence without initializing the OAuth iframe", () => {
  let initialized = 0;
  const app = {};
  const auth = {};
  const firebase = load("lib/firebase/app.ts", sharedEnvironment, {
    "firebase/app": { getApps: () => [app], getApp: () => app },
    "firebase/auth": {
      indexedDBLocalPersistence: "indexedDB", browserLocalPersistence: "local", browserSessionPersistence: "session",
      initializeAuth(instance, options) {
        initialized++;
        assert.equal(instance, app);
        assert.deepEqual(Array.from(options.persistence), ["indexedDB", "local", "session"]);
        assert.equal(options.popupRedirectResolver, undefined);
        return auth;
      },
      getAuth() { assert.fail("ordinary startup must not preload the redirect iframe"); },
    },
    "firebase/firestore": {},
    "@/lib/firebase/config": { assertFirebaseConfigured() {}, firebaseConfig: {} },
    "@/lib/cloud/config": runtime(sharedEnvironment),
    "@/lib/auth/google-redirect-state": { hasPendingGoogleRedirect: () => false },
  });
  assert.equal(firebase.firebaseAuth(), auth);
  assert.equal(firebase.firebaseAuth(), auth);
  assert.equal(initialized, 1);
});

test("redirect return retains the SDK's normal auth initialization", () => {
  const auth = {};
  const firebase = load("lib/firebase/app.ts", sharedEnvironment, {
    "firebase/app": { getApps: () => [{}], getApp: () => ({}) },
    "firebase/auth": { getAuth: () => auth, initializeAuth() { assert.fail("redirect recovery needs the default resolver"); } },
    "firebase/firestore": {},
    "@/lib/firebase/config": { assertFirebaseConfigured() {}, firebaseConfig: {} },
    "@/lib/cloud/config": runtime(sharedEnvironment),
    "@/lib/auth/google-redirect-state": { hasPendingGoogleRedirect: () => true },
  });
  assert.equal(firebase.firebaseAuth(), auth);
});

test("redirect completion is skipped on ordinary visits and consumed once on return", async () => {
  let pending = false;
  let calls = 0;
  const resolver = {};
  const session = load("lib/auth/firebase-session.ts", sharedEnvironment, {
    "firebase/auth": { browserPopupRedirectResolver: resolver, getRedirectResult: async (_auth, actualResolver) => {
      calls++;
      assert.equal(actualResolver, resolver);
      return { user: { uid: "synthetic-user" } };
    } },
    "@/lib/firebase/app": { firebaseAuth: () => ({ app: { options: { authDomain: "test.invalid" } } }) },
    "@/lib/cloud/config": runtime(sharedEnvironment),
    "@/lib/auth/google-redirect-state": { hasPendingGoogleRedirect: () => pending, markGoogleRedirectPending: (value) => { pending = value; } },
  }, { window: { location: { hostname: "test.invalid" } } });
  assert.equal(await session.completeGoogleRedirect(), null);
  assert.equal(calls, 0);
  pending = true;
  await Promise.all([session.completeGoogleRedirect(), session.completeGoogleRedirect()]);
  assert.equal(calls, 1);
  assert.equal(pending, false);
});

test("redirect flags tolerate restricted browser storage without storing credentials", () => {
  const values = new Map();
  const flags = load("lib/auth/google-redirect-state.ts", {}, {}, { window: { sessionStorage: {
    getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key),
  } } });
  assert.equal(flags.hasPendingGoogleRedirect(), false);
  flags.markGoogleRedirectPending(true);
  assert.equal(flags.hasPendingGoogleRedirect(), true);
  assert.deepEqual([...values.values()], ["true"]);
  flags.markGoogleRedirectPending(false);
  assert.equal(values.size, 0);
  const restricted = load("lib/auth/google-redirect-state.ts", {}, {}, { window: { get sessionStorage() { throw new Error("blocked"); } } });
  assert.equal(restricted.hasPendingGoogleRedirect(), true);
  assert.doesNotThrow(() => restricted.markGoogleRedirectPending(true));
});

function profileDestination(getProfile) {
  return load("lib/auth/profile-destination.ts", {}, {
    "@/lib/api/client": { bodyMakeClient: { getProfile } },
    "@/types/user": load("types/user.ts"),
  });
}

test("profile setup is required until a usable name and goal are saved", async () => {
  let savedProfile = null;
  const { getProfileDestination, profileSetupPath } = profileDestination(async () => savedProfile);
  for (const profile of [null, {}, { name: "　 ", goal: "maintain" }, { name: "テスト", goal: "constructor" }]) {
    savedProfile = profile;
    assert.equal(await getProfileDestination(), profileSetupPath);
  }
  // A returning user may have skipped all optional body information.
  savedProfile = { name: "テスト", goal: "maintain" };
  assert.equal(await getProfileDestination(), "/dashboard");

  const unavailable = profileDestination(async () => { throw new Error("unavailable"); });
  await assert.rejects(unavailable.getProfileDestination(), /unavailable/);
});

test("login checks access and profile concurrently but never opens records on denied access", async () => {
  let allow;
  let profileReads = 0;
  const access = new Promise((resolve) => { allow = resolve; });
  const destination = load("lib/auth/firebase-login-destination.ts", {}, {
    "@/lib/auth/shared-test-access": { assertSharedTestAccess: () => access },
    "@/lib/auth/profile-destination": profileDestination(async () => {
      profileReads++;
      return { name: "テスト", goal: "maintain" };
    }),
  });
  const result = destination.firebaseLoginDestination({});
  assert.equal(profileReads, 1, "profile request starts before the access request finishes");
  allow();
  assert.equal(await result, "/dashboard");
  for (const profile of [null, { name: "テスト", goal: "maintain" }]) {
    const denied = load("lib/auth/firebase-login-destination.ts", {}, {
      "@/lib/auth/shared-test-access": { assertSharedTestAccess: async () => { throw new Error("denied"); } },
      "@/lib/auth/profile-destination": profileDestination(async () => profile),
    });
    await assert.rejects(denied.firebaseLoginDestination({}), /denied/);
  }
});

test("a Firebase session restored on a records URL goes to setup before rendering records", async () => {
  const setupPath = "/onboarding?from=signup";
  for (const destination of [setupPath, "/dashboard"]) {
    const rendered = (type, props) => ({ type, props });
    const router = { replace: (path) => redirects.push(path) };
    const redirects = [];
    const effects = [];
    let authChanged;
    let status;
    let resolveDestination;
    const checking = new Promise((resolve) => { resolveDestination = resolve; });
    const { AppShell } = load("components/layout/app-shell.tsx", {}, {
      "react/jsx-runtime": { jsx: rendered, jsxs: rendered },
      "next/navigation": { useRouter: () => router, usePathname: () => "/dashboard/" },
      react: {
        useState: (initial) => [status ?? initial, (value) => { status = value; }],
        useEffect: (effect) => effects.push(effect),
        useSyncExternalStore: () => true,
      },
      "@/components/layout/bottom-nav": { BottomNav: "BottomNav" },
      "@/components/ui/page-header": { AppTopBar: "AppTopBar" },
      "@/components/layout/mobile-viewport": { MobileViewport: "MobileViewport" },
      "@/components/ui/logo": { Logo: "Logo" },
      "@/lib/auth/cognito-session": {},
      "@/lib/cloud/config": { isCloudConfigured: false },
      "@/lib/firebase/config": { isFirebaseConfigured: true, isFirebaseSelected: true },
      "@/lib/auth/firebase-session": { watchFirebaseUser: (callback) => { authChanged = callback; return () => {}; } },
      "@/lib/auth/firebase-login-destination": { firebaseLoginDestination: () => checking },
      "@/lib/auth/profile-destination": { profileSetupPath: setupPath },
    });
    assert.equal(AppShell({ children: "records" }).type, "main");
    const unsubscribe = effects[0]();
    authChanged({ uid: "synthetic" });
    assert.equal(AppShell({ children: "records" }).type, "main");
    resolveDestination(destination);
    await new Promise(setImmediate);
    effects.length = 0;
    const view = AppShell({ children: "records" });
    effects[1]();
    assert.equal(view.type, destination === setupPath ? "main" : "MobileViewport");
    assert.deepEqual(redirects, destination === setupPath ? [setupPath] : []);
    unsubscribe();
  }
});
