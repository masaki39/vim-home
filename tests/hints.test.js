"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { HINT_CHARS, hintLabels } = require(path.join(__dirname, "..", "newtab.js"));

test("HINT_CHARS: matches Vimium's default alphabet", () => {
  assert.equal(HINT_CHARS, "sadfjklewcmpgh");
});

test("hintLabels: no targets gives no labels", () => {
  assert.deepEqual(hintLabels(0), []);
});

test("hintLabels: single characters while they suffice", () => {
  assert.deepEqual(hintLabels(3), ["s", "a", "d"]);
  const labels = hintLabels(HINT_CHARS.length);
  assert.equal(labels.length, 14);
  assert.ok(labels.every((l) => l.length === 1));
});

test("hintLabels: grows to the shortest length that fits", () => {
  assert.ok(hintLabels(15).every((l) => l.length === 2));
  assert.ok(hintLabels(14 * 14).every((l) => l.length === 2));
  assert.ok(hintLabels(14 * 14 + 1).every((l) => l.length === 3));
});

test("hintLabels: labels are unique and none is a prefix of another", () => {
  const labels = hintLabels(200);
  assert.equal(new Set(labels).size, labels.length);
  for (const a of labels) {
    for (const b of labels) {
      if (a !== b) assert.ok(!b.startsWith(a), `${a} is a prefix of ${b}`);
    }
  }
});

test("hintLabels: first character varies fastest to spread the first keystroke", () => {
  const labels = hintLabels(20);
  assert.deepEqual(labels.slice(0, 3), ["ss", "as", "ds"]);
  assert.equal(new Set(labels.map((l) => l[0])).size, 14);
});

test("hintLabels: only uses the given alphabet", () => {
  assert.deepEqual(hintLabels(4, "ab"), ["aa", "ba", "ab", "bb"]);
});
