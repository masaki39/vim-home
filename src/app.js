// Startup: load bookmarks and settings, draw the page, wire up listeners.

import { S, resetState } from "./state.js";
import { els } from "./dom.js";
import { loadState, onStorageChanged, pruneDeleted } from "./storage.js";
import { bootHeader, renderDashboard, startClock } from "./dashboard.js";
import { closeHelp, renderKeymap, toggleHelp } from "./help.js";
import { closeEditor, saveEditor } from "./editor.js";
import { bindDrag } from "./drag.js";
import { closeSearchBar, enterSearchMode, onSearchInput } from "./search.js";
import { onKeyDown } from "./keys.js";
import {
  applyFilter,
  focusApp,
  prefersReducedMotion,
  redrawDashboard,
  redrawGrid,
  render,
  resetView,
  updateHistoryIndicator,
  updateHudCount,
  updateMode,
  updateSortIndicator,
  updateStartIndicator,
} from "./view.js";

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
            untitled: !node.title,
            url: node.url,
            parentId: node.parentId,
            index: node.index,
          });
        }
        for (const child of node.children || []) walk(child);
      };
      for (const node of nodes) walk(node);
      resolve(result);
    });
  });
}

/** Reloads bookmarks from Chrome, preserving filter and focus where possible. */
async function refreshBookmarks() {
  S.allBookmarks = await loadBookmarksFlat();
  pruneDeleted();
  redrawGrid();
  redrawDashboard();
  if (!els.header.classList.contains("booting")) updateHudCount();
}

export async function init() {
  resetState();
  resetView();
  const [bookmarks, saved] = await Promise.all([loadBookmarksFlat(), loadState()]);
  S.allBookmarks = bookmarks;
  Object.assign(S, saved);
  pruneDeleted();
  renderKeymap();
  updateSortIndicator();
  updateStartIndicator();
  updateHistoryIndicator();
  const reducedMotion = prefersReducedMotion();
  // Fade the cards in on first load only; render() drops the class on any
  // later re-render (filtering, live sync, resize) so those appear instantly.
  if (!reducedMotion) els.grid.classList.add("booting");
  applyFilter("");
  renderDashboard();
  startClock();
  bootHeader(reducedMotion);

  document.addEventListener("keydown", onKeyDown, true);
  els.searchInput.addEventListener("input", onSearchInput);
  // Keys only act in search mode while the input has focus, so derive the
  // mode indicator from focus (this also covers blurring it by mouse).
  els.searchInput.addEventListener("focus", () => {
    // The bar is always on screen; clicking it while closed opens a search.
    if (els.searchBar.classList.contains("closed")) enterSearchMode();
    updateMode();
  });
  els.searchInput.addEventListener("blur", (event) => {
    // Clicking elsewhere on the page leaves search like Esc does (the filter
    // stays). Switching windows keeps it open, and so does clicking a
    // history chip, which would otherwise vanish before its click lands.
    const toChip = event.relatedTarget && els.historyList.contains(event.relatedTarget);
    if (document.hasFocus() && !toChip && !els.searchBar.classList.contains("closed")) closeSearchBar();
    updateMode();
  });
  els.hint.addEventListener("click", toggleHelp);
  els.helpOverlay.addEventListener("click", (event) => {
    if (event.target === els.helpOverlay) closeHelp();
  });
  els.editOverlay.addEventListener("click", (event) => {
    if (event.target === els.editOverlay) closeEditor();
  });
  els.editPanel.addEventListener("submit", (event) => {
    event.preventDefault();
    saveEditor();
  });
  window.addEventListener("resize", () => render());
  bindDrag(els.grid);

  // Keep the grid in sync if bookmarks change in another window/tab while
  // this new tab page stays open (e.g. via the bookmark manager or syncing).
  chrome.bookmarks.onCreated.addListener(refreshBookmarks);
  chrome.bookmarks.onRemoved.addListener(refreshBookmarks);
  chrome.bookmarks.onChanged.addListener(refreshBookmarks);
  chrome.bookmarks.onMoved.addListener(refreshBookmarks);
  if (chrome.bookmarks.onImportEnded) {
    chrome.bookmarks.onImportEnded.addListener(refreshBookmarks);
  }
  // Other open new tab pages write history/pins/sort too; follow them.
  chrome.storage.onChanged.addListener(onStorageChanged);

  // Chrome tends to leave keyboard focus in the address bar when a custom
  // New Tab page loads, which prevents our keydown handler from ever firing.
  // Explicitly steal focus back into the page, and retry shortly after in
  // case Chrome re-focuses the omnibox asynchronously post-load.
  if (S.startInSearch) enterSearchMode();
  focusApp();
  window.addEventListener("load", focusApp);
  window.addEventListener("pageshow", focusApp);
  setTimeout(focusApp, 50);
}
