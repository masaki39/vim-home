// Guards against the docs and metadata drifting from the code.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KEY_SECTIONS, NORMAL_BINDINGS, parseKeyText } from "../src/keymap.js";
import { ACTIONS } from "../src/keys.js";
import { README, syncedReadme } from "../scripts/sync-docs.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("README's Keys section matches src/keymap.js (run `pnpm run docs`)", () => {
  const text = readFileSync(README, "utf8");
  assert.equal(text, syncedReadme(text));
});

test("manifest.json and package.json have the same version", () => {
  assert.equal(JSON.parse(read("manifest.json")).version, JSON.parse(read("package.json")).version);
});

test("every NORMAL binding has an action, and every action is bound", () => {
  for (const [key, action] of Object.entries(NORMAL_BINDINGS)) {
    assert.ok(ACTIONS[action], `${key} -> ${action} has no action`);
  }
  const bound = new Set(Object.values(NORMAL_BINDINGS));
  for (const action of Object.keys(ACTIONS)) assert.ok(bound.has(action), `${action} is never bound`);
});

test("every NORMAL binding is documented in the keymap", () => {
  const grid = KEY_SECTIONS[0].entries;
  const kbds = new Set(grid.flatMap((e) => parseKeyText(e.keys).filter((p) => p.kbd).map((p) => p.text)));
  const documented = (key) =>
    kbds.has(key) ||
    (key === "Escape" && kbds.has("Esc")) ||
    (key.startsWith("Arrow") && grid.some((e) => e.keys.includes("arrows"))) ||
    // Two-key combos ("gg", "yy", "yf") document their first key.
    [...kbds].some((k) => k.length === 2 && k[0] === key);
  for (const key of Object.keys(NORMAL_BINDINGS)) assert.ok(documented(key), `${key} is not in the help`);
});

test("parseKeyText: backticked runs become kbd", () => {
  assert.deepEqual(parseKeyText("`f` / `F`"), [
    { kbd: true, text: "f" },
    { kbd: false, text: " / " },
    { kbd: true, text: "F" },
  ]);
});
