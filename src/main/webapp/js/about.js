/* 안내 화면 '‹ 돌아가기' - 앞 화면이 있으면 그곳, 없으면 첫 화면. javascript: 주소 대신(CSP script-src 'self'). */
document.getElementById("aboutBack").addEventListener("click", function (e) {
    if (history.length > 1) { e.preventDefault(); history.back(); }
});
