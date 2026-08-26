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
  external network requests.
- Keyboard-only workflow, with keydown handling scoped so it doesn't
  conflict with Vimium.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `h` `j` `k` `l` / arrow keys | Move focus around the grid |
| `Enter` | Open the focused bookmark in the current tab |
| `Ctrl+Enter` / `Cmd+Enter` / `o` | Open the focused bookmark in a new tab |
| `/` | Filter bookmarks incrementally (title or URL) |
| `Esc` | Close search or the help panel |
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
  `_favicon/` endpoint.
- **Layout**: dark theme, monospace font, responsive `auto-fill` grid.

## Development

This repository is a standalone code repository, independent of any
personal notes vault.

## License

[MIT](./LICENSE)
