/*
 * routefly 앱 받기 안내(2026-11-10 원스토어 출시 - 홍TV님 "작업해줘": 앱으로 손님 데려오기).
 * 앱 받는 곳 주소는 여기 한 곳(RFAppStore.url) - 산악회 방 "앱으로 열기"(party.js)도 이것을 씀. 플레이스토어에 올리면 여기만 바꿈(docs/store-onestore.md 4장).
 * 화면의 맨 앞 [data-app-store] 칸 하나에 한 줄 띠를 채움 - 안드로이드 브라우저(카톡 · 네이버 안 브라우저 포함)만, 앱(window.Capacitor) · 아이폰 · PC · 영어 화면은 안 보임.
 * ✕ 를 누르면 이 기기에서 하루만 안 보임(rf-app-get-off). 2026-11-10 홍TV님 "강요하듯이 해. 앱을 설치하라고" - 센 문구 · 큰 설치 단추 · 하루.
 */
(function (g) {
    var URL = "https://onesto.re/0001012263", OFF = "rf-app-get-off", DAYS = 1;

    function android() { return /Android/i.test((g.navigator || {}).userAgent || ""); }
    function inApp() { return !!(g.Capacitor && (!g.Capacitor.isNativePlatform || g.Capacitor.isNativePlatform())); }
    /** 순수 함수 - 띠를 보일까. ua: 브라우저 글, app: 앱 안, lang: 화면 말, off: 닫은 시각(ms, 없으면 null), now: 지금(ms). */
    function wanted(ua, app, lang, off, now) {
        if (app || lang === "en" || !/Android/i.test(ua || "")) return false;
        return !(off && now - off < DAYS * 86400000);
    }
    function offAt() { try { return +localStorage.getItem(OFF) || null; } catch (e) { return null; } }

    function fill(box) {
        box.textContent = "";
        box.className = (box.className + " rfAppGet").trim();
        box.style.cssText = "position:relative;margin:" + (box.getAttribute("data-app-store") || "12px 0") + ";padding:14px;border:2px solid #ffa94d;border-radius:14px;background:rgba(255,169,77,0.12);"
            + "font-size:15px;line-height:1.45;word-break:keep-all";   // 낱말 가운데서 안 꺾이게(2026-11-12 점검)
        var t = document.createElement("p");
        t.style.cssText = "margin:0 0 10px;padding-right:30px";   // ✕ 자리는 글에만 - 설치 단추는 띠 너비 그대로(2026-11-12 점검: 단추가 오른쪽 46px 비어 두 줄로 꺾였음)
        t.innerHTML = "⚠ <b>산에서는 routefly 앱을 설치해 쓰세요.</b><br>브라우저는 화면이 꺼지면 위치 · 길 안내 음성 · 코스 이탈 알림 · SOS 위치가 멈춥니다. 앱은 화면을 꺼도 이어집니다.";
        var a = document.createElement("a");
        a.href = URL;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "📲 원스토어에서 '루트플라이' 설치하기 ›";
        a.style.cssText = "display:block;min-height:48px;padding:12px 10px;box-sizing:border-box;line-height:1.35;text-align:center;border-radius:12px;background:#38d9ea;color:#0b1016;font-weight:bold;font-size:16px;text-decoration:none";
        var x = document.createElement("button");
        x.type = "button";
        x.textContent = "✕";
        x.title = "오늘은 안 보기";
        x.setAttribute("aria-label", x.title);
        x.style.cssText = "position:absolute;top:4px;right:2px;min-width:44px;min-height:44px;border:0;background:none;color:inherit;font-size:16px;cursor:pointer";
        x.addEventListener("click", function () {
            try { localStorage.setItem(OFF, String(Date.now())); } catch (e) { /* 이번만 */ }
            box.hidden = true;
        });
        box.appendChild(t);
        box.appendChild(a);
        box.appendChild(x);
        box.hidden = false;
    }

    function run() {
        if (!wanted((g.navigator || {}).userAgent, inApp(), document.documentElement.lang, offAt(), Date.now())) return;
        var box = document.querySelector("[data-app-store]");   // 맨 앞 칸 하나만 - 위쪽 칸이 있는 화면은 맨 아래(foot) 칸을 비워 둠(두 번 안 나오게)
        if (box) fill(box);
    }

    g.RFAppStore = { url: URL, android: android, wanted: wanted };
    if (g.document) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run(); }
})(typeof window !== "undefined" ? window : this);
