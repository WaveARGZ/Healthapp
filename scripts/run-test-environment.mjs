import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

// Avoid shell-specific VAR=value syntax so the same npm scripts work on Windows.
export function testCommand(mode, extraArgs = [], environment = process.env) {
  if (mode !== "dev" && mode !== "build") {
    throw new Error("Use dev or build for the isolated test environment.");
  }
  return {
    command: process.execPath,
    args: [require.resolve("next/dist/bin/next"), mode,
      ...(mode === "dev" ? ["--port", "3001"] : ["--webpack"]), ...extraArgs],
    options: {
      shell: false,
      stdio: "inherit",
      env: { ...environment, NEXT_PUBLIC_BODYMAKE_ENV: "test" },
    },
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { command, args, options } = testCommand(process.argv[2], process.argv.slice(3));
    const child = spawn(command, args, options);
    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, () => child.kill(signal));
    }
    child.on("error", () => {
      console.error("テスト環境を起動できません。Node.jsとnpm ciの完了を確認してください。");
      process.exitCode = 1;
    });
    child.on("exit", (code, signal) => {
      process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
