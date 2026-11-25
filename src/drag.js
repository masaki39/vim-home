// Drag a card onto another to move the bookmark (default sort, no filter).

import { dropDestination } from "./logic.js";
import { S } from "./state.js";
import { els } from "./dom.js";
import { showToast } from "./view.js";

// Id of the card being dragged, or null.
let dragSourceId = null;

export function bindDrag(gridEl) {
  gridEl.addEventListener("dragstart", onDragStart);
  gridEl.addEventListener("dragover", onDragOver);
  gridEl.addEventListener("dragleave", onDragLeave);
  gridEl.addEventListener("drop", onDrop);
  gridEl.addEventListener("dragend", endDrag);
}

/** Drag-to-reorder only follows bookmark order, so it needs the unfiltered default sort. */
function canReorder() {
  return S.sortOrder === "default" && !els.searchInput.value;
}

function clearDropMarks() {
  for (const el of els.grid.querySelectorAll(".drop-before, .drop-after")) {
    el.classList.remove("drop-before", "drop-after");
  }
}

function onDragStart(event) {
  const item = event.target.closest && event.target.closest(".item");
  // Outside the default sort, leave the browser's normal link drag alone.
  if (!item || !canReorder()) return;
  dragSourceId = item.dataset.id;
  event.dataTransfer.effectAllowed = "move";
  item.classList.add("dragging");
}

/** The drop target card and positions for this drag event, or null if it can't be dropped. */
function dropContext(event) {
  if (!dragSourceId || !canReorder()) return null;
  const item = event.target.closest && event.target.closest(".item");
  if (!item || item.dataset.id === dragSourceId) return null;
  const from = S.visibleBookmarks.findIndex((b) => b.id === dragSourceId);
  const to = Number(item.dataset.index);
  const source = S.visibleBookmarks[from];
  const target = S.visibleBookmarks[to];
  if (!source || !target) return null;
  // Pinned cards always sort first, so moving across that boundary would
  // not show up in the grid; keep drops within the same group.
  if (S.pins.includes(source.id) !== S.pins.includes(target.id)) return null;
  return { item, from, to, source, target };
}

function onDragOver(event) {
  const ctx = dropContext(event);
  if (!ctx) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  const mark = ctx.from < ctx.to ? "drop-after" : "drop-before";
  if (!ctx.item.classList.contains(mark)) {
    clearDropMarks();
    ctx.item.classList.add(mark);
  }
}

function onDragLeave(event) {
  const item = event.target.closest && event.target.closest(".item");
  if (item && !item.contains(event.relatedTarget)) {
    item.classList.remove("drop-before", "drop-after");
  }
}

function onDrop(event) {
  const ctx = dropContext(event);
  endDrag();
  if (!ctx) return;
  event.preventDefault();
  const { parentId, index } = dropDestination(ctx.from, ctx.to, ctx.target);
  // Keep focus on the moved card; onMoved -> refreshBookmarks() redraws.
  S.focusedIndex = ctx.from;
  chrome.bookmarks.move(ctx.source.id, { parentId, index }, () => {
    if (chrome.runtime.lastError) showToast(chrome.runtime.lastError.message, 3000);
  });
}

function endDrag() {
  dragSourceId = null;
  clearDropMarks();
  for (const el of els.grid.querySelectorAll(".dragging")) el.classList.remove("dragging");
}
