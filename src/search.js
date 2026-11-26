// The search bar (o / "/"): filters the grid as you type, suggests history
// sites, and opens the query on Enter.

import { historyStep, isBookmarklet, isClearKey, isImeEnter, pickHistory, resolveQuery } from "./logic.js";
import { SEARCH_BAR_HINTS } from "./keymap.js";
import { S } from "./state.js";
import { els } from "./dom.js";
import { nav } from "./nav.js";
import { applyFilter, faviconImg, focusApp, updateEmptyMessage, updateFilterTag } from "./view.js";

const HISTORY_LIMIT = 10;
// Bumped per query so a slow chrome.history answer can't overwrite a newer one.
let historyQueryId = 0;

/**
 * o / "/": focus the search bar. Typing filters the grid; Enter opens the
 * query (or a picked history chip); Esc drops to NORMAL on the filtered grid.
 * The query is kept, so coming back carries on where it left off.
 */
export function enterSearchMode() {
  els.searchLabel.textContent = "QUERY";
  els.searchKeys.textContent = S.showHistory ? SEARCH_BAR_HINTS.open : SEARCH_BAR_HINTS.openNoHistory;
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

/** Esc in NORMAL: clear a kept filter (and the query with it). */
export function cancelSearch() {
  closeSearchBar();
  if (els.searchInput.value) {
    els.searchInput.value = "";
    applyFilter("");
  }
  updateFilterTag();
}

export function onSearchInput() {
  applyFilter(els.searchInput.value);
  // A chip picked for the old text no longer answers this one.
  S.historyIndex = -1;
  renderHistory();
  refreshHistory();
}

/** Whether the current search should suggest history. */
function historyActive() {
  return (
    S.showHistory &&
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
  S.historyIndex = -1;
  renderHistory();
}

function renderHistory() {
  const listEl = els.historyList;
  listEl.replaceChildren();
  // The row keeps its height either way: site chips while a search has
  // history matches, the scrolling key ticker otherwise.
  listEl.classList.toggle("hidden", S.historyMatches.length === 0);
  els.ticker.classList.toggle("hidden", S.historyMatches.length > 0);
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
      openHistoryItem(item, event.metaKey || event.ctrlKey);
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

/** Whether the chips on screen answer the text in the input (they arrive async). */
function historyFresh() {
  return S.historyMatches.length > 0 && S.historyQuery === els.searchInput.value.trim();
}

/**
 * Tab / Shift+Tab in the search bar: walk the history chips. The walk
 * passes through "no chip" between the last and the first, which hands
 * Enter back to the typed query.
 */
function searchHistoryMove(step) {
  const n = S.historyMatches.length;
  if (!historyFresh()) return;
  // Slots 0..n-1 are chips, slot n is the query itself.
  const slot = S.historyIndex < 0 ? n : S.historyIndex;
  const next = (slot + step + n + 1) % (n + 1);
  S.historyIndex = next === n ? -1 : next;
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
 * Enter in the search bar: open the picked history chip, or else the query
 * as a URL / web search. Returns whether this tab navigates away.
 */
function submitSearch(event) {
  const newTab = event.metaKey || event.ctrlKey;
  const query = els.searchInput.value;
  const chip = historyFresh() ? S.historyMatches[S.historyIndex] : null;
  if (chip) {
    openHistoryItem(chip, newTab);
    // Bookmarklets are refused, not run.
    return !newTab && !isBookmarklet(chip.url);
  }
  if (!resolveQuery(query)) return false;
  openQuery(query, newTab);
  return !newTab;
}

/** Esc / a blank Enter: back to NORMAL on the (still filtered) grid. */
function leaveToGrid() {
  // A whitespace-only query filters nothing; don't leave it as a FILTER tag.
  if (els.searchInput.value && !els.searchInput.value.trim()) {
    els.searchInput.value = "";
    applyFilter("");
  }
  closeSearchBar();
  focusApp();
}

/** Keys while the search input has focus; typing itself is left to the input. */
export function onSearchKey(event) {
  const hStep = historyStep(event);
  let handled = true;
  if (hStep) {
    // Tab only walks the history chips (a no-op without any), and never
    // moves focus out of the search bar.
    searchHistoryMove(hStep);
  } else if (isClearKey(event)) {
    // Ctrl+U clears the query (shell-style), keeping the search open.
    if (els.searchInput.value) {
      els.searchInput.value = "";
      onSearchInput();
    }
  } else if (event.key === "Escape" && !isImeEnter(event)) {
    // An IME's Esc cancels the conversion; leave it to the input.
    leaveToGrid();
  } else if (event.key === "Enter" && !isImeEnter(event)) {
    // When this tab is about to navigate away, leave the bar and history
    // list up: hiding them now only makes the page jump before it unloads.
    if (!submitSearch(event)) leaveToGrid();
  } else {
    handled = false;
  }
  if (handled) {
    event.stopPropagation();
    event.preventDefault();
  }
}
