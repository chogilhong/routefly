# 배포 전용 열쇠 (2026-10-27 홍TV님)

밖에서도 "배포해" 한 마디로 운영에 war 를 올릴 수 있게, 서버에 war 바꾸기만 되는 계정(deploy)과 열쇠를 따로 둡니다.
메인 열쇠(ubuntu, `C:\GH\config\routefly\*.pem`)는 그대로 홍TV님만 씁니다.

## 무엇이 되고 무엇이 안 되나

- 이 열쇠로 들어오면 `/usr/local/bin/routefly-deploy` 만 돕니다(authorized_keys 의 `restrict,command=`). 셸 · 파일 보기 · 터널 · scp 는 안 됩니다.
- 받는 명령은 셋: `deploy`(표준 입력의 war 를 운영으로), `rollback`(바로 앞 war 로), `status`(지금 · 앞 war, 최근 기록 5줄).
- `deploy` 는 1MB ~ 100MB 이고, zip 이 온전하고, `WEB-INF/classes/com/gh/routefly/web/RouteflyConfig.class` 가 들어 있어야 받습니다.
  바꾸기 전 war 는 `/var/backups/routefly-war/routefly.war.prev` 에 남기고, 기록은 `/var/log/routefly-deploy.log`(시각 · 크기 · sha256 앞 12자).
- root 로 도는 부분은 `/usr/local/sbin/routefly-war-install` 하나이고, sudoers 는 deploy 계정에 그 파일만 허용합니다.
- 한계: war 안의 프로그램은 서버에서 톰캣 권한으로 돕니다. 이 열쇠는 실수(잘못된 명령 · 파일 지우기 · 설정 망가뜨리기)를 막지만,
  PC 가 털려 나쁜 war 가 올라가는 것까지 막지는 못합니다. 그래서 PC Claude 는 홍TV님이 "배포해" 라고 할 때만 씁니다.

## 열쇠 두는 곳

- PC: `C:\GH\workspace\.deploy-key\routefly_deploy` (비밀 열쇠 - 저장소 밖, 파일 권한은 홍TV님 계정만) · `routefly_deploy.pub`(공개 열쇠)
- 비밀 열쇠는 어느 저장소에도 넣지 않고, 대화 · 보고에 붙이지 않습니다.
- 잃어버리거나 새로 만들려면: 새로 만들고(아래 명령) 설치를 다시 하면 authorized_keys 가 새 것 하나로 바뀝니다.
  `ssh-keygen -t ed25519 -N "" -C routefly-deploy-pc -f C:\GH\workspace\.deploy-key\routefly_deploy`

## 서버에 설치 (홍TV님 - 메인 열쇠가 필요, 한 번만)

PowerShell 에서 차례로:

```
scp -i "C:\GH\config\routefly\LightsailDefaultKey-ap-northeast-2.pem" -r C:\GH\workspace\routefly\tools\deploy-key ubuntu@routefly.kr:~/
scp -i "C:\GH\config\routefly\LightsailDefaultKey-ap-northeast-2.pem" C:\GH\workspace\.deploy-key\routefly_deploy.pub ubuntu@routefly.kr:~/deploy-key/
ssh -i "C:\GH\config\routefly\LightsailDefaultKey-ap-northeast-2.pem" ubuntu@routefly.kr 'sudo bash ~/deploy-key/setup.sh && rm -rf ~/deploy-key'
```

마지막에 "배포 전용 계정 준비 끝" 이 나오면 됩니다. 여러 번 돌려도 같은 결과입니다.

## 쓰기 (PC Claude)

PowerShell 은 `<` 를 못 쓰므로 cmd 로:

```
cmd /c "ssh -i C:\GH\workspace\.deploy-key\routefly_deploy deploy@routefly.kr status"
cmd /c "ssh -i C:\GH\workspace\.deploy-key\routefly_deploy deploy@routefly.kr deploy < C:\GH\workspace\routefly\target\routefly.war"
cmd /c "ssh -i C:\GH\workspace\.deploy-key\routefly_deploy deploy@routefly.kr rollback"
```

배포 뒤에는 늘 하던 대로 운영 파일이 저장소 판과 같은지 · sw 캐시 이름 · `/api/party/status` · 콘솔 오류를 봅니다.

## 없애기 (홍TV님, 메인 열쇠로)

```
ssh -i "C:\GH\config\routefly\LightsailDefaultKey-ap-northeast-2.pem" ubuntu@routefly.kr 'sudo deluser --remove-home deploy; sudo rm -f /etc/sudoers.d/routefly-deploy /usr/local/bin/routefly-deploy /usr/local/sbin/routefly-war-install'
```
