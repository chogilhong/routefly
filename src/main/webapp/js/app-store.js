/*
 * routefly 앱 받기 안내(2026-11-10 원스토어 출시 - 홍TV님 "작업해줘": 앱으로 손님 데려오기).
 * 앱 받는 곳 주소는 여기 한 곳(RFAppStore.url) - 산악회 방 "앱으로 열기"(party.js)도 이것을 씀. 플레이스토어에 올리면 여기만 바꿈(docs/store-onestore.md 4장).
 * 화면의 [data-app-store] 칸에 한 줄 띠를 채움 - 안드로이드 브라우저(카톡 · 네이버 안 브라우저 포함)만, 앱(window.Capacitor) · 아이폰 · PC · 영어 화면은 안 보임.
 * ✕ 를 누르면 이 기기에서 30일 동안 안 보임(rf-app-get-off).
 */
(function (g) {
    var URL = "https://onesto.re/0001012263", OFF = "rf-app-get-off", DAYS = 30;

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
        box.style.cssText = "display:flex;align-items:center;gap:8px;margin:10px 0;padding:10px 12px;border:1px solid rgba(56,217,234,0.45);border-radius:12px;"
            + "background:rgba(56,217,234,0.08);font-size:14px;line-height:1.4";
        var a = document.createElement("a");
        a.href = URL;
        a.target = "_blank";
        a.rel = "noopener";
        a.style.cssText = "flex:1;color:inherit;text-decoration:none";
        a.innerHTML = "📲 <b>앱으로 쓰면 화면을 꺼도</b> 위치 · 음성 안내가 이어집니다 - <span style=\"color:#38d9ea;text-decoration:underline\">원스토어에서 '루트플라이' 받기 ›</span>";
        var x = document.createElement("button");
        x.type = "button";
        x.textContent = "✕";
        x.title = "30일 동안 안 보기";
        x.setAttribute("aria-label", x.title);
        x.style.cssText = "flex:0 0 auto;min-width:44px;min-height:44px;border:0;background:none;color:inherit;font-size:16px;cursor:pointer";
        x.addEventListener("click", function () {
            try { localStorage.setItem(OFF, String(Date.now())); } catch (e) { /* 이번만 */ }
            box.hidden = true;
        });
        box.appendChild(a);
        box.appendChild(x);
        box.hidden = false;
    }

    function run() {
        if (!wanted((g.navigator || {}).userAgent, inApp(), document.documentElement.lang, offAt(), Date.now())) return;
        Array.prototype.forEach.call(document.querySelectorAll("[data-app-store]"), fill);
    }

    g.RFAppStore = { url: URL, android: android, wanted: wanted };
    if (g.document) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run(); }
})(typeof window !== "undefined" ? window : this);
