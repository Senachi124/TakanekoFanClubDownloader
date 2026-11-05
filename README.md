# Takaneko Fanclub Downloader v2.1.0

**繁體中文** | [日本語](README.ja.md)

下載 Takaneko Fanclub（高嶺のなでしこ官方 Fanclub）的投稿、經理人部落格、Gallery 和 Movies，並在本地瀏覽。這是本地 Electron 桌面應用程式，Local Reader 僅讀取本程式下載匯出或「另存整篇投稿」產生的格式。

僅供具有合法存取權限的使用者使用，請遵守網站條款與著作權。

## 快速使用

1. 在設定分頁開啟登入視窗，登入 Fanclub，再按「取得 Token」。
2. 設定並發 1–100，預設 5；選擇是否下載 Blogs／Gallery／Movies。影片同時最多 2 個。
3. 在下載分頁開始；三條進度為清單、詳情檢查、媒體下載及保存。
4. 可暫停、繼續或停止；已完成檔案保留，失敗可重試。
5. 在「設定 → 瀏覽來源」選擇本程式的下載匯出資料夾，或包含另存投稿的資料夾。「內容瀏覽」看投稿，「多媒體瀏覽」篩選圖片／影片，兩者與本地閱讀器共用來源。
6. 開啟投稿或媒體後，可「下載原檔」到其他位置、「另存整篇投稿」，或開啟原檔資料夾。另存是複製，來源不變；來源檔案遺失或無法讀取時會提示失敗。

應用程式頂部的「繁體中文／日本語」分頁可切換並記住介面語言；README 語言則透過本頁頂部的連結切換。列表、投稿詳情與媒體詳情的時間統一標示為「投稿發布時間（JST / UTC+9）」，使用日本時間及 24 小時制；切換語言不改變時區，原有 metadata、檔名及存檔內容不變。

## 開發建議：FaveConnect 與其他 Fanclub

[Takaneko Fanclub](https://takanekofc.com/) 使用日テレWands 提供的 **FaveConnect** 粉絲交流平台服務；可參考 [FaveConnect 官方開設公告](https://faveconnect.com/news/u8wu6qsyepbey3s0.html)。

其他同樣使用 FaveConnect 的 Fanclub，可以參考本專案的登入、內容下載與本地 archive 閱讀實作，作為開發適用工具的起點。其他導入案例可在 [FaveConnect 官網](https://faveconnect.com/) 查看。

**目前程式僅針對 Takaneko Fanclub 實作，沒有切換 Fanclub 的設定，也未驗證其他站點的相容性。** 使用相同平台不代表 API、會員權限、內容欄位或影片來源完全相同，不能只更換網址就假設可用。移植時可從以下位置開始檢查：

| 項目 | 參考程式與需確認的內容 |
|---|---|
| 登入與 Token | [`src/main/main.js`](src/main/main.js)：登入網址、Token 擷取的請求網域與驗證流程。 |
| 內容清單與詳情 | [`src/main/api/getAllPosts.js`](src/main/api/getAllPosts.js)、[`src/main/api/archiveEngine.js`](src/main/api/archiveEngine.js)：API 網址、分頁、回傳欄位、部落格與分類識別碼。 |
| 投稿與媒體保存 | [`src/main/api/exportPosts.js`](src/main/api/exportPosts.js)、[`exportBlogs.js`](src/main/api/exportBlogs.js)、[`exportGallery.js`](src/main/api/exportGallery.js)、[`exportMovies.js`](src/main/api/exportMovies.js)：內容解析、相對網址、Referer 與影片來源。 |
| 本地閱讀 | [`src/main/local-reader/`](src/main/local-reader/README.md)：讓產生的 archive 符合支援格式，並確認媒體相對路徑。 |

針對其他 Fanclub 調整時，請使用該站點具有合法存取權限的帳戶，個別確認會員方案與可讀取內容，並使用合成資料補充測試；不要將 Token、cookies 或會員限定內容提交至儲存庫。

## 安裝

目前原始碼版本為 v2.1.0。已發布的安裝包請見 [Releases](https://github.com/Senachi124/TakanekoFanClubDownloader/releases)；以下列出本版本的建置檔名，不代表安裝包已發布。使用安裝包不需另外安裝 Node.js。

| 平台 | 檔案 |
|---|---|
| Windows x64 安裝版 | `Takaneko-Fanclub-Downloader-2.1.0-Windows-x64-Setup.exe` |
| Windows x64 免安裝版 | `Takaneko-Fanclub-Downloader-2.1.0-Windows-x64-Portable.exe` |
| macOS Intel | `Takaneko-Fanclub-Downloader-2.1.0-macOS-x64.dmg` / `.zip` |
| macOS Apple Silicon | `Takaneko-Fanclub-Downloader-2.1.0-macOS-arm64.dmg` / `.zip` |

Windows 內附 yt-dlp、ffmpeg、ffprobe 及 Deno。macOS 影片下載需要在 PATH 提供最新版 yt-dlp、ffmpeg／ffprobe，及 Deno 2.3+ 或 Node.js 22+；圖片及 Reader 不需要。Release 附 SHA-256 校驗值；安裝包不含私人帳戶及 archive。

v2 保留 1.2.1 以後的 app ID、名稱及使用者資料位置。1.2.0 以前使用舊名稱 `Takaneko Downloader`，請保留舊資料再自行遷移。

## Local Reader

Reader 僅支援本程式目前產生的兩種格式：

- **下載匯出**：每篇已完成的投稿包含 `index.md`、`.post-id`，以及同一資料夾內的圖片／影片。
- **另存整篇投稿**：包含本程式產生的 `record.json` v2、`index.md`，以及同一資料夾內的媒體；保留投稿分類、成員與發布時間。

保留資料夾選擇，可讀取下載匯出根目錄、另存投稿的上層資料夾或單篇投稿資料夾。內容瀏覽、多媒體瀏覽與本地閱讀器共用來源，提供成員／分類篩選、48 件分頁、圖片及影片。索引期間顯示進度列，瀏覽時每 60 秒檢查更新，也可手動重新整理。

不再支援舊版 `record.json` v1、其他 v2 archive 結構或外部 `catalog.json`／`.catalog/` 索引。未完成下載（缺少 `.post-id`）不會顯示。Reader 直接掃描符合格式的投稿，索引只保留於記憶體；來源無法讀取時不保留舊清單。原有磁碟索引不再載入。

Reader 不修改來源；使用者仍可另存投稿或媒體至來源以外的位置。格式說明見 [Local Reader](src/main/local-reader/README.md)。

## 資料與設定

「設定 → 下載位置」可更改新下載的目的地，並作為另存檔案的預設位置；預設仍為 Electron `userData/exported`。更改設定不搬移既有檔案。可按「開啟資料夾」。token 及偏好同樣存於使用者資料目錄，不寫入 Git。原有內建登入及 Token Capture 保留，請勿分享登入資料。

### 時間的含義

- **投稿發布時間**：列表及詳情將存檔記錄的時間轉換為日本時間顯示。下載的 `index.md` 使用 `**Date**` 記錄時間，沒有時區標記時 Reader 視為日本時間；另存投稿的 `record.json` 使用 UTC ISO 格式的 `published_at`，顯示時轉為 JST。
- **來源建立／送出時間**：一般投稿依序取 `releaseDate`、`displayDate`、`publishedAt`、`createdAt`、`sentAt`。部落格依序取詳情 `displayDate`、`createdAt`、清單 `displayDate`。Gallery／Movies 取 `displayDate` 或 `createdAt`。來源建立／送出時間可能是替代值，不能一概視為已確認的發布時間；目前沒有分開保存所用欄位的來源。
- **缺少日期**：來源日期缺失或無效時，`index.md` 的 `**Date**` 留白、另存的 `published_at` 為 `null`，Reader 顯示「未知日期」並排在有日期的投稿之後。檔名以 `unknown-date` 標示；一般投稿與部落格加入投稿識別碼的摘要，避免同名內容覆蓋。不再以下載當下時間補值；先前已寫入的日期不會自動更改。
- **下載完成時間／另存時間**：目前沒有獨立記錄。
- **檔案建立／修改時間**：由檔案系統管理，複製或搬移後可能不同；Reader 不使用它們作為發布時間。

檔名時間仍沿用現有下載邏輯：一般投稿與部落格使用下載時電腦的本地時區，Gallery／Movies 使用日本時間。Reader 的發布時間來自存檔內容，不從檔名推算。

### YouTube 登入

設定頁提供 YouTube cookies 匯出教學，可貼上或選取 Netscape cookies.txt，並儲存或移除。只保留 youtube.com 的資料，存於本機 userData；不會寫入 archive 或套件。Fanclub 內建登入及 Token 擷取維持原樣。「已儲存」只表示格式有效，影片是否可存取仍須實際下載確認。

## 開發與建置

使用 Node.js 22（與 CI 一致）及 npm。在專案根目錄執行：

```sh
npm ci
npm start
npm test
npm run check:release
```

桌面冒煙測試需要可啟動 Electron 的圖形環境：

```sh
npm run test:desktop
```

在對應平台建置安裝包：

```sh
# Windows
npm run build:win
# macOS
npm run build:mac
```

本 repo 專注本地 Electron 桌面程式，不包含伺服器、遠端備份或部署工具。UI 在 `src/renderer/`，共用介面元件在 `src/shared/`，桌面主程序與下載核心在 `src/main/`，本地 Reader 在 `src/main/local-reader/`。測試在 `test/`、`tests/`，打包與桌面驗證工具在 `scripts/`。

更新文件時，請同步維護 [繁體中文 README](README.md) 與 [日本語 README](README.ja.md)。
