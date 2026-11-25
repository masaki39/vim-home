// The bottom dashboard (clock, RECENT log) and the header's boot animation.

import { formatClock, relativeTime, topRecent, utcOffsetLabel } from "./logic.js";
import { S } from "./state.js";
import { els } from "./dom.js";
import { bindOpen, faviconImg, redrawDashboard, updateHudCount } from "./view.js";
import { exitHintMode } from "./hints.js";

/** Short HUD boot: the header rule draws in (CSS), then the node count appears. */
export function bootHeader(reducedMotion) {
  if (reducedMotion) {
    updateHudCount();
    return;
  }
  els.header.classList.add("booting");
  els.hudCount.textContent = "LINKING…";
  setTimeout(() => {
    els.header.classList.remove("booting");
    updateHudCount();
  }, 480);
}

/** Ticks the dashboard clock; on each new minute also refreshes the log's "5m ago" ages. */
export function startClock() {
  let lastMinute = null;
  const tick = () => {
    const clock = formatClock(new Date());
    els.clockTime.textContent = clock.time;
    els.clockSec.textContent = clock.seconds;
    els.clockDate.textContent = clock.date;
    if (lastMinute !== null && clock.time !== lastMinute) redrawDashboard();
    lastMinute = clock.time;
  };
  tick();
  els.clockZone.textContent = utcOffsetLabel(new Date().getTimezoneOffset());
  setInterval(tick, 1000);
}

/** Summary line plus the RECENT access log. */
export function renderDashboard() {
  // Rebuilding the logs drops any hint labels on them.
  exitHintMode();
  const now = Date.now();
  const opens = Object.values(S.stats).reduce((sum, s) => sum + (s.count || 0), 0);
  els.dashSummary.textContent =
    `${S.allBookmarks.length} NODES · ${S.pins.length} PINNED · ${opens} OPEN${opens === 1 ? "" : "S"} LOGGED`;
  fillLog(els.recentList, topRecent(S.allBookmarks, S.stats), (entry) => relativeTime(entry.lastOpened, now));
}

function fillLog(listEl, entries, metaText) {
  listEl.replaceChildren();
  if (entries.length === 0) {
    const li = document.createElement("li");
    li.className = "log-empty";
    const head = document.createElement("span");
    head.textContent = "NO ACCESS LOG";
    const sub = document.createElement("span");
    sub.className = "log-empty-sub";
    sub.textContent = "open a bookmark to start logging";
    li.append(head, sub);
    listEl.appendChild(li);
    return;
  }
  for (const entry of entries) {
    const { bookmark } = entry;
    const a = document.createElement("a");
    a.className = "log-item";
    a.href = bookmark.url;
    a.dataset.id = bookmark.id;
    a.tabIndex = -1;
    a.title = bookmark.url;

    const title = document.createElement("span");
    title.className = "log-title";
    title.textContent = bookmark.title;

    const meta = document.createElement("span");
    meta.className = "log-meta";
    meta.textContent = metaText(entry);

    a.append(faviconImg(bookmark.url), title, meta);
    bindOpen(a, bookmark);
    const li = document.createElement("li");
    li.appendChild(a);
    listEl.appendChild(li);
  }
}
