"use strict";

const appEl = document.getElementById("app");
const gridEl = document.getElementById("grid");
const emptyEl = document.getElementById("empty");
const searchBarEl = document.getElementById("search-bar");
const searchInputEl = document.getElementById("search-input");
const searchCountEl = document.getElementById("search-count");
const hintEl = document.getElementById("hint");
const helpOverlayEl = document.getElementById("help-overlay");
const toastEl = document.getElementById("toast");

// A tiny inline placeholder favicon (a generic bookmark shape), used when
// Chrome's _favicon endpoint has nothing cached for a page. Avoids showing a
// broken-image icon, with no external network request.
const FALLBACK_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
      '<rect width="16" height="16" rx="3" fill="#3a3a3a"/>' +
      '<path d="M4 3h8a1 1 0 0 1 1 1v9l-5-3-5 3V4a1 1 0 0 1 1-1z" fill="#8a8a8a"/>' +
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

init();

async function init() {
  allBookmarks = await loadBookmarksFlat();
  applyFilter("");

  document.addEventListener("keydown", onKeyDown, true);
  searchInputEl.addEventListener("input", onSearchInput);
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

/** True if every character of `query` appears in `text`, in order (not necessarily adjacent). */
function isSubsequence(query, text) {
  let qi = 0;
  for (let i = 0; i < text.length && qi < query.length; i++) {
    if (text[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

function applyFilter(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    visibleBookmarks = allBookmarks;
  } else {
    // Substring matches (title or URL) rank first, preserving bookmark order.
    // Loose "fuzzy" subsequence matches are appended after, so typing
    // out-of-order characters still finds things without reshuffling the
    // common case of an exact substring search.
    const exact = [];
    const fuzzy = [];
    for (const b of allBookmarks) {
      const title = b.title.toLowerCase();
      const url = b.url.toLowerCase();
      if (title.includes(q) || url.includes(q)) {
        exact.push(b);
      } else if (isSubsequence(q, title) || isSubsequence(q, url)) {
        fuzzy.push(b);
      }
    }
    visibleBookmarks = exact.concat(fuzzy);
  }
  focusedIndex = 0;
  render();
}

function render() {
  gridEl.innerHTML = "";
  updateSearchCount();

  if (visibleBookmarks.length === 0) {
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

    const img = document.createElement("img");
    img.className = "favicon";
    img.src = faviconUrl(bookmark.url);
    img.loading = "lazy";
    img.alt = "";
    img.addEventListener("error", () => { img.src = FALLBACK_FAVICON; }, { once: true });

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = bookmark.title;

    a.appendChild(img);
    a.appendChild(title);
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
  items.forEach((el, i) => {
    const isFocused = i === focusedIndex;
    el.classList.toggle("focused", isFocused);
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

function enterSearchMode() {
  searchBarEl.classList.remove("hidden");
  searchInputEl.focus();
}

function exitSearchMode() {
  searchBarEl.classList.add("hidden");
  searchInputEl.blur();
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
}

function closeHelp() {
  helpOverlayEl.classList.add("hidden");
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
      exitSearchMode();
    } else if (event.key === "Enter") {
      event.stopPropagation();
      event.preventDefault();
      exitSearchMode();
      openFocused(event.metaKey || event.ctrlKey);
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
