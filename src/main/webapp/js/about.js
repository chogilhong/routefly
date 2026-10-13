/* 안내 화면 '‹ 돌아가기' · 오른쪽 위 '✕' - 앞 화면이 있으면 그곳, 없으면 따라가기 첫 화면. javascript: 주소 대신(CSP script-src 'self'). */
["aboutBack", "aboutClose"].forEach(function (id) {
    var a = document.getElementById(id);
    if (a) a.addEventListener("click", function (e) {
        if (history.length > 1) { e.preventDefault(); history.back(); }
    });
});
