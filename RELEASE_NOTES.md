# Release Notes

## v2.1.1

Self-contained macOS packages, clearer publication times, and a focused local Reader.

- Bundle yt-dlp, FFmpeg, FFprobe and Deno in both Intel and Apple Silicon
  macOS packages, matching the self-contained Windows setup. No Homebrew,
  Python or PATH configuration is required. macOS 12 or later is required.
- Verify pinned tool downloads and validate packaged tools on native Intel
  and Apple Silicon CI runners.
- Label publication times as JST / UTC+9 throughout the Reader, using Japan
  time regardless of the computer's timezone or interface language.
- Leave missing or invalid source dates blank instead of substituting the
  download time. Show unknown dates in the Reader and use `unknown-date` in
  filenames; previously saved dates are not rewritten.
- Keep folder selection while limiting the Reader to current Downloader
  exports and v2 records created by Save Post. Remove legacy v1 records,
  external catalogs and persistent offline indexes. Existing archive files
  remain unchanged, but unsupported formats no longer appear in the Reader.
- Split the README into Traditional Chinese and Japanese with language links,
  move Quick Start earlier, and add FaveConnect development guidance.

See [README.md](README.md) for local setup and development commands.

