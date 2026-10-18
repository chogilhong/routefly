/*
 * 🚇 지하철 노선도(subway.html - 2026-10-18 홍TV님): 지역마다 지도 서비스의 노선도로 연결(API 키 없음, 그림은 넣지 않음).
 * 네이버 지도 노선도 지역 코드: 1000 수도권 · 7000 부산 · 4000 대구 · 5000 광주 · 3000 대전. 카카오맵은 주소 확인 뒤 추가.
 */
(function () {
    "use strict";
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    var LANG = RF.pageLang(location.search, lsGet("rf-lang"));
    if (/[?&]lang=(en|ko)\b/.test(location.search)) { try { localStorage.setItem("rf-lang", LANG); } catch (e) { /* 이번만 */ } }
    var EN = LANG === "en", T = RF.tr;
    RF.setLang(LANG);
    if (EN) { document.documentElement.lang = "en"; document.title = "routefly - Subway maps"; RF.applyEn(document); document.getElementById("backLink").setAttribute("href", "en/m/"); }
    document.getElementById("top").appendChild(RF.textButton());

    var REGIONS = [["1000", "수도권", "Seoul area", "서울 · 인천 · 경기"], ["7000", "부산", "Busan", "부산 · 김해"], ["4000", "대구", "Daegu", ""], ["5000", "광주", "Gwangju", ""], ["3000", "대전", "Daejeon", ""]];
    var box = document.getElementById("regions");
    REGIONS.forEach(function (r) {
        var sec = document.createElement("section"), h = document.createElement("h2"), links = document.createElement("div"), a = document.createElement("a");
        sec.className = "reg";
        h.textContent = "🚇 " + (EN ? r[2] : r[1]) + " ";
        if (r[3] && !EN) { var sm = document.createElement("small"); sm.textContent = r[3]; h.appendChild(sm); }
        links.className = "links";
        a.href = "https://m.map.naver.com/subway/subwayLine.naver?region=" + r[0];
        a.target = "_blank"; a.rel = "noopener";
        a.textContent = T("네이버 지도 노선도 ›", "Naver Map ›");
        links.appendChild(a);
        sec.appendChild(h); sec.appendChild(links);
        box.appendChild(sec);
    });
})();
