// Page state shared between modules. Everything lives on one object so
// modules can read and assign it (`S.focusedIndex = 0`) without a web of
// setters, and so init() can reset it in one place.

/** @typedef {{id: string, title: string, untitled: boolean, url: string, parentId: string, index: number}} Bookmark */

function initialState() {
  return {
    /** @type {Bookmark[]} every bookmark, in bookmark-tree order */
    allBookmarks: [],
    /** @type {Bookmark[]} the grid: sorted and filtered */
    visibleBookmarks: [],
    focusedIndex: 0,

    // Persisted in chrome.storage.local (src/storage.js): per-bookmark-id
    // open history ({count, lastOpened}), pinned ids, the grid sort order,
    // whether a new tab opens straight into search ("S") and whether the
    // search suggests browser history ("H").
    stats: {},
    pins: [],
    sortOrder: "default",
    startInSearch: false,
    showHistory: true,

    // Browser-history suggestions for the current query. historyQuery is
    // the query they answer (results arrive async, so Tab / Enter check it);
    // historyIndex is the chip Enter opens, or -1 while Enter opens the query.
    historyMatches: [],
    historyQuery: "",
    historyIndex: -1,

    // Active link-hint session ({action, typed, hints: [{label, el, labelEl}]}), or null.
    hintSession: null,
    // Open add/edit form ({mode: "add" | "edit", bookmark, saving}), or null.
    editor: null,
    // Bookmark waiting for the y / Enter confirmation after "x", or null.
    pendingDelete: null,
  };
}

export const S = initialState();

export function resetState() {
  Object.assign(S, initialState());
}
