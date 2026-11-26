// The grid: ordering, rendering, focus, plus the status line and toasts.

import { displayHost, filterBookmarks, indexLabel, resolveQuery, sortBookmarks } from "./logic.js";
import { S } from "./state.js";
import { els } from "./dom.js";
import { openBookmark } from "./actions.js";
import { exitHintMode } from "./hints.js";
import { isHelpOpen } from "./help.js";
import { renderDashboard } from "./dashboard.js";

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

// Redraws requested by background changes (other tabs, bookmark sync, the
// clock) while hints are up; rebuilding would drop the labels, so they wait
// until the hint session ends (see exitHintMode).
export const deferredRedraw = { grid: false, dashboard: false };

let hasRendered = false;
// Id of the bookmark that last received focus, so the focus scan light only
// plays when focus actually moves to a different bookmark — not when render()
// rebuilds the same focused card (resize, filtering, live sync).
let lastFocusedId = null;
let toastTimer = null;

/** Called by init(): the next render() is a first load again. */
export function resetView() {
  hasRendered = false;
  lastFocusedId = null;
  deferredRedraw.grid = deferredRedraw.dashboard = false;
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A favicon <img> for `pageUrl`, falling back to a placeholder. */
export function faviconImg(pageUrl, { lazy = false } = {}) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  const img = document.createElement("img");
  img.className = "favicon";
  img.src = url.toString();
  if (lazy) img.loading = "lazy";
  img.alt = "";
  img.addEventListener("error", () => { img.src = FALLBACK_FAVICON; }, { once: true });
  return img;
}

/**
 * Opens (and logs) a bookmark link on click — Ctrl/Cmd+click and middle
 * click open a new tab — instead of letting the browser follow the href
 * unrecorded.
 */
export function bindOpen(a, bookmark) {
  a.addEventListener("click", (event) => {
    event.preventDefault();
    openBookmark(bookmark, event.metaKey || event.ctrlKey);
  });
  a.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    openBookmark(bookmark, true);
  });
}

function orderedBookmarks(query) {
  return filterBookmarks(sortBookmarks(S.allBookmarks, { order: S.sortOrder, stats: S.stats, pins: S.pins }), query);
}

export function applyFilter(query) {
  S.visibleBookmarks = orderedBookmarks(query);
  S.focusedIndex = 0;
  render();
}

/** Re-sorts/filters the grid after a data change, keeping focus on the same bookmark. */
export function reorder() {
  const focused = S.visibleBookmarks[S.focusedIndex];
  S.visibleBookmarks = orderedBookmarks(els.searchInput.value);
  const idx = focused ? S.visibleBookmarks.findIndex((b) => b.id === focused.id) : -1;
  S.focusedIndex = idx === -1 ? 0 : idx;
  render();
}

/** Background-triggered reorder(): waits while link hints are on screen. */
export function redrawGrid() {
  if (S.hintSession) deferredRedraw.grid = true;
  else reorder();
}

/** Background-triggered renderDashboard(): waits while link hints are on screen. */
export function redrawDashboard() {
  if (S.hintSession) deferredRedraw.dashboard = true;
  else renderDashboard();
}

export function render() {
  // Rebuilding the grid drops any hint labels, so end the hint session.
  exitHintMode();
  const gridEl = els.grid;
  if (hasRendered) gridEl.classList.remove("booting");
  hasRendered = true;
  gridEl.replaceChildren();
  updateSearchCount();

  if (S.visibleBookmarks.length === 0) {
    updateEmptyMessage();
    els.empty.classList.remove("hidden");
    gridEl.classList.add("hidden");
    return;
  }
  els.empty.classList.add("hidden");
  gridEl.classList.remove("hidden");

  const fragment = document.createDocumentFragment();
  const pinned = new Set(S.pins);
  S.visibleBookmarks.forEach((bookmark, index) => {
    const isPinned = pinned.has(bookmark.id);
    const a = document.createElement("a");
    a.className = "item";
    if (isPinned) a.classList.add("pinned");
    a.href = bookmark.url;
    a.id = `bm-item-${index}`;
    a.dataset.index = String(index);
    a.dataset.id = bookmark.id;
    a.tabIndex = -1;
    a.setAttribute("role", "option");
    a.setAttribute("aria-selected", "false");
    a.style.setProperty("--i", String(Math.min(index, 40)));

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.setAttribute("aria-hidden", "true");
    idx.textContent = (isPinned ? "◆ " : "") + indexLabel(index);

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = bookmark.title;
    if (isPinned) {
      const srPin = document.createElement("span");
      srPin.className = "sr-only";
      srPin.textContent = " (pinned)";
      title.appendChild(srPin);
    }

    const host = document.createElement("span");
    host.className = "host";
    host.textContent = displayHost(bookmark.url);

    a.append(faviconImg(bookmark.url, { lazy: true }), idx, title, host);
    bindOpen(a, bookmark);
    fragment.appendChild(a);
  });
  gridEl.appendChild(fragment);

  clampFocus();
  updateFocusVisual();
}

function updateSearchCount() {
  els.searchCount.textContent = els.searchInput.value
    ? `${S.visibleBookmarks.length} / ${S.allBookmarks.length}`
    : "";
}

/** Empty-grid message; it names what Enter would do with the current query. */
export function updateEmptyMessage() {
  const query = els.searchInput.value.trim();
  const target = resolveQuery(query);
  const action =
    S.historyIndex >= 0
      ? "open the history match"
      : target && target.type === "url"
        ? "open the URL"
        : "search the web";
  const next = isSearchFocused() ? `Enter to ${action}` : "o to edit · Esc to clear";
  els.emptyMsg.textContent = target
    ? `NO SIGNAL — 0 nodes match “${query}” · ${next}`
    : "NO NODES — bookmark a page to populate this grid";
}

function clampFocus() {
  const last = S.visibleBookmarks.length - 1;
  S.focusedIndex = last < 0 ? 0 : Math.max(0, Math.min(S.focusedIndex, last));
}

export function updateFocusVisual() {
  const items = els.grid.querySelectorAll(".item");
  const focused = focusedBookmark();
  const focusedId = focused ? focused.id : null;
  const focusMoved = focusedId !== lastFocusedId;
  lastFocusedId = focusedId;
  items.forEach((el, i) => {
    const isFocused = i === S.focusedIndex;
    el.classList.toggle("focused", isFocused);
    // Only ever add "scan" on a real focus move; it's left on afterwards
    // (the animation runs once) and cleared when focus leaves the card.
    if (!isFocused || focusMoved) el.classList.toggle("scan", isFocused);
    el.setAttribute("aria-selected", isFocused ? "true" : "false");
  });
  const current = items[S.focusedIndex];
  if (current) {
    current.scrollIntoView({ block: "nearest" });
    els.app.setAttribute("aria-activedescendant", current.id);
  } else {
    els.app.removeAttribute("aria-activedescendant");
  }
}

export function getColumnCount() {
  const columns = getComputedStyle(els.grid).gridTemplateColumns.split(" ").filter(Boolean);
  return columns.length || 1;
}

/** Rough count of item rows that fit in the current viewport, for half-page moves. */
function getRowsPerPage() {
  const items = els.grid.querySelectorAll(".item");
  if (items.length === 0) return 1;
  const columns = getColumnCount();
  const first = items[0].getBoundingClientRect();
  let rowHeight = first.height;
  const nextRowItem = items[columns];
  if (nextRowItem) rowHeight = nextRowItem.getBoundingClientRect().top - first.top;
  if (rowHeight <= 0) return 1;
  // The grid scrolls on its own between the fixed header and dashboard
  // (see newtab.css); on small windows the whole page scrolls instead.
  const viewport = gridScrolls() ? els.grid.clientHeight : window.innerHeight;
  return Math.max(1, Math.floor(viewport / rowHeight));
}

/** Whether the grid is its own scroll area (the fixed layout) rather than the page. */
export function gridScrolls() {
  return getComputedStyle(els.grid).overflowY !== "visible";
}

export function moveFocus(delta) {
  if (S.visibleBookmarks.length === 0) return;
  S.focusedIndex = Math.max(0, Math.min(S.focusedIndex + delta, S.visibleBookmarks.length - 1));
  updateFocusVisual();
}

export function halfPageMove(direction) {
  if (S.visibleBookmarks.length === 0) return;
  const halfRows = Math.max(1, Math.floor(getRowsPerPage() / 2));
  moveFocus(direction * getColumnCount() * halfRows);
}

export function jumpTo(index) {
  if (S.visibleBookmarks.length === 0) return;
  S.focusedIndex = index < 0 ? S.visibleBookmarks.length - 1 : index;
  updateFocusVisual();
}

export function focusedBookmark() {
  return S.visibleBookmarks[S.focusedIndex] || null;
}

export function bookmarkById(id) {
  return S.allBookmarks.find((b) => b.id === id) || null;
}

/** Shows a toast for `duration` ms (0 = until the next toast replaces it). */
export function showToast(message, duration) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  if (duration > 0) toastTimer = setTimeout(() => els.toast.classList.add("hidden"), duration);
}

export function updateHudCount() {
  const n = S.allBookmarks.length;
  els.hudCount.textContent = `${n} NODE${n === 1 ? "" : "S"}`;
}

export function updateSortIndicator() {
  els.sort.textContent = `SORT:${S.sortOrder.toUpperCase()}`;
}

export function updateStartIndicator() {
  els.startTag.textContent = S.startInSearch ? "START:SEARCH" : "";
  els.startTag.title = S.startInSearch ? "New tabs open in search mode (S to toggle)" : "";
}

export function updateHistoryIndicator() {
  els.historyTag.textContent = S.showHistory ? "" : "HISTORY:OFF";
  els.historyTag.title = S.showHistory ? "" : "History suggestions are off (H to toggle)";
}

/** Status-line tag for a filter kept after the search bar closed (Esc). */
export function updateFilterTag() {
  const query = els.searchBar.classList.contains("closed") ? els.searchInput.value : "";
  els.filterTag.textContent = query ? `FILTER:${query}` : "";
  els.filterTag.title = query ? "Esc to clear" : "";
}

export function isSearchFocused() {
  return document.activeElement === els.searchInput;
}

/** Updates the vim-style mode indicator in the status line. */
export function updateMode() {
  const name = S.editor
    ? "EDIT"
    : S.pendingDelete
      ? "CONFIRM"
      : S.hintSession
        ? "HINTS"
        : isHelpOpen()
          ? "HELP"
          : isSearchFocused()
            ? "SEARCH"
            : "NORMAL";
  els.mode.textContent = name;
  // While typing, Enter opens the query, not the focused card: dim it.
  els.grid.classList.toggle("focus-idle", name === "SEARCH");
  // The empty-grid hint names what Enter / Esc do in this mode.
  if (S.visibleBookmarks.length === 0) updateEmptyMessage();
  els.mode.dataset.mode = name.toLowerCase();
}

export function focusApp() {
  window.focus();
  // Keep an open search bar's input focused (e.g. when starting in search
  // mode) rather than pulling focus back to the grid.
  if (!els.searchBar.classList.contains("closed")) els.searchInput.focus();
  else els.app.focus({ preventScroll: true });
}
