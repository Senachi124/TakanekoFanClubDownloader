# Takaneko empty-post recovery — 2026-10-22

Two October 22 posts had timestamp-prefixed `untitled` titles, metadata-only
Markdown and no media, while their fetch jobs reported success. The existing
downloaded resource records caused ordinary fetches to skip those snapshots.
Current upstream detail requests returned populated titles, bodies and images.
The original responses were not retained, so the reason they were empty at the
initial capture cannot be proven from current evidence.

The explicitly selected two posts were re-fetched using the existing download
engine under the Takaneko service identity. New immutable versions were written
and both catalog rows were updated in one transaction, preserving resource IDs,
publication dates and all previous files. Each post now has its real title,
full text, one original image and a thumbnail. No old media, source directories,
helper resource records, queues or credentials were deleted or overwritten.

The new manual fetch job completed 2/2 with zero failures. Authenticated public
HTTPS detail requests returned the corrected text; both complete image streams
matched their database SHA-256 and byte counts. Every old snapshot file still
matches its saved hash. The temporary verification login was logged out.

Operator tools: `scripts/refetch-takaneko-empty-posts.py` accepts explicit
`--ids`; `scripts/verify-takaneko-refetch.py` accepts a root-only `--receipt`.
The repair rejects normal/nonempty posts, existing media and NAS-published
versions, checks for active work, compares original rows before committing and
leaves new files in place on error. The service worker identity, read group and
umask match the live service. It is not a general overwrite/re-download command.

Initial execution was prevented by the service user's home-directory isolation;
the worker source is now delivered via stdin without broadening filesystem
access. Verification also found incorrect group permissions on the new versions;
only those newly created directories/files were corrected to `takaneko-read`
0750/0640. The tool now explicitly uses the service's group and umask. Final
HTTPS verification passed after correction.

Raw original catalog rows, hashes, source IDs, receipts and private execution
diagnostics stay only under root-owned
`/var/backups/vm1-admin/takaneko-refetch-20261022T232349+0800/` (0700). They are
excluded from GitHub. Root-only rollback can restore the saved catalog rows
only after checking subsequent activity and new media references; keep both
versions' files, never rewind the whole DB or delete later data.

This was a targeted data recovery, with no deployed application/configuration
change, restart, new service or changed backup scope. Existing source/deployment
registrations remain applicable. New versions retain pending NAS flags for the
normal scheduled backup, whose delivery keys include the new content version.
No NAS upload was triggered; automatic NAS remains Hong Kong 03:00–09:00 and
resource reports retain their separate immediate-upload exception.

The generic repair/verification source and these notes are synchronized to the
user-requested Takaneko `sena/deploy` branch. Production content, post IDs,
receipts, cookies and rollback data are not published. The server-admin
workspace has no remote and retains its own scoped local commit.
