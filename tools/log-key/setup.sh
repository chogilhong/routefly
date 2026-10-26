#!/bin/bash
# 서버에 로그 읽기 전용 계정(logview)을 한 번 만듭니다. 메인 열쇠(ubuntu)로 들어가 sudo 로 돌립니다(docs/log-key.md).
#   sudo bash ~/log-key/setup.sh
# 같은 폴더에 routefly-logs · routefly-logs-read · routefly_logs.pub 가 있어야 합니다. 여러 번 돌려도 같은 결과입니다.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
pub="$(tr -d '\r\n' < "$here/routefly_logs.pub")"
[[ "$pub" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+\ routefly-logs-pc$ ]] || { echo "공개 열쇠 모양이 이상합니다"; exit 1; }

id logview >/dev/null 2>&1 || adduser --disabled-password --gecos "" logview
passwd -l logview >/dev/null

tr -d '\r' < "$here/routefly-logs"      > /usr/local/bin/routefly-logs
tr -d '\r' < "$here/routefly-logs-read" > /usr/local/sbin/routefly-logs-read
chown root:root /usr/local/bin/routefly-logs /usr/local/sbin/routefly-logs-read
chmod 755 /usr/local/bin/routefly-logs
chmod 700 /usr/local/sbin/routefly-logs-read

echo 'logview ALL=(root) NOPASSWD: /usr/local/sbin/routefly-logs-read' > /etc/sudoers.d/routefly-logs
chmod 440 /etc/sudoers.d/routefly-logs
visudo -cf /etc/sudoers.d/routefly-logs

install -d -o logview -g logview -m 700 /home/logview/.ssh
echo "restrict,command=\"/usr/local/bin/routefly-logs\" $pub" > /home/logview/.ssh/authorized_keys
chown logview:logview /home/logview/.ssh/authorized_keys
chmod 600 /home/logview/.ssh/authorized_keys
echo "로그 읽기 전용 계정 준비 끝"
