// Page elements, looked up on access so nothing touches `document` at import
// time (tests import these modules before they build a page).

const IDS = {
  app: "app",
  grid: "grid",
  empty: "empty",
  emptyMsg: "empty-msg",
  searchBar: "search-bar",
  searchInput: "search-input",
  searchCount: "search-count",
  searchLabel: "search-label",
  searchKeys: "search-keys",
  hint: "hint",
  helpOverlay: "help-overlay",
  helpBody: "help-body",
  toast: "toast",
  mode: "mode",
  header: "hud-header",
  hudCount: "hud-count",
  pending: "pending",
  sort: "sort-order",
  startTag: "start-tag",
  historyTag: "history-tag",
  filterTag: "filter-tag",
  historyList: "history-list",
  ticker: "ticker",
  statusline: "statusline",
  editOverlay: "edit-overlay",
  editPanel: "edit-panel",
  editSys: "edit-sys",
  editHeading: "edit-heading",
  editTitle: "edit-title",
  editUrl: "edit-url",
  editError: "edit-error",
  clockTime: "clock-time",
  clockSec: "clock-sec",
  clockDate: "clock-date",
  clockZone: "clock-zone",
  dashSummary: "dash-summary",
  recentList: "recent-list",
};

/** @type {Record<keyof typeof IDS, HTMLElement>} */
export const els = {};
for (const [name, id] of Object.entries(IDS)) {
  Object.defineProperty(els, name, { get: () => document.getElementById(id), enumerable: true });
}
