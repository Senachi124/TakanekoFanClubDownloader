#!/bin/bash
# Existing-host update only. Host configuration and original archives stay outside releases.
set -euo pipefail
release=$(realpath "${1:?Release path required}")
case "$release" in /opt/takaneko/releases/*) ;; *) echo 'Invalid release root' >&2; exit 1;; esac
test -f "$release/package.json"
exec 9>/run/takaneko-upgrade.lock
flock -n 9
previous=$(readlink -f /opt/takaneko/current)
test -d "$previous"
cd "$release"
# Prepare dependencies before touching live processes.
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
node -e 'if(Number(process.versions.node.split(".")[0])<22)throw Error("Node.js 22+ required for YouTube")'
python3 server/deployment/vm1/prepare-media-tools.py
idle() {
  runuser -u takanekowork -g takaneko-read -- python3 "$release/server/deployment/vm1/check-idle.py"
  for unit in takaneko-auto.service takaneko-nas.service; do
    if systemctl is-active --quiet "$unit"; then echo 'Application scheduler is active; retry later' >&2; return 1; fi
  done
}
idle
active=()
for unit in takaneko-auto.timer takaneko-nas.timer takaneko-web.service takaneko.service takaneko-backup.service; do
  if systemctl is-active --quiet "$unit"; then active+=("$unit"); fi
done
switched=0
restore() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ "$switched" -eq 1 ]; then
    systemctl stop takaneko-web.service takaneko.service takaneko-backup.service
    ln -sfn "$previous" /opt/takaneko/current
  fi
  if [ "${#active[@]}" -gt 0 ]; then systemctl start "${active[@]}"; fi
  exit "$status"
}
trap restore EXIT
systemctl stop takaneko-auto.timer takaneko-nas.timer takaneko-web.service
# Recheck after closing the web entrypoint and scheduler to prevent enqueue races.
idle
systemctl stop takaneko.service takaneko-backup.service
runuser -u takanekowork -g takaneko-read -- env PYTHONDONTWRITEBYTECODE=1 python3 server/worker.py --initialize
ln -sfn "$release" /opt/takaneko/current
switched=1
for unit in "${active[@]}"; do
  case "$unit" in *.service) systemctl start "$unit";; esac
done
for unit in "${active[@]}"; do
  case "$unit" in *.service) systemctl is-active --quiet "$unit";; esac
done
curl --fail --silent --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:43130/healthz
printf '\nApplication updated; previous release: %s\n' "$previous"
