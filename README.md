# vim-home

A Chrome extension that replaces the (blank) Vimium new tab page with a
bookmark grid you can navigate and open with `hjkl`.

## Background

- The default Chrome new tab page (Speed Dial) is disabled in favor of
  Vimium's blank new tab page.
- Vimium has `b`/`B` for bookmark search via the Vomnibar, but no
  always-visible bookmark list UI.
- This extension provides Vimium-style keyboard access to bookmarks
  (`hjkl` to move, `f` for link hints, `o` to search) directly on the new
  tab page.

## Features

- Overrides the new tab page (`chrome_url_overrides.newtab`) with a
  bookmark grid.
- All bookmarks are flattened into a single grid (folders are ignored).
- Favicons are shown via Chrome's built-in `_favicon` endpoint — no
  external network requests. Pages with no cached favicon fall back to a
  small inline placeholder icon instead of a broken image.
- The grid stays live: adding, removing, editing, or moving bookmarks
  elsewhere (e.g. the bookmark manager, syncing) refreshes the page
  automatically.
- Filtering matches substrings in the title or URL first, then falls back
  to a loose in-order "fuzzy" match so out-of-order characters still find
  results; a match count is shown while searching.
- Vimium-style link hints (`f` / `F`) over every visible card and
  dashboard entry, with `yy` / `yf` to copy URLs.
- Bookmarks can be edited (`e`), added (`a`), deleted (`x`) and restored
  (`X`) without leaving the keyboard, with a toast confirming each action.
- Opens are logged locally (count and last-opened time per bookmark):
  bookmarks can be pinned to the front (`m`) and the grid sorted by
  bookmark order, open count or recency (`s`).
- A HUD dashboard below the grid shows a clock, the 5 most recently
  opened bookmarks and the 5 most opened ones.
- Keyboard-only workflow, with keydown handling scoped so it doesn't
  conflict with Vimium.
- Basic screen-reader support: the grid is exposed as a listbox with the
  focused bookmark tracked via `aria-activedescendant`.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `h` `j` `k` `l` / arrow keys | Move focus around the grid |
| `gg` / `G` | Jump to the first / last bookmark |
| `d` / `u` (`J` / `K`) | Move half a page down / up |
| `Enter` | Open the focused bookmark in the current tab |
| `Ctrl+Enter` / `Cmd+Enter` | Open the focused bookmark in a new tab |
| `f` / `F` | Link hints: type a label to open that bookmark in the current / a new tab |
| `o` (or `/`) / `O` | Search; `Enter` opens the match in the current / a new tab |
| `yy` | Copy the focused bookmark's URL |
| `yf` | Copy the URL of a bookmark picked with link hints |
| `e` | Edit the focused bookmark's title and URL |
| `a` | Add a new bookmark |
| `m` | Pin / unpin the focused bookmark (pinned ones always come first) |
| `s` | Cycle the sort order: default → frequent → recent |
| `x` | Delete the focused bookmark (undoable) |
| `X` | Undo the last deletion |
| `Esc` | Cancel hints, search (clearing the filter), the edit form or the help panel |
| `?` | Toggle the keyboard shortcuts panel |

In hint mode, `Backspace` removes the last typed character and any key
that isn't part of a label cancels. In the edit form, `Enter` saves and
`Esc` cancels; while the form or the search bar has focus, keys type
normally. Shortcuts with `Ctrl`/`Cmd`/`Alt` (other than `Enter`) are left
to the browser.

A small hint in the bottom-right corner of the page also links to the
shortcuts panel.

## Install (unpacked / development)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository's directory.

## Design decisions

- **Folder structure**: flattened — folders are ignored, only bookmarks
  with a URL are listed.
- **Keymap**: follows Vimium where it has an equivalent — `d`/`u` half
  page, `f`/`F` hints, `o`/`O` for the Vomnibar-like search, `x`/`X` for
  close/restore, `yy`/`yf` to copy URLs. The old `dd`, `u` (undo) and `o`
  (new tab) bindings were dropped for this; `J`/`K` and `/` stay as
  aliases. Two-key combos show their first key in the status line.
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
  pages follow changes via `chrome.storage.onChanged`.
- **Dashboard**: below the grid, a clock panel (time, date, UTC offset
  and a node/pin/open summary), `RECENT` (5 latest, with relative age) and
  `FREQUENT` (top 5, with open-count bars), or `NO ACCESS LOG` when empty.
  The page is a full-height flex column, so the dashboard sits just above
  the status line when there are few bookmarks and simply follows the
  grid when it fills the screen; panels wrap to one column on narrow
  windows.
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
- **Deletion**: `x` calls `chrome.bookmarks.remove`, keeping the removed
  bookmark's data in memory for a few seconds so `X` can recreate it via
  `chrome.bookmarks.create` at its original position.
- **Live updates**: `chrome.bookmarks.on{Created,Removed,Changed,Moved}`
  listeners reload and re-render the grid, preserving the current filter
  and, where possible, the focused item.

## Development

This repository is a standalone code repository, independent of any
personal notes vault.

The pure logic in `newtab.js` (`isSubsequence`, `filterBookmarks`, the
card label helpers `displayHost` and `indexLabel`, link-hint labels
`hintLabels`, and the history/pin/sort helpers `sortBookmarks`,
`nextSortOrder`, `recordOpen`, `togglePin`, `pruneState`, `topRecent`,
`topFrequent`, `relativeTime`, `formatClock`, `normalizeUrl`) is unit
tested with Node's built-in test runner — no dependencies or package
manager needed:

```sh
node --test
```

CI (`.github/workflows/test.yml`) runs the same check, plus
`node --check newtab.js`, on every push and pull request.

## License

[MIT](./LICENSE)
