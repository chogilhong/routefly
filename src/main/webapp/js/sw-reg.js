/* 홈 화면에 추가 · 오프라인 - https(또는 localhost)에서만 됩니다. inline 스크립트를 없애려고 따로(CSP script-src 'self'). */
if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("sw.js").catch(function () {});
