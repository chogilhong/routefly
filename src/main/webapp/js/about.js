/* 안내 화면 '‹ 돌아가기' · 오른쪽 위 '✕' - 앞 화면이 있으면 그곳, 없으면 따라가기 첫 화면. javascript: 주소 대신(CSP script-src 'self'). */
["aboutBack", "aboutClose"].forEach(function (id) {
    var a = document.getElementById(id);
    if (a) a.addEventListener("click", function (e) {
        // 이 사이트 화면에서 왔을 때만 뒤로 - 새 탭에서 about.html 만 열면 history 에 빈 첫 화면이 있어 back 이 아무 일도 안 했음(2026-10-13 PC)
        if (document.referrer && document.referrer.indexOf(location.origin + "/") === 0 && history.length > 1) { e.preventDefault(); history.back(); }
    });
});

/* 글자 크기 "가+"(course-kit.js textButton 과 같은 저장 rf-text - 2026-10-14 홍TV님). 오른쪽 위 ✕ 왼쪽 */
(function () {
    var STEPS = [1, 1.2, 1.4], b = document.createElement("button");
    function get() { try { var v = +localStorage.getItem("rf-text"); return STEPS.indexOf(v) >= 0 ? v : 1; } catch (e) { return 1; } }
    function apply(v) {
        document.documentElement.style.setProperty("--rfz", String(v));
        document.documentElement.classList.toggle("rfz", v !== 1);
        b.textContent = v >= 1.4 ? "가++" : v >= 1.2 ? "가+" : "가";   // course-kit.js textLabel 과 같음
        b.title = "글자 크기 " + Math.round(v * 100) + "% - 누를 때마다 100 → 120 → 140%";
    }
    b.type = "button";
    b.className = "rfTextBtn";
    b.title = "글자 크기(누를 때마다 100 → 120 → 140%)";
    b.addEventListener("click", function () {
        var n = STEPS[(STEPS.indexOf(get()) + 1) % STEPS.length];
        try { localStorage.setItem("rf-text", String(n)); } catch (e) { /* 이번 화면만 */ }
        apply(n);
    });
    document.body.appendChild(b);
    apply(get());
})();

/* 제휴 · 후원(2026-10-15 홍TV님) - 설정(api/partners)에 링크가 있을 때만 '💚 routefly 응원하기' 를 보임 */
fetch("api/partners").then(function (r) { return r.json(); }).then(function (p) {
    var aff = p.agoda || (p.coupang && Object.keys(p.coupang).length), sec = document.getElementById("support");
    if (!sec || !(aff || p.donate)) return;
    if (aff) {   // 설정에 있는 제휴만 적음(2026-10-15 PC: 아고다 링크가 없는데 "숙박의 아고다" 가 보였음)
        var where = [];
        if (p.coupang && Object.keys(p.coupang).length) where.push("🎒 챙길 것의 쿠팡");
        if (p.agoda) where.push("숙박의 아고다");
        document.getElementById("supportWhere").textContent = where.join(" · ");
        document.getElementById("supportAff").hidden = false;
    }
    if (p.donate) { document.getElementById("donateLink").href = p.donate; document.getElementById("supportDonate").hidden = false; }
    sec.hidden = false;
}).catch(function () { /* 없이 */ });
