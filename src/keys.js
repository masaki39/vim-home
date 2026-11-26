// The keydown dispatcher: whichever mode is active gets the key first.
// NORMAL-mode bindings themselves are data (NORMAL_BINDINGS in
// src/keymap.js); this file maps their action names to code.

import { NORMAL_BINDINGS } from "./keymap.js";
import { S } from "./state.js";
import { els } from "./dom.js";
import {
  cycleSortOrder,
  onConfirmDeleteKey,
  openFocused,
  requestDelete,
  toggleShowHistory,
  toggleStartInSearch,
  togglePinFocused,
  undoDelete,
  yankUrl,
} from "./actions.js";
import { closeHelp, isHelpOpen, openHelp } from "./help.js";
import { enterHintMode, onHintKey } from "./hints.js";
import { onEditorKey, openEditor } from "./editor.js";
import { cancelSearch, enterSearchMode, onSearchKey } from "./search.js";
import { focusedBookmark, getColumnCount, halfPageMove, isSearchFocused, jumpTo, moveFocus } from "./view.js";

// A two-key combo in progress ("gg", "yy", "yf"); its first key shows in
// the status line like vim's showcmd.
let pendingKey = null;
let pendingKeyTimer = null;

function setPendingKey(key) {
  pendingKey = key;
  els.pending.textContent = key;
  clearTimeout(pendingKeyTimer);
  pendingKeyTimer = setTimeout(clearPendingKey, 600);
}

function clearPendingKey() {
  pendingKey = null;
  els.pending.textContent = "";
  clearTimeout(pendingKeyTimer);
}

/** NORMAL-mode actions by name. Handlers get the keydown event. */
export const ACTIONS = {
  left: () => moveFocus(-1),
  right: () => moveFocus(1),
  down: () => moveFocus(getColumnCount()),
  up: () => moveFocus(-getColumnCount()),
  halfPageDown: () => halfPageMove(1),
  halfPageUp: () => halfPageMove(-1),
  first: () => {
    if (pendingKey === "g") {
      clearPendingKey();
      jumpTo(0);
    } else {
      setPendingKey("g");
    }
  },
  last: () => jumpTo(-1),
  open: (event) => openFocused(event.metaKey || event.ctrlKey),
  hint: () => enterHintMode("open"),
  hintNewTab: () => enterHintMode("open-new"),
  search: () => enterSearchMode(),
  // Clears the filter left on the grid by Esc in the search bar.
  clearFilter: () => cancelSearch(),
  delete: () => requestDelete(),
  undo: () => undoDelete(),
  yank: () => setPendingKey("y"),
  edit: () => openEditor("edit"),
  add: () => openEditor("add"),
  pin: () => togglePinFocused(),
  sort: () => cycleSortOrder(),
  toggleStartInSearch: () => toggleStartInSearch(),
  toggleHistory: () => toggleShowHistory(),
  help: () => openHelp(),
};

function onNormalKey(event) {
  // Leave browser/OS shortcuts (Cmd+F, Ctrl+D, ...) alone; only Enter
  // takes a modifier (Ctrl/Cmd+Enter opens in a new tab).
  if ((event.ctrlKey || event.metaKey || event.altKey) && event.key !== "Enter") {
    clearPendingKey();
    return;
  }

  if (pendingKey === "y" && (event.key === "y" || event.key === "f")) {
    event.stopPropagation();
    event.preventDefault();
    clearPendingKey();
    if (event.key === "y") yankUrl(focusedBookmark());
    else enterHintMode("yank");
    return;
  }

  // Any key other than the one a pending combo ("gg"/"yy") is waiting on
  // cancels that combo, so e.g. "g" then "j" doesn't linger as a stale "g".
  if (pendingKey && event.key !== pendingKey) clearPendingKey();

  const action = ACTIONS[NORMAL_BINDINGS[event.key]];
  if (!action) return;
  event.stopPropagation();
  event.preventDefault();
  action(event);
}

function onHelpKey(event) {
  if (event.key !== "Escape" && event.key !== "?") return;
  event.stopPropagation();
  event.preventDefault();
  closeHelp();
}

// Handled keys always stop propagation, so Vimium's own key handling never
// sees them.
export function onKeyDown(event) {
  if (S.editor) onEditorKey(event);
  else if (S.hintSession) onHintKey(event);
  else if (S.pendingDelete) onConfirmDeleteKey(event);
  else if (isSearchFocused()) onSearchKey(event);
  else if (isHelpOpen()) onHelpKey(event);
  else onNormalKey(event);
}
