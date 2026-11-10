/*
 * 앱 접근권한 사전 안내(2026-11-10 원스토어 검증 의견 "접근권한(위치)을 요구하나 이용자에게 사전 고지 및 동의 절차가 구현되어 있지 않습니다"
 * - 정보통신망법 제22조의2 · 방송미디어통신위원회 앱 접근권한 안내서).
 * routefly 안드로이드 앱(window.Capacitor) 안에서만, 이 기기에서 처음 한 번 - 위치 · 알림 같은 권한을 묻기 전에 무엇을 왜 쓰는지 알리고 "확인" 을 받음.
 * 앱이 처음 열 수 있는 화면(따라가기 · 산악회 방 · 회사 사무실 · 안부 · 별거별거)에 넣음. 브라우저 화면은 바뀌지 않음.
 * 실제 동의는 안드로이드 권한 창(따라가기 시작 · 내 주변 · 산악회 참가 · 알림을 켤 때)이 받고, 이 창은 그 앞의 고지.
 * 글은 원스토어 판매정보 권한설명 · docs/store-onestore.md 3장 "권한 설명" 과 같게 - 권한이 바뀌면 셋을 함께 고치고 KEY 판 번호를 올림.
 */
(function (g) {
    var KEY = "rf-app-perm-1";

    function isApp() { return !!(g.Capacitor && (!g.Capacitor.isNativePlatform || g.Capacitor.isNativePlatform())); }
    function seen() {
        try { return localStorage.getItem(KEY) === "1"; } catch (e) { return false; }   // 저장소를 못 쓰면 매번 알림(고지가 빠지는 것보다 나음)
    }
    function en() { return document.documentElement.lang === "en"; }

    var KO = {
        title: "앱 접근권한 안내",
        lead: "routefly 는 아래 기능을 쓸 때만 해당 권한을 묻습니다. 모두 선택 접근권한이라, 허용하지 않아도 코스 찾기 · 보기 등 기본 기능은 쓸 수 있습니다.",
        head: "선택 접근권한",
        rows: [
            ["위치(정확한 · 대략적인 위치)", "따라가기에서 내 위치 · 코스 이탈 안내, 산악회 방에 참가했을 때 인솔자에게 내 위치(회사가 올린 방이면 그 회사 사무실도)"],
            ["화면이 꺼진 동안 위치", "따라가기 · 산악회 방을 켠 동안만(알림창에 표시). 끝내거나 하산 탑승하면 멈춤"],
            ["알림", "화면이 꺼진 동안 위치를 쓰는 알림, 산행 안전 · 산악회 방 · 안부 · 약 알림"],
            ["정한 시각 알림", "사용자가 정한 안부 · 약 알림을 그 시각에(폰을 껐다 켜도 다시 맞춤)"],
            ["NFC", "산악회 버스 안 스티커를 찍어 출발 탑승"]
        ],
        basic: "인터넷 · 진동 · 화면 깨우기는 따로 묻지 않는 기본 기능입니다.",
        change: "권한은 휴대폰 설정 → 애플리케이션 → routefly → 권한에서 언제든 바꾸거나 거둘 수 있습니다.",
        privacy: "개인정보처리방침",
        ok: "확인"
    };
    var EN = {
        title: "App permissions",
        lead: "routefly asks for each permission only when you use the feature below. All are optional - you can still find and view trails without them.",
        head: "Optional permissions",
        rows: [
            ["Location (precise · approximate)", "Your position and off-route alerts while following a trail; your position to the leader when you join a club room (and the company office if the room was posted by one)"],
            ["Location while the screen is off", "Only while following a trail or in a club room (shown in the notification bar). Stops when you finish or board the bus home"],
            ["Notifications", "The location notice above, hiking safety, club room, check-in and medicine reminders"],
            ["Exact-time alarms", "Check-in and medicine reminders at the time you set (re-set after a reboot)"],
            ["NFC", "Tap the sticker on the club bus to check in"]
        ],
        basic: "Internet, vibration and keeping the phone awake are basic functions that are not asked separately.",
        change: "You can change or withdraw permissions any time in phone Settings → Apps → routefly → Permissions.",
        privacy: "Privacy policy",
        ok: "OK"
    };

    function show() {
        var t = en() ? EN : KO;
        var before = document.activeElement;
        var back = document.createElement("div");
        back.id = "rfAppPerm";
        back.setAttribute("role", "dialog");
        back.setAttribute("aria-modal", "true");
        back.setAttribute("aria-labelledby", "rfAppPermT");
        back.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:16px";
        var box = document.createElement("div");
        box.style.cssText = "max-width:440px;width:100%;max-height:100%;overflow:auto;background:#1b222c;color:#e9eef4;border-radius:14px;padding:18px 16px;"
            + "font:15px/1.5 system-ui,-apple-system,'Noto Sans KR',sans-serif;box-shadow:0 8px 30px rgba(0,0,0,0.5)";
        var h = document.createElement("h2");
        h.id = "rfAppPermT";
        h.textContent = "🔐 " + t.title;
        h.style.cssText = "margin:0 0 8px;font-size:19px";
        box.appendChild(h);
        var lead = document.createElement("p");
        lead.textContent = t.lead;
        lead.style.cssText = "margin:0 0 10px";
        box.appendChild(lead);
        var sub = document.createElement("h3");
        sub.textContent = t.head;
        sub.style.cssText = "margin:0 0 6px;font-size:15px;color:#38d9ea";
        box.appendChild(sub);
        var ul = document.createElement("ul");
        ul.style.cssText = "margin:0 0 10px;padding-left:18px";
        t.rows.forEach(function (r) {
            var li = document.createElement("li"), b = document.createElement("b");
            b.textContent = r[0];
            li.appendChild(b);
            li.appendChild(document.createTextNode(": " + r[1]));
            li.style.cssText = "margin:0 0 6px";
            ul.appendChild(li);
        });
        box.appendChild(ul);
        [t.basic, t.change].forEach(function (s) {
            var p = document.createElement("p");
            p.textContent = s;
            p.style.cssText = "margin:0 0 8px;font-size:13px;color:#aab4c0";
            box.appendChild(p);
        });
        var a = document.createElement("a");
        a.href = en() ? "privacy-en.html" : "privacy.html";
        a.textContent = t.privacy + " ›";
        a.style.cssText = "display:inline-block;margin:0 0 12px;font-size:13px;color:#38d9ea";
        box.appendChild(a);
        var ok = document.createElement("button");
        ok.type = "button";
        ok.textContent = t.ok;
        ok.style.cssText = "display:block;width:100%;min-height:44px;border:0;border-radius:10px;background:#38d9ea;color:#0b1016;font-size:16px;font-weight:bold";
        ok.addEventListener("click", function () {
            try { localStorage.setItem(KEY, "1"); } catch (e) { /* 다음에 또 알림 */ }
            back.remove();
            if (before && before.focus) try { before.focus(); } catch (e) { /* 그대로 */ }
        });
        box.appendChild(ok);
        back.appendChild(box);
        document.body.appendChild(back);
        try { ok.focus({ preventScroll: true }); } catch (e) { ok.focus(); }   // 확인에 포커스, 글은 맨 위부터 보이게(제목이 위로 밀렸음)
        box.scrollTop = 0;
    }

    if (isApp() && !seen()) {
        if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
    }
})(window);
