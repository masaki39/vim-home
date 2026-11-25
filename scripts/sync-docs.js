// Regenerates README's "Keys" section from src/keymap.js:
//   pnpm run docs
// tests/docs.test.js fails while README is out of date.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { keysMarkdown } from "../src/keymap.js";

export const README = fileURLToPath(new URL("../README.md", import.meta.url));
const START = "<!-- keys:start (generated from src/keymap.js by `pnpm run docs`) -->";
const END = "<!-- keys:end -->";

/** README text with the generated section replaced by the current keymap. */
export function syncedReadme(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end < start) throw new Error(`README.md is missing the ${START} ... ${END} markers`);
  return `${text.slice(0, start + START.length)}\n\n${keysMarkdown()}\n\n${text.slice(end)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = readFileSync(README, "utf8");
  const next = syncedReadme(text);
  if (next === text) {
    console.log("README.md is up to date");
  } else {
    writeFileSync(README, next);
    console.log("README.md updated");
  }
}
