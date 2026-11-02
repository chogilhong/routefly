/*
 * 따라가기(hike.html) <head> 에서 먼저 - 코스 없이 열면 첫 그림부터 코스 고르기(html.picking, 2026-10-11 잔상).
 * 화면 안 스크립트(inline)를 없애 CSP script-src 'self' 로 막을 수 있게 따로 둡니다(2026-10-11 오픈 전 점검).
 */
if (!/[#&]c=/.test(location.hash)) document.documentElement.className += " picking";

/*
 * 지도 설정(api/map-config)은 여기서 미리 묻기 시작(2026-11-02 홍TV님 속도 점검) - hike.js 는 맨 아래 스크립트라 MapLibre(약 330KB)까지
 * 다 받은 뒤에야 돌아, 그때 물으면 느린 망(4G 약함)에서 지도 · 첫 타일이 1초 가까이 늦었음. 답은 hike.js 가 한 번 읽음(readJson).
 * 못 받으면 hike.js 가 예전처럼 기본 지형으로. 여기서는 오류 알림만 막음(.catch - 같은 약속을 hike.js 가 그대로 받음)
 */
function rfMapCfgEarly() {
    if (!window.fetch || window.rfMapCfg) return;
    window.rfMapCfg = fetch("api/map-config", { headers: { "Accept": "application/json" } });
    window.rfMapCfg.catch(function () { /* hike.js 가 처리 */ });
}

/*
 * 앱을 처음 열면 코스 모음(m/)으로(2026-11-01 홍TV님). 앱은 이 화면(hike.html)으로 열리는데, 아래일 때만 넘김:
 *  - 앱 안(Capacitor)이고 이번 앱 실행에서 처음 연 화면(sessionStorage - 코스 모음의 "따라가기 ›" 로 온 것은 그대로)
 *  - 주소에 코스 · 꼬리(#c= · ?…)가 없고, 진행 중인 산행이 없음(rf-hike-active - 3시간 안 저장)
 *  - 서버에 실제로 닿음 - 앱 웹뷰의 navigator.onLine 은 네트워크 상태 권한이 없으면 비행기 모드에도 늘 true 라(2026-11-01 홍TV님 폰)
 *    서비스 워커를 거치지 않는 HEAD(sw.js 는 GET 만 받음)로 2.5초 안에 답이 오는지 봄. 그동안 화면은 잠깐 가림(html.rfwait)
 * 신호 없는 산속 · 산행 중에는 지금처럼 따라가기(폰에 저장된 화면). location.replace 라 뒤로 가기에 이 화면이 남지 않음.
 */
(function () {
    var root = document.documentElement;
    // 코스 모음으로 넘길 수도 있는 동안은 지도 설정을 미리 묻지 않음 - 남으면(show) 그때 물음(2026-11-02 홍TV님 점검: 넘어갈 화면에서 헛걸음)
    function show() { root.className = root.className.replace(/\s*\brfwait\b/g, ""); rfMapCfgEarly(); }
    try {
        if (!window.Capacitor || sessionStorage.getItem("rf-app-opened")) return rfMapCfgEarly();
        sessionStorage.setItem("rf-app-opened", "1");
        if (location.hash || location.search || navigator.onLine === false || !window.fetch) return rfMapCfgEarly();
        var act = localStorage.getItem("rf-hike-active"), sv = act && JSON.parse(localStorage.getItem("rf-hike-" + act) || "null");
        if (sv && sv.t && Date.now() - sv.t < 3 * 3600 * 1000) return rfMapCfgEarly();
        root.className += " rfwait";
        var done = false, ctl = window.AbortController ? new AbortController() : null;
        var timer = setTimeout(function () { done = true; if (ctl) ctl.abort(); show(); }, 2500);
        fetch("sw.js", { method: "HEAD", cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
            if (done) return;
            done = true; clearTimeout(timer);
            if (r && r.ok) location.replace("m/"); else show();
        }, function () { if (!done) { done = true; clearTimeout(timer); show(); } });
    } catch (e) { show(); }
})();
