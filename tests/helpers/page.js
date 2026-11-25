// Loads newtab.html into jsdom with a fake `chrome` and runs the real app
// (src/app.js) on it, so tests can drive it with key presses.
//
// jsdom has no layout: the grid always has one column, and every element
// gets the same non-zero box so link hints find targets.

import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { init } from "../../src/app.js";
import { nav } from "../../src/nav.js";

const HTML = readFileSync(new URL("../../newtab.html", import.meta.url), "utf8");
const EXTENSION = "chrome-extension://vimhome";

export const SAMPLE_BOOKMARKS = [
  { title: "GitHub", url: "https://github.com/" },
  { title: "Google", url: "https://www.google.com/" },
  { title: "MDN Web Docs", url: "https://developer.mozilla.org/" },
  { title: "Hacker News", url: "https://news.ycombinator.com/" },
];

function event() {
  const listeners = [];
  return {
    addListener: (fn) => listeners.push(fn),
    fire: (...args) => queueMicrotask(() => listeners.forEach((fn) => fn(...args))),
  };
}

/** Just enough of chrome.bookmarks / storage / history / search / runtime. */
function fakeChrome({ bookmarks, storage, history }) {
  let nextId = 100;
  // Folder "1" is the bookmarks bar (holding `bookmarks`), "2" Other bookmarks.
  const nodes = [
    { id: "1", parentId: "0", title: "Bookmarks bar" },
    { id: "2", parentId: "0", title: "Other bookmarks" },
    ...bookmarks.map((b, i) => ({ id: String(10 + i), parentId: "1", ...b })),
  ];
  const children = (parentId) => nodes.filter((n) => n.parentId === parentId);
  const reindex = (parentId) => children(parentId).forEach((n, i) => { n.index = i; });
  reindex("1");
  const tree = (node) => ({ ...node, children: node.url ? undefined : children(node.id).map(tree) });
  const later = (fn) => queueMicrotask(fn);
  const data = structuredClone(storage);

  const chrome = {
    calls: [],
    runtime: {
      lastError: undefined,
      getURL: (path) => `${EXTENSION}/${path.replace(/^\//, "")}`,
    },
    bookmarks: {
      onCreated: event(),
      onRemoved: event(),
      onChanged: event(),
      onMoved: event(),
      getTree(cb) {
        later(() => cb([{ id: "0", title: "", children: children("0").map(tree) }]));
      },
      getChildren(parentId, cb) {
        later(() => cb(children(parentId).map((n) => ({ ...n }))));
      },
      create({ parentId = "2", index, title = "", url }, cb) {
        const node = { id: String(nextId++), parentId, title, url };
        const siblings = children(parentId);
        const at = index === undefined ? siblings.length : index;
        const before = siblings[at];
        nodes.splice(before ? nodes.indexOf(before) : nodes.length, 0, node);
        reindex(parentId);
        chrome.calls.push(["create", { parentId, index, title, url }]);
        later(() => cb && cb({ ...node }));
        chrome.bookmarks.onCreated.fire(node.id, { ...node });
      },
      update(id, changes, cb) {
        Object.assign(nodes.find((n) => n.id === id), changes);
        chrome.calls.push(["update", id, changes]);
        later(() => cb && cb());
        chrome.bookmarks.onChanged.fire(id, changes);
      },
      remove(id, cb) {
        const node = nodes.find((n) => n.id === id);
        nodes.splice(nodes.indexOf(node), 1);
        reindex(node.parentId);
        chrome.calls.push(["remove", id]);
        later(() => cb && cb());
        chrome.bookmarks.onRemoved.fire(id, {});
      },
      move(id, destination, cb) {
        chrome.calls.push(["move", id, destination]);
        later(() => cb && cb());
        chrome.bookmarks.onMoved.fire(id, destination);
      },
    },
    storage: {
      data,
      onChanged: event(),
      local: {
        async get(keys) {
          return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
        },
        async set(items) {
          const changes = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
            data[key] = structuredClone(value);
          }
          chrome.storage.onChanged.fire(changes, "local");
        },
      },
    },
    history: {
      async search({ text }) {
        return history.filter((h) => h.url.includes(text) || (h.title || "").includes(text));
      },
    },
    search: {
      query(options) {
        chrome.calls.push(["search", options]);
      },
    },
  };
  return chrome;
}

let current = null;

// The app's intervals (the clock) would keep the test process alive, so
// track them and stop them when the page closes.
const realSetInterval = globalThis.setInterval;
const intervals = new Set();
globalThis.setInterval = (...args) => {
  const id = realSetInterval(...args);
  intervals.add(id);
  return id;
};

/** Opens a fresh page; the previous one is closed. */
export async function openPage({ bookmarks = SAMPLE_BOOKMARKS, storage = {}, history = [] } = {}) {
  closePage();
  const dom = new JSDOM(HTML, { url: `${EXTENSION}/newtab.html?focus`, pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;

  window.matchMedia = () => ({ matches: true }); // prefers-reduced-motion: no boot animation
  window.focus = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    const top = this.id === "statusline" ? 10000 : 10;
    return { top, bottom: top + 20, left: 0, right: 100, width: 100, height: 20 };
  };

  const chrome = fakeChrome({ bookmarks, storage, history });
  const navigations = [];
  nav.go = (url) => navigations.push({ url, newTab: false });
  nav.open = (url) => navigations.push({ url, newTab: true });
  nav.search = (text, newTab) => navigations.push({ search: text, newTab });

  // The app reads these as globals.
  Object.assign(globalThis, {
    window,
    document,
    chrome,
    getComputedStyle: window.getComputedStyle.bind(window),
  });
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true, writable: true });

  await init();
  await settle();

  const page = {
    window,
    document,
    chrome,
    navigations,
    /** Presses a key (KeyboardEvent init: {ctrlKey, shiftKey, metaKey, isComposing, ...}). */
    async press(key, init = {}) {
      const target = document.activeElement || document.body;
      const ev = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(ev);
      await settle();
      return ev;
    },
    /** Presses each character of `keys` in turn. */
    async keys(keys) {
      for (const key of keys) await page.press(key);
    },
    /** Types into the focused search input. */
    async type(text) {
      const input = document.getElementById("search-input");
      input.value += text;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      await settle();
    },
    titles: () => [...document.querySelectorAll("#grid .item .title")].map((el) => el.firstChild.textContent),
    focusedTitle: () => document.querySelector("#grid .item.focused .title")?.firstChild.textContent ?? null,
    mode: () => document.getElementById("mode").textContent,
    text: (id) => document.getElementById(id).textContent,
    isHidden: (id) => document.getElementById(id).classList.contains("hidden"),
  };
  current = { window };
  return page;
}

export function closePage() {
  if (!current) return;
  current.window.close();
  for (const id of intervals) clearInterval(id);
  intervals.clear();
  current = null;
}

/** Lets queued callbacks, events and promises run. */
export async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}
