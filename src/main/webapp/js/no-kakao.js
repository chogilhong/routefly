/*
 * 카카오톡 안 브라우저로 열면 크롬(안드로이드) · 사파리(아이폰)로 옮깁니다(2026-10-24 홍TV님 - "카카오 브라우저 사용하지 않도록").
 * 2026-10-23 지리산: 카카오톡 안에서는 "GPS 신호 없음", 크롬으로 여니 바로 ±3m. 화면이 꺼지면 위치도 끊김.
 * 안드로이드는 intent 로 크롬을 바로 엽니다. 주소의 # 뒤(코스 · 방 열쇠)는 intent 에 실을 수 없어 ?rfh= 로 옮겼다가 크롬에서 되돌립니다.
 * <head> 에서 다른 스크립트보다 먼저 읽습니다(되돌린 # 을 화면 스크립트가 읽게).
 */
(function () {
    function safeDecode(v) { try { return decodeURIComponent(v); } catch (e) { return ""; } }
    var ua = navigator.userAgent || "";
    // 크롬에서 열린 뒤 - ?rfh= 를 # 으로 되돌림
    var m = /[?&]rfh=([^&]*)/.exec(location.search);
    if (m && /^#[A-Za-z0-9=_-]{1,80}$/.test(safeDecode(m[1]))) {   // # 뒤 조각만 되돌림(다른 주소 · 경로로 바꾸지 못하게, 2026-10-29 점검)
        var rest = location.search.replace(/([?&])rfh=[^&]*&?/, "$1").replace(/[?&]$/, "");
        try { history.replaceState(null, "", location.pathname + rest + decodeURIComponent(m[1])); } catch (e) { /* 그대로 */ }
    }
    if (!/KAKAOTALK/i.test(ua)) return;
    var android = /Android/i.test(ua), en = /[?&]lang=en/.test(location.search);
    var q = location.search + (location.hash ? (location.search ? "&" : "?") + "rfh=" + encodeURIComponent(location.hash) : "");
    var chrome = "intent://" + location.host + location.pathname + q + "#Intent;scheme=https;package=com.android.chrome;end";
    var go = android ? chrome : "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
    var where = android ? (en ? "Chrome" : "크롬") : (en ? "Safari" : "사파리");
    var office = /party-office\.html$/.test(location.pathname);   // 회사 사무실(2026-10-29) - 위치 대신 즐겨찾기 · 엑셀 이야기
    // 회사 사무실 - 안드로이드는 앱이 깔려 있으면 앱으로, 없으면 크롬으로(2026-10-29 홍TV님).
    // 앱이 없거나 사무실 링크를 모르는 옛 앱이면 S.browser_fallback_url(&rfapp=0)로 이 화면이 카톡에서 다시 열리고, 그때는 크롬으로 넘김.
    // # 뒤 열쇠는 intent 에 실을 수 없어 S.rf_office 로(MainActivity.openLink 가 #k= 로 되돌림)
    var app = android && office && !/[?&]rfapp=0/.test(location.search);
    if (app) {
        // 사무실 하나(#k=) 또는 여럿(#ks=열쇠.열쇠 - 2026-10-30 "이 기기의 사무실 모두"). 여럿은 새 앱(MainActivity 가 점 든 값을 #ks= 로)만 받음
        var k = /^#ks?=([A-Za-z0-9_.-]{20,700})$/.exec(location.hash || "");
        var b = /^#b=([A-Za-z0-9_-]{20,64})$/.exec(location.hash || "");   // 내 사무실 묶음(2026-10-30) - 묶음을 아는 새 앱만 S.rf_bundle 을 받음
        // 앱 링크는 routefly.kr 만(www 로 와도) · 영어 등 주소의 ? 뒤도 함께(rfh · rfapp 빼고, 2026-10-29 점검)
        var keep = location.search.replace(/([?&])(rfh|rfapp)=[^&]*/g, "$1").replace(/[?&]+/g, function (x, i) { return i ? "&" : "?"; }).replace(/[?&]$/, "");
        go = "intent://" + location.host.replace(/^www\./, "") + location.pathname + keep + "#Intent;scheme=https;package=kr.routefly.app;" + (k ? "S.rf_office=" + k[1] + ";" : "") + (b ? "S.rf_bundle=" + b[1] + ";" : "")
            + "S.browser_fallback_url=" + encodeURIComponent(location.origin + location.pathname + q + (q ? "&" : "?") + "rfapp=0") + ";end";
    }
    function cover() {
        var d = document.createElement("div");
        d.setAttribute("role", "dialog");
        d.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0f1720;color:#e9eef4;display:flex;flex-direction:column;justify-content:center;padding:24px;font:16px/1.6 sans-serif;text-align:center";
        d.innerHTML = app
            ? "<p style='font-size:20px;font-weight:bold;margin:0 0 12px'>" + (en ? "Opening the routefly app" : "routefly 앱으로 여는 중") + "</p><p style='margin:0 0 20px'>" + (en ? "No app? It opens in Chrome." : "앱이 없으면 크롬으로 열립니다.") + "</p>"
            + "<a id='rfGo' style='display:block;padding:14px;border-radius:12px;background:#22b8cf;color:#06222a;font-weight:bold;text-decoration:none;font-size:18px'>" + (en ? "📱 Open in app" : "📱 앱으로 열기") + "</a>"
            + "<a id='rfChrome' style='display:block;margin-top:12px;padding:14px;border-radius:12px;border:1px solid #22b8cf;color:#22b8cf;font-weight:bold;text-decoration:none;font-size:18px'>" + (en ? "Open in Chrome" : "크롬으로 열기") + "</a>"
            : en
            ? "<p style='font-size:20px;font-weight:bold;margin:0 0 12px'>Open in " + where + "</p><p style='margin:0 0 20px'>KakaoTalk's built-in browser often can't get your location and stops when the screen turns off. routefly works in " + where + ".</p>"
            + "<a id='rfGo' style='display:block;padding:14px;border-radius:12px;background:#22b8cf;color:#06222a;font-weight:bold;text-decoration:none;font-size:18px'>Open in " + where + "</a>"
            + "<p style='margin:20px 0 0;color:#9fb0c0;font-size:14px'>If it doesn't open: tap ⋮ (top right) → 'Open in another browser'.</p>"
            : "<p style='font-size:20px;font-weight:bold;margin:0 0 12px'>" + where + "(으)로 열어 주세요</p><p style='margin:0 0 20px'>" + (office ? "회사 사무실은 " + where + "에서 씁니다. 즐겨찾기 · 엑셀 내려받기도 " + where + "에서 하세요." : "카카오톡 안 화면은 위치를 잘 받지 못하고, 화면이 꺼지면 위치가 끊깁니다. routefly 는 " + where + "에서 씁니다.") + "</p>"
            + "<a id='rfGo' style='display:block;padding:14px;border-radius:12px;background:#22b8cf;color:#06222a;font-weight:bold;text-decoration:none;font-size:18px'>" + where + "(으)로 열기</a>"
            + "<p style='margin:20px 0 0;color:#9fb0c0;font-size:14px'>안 열리면: 오른쪽 위 ⋮ (또는 ∨) → '다른 브라우저로 열기'</p>";
        document.body.appendChild(d);
        document.getElementById("rfGo").href = go;
        if (app) document.getElementById("rfChrome").href = chrome;
    }
    if (document.body) cover(); else document.addEventListener("DOMContentLoaded", cover);
    window.RF_INAPP = true;
    location.href = go;
})();
