# routefly - Claude 작업 규칙

등산 · 걷기 · 자전거 코스를 3D 지형(MapLibre) 위로 날아가며 보여 주는 웹 앱과, 폰용 등산 화면(hike.html - GPS · SOS · 오프라인 PWA · GPX 기록)입니다.
Java 17(JDK 21 로 빌드) · Jakarta Servlet 6.1 war · JDBC(MariaDB `routefly`, 연결 풀은 `Db.open()` 의 MyBatis PooledDataSource) · Gson, 톰캣 11 에서 돕니다. 로그인은 없습니다.
DB 는 routefly-batch 가 채우고, 웹은 읽기만 합니다(route_course · route_course_point · route_course_poi · route_course_info · route_signpost · route_park_spot - 뒤의 셋은 표가 없으면 빼고 보냄).

## 1. 답변

- 한국어 존댓말로 답합니다. 사용자는 "홍TV님" 이라고 부릅니다.
- 마크다운 굵은 글씨(`**`)를 쓰지 않습니다. 표 · 코드 블록은 써도 됩니다.
- 낱말은 쉬운 말로: 테스트 · 테스트 데이터 · 스크립트.

## 2. 꼭 지킬 것

- 테스트 클래스 이름은 바꾸지 않습니다. 고쳐야 하면 본문만. 새 테스트 클래스는 괜찮습니다.
- 모르는 값을 지어내지 않습니다. 코드 · 실제 응답 · SQL 로 확인합니다.
- 호출하는 곳이 없는 메서드는 남기지 않습니다. 고친 뒤 되돌려 확인합니다(고친 조각을 되돌리면 그 테스트가 실제로 깨지는지).
- 지도 출처 표시를 숨기거나 지우지 않습니다. OpenStreetMap 은 ODbL 이라 "© OpenStreetMap contributors" 가 늘 보여야 합니다(README). MapLibre 는 BSD-3.
- 안전 문구(hike.js 의 `SAFETY_KEY`)를 바꾸면 키의 버전도 올립니다(README).
- 보안 · 속도 필터: `SecurityFilter`(모든 응답에 보안 헤더, /api · /s 는 IP 마다 분당 120번 남짓 제한), `GzipFilter`(/api 응답 1KB 넘으면 gzip).
  공유 링크 주소는 `site.baseUrl` 설정이 있으면 그것을, 없으면 요청의 Host 를 씁니다(X-Forwarded-Host 는 믿지 않음). 오류 응답에 내부 사정(SQL · 예외 글)을 넣지 않습니다.
- 산 높이(2026-10-16 홍TV님 - 정상 높이는 정확해야 신뢰): 화면의 100대 명산 높이는 `data/peak-elev.json` 의 elev 만 씁니다.
  기준은 ① 정상석에 새겨진 값(src "stone") ② 국토지리정보원 고시값("ngii") ③ 산림청 e-book("ebook" - src 에 없으면 이것). 고칠 때는 elev · src · _fixed(전 → 후 · 근거)를 함께.
  mountains100.json 의 height 는 GPS 높이(약 25m 높음)라 도장 자리 · 정상 자리 점검(`MountainServlet.summitOk`)에만 씁니다. 지점 · 코스 높이는 `Peaks` 가 정상 자리 + 이름이 맞을 때만 공식 값으로 바꿉니다.
- 화면 캐시: html · js · css 는 `NoStaleFilter` 가 no-cache 로 보냅니다. 서비스워커(`src/main/webapp/sw.js`)가 캐시하는 모양이 바뀌면 그 캐시 이름(rf-shell-v2 등)의 번호를 올립니다.

## 3. 테스트

- 이 PC: `.claude\run-tests.ps1 [-Only web.WebBasicsTest]` (Maven 없이 javac + JUnit 4, DB 없이 돕니다). 웹(클라우드): `LC_ALL=C.UTF-8 mvn -o test`
  (routefly 는 웹소켓을 안 써서 totonian · investing 과 달리 그대로 됩니다. 한글 파일 이름 때문에 LC_ALL 이 필요합니다).
- 전체 테스트가 모두 통과하는 것이 정상입니다(2026-10-20 기준 202건). 하나라도 실패하면 새로 깨진 것이니 고칩니다.
- 점검 단계마다 테스트 클래스를 둡니다(`CheckupStage1Test` 버그 · `CheckupStage2Test` 속도 · 호출 · `CheckupStage3Test` 화면 · 보안) - totonian 의 `VoidBulkV4435Test` 같은 방식.
- 내 기록은 IndexedDB(`rf-records`), 사진은 IndexedDB(`rf-photos`), 걷는 중 저장분은 localStorage(`rf-hike-<코스>` · `-track` · `-notes`, 하루 지나면 지움).
- course-kit.js 순수 함수는 `src/test/js/course-kit.test.js` 를 node 로 돌립니다(`CourseKitJsTest` 가 부름, node 가 없으면 건너뜀).
- 테스트 데이터는 만들거나 받으면 바로 커밋합니다.

## 4. 비밀값

- 실제 설정(`C:\GH\config\routefly\config.properties` 또는 `-Droutefly.config=`)은 저장소에 없고, 읽거나 만들지 않습니다. 예시는 `src/main/resources/config.properties.example`.
- 키: `db.url` · `db.user` · `db.password` · `map.vworld.key`(브라우저로 나가는 키) · `map.dem.url`. 키 값을 코드나 대화에 적지 않습니다.

## 5. 웹(클라우드)에서 작업할 때

- DB · 톰캣은 웹에서 닿지 않습니다. 코드 수정과 테스트까지 하고 커밋 · push 합니다.
- 배포(홍TV님 PC 에서 pull → 이클립스 F5, http://localhost:8080/routefly/)와 화면 · 로그 확인은 홍TV님 PC 의 Claude 가 합니다.
  마지막에 "홍TV님 PC 의 Claude 가 할 것" 으로 무엇을 확인하면 되는지 적어 둡니다.
  제목 줄까지 코드 블록 안에 넣어 한 번에 복사되게 합니다(2026-10-12 홍TV님).
- DB 표를 바꾸면 routefly-batch 의 `sql/route_ddl.sql` 에 남기고 "홍TV님이 실행할 것" 으로 적습니다.
- 웹 Claude 도 휴대폰 알림을 보냅니다(2026-10-11 홍TV님 요청): 몇 분 넘게 걸린 작업을 마쳤을 때, 홍TV님 결정 · 승인이 필요할 때 PushNotification 으로 한 줄(할 일부터, 200자 안). 바로 답한 짧은 일에는 보내지 않습니다.

## 6. 안드로이드 앱(app/)

- Capacitor 8. 서버의 hike.html 을 띄우고(`capacitor.config.json` 의 server.url), 앱 기능(백그라운드 위치 · 음성 · 공유)은 hike.js 가 `window.Capacitor` 가 있을 때만 씁니다. 브라우저 동작은 바뀌면 안 됩니다.
- 빌드는 홍TV님 PC 의 Android Studio 에서 합니다(클라우드에는 안드로이드 SDK 가 없음). 순서는 app/README.md.
- 서명 키(.jks) · 키 비밀번호는 저장소에 넣지 않습니다.

## 7. 관련 저장소

- routefly-batch: 코스를 만들어 DB 에 담는 배치(fxms 프레임워크 - 클라우드에서는 빌드 안 됨). 표 · 칸 이름을 바꾸면 양쪽을 함께 고칩니다.

## 8. PC 에서 작업할 때 (PC Claude)

홍TV님 PC 의 Claude 가 지킬 것입니다(2026-10-11 PC 메모에서 옮김). 웹(클라우드) Claude 는 참고만 합니다.

### 보고
- 보고 끝에 늘 "웹 Claude 에게 전할 말" 코드 블록을 붙입니다(홍TV님이 웹으로 옮겨 붙임).
- 승인 창 · 터미널 대화 상자는 PC Claude 가 볼 수 없습니다. 떴는지는 홍TV님께 묻습니다.
- 메모 · 코드 주석에 남은 "사장님" 은 예전 호칭입니다. 고치지 않습니다.
- 세션은 그 저장소 폴더에서 엽니다. `.claude/settings.json` 과 메모는 세션을 연 폴더 것만 적용됩니다.
- 몇 분 넘게 걸리는 작업(osmBike --refetch, komount, 긴 테스트 · 빌드 등)이 끝나거나 홍TV님 결정이 필요하면 PushNotification 으로 휴대폰 알림을 보냅니다. 한 줄, 할 일부터, 200자 안.
- 새 세션은 원격 제어(Remote Control)에 자동 연결되도록 데스크톱 앱 설정을 켜 둡니다(2026-10-11 홍TV님 요청).

### 승인 · 금지
- 접근할 수 있는 폴더: `C:\GH\workspace`, `C:\GH\tomcat`, `D:\nginx-1.30.5\conf`, Claude 메모 폴더.
  그 밖은 guard.ps1 훅이 막습니다(`C:\GH\config`, 배치 `deploy\conf` 의 batch.properties · databases.xml, tomcat-users.xml, Temp · AppData 등). 밖이 꼭 필요할 때만 승인을 요청합니다.
  허락 받은 폴더 밖은 이름 검색(Get-ChildItem -Recurse 등)도 하지 않습니다. 필요하면 어느 폴더를 볼지 홍TV님께 먼저 묻습니다
  (2026-10-20: 백업 zip 을 찾느라 묻지 않고 E:\ · C:\GH\ · D:\ 를 이름 검색함 - 사과하고 이 줄을 넣음).
- 읽기만 하는 명령(Get-Process, netstat 등)은 승인 없이 바로 씁니다.
- 키 · 비밀번호는 대화에 붙이지도, 입력 칸에 넣지도 않습니다(로그인 · 키 입력은 홍TV님).
- 파일 내려받기는 부탁받은 것만. 그 밖은 묻고 받습니다. 받은 압축 · 실행 파일은 새 빈 폴더에서 엽니다.
- DB 표를 지우는(DROP) 일은 먼저 홍TV님께 알립니다. DB 계정이 필요한 SQL 은 홍TV님이 실행합니다(PC Claude 는 DB 비밀번호를 못 읽음).
- push: 웹 Claude 가 부탁한 커밋(테스트 데이터 · docs 등)은 push 합니다. 그 밖에 PC 에서 고친 코드는 홍TV님께 묻고 push 합니다.
  PC 에서 고치기 전에는 fetch 로 웹 쪽 새 커밋부터 확인합니다.

### 커밋
- 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 메시지는 BOM 없는 UTF-8 임시 파일에 써서 `git commit -F` (PowerShell `Set-Content -Encoding utf8` 은 BOM 이 붙어 깨진 적 있음).
- 홍TV님 로컬 수정본은 커밋하지 않습니다(예: routefly `capacitor.settings.gradle`, `app/android/.idea`). pull 은 `--autostash`.
  `app/capacitor.config.json` 은 2026-10-20 부터 저장소 값이 운영 주소(https://routefly.kr/routefly/hike.html) - 예전 터널 주소 로컬 수정본은 `git checkout` 으로 버림.

### PC 경로 · 도구
- JDK `C:\GH\java\jdk-21\bin`, Node `C:\Program Files\nodejs` (PATH 에 없으면 `$env:Path` 를 Machine + User 로 다시 읽음).
- 톰캣(이클립스 WTP) 배포 폴더: `C:\GH\workspace\.metadata\.plugins\org.eclipse.wst.server.core\tmp0\wtpwebapps\<앱>`, 로그: `tmp0\logs\`. nginx: `D:\nginx-1.30.5\conf\nginx.conf`.
- 주소: routefly http://localhost:8080/routefly/.
- GitHub: Git Credential Manager 에 저장, `GCM_INTERACTIVE=never`.
- 셸은 Bash 대신 PowerShell(승인 줄이기), 파일 읽기 · 검색은 Read · Grep · Glob, 브라우저는 browser_batch 로 묶습니다.

### 배포 - PC Claude 가 이클립스 F5 대신 복사 배포
- `target\claude-test\main` 의 class · webapp 파일을 `wtpwebapps\<앱>` 으로 복사(robocopy /XO), 리소스(src/main/resources)도 `WEB-INF\classes` 로.
- 새 클래스만 복사하면 재로드가 안 걸립니다. 이미 로드된 설정 클래스(AppVersion · InvestingConfig · RouteflyConfig)의 시각을 바꿔 재시작을 유도합니다.
- static final 상수가 바뀌면 그 값을 쓰는 클래스도 같이 복사합니다(예: AppVersion.VERSION → AppLifecycleListener).
- `data/mountains100.json` · `peak-elev.json` · `series.json` · `park-notes.json` 은 MountainServlet 이 처음 읽은 뒤 기억해 둡니다. 이 파일만 바뀌어도 MountainServlet.class 를 다시 복사해 재로드합니다(2026-10-18 PC: 대암산 문구가 옛것으로 보였음).
- 배포 뒤 기동 로그(버전 줄 · 설정 줄)로 확인합니다. 이클립스가 동시에 반영 중이면 복사가 막힐 수 있으니 홍TV님께 Tomcat Restart 를 부탁합니다.
- 되돌려 확인을 자바 파일 `git checkout` 으로 하면 이클립스 자동 배포로 웹앱이 내려갑니다. target 아래 복사본으로 하거나 컴파일 실패로 갈음합니다.
  JS 문법은 `wtpwebapps\ROOT` 임시 폴더 + `new Function` 으로 보고 지웁니다.

### routefly 만
- 터널(cloudflared 빠른 터널, 2026-10-12 부터): `cloudflared tunnel --url http://localhost:8090`.
  - 2026-10-19 끔(홍TV님 결정): 바깥 주소는 이제 운영 서버 https://routefly.kr (docs/deploy-lightsail.md). 아래는 다시 켤 때를 위한 기록입니다.
  - 8090 은 nginx 의 터널 전용 입구(127.0.0.1 에만 엶) → 톰캣. /routefly/ · /totonian/ 열림, /investing/ 은 Basic 로그인, 그 밖 404, / 는 /routefly/ 로.
    PC 를 켤 때 nginx · 톰캣 · cloudflared 셋 다 필요(nginx 가 꺼져 있으면 터널 502).
  - 진짜 주소는 CF-Connecting-IP(set_real_ip_from 127.0.0.1) - 요청 제한 · 막기도 그 주소로.
  - 터널 요청은 https 로 들어오므로 8090 만 X-Forwarded-Proto https(2026-10-15): nginx.conf 의 `map $server_port $fwd_proto { 8090 https; default $scheme; }`
    + proxy_common.conf 의 `proxy_set_header X-Forwarded-Proto $fwd_proto;` - 공유 링크 · og 그림 주소가 https 로(site.baseUrl 이 비었을 때). 고치기 전 `.bak-20261015`.
    운영 서버는 nginx 가 TLS 를 끊어 $scheme 이 https 라 이 map 은 필요 없음.
  - 막기: `D:\nginx-1.30.5\conf\tunnel-deny.conf` 에 `deny <주소>;` → `nginx -t` → `nginx -s reload`(톰캣 · 터널은 그대로). 홍TV님이 "막아" 한 뒤에만.
  - 80 · 8090 이 같은 location 을 쓰도록 `conf/routefly-locations.conf` · `totonian-locations.conf` 를 함께 include. 고치기 전 설정 `conf/nginx.conf.bak-20261012`.
  - 웹(클라우드) Claude 도 이 주소로 화면 · API 를 봅니다(클라우드 환경 Allowed domains `*.trycloudflare.com`). 들어오는 주소는 Anthropic 160.79.104.0/21.
    터널을 끈 뒤로는 https://routefly.kr 을 봅니다(2026-10-19 Allowed domains: *.trycloudflare.com 빼고 routefly.kr 넣음 · www.routefly.kr).
- 톰캣 접속 기록(PC, 이클립스 Servers 의 server.xml AccessLogValve, 2026-10-12): `%h "%{X-Forwarded-For}i" "%{Host}i" %t "%r" %s %b`.
  터널 요청은 Host 가 *.trycloudflare.com 이고 진짜 주소는 X-Forwarded-For 맨 뒤(앞쪽은 손님이 꾸밀 수 있음). "%r" 은 ? 뒤까지 남아 PC 개발용만 -
  운영 서버는 docs/deploy-lightsail.md 의 형식(%U, ? 뒤 없음 - 개인정보처리방침 · PrivacyPolicyTest)을 씁니다.
- 터널을 다시 켜면 주소가 바뀌니 앱 주소를 바꿔 다시 깔아 줍니다.
  1. `127.0.0.1:20241/quicktunnel` 에서 새 주소 읽기
  2. `app/capacitor.config.json` 의 server.url 고치기(로컬 수정본, 커밋하지 않음)
  3. `npx cap sync android`
  4. `app\android` 에서 JAVA_HOME 을 `C:\GH\java\jdk-21` 로 두고 `gradlew installDebug` (핸드폰 USB 연결 필요). Android Studio jbr 는 2026-10 기준 JDK 25 라 Gradle 8.14 가 "Unsupported class file major version 69" 로 실패(2026-10-17 PC)
- 서버로 옮기는 순서는 `docs/deploy-lightsail.md`.
