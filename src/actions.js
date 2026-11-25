// NORMAL-mode commands on bookmarks: open, copy, pin, sort, toggles,
// delete / undo.

import { isBookmarklet, nextSortOrder, recordOpen, togglePin } from "./logic.js";
import { S } from "./state.js";
import { nav } from "./nav.js";
import { saveState } from "./storage.js";
import { renderDashboard } from "./dashboard.js";
import {
  focusedBookmark,
  reorder,
  showToast,
  updateHistoryIndicator,
  updateMode,
  updateSortIndicator,
  updateStartIndicator,
} from "./view.js";

// Last bookmark removed via "x" (plus its history and pin), kept briefly so
// "X" can restore it — for as long as the "press X to undo" toast shows.
const UNDO_WINDOW_MS = 8000;
let lastDeleted = null;
let lastDeletedTimer = null;

/** Opens a bookmark and logs the visit (count + time) to the access history. */
export async function openBookmark(bookmark, newTab) {
  if (isBookmarklet(bookmark.url)) {
    showToast("Bookmarklets can't run on the new tab page — open a site first, then use it from the bookmarks bar", 3500);
    return;
  }
  S.stats = recordOpen(S.stats, bookmark.id, Date.now());
  const saved = saveState({ stats: S.stats });
  if (newTab) {
    // Must run before any await: window.open needs the key/click activation.
    nav.open(bookmark.url);
    if (S.sortOrder !== "default") reorder();
    renderDashboard();
  } else {
    // Navigating away would drop the pending write, so wait for it first.
    await saved;
    nav.go(bookmark.url);
  }
}

export function openFocused(newTab) {
  const bookmark = focusedBookmark();
  if (bookmark) openBookmark(bookmark, newTab);
}

export async function yankUrl(bookmark) {
  if (!bookmark) return;
  try {
    await navigator.clipboard.writeText(bookmark.url);
    showToast(`Copied ${bookmark.url}`, 2000);
  } catch (err) {
    showToast(`Could not copy: ${err.message}`, 3000);
  }
}

export function togglePinFocused() {
  const bookmark = focusedBookmark();
  if (!bookmark) return;
  S.pins = togglePin(S.pins, bookmark.id);
  saveState({ pins: S.pins });
  reorder();
  showToast(`${S.pins.includes(bookmark.id) ? "Pinned" : "Unpinned"} "${bookmark.title}"`, 2000);
}

export function cycleSortOrder() {
  S.sortOrder = nextSortOrder(S.sortOrder);
  saveState({ sortOrder: S.sortOrder });
  updateSortIndicator();
  reorder();
  showToast(`Sort: ${S.sortOrder}`, 1500);
}

/** S: toggle whether new tabs open straight into search mode. */
export function toggleStartInSearch() {
  S.startInSearch = !S.startInSearch;
  saveState({ startInSearch: S.startInSearch });
  updateStartIndicator();
  showToast(`New tabs start in ${S.startInSearch ? "search" : "normal"} mode`, 2000);
}

/** H: toggle history suggestions in o / O search. */
export function toggleShowHistory() {
  S.showHistory = !S.showHistory;
  saveState({ showHistory: S.showHistory });
  updateHistoryIndicator();
  showToast(`History suggestions ${S.showHistory ? "on" : "off"}`, 2000);
}

/** x: ask before deleting the focused bookmark (y / Enter confirms). */
export function requestDelete() {
  const bookmark = focusedBookmark();
  if (!bookmark) return;
  S.pendingDelete = bookmark;
  showToast(`Delete "${bookmark.title}"? y / Enter to confirm · any other key cancels`, 0);
  updateMode();
}

/** The key pressed while a delete waits for confirmation. */
export function onConfirmDeleteKey(event) {
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key) || event.isComposing) return;
  event.stopPropagation();
  event.preventDefault();
  const bookmark = S.pendingDelete;
  S.pendingDelete = null;
  updateMode();
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
  if (plain && (event.key === "y" || event.key === "Enter")) deleteBookmark(bookmark);
  else showToast("Delete cancelled", 1200);
}

function deleteBookmark(bookmark) {
  const stat = S.stats[bookmark.id];
  const pinned = S.pins.includes(bookmark.id);
  chrome.bookmarks.remove(bookmark.id, () => {
    if (chrome.runtime.lastError) {
      showToast(chrome.runtime.lastError.message, 3000);
      return;
    }
    lastDeleted = { bookmark, stat, pinned };
    clearTimeout(lastDeletedTimer);
    lastDeletedTimer = setTimeout(() => { lastDeleted = null; }, UNDO_WINDOW_MS);
    showToast(`Deleted "${bookmark.title}" — press X to undo`, UNDO_WINDOW_MS);
    // The onRemoved listener triggers refreshBookmarks() to update the grid
    // (which also prunes the bookmark's history and pin).
  });
}

export function undoDelete() {
  if (!lastDeleted) return;
  const { bookmark, stat, pinned } = lastDeleted;
  const { title, url, parentId, index } = bookmark;
  lastDeleted = null;
  clearTimeout(lastDeletedTimer);
  // The folder may have lost children (or vanished) since: clamp the index
  // so the restore lands at the end instead of failing, or fall back to
  // Chrome's default folder.
  chrome.bookmarks.getChildren(parentId, (children) => {
    const target = chrome.runtime.lastError
      ? { title, url }
      : { parentId, index: Math.min(index, children.length), title, url };
    restoreBookmark(target, stat, pinned);
  });
}

function restoreBookmark(target, stat, pinned) {
  chrome.bookmarks.create(target, (node) => {
    if (chrome.runtime.lastError) {
      showToast(chrome.runtime.lastError.message, 3000);
      return;
    }
    // The restored bookmark gets a new id; carry its history and pin over.
    if (stat || pinned) {
      if (stat) S.stats = { ...S.stats, [node.id]: stat };
      if (pinned) S.pins = S.pins.concat(node.id);
      saveState({ stats: S.stats, pins: S.pins });
      reorder();
      renderDashboard();
    }
    showToast(`Restored "${target.title}"`, 2000);
    // The onCreated listener triggers refreshBookmarks() to update the grid.
  });
}
