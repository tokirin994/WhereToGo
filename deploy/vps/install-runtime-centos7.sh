#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
test "$(id -u)" = 0
test "$(uname -m)" = x86_64
install -d -m 0755 /opt/wheretogo/tools /opt/wheretogo/incoming /opt/wheretogo/releases
install -d -m 0700 /opt/wheretogo/secrets
if getent group wtgbackup >/dev/null; then
 install -d -m 0750 -o root -g wtgbackup /opt/wheretogo/backups
else
 install -d -m 0700 /opt/wheretogo/backups
fi
if ! test -x /opt/wheretogo/tools/docker-28.5.2/docker/dockerd; then
 curl --proto '=https' --tlsv1.2 -fL --retry 2 --connect-timeout 20 --max-time 480 https://download.docker.com/linux/static/stable/x86_64/docker-28.5.2.tgz -o /opt/wheretogo/incoming/docker-28.5.2.tgz
 tar -tzf /opt/wheretogo/incoming/docker-28.5.2.tgz | awk '$0 !~ /^docker\// || $0 ~ /(^|\/)\.\.(\/|$)/ {bad=1} END {exit bad}'
 install -d -m 0755 /opt/wheretogo/tools/docker-28.5.2
 tar -xzf /opt/wheretogo/incoming/docker-28.5.2.tgz -C /opt/wheretogo/tools/docker-28.5.2
 sha256sum /opt/wheretogo/incoming/docker-28.5.2.tgz > /opt/wheretogo/incoming/docker-28.5.2.sha256.record
fi
for executable in /opt/wheretogo/tools/docker-28.5.2/docker/*; do
 name=$(basename "$executable")
 if test -e "/usr/local/bin/$name" && ! test -L "/usr/local/bin/$name"; then
  printf 'Refusing to replace unrelated executable %s\n' "$name" >&2;exit 1
 fi
 ln -sfn "$executable" "/usr/local/bin/$name"
done
if ! test -x /usr/local/lib/docker/cli-plugins/docker-compose; then
 if ! test -f /opt/wheretogo/incoming/docker-compose-linux-x86_64; then
 curl --proto '=https' --tlsv1.2 -sSfL --retry 2 --connect-timeout 20 --max-time 360 https://github.com/docker/compose/releases/download/v2.40.3/docker-compose-linux-x86_64 -o /opt/wheretogo/incoming/docker-compose-linux-x86_64
 fi
 curl --proto '=https' --tlsv1.2 -fL --retry 2 --connect-timeout 20 --max-time 60 https://github.com/docker/compose/releases/download/v2.40.3/checksums.txt -o /opt/wheretogo/incoming/compose-checksums.txt
 (cd /opt/wheretogo/incoming; grep -E '[ *]docker-compose-linux-x86_64$' compose-checksums.txt | sha256sum -c -)
 install -d -m 0755 /usr/local/lib/docker/cli-plugins
 install -m 0755 /opt/wheretogo/incoming/docker-compose-linux-x86_64 /usr/local/lib/docker/cli-plugins/docker-compose
fi
install -d -m 0755 /etc/docker
if ! test -f /etc/docker/daemon.json; then
 cat > /etc/docker/daemon.json <<'JSON'
{"data-root":"/var/lib/docker","storage-driver":"overlay2","exec-opts":["native.cgroupdriver=cgroupfs"],"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"},"live-restore":true}
JSON
fi
if ! test -f /etc/systemd/system/docker.service; then
 cat > /etc/systemd/system/docker.service <<'UNIT'
[Unit]
Description=Docker Engine (manual compatibility installation)
After=network-online.target
Wants=network-online.target
[Service]
Type=notify
Environment=PATH=/usr/local/bin:/usr/bin:/usr/sbin:/bin:/sbin
ExecStart=/usr/local/bin/dockerd --host=unix:///var/run/docker.sock
ExecReload=/bin/kill -s HUP $MAINPID
Restart=on-failure
RestartSec=5
LimitNOFILE=1048576
LimitNPROC=1048576
LimitCORE=infinity
TimeoutStartSec=180
Delegate=yes
KillMode=process
[Install]
WantedBy=multi-user.target
UNIT
fi
systemctl daemon-reload
systemctl enable docker
systemctl start docker
docker version --format 'Docker server {{.Server.Version}}'
docker compose version
docker info --format 'Storage {{.Driver}}; cgroup {{.CgroupDriver}}; memory limit {{.MemTotal}}'
printf '\nContainer runtime installed. Only its local Unix socket is exposed.\n'
