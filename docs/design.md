# Design notes

Why vim-home works the way it does. For usage, see the [README](../README.md).

- **Folder structure**: flattened — folders are ignored, only bookmarks
  with a URL are listed.
- **Keymap**: follows Vimium where it has an equivalent — `d`/`u` half
  page, `f`/`F` hints, `o`/`O` for the Vomnibar-like search, `x`/`X` for
  close/restore, `yy`/`yf` to copy URLs. The old `dd`, `u` (undo) and `o`
  (new tab) bindings were dropped for this; `J`/`K` stay as aliases.
  `/` follows vim instead: it only filters, and `Enter` hands the
  filtered grid back to NORMAL mode for `hjkl`. Two-key combos show
  their first key in the status line.
- **Open behavior**: `Enter` opens in the current tab; `Ctrl+Enter` /
  `Cmd+Enter` opens in a new tab. `o` vs `O` and `f` vs `F` pick the tab
  up front instead.
- **Link hints**: labels use Vimium's default alphabet
  (`sadfjklewcmpgh`); all labels share the shortest length that fits, so
  none is a prefix of another, and the first character varies fastest so
  the first keystroke splits the targets evenly. Only cards and dashboard
  entries currently on screen get a label; non-matching labels hide as you
  type.
- **Edit / add**: a HUD form calling `chrome.bookmarks.update` /
  `chrome.bookmarks.create`. A URL is required; one without a scheme gets
  `https://`. New bookmarks go to Chrome's default folder ("Other
  bookmarks").
- **History, pins and sort**: stored in `chrome.storage.local` (the
  `storage` permission) as `{count, lastOpened}` per bookmark id, a list of
  pinned ids and the sort order — nothing leaves the browser. Every open
  (Enter, click, hint, search) is logged; data for deleted bookmarks is
  pruned (`X` carries it over to the restored bookmark). Pinned bookmarks
  always come first, then the grid follows the sort order, shown in the
  status line (`SORT:DEFAULT` / `FREQUENT` / `RECENT`). Other open new tab
  pages follow changes via `chrome.storage.onChanged`. Two toggles live
  there too: `startInSearch` (`S`, `START:SEARCH` in the status line) opens
  each new tab straight into `o` search, and `showHistory` (`H`,
  `HISTORY:OFF` when off) controls history suggestions.
- **History suggestions**: while `o` / `O` has a query, matches from
  `chrome.history.search` (the `history` permission; read locally only)
  are folded into one chip per site, opening its top page (`https://host/`),
  up to 10 in a single row under the search bar. Sites whose top page is
  bookmarked, this extension's own pages and non-web URLs are dropped
  (compared without `#hash` and trailing `/`), the rest ranked by total
  visits, then recency. In the search bar `Ctrl+H/J/K/L` move through
  the bookmark grid like `hjkl` (first press from a chip returns to the
  grid) and `Tab` / `Shift+Tab` walk the chips (`Shift+Tab` from the first
  deselects it; with no chips `Tab` steps through the grid). With no
  bookmark match the top chip is preselected, so `Enter` opens it before
  falling back to a URL / web search. `/` filter
  mode never shows history.
- **Dashboard**: below the grid, a clock panel (time, date, UTC offset
  and a node/pin/open summary) and `RECENT` (5 latest, with relative age),
  or `NO ACCESS LOG` when empty. There's no most-opened panel, as
  `SORT:FREQUENT` already covers it.
- **Fixed frame**: the page is a viewport-high flex column — header, the
  always-visible search bar (dimmed while closed) and its fixed-height
  history row at the top, dashboard at the bottom,
  and only the grid scrolls between them, so a search changing the match
  count doesn't move the search bar or the clock. The history row shows an
  amber key ticker scrolling like a station departure board whenever it
  has no site chips, so opening or closing a search never shifts the grid. `Enter` that navigates
  this tab leaves the search bar and history list up instead of hiding
  them just before the page unloads. Windows under 640px tall or wide fall
  back to scrolling the whole page, with the dashboard following the grid
  (panels wrap to one column on narrow windows).
- **Favicons**: shown, via the MV3 `favicon` permission and the
  `_favicon/` endpoint, with an inline SVG placeholder on failure.
- **Layout**: sci-fi HUD theme — deep navy background with a faint dot
  grid and vignette, cyan holographic accents (amber/magenta used sparingly
  for search and help). Each bookmark is a card with corner brackets
  showing a 32px favicon, the title (up to two lines), the domain
  (`www.` stripped) and a small index number (`#01`). The focused card
  glows cyan, its brackets lengthen and a scan light sweeps over it once.
  A `SYS://BOOKMARKS ── N NODES` header, an amber `/ QUERY` search bar, a
  status line mode badge (`NORMAL` / `SEARCH` / `HINTS` / `EDIT` /
  `HELP`), amber link-hint labels, amber brackets on pinned cards and the
  HUD-panel help and edit overlays share the same look. Motion is restrained (header rule
  draws in, cards fade in on load, one-shot focus scan) and fully disabled
  under `prefers-reduced-motion: reduce`. System fonts only — no web fonts
  or other network requests. Responsive `auto-fill` grid; `hjkl` reads the
  live column count from the grid, so it follows window resizes.
- **New tab focus**: Chrome keeps keyboard focus in the address bar on
  a New Tab override, and the page can't take it back with `focus()`. The
  page therefore `location.replace()`s itself once onto `newtab.html?focus`;
  that page-initiated navigation hands focus to the page, so keys work
  right away. The trade-off is that the address bar shows the extension
  URL instead of being empty (use `Cmd+L` / `Ctrl+L` to type there, or the
  search bar, which also opens URLs and web searches).
- **Drag to reorder**: only in `SORT:DEFAULT` with no filter, since other
  orders don't follow bookmark order. Dropping a card moves the bookmark
  (`chrome.bookmarks.move`) next to the target — after it when dragged
  forward, before it when dragged back — into the target's folder. Drops
  between pinned and unpinned cards are refused, as pins always sort first.
- **Deletion**: `x` asks for confirmation (`y` / `Enter`; any other key
  cancels), then calls `chrome.bookmarks.remove`, keeping the removed
  bookmark's data in memory for a few seconds so `X` can recreate it via
  `chrome.bookmarks.create` at its original position.
- **Live updates**: `chrome.bookmarks.on{Created,Removed,Changed,Moved}`
  listeners reload and re-render the grid, preserving the current filter
  and, where possible, the focused item.


## Testing

The pure logic in `newtab.js` (`isSubsequence`, `filterBookmarks`, the
card label helpers `displayHost` and `indexLabel`, link-hint labels
`hintLabels`, and the history/pin/sort helpers `sortBookmarks`,
`nextSortOrder`, `recordOpen`, `togglePin`, `pruneState`, `topRecent`,
`relativeTime`, `formatClock`, `normalizeUrl`,
`resolveQuery`, `dropDestination`, `searchStep`, `historyStep`,
`urlKey`, `pickHistory`) is unit
tested with Node's built-in test runner — no dependencies or package
manager needed:

```sh
node --test
```

CI (`.github/workflows/test.yml`) runs the same check, plus
`node --check newtab.js`, on every push and pull request.
