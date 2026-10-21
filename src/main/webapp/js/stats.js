/* 통계 화면 - 주소의 ?key= 를 지움(방문 기록 · 화면 공유에 열쇠가 남지 않게, 2026-10-21). 쿠키는 서버가 이미 줌 */
(function () {
    if (location.search && history.replaceState) history.replaceState(null, "", location.pathname + location.hash);
})();
