# Linux deployment integrity

2026-10-13: deployment sealing now runs before activation. The helper assigns
root ownership, removes group/other write permissions, separates hardlinked
regular files, verifies copied bytes, and writes DEPLOYMENT-MANIFEST.json with
SHA-256 hashes and a source revision label. Configuration, media, queues and
credentials outside the release are untouched.

Run the existing installer/update workflow while application jobs are idle.
Deploy the complete source package including server/deployment/vm1/harden-release.py. Pass a verified commit
as the source revision when sealing manually; a date/release label alone is not
proof of a Git commit. Keep the manifest with the deployment receipt.

The current VM may contain newer application fixes than this repository branch.
This change does not replace current VM application code with GitHub main.
Backport deployment sealing into newer local workflows before their next deploy.

Validation: isolated hardlink separation, permissions and hash manifest checks;
Python installer compilation and shell syntax checks. Live VM checks covered
service availability and removal of writable deployment files.

Rollback: restore only the installer/helper code from the previous commit.
Keep safe ownership/permissions and independent file copies; do not restore
world-writable files, overwrite application DBs or remove media/NAS evidence.
Virtualenvs must be independent of older release directories; record exact
runtime packages separately and preserve the previous environment until a
healthy controlled activation succeeds.

Review correction (2026-10-21): sealing strips setuid/setgid/sticky bits as well
as group/other write permission before publishing the manifest. Synthetic
regression tests cover special permission bits, independent hardlink copies,
untouched symlink targets and special-file rejection.
