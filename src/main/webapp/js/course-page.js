/* 코스 소개 페이지(/c/) - 🏨 근처 숙소 찾기 칸만(2026-11-04 홍TV님 "코스 페이지도 똑같이" - 산 페이지처럼 검색 칸만, 트립닷컴 한 줄은 뺌).
   course-kit staySearch(js/kit-m.js) 를 붙임 - 산 페이지 js/mountain.js 와 같은 부름. */
(function () {
    if (window.RF && window.RF.tmapLinks) window.RF.tmapLinks(document, navigator.userAgent);   // 🚗 티맵 - 휴대폰만(2026-11-09)
    // 산 페이지(/m/산 · /en/m/산 - 🛩 3D 종주 영상 "▶ 이 코스 보기" 등)에서 들어왔으면 위 ‹ 는 그 산 페이지로, 누르면 뒤로 가기(펼친 칸 · 보던 자리 그대로)
    // 2026-11-25 홍TV님 "이 경우에는 2로 가게 해야지" - 정상에 안 닿는 종주 코스(화대종주)는 ‹ 코스 모음 이라 빈 첫 화면으로 갔음
    (function () {
        var a = document.querySelector(".crumb a"), m = null, r = null;
        try { r = document.referrer ? new URL(document.referrer) : null; } catch (e) { r = null; }
        if (r && r.origin === location.origin) m = /\/m\/([^\/?#]+)\/?$/.exec(r.pathname);
        if (!a || !m) return;
        var name = m[1];
        try { name = decodeURIComponent(name); } catch (e) { /* 그대로 */ }
        a.href = r.pathname;
        a.textContent = "‹ " + name;
        a.addEventListener("click", function (e) { if (history.length > 1) { e.preventDefault(); history.back(); } });
    })();
    var f = document.getElementById("ssForm");
    if (!f || !window.RF || !window.RF.staySearch) return;
    var partnersP = fetch("../api/partners").then(function (r) { return r.json(); });
    partnersP.catch(function () { /* 제휴 설정 없음 - 카카오맵 등만 */ });
    window.RF.staySearch(f, document.getElementById("ssOut"), partnersP, "../", false);
    // 🎒 추천 상품(점검 14차 E1) - 산 페이지(mountain.js featBox)와 같은 모양: 제목에 "광고", 쿠팡 파트너스 문구는 상품 앞에(공정위 심사지침)
    var fc = document.getElementById("featC");
    if (fc && window.RF.featuredCard) partnersP.then(function (p) {
        var card = window.RF.featuredCard(window.RF.featuredPick(p && p.featured));
        if (!card) return;
        var n = document.createElement("p");
        n.className = "dim";
        n.textContent = window.RF.COUPANG_NOTE;
        fc.appendChild(n);
        fc.appendChild(card);
        fc.hidden = false;
    }).catch(function () { /* 상품 없이 */ });
})();
