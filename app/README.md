# routefly 안드로이드 앱 (Capacitor)

서버의 routefly 화면(`hike.html`)을 앱 안에 띄우고, 웹으로 안 되던 것을 앱 기능으로 붙입니다.
웹 코드(`src/main/webapp/js/hike.js`)가 앱 안인지(`window.Capacitor`) 보고 골라 쓰므로 브라우저에서는 그대로입니다.

| 앱 기능 | 플러그인 | 웹과 다른 점 |
|---|---|---|
| 백그라운드 위치 | @capacitor-community/background-geolocation | 화면을 끄거나 주머니에 넣어도 위치 기록 · 갈림길 · 코스 이탈 안내. 알림창에 "routefly - 산행 중" 이 떠 있는 동안 |
| 음성 안내 | @capacitor-community/text-to-speech | 화면이 꺼져도 말합니다 |
| 공유 | @capacitor/share · @capacitor/filesystem | SOS 위치 사진 · GPX 를 공유 창으로(앱 안 웹뷰는 내려받기 · navigator.share 가 안 됨) |

- 앱 이름 routefly, 앱 ID `kr.routefly.app`(스토어에 올린 뒤에는 바꿀 수 없습니다 - 바꾸려면 올리기 전에)
- 배터리(2026-10-08): 앱은 산행 중 화면을 켜 두지 않습니다(브라우저와 달리 화면이 꺼져도 위치 · 음성이 이어짐). 시작할 때 "화면을 꺼 두세요" 를 알립니다.
- 사진 · 메모(📝)의 사진은 `<input type=file capture>` 로 찍습니다 - 앱 안 웹뷰에서 카메라 · 사진 고르기 창이 뜨는지 시험할 것.
- 위치 권한은 "앱 사용 중에만 허용" 이면 됩니다(앞쪽 서비스 + 알림 방식이라 "항상 허용" 이 필요 없음 - 구글 심사가 쉬움)
- 안드로이드 13+ 은 처음 열 때 알림 권한을 묻습니다("따라가는 중" 알림에 필요)

## 처음 한 번 (홍TV님 PC)

1. Android Studio 설치: https://developer.android.com/studio (기본 설정으로. SDK · 에뮬레이터가 함께 깔립니다)
2. Node.js 22 LTS 설치: https://nodejs.org (이미 있으면 생략. `node -v`)
3. 이 폴더에서
   ```
   cd C:\GH\workspace\routefly\app
   npm install
   ```

## 서버 주소 정하기

앱은 `capacitor.config.json` 의 `server.url` 을 띄웁니다. 지금은 Cloudflare 터널 주소를 넣습니다(켤 때마다 바뀜).
```
cloudflared tunnel --url http://localhost:8080        (다른 PowerShell 창에서 켜 둠)
npm run url -- https://abc-def.trycloudflare.com      (나온 주소 - 뒤에 /routefly/hike.html 이 붙고 안드로이드 프로젝트에 반영)
```
공개 서버가 생기면 그 주소를 한 번 넣으면 됩니다: `npm run url -- https://routefly.kr/routefly/hike.html`

## 핸드폰에 설치해 보기

1. 핸드폰: 설정 → 휴대전화 정보 → 소프트웨어 정보 → "빌드번호" 7번 누르기(개발자 모드) → 개발자 옵션 → "USB 디버깅" 켜기
2. 핸드폰을 USB 로 PC 에 연결(핸드폰에 뜨는 "USB 디버깅 허용" 에 확인)
3. `npm run open` → Android Studio 가 열립니다(처음에는 Gradle 준비로 몇 분)
4. 위쪽 기기 목록에서 핸드폰을 고르고 ▶(Run) → 핸드폰에 routefly 앱이 깔리고 열립니다

Android Studio 가 "Project update recommended(AGP 업그레이드)" · "Migrate to Gradle Daemon toolchain" 을 띄워도 누르지 않습니다(닫거나 Ignore).
AGP 8.13.0 · Gradle 8.14.3 은 Capacitor 8.5 가 맞춰 둔 판이라, 혼자 올리면 Capacitor · 플러그인과 어긋나 빌드가 깨질 수 있습니다.
올릴 때는 Capacitor 를 올리면서(`npx cap migrate`) 함께 올립니다.

APK 파일만 만들려면 Android Studio 메뉴 Build → Build App Bundle(s) / APK(s) → Build APK(s).
스토어용(.aab, 서명)은 Build → Generate Signed App Bundle - 서명 키(.jks)는 잃어버리면 앱을 고칠 수 없으니 따로 잘 보관합니다(저장소에 넣지 않음).

## 시험할 것

- 산행 시작 → 위치 권한 · 알림 권한 허용 → 알림창에 "routefly - 산행 중"
- 화면을 끄고 걸어도: 갈림길 · 1km · 코스 이탈 음성이 나오는지, 다시 켰을 때 진행 거리가 늘어 있는지
- SOS → 📷 위치 사진 보내기 → 공유 창 → 메시지(시험은 내 번호로)
- 끝내기 → GPX → 공유 창

## 파일

| 자리 | 내용 |
|---|---|
| `capacitor.config.json` | 앱 ID · 이름 · 서버 주소(`server.url`) · `android.useLegacyBridge`(백그라운드에서 5분 뒤 위치가 멈추지 않게) |
| `scripts/set-url.js` | `npm run url` - 서버 주소 바꾸고 `cap sync` |
| `www/index.html` | 서버에 닿지 못할 때만 보이는 화면 |
| `android/` | 안드로이드 프로젝트(`npx cap add android` 로 만든 것). 고친 곳: `MainActivity.java`(알림 권한), `res/values/strings.xml`(알림 이름 · 아이콘), `res/drawable/ic_tracking.xml`(알림 아이콘), 앱 아이콘 · 시작 화면 그림 |
