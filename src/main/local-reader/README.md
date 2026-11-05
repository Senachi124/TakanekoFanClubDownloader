# Local Reader

The Electron Reader only reads formats currently produced by this Downloader:
completed downloads and posts copied with **Save Post**. Users can select a
Downloader output root, a folder containing saved posts, or an individual post
folder. Content, media, and Reader views share this selection.

`index.js` implements `ArchiveReader`, folder scanning, filtering, pagination,
and safe file resolution. It never modifies the selected files. The index lives
in memory and is rebuilt from the selected folder; old disk caches are not read.
If the source cannot be read, its list is cleared and the UI reports the error.
The UI checks for updates every 60 seconds while a collection view is open and
also provides manual refresh.

## Completed downloads

Each completed post contains `index.md`, a non-empty `.post-id`, and media files
in the same folder. The Downloader writes `.post-id` after a successful download;
folders without that marker are not indexed as completed downloads.

```text
exported/
  Example member/
    Example post/
      index.md
      .post-id
      image.jpg
      video.mp4
  GALLERY/
    Example album/
      index.md
      .post-id
      image.jpg
```

The Reader uses the Markdown heading, `**Sender**`, and `**Date**` for metadata.
Categories follow the Downloader's member, manager-blog, `GALLERY`, and `MOVIE`
folders. Media are discovered directly within each post folder. Duplicate
`pictures/` collections, hidden folders and incomplete `.part` folders are skipped.

## Posts saved by the app

`../archiveActions.js` copies the Markdown and original media into a separate
folder and writes a `record.json` with `schema_version: 2`. It preserves the post's
identity, category, member and publication date without copying unrelated files.
This is the supported v2 layout: `text` is `index.md`, and each media `path` is a
filename in the same folder with `variant: "original"`.

```json
{
  "schema_version": 2,
  "resource_key": "takaneko:post:example:v1",
  "source_id": "example",
  "kind": "post",
  "title": "Example post",
  "member": "Example member",
  "published_at": "2024-01-02T03:00:00.000Z",
  "text": "index.md",
  "media": [{"path": "image.jpg", "variant": "original"}]
}
```

The `:v1` suffix in a post key is part of its identity, not the record schema
version. Supported kinds are `post`, `blog`, `gallery`, and `movie`. A missing
publication date is stored as `null`. A text-only post has an empty media list.

Legacy `record.json` v1, other v2 layouts, and external `catalog.json` or
`.catalog/` indexes are unsupported. Catalogs are ignored; unsupported records
are skipped with a warning. Missing media are marked unavailable. Paths and
symlinks escaping the selected root are rejected.

See `tests/reader.test.js` and `tests/archive-actions.test.js` for current-format
reading, saved-post round trips, unsupported formats, and source safety checks.
