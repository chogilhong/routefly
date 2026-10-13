/* 안내 화면 '‹ 돌아가기' · 오른쪽 위 '✕' - 앞 화면이 있으면 그곳, 없으면 따라가기 첫 화면. javascript: 주소 대신(CSP script-src 'self'). */
["aboutBack", "aboutClose"].forEach(function (id) {
    var a = document.getElementById(id);
    if (a) a.addEventListener("click", function (e) {
        // 이 사이트 화면에서 왔을 때만 뒤로 - 새 탭에서 about.html 만 열면 history 에 빈 첫 화면이 있어 back 이 아무 일도 안 했음(2026-10-13 PC)
        if (document.referrer && document.referrer.indexOf(location.origin + "/") === 0 && history.length > 1) { e.preventDefault(); history.back(); }
    });
});
