/* 🚌 안내산악회 산행 일정 모음(2026-10-22) - GET api/club/list → 날짜별. 산 페이지 칸(Clubs.item)과 같은 꼴 */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var DOW = ["일", "월", "화", "수", "목", "금", "토"], all = [];
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
    function two(n) { return (n < 10 ? "0" : "") + n; }
    function day(ms) { var d = new Date(ms); return (d.getMonth() + 1) + "/" + d.getDate() + "(" + DOW[d.getDay()] + ")"; }
    function time(ms) { var d = new Date(ms); return two(d.getHours()) + ":" + two(d.getMinutes()); }
    function item(t) {
        var go = t.bookUrl || t.url;
        return "<li>" + (t.featured ? "<span class=\"ad\">추천 · 광고</span> " : "") + "<b>" + time(t.departAt) + "</b> [" + esc(t.mountain) + "] " + esc(t.title)
            + "<br><span class=\"dim\">" + esc(t.club) + (t.stops ? " · " + esc(t.stops) : "") + (t.price ? " · " + Number(t.price).toLocaleString("ko-KR") + "원" : "")
            + " · <a href=\"tel:" + esc(String(t.phone).replace(/[^0-9+]/g, "")) + "\">☎ " + esc(t.phone) + "</a></span>"
            + (go ? " <a class=\"bk\" href=\"" + esc(go) + "\" target=\"_blank\" rel=\"noopener nofollow\">예약 ›</a>" : "") + "</li>";
    }
    function draw() {
        var q = $("q").value.trim(), list = all.filter(function (t) { return !q || t.mountain.indexOf(q) >= 0 || t.title.indexOf(q) >= 0; });
        if (!list.length) { $("list").innerHTML = "<p class=\"dim\">" + (q ? "\"" + esc(q) + "\" 산행 일정이 아직 없습니다." : "아직 올라온 일정이 없습니다.") + "</p>"; return; }
        var feat = list.filter(function (t) { return t.featured; }), rest = list.filter(function (t) { return !t.featured; }), out = [];
        if (feat.length) out.push("<ul class=\"cl\">" + feat.map(function (t) { return item(t).replace("<b>", "<b>" + day(t.departAt) + " "); }).join("") + "</ul>");
        var cur = null, buf = [];
        rest.forEach(function (t) {
            var d = day(t.departAt);
            if (d !== cur) { if (buf.length) out.push("<ul class=\"cl\">" + buf.join("") + "</ul>"); buf = []; cur = d; out.push("<h3 class=\"day\">" + d + "</h3>"); }
            buf.push(item(t));
        });
        if (buf.length) out.push("<ul class=\"cl\">" + buf.join("") + "</ul>");
        $("list").innerHTML = out.join("");
    }
    var m = new URLSearchParams(location.search).get("m");
    if (m) $("q").value = m;
    $("q").addEventListener("input", draw);
    fetch("api/club/list", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.enabled) { $("list").innerHTML = "<p class=\"dim\">안내산악회 일정은 준비 중입니다.</p>"; return; }
        all = j.trips || [];
        draw();
    }).catch(function () { $("list").innerHTML = "<p class=\"dim\">불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p>"; });
})();
