#!/bin/bash
# 서버에 로그 읽기 전용 계정(logview)을 한 번 만듭니다. 메인 열쇠(ubuntu)로 들어가 sudo 로 돌립니다(docs/log-key.md).
#   sudo bash ~/log-key/setup.sh
# 같은 폴더에 routefly-logs · routefly-logs-read · routefly-batchlogs-read · routefly_logs.pub 가 있어야 합니다. 여러 번 돌려도 같은 결과입니다.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
pub="$(tr -d '\r\n' < "$here/routefly_logs.pub")"
[[ "$pub" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+\ routefly-logs-pc$ ]] || { echo "공개 열쇠 모양이 이상합니다"; exit 1; }

id logview >/dev/null 2>&1 || adduser --disabled-password --gecos "" logview
passwd -l logview >/dev/null

tr -d '\r' < "$here/routefly-logs"      > /usr/local/bin/routefly-logs
tr -d '\r' < "$here/routefly-logs-read" > /usr/local/sbin/routefly-logs-read
# 읽기 부분은 root 가 아니라 tomcat 계정으로 돎(2026-10-28 보안 점검: tomcat 이 로그 폴더 주인이라, 검사 뒤 바로 가기로 바꿔치기하면
# root 로 아무 파일이나 읽을 수 있었음). tomcat 은 이 파일을 고칠 수 없고(root 소유) 돌리기만 함
chown root:root /usr/local/bin/routefly-logs
chown root:tomcat /usr/local/sbin/routefly-logs-read
chmod 755 /usr/local/bin/routefly-logs
chmod 750 /usr/local/sbin/routefly-logs-read
# 배치 로그 읽기(2026-10-30) - 배치를 돌리는 routefly 계정으로(그 로그 폴더 주인). routefly 가 없으면(배치 안 깐 서버) 건너뜀
if id routefly >/dev/null 2>&1; then
  tr -d '\r' < "$here/routefly-batchlogs-read" > /usr/local/sbin/routefly-batchlogs-read
  chown root:routefly /usr/local/sbin/routefly-batchlogs-read
  chmod 750 /usr/local/sbin/routefly-batchlogs-read
fi

{
  echo 'logview ALL=(tomcat) NOPASSWD: /usr/local/sbin/routefly-logs-read'
  if id routefly >/dev/null 2>&1; then echo 'logview ALL=(routefly) NOPASSWD: /usr/local/sbin/routefly-batchlogs-read'; fi
} > /etc/sudoers.d/routefly-logs
chmod 440 /etc/sudoers.d/routefly-logs
visudo -cf /etc/sudoers.d/routefly-logs

install -d -o logview -g logview -m 700 /home/logview/.ssh
echo "restrict,command=\"/usr/local/bin/routefly-logs\" $pub" > /home/logview/.ssh/authorized_keys
chown logview:logview /home/logview/.ssh/authorized_keys
chmod 600 /home/logview/.ssh/authorized_keys
# 두 번째 잠금(2026-10-30 점검 추천): authorized_keys 의 command= 와 별도로 sshd 설정에서도 logview 는 이 스크립트만 · 터널 · 화면 없음.
# 설정이 틀리면(sshd -t 실패) 파일을 지우고 그대로 둠 - ssh 가 막히지 않게
if [ -d /etc/ssh/sshd_config.d ]; then
  conf=/etc/ssh/sshd_config.d/routefly-logview.conf
  printf '%s\n' 'Match User logview' '    ForceCommand /usr/local/bin/routefly-logs' '    AllowTcpForwarding no' \
    '    AllowAgentForwarding no' '    X11Forwarding no' '    PermitTTY no' > "$conf"
  chmod 644 "$conf"
  if sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
    echo "sshd: logview 두 번째 잠금 켬"
  else
    rm -f "$conf"
    echo "sshd 설정 검사 실패 - 두 번째 잠금 없이 그대로 둠(첫 잠금 command= 는 그대로)"
  fi
fi
echo "로그 읽기 전용 계정 준비 끝"
