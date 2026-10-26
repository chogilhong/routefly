#!/bin/bash
# 서버에 배포 전용 계정(deploy)을 한 번 만듭니다. 메인 열쇠(ubuntu)로 들어가 sudo 로 돌립니다(docs/deploy-key.md).
#   sudo bash ~/deploy-key/setup.sh
# 같은 폴더에 routefly-deploy · routefly-war-install · routefly_deploy.pub 가 있어야 합니다. 여러 번 돌려도 같은 결과입니다.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
pub="$(tr -d '\r\n' < "$here/routefly_deploy.pub")"
[[ "$pub" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+\ routefly-deploy-pc$ ]] || { echo "공개 열쇠 모양이 이상합니다"; exit 1; }
command -v python3 >/dev/null || { echo "python3 가 없습니다"; exit 1; }

id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
passwd -l deploy >/dev/null

tr -d '\r' < "$here/routefly-deploy"       > /usr/local/bin/routefly-deploy
tr -d '\r' < "$here/routefly-war-install"  > /usr/local/sbin/routefly-war-install
chown root:root /usr/local/bin/routefly-deploy /usr/local/sbin/routefly-war-install
chmod 755 /usr/local/bin/routefly-deploy
chmod 700 /usr/local/sbin/routefly-war-install

echo 'deploy ALL=(root) NOPASSWD: /usr/local/sbin/routefly-war-install' > /etc/sudoers.d/routefly-deploy
chmod 440 /etc/sudoers.d/routefly-deploy
visudo -cf /etc/sudoers.d/routefly-deploy

install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
echo "restrict,command=\"/usr/local/bin/routefly-deploy\" $pub" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

touch /var/log/routefly-deploy.log; chmod 600 /var/log/routefly-deploy.log
install -d -m 700 /var/backups/routefly-war
echo "배포 전용 계정 준비 끝"
