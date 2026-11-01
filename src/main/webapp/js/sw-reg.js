/* 홈 화면에 추가 · 오프라인 - https(또는 localhost)에서만 됩니다. inline 스크립트를 없애려고 따로(CSP script-src 'self'). */
// 2026-11-01 점검: 화면이 다 뜬 뒤 등록 - 처음 온 사람의 첫 화면 파일과 서비스 워커가 미리 받는 파일 40여 개가 같이 내려받던 것
if ("serviceWorker" in navigator && window.isSecureContext) {
    var rfSw = function () { navigator.serviceWorker.register("sw.js").catch(function () {}); };
    if (document.readyState === "complete") rfSw(); else window.addEventListener("load", rfSw);
}
