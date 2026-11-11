# 開發文件

這組文件以目前原始碼為依據，說明 Takaneko Fanclub Downloader 的 Electron 桌面架構、API 與處理流程。API 表格記錄程式實際使用的路徑與欄位，並非上游服務的完整規格，也不代表已對線上服務重新驗證。

| 文件 | 內容 |
| --- | --- |
| [程式整體流程](application-flow.md) | 啟動、模組分工、下載與閱讀路徑、資料儲存位置 |
| [API 與 IPC 索引](api-reference.md) | Fanclub HTTP 端點、renderer 可用的 IPC、進度事件、本地媒體協定 |
| [核心處理函式流程](core-processing.md) | `downloadJob`、`archiveEngine.run`、各 exporter、串流下載、Reader 與另存 |
| [使用者互動流程](interaction-flow.md) | 登入、下載控制、瀏覽、媒體播放、另存、設定與語言切換 |

建議先閱讀整體流程，再依需要查 API 契約或函式流程。流程圖使用 Mermaid，可在支援 Mermaid 的 Markdown 檢視器中閱讀。

## 原始碼入口

| 層次 | 主要檔案 |
| --- | --- |
| Electron 啟動與登入 | [main.js](../src/main/main.js) |
| UI 與主程序的橋接 | [preload.js](../src/main/preload.js)、[desktopV2.js](../src/main/desktopV2.js) |
| 下載排程與分派 | [downloadJob.js](../src/main/downloadJob.js)、[archiveEngine.js](../src/main/api/archiveEngine.js) |
| Fanclub API 端點與請求 | [takaneko/index.js](../src/main/api/takaneko/index.js)、[client.js](../src/main/api/takaneko/client.js)、[config.js](../src/main/api/takaneko/config.js) |
| 本地檔案閱讀與另存 | [local-reader/index.js](../src/main/local-reader/index.js)、[archiveActions.js](../src/main/archiveActions.js) |
| 畫面與共用 UI | [renderer.js](../src/renderer/renderer.js)、[ui.js](../src/shared/ui.js)、[youtube-settings.js](../src/shared/youtube-settings.js) |

存檔格式以 [Local Reader 格式說明](../src/main/local-reader/README.md) 為準；安裝與建置命令見 [繁體中文 README](../README.md)／[日本語 README](../README.ja.md)。

## 維護方式

- 新增 IPC 時，同步檢查 preload allowlist、主程序 handler、renderer 呼叫與 API 表格。
- Fanclub 端點統一放在 `src/main/api/takaneko/`；新增或調整端點時，同步更新 API 索引與 `tests/takaneko-api.test.js`，exporter 不自行組合 API URL。
- 修改下載、完成標記或 Reader 格式時，同步更新對應流程圖與行為說明。
- 文件描述目前可觀察到的實作；已存在的限制應明確標示，避免把預期行為寫成已實現的保證。
- 範例使用合成資料或佔位符，不附上真實 Token、cookies、會員內容、私人路徑或執行紀錄。
