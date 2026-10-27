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
