# vim-home

Vimiumの新規タブページ（真っ白）の代わりに、ブックマークをグリッド表示して `hjkl` で選択・開けるChrome拡張。

## 背景

- Chromeの初期ページ（Speed Dial）は無効化し、Vimiumの新規タブページ（無地）を使用している。
- Vimium自体には `b`/`B`（Vomnibarでのブックマーク検索）はあるが、常時見えるブックマーク一覧UIはない。
- vim風のキー操作（`hjkl`移動、`Enter`で開く、`/`で絞り込み）でブックマークにアクセスしたい。

## 方針

Chrome拡張として実装し、`chrome_url_overrides.newtab` で新規タブページを自作HTMLに差し替える。

- `manifest.json`: MV3、`chrome_url_overrides.newtab`、`bookmarks` permission
- `newtab.html` / `newtab.css`: ブックマークのグリッド表示
- `newtab.js`:
  - `chrome.bookmarks.getTree()` でブックマーク取得・フラット化
  - `hjkl` / 矢印キーでグリッド内フォーカス移動
  - `Enter` で選択項目を開く（同一タブ）、`o`/`Ctrl+Enter` 等で新規タブ検討
  - `/` で絞り込み検索（インクリメンタル）
  - Vimium側のキー処理と衝突しないよう `keydown` を `stopPropagation`

## 未決事項

- フォルダ階層をどう扱うか（フラット表示 or 階層ナビゲーション）
- 新規タブで開く/現在タブで開くのデフォルト挙動
- ブックマークのファビコン表示の有無
- 配色・レイアウト（グリッド列数など）

## 開発

このリポジトリはVault（masaki39-core）とは独立した通常のコードリポジトリとして管理する。
