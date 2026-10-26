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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
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
