/*
 * 카카오톡 안 브라우저로 열면 크롬(안드로이드) · 사파리(아이폰)로 옮깁니다(2026-10-24 홍TV님 - "카카오 브라우저 사용하지 않도록").
 * 2026-10-23 지리산: 카카오톡 안에서는 "GPS 신호 없음", 크롬으로 여니 바로 ±3m. 화면이 꺼지면 위치도 끊김.
 * 안드로이드는 intent 로 크롬을 바로 엽니다. 주소의 # 뒤(코스 · 방 열쇠)는 intent 에 실을 수 없어 ?rfh= 로 옮겼다가 크롬에서 되돌립니다.
 * <head> 에서 다른 스크립트보다 먼저 읽습니다(되돌린 # 을 화면 스크립트가 읽게).
 */
(function () {
    var ua = navigator.userAgent || "";
    // 크롬에서 열린 뒤 - ?rfh= 를 # 으로 되돌림
    var m = /[?&]rfh=([^&]*)/.exec(location.search);
    if (m) {
        var rest = location.search.replace(/([?&])rfh=[^&]*&?/, "$1").replace(/[?&]$/, "");
        try { history.replaceState(null, "", location.pathname + rest + decodeURIComponent(m[1])); } catch (e) { /* 그대로 */ }
    }
    if (!/KAKAOTALK/i.test(ua)) return;
    var android = /Android/i.test(ua), en = /[?&]lang=en/.test(location.search);
    var q = location.search + (location.hash ? (location.search ? "&" : "?") + "rfh=" + encodeURIComponent(location.hash) : "");
    var go = android ? "intent://" + location.host + location.pathname + q + "#Intent;scheme=https;package=com.android.chrome;end"
        : "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
    var where = android ? (en ? "Chrome" : "크롬") : (en ? "Safari" : "사파리");
    function cover() {
        var d = document.createElement("div");
        d.setAttribute("role", "dialog");
        d.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0f1720;color:#e9eef4;display:flex;flex-direction:column;justify-content:center;padding:24px;font:16px/1.6 sans-serif;text-align:center";
        d.innerHTML = en
            ? "<p style='font-size:20px;font-weight:bold;margin:0 0 12px'>Open in " + where + "</p><p style='margin:0 0 20px'>KakaoTalk's built-in browser often can't get your location and stops when the screen turns off. routefly works in " + where + ".</p>"
            + "<a id='rfGo' style='display:block;padding:14px;border-radius:12px;background:#22b8cf;color:#06222a;font-weight:bold;text-decoration:none;font-size:18px'>Open in " + where + "</a>"
            + "<p style='margin:20px 0 0;color:#9fb0c0;font-size:14px'>If it doesn't open: tap ⋮ (top right) → 'Open in another browser'.</p>"
            : "<p style='font-size:20px;font-weight:bold;margin:0 0 12px'>" + where + "(으)로 열어 주세요</p><p style='margin:0 0 20px'>카카오톡 안 화면은 위치를 잘 받지 못하고, 화면이 꺼지면 위치가 끊깁니다. routefly 는 " + where + "에서 씁니다.</p>"
            + "<a id='rfGo' style='display:block;padding:14px;border-radius:12px;background:#22b8cf;color:#06222a;font-weight:bold;text-decoration:none;font-size:18px'>" + where + "(으)로 열기</a>"
            + "<p style='margin:20px 0 0;color:#9fb0c0;font-size:14px'>안 열리면: 오른쪽 위 ⋮ (또는 ∨) → '다른 브라우저로 열기'</p>";
        document.body.appendChild(d);
        document.getElementById("rfGo").href = go;
    }
    if (document.body) cover(); else document.addEventListener("DOMContentLoaded", cover);
    window.RF_INAPP = true;
    location.href = go;
})();
