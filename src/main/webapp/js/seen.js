/*
 * 사람 확인 신호(2026-10-22 홍TV님) - 화면이 열려 이 프로그램이 돌았다는 것만 서버에 한 번 알림(숫자만 셈, 아무것도 남기지 않음).
 * js 를 돌리지 않는 수집 프로그램은 이것을 안 보내 통계(/stats "사람 확인")에서 가려짐. 같은 창에서는 한 번만.
 */
(function () {
    "use strict";
    try {
        if (!navigator.sendBeacon || sessionStorage.getItem("rf-seen")) return;
        var s = document.currentScript, src = s && s.src;
        if (!src) return;
        navigator.sendBeacon(src.replace(/js\/seen\.js(\?.*)?$/, "api/seen"));
        sessionStorage.setItem("rf-seen", "1");
    } catch (e) { /* 저장소가 막힌 창 등 - 그냥 넘어감 */ }
})();
