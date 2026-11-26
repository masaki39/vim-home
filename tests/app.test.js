// End-to-end key handling on the real page (jsdom + fake chrome).

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { KEY_SECTIONS } from "../src/keymap.js";
import { closePage, openPage, SAMPLE_BOOKMARKS } from "./helpers/page.js";

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
  assert.match(page.text("ticker"), /o SEARCH ◆ e EDIT/);
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

test("search: o filters as you type, but Enter opens the query", async () => {
  const page = await openPage();
  await page.press("o");
  assert.equal(page.mode(), "SEARCH");
  await page.type("google");
  assert.deepEqual(page.titles(), ["Google"]);
  await page.press("Enter");
  assert.deepEqual(page.navigations, [{ search: "google", newTab: false }]);
});

test("search: Enter opens a URL-shaped query; Cmd+Enter in a new tab", async () => {
  let page = await openPage();
  await page.press("o");
  await page.type("example.org");
  await page.press("Enter");
  assert.deepEqual(page.navigations, [{ url: "https://example.org", newTab: false }]);

  page = await openPage();
  await page.press("/");
  await page.type("zzz qqq");
  await page.press("Enter", { metaKey: true });
  assert.deepEqual(page.navigations, [{ search: "zzz qqq", newTab: true }]);
  assert.equal(page.mode(), "NORMAL");
});

test("search: a blank Enter just returns to the grid", async () => {
  const page = await openPage();
  await page.press("o");
  await page.press("Enter");
  assert.deepEqual(page.navigations, []);
  assert.equal(page.mode(), "NORMAL");
});

test("search: an IME-confirming Enter does not submit", async () => {
  const page = await openPage();
  await page.press("o");
  await page.type("git");
  await page.press("Enter", { isComposing: true });
  assert.deepEqual(page.navigations, []);
  assert.equal(page.mode(), "SEARCH");
});

test("search: an IME-cancelling Esc stays in the search bar", async () => {
  const page = await openPage();
  await page.press("o");
  await page.type("ぎt");
  await page.press("Escape", { isComposing: true });
  assert.equal(page.mode(), "SEARCH");
});

test("search: a whitespace-only query leaves no filter behind", async () => {
  const page = await openPage();
  await page.press("o");
  await page.type("   ");
  await page.press("Enter");
  assert.equal(page.mode(), "NORMAL");
  assert.equal(page.text("filter-tag"), "");
  assert.equal(page.titles().length, 4);
});

test("search: the empty-grid hint follows the mode", async () => {
  const page = await openPage();
  await page.press("o");
  await page.type("zzz");
  assert.match(page.text("empty"), /Enter to search the web/);
  await page.press("Escape");
  assert.match(page.text("empty"), /o to edit · Esc to clear/);
});

test("search: Ctrl+U clears the query", async () => {
  const page = await openPage();
  await page.press("o");
  await page.type("git");
  assert.equal(page.titles().length, 1);
  await page.press("u", { ctrlKey: true });
  assert.equal(page.titles().length, 4);
  assert.equal(page.mode(), "SEARCH");
});

test("search: Esc keeps the filter for hjkl + Enter; o resumes the query; Esc clears it", async () => {
  const page = await openPage();
  await page.press("o");
  await page.type("o");
  const filtered = page.titles();
  await page.press("Escape");
  assert.equal(page.mode(), "NORMAL");
  assert.equal(page.text("filter-tag"), "FILTER:o");
  assert.deepEqual(page.titles(), filtered);

  await page.press("o");
  assert.equal(page.mode(), "SEARCH");
  assert.equal(page.document.getElementById("search-input").value, "o");
  await page.press("Escape");

  await page.press("j");
  await page.press("Enter");
  const picked = SAMPLE_BOOKMARKS.find((b) => b.title === filtered[1]);
  assert.deepEqual(page.navigations, [{ url: picked.url, newTab: false }]);

  await page.press("Escape");
  assert.equal(page.text("filter-tag"), "");
  assert.equal(page.titles().length, 4);
});

test("search: Tab picks a history site, wrapping back to the query", async () => {
  const history = [
    { url: "https://gitlab.com/some/repo", title: "repo", visitCount: 3, lastVisitTime: 1 },
    { url: "https://github.com/x", title: "x", visitCount: 9, lastVisitTime: 2 },
  ];
  let page = await openPage({ history });
  await page.press("o");
  await page.type("git");
  assert.equal(page.isHidden("history-list"), false);
  // github.com is bookmarked, so only gitlab.com is suggested.
  assert.equal(page.document.querySelectorAll(".history-item").length, 1);
  await page.press("Tab");
  await page.press("Enter");
  assert.deepEqual(page.navigations, [{ url: "https://gitlab.com/", newTab: false }]);

  page = await openPage({ history });
  await page.press("o");
  await page.type("git");
  await page.press("Tab");
  await page.press("Tab");
  assert.equal(page.document.querySelectorAll(".history-item.selected").length, 0);
  await page.press("Enter");
  assert.deepEqual(page.navigations, [{ search: "git", newTab: false }]);
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

test("search: chips for an older query can't be picked before new ones arrive", async () => {
  const page = await openPage({
    history: [{ url: "https://gitlab.com/some/repo", title: "repo", visitCount: 3, lastVisitTime: 1 }],
  });
  await page.press("o");
  await page.type("git");
  assert.equal(page.document.querySelectorAll(".history-item").length, 1);
  // Type, Tab and Enter in one go, before chrome.history answers "gitz".
  const { window, document } = page;
  const input = document.getElementById("search-input");
  input.value += "z";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  for (const key of ["Tab", "Enter"]) {
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }
  assert.deepEqual(page.navigations, [{ search: "gitz", newTab: false }]);
});

test("search: clicking away leaves search like Esc, keeping the filter", async () => {
  const page = await openPage();
  await page.press("o");
  await page.type("o");
  page.document.getElementById("app").focus();
  assert.equal(page.mode(), "NORMAL");
  assert.equal(page.text("filter-tag"), "FILTER:o");
  assert.equal(page.document.getElementById("search-bar").classList.contains("closed"), true);
});
