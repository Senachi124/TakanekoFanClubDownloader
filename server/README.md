# Server / 伺服器 / サーバー

網頁、NAS、自動化、部署集中在此目錄；一般使用者只需桌面包。私人設定與維運紀錄放 Git 外。／Web・NAS・自動化・運用をまとめています。通常はデスクトップ版だけ必要です。個別設定と運用履歴は公開しません。

**日本語は機械翻訳のため、不正確な表現が含まれる場合があります。**

## 結構與依賴／構成と依存関係

- `public/`：Web UI，與桌面共用 `src/shared/`。／デスクトップと表示部品を共有。
- `worker.py`、`bridge.js`：下载與發布，共用 `src/main/api/`。／取得・公開と共通エンジン。
- `backup_worker.py`、`backup_window.py`：獨立 NAS 佇列及窗口。／独立 NAS キューと時間帯制限。
- `local-reader/`：桌面內建只讀 adapter，不需 Python、DB、遠端登入。／デスクトップ内蔵の読み取り専用 adapter。
- `deployment/vm1/`：既有 shared helper 環境的部署範本。／shared helper 環境向けテンプレート。
- `tests/`：隔離測試。／隔離テスト。

伺服器需 Python 3.11+、Node.js 20+、PostgreSQL、`requirements.txt`、yt-dlp／ffmpeg，及管理員提供的 `vm1-backup` helper。範本不安裝／修改共用 helper。

サーバーには Python 3.11+・Node.js 20+・PostgreSQL・Python 依存関係・動画ツール・管理者提供の `vm1-backup` が必要です。shared helper は変更しません。

| 環境變數／変数 | 用途／用途 |
|---|---|
| `TAKANEKO_DATA` | Archive 根目錄／アーカイブルート |
| `TAKANEKO_CONTROL` | 登入與控制狀態／ログイン・制御情報 |
| `TAKANEKO_DB_CONFIG` | 受保護 DB JSON：`database` 物件含 host、port、dbname、user、password／保護された DB 設定 |
| `TAKANEKO_ORIGIN` | HTTPS origin |
| `TAKANEKO_HOME_URL` | 返回首頁連結／ホームリンク |
| `TAKANEKO_DOMAIN_FILE` | 只讀其中 SERVICES_DOMAIN／ドメイン設定ファイル |
| `TAKANEKO_NAS_ROOT` | Windows 維運工具的允許根目錄／Windows 運用ツールの許可ルート |

設定與憑證放於 Git 外並限制權限；NAS 路徑必須明確設定。／設定と認証情報は Git 外に保管し、権限を制限します。NAS パスは明示設定してください。

## 操作／操作

Web 保留 cookies／登入 JSON 匯入及 refreshToken 更新，提供下載、投稿、多媒體庫、NAS 與排程。並發 1–100、預設 5，影片最多 2 個；三階段進度由 worker 提供真實計數，NAS 進度獨立。

Web はログイン情報のインポート・更新、取得・投稿・メディア・NAS とスケジュールを提供します。並列数は 1–100、既定値 5、動画は最大 2 件です。NAS の進捗は独立します。

自動 NAS 傳送限香港時間 03:00–09:00，包含在途 I/O／重試，09:00 保存進度並停止；手動工作另記來源。NAS 故障不阻擋下載／閱讀，磁碟低水位仍暫停新增下載。不自動刪除原檔，不新增媒體 cache。

自動 NAS 転送は香港時間 03:00–09:00 のみで、実行中 I/O と再試行も対象です。手動処理は別途記録します。NAS 障害でも取得・閲覧を継続し、容量不足では取得を止めます。原本の自動削除や追加メディア cache はありません。

## 驗證與部署／検証とデプロイ

```sh
python3 -m pip install -r server/requirements.txt
npm test
python3 server/tests/run.py
npm run check:release
```

`run.py` 僅在測試程序替換 helper，拒絕真實 NAS 操作。整合檢查使用 `takaneko_test_` 專用 DB，執行 `deployment/vm1/verify-workspace.py` 及 `verify-backup-window.py`；不得用正式備份作健康檢查。

単体テストは実 NAS 操作を拒否します。DB 統合確認は `takaneko_test_` 専用 DB で実施し、正式バックアップを健康確認に使いません。

新主機按管理員指引配置後使用 `deployment/vm1/install.sh`。既有主機使用 `deployment/vm1/upgrade.sh RELEASE`：只在本應用下載及備份閒置時遷移、切換版本、恢復原有程序與排程；私人設定與 archive 留在 release 外。

新規導入は管理者設定後に `install.sh` を使用します。既存ホストは `upgrade.sh RELEASE` でアイドル時に移行・切り替えを実施し、このアプリだけ復帰します。個別設定とデータは release 外に保持します。

v2 僅新增 `jobs.progress` 欄位，保留舊欄位。回滾切回上一個相容 release，重啟本應用，不刪資料。部署後驗證 HTTPS、登入、媒體 GET／HEAD／Range、排程及啟用狀態，更新本應用備份登記與私人 home 索引。

v2 は `jobs.progress` を追加し旧列を維持します。ロールバックは前の互換 release に戻してアプリを再起動し、データは削除しません。確認後にバックアップ登録と非公開運用索引を更新してください。
