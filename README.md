# vim-home

A Chrome extension that replaces the (blank) Vimium new tab page with a
bookmark grid you can navigate and open with `hjkl`.

## Background

- The default Chrome new tab page (Speed Dial) is disabled in favor of
  Vimium's blank new tab page.
- Vimium has `b`/`B` for bookmark search via the Vomnibar, but no
  always-visible bookmark list UI.
- This extension provides vim-style keyboard access to bookmarks
  (`hjkl` to move, `Enter` to open, `/` to filter) directly on the new tab
  page.

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
- Bookmarks can be deleted (`dd`) and restored (`u`) without leaving the
  keyboard, with a toast confirming each action.
- Keyboard-only workflow, with keydown handling scoped so it doesn't
  conflict with Vimium.
- Basic screen-reader support: the grid is exposed as a listbox with the
  focused bookmark tracked via `aria-activedescendant`.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `h` `j` `k` `l` / arrow keys | Move focus around the grid |
| `gg` | Jump to the first bookmark |
| `G` | Jump to the last bookmark |
| `J` / `K` | Move half a page down / up |
| `Enter` | Open the focused bookmark in the current tab |
| `Ctrl+Enter` / `Cmd+Enter` / `o` | Open the focused bookmark in a new tab |
| `dd` | Delete the focused bookmark (undoable) |
| `u` | Undo the last deletion |
| `/` | Filter bookmarks incrementally (title or URL) |
| `Esc` | Close search (clearing the filter) or the help panel |
| `?` | Toggle the keyboard shortcuts panel |

A small hint in the bottom-right corner of the page also links to the
shortcuts panel.

## Install (unpacked / development)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository's directory.

## Design decisions

- **Folder structure**: flattened — folders are ignored, only bookmarks
  with a URL are listed.
- **Open behavior**: `Enter` opens in the current tab; `Ctrl+Enter` /
  `Cmd+Enter` / `o` opens in a new tab.
- **Favicons**: shown, via the MV3 `favicon` permission and the
  `_favicon/` endpoint, with an inline SVG placeholder on failure.
- **Layout**: dark theme, monospace font, responsive `auto-fill` grid.
- **Deletion**: `dd` calls `chrome.bookmarks.remove`, keeping the removed
  bookmark's data in memory for a few seconds so `u` can recreate it via
  `chrome.bookmarks.create` at its original position.
- **Live updates**: `chrome.bookmarks.on{Created,Removed,Changed,Moved}`
  listeners reload and re-render the grid, preserving the current filter
  and, where possible, the focused item.

## Development

This repository is a standalone code repository, independent of any
personal notes vault.

The pure filtering logic (`isSubsequence`, `filterBookmarks` in
`newtab.js`) is unit tested with Node's built-in test runner — no
dependencies or package manager needed:

```sh
node --test
```

CI (`.github/workflows/test.yml`) runs the same check, plus
`node --check newtab.js`, on every push and pull request.

## License

[MIT](./LICENSE)
