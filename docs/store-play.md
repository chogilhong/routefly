# Google Play 올리기 (routefly 앱)

2026-11-16 홍TV님이 Play Console 조직 계정을 만듦(본인 확인 · 판매자 상태 "판매자" · 조직 웹사이트 `https://routefly.kr/` · 전화 인증 끝).
앱 만들기: 이름 `routefly(루트플라이) - 등산 · 산악회` · 기본 언어 한국어 · 앱 · 무료 · 패키지 `kr.routefly.app`(원스토어와 같음).

값의 출처는 docs/store-onestore.md(원스토어에 실제로 넣은 답)입니다. Play 에만 있는 칸은 아래 표의 "Play 만" 줄입니다.
계정 ID · 전화 · 사업자 정보 · 키 비밀번호는 이 문서에 적지 않습니다.

## 1. 순서

1. 대시보드 "앱 설정 → 할 일 보기" 의 칸을 2장 표대로 채움(홍TV님 화면, 웹 Claude 가 칸마다 안내).
2. PC Claude: AAB 빌드(versionCode 는 원스토어 다음 번호) - 서명은 원스토어 APK 와 같은 키.
   - 2026-11-17 PC 확인: build.gradle versionCode 1 · versionName "1.0"(원스토어 APK 도 1) → Play 첫 AAB 는 versionCode 2 · versionName "1.0.1"(두 스토어 번호를 한 줄로 - 다음 원스토어 판도 2 이상).
   - build.gradle 에 signingConfig 없음 → Android Studio "Generate Signed App Bundle" 로 서명(키 비밀번호는 홍TV님). 서명 키 파일은 .app-key 에 있음.
   - 원스토어 APK 는 v2 전용 서명이라 keytool -printcert 로 지문을 못 읽음 - 지문은 키 파일에서(keytool -list -v, 비밀번호 홍TV님) 또는 Play 앱 무결성 화면에서.
3. 테스트 → 내부 테스트 트랙에 첫 AAB. 이때 "Play 앱 서명" 은 "다른 키 사용 → 원스토어와 같은 키를 내보내 올리기"(PEPK).
   - 같은 키여야 산악회 방 앱 링크(서버 `app.sha256`)가 그대로 맞고, 2027 안드로이드 개발자 인증도 한 키로 끝남.
   - 구글이 새 키를 만들게 두면 Play 에서 받은 앱 지문을 `app.sha256` 에 쉼표로 더해야 함(Play Console → 테스트 및 출시 → 앱 무결성 → 앱 서명 키 인증서 SHA-256).
4. 내부 테스트로 홍TV님 폰에서 Play 판 설치 · 따라가기 · 산악회 방 확인.
5. 프로덕션 출시 요청(심사). 조직 계정이라 개인 계정의 "테스터 12명 · 14일 비공개 테스트" 는 없는 것으로 앎 - 화면에서 확인.

## 2. 앱 콘텐츠 · 스토어 등록정보에 넣을 것

| 칸 | 답 | 근거 |
|---|---|---|
| 개인정보처리방침 | https://routefly.kr/routefly/privacy.html | |
| 앱 액세스 권한(로그인 세부정보) | "예"(2026-11-16): 로그인은 없지만 산악회 방 참가에 참가 링크 · 방 코드 · QR 과 두 번째 기기가 필요 - "아니요" 면 심사가 참가 화면에 막힐 수 있음. 아이디 · 비밀번호는 비우고 안내 글은 아래 "심사 안내" | 회원 가입 없음 |
| 광고 | 예(2026-11-16 홍TV님 "쿠팡도 광고 아닌가") - 쿠팡 파트너스 추천 상품 · 숙소 제휴 링크도 다른 회사 상품 홍보, 애드센스 앱 안 광고도 넣을 예정. 광고 SDK 는 아직 없어 데이터 보안에 더할 것 없음 | docs/ads-security.md "앱 안 광고" |
| 콘텐츠 등급(IARC 설문) | 분류 "참고 자료, 뉴스 또는 교육" 이 아니라 "기타(유틸리티 · 생산성 · 커뮤니케이션 등)". 폭력 · 성 · 도박 · 약물 없음. 사용자 상호작용: 예(산악회 방 "💬 인솔자에게" 한 줄), 위치 공유: 예(산악회 방 - 인솔자에게), 디지털 구매: 아니요 | store-onestore.md 이용 등급 "전체 이용가" |
| 타겟층 | 18세 이상(권함). 13세 아래를 넣으면 가족 정책이 붙고, 14세 미만 위치정보는 법정대리인 동의가 필요 | 위치정보법 |
| 뉴스 앱 · 코로나19 · 정부 앱 · 금융 기능 · 건강 | 모두 아니요 | |
| 광고 ID | 아니요(2026-11-17) - 앱에 광고 SDK · 파이어베이스 없음, 원스토어 APK 권한에도 AD_ID 없음. 앱 안 광고(애드몹 등)를 넣는 판에서 "예" 로 바꾸고 데이터 보안에 기기 ID(광고) 더함 | app/package.json |
| 데이터 보안 | 3장 | |
| 서비스 약관(판매자) | https://routefly.kr/routefly/terms.html | 판매자 상태 "판매자" |
| 앱 카테고리(Play 만) | 여행 및 지역정보(또는 건강/운동 - 원스토어는 여행 · 지역) | |
| 연락처 | 웹사이트 https://routefly.kr, 이메일은 계정 이메일(나중에 routefly.kr 주소로 바꿀 수 있음) | |
| 짧은 설명(80자) | store-onestore.md "짧은 소개" 그대로(54자) | |
| 자세한 설명(4000자) | store-onestore.md "자세한 소개" 그대로 | |
| 아이콘 | 512×512 png - `src/main/webapp/img/icon-512.png` | |
| 그래픽 이미지(Play 만) | 1024×500 png - `docs/store/play-feature-1024x500.png`(2026-11-17, img/og.jpg 를 가로 1024 로 줄이고 위아래 여백 19px 씩 자름) | |
| AI 애셋 선언 | "AI 로 생성 또는 수정" - 앱 아이콘 · 그래픽 이미지(로고는 Claude 가 만듦, 2026-11-17 홍TV님). 화면 사진은 실제 화면이라 라벨 없음 | |
| 휴대전화 스크린샷 | 2~8장, 원스토어 화면 사진(9:16) 그대로 쓸 수 있음 | |
| 포그라운드 서비스 권한(Play 만, 화면에 나오면) | 위치(FOREGROUND_SERVICE_LOCATION): 따라가기 · 산악회 방을 켠 동안 화면이 꺼져도 코스 이탈 안내 · 인솔자에게 위치. 알림창에 "따라가는 중" · "산악회 방". 사용자가 시작하고 끝냄. 동영상 링크를 요구하면 화면 녹화(따라가기 시작 → 알림창 → 화면 끔 → 끝내기)를 올림 | store-onestore.md 권한 설명. ACCESS_BACKGROUND_LOCATION 은 없음 |
| 정확한 알람 권한(화면에 나오면) | SCHEDULE_EXACT_ALARM: 사용자가 정한 안부 · 약 알림을 그 시각에(@capacitor/local-notifications) | |

### 심사 안내(앱 액세스 권한)

Play 칸은 영어 · 500자 안(2026-11-16 - 긴 글 1128자가 막혀 줄임, 412자). 이름 `No login - group room test`, 아이디 · 비밀번호 비움, "전체 액세스 권한 제공" 체크.

```
No login or password. All features work at launch.
Test walk: pick a course, tap "시험 걷기" (no GPS needed).
Group room (2 devices): Device 1 taps "산악회 방", creates a room (any name, date 1022, time 0700, phone 010-0000-0000) and gets a 6-letter room code and join link. Device 2 (or a browser at routefly.kr/routefly/party.html) opens the link or enters the code. The leader then sees the member's location and SOS.
```

## 3. 데이터 보안(Play) - 원스토어 답을 Play 칸으로

"수집" 은 폰 밖(서버)으로 나가는 것만. 산행 기록 · 사진 · 메모 · GPX · 몸무게는 폰 안에만이라 수집 아님(privacy.html 2번).

| Play 항목 | 수집 | 공유(제3자) | 목적 | 근거 |
|---|---|---|---|---|
| 위치 - 대략 · 정확 | 예 | 아니요(인솔자에게 보이는 것은 사용자가 참가 · 동의해 보내는 것) | 앱 기능 | 산악회 방 |
| 개인 정보 - 이름 | 예(선택) | 아니요 | 앱 기능 | 산악회 방 별명 · 인솔자 이름 |
| 개인 정보 - 이메일 | 예(선택) | 아니요 | 개발자 커뮤니케이션 | 의견 보내기 답장 메일 |
| 개인 정보 - 전화번호 | 예(선택) | 아니요 | 앱 기능 | 인솔자 연락처 |
| 메시지 - 기타 인앱 메시지 | 예 | 아니요 | 앱 기능 | "💬 인솔자에게" |
| 앱 활동 - 앱 상호작용 | 예 | 아니요 | 분석 · 사기 예방 · 보안 | 서버 접속 기록(경로 · 브라우저 종류, 14 · 30일) |
| 기기 또는 기타 ID | 예 | 아니요 | 앱 기능 | 산악회 방 참가 번호(token) |
| 금융 · 건강 · 사진 · 오디오 · 파일 · 연락처 · 캘린더 · 웹 기록 · 앱 정보와 성능 | 아니요 | | | store-onestore.md 표 |

- 전송 중 암호화: 예(HTTPS 만).
- 데이터 삭제 요청: 예 - 주소 `https://routefly.kr/routefly/privacy.html#delete`(7번에 앱 이름 · 요청 단계 · 3번 보관 기간, 2026-11-17). "90일 안 자동 삭제" 는 아님(산악회 방 확인자료 200일).
- 수집이 필수인지: 위치는 산악회 방을 쓸 때만, 나머지는 선택 - "사용자가 선택 가능" 으로.
- 독립 보안 검토: 아니요.
- 국외 이전 메모(store-onestore.md): 서버는 서울. 의견 보내기 글이 가는 운영자 Gmail - Play 양식에는 국외 이전 칸이 없어 따로 적지 않음.

## 4. 지원 이메일(routefly.kr 주소로 바꿀 때)

2026-11-17 PC 확인: routefly.kr DNS 는 가비아(NS ns/ns1.gabia.co.kr · ns.gabia.net), MX 없음(메일 받는 곳 없음), TXT 에 google-site-verification 있음(지우지 않음).
Cloudflare Email Routing 은 네임서버를 Cloudflare 로 옮겨야 해서 지금은 맞지 않음. 가비아 관리 화면의 메일 포워딩(있으면) 또는 가비아 DNS 에 MX 를 넣는 무료 포워딩 서비스로
help@routefly.kr → 홍TV님 gmail. MX · SPF TXT 를 더해도 google-site-verification TXT 는 그대로 둠.

## 5. 심사에서 지적받으면

- 후원 링크: 앱 안(window.Capacitor)에서만 후원 단추를 숨김 - 서버만 고침(2026-11-16 홍TV님 "먼저 올리고 지적받으면").
