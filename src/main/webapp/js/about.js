/* 안내 화면 '‹ 돌아가기' · 오른쪽 위 '✕' - 앞 화면이 있으면 그곳, 없으면 따라가기 첫 화면. javascript: 주소 대신(CSP script-src 'self'). */
["aboutBack", "aboutClose"].forEach(function (id) {
    var a = document.getElementById(id);
    if (a) a.addEventListener("click", function (e) {
        // 이 사이트 화면에서 왔을 때만 뒤로 - 새 탭에서 about.html 만 열면 history 에 빈 첫 화면이 있어 back 이 아무 일도 안 했음(2026-10-13 PC)
        if (document.referrer && document.referrer.indexOf(location.origin + "/") === 0 && history.length > 1) { e.preventDefault(); history.back(); }
    });
});

/* 목차 · 위 목록(#a1 · #safety 등) - 누를 때마다 기록이 쌓여 ✕ · 돌아가기가 앞 조로 한 칸씩 돌아가던 것(2026-10-29 PC). 주소의 # 만 바꾸고 기록은 늘리지 않음 */
document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href^='#']");
    if (!a || a.getAttribute("href").length < 2) return;
    var t = document.getElementById(a.getAttribute("href").slice(1));
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView();
    try { history.replaceState(history.state, "", a.getAttribute("href")); } catch (x) { /* 그대로 */ }
});

var ABOUT_EN = document.documentElement.lang === "en";   // 영어판(about-en · privacy-en · terms-en · lbs-terms-en, 2026-10-29)

/* 글자 크기 "가+"(course-kit.js textButton 과 같은 저장 rf-text - 2026-10-14 홍TV님). 오른쪽 위 ✕ 왼쪽 */
(function () {
    var STEPS = [1, 1.2, 1.4], b = document.createElement("button");
    function get() { try { var v = +localStorage.getItem("rf-text"); return STEPS.indexOf(v) >= 0 ? v : 1; } catch (e) { return 1; } }
    function apply(v) {
        document.documentElement.style.setProperty("--rfz", String(v));
        document.documentElement.classList.toggle("rfz", v !== 1);
        b.textContent = v >= 1.4 ? "가++" : v >= 1.2 ? "가+" : "가";   // course-kit.js textLabel 과 같음
        b.title = ABOUT_EN ? "Text size " + Math.round(v * 100) + "% - each tap 100 → 120 → 140%" : "글자 크기 " + Math.round(v * 100) + "% - 누를 때마다 100 → 120 → 140%";
    }
    b.type = "button";
    b.className = "rfTextBtn";
    b.title = ABOUT_EN ? "Text size (each tap 100 → 120 → 140%)" : "글자 크기(누를 때마다 100 → 120 → 140%)";
    b.addEventListener("click", function () {
        var n = STEPS[(STEPS.indexOf(get()) + 1) % STEPS.length];
        try { localStorage.setItem("rf-text", String(n)); } catch (e) { /* 이번 화면만 */ }
        apply(n);
    });
    document.body.appendChild(b);
    apply(get());
})();

/* 제휴 · 후원(2026-10-15 홍TV님) - 설정(api/partners)에 링크가 있을 때만 '💚 routefly 응원하기' 를 보임 */
fetch("api/partners").then(function (r) { return r.json(); }).then(function (p) {
    var aff = p.agoda || p.trip || (p.coupang && Object.keys(p.coupang).length), sec = document.getElementById("support");
    if (!sec || !(aff || p.donate)) return;
    if (aff) {   // 설정에 있는 제휴만 적음(2026-10-15 PC: 아고다 링크가 없는데 "숙박의 아고다" 가 보였음)
        var where = [];
        if (p.coupang && Object.keys(p.coupang).length) where.push(ABOUT_EN ? "Coupang in 🎒 gear" : "🎒 챙길 것의 쿠팡");
        if (p.agoda) where.push(ABOUT_EN ? "Agoda in lodging" : "숙박의 아고다");
        if (p.trip) where.push(ABOUT_EN ? "Trip.com in lodging" : "숙박의 트립닷컴");
        document.getElementById("supportWhere").textContent = where.join(ABOUT_EN ? ", " : " · ");
        document.getElementById("supportVerb").textContent = ABOUT_EN ? (where.length > 1 ? "buy or book" : p.agoda || p.trip ? "book" : "buy")
            : where.length > 1 ? "사거나 예약하면" : p.agoda || p.trip ? "예약하면" : "사면";
        document.getElementById("supportAff").hidden = false;
    }
    if (p.donate) {
        var dl = document.getElementById("donateLink");
        dl.href = ABOUT_EN && /^https:\/\//.test(p.donateEn || "") ? p.donateEn : p.donate;   // 영어판은 PayPal(카드)이 있으면 그것
        document.getElementById("supportDonate").hidden = false;
        // 카카오페이 송금 코드는 핸드폰에서만 열림(PC 는 404) - PC 에서 누르면 안내만(2026-10-17 홍TV님)
        if (/^https:\/\/qr\.kakaopay\.com\//i.test(dl.href) && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "")) dl.addEventListener("click", function (e) {
            e.preventDefault();
            var box = document.getElementById("supportDonate");
            if (box.querySelector("small")) return;
            var s = document.createElement("small");
            s.style.cssText = "display:block;margin-top:6px";
            s.textContent = ABOUT_EN ? "KakaoPay transfers open only on a phone. Open this page on your phone and tap it." : "카카오페이 송금은 핸드폰에서만 열립니다. 핸드폰으로 이 페이지를 열어 눌러 주세요.";
            if (/^https:\/\//.test(p.donateEn || "")) {   // PC 에서는 PayPal(카드)로도
                var pp = document.createElement("a");
                pp.href = p.donateEn; pp.target = "_blank"; pp.rel = "noopener";
                pp.textContent = ABOUT_EN ? " On a PC, support with PayPal (card) ›" : " PC 에서는 PayPal(카드)로 후원 ›";
                s.appendChild(pp);
            }
            box.appendChild(s);
        });
    }
    sec.hidden = false;
}).catch(function () { /* 없이 */ });

/* 운영자 기기 표시(2026-10-21 PC: 홍TV님 앱(웹뷰)의 방문이 통계에 섞임 - 앱은 브라우저와 쿠키가 따로라 /stats 를 열 길이 없었음).
   "안내" 제목을 5초 안에 7번 누르면 열쇠 칸이 나오고 /stats 로 - 맞으면 이 기기는 그 뒤로 방문 수에서 빠짐. 열쇠가 없으면 아무 일도 없음 */
(function () {
    var h = document.querySelector("h1"), n = 0, t0 = 0;
    if (!h) return;
    h.addEventListener("click", function () {
        var now = Date.now();
        if (now - t0 > 5000) { n = 0; t0 = now; }
        if (++n < 7) return;
        n = 0;
        if (document.getElementById("ownerKey")) return;
        // prompt 대신 비밀번호 칸(2026-10-21 PC: 앱 prompt 에서 자판이 첫 글자를 대문자로 바꿔 404 - 비밀번호 칸은 자동 대문자 · 맞춤법 고침이 없음)
        var f = document.createElement("form"), i = document.createElement("input"), b = document.createElement("button");
        i.id = "ownerKey"; i.type = "password"; i.placeholder = "운영자 - 통계 열쇠";
        i.setAttribute("autocapitalize", "off"); i.setAttribute("autocomplete", "off"); i.setAttribute("spellcheck", "false");
        i.style.cssText = "width:100%;height:44px;font-size:16px;margin:8px 0;padding:0 10px;border-radius:10px";
        b.type = "submit"; b.textContent = "열기";
        f.appendChild(i); f.appendChild(b);
        h.parentNode.insertBefore(f, h.nextSibling);
        i.focus();
        f.addEventListener("submit", function (e) {
            e.preventDefault();
            // 카톡에 둔 주소 전체를 붙여도 key= 뒤만(2026-10-21 PC: 주소째 넣어 404)
            var k = i.value, m = k.match(/[?&]key=([^&#\s]+)/), v = m ? decodeURIComponent(m[1]) : k.replace(/\s+/g, "");
            if (v) location.href = "stats?key=" + encodeURIComponent(v);
        });
    });
})();
