/* 통계 화면 - 주소의 ?key= 를 지움(방문 기록 · 화면 공유에 열쇠가 남지 않게, 2026-10-21). 쿠키는 서버가 이미 줌 */
(function () {
    if (location.search && history.replaceState) history.replaceState(null, "", location.pathname + location.hash);
    // 접는 칸은 하나만 펴짐(2026-10-22 홍TV님) - details name="st" 를 모르는 옛 브라우저용
    var all = document.querySelectorAll('details[name="st"]');
    Array.prototype.forEach.call(all, function (d) {
        d.addEventListener("toggle", function () {
            if (!d.open) return;
            Array.prototype.forEach.call(all, function (o) { if (o !== d && o.open) o.open = false; });
        });
    });
})();
