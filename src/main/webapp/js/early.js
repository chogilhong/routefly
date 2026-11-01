/*
 * 따라가기(hike.html) <head> 에서 먼저 - 코스 없이 열면 첫 그림부터 코스 고르기(html.picking, 2026-10-11 잔상).
 * 화면 안 스크립트(inline)를 없애 CSP script-src 'self' 로 막을 수 있게 따로 둡니다(2026-10-11 오픈 전 점검).
 */
if (!/[#&]c=/.test(location.hash)) document.documentElement.className += " picking";

/*
 * 앱을 처음 열면 코스 모음(m/)으로(2026-11-01 홍TV님). 앱은 이 화면(hike.html)으로 열리는데, 아래일 때만 넘김:
 *  - 앱 안(Capacitor)이고 이번 앱 실행에서 처음 연 화면(sessionStorage - 코스 모음의 "따라가기 ›" 로 온 것은 그대로)
 *  - 주소에 코스 · 꼬리(#c= · ?…)가 없고, 신호가 있고(navigator.onLine), 진행 중인 산행이 없음(rf-hike-active - 3시간 안 저장)
 * 신호 없는 산속 · 산행 중에는 지금처럼 따라가기(폰에 저장된 화면). location.replace 라 뒤로 가기에 이 화면이 남지 않음.
 */
(function () {
    try {
        if (!window.Capacitor || sessionStorage.getItem("rf-app-opened")) return;
        sessionStorage.setItem("rf-app-opened", "1");
        if (location.hash || location.search || navigator.onLine === false) return;
        var act = localStorage.getItem("rf-hike-active"), sv = act && JSON.parse(localStorage.getItem("rf-hike-" + act) || "null");
        if (sv && sv.t && Date.now() - sv.t < 3 * 3600 * 1000) return;
        location.replace("m/");
    } catch (e) { /* 그대로 따라가기 */ }
})();
