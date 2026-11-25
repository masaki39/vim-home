// Every navigation away from the page goes through here, so tests can
// swap these out (jsdom can't navigate) and see where the page would go.
export const nav = {
  /** Navigates this tab. */
  go(url) {
    window.location.href = url;
  },
  /** Opens a new tab; must run inside the key/click activation. */
  open(url) {
    window.open(url, "_blank");
  },
  /** Default-search-engine search for `text`. */
  search(text, newTab) {
    chrome.search.query({ text, disposition: newTab ? "NEW_TAB" : "CURRENT_TAB" });
  },
};
