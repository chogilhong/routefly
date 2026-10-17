/*
 * 처음 안내(2026-10-11 오픈 전) - 따라가기(hike.html) 코스 목록을 처음 열 때 한 번, 다섯 장(무엇 · 코스 찾기 · fly(3D) · 산행하기 · 안전 · 개인정보).
 * 코스 목록 아래 '❓ 사용법' 으로 다시 봅니다. 산행 시작 때의 안전 안내(hike.js SAFETY_KEY)는 그대로 따로 나옵니다.
 * 내용을 크게 바꾸면 KEY 의 판 번호를 올려 한 번 더 보이게 합니다.
 */
(function () {
    var KEY = "rf-onboard-v2";   // v2(2026-10-14): 도장 · 완주, fly(3D) 장 더함
    var box = document.getElementById("onboard");
    if (!box) return;
    var pages = box.querySelectorAll(".ob-page"), dots = box.querySelectorAll(".ob-dots span");
    var next = document.getElementById("obNext"), skip = document.getElementById("obSkip");
    var at = 0, before = null;

    function seen() {
        try { return localStorage.getItem(KEY) === "1"; } catch (e) { return true; }   // 저장소를 못 쓰면 매번 띄우지 않음
    }
    function show(i) {
        at = i;
        for (var k = 0; k < pages.length; k++) {
            pages[k].hidden = k !== i;
            dots[k].className = k === i ? "on" : "";
        }
        var last = i === pages.length - 1;
        var en = document.documentElement.lang === "en";   // 따라가기 영어(hike.js 가 먼저 정함)
        next.textContent = last ? (en ? "Get started" : "시작하기") : (en ? "Next" : "다음");
        skip.style.visibility = last ? "hidden" : "";
    }
    function open() {
        before = document.activeElement;
        show(0);
        box.hidden = false;
        next.focus();
    }
    function close() {
        box.hidden = true;
        try { localStorage.setItem(KEY, "1"); } catch (e) { /* 다음에 다시 보일 뿐 */ }
        if (before && before.focus) before.focus();
    }

    next.addEventListener("click", function () { if (at < pages.length - 1) show(at + 1); else close(); });
    skip.addEventListener("click", close);
    box.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    // 코스 목록 안내 글의 '❓ 사용법'(검색창을 비우면 안내 글이 다시 그려지므로 문서에서 받음)
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("[data-onboard]");
        if (!a) return;
        e.preventDefault();
        open();
    });
    // 처음이고 코스 없이 열었을 때만(공유 링크로 코스를 바로 연 사람은 코스 목록으로 갈 때 '❓ 사용법')
    if (!seen() && /\bpicking\b/.test(document.documentElement.className)) open();
})();
