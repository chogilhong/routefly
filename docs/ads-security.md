# 광고(애드센스)와 이 기기에 남긴 열쇠 (2026-11-02 홍TV님 점검 메모)

코드는 바꾸지 않은 메모입니다. 애드센스를 실제로 켜기(설정 `adsense.client` · `adsense.slot.*`) 전에 읽어 주세요.

## 무엇이 걱정인가

- 광고 스크립트(`pagead2.googlesyndication.com/…/adsbygoogle.js`)는 `js/ads.js` 가 산 · 코스 소개 페이지, 도구(tools.html), 도장(series.html)에 넣습니다.
  이 스크립트는 우리 페이지 안(같은 출처 `routefly.kr`)에서 돌아, 그 페이지에서 `localStorage` 를 읽을 수 있습니다.
- 같은 출처의 `localStorage` 에는 산악회 방 열쇠가 남습니다.
  - `rf-party` - 참가한 방의 열쇠(토큰). 이 값이 있으면 그 방에 그 사람으로 위치 · SOS 를 보낼 수 있음(js/party-kit.js)
  - `rf-office-keys` · `rf-office-bundle` - 산악회 사무실 열쇠(js/party-office.js). 사무실이 맡은 방을 볼 수 있음
- 따라가기 · 산악회 방 화면에는 광고를 넣지 않지만(ads.js 머리말), 저장소(localStorage)는 화면이 아니라 출처마다 하나라 광고가 있는 페이지에서도 읽힙니다.
  구글 광고 스크립트가 일부러 읽을 일은 없겠지만, 광고 경로(제3자 광고 · 스크립트 변조)를 믿어야 하는 자리가 생깁니다.

## 권하는 것 (광고를 켜기 전에 하나)

1. 방 · 사무실 열쇠를 `sessionStorage` 로 옮기기 - 탭을 닫으면 잊으니 "이 기기에서 다시 열기" 가 필요합니다(방 코드 · 사무실 링크로 다시 들어옴).
   이미 사무실 화면은 탭마다 `sessionStorage`(rf-office-key)를 함께 씁니다.
2. 광고를 다른 출처의 iframe 안에 넣기 - 예: `ads.routefly.kr` 에 광고만 있는 작은 페이지를 두고 산 페이지는 `<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" src="https://ads.routefly.kr/…">` 로 부름.
   출처가 달라 광고 스크립트가 `routefly.kr` 의 저장소를 읽지 못합니다(애드센스 정책상 iframe 광고 허용 여부는 켜기 전에 확인).
3. 그대로 켠다면 - 방 열쇠가 쓸모 있는 때를 짧게 둡니다(방이 끝나면 이 기기에서 지움 - 지금처럼). 사무실 열쇠는 오래 쓰니 1 · 2번을 권합니다.

어느 쪽으로 할지는 홍TV님이 정합니다. 정하면 웹 Claude 에게 "광고 열쇠 분리 - 1번(또는 2번)으로" 라고 전해 주세요.

## 앱 안 광고 - 웹뷰용 광고로 하기로 함(2026-11-08 홍TV님 "2번으로. 지금은 말고")

지금은 하지 않습니다. 정한 것만 적어 둡니다.

- 지금: 앱(Capacitor 웹뷰)이면 `js/ads.js` 가 광고 칸을 지움. 등록 없이 웹뷰에서 애드센스를 보이면 구글 정책 위반이 될 수 있어서.
- 할 때: 구글 "WebView API for Ads" - 앱에 Google Mobile Ads SDK 를 넣고 웹뷰를 `MobileAds.registerWebView(webView)` 로 등록하면,
  산 · 코스 페이지의 애드센스 칸이 앱 안에서도 정식으로 나오고 수익도 잡힘. 애드몹 배너(앱 코드로 따로 자리)는 쓰지 않음 - 앱은 따라가기가 대부분이라 안전 화면에 광고가 끼게 됨.
- 언제: 애드센스 승인 뒤, 원스토어 첫 판(광고 없음)이 나간 다음 앱 판에서.
- 그때 할 일
  1. app/android: Mobile Ads SDK 의존성, MainActivity 에서 브리지 웹뷰 등록, 매니페스트 메타데이터(공식 문서대로 - 애드몹 앱 ID 또는 웹뷰 전용 설정). 앱 다시 빌드 · 올리기(versionCode +1).
  2. js/ads.js: "앱이면 지움" 을 "등록된 앱이면 보임" 으로(앱이 알려 주는 표시를 보고 - 옛 앱은 그대로 지움).
  3. 따라가기 · 산악회 방 · 사무실 · SOS 화면에는 광고를 넣지 않는 규칙 그대로(ads.js 를 그 화면에 넣지 않음).
  4. 스토어 정보 "광고 포함" 켜기(원스토어 · 플레이), 개인정보처리방침 10번에 앱 안 광고 한 줄, 위 "무엇이 걱정인가"(같은 출처 localStorage)도 다시 봄.
  5. 동의: 웹뷰 안 광고 동의는 웹 쪽에서 받아야 함(앱에서 받은 동의가 넘어가지 않음 - 공식 문서).
- 출처: [Integrate the WebView API for Ads](https://developers.google.com/admob/android/browser/webview/api-for-ads) · [Ad Manager 판](https://developers.google.com/ad-manager/mobile-ads-sdk/android/browser/webview/api-for-ads)
