# NAS 共用閱讀索引／NAS 共通閲覧インデックス

v2.0.1 的備份 worker 在 NAS 內容傳送及回讀校驗完成後發布索引，成功才將工作標為完成。即使沒有待傳送的投稿，也會重試索引發布；失敗不撤銷已驗證內容、不刪除原檔。自動索引發布與 NAS 媒體一樣受香港 03:00–09:00、在途截止及原工作來源限制。

v2.0.1 のバックアップ worker は NAS 転送・再読込検証後に索引を公開し、成功してから処理を完了とします。新規投稿がなくても索引を再試行します。失敗時も検証済みデータと原本を保持します。自動公開は香港 03:00–09:00 の制限と実行中の中断規則を継承します。

## 格式／形式

服務 NAS 相對位置為 `takaneko/media/members/catalog.json`。入口只有 format、schema_version、catalog、size、sha256；`catalog` 指向同目錄的 `.catalog/<sha256>.json`。不包含 NAS 帳號、主機、絕對位置或憑證。快照是 JSON：

```json
{
  "format": "takaneko-catalog", "schema_version": 1, "total": 1,
  "posts": [{
    "resource_key": "example:1", "source_id": "1", "version": "example",
    "member": "成員", "kind": "post", "title": "標題",
    "published_at": "2026-09-30T12:00:00+09:00",
    "text": "成員/posts/date/title/index.md",
    "media": [{"media_id": "example", "variant": "original", "mime": "image/jpeg",
      "size": 123, "sha256": "file-sha256", "path": "成員/posts/date/title/files/image.jpg"}]
  }]
}
```

內文／媒體路徑均相對於 `catalog.json` 所在資料夾，**不是** `.catalog/`。快照只納入 `nas_available`、`nas_layout_ready`、不在遷移中且所有媒體均完成校驗的投稿；不包含內文。DB 一致快照與本應用獨立鎖防止較舊清單覆蓋新版本。

本文・メディアのパスは `catalog.json` のあるフォルダーを基準とし、`.catalog/` 基準ではありません。NAS 検証済み・レイアウト完了・移行中でない投稿だけを含みます。本文は含めません。一貫した DB スナップショットとアプリ専用ロックで公開順序を守ります。

先上傳不可變快照並回讀 SHA-256，再上傳唯一暫存入口、校驗並以 WebDAV MOVE 原子替換 `catalog.json`。只有衍生入口允許替換；投稿原檔與歷史快照不覆寫、不自動刪除。中斷可能留下 `.catalog-upload-*` 暫存，Reader 不讀取它們。最後讀回入口驗證，失敗則工作保留可重試狀態。

不変スナップショットをアップロードして SHA-256 を確認し、一時入口も検証してから MOVE で `catalog.json` を原子的に切り替えます。置換対象は派生入口のみです。投稿・過去のスナップショットは上書き・自動削除しません。中断した一時ファイルは Reader から除外します。

## Reader 與維護／Reader と運用

- Reader 只檢查固定四個入口位置，不搜尋整棵樹。找到 catalog 後只讀入口和快照，驗證 schema／長度／SHA-256，建立記憶體及 userData 索引；不逐項 stat 投稿或媒體。顯示列表按需載入可見圖片；開啟投稿才讀內文及檢查該投稿的媒體。路徑必須是根目錄內相對路徑，實際讀取再次檢查 realpath。
- 舊格式沒有入口才掃描；清單損壞、未支援版本或斷線保留舊索引並提示，不因損壞清單而進行昂貴全量掃描。128 MiB 上限避免不受限讀取。來源存檔只讀。
- 新部署可由維護者明確執行 `python3 server/backup_worker.py --catalog-only`，只為既有已校驗的內容建立索引，不傳送媒體、不啟動待備份佇列。此命令是手動發布；自動工作仍用原排程及來源。
- 生成檔存於應用資料根目錄的 `reader-catalog/`，不入 Git 或安裝包。驗證使用合成 NAS client／臨時檔與隔離資料庫，不以正式媒體備份作健康檢查。
- 回滾 Reader／伺服器程式即可，舊版略過 `.catalog/` 並仍能讀取 `record.json`；保留 catalog 和原始資料。

Reader は固定の入口だけを確認し、一覧時に全ファイルを stat しません。本文とメディアは必要時に読み、ルート外・symlink 越境を拒否します。破損・切断時は以前の索引を保持します。旧形式には走査を維持します。手動の `--catalog-only` は既存の検証済み内容の索引だけを公開し、メディア転送や待機中バックアップを開始しません。生成物はアプリデータ内に置き、公開 Git・配布物に含めません。
