#!/bin/bash
# Run as root from an unpacked, reviewed release. Existing unrelated services are untouched.
set -euo pipefail
cd "$(dirname "$0")/../.."
release=$(pwd -P)
case "$release" in /opt/takaneko/releases/*) ;; *) echo 'Expected /opt/takaneko/releases/<revision>' >&2; exit 1;; esac
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
apt-get update -qq
apt-get install -y --no-install-recommends npm ffmpeg yt-dlp python3-pil python3-psycopg
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
getent group takaneko-read >/dev/null || groupadd --system takaneko-read
getent group takaneko-control >/dev/null || groupadd --system takaneko-control
id takanekowork >/dev/null 2>&1 || useradd --system --user-group --home-dir /var/lib/takaneko --shell /usr/sbin/nologin takanekowork
id takanekoweb >/dev/null 2>&1 || useradd --system --user-group --home-dir /var/lib/takaneko-control --shell /usr/sbin/nologin takanekoweb
usermod -aG takaneko-read,takaneko-control,vm1-backup takanekowork
usermod -aG takaneko-read,takaneko-control,vm1-media-readers takanekoweb
install -d -o takanekowork -g takaneko-read -m 2750 /var/lib/takaneko /var/lib/takaneko/complete
install -d -o takanekowork -g takanekowork -m 0700 /var/lib/takaneko/staging
install -d -o takanekoweb -g takaneko-control -m 2750 /var/lib/takaneko-control
install -d -o root -g takanekoweb -m 0750 /etc/takaneko
install -d -o root -g root -m 0755 /var/log/takaneko
test -f /etc/vm1-backup/services/takaneko.json || vm1-backup-admin takaneko --os-user takanekowork
test -f /etc/vm1-backup/services/takaneko_web.json || vm1-backup-admin takaneko_web --os-user takanekoweb
# The admin helper grants NAS write group by default. The reader must never retain it.
if id -nG takanekoweb | tr ' ' '\n' | grep -qx vm1-backup; then gpasswd -d takanekoweb vm1-backup; fi
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d vm1_backup -c 'ALTER ROLE svc_takaneko CONNECTION LIMIT 16;'
runuser -u takanekowork -g takaneko-read -- env PYTHONDONTWRITEBYTECODE=1 python3 server/worker.py --initialize
runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -d vm1_backup <<'SQL'
GRANT USAGE ON SCHEMA takaneko TO svc_takaneko_web;
GRANT SELECT ON takaneko.settings,takaneko.jobs,takaneko.posts,takaneko.media TO svc_takaneko_web;
GRANT UPDATE ON takaneko.settings TO svc_takaneko_web;
GRANT INSERT,UPDATE ON takaneko.jobs TO svc_takaneko_web;
SQL
python3 deployment/vm1/provision_auth.py
ln -sfn "$release" /opt/takaneko/current
install -m 0644 deployment/vm1/nginx.conf /etc/takaneko/nginx.conf
install -m 0644 deployment/vm1/*.service deployment/vm1/*.timer /etc/systemd/system/
nginx -t -c /etc/takaneko/nginx.conf
systemctl daemon-reload
systemctl enable takaneko.service takaneko-web.service takaneko-https.service takaneko-nas.timer takaneko-tls-reload.timer
systemctl restart takaneko.service takaneko-web.service takaneko-https.service
systemctl start takaneko-nas.timer takaneko-tls-reload.timer
ufw allow 2083/tcp comment 'Takaneko Fanclub HTTPS'
python3 deployment/vm1/register_portal.py
systemctl is-active takaneko.service takaneko-web.service takaneko-https.service
