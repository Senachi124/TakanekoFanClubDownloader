# Takaneko Fanclub Downloader v2.1.0

[繁體中文](README.md) | **日本語**

Takaneko Fanclub（高嶺のなでしこオフィシャルファンクラブ）の投稿・マネージャーブログ・Gallery・Movies を保存し、ローカルで閲覧できる Electron デスクトップアプリです。Local Reader は、このアプリのダウンロード出力と「投稿全体を別の場所に保存」で作成した形式のみ読み込めます。

**日本語は機械翻訳のため、不正確な表現が含まれる場合があります。**

正規のアクセス権を持つ方のみ利用し、サイトの利用規約と著作権を守ってください。

## 使い方

1. 設定タブからログインウィンドウを開き、Fanclub にログインして「Token を取得」を押します。
2. 並列数を 1–100（既定値 5）に設定し、Blogs／Gallery／Movies をダウンロードするか選びます。動画は同時に最大 2 件です。
3. ダウンロードタブから開始します。一覧取得・詳細確認・メディアのダウンロードと保存の 3 段階で進捗を表示します。
4. 一時停止・再開・停止が可能です。完了したファイルは保持され、失敗した項目は再試行できます。
5. 「設定 → 閲覧元」で、このアプリのダウンロード出力フォルダー、または保存した投稿を含むフォルダーを選択します。「コンテンツ」で投稿を閲覧し、「メディア」で画像・動画を絞り込めます。どちらもローカルリーダーと同じ閲覧元を使います。
6. 投稿やメディアを開くと、元ファイルや投稿全体を別の場所に保存したり、元ファイルのフォルダーを開いたりできます。別の場所への保存はコピーのため、元データは変わりません。元ファイルが見つからない場合や読み取れない場合は失敗を表示します。

アプリ上部の「繁體中文／日本語」タブで表示言語を切り替えられ、選択は保存されます。README の言語は、このページ上部のリンクで切り替えます。一覧・投稿詳細・メディア詳細の時刻は「投稿の公開日時（JST / UTC+9）」として、日本時間の 24 時間表記で表示します。言語を切り替えてもタイムゾーンは変わりません。既存の metadata・ファイル名・アーカイブの内容は変更しません。

## 開発の参考：FaveConnect と他のファンクラブ

[Takaneko Fanclub](https://takanekofc.com/) は、日テレWands が提供するファンコミュニケーションサービス **FaveConnect** を利用しています。[FaveConnect の公式開設告知](https://faveconnect.com/news/u8wu6qsyepbey3s0.html)で確認できます。

同じ FaveConnect を利用する他のファンクラブ向けにツールを開発する際も、このプロジェクトのログイン、コンテンツのダウンロード、ローカルアーカイブの閲覧処理を参考にできます。他の導入事例は [FaveConnect 公式サイト](https://faveconnect.com/)を参照してください。

**現在のアプリは Takaneko Fanclub 向けの実装です。ファンクラブを切り替える設定はなく、他サイトとの互換性は未検証です。** 同じプラットフォームでも、API・会員権限・コンテンツの項目・動画の配信元が共通とは限りません。URL の変更だけで動作すると想定せず、移植時は次の箇所を確認してください。

| 項目 | 参考コードと確認事項 |
|---|---|
| ログインと Token | [`src/main/main.js`](src/main/main.js)：ログイン URL、Token 取得の対象ドメイン、認証フロー。 |
| 一覧と詳細 | [`src/main/api/getAllPosts.js`](src/main/api/getAllPosts.js)、[`src/main/api/archiveEngine.js`](src/main/api/archiveEngine.js)：API URL、ページング、レスポンス項目、ブログとカテゴリの識別子。 |
| 投稿とメディアの保存 | [`src/main/api/exportPosts.js`](src/main/api/exportPosts.js)、[`exportBlogs.js`](src/main/api/exportBlogs.js)、[`exportGallery.js`](src/main/api/exportGallery.js)、[`exportMovies.js`](src/main/api/exportMovies.js)：コンテンツ解析、相対 URL、Referer、動画の配信元。 |
| ローカル閲覧 | [`src/main/local-reader/`](src/main/local-reader/README.md)：生成するアーカイブの対応形式とメディアの相対パス。 |

他のファンクラブ向けに調整する際は、そのサイトの正規のアクセス権を持つアカウントで、会員プランと閲覧可能な内容を個別に確認し、合成データでテストを追加してください。Token、cookies、会員限定コンテンツをリポジトリにコミットしないでください。

## インストール

ソースコードのバージョンは v2.1.0 です。公開済みのパッケージは [Releases](https://github.com/Senachi124/TakanekoFanClubDownloader/releases) を確認してください。以下は本バージョンの出力ファイル名であり、公開済みとは限りません。パッケージの利用に Node.js の別途インストールは不要です。

| OS | ファイル |
|---|---|
| Windows x64 インストーラー | `Takaneko-Fanclub-Downloader-2.1.0-Windows-x64-Setup.exe` |
| Windows x64 ポータブル | `Takaneko-Fanclub-Downloader-2.1.0-Windows-x64-Portable.exe` |
| macOS Intel | `Takaneko-Fanclub-Downloader-2.1.0-macOS-x64.dmg` / `.zip` |
| macOS Apple Silicon | `Takaneko-Fanclub-Downloader-2.1.0-macOS-arm64.dmg` / `.zip` |

Windows 版は yt-dlp、ffmpeg、ffprobe、Deno を同梱します。macOS での動画ダウンロードには、PATH 上の最新版 yt-dlp・ffmpeg・ffprobe と、Deno 2.3+ または Node.js 22+ が必要です。画像と Reader の利用には不要です。Release には SHA-256 チェックサムが付属し、個人のアカウント情報やアーカイブは同梱しません。

v2 は 1.2.1 以降のアプリ ID・名前・ユーザーデータの保存場所を維持します。1.2.0 以前は旧名 `Takaneko Downloader` を使用しているため、元データを保持して必要な移行を行ってください。

## Local Reader

Reader は、このアプリが現在作成する次の 2 つの形式のみ対応します。

- **ダウンロード出力**：完了した投稿のフォルダーに `index.md`、`.post-id` と画像・動画を保存します。
- **投稿全体の別名保存**：アプリが作成した `record.json` v2、`index.md` と同じフォルダー内のメディアを読み込みます。投稿の種類・メンバー・公開日時を保持します。

フォルダー選択は引き続き利用できます。ダウンロード出力のルート、保存した投稿の親フォルダー、個別の投稿フォルダーを選択できます。コンテンツ・メディア・ローカルリーダーは共通の閲覧元を使い、メンバー・種類による絞り込み、1 ページ 48 件の表示、画像・動画の閲覧に対応します。索引の作成中は進捗バーを表示し、閲覧中は 60 秒ごとに更新を確認します。手動でも再読み込みできます。

旧形式の `record.json` v1、その他の v2 アーカイブ構造、外部の `catalog.json`／`.catalog/` 索引には対応しません。未完了のダウンロード（`.post-id` がない投稿）は表示しません。対応形式の投稿を直接スキャンし、索引はメモリ内にのみ保持します。閲覧元を読み取れなくなった場合は以前の一覧を保持しません。既存のディスク上の索引は読み込みません。

Reader は元ファイルを変更しません。投稿やメディアを閲覧元の外へコピーできます。形式の詳細は [Local Reader](src/main/local-reader/README.md) を参照してください。

## データと設定

「設定 → 保存先」で、新しいダウンロードの保存先と、別名保存の既定の場所を変更できます。初期値は Electron の `userData/exported` です。設定を変更しても既存ファイルは移動しません。「フォルダーを開く」から保存先を確認できます。Token と設定もユーザーデータ領域に保存し、Git には含めません。従来の内蔵ログインと Token Capture を維持しています。ログイン情報を共有しないでください。

### 時刻の意味

- **投稿の公開日時**：保存された日時を日本時間に変換し、一覧と詳細に表示します。ダウンロードの `index.md` は `**Date**` に日時を記録し、タイムゾーンの指定がない場合は日本時間として読み取ります。別名保存した投稿の `record.json` は UTC の ISO 形式で `published_at` を保存し、表示時に JST に変換します。
- **配信元の作成／送信日時**：通常の投稿では `releaseDate`、`displayDate`、`publishedAt`、`createdAt`、`sentAt` の順で値を選びます。ブログは詳細の `displayDate`、`createdAt`、一覧の `displayDate` の順です。Gallery／Movies は `displayDate` または `createdAt` を使います。既存の日時は代替値の可能性があり、確認済みの公開日時とは限りません。採用したフィールド名は個別に保存していません。
- **日時がない場合**：配信元の日時が欠けている場合や無効な場合、`index.md` の `**Date**` は空欄、別名保存の `published_at` は `null` になります。Reader は「日付不明」と表示し、日時がある投稿の後に並べます。ファイル名は `unknown-date` を使い、通常の投稿とブログには投稿 ID のハッシュを付けて同名の上書きを防ぎます。現在時刻での補完は行いません。以前に保存された日時は自動変更しません。
- **ダウンロード完了日時／別名保存日時**：現在は個別に記録していません。
- **ファイルの作成／更新日時**：ファイルシステムが管理し、コピーや移動によって変わる場合があります。Reader は公開日時として使用しません。

ファイル名の日時は従来のままです。通常の投稿とブログはダウンロード時の端末のタイムゾーン、Gallery／Movies は日本時間を使います。Reader はファイル名ではなく、保存された内容から公開日時を読み取ります。

### YouTube ログイン

設定画面には YouTube cookies のエクスポート手順があります。Netscape cookies.txt を貼り付けるか選択して、保存・削除できます。youtube.com の情報のみローカルの userData に保存し、アーカイブや配布パッケージには含めません。Fanclub の内蔵ログインと Token 取得は従来どおりです。「保存済み」は形式が有効であることのみを示し、動画にアクセスできるかどうかは実際のダウンロードで確認します。

## 開発とビルド

Node.js 22（CI と同じバージョン）と npm を使用します。プロジェクトのルートで実行してください。

```sh
npm ci
npm start
npm test
npm run check:release
```

デスクトップのスモークテストには、Electron を起動できるグラフィカル環境が必要です。

```sh
npm run test:desktop
```

各対象 OS 上でパッケージをビルドします。

```sh
# Windows
npm run build:win
# macOS
npm run build:mac
```

このリポジトリはローカル Electron デスクトップアプリ専用です。サーバー・リモートバックアップ・デプロイツールは含みません。UI は `src/renderer/`、共通 UI は `src/shared/`、メインプロセスとダウンロード処理は `src/main/`、Reader は `src/main/local-reader/` にあります。テストは `test/`・`tests/`、パッケージとデスクトップ検証用のツールは `scripts/` にあります。

ドキュメントを更新する際は、[繁體中文 README](README.md) と [日本語 README](README.ja.md) の内容を揃えてください。
