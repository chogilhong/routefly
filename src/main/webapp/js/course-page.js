/* 코스 소개 페이지(/c/) - 🏨 근처 숙소 찾기 칸만(2026-11-04 홍TV님 "코스 페이지도 똑같이" - 산 페이지처럼 검색 칸만, 트립닷컴 한 줄은 뺌).
   course-kit staySearch(js/kit-m.js) 를 붙임 - 산 페이지 js/mountain.js 와 같은 부름. */
(function () {
    if (window.RF && window.RF.tmapLinks) window.RF.tmapLinks(document, navigator.userAgent);   // 🚗 티맵 - 휴대폰만(2026-11-09)
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
