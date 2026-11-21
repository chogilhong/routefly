/*
 * routefly 화면 모드 - 그리기 전에 고른 모드를 붙임(깜박임 없이, 2026-11-21 홍TV님 "드론플라이 처럼 라이트모드, 다크모드").
 * 기본은 다크(지금까지의 화면), ☀️ 단추로 밝은 모드를 고르면 이 기기에 기억(rf-theme). 화면 안 스크립트는 CSP 로 막혀 따로 파일로.
 */
(function () {
    var t = null;
    try { t = localStorage.getItem("rf-theme"); } catch (e) { /* 저장이 막힌 브라우저는 다크 */ }
    document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
})();
