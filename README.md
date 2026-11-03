# Takaneko Fanclub Downloader v2.1.0

下載 Takaneko Fanclub 投稿、經理人部落格、Gallery 和 Movies，並在本地瀏覽。Local Reader 可讀取本機及已掛載 NAS 的 archive。

Takaneko Fanclub の投稿・マネージャーブログ・Gallery・Movies を保存し、ローカルで閲覧できます。Local Reader はローカルとマウント済み NAS のアーカイブに対応します。

**日本語は機械翻訳のため、不正確な表現が含まれる場合があります。**

僅供具有合法存取權限的使用者使用，請遵守網站條款與著作權。／正規のアクセス権を持つ方のみ利用し、サイト規約と著作権を守ってください。

## 安裝／インストール

目前原始碼版本為 v2.1.0。已發布的安裝包請見 [Releases](https://github.com/Senachi124/TakanekoFanClubDownloader/releases)；以下列出本版本的建置檔名，不代表安裝包已發布。使用安裝包不需另外安裝 Node.js。／ソースコードは v2.1.0 です。公開済みパッケージは Releases を確認してください。以下は本バージョンの出力ファイル名であり、公開済みとは限りません。パッケージの利用に Node.js の別途インストールは不要です。

| 平台／OS | 檔案／ファイル |
|---|---|
| Windows x64 安裝版／インストーラー | `Takaneko-Fanclub-Downloader-2.1.0-Windows-x64-Setup.exe` |
| Windows x64 免安裝／ポータブル | `Takaneko-Fanclub-Downloader-2.1.0-Windows-x64-Portable.exe` |
| macOS Intel | `Takaneko-Fanclub-Downloader-2.1.0-macOS-x64.dmg` / `.zip` |
| macOS Apple Silicon | `Takaneko-Fanclub-Downloader-2.1.0-macOS-arm64.dmg` / `.zip` |

Windows 內附 yt-dlp、ffmpeg、ffprobe 及 Deno。macOS 影片下載需要在 PATH 提供最新版 yt-dlp、ffmpeg／ffprobe，及 Deno 2.3+ 或 Node.js 22+；圖片及 Reader 不需要。Release 附 SHA-256 校驗值；安裝包不含私人帳戶及 archive。

Windows は動画ツールを同梱します。macOS の動画取得には PATH 上の最新版 yt-dlp・ffmpeg・ffprobe と、Deno 2.3+ または Node.js 22+ が必要です。画像と Reader には不要です。Release に SHA-256 を掲載し、個人データは同梱しません。

v2 保留 1.2.1 以後的 app ID、名稱及使用者資料位置。1.2.0 以前使用舊名稱 `Takaneko Downloader`，請保留舊資料再自行遷移。

v2 は 1.2.1 以降のアプリ ID・名前・データ領域を維持します。1.2.0 以前の旧名アプリは、元データを保持して必要な移行を行ってください。

## 快速使用／使い方

1. 在設定 tab 開啟登入視窗，登入 Fanclub，再按「取得 Token」。／設定タブからログインし、「Token を取得」を押します。
2. 設定並發 1–100，預設 5；選擇 Blogs／Gallery／Movies。影片同時最多 2 個。／並列数は 1–100、既定値 5。対象を選択します。動画は同時に最大 2 件です。
3. 在下載 tab 開始；三條進度為清單、詳情檢查、媒體下載及保存。／ダウンロードタブから開始し、一覧・詳細確認・保存の進捗を確認します。
4. 可暫停、繼續或停止；已完成檔案保留，失敗可重試。／一時停止・再開・停止が可能です。完了分は保持し、失敗分を再試行できます。
5. 在「設定 → 瀏覽來源」選擇本機或已掛載 NAS 的 archive。「內容瀏覽」看投稿，「多媒體瀏覽」篩選圖片／影片，兩者與本地閱讀器共用來源。／「設定 → 閲覧元」でローカルまたはマウント済み NAS の archive を選択します。コンテンツ・メディア・ローカルリーダーは共通の閲覧元を使います。
6. 開啟投稿或媒體後，可「下載原檔」到其他位置、「另存整篇投稿」，或開啟原檔資料夾。另存是複製，來源不變；缺檔或 NAS 離線時會提示失敗。／元ファイルや投稿全体を別の場所に保存したり、元ファイルのフォルダーを開けます。コピーなので元データは変わりません。欠損・切断時は失敗を表示します。

「繁體中文／日本語」tabs 可切換並記住語言。時間顯示為香港 UTC+08:00、24 小時制；原始發布 metadata、檔名及存檔內容不變。

言語タブの選択を保存します。表示時刻は香港 UTC+08:00 の 24 時間表記です。元の公開日時 metadata・ファイル名・アーカイブは変更しません。

## Local Reader

Reader 優先讀取所選資料夾內的 `catalog.json`，不逐一遍歷投稿資料夾。內文和媒體在開啟時讀取，索引期間顯示動畫進度列。可選 `members/`、`media/`、`takaneko/` 或包含 `takaneko/` 的根目錄。請保留 `.catalog/`；索引更新後於下次 60 秒檢查載入新清單。沒有 catalog 的 archive 使用資料夾掃描。格式說明見 [Local Reader](src/main/local-reader/README.md)。

Reader は選択したフォルダーの `catalog.json` を優先し、投稿フォルダーの全走査を省きます。本文・メディアは開くときに読み込み、索引中は進捗バーを表示します。`members/`、`media/`、`takaneko/`、または `takaneko/` を含むルートを選択し、`.catalog/` を保持してください。更新は次の 60 秒確認で反映されます。catalog のない形式はフォルダーを走査します。形式の詳細は [Local Reader](src/main/local-reader/README.md) を参照してください。

選擇本機、外接磁碟或已掛載 NAS 根目錄。支援桌面 `index.md`＋`.post-id`、`record.json` v1／v2 archive；提供成員／分類篩選、48 件分頁、圖片及影片。Reader 開啟時每 60 秒檢查更新，也可手動重新整理。

ローカル・外付けディスク・マウント済み NAS のルートを選択します。デスクトップ形式、`record.json` v1／v2 に対応し、絞り込み・48 件分頁・画像・動画を提供します。表示中は 60 秒ごとに更新を確認します。

Reader 直接讀取選定資料夾，不登入伺服器、不同步遠端 archive、不修改來源。使用者可另存選定的投稿或媒體至來源以外的位置。索引存於 app 使用者資料目錄。離線時保留索引，缺失媒體顯示不可用。v1 相對連結必須位於所選根目錄內，建議選擇包含完整 `complete/` 的根目錄。

Reader は選択フォルダーを直接読み、遠隔ログイン・同期・元ファイルの変更を行いません。選択した投稿やメディアを閲覧元の外へコピーできます。索引はアプリのデータ領域に保存し、切断時も保持します。v1 の相対リンクを読む場合は `complete/` 全体を含むルートを選択してください。

## 資料與開發／データと開発

「設定 → 下載位置」可更改新下載的目的地，並作為另存檔案的預設位置；預設仍為 Electron `userData/exported`。更改設定不搬移既有檔案。可按「開啟資料夾」。token 及偏好同樣存於使用者資料目錄，不寫入 Git。原有內建登入及 Token Capture 保留，請勿分享登入資料。

「設定 → 保存先」で新しいダウンロードと別名保存の既定の場所を変更できます。初期値は Electron の `userData/exported` です。既存ファイルは移動しません。token と設定もユーザーデータ領域に保存し、Git に含めません。内蔵ログインと Token Capture を維持します。

```sh
npm ci
npm start
npm test
npm run check:release
npm run build:win
# macOS host / macOS 上で実行
npm run build:mac
```

本 repo 專注本地 Electron 桌面程式，不包含伺服器、遠端備份或部署工具。UI 在 `src/renderer/`，共用介面元件在 `src/shared/`，桌面主程序與下載核心在 `src/main/`，本地 Reader 在 `src/main/local-reader/`。測試在 `test/`、`tests/`，打包與桌面驗證工具在 `scripts/`。

このリポジトリはローカル Electron アプリ専用です。サーバー・遠隔バックアップ・デプロイツールは含みません。UI は `src/renderer/`、共通 UI は `src/shared/`、メインプロセスとダウンロード処理は `src/main/`、Reader は `src/main/local-reader/` にあります。テストは `test/`・`tests/`、パッケージとデスクトップ検証は `scripts/` にあります。

### YouTube 登入 / YouTube ログイン

設定頁提供 YouTube cookies 匯出教學，可貼上或選取 Netscape cookies.txt，並儲存或移除。只保留 youtube.com 的資料，存於本機 userData；不會寫入 archive 或套件。Fanclub 內建登入及 Token 擷取維持原樣。「已儲存」只表示格式有效，影片是否可存取仍須實際下載確認。

設定画面の手順に従い、YouTube の Netscape cookies.txt を貼り付けるか選択して保存・削除できます。youtube.com の情報のみローカル userData に保存し、archive や配布パッケージには含めません。Fanclub の内蔵ログインと Token 取得は従来どおりです。保存時は形式のみ確認し、動画へのアクセスはダウンロードで確認します。
