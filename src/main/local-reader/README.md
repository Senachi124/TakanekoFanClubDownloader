# Local Reader

The Electron application uses this module to read archives from local disks,
external drives, and already mounted NAS folders. It uses filesystem access only;
no hosted service, database, or remote backup worker is required.

`index.js` implements `ArchiveReader`, archive scanning, filtering, pagination,
and safe file resolution. `catalog.js` loads existing catalog files. The Reader
does not modify the selected archive; its cache lives in the application's
user data directory. Copying a post or media file to another location is handled
by `../archiveActions.js`.

## Supported archives

- Desktop downloads: a post folder containing `index.md`, `.post-id`, and media.
- Existing `record.json` archives with `schema_version` 1 or 2. Relative media
  references must stay inside the selected root; select the complete archive
  root when records reference files in neighboring folders.
- Catalog archives in the format below. Lists load from the catalog; post text
  and media availability are checked when a post is opened.

## Catalog format

The Reader checks these locations relative to the selected root, in order:
`catalog.json`, `members/catalog.json`, `media/members/catalog.json`, and
`takaneko/media/members/catalog.json`.

A catalog may contain its records directly:

```json
{
  "format": "takaneko-catalog",
  "schema_version": 1,
  "total": 1,
  "posts": [{
    "resource_key": "example:1",
    "source_id": "1",
    "version": "example",
    "member": "Example member",
    "kind": "post",
    "title": "Example post",
    "published_at": "2024-01-02T12:00:00+09:00",
    "text": "member/post/index.md",
    "media": [{"path": "member/post/image.jpg", "variant": "original"}]
  }]
}
```

Alternatively, the entry file can use `format: "takaneko-catalog-pointer"` and
`schema_version: 1`, with `catalog: ".catalog/<sha256>.json"`, the snapshot's
byte count in `size`, and its lowercase SHA-256 digest in `sha256`. The snapshot
contains the records shown above. Keep the `.catalog/` directory when copying
an archive that uses a pointer.

Post text and media paths are relative to the entry file's directory, not the
snapshot's `.catalog/` directory. Absolute paths, traversal, and symlinks escaping
the selected root are rejected. Catalog files have a 128 MiB size limit.

If no catalog is present, the Reader scans supported post folders. Invalid
catalogs preserve the previous index and report a warning instead of triggering
a full scan. Disconnected folders retain the cached index and show media as
unavailable. The desktop UI checks for updates every 60 seconds while a collection
view is open and also provides manual refresh.

See `tests/reader.test.js`, `tests/catalog.test.js`, and
`tests/archive-actions.test.js` at the repository root for isolated examples.
