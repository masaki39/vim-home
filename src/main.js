// Entry point (newtab.html).

import { init } from "./app.js";

// Chrome leaves keyboard focus in the address bar on a New Tab override,
// and the page can't take it back. A page-initiated navigation does hand
// focus to the page, so reload once onto a marked copy of ourselves
// (replace(), so Back doesn't bounce through the unmarked entry).
const FOCUS_MARK = "?focus";
if (location.search !== FOCUS_MARK) location.replace(location.pathname + FOCUS_MARK + location.hash);
else init();
