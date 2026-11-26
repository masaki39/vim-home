<p align="center">
  <img src="icons/icon128.png" width="80" alt="">
</p>

<h1 align="center">vim-home</h1>

<p align="center">
  Your bookmarks, one keystroke away.<br>
  A Vimium-style bookmark grid for Chrome's new tab page.
</p>

![Bookmark grid with the dashboard below](docs/images/grid.jpg)

Vimium gives you a blank new tab. vim-home fills it with every bookmark you
have, laid out as a grid you drive entirely from the keyboard: `hjkl` to move,
`f` for link hints, `o` to search.

## Features

**Link hints.** Press `f`, type two letters, and you're there.

![Link hint labels over every card](docs/images/hints.jpg)

**Search that is also an address bar.** `o` filters by title or URL (fuzzy
matches included) as you type and suggests sites from your browser history.
`Enter` opens what you typed as a URL or a web search; `Esc` drops you onto
the filtered grid to pick a bookmark with `hjkl`.

![Searching "doc" narrows the grid to four bookmarks](docs/images/search.jpg)

**Plus:**

- Edit, add, delete and undo bookmarks without touching the mouse
- Pin favorites to the front; sort by bookmark order, open count or recency
- Optionally open every new tab straight into search (`S` toggles it)
- A dashboard with a clock and your recently opened bookmarks
- Drag cards to reorder (it moves them in Chrome's bookmark tree too)
- Stays in sync with the bookmark manager and other tabs
- Private: your open log stays in local storage, browser history is only
  read locally for suggestions (`H` turns them off), and the page makes no
  outside requests of its own

## Install

Not on the Chrome Web Store yet, so load it unpacked:

1. Clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the cloned folder.

Open a new tab. Press `?` any time to see every shortcut.

## Keys

<!-- keys:start (generated from src/keymap.js by `pnpm run docs`) -->

### Grid

| Key | Action |
| --- | --- |
| `h` `j` `k` `l` / arrows | Move |
| `gg` / `G` | First / last bookmark |
| `d` / `u` (`J` / `K`) | Half page down / up |
| `Enter` / `Cmd+Enter` | Open here / in a new tab |
| `f` / `F` | Link hints (open here / in a new tab) |
| `o` / `/` | Search: type to filter the grid, `Enter` opens the query |
| `yy` / `yf` | Copy the URL of the focused / a hinted bookmark |
| `e` / `a` | Edit / add a bookmark |
| `x` / `X` | Delete (asks to confirm) / undo |
| `m` | Pin / unpin |
| `s` | Cycle sort: default → frequent → recent |
| `S` | Toggle starting new tabs in search mode |
| `H` | Toggle history suggestions in search |
| `Esc` | Clear the filter; cancel hints, a form or a panel |
| `?` | Show all shortcuts |

### In search (`o` / `/`)

| Key | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | Pick a history site |
| `Ctrl+U` | Clear the query |
| `Enter` / `Cmd+Enter` | Open the query (URL or web search) or the picked history site here / in a new tab |
| `Esc` | Back to the grid, keeping the filter (`Enter` opens the first match, `hjkl` picks another) |

`Ctrl` works wherever `Cmd` is listed.

<!-- keys:end -->

## More

- [Design notes](docs/design.md) — why things work the way they do, and how to
  run the tests (`pnpm install && pnpm test`)

## License

[MIT](./LICENSE)
