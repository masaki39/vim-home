// e / a: the HUD form for editing or adding a bookmark.

import { isImeEnter, normalizeUrl } from "./logic.js";
import { S } from "./state.js";
import { els } from "./dom.js";
import { focusApp, focusedBookmark, showToast, updateMode } from "./view.js";

export function openEditor(mode) {
  const bookmark = mode === "edit" ? focusedBookmark() : null;
  if (mode === "edit" && !bookmark) return;
  S.editor = { mode, bookmark, saving: false };
  els.editSys.textContent = mode === "edit" ? "EDIT" : "ADD";
  els.editHeading.textContent = mode === "edit" ? "Edit bookmark" : "Add bookmark";
  els.editTitle.value = bookmark && !bookmark.untitled ? bookmark.title : "";
  els.editUrl.value = bookmark ? bookmark.url : "";
  showEditError("");
  els.editOverlay.classList.remove("hidden");
  const first = mode === "add" ? els.editUrl : els.editTitle;
  first.focus();
  first.select();
  updateMode();
}

export function closeEditor() {
  S.editor = null;
  els.editOverlay.classList.add("hidden");
  focusApp();
  updateMode();
}

function showEditError(message) {
  els.editError.textContent = message;
  els.editError.classList.toggle("hidden", !message);
}

export function saveEditor() {
  const session = S.editor;
  // Ignore repeated Enter while a save is in flight (would create duplicates).
  if (!session || session.saving) return;
  const url = normalizeUrl(els.editUrl.value);
  if (!url) {
    showEditError("URL is required");
    els.editUrl.focus();
    return;
  }
  try {
    new URL(url);
  } catch {
    showEditError(`Not a valid URL: ${url}`);
    els.editUrl.focus();
    return;
  }
  const title = els.editTitle.value.trim();
  const { mode, bookmark } = session;
  session.saving = true;
  const done = () => {
    if (chrome.runtime.lastError) {
      session.saving = false;
      if (S.editor === session) showEditError(chrome.runtime.lastError.message);
      return;
    }
    if (S.editor !== session) return;
    closeEditor();
    showToast(`${mode === "edit" ? "Updated" : "Added"} "${title || url}"`, 2000);
    // onChanged / onCreated trigger refreshBookmarks() to update the grid.
  };
  if (mode === "edit") {
    chrome.bookmarks.update(bookmark.id, { title, url }, done);
  } else {
    // No parentId: Chrome files it under "Other bookmarks".
    chrome.bookmarks.create({ title, url }, done);
  }
}

/** Keys while the form is open: typing is left alone; only Enter / Esc are taken. */
export function onEditorKey(event) {
  if (event.key !== "Escape" && (event.key !== "Enter" || isImeEnter(event))) return;
  event.stopPropagation();
  event.preventDefault();
  if (event.key === "Escape") closeEditor();
  else saveEditor();
}
