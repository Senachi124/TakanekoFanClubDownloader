# Takaneko Fanclub Downloader v2

下載 Takaneko Fanclub 投稿、經理人部落格、Gallery 和 Movies，並在本地瀏覽。Local Reader 可讀取本機及已掛載 NAS 的 archive。

Takaneko Fanclub の投稿・マネージャーブログ・Gallery・Movies を保存し、ローカルで閲覧できます。Local Reader はローカルとマウント済み NAS のアーカイブに対応します。

**日本語は機械翻訳のため、不正確な表現が含まれる場合があります。**

僅供具有合法存取權限的使用者使用，請遵守網站條款與著作權。／正規のアクセス権を持つ方のみ利用し、サイト規約と著作権を守ってください。

## 安裝／インストール

在 [Releases](https://github.com/Senachi124/TakanekoFanClubDownloader/releases) 下載 v2.0.1，一般使用者不需 Node.js。／Releases から v2.0.1 を取得します。通常の利用では Node.js は不要です。

| 平台／OS | 檔案／ファイル |
|---|---|
| Windows x64 安裝版／インストーラー | `Takaneko-Fanclub-Downloader-2.0.1-Windows-x64-Setup.exe` |
| Windows x64 免安裝／ポータブル | `Takaneko-Fanclub-Downloader-2.0.1-Windows-x64-Portable.exe` |
| macOS Intel | `Takaneko-Fanclub-Downloader-2.0.1-macOS-x64.dmg` / `.zip` |
| macOS Apple Silicon | `Takaneko-Fanclub-Downloader-2.0.1-macOS-arm64.dmg` / `.zip` |

Windows 內附 yt-dlp、ffmpeg 和 ffprobe。macOS 影片下載需要在 PATH 提供這些工具，圖片及 Reader 不需要。Release 附 SHA-256 校驗值；安裝包不含私人帳戶及 archive。

Windows は動画ツールを同梱します。macOS の動画取得には PATH 上の yt-dlp・ffmpeg・ffprobe が必要です。画像と Reader には不要です。Release に SHA-256 を掲載し、個人データは同梱しません。

v2 保留 1.2.1 以後的 app ID、名稱及使用者資料位置。1.2.0 以前使用舊名稱 `Takaneko Downloader`，請保留舊資料再自行遷移。

v2 は 1.2.1 以降のアプリ ID・名前・データ領域を維持します。1.2.0 以前の旧名アプリは、元データを保持して必要な移行を行ってください。

## 快速使用／使い方

1. 在設定 tab 開啟登入視窗，登入 Fanclub，再按「取得 Token」。／設定タブからログインし、「Token を取得」を押します。
2. 設定並發 1–100，預設 5；選擇 Blogs／Gallery／Movies。影片同時最多 2 個。／並列数は 1–100、既定値 5。対象を選択します。動画は同時に最大 2 件です。
3. 在下載 tab 開始；三條進度為清單、詳情檢查、媒體下載及保存。／ダウンロードタブから開始し、一覧・詳細確認・保存の進捗を確認します。
4. 可暫停、繼續或停止；已完成檔案保留，失敗可重試。／一時停止・再開・停止が可能です。完了分は保持し、失敗分を再試行できます。
5. 「內容瀏覽」顯示本地下載；「本地閱讀器」可選擇其他 archive。／コンテンツ閲覧は取得済み内容、ローカルリーダーは選択フォルダーを表示します。

「繁體中文／日本語」tabs 可切換並記住語言。時間顯示為香港 UTC+08:00、24 小時制；原始發布 metadata、檔名及存檔內容不變。

言語タブの選択を保存します。表示時刻は香港 UTC+08:00 の 24 時間表記です。元の公開日時 metadata・ファイル名・アーカイブは変更しません。

## Local Reader

v2.0.1 優先讀取伺服器在 NAS 校驗完成後發布的共用 `catalog.json`，不逐一遍歷投稿資料夾。內文和媒體在開啟時讀取，索引期間顯示動畫進度列。可選 `members/`、`media/`、`takaneko/` 或包含 `takaneko/` 的根目錄。請保留 `.catalog/`；NAS 更新結束後最遲於下次 60 秒檢查载入新清單。沒有 catalog 的舊 archive 仍使用掃描。

v2.0.1 は NAS 検証後の共通 `catalog.json` を優先し、投稿フォルダーの全走査を省きます。本文・メディアは開くときに読み込み、索引中は進捗バーを表示します。`members/`、`media/`、`takaneko/`、または `takaneko/` を含むルートを選択し、`.catalog/` を保持してください。更新は次の 60 秒確認で反映されます。catalog のない旧形式は従来どおり走査します。

選擇本機、外接磁碟或已掛載 NAS 根目錄。支援桌面 `index.md`＋`.post-id`、server `record.json` v1 和 NAS v2；提供成員／分類篩選、48 件分頁、圖片及影片。Reader 開啟時每 60 秒檢查更新，也可手動重新整理。

ローカル・外付けディスク・マウント済み NAS のルートを選択します。デスクトップ形式、server v1、NAS v2 に対応し、絞り込み・48 件分頁・画像・動画を提供します。表示中は 60 秒ごとに更新を確認します。

Reader 不登入伺服器、不下載遠端 archive、不修改來源。索引存於 app 使用者資料目錄。離線時保留索引，缺失媒體顯示不可用。v1 相對連結必須位於所選根目錄內，建議選擇包含完整 `complete/` 的根目錄。

Reader は遠隔ログイン・ダウンロード・元ファイルの変更を行いません。索引はアプリのデータ領域に保存し、切断時も保持します。v1 の相対リンクを読む場合は `complete/` 全体を含むルートを選択してください。

## 資料與開發／データと開発

下載位置為 Electron `userData/exported`，可按「開啟資料夾」。token 及偏好同樣存於使用者資料目錄，不寫入 Git。原有內建登入及 Token Capture 保留，請勿分享登入資料。

保存先は Electron の `userData/exported` です。token と設定もユーザーデータ領域に保存し、Git に含めません。内蔵ログインと Token Capture を維持します。

```sh
npm ci
npm start
npm test
npm run check:release
npm run build:win
# macOS host / macOS 上で実行
npm run build:mac
```

桌面及共用功能在 `src/`；Reader adapter 在 `server/local-reader/` 並隨桌面包附上。伺服器、NAS、部署與自動化見 [server/README.md](server/README.md)，一般使用不需部署 server。

デスクトップと共通処理は `src/`、同梱 Reader は `server/local-reader/` にあります。サーバー運用は [server/README.md](server/README.md) を参照してください。通常の利用では server は不要です。
