"use strict";

const appEl = document.getElementById("app");
const gridEl = document.getElementById("grid");
const emptyEl = document.getElementById("empty");
const searchBarEl = document.getElementById("search-bar");
const searchInputEl = document.getElementById("search-input");
const hintEl = document.getElementById("hint");
const helpOverlayEl = document.getElementById("help-overlay");

/** @type {{id: string, title: string, url: string}[]} */
let allBookmarks = [];
/** @type {{id: string, title: string, url: string}[]} */
let visibleBookmarks = [];
let focusedIndex = 0;

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
          result.push({ id: node.id, title: node.title || node.url, url: node.url });
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

function faviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}

function applyFilter(query) {
  const q = query.trim().toLowerCase();
  visibleBookmarks = q
    ? allBookmarks.filter(
        (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
      )
    : allBookmarks;
  focusedIndex = 0;
  render();
}

function render() {
  gridEl.innerHTML = "";
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
    a.dataset.index = String(index);
    a.tabIndex = -1;

    const img = document.createElement("img");
    img.className = "favicon";
    img.src = faviconUrl(bookmark.url);
    img.alt = "";

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

function clampFocus() {
  if (visibleBookmarks.length === 0) {
    focusedIndex = 0;
    return;
  }
  focusedIndex = Math.max(0, Math.min(focusedIndex, visibleBookmarks.length - 1));
}

function updateFocusVisual() {
  const items = gridEl.querySelectorAll(".item");
  items.forEach((el) => el.classList.remove("focused"));
  const current = items[focusedIndex];
  if (current) {
    current.classList.add("focused");
    current.scrollIntoView({ block: "nearest" });
  }
}

function getColumnCount() {
  const style = getComputedStyle(gridEl);
  const columns = style.gridTemplateColumns.split(" ").filter(Boolean);
  return columns.length || 1;
}

function moveFocus(delta) {
  if (visibleBookmarks.length === 0) return;
  focusedIndex = Math.max(0, Math.min(focusedIndex + delta, visibleBookmarks.length - 1));
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

function enterSearchMode() {
  searchBarEl.classList.remove("hidden");
  searchInputEl.focus();
}

function exitSearchMode() {
  searchBarEl.classList.add("hidden");
  searchInputEl.blur();
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
