// Link hints: f / F (open) and yf (copy).

import { hintLabels } from "./logic.js";
import { S } from "./state.js";
import { els } from "./dom.js";
import { openBookmark, yankUrl } from "./actions.js";
import { renderDashboard } from "./dashboard.js";
import { bookmarkById, deferredRedraw, gridScrolls, reorder, showToast, updateMode } from "./view.js";

/** Openable links currently on screen: grid cards and dashboard log entries. */
function hintTargets() {
  const bottom = els.statusline.getBoundingClientRect().top;
  // Cards scrolled out of the grid's own scroll area are clipped, though
  // still inside the window, so bound them by the grid's box as well.
  const gridBox = gridScrolls() ? els.grid.getBoundingClientRect() : null;
  return [...document.querySelectorAll("#grid .item, #dashboard .log-item")].filter((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.bottom <= 0 || rect.top >= bottom) return false;
    if (gridBox && el.classList.contains("item")) {
      return rect.bottom > gridBox.top && rect.top < gridBox.bottom;
    }
    return true;
  });
}

/** Labels every visible link; typing a label runs `action` ("open" | "open-new" | "yank") on it. */
export function enterHintMode(action) {
  exitHintMode();
  const targets = hintTargets();
  if (targets.length === 0) {
    showToast("No links on screen", 1500);
    return;
  }
  const labels = hintLabels(targets.length);
  const hints = targets.map((el, i) => {
    const labelEl = document.createElement("span");
    labelEl.className = "hint-label";
    labelEl.setAttribute("aria-hidden", "true");
    el.appendChild(labelEl);
    return { label: labels[i], el, labelEl };
  });
  S.hintSession = { action, typed: "", hints };
  document.body.classList.add("hinting");
  updateHintLabels();
  updateMode();
}

export function exitHintMode() {
  if (!S.hintSession) return;
  for (const hint of S.hintSession.hints) {
    hint.labelEl.remove();
    hint.el.classList.remove("hint-miss");
  }
  S.hintSession = null;
  document.body.classList.remove("hinting");
  updateMode();
  // Apply background changes that arrived while the hints were up.
  const { grid, dashboard } = deferredRedraw;
  deferredRedraw.grid = deferredRedraw.dashboard = false;
  if (grid) reorder();
  if (dashboard) renderDashboard();
}

/** Shows the typed prefix on matching labels and hides the rest. */
function updateHintLabels() {
  const { typed, hints } = S.hintSession;
  for (const hint of hints) {
    const match = hint.label.startsWith(typed);
    hint.labelEl.classList.toggle("miss", !match);
    hint.el.classList.toggle("hint-miss", !match);
    const done = document.createElement("span");
    done.className = "typed";
    done.textContent = typed;
    hint.labelEl.replaceChildren(done, hint.label.slice(typed.length));
  }
}

/** Every key while hints are up. */
export function onHintKey(event) {
  if (["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) return;
  event.stopPropagation();
  event.preventDefault();
  const session = S.hintSession;
  if (event.key === "Backspace") {
    session.typed = session.typed.slice(0, -1);
    updateHintLabels();
    return;
  }
  const ch = event.key.length === 1 ? event.key.toLowerCase() : "";
  const typed = session.typed + ch;
  const live = session.hints.filter((h) => h.label.startsWith(typed));
  // Esc, modifier combos and any key that isn't part of a label cancel.
  if (!ch || event.ctrlKey || event.metaKey || event.altKey || live.length === 0) {
    exitHintMode();
    return;
  }
  if (live.length === 1 && live[0].label === typed) {
    const bookmark = bookmarkById(live[0].el.dataset.id);
    exitHintMode();
    if (!bookmark) return;
    if (session.action === "yank") yankUrl(bookmark);
    else openBookmark(bookmark, session.action === "open-new");
    return;
  }
  session.typed = typed;
  updateHintLabels();
}
