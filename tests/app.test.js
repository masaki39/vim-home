// End-to-end key handling on the real page (jsdom + fake chrome).

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { KEY_SECTIONS } from "../src/keymap.js";
import { closePage, openPage } from "./helpers/page.js";

afterEach(closePage);

test("startup: renders every bookmark in NORMAL mode with the first one focused", async () => {
  const page = await openPage();
  assert.deepEqual(page.titles(), ["GitHub", "Google", "MDN Web Docs", "Hacker News"]);
  assert.equal(page.focusedTitle(), "GitHub");
  assert.equal(page.mode(), "NORMAL");
  assert.equal(page.text("hud-count"), "4 NODES");
});

test("startup: help panel, status hint and ticker are built from the keymap", async () => {
  const page = await openPage();
  const entries = KEY_SECTIONS.flatMap((s) => s.entries);
  assert.equal(page.document.querySelectorAll("#help-body dt").length, entries.length);
  assert.match(page.text("hint"), /hjkl move · f hint · o search/);
  assert.match(page.text("ticker"), /o SEARCH ◆ O NEW TAB/);
  await page.press("?");
  assert.equal(page.mode(), "HELP");
  await page.press("Escape");
  assert.equal(page.mode(), "NORMAL");
});

test("normal: j / k / G / gg move focus", async () => {
  const page = await openPage();
  await page.press("j");
  assert.equal(page.focusedTitle(), "Google");
  await page.press("G");
  assert.equal(page.focusedTitle(), "Hacker News");
  await page.press("k");
  assert.equal(page.focusedTitle(), "MDN Web Docs");
  await page.keys("gg");
  assert.equal(page.focusedTitle(), "GitHub");
});

test("normal: browser shortcuts like Cmd+F are left alone", async () => {
  const page = await openPage();
  const ev = await page.press("f", { metaKey: true });
  assert.equal(ev.defaultPrevented, false);
  assert.equal(page.mode(), "NORMAL");
});

test("normal: Enter opens the focused bookmark and logs the open", async () => {
  const page = await openPage();
  await page.press("j");
  await page.press("Enter");
  assert.deepEqual(page.navigations, [{ url: "https://www.google.com/", newTab: false }]);
  assert.equal(page.chrome.storage.data.stats["11"].count, 1);
});

test("normal: Cmd+Enter opens in a new tab and shows it in the RECENT log", async () => {
  const page = await openPage();
  await page.press("Enter", { metaKey: true });
  assert.deepEqual(page.navigations, [{ url: "https://github.com/", newTab: true }]);
  assert.match(page.text("recent-list"), /GitHub/);
});

test("search: o filters as you type and Enter opens the match", async () => {
  const page = await openPage();
  await page.press("o");
  assert.equal(page.mode(), "SEARCH");
  await page.type("mdn");
  assert.deepEqual(page.titles(), ["MDN Web Docs"]);
  await page.press("Enter");
  assert.deepEqual(page.navigations, [{ url: "https://developer.mozilla.org/", newTab: false }]);
});

test("search: Ctrl+J picks the next match; O opens it in a new tab", async () => {
  const page = await openPage();
  await page.press("O");
  await page.type("g");
  await page.press("j", { ctrlKey: true });
  await page.press("Enter");
  assert.deepEqual(page.navigations, [{ url: "https://www.google.com/", newTab: true }]);
});

test("search: with no match, Enter opens a URL or searches the web", async () => {
  let page = await openPage();
  await page.press("o");
  await page.type("example.org");
  await page.press("Enter");
  assert.deepEqual(page.navigations, [{ url: "https://example.org", newTab: false }]);

  page = await openPage();
  await page.press("o");
  await page.type("zzz qqq");
  await page.press("Enter");
  assert.deepEqual(page.navigations, [{ search: "zzz qqq", newTab: false }]);
});

test("search: Shift+Enter searches even when bookmarks match", async () => {
  const page = await openPage();
  await page.press("o");
  await page.type("google");
  assert.deepEqual(page.titles(), ["Google"]);
  await page.press("Enter", { shiftKey: true });
  assert.deepEqual(page.navigations, [{ search: "google", newTab: false }]);
});

test("search: an IME-confirming Enter does not submit", async () => {
  const page = await openPage();
  await page.press("o");
  await page.type("git");
  await page.press("Enter", { isComposing: true });
  assert.deepEqual(page.navigations, []);
  assert.equal(page.mode(), "SEARCH");
});

test("search: Ctrl+U clears the query and Esc closes the search", async () => {
  const page = await openPage();
  await page.press("o");
  await page.type("git");
  assert.equal(page.titles().length, 1);
  await page.press("u", { ctrlKey: true });
  assert.equal(page.titles().length, 4);
  await page.type("git");
  await page.press("Escape");
  assert.equal(page.mode(), "NORMAL");
  assert.equal(page.titles().length, 4);
});

test("search: Tab picks a history site and Enter opens it", async () => {
  const page = await openPage({
    history: [
      { url: "https://gitlab.com/some/repo", title: "repo", visitCount: 3, lastVisitTime: 1 },
      { url: "https://github.com/x", title: "x", visitCount: 9, lastVisitTime: 2 },
    ],
  });
  await page.press("o");
  await page.type("git");
  assert.equal(page.isHidden("history-list"), false);
  // github.com is bookmarked, so only gitlab.com is suggested.
  assert.equal(page.document.querySelectorAll(".history-item").length, 1);
  await page.press("Tab");
  await page.press("Enter");
  assert.deepEqual(page.navigations, [{ url: "https://gitlab.com/", newTab: false }]);
});

test("filter: / + Enter keeps the filter in NORMAL mode; Esc clears it", async () => {
  const page = await openPage();
  await page.press("/");
  await page.type("o");
  const filtered = page.titles();
  await page.press("Enter");
  assert.equal(page.mode(), "NORMAL");
  assert.deepEqual(page.navigations, []);
  assert.equal(page.text("filter-tag"), "FILTER:o");
  assert.deepEqual(page.titles(), filtered);
  await page.press("Escape");
  assert.equal(page.text("filter-tag"), "");
  assert.equal(page.titles().length, 4);
});

test("hints: f labels the links and typing a label opens it", async () => {
  const page = await openPage();
  await page.press("f");
  assert.equal(page.mode(), "HINTS");
  const labels = [...page.document.querySelectorAll(".hint-label")].map((el) => el.textContent);
  assert.deepEqual(labels, ["s", "a", "d", "f"]);
  await page.press("d");
  assert.equal(page.mode(), "NORMAL");
  assert.deepEqual(page.navigations, [{ url: "https://developer.mozilla.org/", newTab: false }]);
});

test("hints: Esc cancels without opening", async () => {
  const page = await openPage();
  await page.press("F");
  await page.press("Escape");
  assert.equal(page.mode(), "NORMAL");
  assert.equal(page.document.querySelectorAll(".hint-label").length, 0);
  assert.deepEqual(page.navigations, []);
});

test("pin and sort: m pins to the front, s cycles the sort order", async () => {
  const page = await openPage();
  await page.press("G");
  await page.press("m");
  assert.equal(page.titles()[0], "Hacker News");
  assert.equal(page.focusedTitle(), "Hacker News");
  assert.deepEqual(page.chrome.storage.data.pins, ["13"]);
  await page.press("s");
  assert.equal(page.text("sort-order"), "SORT:FREQUENT");
  assert.equal(page.chrome.storage.data.sortOrder, "frequent");
});

test("toggles: S and H show in the status line and persist", async () => {
  const page = await openPage();
  await page.press("S");
  assert.equal(page.text("start-tag"), "START:SEARCH");
  await page.press("H");
  assert.equal(page.text("history-tag"), "HISTORY:OFF");
  assert.equal(page.chrome.storage.data.startInSearch, true);
  assert.equal(page.chrome.storage.data.showHistory, false);
});

test("startup: startInSearch opens straight into search mode", async () => {
  const page = await openPage({ storage: { startInSearch: true } });
  assert.equal(page.mode(), "SEARCH");
});

test("delete: x asks first; any other key cancels", async () => {
  const page = await openPage();
  await page.press("x");
  assert.equal(page.mode(), "CONFIRM");
  await page.press("n");
  assert.equal(page.mode(), "NORMAL");
  assert.equal(page.titles().length, 4);
});

test("delete: x + y removes, X restores with the pin carried over", async () => {
  const page = await openPage({ storage: { pins: ["10"] } });
  await page.press("x");
  await page.press("y");
  assert.deepEqual(page.titles(), ["Google", "MDN Web Docs", "Hacker News"]);
  assert.deepEqual(page.chrome.storage.data.pins, []);
  await page.press("X");
  assert.deepEqual(page.titles(), ["GitHub", "Google", "MDN Web Docs", "Hacker News"]);
  const restored = page.chrome.calls.find((c) => c[0] === "create")[1];
  assert.deepEqual(restored, { parentId: "1", index: 0, title: "GitHub", url: "https://github.com/" });
  assert.equal(page.chrome.storage.data.pins.length, 1);
});

test("edit: e edits the focused bookmark; Esc cancels", async () => {
  const page = await openPage();
  await page.press("e");
  assert.equal(page.mode(), "EDIT");
  page.document.getElementById("edit-title").value = "GH";
  await page.press("Enter");
  assert.equal(page.mode(), "NORMAL");
  assert.deepEqual(page.chrome.calls.at(-1), ["update", "10", { title: "GH", url: "https://github.com/" }]);
  assert.equal(page.titles()[0], "GH");

  await page.press("e");
  await page.press("Escape");
  assert.equal(page.mode(), "NORMAL");
  assert.equal(page.chrome.calls.length, 1);
});

test("add: a adds a bookmark, assuming https://", async () => {
  const page = await openPage();
  await page.press("a");
  page.document.getElementById("edit-url").value = "example.com";
  await page.press("Enter");
  assert.deepEqual(page.chrome.calls.at(-1), ["create", { parentId: "2", index: undefined, title: "", url: "https://example.com" }]);
  assert.equal(page.titles().length, 5);
});

test("add: an empty URL shows an error and keeps the form open", async () => {
  const page = await openPage();
  await page.press("a");
  await page.press("Enter");
  assert.equal(page.mode(), "EDIT");
  assert.equal(page.text("edit-error"), "URL is required");
});
