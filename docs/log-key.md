# 로그 읽기 전용 열쇠 (2026-10-27 홍TV님)

밖에서도 운영 오류를 볼 수 있게, 서버 톰캣 로그를 읽기만 하는 계정(logview)과 열쇠를 따로 둡니다.
배포 전용 열쇠(docs/deploy-key.md)와 같은 방식이고, 메인 열쇠(ubuntu, `C:\GH\config\routefly\*.pem`)는 그대로 홍TV님만 씁니다.

## 무엇이 되고 무엇이 안 되나

- 이 열쇠로 들어오면 `/usr/local/bin/routefly-logs` 만 돕니다(authorized_keys 의 `restrict,command=`). 셸 · scp · 터널은 안 됩니다.
- 받는 명령(보낸 글을 낱말로 나눌 뿐 셸로 돌리지 않음):

| 명령 | 하는 일 |
|---|---|
| `files` | `/opt/tomcat/logs` 파일 목록(크기 · 시각, 한국 시간) |
| `tail [N]` | catalina.out 끝 N줄(기본 200, 많아야 3000) |
| `log 이름 [N]` | 그 폴더의 `.log` · `.out` · `.txt` 파일 끝 N줄(경로 · `..` 안 됨, 압축된 옛 로그는 안 됨) |
| `grep 낱말 [N]` | catalina.out 끝 5만 줄에서 그 낱말(글자 그대로, 영문 · 숫자 · `[ ] _ . : = -` 2~60자)이 든 줄의 마지막 N줄 |
| `access 날짜` | 그 날(`YYYY-MM-DD`) 톰캣 접속 기록 하루 요약(2026-10-28): 화면 수 · 경로 묶음 · 15분별 · 브라우저 종류(사람 · 검색 로봇 · AI 수집 · 프로그램 · Headless · 오래된 크롬) · 많이 연 곳 상위 10. 주소는 내보내지 않고, 돌릴 때마다 바뀌는 무작위 값과 섞은 해시 8글자만 |

- 한 줄은 400자까지 자릅니다. root 로 도는 부분은 `/usr/local/sbin/routefly-logs-read` 하나이고, sudoers 는 logview 에 그 파일만 허용합니다.
- 읽기만 합니다 - 로그 · 설정 · war 를 바꾸거나 지우지 못하고, `/opt/tomcat/logs` 밖(설정 파일 · DB)은 읽지 못합니다.
- 로그에는 접속 IP · 방 번호 같은 값이 들어 있을 수 있습니다. 보고 · 대화에는 필요한 오류 줄만 옮기고 IP · 토큰 · 개인정보는 빼거나 가립니다.

## 열쇠 두는 곳

- PC: `C:\GH\workspace\.deploy-key\routefly_logs`(비밀 열쇠, 저장소 밖) · `routefly_logs.pub`
- 새로 만들려면: `ssh-keygen -t ed25519 -N "" -C routefly-logs-pc -f C:\GH\workspace\.deploy-key\routefly_logs` 후 설치를 다시 합니다.

## 서버에 설치 (홍TV님 - 메인 열쇠가 필요, 한 번만)

PowerShell 에서 차례로:

```
scp -i "C:\GH\config\routefly\LightsailDefaultKey-ap-northeast-2.pem" -r C:\GH\workspace\routefly\tools\log-key ubuntu@routefly.kr:~/
scp -i "C:\GH\config\routefly\LightsailDefaultKey-ap-northeast-2.pem" C:\GH\workspace\.deploy-key\routefly_logs.pub ubuntu@routefly.kr:~/log-key/
ssh -i "C:\GH\config\routefly\LightsailDefaultKey-ap-northeast-2.pem" ubuntu@routefly.kr 'sudo bash ~/log-key/setup.sh && rm -rf ~/log-key'
```

마지막에 "로그 읽기 전용 계정 준비 끝" 이 나오면 됩니다.

읽기 명령을 늘렸을 때(예: 2026-10-28 `access`)도 같은 세 줄을 다시 돌리면 됩니다 - setup.sh 는 여러 번 돌려도 같은 결과이고, 열쇠는 그대로입니다.
`access` 는 서버의 python3 를 씁니다(Ubuntu 기본).

## 쓰기 (PC Claude - 언제든, 읽기만이라 "배포해" 같은 허락 없이)

```
C:\Windows\System32\OpenSSH\ssh.exe -i C:\GH\workspace\.deploy-key\routefly_logs -o BatchMode=yes logview@routefly.kr "grep [PARTY] 50"
C:\Windows\System32\OpenSSH\ssh.exe -i C:\GH\workspace\.deploy-key\routefly_logs -o BatchMode=yes logview@routefly.kr "access 2026-10-29"
```

## 없애기 (홍TV님, 메인 열쇠로)

```
ssh -i "C:\GH\config\routefly\LightsailDefaultKey-ap-northeast-2.pem" ubuntu@routefly.kr 'sudo deluser --remove-home logview; sudo rm -f /etc/sudoers.d/routefly-logs /usr/local/bin/routefly-logs /usr/local/sbin/routefly-logs-read'
```
