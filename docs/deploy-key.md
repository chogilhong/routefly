# 배포 전용 열쇠 (2026-10-27 홍TV님)

밖에서도 "배포해" 한 마디로 운영에 war 를 올릴 수 있게, 서버에 war 바꾸기만 되는 계정(deploy)과 열쇠를 따로 둡니다.
메인 열쇠(ubuntu, `C:\GH\config\routefly\*.pem`)는 그대로 홍TV님만 씁니다.

## 무엇이 되고 무엇이 안 되나

- 이 열쇠로 들어오면 `/usr/local/bin/routefly-deploy` 만 돕니다(authorized_keys 의 `restrict,command=`). 셸 · 파일 보기 · 터널 · scp 는 안 됩니다.
- 받는 명령은 셋: `deploy`(표준 입력의 war 를 운영으로), `rollback`(바로 앞 war 로), `status`(지금 · 앞 war, 최근 기록 5줄).
- 배치(2026-11-04 홍TV님 "폰에서 PC Claude 에게 배치 배포") - 아래 "배치" 장: `batch-deploy` · `batch-rollback` · `batch-sql` · `batch-run <배치> [--force] [--allowDelete=N]` · `batch-status [<배치>]` · `batch-log <배치> <낱말>`.
- `deploy` 는 1MB ~ 100MB 이고, zip 이 온전하고, `WEB-INF/classes/com/gh/routefly/web/RouteflyConfig.class` 가 들어 있어야 받습니다.
  바꾸기 전 war 는 `/var/backups/routefly-war/routefly.war.prev` 에 남기고, 기록은 `/var/log/routefly-deploy.log`(시각 · 크기 · sha256 앞 12자, 시각은 한국 시간 - 2026-10-27 확인, 앞서 UTC 로 적은 것은 잘못).
- root 로 도는 부분은 `/usr/local/sbin/routefly-war-install` 하나이고, sudoers 는 deploy 계정에 그 파일만 허용합니다.
- 받은 파일은 처음에 한 번만 열어(바로 가기 링크 · 보통 파일이 아닌 것 · deploy 것이 아닌 것은 거절) root 만 닿는 임시 폴더로 베끼고, 검사 · 설치는 베낀 것만 씁니다(2026-11-02 홍TV님 점검 - 검사한 뒤 바꿔치기 막기).
- 톰캣 폴더(webapps · tomcat 계정 것)의 routefly.war · 되돌릴 war 가 바로 가기 링크면 거절하고, war 를 남기거나 바꿀 때는 링크를 따라가지 않고(O_NOFOLLOW)
  같은 폴더에 새로 만든 임시 파일(O_EXCL)에 써서 fsync 뒤 이름만 바꿉니다. 되돌리기도 앞 war 가 온전한 routefly war 인지 다시 봅니다(2026-11-03 홍TV님 보안 점검).
- sshd 설정에도 두 번째 잠금(`/etc/ssh/sshd_config.d/routefly-deploy.conf` - Match User deploy: ForceCommand · 터널 · 화면 없음, `sshd -t` 가 통과할 때만, 2026-11-03).
  이 스크립트를 고친 뒤에는 서버에 아래 "서버에 설치" 를 한 번 다시 해야 바뀝니다(2026-11-03 판도 다시 설치 필요).
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

## 배치 (2026-11-04)

메인 열쇠 없이 배치 jar 를 올리고 배치 하나를 돌립니다. PC 에서는 routefly-batch 저장소의 `bin\deploy-batch.ps1` 이 이 명령들을 부릅니다.

```
powershell -NoProfile -ExecutionPolicy Bypass -File C:\GH\workspace\routefly-batch\bin\deploy-batch.ps1 -Batches forestTrail
  -NoUpload(돌리기만) · -Force · -AllowDelete N(홍TV님 승인 뒤, 배치 하나일 때만) · -Status forestTrail · -Rollback
```

- `batch-deploy`: 표준 입력의 jar(10KB ~ 50MB, zip 이 온전하고 `com/gh/routefly/batch/RouteflyBatch.class` 가 있어야)를
  `/app/routefly/batch/deploy/lib/routefly-batch.jar`(root:routefly 640, 9-2 · 9-4 와 같게)로. 앞 jar 는 `/var/backups/routefly-war/routefly-batch.jar.prev`.
  `/app/routefly/batch` 아래는 routefly 계정 것이라 폴더를 / 부터 한 칸씩 링크를 따라가지 않고 엽니다(배치가 뚫려 폴더를 링크로 바꿔 둬도 다른 곳에 쓰지 않게).
- `batch-sql`(2026-11-12 - jar 만 올라가고 서버 쿼리 XML 이 옛것이라 forestTrail 이 26분 뒤 `QID(SELECT_COURSE_ENDS_LIKE) NOT FOUND` 로 실패):
  표준 입력의 zip(2MB 안) 안 `sql/<영역>/<이름>.xml` 만 `/app/routefly/batch/deploy/conf/sql/<영역>/<이름>.xml`(root:routefly 640)로.
  다른 이름 · `..` · 링크 · DOCTYPE · ENTITY · 깨진 XML · 1MB 넘는 파일이 하나라도 있으면 통째로 거절(끝 코드 3). 영역 폴더가 없으면 root:routefly 750 으로 만들고,
  있는 폴더가 링크면 거절. 앞 파일은 `/var/backups/routefly-war/batch-sql/<영역>.<이름>.prev`(root 600). jar 처럼 실행되는 것을 이미 올리는 열쇠라 할 수 있는 일이 늘지는 않음.
  모두 되거나 하나도 안 됨(2026-11-12 보안 점검 - 반쯤 바뀐 XML 묶음이 QID NOT FOUND 를 다시 내지 않게): 모든 영역 폴더 확인 · 앞 것 · 새 것을 같은 폴더 임시 파일에 다 쓴 뒤에야
  이름만 한꺼번에 바꾸고, 그 전에 하나라도 실패하면 임시 파일 · 새로 만든 폴더를 지우고 끝 코드 3(아무것도 안 바뀜, 앞 것 .prev 도 그대로). 이름 바꾸는 중 드물게 실패하면 끝 코드 5(바꾼 것은 앞 내용으로 되돌려 봄).
  정기 회차나 손 실행이 돌면 거절(끝 코드 4, batch-run 과 같음). 두 번 겹쳐 올리면 뒤의 것은 기다리지 않고 거절(끝 코드 4, `/var/backups/routefly-war/batch-sql.lock` 잠금).
  기록의 크기 · 지문은 설치한 경로를 다시 열지 않고 쓴 내용에서 냄(root 가 routefly 폴더의 바꿔치기 링크를 따라 읽지 않게).
  `deploy-batch.ps1` 은 jar 를 올리기 전에 이것부터 올림(새 XML 은 쿼리를 더하기만 해 옛 jar 와도 돎). 이 명령이 없는 서버면 끝 코드 2 - 아래 "처음 한 번" 처럼 다시 설치.
- `batch-run`: 배치 이름은 9개만(courseImport · forestTrail · durunubi · osmBike · osmHike · komount · knpsTrail · knpsSign · knpsSpot), 선택은 `--force` · `--allowDelete=숫자` 만.
  정기 회차(routefly-batch.service)나 다른 손 실행이 돌면 거절(끝 코드 4). 뒤에서 `routefly-once-<배치>` 단위로 돌고(ssh 는 바로 돌아옴),
  도는 동안 정기 타이머를 멈췄다가 끝나면 다시 켭니다(bin/server-forest-force.ps1 과 같게). 배치는 routefly 계정으로.
- `batch-status`: 지금 · 앞 jar 지문, 정기 회차 · 손 실행이 도는지, 배치를 주면 그 로그 끝 20줄(routefly 계정으로 읽음), 최근 기록 5줄.
- `batch-log <배치> <낱말>`(2026-11-04 PC 부탁): 그 배치 오늘 로그에서 낱말(한글 · 영문 · 숫자 · . _ - 만, 30자 안, 글자 그대로 찾음)이 든 줄 끝 40개.
  PC 는 `-Status <배치> -Find <낱말>`(ASCII 낱말만 - 산 코드 317100501 · 코스 ID). 이 명령은 "서버에 설치" 를 한 번 더 해야 생깁니다.
- 기록은 war 와 같은 `/var/log/routefly-deploy.log`("배치 jar …" · "배치 시작 …" · "배치 끝 … 끝 코드 N").
- 처음 한 번: 위 "서버에 설치" 를 다시 하면 됩니다(같은 열쇠 그대로 - 스크립트 두 개만 바뀜).

## 없애기 (홍TV님, 메인 열쇠로)

```
ssh -i "C:\GH\config\routefly\LightsailDefaultKey-ap-northeast-2.pem" ubuntu@routefly.kr 'sudo deluser --remove-home deploy; sudo rm -f /etc/sudoers.d/routefly-deploy /usr/local/bin/routefly-deploy /usr/local/sbin/routefly-war-install /etc/ssh/sshd_config.d/routefly-deploy.conf && sudo systemctl reload ssh'
```
