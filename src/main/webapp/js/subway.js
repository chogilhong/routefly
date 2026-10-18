/*
 * 🚇 지하철 노선도(subway.html - 2026-10-18 홍TV님): 지역마다 지도 서비스의 노선도로 연결(API 키 없음, 그림은 넣지 않음).
 * 2026-10-18 PC 확인: 카카오맵 PC 웹 map.kakao.com/?target=subway&REGION=SES|PSS|DGS|KJS|DJS 는 그 지역 탭이 열림. 폰에서는 같은 주소가
 * Daum 검색(수도권)으로 넘어가 지역이 사라져서, 폰은 m.search.daum.net "<지역> 지하철노선도"(지역 탭 그대로). 네이버 m.map 노선도 주소는
 * region 을 무시하고 검색으로 넘어가므로 네이버는 "<지역> 지하철노선도" 검색으로.
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

    var MOBILE = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
    var REGIONS = [["SES", "수도권", "Seoul area", "서울 · 인천 · 경기"], ["PSS", "부산", "Busan", "부산 · 김해"], ["DGS", "대구", "Daegu", ""], ["KJS", "광주", "Gwangju", ""], ["DJS", "대전", "Daejeon", ""]];
    function link(href, text) {
        var a = document.createElement("a");
        a.href = href; a.target = "_blank"; a.rel = "noopener"; a.textContent = text;
        return a;
    }
    var box = document.getElementById("regions");
    REGIONS.forEach(function (r) {
        var sec = document.createElement("section"), h = document.createElement("h2"), links = document.createElement("div"), q = encodeURIComponent(r[1] + " 지하철노선도");
        sec.className = "reg";
        h.textContent = "🚇 " + (EN ? r[2] : r[1]) + " ";
        if (r[3] && !EN) { var sm = document.createElement("small"); sm.textContent = r[3]; h.appendChild(sm); }
        links.className = "links";
        links.appendChild(link(MOBILE ? "https://m.search.daum.net/search?w=tot&q=" + q : "https://map.kakao.com/?target=subway&REGION=" + r[0], T("카카오맵 노선도 ›", "Kakao Map ›")));
        links.appendChild(link("https://" + (MOBILE ? "m." : "") + "search.naver.com/search.naver?query=" + q, T("네이버 노선도 ›", "Naver ›")));
        sec.appendChild(h); sec.appendChild(links);
        box.appendChild(sec);
    });
})();
