// Pure logic: no DOM, no chrome.* APIs, no module state. Everything here is
// unit tested under Node (tests/); keep it that way so the rest of the app
// can stay a thin layer of wiring around these functions.

/**
 * Short host label for a card: the hostname without a leading "www.".
 * URLs without a host (file:, javascript:, data:) fall back to their scheme,
 * and unparseable ones to an empty string.
 */
export function displayHost(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  const host = parsed.hostname.replace(/^www\./, "");
  return host || parsed.protocol.replace(/:$/, "");
}

/** Zero-padded card index label, e.g. 0 -> "#01". */
export function indexLabel(index) {
  return `#${String(index + 1).padStart(2, "0")}`;
}

/** True if every character of `query` appears in `text`, in order (not necessarily adjacent). */
export function isSubsequence(query, text) {
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

/**
 * Pure filtering logic, kept separate from module state so it's unit
 * testable under Node without a DOM or the chrome.* APIs.
 *
 * Substring matches (title or URL) rank first, preserving bookmark order.
 * Loose "fuzzy" subsequence matches are appended after, so typing
 * out-of-order characters still finds things without reshuffling the
 * common case of an exact substring search.
 */
export function filterBookmarks(bookmarks, query) {
  const q = query.trim().toLowerCase();
  if (!q) return bookmarks.slice();

  const exact = [];
  const fuzzy = [];
  for (const b of bookmarks) {
    const title = b.title.toLowerCase();
    const url = b.url.toLowerCase();
    if (title.includes(q) || url.includes(q)) {
      exact.push(b);
    } else if (isSubsequence(q, title) || isSubsequence(q, url)) {
      fuzzy.push(b);
    }
  }
  return exact.concat(fuzzy);
}

// Vimium's default link-hint alphabet (home row first).
export const HINT_CHARS = "sadfjklewcmpgh";
export const SORT_ORDERS = ["default", "frequent", "recent"];

/**
 * Link-hint labels for `count` targets: all the same, shortest length that
 * fits, so no label is a prefix of another and typing one always resolves.
 * The first character varies fastest, so the first keystroke splits the
 * targets as evenly as possible.
 */
export function hintLabels(count, chars = HINT_CHARS) {
  if (count <= 0) return [];
  let length = 1;
  while (chars.length ** length < count) length++;
  const labels = [];
  for (let n = 0; n < count; n++) {
    let label = "";
    let rest = n;
    for (let i = 0; i < length; i++) {
      label += chars[rest % chars.length];
      rest = Math.floor(rest / chars.length);
    }
    labels.push(label);
  }
  return labels;
}

/** The sort order after `order` in the `s` cycle (unknown values restart it). */
export function nextSortOrder(order) {
  return SORT_ORDERS[(SORT_ORDERS.indexOf(order) + 1) % SORT_ORDERS.length];
}

/**
 * Orders bookmarks for the grid: pinned ones first, then by `order`
 * ("default" = bookmark order, "frequent" = open count, "recent" = last
 * opened). Ties, and bookmarks never opened, keep bookmark order.
 */
export function sortBookmarks(bookmarks, { order = "default", stats = {}, pins = [] } = {}) {
  const pinned = new Set(pins);
  const keyed = bookmarks.map((bookmark, i) => ({ bookmark, i, stat: stats[bookmark.id] || {} }));
  keyed.sort((x, y) => {
    const px = pinned.has(x.bookmark.id);
    const py = pinned.has(y.bookmark.id);
    if (px !== py) return px ? -1 : 1;
    let diff = 0;
    if (order === "frequent") diff = (y.stat.count || 0) - (x.stat.count || 0);
    else if (order === "recent") diff = (y.stat.lastOpened || 0) - (x.stat.lastOpened || 0);
    return diff || x.i - y.i;
  });
  return keyed.map((k) => k.bookmark);
}

/** Returns a copy of `stats` with one more open of `id` recorded at `now`. */
export function recordOpen(stats, id, now) {
  const prev = stats[id] || {};
  return { ...stats, [id]: { count: (prev.count || 0) + 1, lastOpened: now } };
}

/** Returns a copy of `pins` with `id` added, or removed if already pinned. */
export function togglePin(pins, id) {
  return pins.includes(id) ? pins.filter((p) => p !== id) : pins.concat(id);
}

/**
 * Drops history and pins for bookmark ids that no longer exist. `changed`
 * says whether anything was dropped, so callers only persist when needed.
 */
export function pruneState({ stats, pins }, ids) {
  const live = new Set(ids);
  const nextStats = {};
  for (const [id, stat] of Object.entries(stats)) {
    if (live.has(id)) nextStats[id] = stat;
  }
  const nextPins = pins.filter((id) => live.has(id));
  const changed =
    Object.keys(nextStats).length !== Object.keys(stats).length || nextPins.length !== pins.length;
  return { stats: nextStats, pins: nextPins, changed };
}

/** The `limit` most recently opened bookmarks, newest first. */
export function topRecent(bookmarks, stats, limit = 5) {
  return bookmarks
    .filter((b) => stats[b.id] && stats[b.id].lastOpened)
    .map((bookmark) => ({ bookmark, lastOpened: stats[bookmark.id].lastOpened }))
    .sort((x, y) => y.lastOpened - x.lastOpened)
    .slice(0, limit);
}

/** Compact age of a timestamp, e.g. "just now", "5m ago", "3h ago", "2d ago". */
export function relativeTime(then, now) {
  const minutes = Math.floor(Math.max(0, now - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Local-time clock parts for the dashboard, e.g. {time: "09:05", seconds: "07", date: "TUE 2026.10.27"}. */
export function formatClock(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const day = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][date.getDay()];
  return {
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    seconds: pad(date.getSeconds()),
    date: `${day} ${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
  };
}

/**
 * Cleans up a URL typed into the add/edit form: trims it and assumes
 * https:// when no scheme is given (so "example.com" or "localhost:3000"
 * work). Returns "" for blank input.
 */
export function normalizeUrl(input) {
  const url = input.trim();
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) || /^(about|data|javascript|mailto):/i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

/**
 * Decides what a search-bar query means on Enter,
 * Vomnibar-style: something URL-shaped is visited directly, anything else
 * goes to the default search engine. Returns null for a blank query.
 */
export function resolveQuery(input) {
  const text = input.trim();
  if (!text) return null;
  if (/\s/.test(text)) return { type: "search", text };
  if (/^(https?|ftp|file|chrome|chrome-extension|about):/i.test(text)) {
    return { type: "url", url: text };
  }
  // Local hosts are usually plain HTTP dev servers.
  if (/^(localhost|127\.0\.0\.1|\[::1\]|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/i.test(text)) {
    return { type: "url", url: `http://${text}` };
  }
  // host.tld[:port][/path...] with an alphabetic TLD.
  if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(text)) {
    return { type: "url", url: `https://${text}` };
  }
  return { type: "search", text };
}

/**
 * Where chrome.bookmarks.move() should put `source` when it is dropped on
 * `target` (grid positions `from` -> `to`): after the target when dragged
 * forward, before it when dragged back. Chrome reads the index as a slot in
 * the parent *before* the node is removed, so target.index (+1) is right
 * whether or not both share a folder.
 */
export function dropDestination(from, to, target) {
  const after = from < to;
  return { after, parentId: target.parentId, index: target.index + (after ? 1 : 0) };
}

/** History-chip step for a key pressed in the search bar (Tab / Shift+Tab), or 0. */
export function historyStep(event) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return 0;
  if (event.key === "Tab") return event.shiftKey ? -1 : 1;
  return 0;
}

/**
 * javascript: bookmarklets can't run here: the new tab is an extension
 * page, and MV3's script-src 'self' CSP blocks javascript: navigations.
 */
export function isBookmarklet(url) {
  return /^\s*javascript:/i.test(url || "");
}

/** URL identity for de-duplicating history against bookmarks: no hash, no trailing slash. */
export function urlKey(url) {
  return url.replace(/#.*$/, "").replace(/\/+$/, "");
}

/** A history URL's site top ("https://host/"), or null for non-web URLs. */
export function siteTop(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.origin}/`;
  } catch {
    return null;
  }
}

/**
 * Picks history suggestions from chrome.history.search() results, folded
 * into one entry per site that opens the site's top page. Drops sites
 * whose top page is already bookmarked, this extension's own pages and
 * non-web URLs, then ranks sites by total visits, most recent first on ties.
 */
export function pickHistory(items, bookmarkUrls, limit, ownPrefix = "") {
  const taken = new Set(bookmarkUrls.map(urlKey));
  const sites = new Map();
  for (const item of items) {
    if (!item.url || (ownPrefix && item.url.startsWith(ownPrefix))) continue;
    const top = siteTop(item.url);
    if (!top || taken.has(urlKey(top))) continue;
    const site = sites.get(top) || { url: top, title: displayHost(top), visitCount: 0, lastVisitTime: 0 };
    site.visitCount += item.visitCount || 0;
    site.lastVisitTime = Math.max(site.lastVisitTime, item.lastVisitTime || 0);
    sites.set(top, site);
  }
  return [...sites.values()]
    .sort((a, b) => b.visitCount - a.visitCount || b.lastVisitTime - a.lastVisitTime)
    .slice(0, limit);
}

/** Ctrl+U in the search bar: clear the whole query. */
export function isClearKey(event) {
  return !event.isComposing && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key === "u";
}

/** A key (Enter, Esc) that drives an IME conversion (e.g. Japanese input), not the page. */
export function isImeEnter(event) {
  return event.isComposing || event.keyCode === 229;
}

/** The dashboard's zone label for a Date#getTimezoneOffset() value, e.g. -540 -> "UTC+9". */
export function utcOffsetLabel(timezoneOffset) {
  const offset = -timezoneOffset;
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
}
