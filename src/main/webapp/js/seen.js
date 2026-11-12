/*
 * 사람 확인 신호(2026-10-22 홍TV님) - 화면이 열려 이 프로그램이 돌았다는 것만 서버에 한 번 알림(숫자만 셈, 아무것도 남기지 않음).
 * js 를 돌리지 않는 수집 프로그램은 이것을 안 보내 통계(/stats "사람 확인")에서 가려짐. 같은 창에서는 한 번만.
 */
(function () {
    "use strict";
    try {
        // 하루에 한 번(2026-11-12 PC: 앱은 밀어도 웹뷰가 살아 있어 sessionStorage 가 남아 다음 날에도 안 보냈음) - 그 날 날짜를 적음
        var day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
        if (!navigator.sendBeacon || sessionStorage.getItem("rf-seen") === day) return;
        var s = document.currentScript, src = s && s.src;
        if (!src) return;
        // routefly 앱 안이면 ?app=1 - 통계에서 앱으로 들어온 사람을 따로 셈(2026-11-11 홍TV님 "앱으로 들어온지도 알 수 있어?").
        // 앱 판별은 화면이 다 열린 뒤(2026-11-12: "그중 앱" 이 0 - 원격 화면에는 앱 연결(window.Capacitor)이 이 스크립트보다 늦게 들어올 수 있음)
        var go = function () {
            try {
                if (sessionStorage.getItem("rf-seen") === day) return;
                var app = window.Capacitor && (!window.Capacitor.isNativePlatform || window.Capacitor.isNativePlatform());
                navigator.sendBeacon(src.replace(/js\/seen\.js(\?.*)?$/, "api/seen") + (app ? "?app=1" : ""));
                sessionStorage.setItem("rf-seen", day);
            } catch (e) { /* 저장소가 막힌 창 등 */ }
        };
        if (document.readyState === "complete") go(); else window.addEventListener("load", go);
    } catch (e) { /* 저장소가 막힌 창 등 - 그냥 넘어감 */ }
})();
