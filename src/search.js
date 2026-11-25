// The search bar: o / O (search, with history suggestions) and / (filter).

import { historyStep, isBookmarklet, isClearKey, isImeEnter, pickHistory, resolveQuery, searchStep } from "./logic.js";
import { SEARCH_BAR_HINTS } from "./keymap.js";
import { S } from "./state.js";
import { els } from "./dom.js";
import { nav } from "./nav.js";
import { openFocused } from "./actions.js";
import {
  applyFilter,
  faviconImg,
  focusApp,
  focusedBookmark,
  getColumnCount,
  moveFocus,
  updateEmptyMessage,
  updateFilterTag,
  updateFocusVisual,
} from "./view.js";

const HISTORY_LIMIT = 10;
// Bumped per query so a slow chrome.history answer can't overwrite a newer one.
let historyQueryId = 0;

/**
 * o / O: search and open the match in this / a new tab.
 * "/": filter only — Enter returns to NORMAL mode on the filtered grid.
 */
export function enterSearchMode(newTab, filterOnly = false) {
  S.searchNewTab = newTab;
  S.searchFilterOnly = filterOnly;
  els.searchLabel.textContent = filterOnly ? "FILTER" : newTab ? "QUERY → NEW TAB" : "QUERY";
  els.searchKeys.textContent = filterOnly
    ? SEARCH_BAR_HINTS.filter
    : S.showHistory
      ? SEARCH_BAR_HINTS.open
      : SEARCH_BAR_HINTS.openNoHistory;
  els.searchBar.classList.remove("closed");
  els.searchInput.focus();
  updateFilterTag();
  refreshHistory();
}

/** Hides the search UI without touching the current filter or focus. */
export function closeSearchBar() {
  els.searchBar.classList.add("closed");
  els.searchLabel.textContent = "SEARCH";
  els.searchKeys.textContent = SEARCH_BAR_HINTS.closed;
  els.searchInput.blur();
  updateFilterTag();
  refreshHistory();
}

/** Escape: cancel the search — hide the bar and clear the filter. */
export function cancelSearch() {
  closeSearchBar();
  // Clear the filter too, so the grid doesn't stay silently filtered after
  // the search bar has closed.
  if (els.searchInput.value) {
    els.searchInput.value = "";
    applyFilter("");
  }
  updateFilterTag();
}

export function onSearchInput() {
  applyFilter(els.searchInput.value);
  refreshHistory();
}

/** Whether the current search should suggest history (o / O, not "/"). */
function historyActive() {
  return (
    S.showHistory &&
    !S.searchFilterOnly &&
    !els.searchBar.classList.contains("closed") &&
    !!els.searchInput.value.trim() &&
    !!chrome.history
  );
}

/** Re-queries chrome.history for the current search text and redraws the list. */
export async function refreshHistory() {
  const id = ++historyQueryId;
  if (!historyActive()) {
    setHistoryMatches([]);
    return;
  }
  const text = els.searchInput.value.trim();
  let items = [];
  try {
    items = await chrome.history.search({ text, startTime: 0, maxResults: 100 });
  } catch {
    items = [];
  }
  if (id !== historyQueryId) return;
  const ownPrefix = chrome.runtime.getURL("");
  setHistoryMatches(pickHistory(items, S.allBookmarks.map((b) => b.url), HISTORY_LIMIT, ownPrefix), text);
}

function setHistoryMatches(matches, query = "") {
  S.historyMatches = matches;
  S.historyQuery = query;
  // With no bookmark match, Enter goes to the top history match by default.
  S.historyIndex = S.visibleBookmarks.length === 0 && matches.length > 0 ? 0 : -1;
  renderHistory();
}

function renderHistory() {
  const listEl = els.historyList;
  listEl.replaceChildren();
  // The row keeps its height either way: site chips while a search has
  // history matches, the scrolling key ticker otherwise.
  listEl.classList.toggle("hidden", S.historyMatches.length === 0);
  els.ticker.classList.toggle("hidden", S.historyMatches.length > 0);
  els.grid.classList.toggle("history-selected", S.historyIndex >= 0);
  if (S.visibleBookmarks.length === 0) updateEmptyMessage();
  if (S.historyMatches.length === 0) return;
  const head = document.createElement("li");
  head.className = "history-head";
  head.setAttribute("aria-hidden", "true");
  const sys = document.createElement("span");
  sys.className = "hud-sys";
  sys.textContent = "LOG://";
  head.appendChild(sys);
  listEl.appendChild(head);
  S.historyMatches.forEach((item, i) => {
    const a = document.createElement("a");
    a.className = "log-item history-item";
    a.href = item.url;
    a.title = item.url;
    if (i === S.historyIndex) a.classList.add("selected");
    a.addEventListener("click", (event) => {
      event.preventDefault();
      openHistoryItem(item, S.searchNewTab || event.metaKey || event.ctrlKey);
    });
    const title = document.createElement("span");
    title.className = "log-title";
    title.textContent = item.title;
    a.append(faviconImg(item.url), title);
    const li = document.createElement("li");
    li.appendChild(a);
    listEl.appendChild(li);
  });
  const selected = listEl.querySelector(".selected");
  if (selected) selected.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function openHistoryItem(item, newTab) {
  if (isBookmarklet(item.url)) return;
  if (newTab) nav.open(item.url);
  else nav.go(item.url);
}

/**
 * Ctrl+H/J/K/L in the search bar: pick a bookmark match. From a history
 * chip the first press just hands the selection back to the grid.
 */
function searchGridMove(step) {
  if (S.historyIndex >= 0) {
    S.historyIndex = -1;
    renderHistory();
    updateFocusVisual();
    return;
  }
  moveFocus(step);
}

/**
 * Tab / Shift+Tab in the search bar: pick a history chip, wrapping around
 * the row. The first press from the grid lands on the first / last chip;
 * Ctrl+H/J/K/L hands the selection back to the grid.
 */
function searchHistoryMove(step) {
  const n = S.historyMatches.length;
  if (n === 0) return;
  S.historyIndex = S.historyIndex < 0 ? (step > 0 ? 0 : n - 1) : (S.historyIndex + step + n) % n;
  renderHistory();
}

/** Opens a typed query as a URL or a default-search-engine search. */
function openQuery(query, newTab) {
  const target = resolveQuery(query);
  if (!target) return;
  if (target.type === "search") nav.search(target.text, newTab);
  else if (newTab) nav.open(target.url);
  else nav.go(target.url);
}

/**
 * Enter in the search bar: open the picked history chip or bookmark, or —
 * when nothing matches, or with Shift held — treat the query as a URL / web
 * search. Returns whether this tab navigates away.
 */
function submitSearch(event) {
  const newTab = S.searchNewTab || event.metaKey || event.ctrlKey;
  const query = els.searchInput.value;
  const historyFresh = S.historyQuery === query.trim();
  const chip = S.historyMatches[S.historyIndex];
  let url = null;
  if (!event.shiftKey && historyFresh && S.historyIndex >= 0 && chip) {
    url = chip.url;
    openHistoryItem(chip, newTab);
  } else if (!event.shiftKey && focusedBookmark()) {
    url = focusedBookmark().url;
    openFocused(newTab);
  } else {
    if (!resolveQuery(query)) return false;
    openQuery(query, newTab);
  }
  // Whether this tab navigates away (bookmarklets are refused, not run).
  return !newTab && !(url && isBookmarklet(url));
}

/** Keys while the search input has focus; typing itself is left to the input. */
export function onSearchKey(event) {
  const step = searchStep(event, getColumnCount());
  const hStep = historyStep(event);
  let handled = true;
  if (step) {
    // Pick a match from the grid while typing; Enter opens it.
    searchGridMove(step);
  } else if (hStep) {
    // Tab only walks the history chips (a no-op without any), and never
    // moves focus out of the search bar.
    searchHistoryMove(hStep);
  } else if (isClearKey(event)) {
    // Ctrl+U clears the query (shell-style), keeping the search open.
    if (els.searchInput.value) {
      els.searchInput.value = "";
      onSearchInput();
    }
  } else if (event.key === "Escape") {
    cancelSearch();
  } else if (event.key === "Enter" && !isImeEnter(event)) {
    // Open the focused match (or search the web), then close the bar —
    // closing must not touch the filter/focus here, unlike Esc. In "/"
    // mode a plain Enter on a non-empty result just keeps the filter.
    // When this tab is about to navigate away, leave the bar and history
    // list up: hiding them now only makes the page jump before it unloads.
    const keepFilter = S.searchFilterOnly && !event.shiftKey && S.visibleBookmarks.length > 0;
    const leaving = !keepFilter && submitSearch(event);
    if (!leaving) {
      closeSearchBar();
      if (keepFilter) focusApp();
    }
  } else {
    handled = false;
  }
  if (handled) {
    event.stopPropagation();
    event.preventDefault();
  }
}
