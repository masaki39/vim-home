// Everything that documents keys on the page, built from src/keymap.js:
// the help panel, the status-line hint and the key ticker.

import { KEY_NOTES, KEY_SECTIONS, collect, parseKeyText } from "./keymap.js";
import { els } from "./dom.js";
import { updateMode } from "./view.js";

/** Appends `text` to `parent`, with `backticked` runs as <kbd>. */
function appendKeyText(parent, text) {
  for (const part of parseKeyText(text)) {
    if (part.kbd) {
      const kbd = document.createElement("kbd");
      kbd.textContent = part.text;
      parent.appendChild(kbd);
    } else {
      parent.appendChild(document.createTextNode(part.text));
    }
  }
}

export function renderKeymap() {
  const body = els.helpBody;
  body.replaceChildren();
  for (const section of KEY_SECTIONS) {
    const heading = document.createElement("h3");
    appendKeyText(heading, section.title);
    const dl = document.createElement("dl");
    for (const entry of section.entries) {
      const dt = document.createElement("dt");
      appendKeyText(dt, entry.keys);
      const dd = document.createElement("dd");
      appendKeyText(dd, entry.help || entry.summary);
      dl.append(dt, dd);
    }
    body.append(heading, dl);
  }
  for (const note of KEY_NOTES) {
    const p = document.createElement("p");
    p.className = "help-note";
    appendKeyText(p, note);
    body.appendChild(p);
  }

  const hint = els.hint;
  hint.replaceChildren();
  collect("status").forEach(([key, label], i) => {
    if (i > 0) hint.appendChild(document.createTextNode(" · "));
    const kbd = document.createElement("kbd");
    kbd.textContent = key;
    hint.append(kbd, document.createTextNode(` ${label}`));
  });

  // Two identical runs, so the CSS animation can loop seamlessly.
  const run = collect("ticker").map((item) => `${item} ◆ `).join("") + " ";
  const track = els.ticker.querySelector(".ticker-track");
  track.replaceChildren();
  for (let i = 0; i < 2; i++) {
    const span = document.createElement("span");
    span.textContent = run;
    track.appendChild(span);
  }
}

export function isHelpOpen() {
  return !els.helpOverlay.classList.contains("hidden");
}

export function openHelp() {
  els.helpOverlay.classList.remove("hidden");
  updateMode();
}

export function closeHelp() {
  els.helpOverlay.classList.add("hidden");
  updateMode();
}

export function toggleHelp() {
  if (isHelpOpen()) closeHelp();
  else openHelp();
}
