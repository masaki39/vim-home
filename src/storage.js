// chrome.storage.local: loading, saving and following other new tab pages.

import { SORT_ORDERS, pruneState } from "./logic.js";
import { S } from "./state.js";
import { redrawDashboard, redrawGrid, showToast, updateHistoryIndicator, updateSortIndicator, updateStartIndicator } from "./view.js";
import { refreshHistory, updateSearchKeys } from "./search.js";

const KEYS = ["stats", "pins", "sortOrder", "startInSearch", "showHistory"];

// Values this page wrote per storage key ({json, at}) whose onChanged echo
// hasn't arrived yet, so a late echo of an older write can't roll memory
// back. Entries expire, since Chrome sends no echo for an unchanged value.
const OWN_WRITE_TTL_MS = 3000;
const ownWrites = Object.fromEntries(KEYS.map((key) => [key, []]));

export async function loadState() {
  const items = await chrome.storage.local.get(KEYS);
  return {
    stats: items.stats && typeof items.stats === "object" ? items.stats : {},
    pins: Array.isArray(items.pins) ? items.pins : [],
    sortOrder: SORT_ORDERS.includes(items.sortOrder) ? items.sortOrder : "default",
    startInSearch: items.startInSearch === true,
    showHistory: items.showHistory !== false,
  };
}

/** Persists `items` (a subset of KEYS); never rejects, a failure shows a toast. */
export async function saveState(items) {
  const written = Object.entries(items).map(([key, value]) => {
    const entry = { json: JSON.stringify(value), at: Date.now() };
    ownWrites[key].push(entry);
    return [key, entry];
  });
  try {
    await chrome.storage.local.set(items);
  } catch (err) {
    // No echo will come for a failed write.
    for (const [key, entry] of written) {
      const i = ownWrites[key].indexOf(entry);
      if (i !== -1) ownWrites[key].splice(i, 1);
    }
    showToast(`Could not save: ${err.message}`, 3000);
  }
}

/** True (and forgotten) if this change is the echo of one of our own writes. */
function isOwnWrite(key, change) {
  const now = Date.now();
  const queue = (ownWrites[key] = ownWrites[key].filter((e) => now - e.at < OWN_WRITE_TTL_MS));
  const json = JSON.stringify(change.newValue);
  const i = queue.findIndex((e) => e.json === json);
  if (i === -1) return false;
  // Echoes arrive in write order; anything older was already superseded.
  queue.splice(0, i + 1);
  return true;
}

/** Forgets history and pins of bookmarks that no longer exist. */
export function pruneDeleted() {
  const pruned = pruneState({ stats: S.stats, pins: S.pins }, S.allBookmarks.map((b) => b.id));
  if (!pruned.changed) return;
  S.stats = pruned.stats;
  S.pins = pruned.pins;
  saveState({ stats: S.stats, pins: S.pins });
}

export function onStorageChanged(changes, area) {
  if (area !== "local") return;
  // Our own writes already updated memory: skip their echoes (even late
  // ones, which would otherwise roll back newer values) and only react to
  // real differences coming from other pages.
  const differs = (key) =>
    changes[key] &&
    !isOwnWrite(key, changes[key]) &&
    JSON.stringify(changes[key].newValue) !== JSON.stringify(S[key]);
  let regrid = false;
  if (differs("stats")) {
    S.stats = changes.stats.newValue || {};
    regrid = S.sortOrder !== "default";
    redrawDashboard();
  }
  if (differs("pins")) {
    S.pins = changes.pins.newValue || [];
    regrid = true;
  }
  if (differs("sortOrder")) {
    S.sortOrder = SORT_ORDERS.includes(changes.sortOrder.newValue) ? changes.sortOrder.newValue : "default";
    updateSortIndicator();
    regrid = true;
  }
  // Only affects the next new tab, so just follow the indicator here.
  if (differs("startInSearch")) {
    S.startInSearch = changes.startInSearch.newValue === true;
    updateStartIndicator();
  }
  if (differs("showHistory")) {
    S.showHistory = changes.showHistory.newValue !== false;
    updateHistoryIndicator();
    updateSearchKeys();
    refreshHistory();
  }
  if (regrid) redrawGrid();
}
