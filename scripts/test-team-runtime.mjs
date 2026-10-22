import assert from "node:assert/strict";
import test from "node:test";
import { testCommand } from "./run-test-environment.mjs";

test("test dev uses the installed Next.js without shell-specific environment syntax", () => {
  const original = { PATH: "test-path", NEXT_PUBLIC_BODYMAKE_ENV: "production" };
  const result = testCommand("dev", [], original);
  assert.equal(result.command, process.execPath);
  assert.match(result.args[0], /next[/\\]dist[/\\]bin[/\\]next$/);
  assert.deepEqual(result.args.slice(1), ["dev", "--port", "3001"]);
  assert.equal(result.options.shell, false);
  assert.equal(result.options.env.NEXT_PUBLIC_BODYMAKE_ENV, "test");
  assert.equal(result.options.env.PATH, original.PATH);
  assert.equal(original.NEXT_PUBLIC_BODYMAKE_ENV, "production");
});

test("test build stays isolated and forwards individual arguments without shell evaluation", () => {
  const result = testCommand("build", ["--debug"], {});
  assert.deepEqual(result.args.slice(1), ["build", "--webpack", "--debug"]);
  assert.equal(result.options.env.NEXT_PUBLIC_BODYMAKE_ENV, "test");
  assert.equal(result.options.env.NODE_ENV, undefined);
});

test("the test wrapper cannot dispatch deployment or arbitrary shell commands", () => {
  for (const mode of [undefined, "start", "deploy", "build && deploy"]) {
    assert.throws(() => testCommand(mode), /Use dev or build/);
  }
});
