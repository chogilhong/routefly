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
    // 5분마다 저절로 새로(2026-10-29 홍TV님) - 화면을 안 볼 때는 쉬고, 다시 보면 5분 넘었을 때 바로
    var loaded = Date.now(), EVERY = 5 * 60000;
    function again() { if (!document.hidden && Date.now() - loaded >= EVERY) location.reload(); }
    setInterval(again, 30000);
    document.addEventListener("visibilitychange", again);
})();

// 이 브라우저는 관리자 기기(통계를 연 기기) - 코스 모음의 📐 GPX 편집 고리를 보이게(2026-10-31). 표시일 뿐 권한은 서버 쿠키로
try { localStorage.setItem("rf-admin", "1"); } catch (e) { /* 저장 못 해도 됨 */ }
