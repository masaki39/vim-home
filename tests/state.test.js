"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  nextSortOrder,
  sortBookmarks,
  recordOpen,
  togglePin,
  pruneState,
  topRecent,
  topFrequent,
  relativeTime,
  formatClock,
  normalizeUrl,
} = require(path.join(__dirname, "..", "newtab.js"));

const bookmarks = [
  { id: "1", title: "A", url: "https://a.example" },
  { id: "2", title: "B", url: "https://b.example" },
  { id: "3", title: "C", url: "https://c.example" },
  { id: "4", title: "D", url: "https://d.example" },
];
const ids = (list) => list.map((b) => b.id);

const stats = {
  "2": { count: 1, lastOpened: 300 },
  "3": { count: 5, lastOpened: 100 },
  "4": { count: 5, lastOpened: 200 },
};

test("nextSortOrder: cycles default -> frequent -> recent -> default", () => {
  assert.equal(nextSortOrder("default"), "frequent");
  assert.equal(nextSortOrder("frequent"), "recent");
  assert.equal(nextSortOrder("recent"), "default");
  assert.equal(nextSortOrder("bogus"), "default");
});

test("sortBookmarks: default keeps bookmark order and returns a copy", () => {
  const result = sortBookmarks(bookmarks, { stats });
  assert.deepEqual(ids(result), ["1", "2", "3", "4"]);
  assert.notEqual(result, bookmarks);
});

test("sortBookmarks: frequent orders by count, ties and unopened keep bookmark order", () => {
  assert.deepEqual(ids(sortBookmarks(bookmarks, { order: "frequent", stats })), ["3", "4", "2", "1"]);
});

test("sortBookmarks: recent orders by last opened, unopened last", () => {
  assert.deepEqual(ids(sortBookmarks(bookmarks, { order: "recent", stats })), ["2", "4", "3", "1"]);
});

test("sortBookmarks: pinned bookmarks always come first", () => {
  assert.deepEqual(ids(sortBookmarks(bookmarks, { pins: ["4", "1"] })), ["1", "4", "2", "3"]);
  assert.deepEqual(
    ids(sortBookmarks(bookmarks, { order: "frequent", stats, pins: ["1", "2"] })),
    ["2", "1", "3", "4"]
  );
});

test("sortBookmarks: ignores pins and stats for unknown ids", () => {
  assert.deepEqual(ids(sortBookmarks(bookmarks, { order: "recent", stats: { x: { count: 9, lastOpened: 9 } }, pins: ["x"] })), [
    "1",
    "2",
    "3",
    "4",
  ]);
});

test("recordOpen: counts opens and stamps the time without mutating", () => {
  const once = recordOpen({}, "1", 10);
  assert.deepEqual(once, { "1": { count: 1, lastOpened: 10 } });
  const twice = recordOpen(once, "1", 20);
  assert.deepEqual(twice["1"], { count: 2, lastOpened: 20 });
  assert.deepEqual(once["1"], { count: 1, lastOpened: 10 });
});

test("togglePin: adds then removes", () => {
  assert.deepEqual(togglePin([], "1"), ["1"]);
  assert.deepEqual(togglePin(["1", "2"], "1"), ["2"]);
});

test("pruneState: drops data for deleted bookmarks", () => {
  const result = pruneState({ stats, pins: ["2", "9"] }, ["1", "2", "3"]);
  assert.deepEqual(Object.keys(result.stats).sort(), ["2", "3"]);
  assert.deepEqual(result.pins, ["2"]);
  assert.equal(result.changed, true);
});

test("pruneState: reports no change when everything still exists", () => {
  const result = pruneState({ stats, pins: ["2"] }, ["1", "2", "3", "4"]);
  assert.equal(result.changed, false);
});

test("topRecent: newest first, limited, skips unopened", () => {
  const result = topRecent(bookmarks, stats, 2);
  assert.deepEqual(result.map((r) => r.bookmark.id), ["2", "4"]);
  assert.equal(result[0].lastOpened, 300);
  assert.equal(topRecent(bookmarks, {}).length, 0);
});

test("topFrequent: most opened first, ties broken by recency", () => {
  const result = topFrequent(bookmarks, stats);
  assert.deepEqual(result.map((r) => [r.bookmark.id, r.count]), [["4", 5], ["3", 5], ["2", 1]]);
  assert.equal(topFrequent(bookmarks, stats, 1).length, 1);
});

test("relativeTime: compact ages", () => {
  const min = 60000;
  assert.equal(relativeTime(0, 30 * 1000), "just now");
  assert.equal(relativeTime(0, 5 * min), "5m ago");
  assert.equal(relativeTime(0, 3 * 60 * min), "3h ago");
  assert.equal(relativeTime(0, 2 * 24 * 60 * min), "2d ago");
  assert.equal(relativeTime(0, 61 * 24 * 60 * min), "2mo ago");
  assert.equal(relativeTime(0, 800 * 24 * 60 * min), "2y ago");
  assert.equal(relativeTime(100, 0), "just now");
});

test("formatClock: zero-padded local time and date", () => {
  const clock = formatClock(new Date(2026, 9, 27, 9, 5, 7));
  assert.deepEqual(clock, { time: "09:05", seconds: "07", date: "TUE 2026.10.27" });
});

test("normalizeUrl: keeps URLs with a scheme", () => {
  assert.equal(normalizeUrl("https://example.com"), "https://example.com");
  assert.equal(normalizeUrl("chrome://extensions"), "chrome://extensions");
  assert.equal(normalizeUrl("mailto:me@example.com"), "mailto:me@example.com");
});

test("normalizeUrl: assumes https and trims", () => {
  assert.equal(normalizeUrl("  example.com/path "), "https://example.com/path");
  assert.equal(normalizeUrl("localhost:3000"), "https://localhost:3000");
});

test("normalizeUrl: blank input is empty", () => {
  assert.equal(normalizeUrl("   "), "");
});
