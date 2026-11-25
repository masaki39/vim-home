"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { isSubsequence, filterBookmarks, displayHost, indexLabel } = require(
  path.join(__dirname, "..", "newtab.js")
);

test("isSubsequence: empty query matches anything", () => {
  assert.equal(isSubsequence("", "anything"), true);
});

test("isSubsequence: matches in-order, non-contiguous characters", () => {
  assert.equal(isSubsequence("gh", "github.com"), true);
  assert.equal(isSubsequence("gtc", "github.com"), true);
});

test("isSubsequence: rejects out-of-order characters", () => {
  assert.equal(isSubsequence("hg", "github.com"), false);
});

test("isSubsequence: rejects characters not present at all", () => {
  assert.equal(isSubsequence("xyz", "github.com"), false);
});

const bookmarks = [
  { id: "1", title: "GitHub", url: "https://github.com" },
  { id: "2", title: "Google", url: "https://google.com" },
  { id: "3", title: "MDN Web Docs", url: "https://developer.mozilla.org" },
  { id: "4", title: "Hacker News", url: "https://news.ycombinator.com" },
];

test("filterBookmarks: empty query returns all bookmarks, unmodified order", () => {
  const result = filterBookmarks(bookmarks, "");
  assert.deepEqual(result, bookmarks);
});

test("filterBookmarks: empty query returns a copy, not the same array", () => {
  const result = filterBookmarks(bookmarks, "");
  assert.notEqual(result, bookmarks);
});

test("filterBookmarks: substring match on title", () => {
  const result = filterBookmarks(bookmarks, "git");
  assert.deepEqual(result.map((b) => b.id), ["1"]);
});

test("filterBookmarks: substring match on URL", () => {
  const result = filterBookmarks(bookmarks, "ycombinator");
  assert.deepEqual(result.map((b) => b.id), ["4"]);
});

test("filterBookmarks: is case-insensitive", () => {
  const result = filterBookmarks(bookmarks, "GITHUB");
  assert.deepEqual(result.map((b) => b.id), ["1"]);
});

test("filterBookmarks: falls back to fuzzy subsequence match", () => {
  const result = filterBookmarks(bookmarks, "mzll");
  assert.deepEqual(result.map((b) => b.id), ["3"]);
});

test("filterBookmarks: exact matches precede fuzzy matches in combined results", () => {
  // "oo" is an exact substring of "Google"; also a fuzzy subsequence of
  // "Hacker News"?? -> no. Use a query that hits both tiers instead.
  const mixed = [
    { id: "a", title: "abcabc", url: "https://a.example" },
    { id: "b", title: "xaxbxcx", url: "https://b.example" }, // fuzzy "abc"
  ];
  const result = filterBookmarks(mixed, "abc");
  assert.deepEqual(result.map((m) => m.id), ["a", "b"]);
});

test("filterBookmarks: no match returns an empty list", () => {
  const result = filterBookmarks(bookmarks, "zzzzz");
  assert.deepEqual(result, []);
});

test("filterBookmarks: trims whitespace in the query", () => {
  const result = filterBookmarks(bookmarks, "  git  ");
  assert.deepEqual(result.map((b) => b.id), ["1"]);
});

test("displayHost: strips a leading www.", () => {
  assert.equal(displayHost("https://www.example.com/path?q=1"), "example.com");
});

test("displayHost: keeps other subdomains and drops the port", () => {
  assert.equal(displayHost("https://news.ycombinator.com:8443/item"), "news.ycombinator.com");
  assert.equal(displayHost("https://wwwx.example.com"), "wwwx.example.com");
});

test("displayHost: falls back to the scheme for host-less URLs", () => {
  assert.equal(displayHost("file:///Users/me/notes.txt"), "file");
  assert.equal(displayHost("javascript:void(0)"), "javascript");
});

test("displayHost: returns an empty string for unparseable URLs", () => {
  assert.equal(displayHost("not a url"), "");
});

test("indexLabel: zero-pads to two digits, 1-based", () => {
  assert.equal(indexLabel(0), "#01");
  assert.equal(indexLabel(9), "#10");
  assert.equal(indexLabel(123), "#124");
});

const { urlKey, pickHistory } = require(path.join(__dirname, "..", "newtab.js"));

test("urlKey: ignores hash and trailing slashes", () => {
  assert.equal(urlKey("https://a.example/path/#top"), "https://a.example/path");
  assert.equal(urlKey("https://a.example/"), "https://a.example");
});

test("pickHistory: drops bookmarked and own pages, ranks sites by visits then recency", () => {
  const items = [
    { url: "https://a.example/", visitCount: 9, lastVisitTime: 1 },
    { url: "https://b.example", visitCount: 2, lastVisitTime: 5 },
    { url: "https://c.example", visitCount: 2, lastVisitTime: 9 },
    { url: "chrome-extension://me/newtab.html?focus", visitCount: 50, lastVisitTime: 9 },
    { url: "https://d.example", visitCount: 7, lastVisitTime: 1 },
  ];
  const picked = pickHistory(items, ["https://a.example"], 2, "chrome-extension://me/");
  assert.deepEqual(picked.map((i) => i.url), ["https://d.example/", "https://c.example/"]);
});

test("pickHistory: folds pages into one entry per site top", () => {
  const items = [
    { url: "https://github.com/foo/bar", visitCount: 3, lastVisitTime: 4 },
    { url: "https://github.com/baz#x", visitCount: 2, lastVisitTime: 7 },
    { url: "https://news.example/item?id=1", visitCount: 4, lastVisitTime: 1 },
    { url: "file:///Users/me/a.txt", visitCount: 99 },
  ];
  const picked = pickHistory(items, [], 10);
  assert.deepEqual(picked, [
    { url: "https://github.com/", title: "github.com", visitCount: 5, lastVisitTime: 7 },
    { url: "https://news.example/", title: "news.example", visitCount: 4, lastVisitTime: 1 },
  ]);
});

const { siteTop } = require(path.join(__dirname, "..", "newtab.js"));

test("siteTop: keeps the origin of web URLs only", () => {
  assert.equal(siteTop("https://www.example.com:8443/a/b?q=1#h"), "https://www.example.com:8443/");
  assert.equal(siteTop("http://x.example"), "http://x.example/");
  assert.equal(siteTop("chrome://settings"), null);
  assert.equal(siteTop("not a url"), null);
});

const { historyStep } = require(path.join(__dirname, "..", "newtab.js"));

test("historyStep: arrows and Ctrl+J/K pick history rows", () => {
  assert.equal(historyStep({ key: "ArrowDown" }), 1);
  assert.equal(historyStep({ key: "ArrowUp" }), -1);
  assert.equal(historyStep({ key: "j", ctrlKey: true }), 1);
  assert.equal(historyStep({ key: "k", ctrlKey: true }), -1);
  assert.equal(historyStep({ key: "j" }), 0);
  assert.equal(historyStep({ key: "ArrowDown", isComposing: true }), 0);
  assert.equal(historyStep({ key: "ArrowDown", metaKey: true }), 0);
});

test("isBookmarklet detects javascript: URLs only", () => {
  const { isBookmarklet } = require(path.join(__dirname, "..", "newtab.js"));
  assert.equal(isBookmarklet("javascript:alert(1)"), true);
  assert.equal(isBookmarklet("  JavaScript:void(0)"), true);
  assert.equal(isBookmarklet("https://example.com/javascript:"), false);
  assert.equal(isBookmarklet(""), false);
  assert.equal(isBookmarklet(undefined), false);
});
