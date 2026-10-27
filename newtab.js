"use strict";

// `document` doesn't exist when this file is `require()`d by the Node test
// runner (see tests/), so DOM lookups and the app bootstrap are guarded by
// this flag rather than assumed.
const hasDom = typeof document !== "undefined";

const appEl = hasDom ? document.getElementById("app") : null;
const gridEl = hasDom ? document.getElementById("grid") : null;
const emptyEl = hasDom ? document.getElementById("empty") : null;
const emptyMsgEl = hasDom ? document.getElementById("empty-msg") : null;
const searchBarEl = hasDom ? document.getElementById("search-bar") : null;
const searchInputEl = hasDom ? document.getElementById("search-input") : null;
const searchCountEl = hasDom ? document.getElementById("search-count") : null;
const hintEl = hasDom ? document.getElementById("hint") : null;
const helpOverlayEl = hasDom ? document.getElementById("help-overlay") : null;
const toastEl = hasDom ? document.getElementById("toast") : null;
const modeEl = hasDom ? document.getElementById("mode") : null;
const headerEl = hasDom ? document.getElementById("hud-header") : null;
const hudCountEl = hasDom ? document.getElementById("hud-count") : null;

const reducedMotion =
  hasDom && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A tiny inline placeholder favicon (a generic bookmark shape), used when
// Chrome's _favicon endpoint has nothing cached for a page. Avoids showing a
// broken-image icon, with no external network request.
const FALLBACK_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect x="0.5" y="0.5" width="31" height="31" fill="#07182a" stroke="#1d6f8c"/>' +
      '<path d="M10 7h12a1 1 0 0 1 1 1v17l-7-4.5L9 25V8a1 1 0 0 1 1-1z" fill="none" stroke="#5ce1ff" stroke-width="1.5" stroke-linejoin="round"/>' +
      "</svg>"
  );

/** @type {{id: string, title: string, url: string, parentId: string, index: number}[]} */
let allBookmarks = [];
/** @type {{id: string, title: string, url: string, parentId: string, index: number}[]} */
let visibleBookmarks = [];
let focusedIndex = 0;

// Tracks a two-key combo in progress (e.g. "gg", "dd").
let pendingKey = null;
let pendingKeyTimer = null;

// Last bookmark removed via "dd", kept briefly so "u" can restore it.
let lastDeleted = null;
let lastDeletedTimer = null;
let toastTimer = null;
let hasRendered = false;
// Id of the bookmark that last received focus, so the focus scan light only
// plays when focus actually moves to a different bookmark — not when render()
// rebuilds the same focused card (resize, filtering, live sync).
let lastFocusedId = null;

if (hasDom) init();

async function init() {
  allBookmarks = await loadBookmarksFlat();
  // Fade the cards in on first load only; render() drops the class on any
  // later re-render (filtering, live sync, resize) so those appear instantly.
  if (!reducedMotion) gridEl.classList.add("booting");
  applyFilter("");
  bootHeader();

  document.addEventListener("keydown", onKeyDown, true);
  searchInputEl.addEventListener("input", onSearchInput);
  // Keys only act in search mode while the input has focus, so derive the
  // mode indicator from focus (this also covers blurring it by mouse).
  searchInputEl.addEventListener("focus", updateMode);
  searchInputEl.addEventListener("blur", updateMode);
  hintEl.addEventListener("click", toggleHelp);
  helpOverlayEl.addEventListener("click", (event) => {
    if (event.target === helpOverlayEl) closeHelp();
  });
  window.addEventListener("resize", () => render());

  // Keep the grid in sync if bookmarks change in another window/tab while
  // this new tab page stays open (e.g. via the bookmark manager or syncing).
  chrome.bookmarks.onCreated.addListener(refreshBookmarks);
  chrome.bookmarks.onRemoved.addListener(refreshBookmarks);
  chrome.bookmarks.onChanged.addListener(refreshBookmarks);
  chrome.bookmarks.onMoved.addListener(refreshBookmarks);
  if (chrome.bookmarks.onImportEnded) {
    chrome.bookmarks.onImportEnded.addListener(refreshBookmarks);
  }

  // Chrome tends to leave keyboard focus in the address bar when a custom
  // New Tab page loads, which prevents our keydown handler from ever firing.
  // Explicitly steal focus back into the page, and retry shortly after in
  // case Chrome re-focuses the omnibox asynchronously post-load.
  focusApp();
  window.addEventListener("load", focusApp);
  window.addEventListener("pageshow", focusApp);
  setTimeout(focusApp, 50);
}

/** Short HUD boot: the header rule draws in (CSS), then the node count appears. */
function bootHeader() {
  if (reducedMotion) {
    updateHudCount();
    return;
  }
  headerEl.classList.add("booting");
  hudCountEl.textContent = "LINKING\u2026";
  setTimeout(() => {
    headerEl.classList.remove("booting");
    updateHudCount();
  }, 480);
}

function updateHudCount() {
  const n = allBookmarks.length;
  hudCountEl.textContent = `${n} NODE${n === 1 ? "" : "S"}`;
}

function focusApp() {
  window.focus();
  appEl.focus({ preventScroll: true });
}

/**
 * Walk chrome.bookmarks.getTree() recursively and flatten it into a list of
 * leaf nodes that have a URL (i.e. actual bookmarks, not folders).
 */
function loadBookmarksFlat() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((nodes) => {
      const result = [];
      const walk = (node) => {
        if (node.url) {
          result.push({
            id: node.id,
            title: node.title || node.url,
            url: node.url,
            parentId: node.parentId,
            index: node.index,
          });
        }
        if (node.children) {
          for (const child of node.children) walk(child);
        }
      };
      for (const node of nodes) walk(node);
      resolve(result);
    });
  });
}

/** Reloads bookmarks from Chrome, preserving filter and focus where possible. */
async function refreshBookmarks() {
  const focusedId = visibleBookmarks[focusedIndex] ? visibleBookmarks[focusedIndex].id : null;
  allBookmarks = await loadBookmarksFlat();
  applyFilter(searchInputEl.value);
  if (!headerEl.classList.contains("booting")) updateHudCount();
  if (focusedId) {
    const idx = visibleBookmarks.findIndex((b) => b.id === focusedId);
    if (idx !== -1) {
      focusedIndex = idx;
      updateFocusVisual();
    }
  }
}

function faviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}

/**
 * Short host label for a card: the hostname without a leading "www.".
 * URLs without a host (file:, javascript:, data:) fall back to their scheme,
 * and unparseable ones to an empty string.
 */
function displayHost(url) {
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
function indexLabel(index) {
  return `#${String(index + 1).padStart(2, "0")}`;
}

/** True if every character of `query` appears in `text`, in order (not necessarily adjacent). */
function isSubsequence(query, text) {
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
function filterBookmarks(bookmarks, query) {
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
const HINT_CHARS = "sadfjklewcmpgh";
const SORT_ORDERS = ["default", "frequent", "recent"];

/**
 * Link-hint labels for `count` targets: all the same, shortest length that
 * fits, so no label is a prefix of another and typing one always resolves.
 * The first character varies fastest, so the first keystroke splits the
 * targets as evenly as possible.
 */
function hintLabels(count, chars = HINT_CHARS) {
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
function nextSortOrder(order) {
  return SORT_ORDERS[(SORT_ORDERS.indexOf(order) + 1) % SORT_ORDERS.length];
}

/**
 * Orders bookmarks for the grid: pinned ones first, then by `order`
 * ("default" = bookmark order, "frequent" = open count, "recent" = last
 * opened). Ties, and bookmarks never opened, keep bookmark order.
 */
function sortBookmarks(bookmarks, { order = "default", stats = {}, pins = [] } = {}) {
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
function recordOpen(stats, id, now) {
  const prev = stats[id] || {};
  return { ...stats, [id]: { count: (prev.count || 0) + 1, lastOpened: now } };
}

/** Returns a copy of `pins` with `id` added, or removed if already pinned. */
function togglePin(pins, id) {
  return pins.includes(id) ? pins.filter((p) => p !== id) : pins.concat(id);
}

/**
 * Drops history and pins for bookmark ids that no longer exist. `changed`
 * says whether anything was dropped, so callers only persist when needed.
 */
function pruneState({ stats, pins }, ids) {
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
function topRecent(bookmarks, stats, limit = 5) {
  return bookmarks
    .filter((b) => stats[b.id] && stats[b.id].lastOpened)
    .map((bookmark) => ({ bookmark, lastOpened: stats[bookmark.id].lastOpened }))
    .sort((x, y) => y.lastOpened - x.lastOpened)
    .slice(0, limit);
}

/** The `limit` most opened bookmarks, ties broken by most recent. */
function topFrequent(bookmarks, stats, limit = 5) {
  return bookmarks
    .filter((b) => stats[b.id] && stats[b.id].count > 0)
    .map((bookmark) => ({ bookmark, ...stats[bookmark.id] }))
    .sort((x, y) => y.count - x.count || (y.lastOpened || 0) - (x.lastOpened || 0))
    .slice(0, limit)
    .map(({ bookmark, count }) => ({ bookmark, count }));
}

/** Compact age of a timestamp, e.g. "just now", "5m ago", "3h ago", "2d ago". */
function relativeTime(then, now) {
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
function formatClock(date) {
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
function normalizeUrl(input) {
  const url = input.trim();
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) || /^(about|data|javascript|mailto):/i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

function applyFilter(query) {
  visibleBookmarks = filterBookmarks(allBookmarks, query);
  focusedIndex = 0;
  render();
}

// Expose pure logic to Node's test runner. `module` doesn't exist in the
// browser's plain <script> context, so this is a no-op there.
if (typeof module !== "undefined") {
  module.exports = {
    isSubsequence,
    filterBookmarks,
    displayHost,
    indexLabel,
    HINT_CHARS,
    hintLabels,
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
  };
}

function render() {
  if (hasRendered) gridEl.classList.remove("booting");
  hasRendered = true;
  gridEl.innerHTML = "";
  updateSearchCount();

  if (visibleBookmarks.length === 0) {
    const query = searchInputEl.value.trim();
    emptyMsgEl.textContent = query
      ? `NO SIGNAL \u2014 0 nodes match \u201c${query}\u201d`
      : "NO NODES \u2014 bookmark a page to populate this grid";
    emptyEl.classList.remove("hidden");
    gridEl.classList.add("hidden");
    return;
  }
  emptyEl.classList.add("hidden");
  gridEl.classList.remove("hidden");

  const fragment = document.createDocumentFragment();
  visibleBookmarks.forEach((bookmark, index) => {
    const a = document.createElement("a");
    a.className = "item";
    a.href = bookmark.url;
    a.id = `bm-item-${index}`;
    a.dataset.index = String(index);
    a.tabIndex = -1;
    a.setAttribute("role", "option");
    a.setAttribute("aria-selected", "false");
    a.style.setProperty("--i", String(Math.min(index, 40)));

    const img = document.createElement("img");
    img.className = "favicon";
    img.src = faviconUrl(bookmark.url);
    img.loading = "lazy";
    img.alt = "";
    img.addEventListener("error", () => { img.src = FALLBACK_FAVICON; }, { once: true });

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.setAttribute("aria-hidden", "true");
    idx.textContent = indexLabel(index);

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = bookmark.title;

    const host = document.createElement("span");
    host.className = "host";
    host.textContent = displayHost(bookmark.url);

    a.appendChild(img);
    a.appendChild(idx);
    a.appendChild(title);
    a.appendChild(host);
    a.addEventListener("click", (event) => {
      event.preventDefault();
      openBookmark(bookmark, event.metaKey || event.ctrlKey);
    });

    fragment.appendChild(a);
  });
  gridEl.appendChild(fragment);

  clampFocus();
  updateFocusVisual();
}

function updateSearchCount() {
  if (!searchInputEl.value) {
    searchCountEl.textContent = "";
    return;
  }
  searchCountEl.textContent = `${visibleBookmarks.length} / ${allBookmarks.length}`;
}

function clampFocus() {
  if (visibleBookmarks.length === 0) {
    focusedIndex = 0;
    return;
  }
  focusedIndex = Math.max(0, Math.min(focusedIndex, visibleBookmarks.length - 1));
}

function updateFocusVisual() {
  const items = gridEl.querySelectorAll(".item");
  const focusedId = visibleBookmarks[focusedIndex] ? visibleBookmarks[focusedIndex].id : null;
  const focusMoved = focusedId !== lastFocusedId;
  lastFocusedId = focusedId;
  items.forEach((el, i) => {
    const isFocused = i === focusedIndex;
    el.classList.toggle("focused", isFocused);
    // Only ever add "scan" on a real focus move; it's left on afterwards
    // (the animation runs once) and cleared when focus leaves the card.
    if (!isFocused || focusMoved) el.classList.toggle("scan", isFocused);
    el.setAttribute("aria-selected", isFocused ? "true" : "false");
  });
  const current = items[focusedIndex];
  if (current) {
    current.scrollIntoView({ block: "nearest" });
    appEl.setAttribute("aria-activedescendant", current.id);
  } else {
    appEl.removeAttribute("aria-activedescendant");
  }
}

function getColumnCount() {
  const style = getComputedStyle(gridEl);
  const columns = style.gridTemplateColumns.split(" ").filter(Boolean);
  return columns.length || 1;
}

/** Rough count of item rows that fit in the current viewport, for half-page moves. */
function getRowsPerPage() {
  const items = gridEl.querySelectorAll(".item");
  if (items.length === 0) return 1;
  const columns = getColumnCount();
  const first = items[0].getBoundingClientRect();
  let rowHeight = first.height;
  const nextRowItem = items[columns];
  if (nextRowItem) {
    const second = nextRowItem.getBoundingClientRect();
    rowHeight = second.top - first.top;
  }
  if (rowHeight <= 0) return 1;
  return Math.max(1, Math.floor(window.innerHeight / rowHeight));
}

function moveFocus(delta) {
  if (visibleBookmarks.length === 0) return;
  focusedIndex = Math.max(0, Math.min(focusedIndex + delta, visibleBookmarks.length - 1));
  updateFocusVisual();
}

function halfPageMove(direction) {
  if (visibleBookmarks.length === 0) return;
  const columns = getColumnCount();
  const halfRows = Math.max(1, Math.floor(getRowsPerPage() / 2));
  moveFocus(direction * columns * halfRows);
}

function jumpToFirst() {
  if (visibleBookmarks.length === 0) return;
  focusedIndex = 0;
  updateFocusVisual();
}

function jumpToLast() {
  if (visibleBookmarks.length === 0) return;
  focusedIndex = visibleBookmarks.length - 1;
  updateFocusVisual();
}

function openBookmark(bookmark, newTab) {
  if (newTab) {
    window.open(bookmark.url, "_blank");
  } else {
    window.location.href = bookmark.url;
  }
}

function openFocused(newTab) {
  const bookmark = visibleBookmarks[focusedIndex];
  if (bookmark) openBookmark(bookmark, newTab);
}

function deleteFocused() {
  const bookmark = visibleBookmarks[focusedIndex];
  if (!bookmark) return;
  chrome.bookmarks.remove(bookmark.id, () => {
    if (chrome.runtime.lastError) {
      showToast(chrome.runtime.lastError.message, 3000);
      return;
    }
    lastDeleted = bookmark;
    clearTimeout(lastDeletedTimer);
    lastDeletedTimer = setTimeout(() => { lastDeleted = null; }, 8000);
    showToast(`Deleted "${bookmark.title}" — press u to undo`, 5000);
    // The onRemoved listener triggers refreshBookmarks() to update the grid.
  });
}

function undoDelete() {
  if (!lastDeleted) return;
  const { title, url, parentId, index } = lastDeleted;
  lastDeleted = null;
  clearTimeout(lastDeletedTimer);
  chrome.bookmarks.create({ parentId, index, title, url }, () => {
    if (chrome.runtime.lastError) {
      showToast(chrome.runtime.lastError.message, 3000);
      return;
    }
    showToast(`Restored "${title}"`, 2000);
    // The onCreated listener triggers refreshBookmarks() to update the grid.
  });
}

function showToast(message, duration) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), duration);
}

function setPendingKey(key) {
  pendingKey = key;
  clearTimeout(pendingKeyTimer);
  pendingKeyTimer = setTimeout(() => { pendingKey = null; }, 600);
}

function clearPendingKey() {
  pendingKey = null;
  clearTimeout(pendingKeyTimer);
}

/** Updates the vim-style mode indicator in the status line. */
function updateMode() {
  const name = isHelpOpen() ? "HELP" : isSearchFocused() ? "SEARCH" : "NORMAL";
  modeEl.textContent = name;
  modeEl.dataset.mode = name.toLowerCase();
}

function enterSearchMode() {
  searchBarEl.classList.remove("hidden");
  searchInputEl.focus();
}

/** Hides the search UI without touching the current filter or focus. */
function closeSearchBar() {
  searchBarEl.classList.add("hidden");
  searchInputEl.blur();
}

/** Escape: cancel the search — hide the bar and clear the filter. */
function cancelSearch() {
  closeSearchBar();
  // Clear the filter too, so the grid doesn't stay silently filtered after
  // the search bar has visually disappeared.
  if (searchInputEl.value) {
    searchInputEl.value = "";
    applyFilter("");
  }
}

function onSearchInput() {
  applyFilter(searchInputEl.value);
}

function isSearchFocused() {
  return document.activeElement === searchInputEl;
}

function isHelpOpen() {
  return !helpOverlayEl.classList.contains("hidden");
}

function openHelp() {
  helpOverlayEl.classList.remove("hidden");
  updateMode();
}

function closeHelp() {
  helpOverlayEl.classList.add("hidden");
  updateMode();
}

function toggleHelp() {
  if (isHelpOpen()) {
    closeHelp();
  } else {
    openHelp();
  }
}

function onKeyDown(event) {
  // Always stop propagation for keys we handle so Vimium's own key handling
  // never sees them.
  if (isSearchFocused()) {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      cancelSearch();
    } else if (event.key === "Enter") {
      event.stopPropagation();
      event.preventDefault();
      // Open whatever is currently focused in the filtered list, then close
      // the bar — closing must not touch the filter/focus here, unlike Esc.
      openFocused(event.metaKey || event.ctrlKey);
      closeSearchBar();
    }
    return;
  }

  if (isHelpOpen()) {
    if (event.key === "Escape" || event.key === "?") {
      event.stopPropagation();
      event.preventDefault();
      closeHelp();
    }
    return;
  }

  // Any key other than the one a pending combo ("gg"/"dd") is waiting on
  // cancels that combo, so e.g. "g" then "j" doesn't linger as a stale "g".
  if (pendingKey && event.key !== pendingKey) {
    clearPendingKey();
  }

  switch (event.key) {
    case "h":
    case "ArrowLeft":
      event.stopPropagation();
      event.preventDefault();
      moveFocus(-1);
      break;
    case "l":
    case "ArrowRight":
      event.stopPropagation();
      event.preventDefault();
      moveFocus(1);
      break;
    case "j":
    case "ArrowDown":
      event.stopPropagation();
      event.preventDefault();
      moveFocus(getColumnCount());
      break;
    case "k":
    case "ArrowUp":
      event.stopPropagation();
      event.preventDefault();
      moveFocus(-getColumnCount());
      break;
    case "J":
      event.stopPropagation();
      event.preventDefault();
      halfPageMove(1);
      break;
    case "K":
      event.stopPropagation();
      event.preventDefault();
      halfPageMove(-1);
      break;
    case "g":
      event.stopPropagation();
      event.preventDefault();
      if (pendingKey === "g") {
        clearPendingKey();
        jumpToFirst();
      } else {
        setPendingKey("g");
      }
      break;
    case "G":
      event.stopPropagation();
      event.preventDefault();
      jumpToLast();
      break;
    case "d":
      event.stopPropagation();
      event.preventDefault();
      if (pendingKey === "d") {
        clearPendingKey();
        deleteFocused();
      } else {
        setPendingKey("d");
      }
      break;
    case "u":
      event.stopPropagation();
      event.preventDefault();
      undoDelete();
      break;
    case "Enter":
      event.stopPropagation();
      event.preventDefault();
      openFocused(event.metaKey || event.ctrlKey);
      break;
    case "o":
      event.stopPropagation();
      event.preventDefault();
      openFocused(true);
      break;
    case "/":
      event.stopPropagation();
      event.preventDefault();
      enterSearchMode();
      break;
    case "?":
      event.stopPropagation();
      event.preventDefault();
      openHelp();
      break;
    default:
      break;
  }
}
