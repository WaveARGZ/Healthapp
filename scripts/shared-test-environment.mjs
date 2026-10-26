import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
export const sharedTestProject = "bodymake-test-14a3f";

// Public Firebase Web SDK identifiers, not administrator credentials.
// Security Rules enforce the private developer allowlist and each user's UID.
export function sharedTestEnvironment(environment = process.env) {
  const env = { ...environment };
  const names = ["BACKEND", "AUTH_DOMAIN", "CLIENT_ID", "API_URL", "CALLBACK_URL", "LOGOUT_URL",
    "GOOGLE_SIGN_IN_ENABLED", "FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_MOBILE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID", "FIREBASE_APP_ID", "TRAINING_ENDPOINT", "GOOGLE_DRIVE_CLIENT_ID"];
  // Explicit empty values also prevent Next.js from filling these from .env.local.
  for (const name of names) {
    env[`NEXT_PUBLIC_BODYMAKE_${name}`] = "";
    env[`NEXT_PUBLIC_BODYMAKE_TEST_${name}`] = "";
  }
  return {
    ...env,
    NEXT_PUBLIC_BODYMAKE_ENV: "test",
    NEXT_PUBLIC_BODYMAKE_SHARED_TEST: "true",
    BODYMAKE_HOSTING_TARGET: "firebase",
    NEXT_PUBLIC_BODYMAKE_TEST_BACKEND: "firebase",
    NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_PROJECT_ID: sharedTestProject,
    NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_API_KEY: "AIzaSyBpp3fKw7YIeawwKAjFXRCUn8VxGyxtlDs",
    NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_APP_ID: "1:282829370973:web:cc1dd833014fe13f043fb4",
    NEXT_PUBLIC_BODYMAKE_TEST_FIREBASE_AUTH_DOMAIN: `${sharedTestProject}.firebaseapp.com`,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

export function sharedTestCommand(mode, environment = process.env) {
  if (!["dev", "build"].includes(mode)) throw new Error("Use dev or build for the shared test environment.");
  return {
    command: process.execPath,
    args: [require.resolve("next/dist/bin/next"), mode, ...(mode === "dev" ? ["--port", "3001"] : ["--webpack"])],
    options: { shell: false, stdio: "inherit", env: sharedTestEnvironment(environment) },
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const { command, args, options } = sharedTestCommand(process.argv[2]);
  const child = spawn(command, args, options);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", () => { console.error("共有テスト環境を起動できません。Node.jsとnpm ciを確認してください。"); process.exitCode = 1; });
  child.on("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1); });
}
