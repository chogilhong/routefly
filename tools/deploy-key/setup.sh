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

# 두 번째 잠금(2026-11-03 홍TV님 보안 점검 - logview 와 같게): authorized_keys 의 command= 와 별도로 sshd 설정에서도 deploy 는 이 스크립트만 · 터널 · 화면 없음.
# 설정이 틀리면(sshd -t 실패) 파일을 지우고 그대로 둠 - ssh 가 막히지 않게. 여러 번 돌려도 같은 파일
if [ -d /etc/ssh/sshd_config.d ]; then
  conf=/etc/ssh/sshd_config.d/routefly-deploy.conf
  printf '%s\n' 'Match User deploy' '    ForceCommand /usr/local/bin/routefly-deploy' '    AllowTcpForwarding no' \
    '    AllowAgentForwarding no' '    AllowStreamLocalForwarding no' '    X11Forwarding no' '    PermitTTY no' > "$conf"
  chmod 644 "$conf"
  if sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
    echo "sshd: deploy 두 번째 잠금 켬"
  else
    rm -f "$conf"
    echo "sshd 설정 검사 실패 - 두 번째 잠금 없이 그대로 둠(첫 잠금 command= 는 그대로)"
  fi
fi

touch /var/log/routefly-deploy.log; chmod 600 /var/log/routefly-deploy.log
install -d -m 700 /var/backups/routefly-war
echo "배포 전용 계정 준비 끝"
