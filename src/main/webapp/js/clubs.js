/* 🚌 안내산악회 산행 일정 모음(2026-10-22) - GET api/club/list → 광고(2~3개) 다음 날짜별. 시각은 서버가 준 한국 시각 글(when). 산 페이지 칸(Clubs.item)과 같은 꼴 */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var all = [];
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
    function item(t, withDay) {
        var parts = String(t.when).split(" ");   // "10/25(토) 07:00"
        return "<li>" + (t.ad ? "<span class=\"ad\">광고</span> " : "") + "<b>" + esc(withDay ? t.when : parts[1]) + "</b>" + (t.gone ? " <span class=\"gone\">출발함</span>" : "")
            + " [" + esc(t.mountain) + "] " + esc(t.title)
            + "<br><span class=\"dim\">" + esc(t.club) + (t.stops ? " · " + esc(t.stops) : "") + (t.price ? " · " + Number(t.price).toLocaleString("ko-KR") + "원" : "")
            + (t.phone ? " · <a href=\"tel:" + esc(String(t.phone).replace(/[^0-9+]/g, "")) + "\">☎ " + esc(t.phone) + "</a>" : "") + "</span>"
            + (t.go ? " <a class=\"bk\" href=\"" + esc(t.go) + "\" target=\"_blank\" rel=\"" + (t.ad ? "sponsored " : "") + "noopener nofollow\">예약 › <small>" + esc(t.host) + "</small></a>" : "") + "</li>";
    }
    function draw() {
        var q = $("q").value.trim(), list = all.filter(function (t) { return !q || t.mountain.indexOf(q) >= 0 || t.title.indexOf(q) >= 0 || String(t.club).indexOf(q) >= 0; });
        if (!list.length) { $("list").innerHTML = "<p class=\"dim\">" + (q ? "\"" + esc(q) + "\" 산행 일정이 아직 없습니다." : "아직 올라온 일정이 없습니다.") + "</p>"; return; }
        var ads = list.filter(function (t) { return t.ad; }), rest = list.filter(function (t) { return !t.ad; }), out = [];
        if (ads.length) out.push("<ul class=\"cl\">" + ads.map(function (t) { return item(t, true); }).join("") + "</ul>");
        var cur = null, buf = [];
        rest.forEach(function (t) {
            var d = String(t.when).split(" ")[0];
            if (d !== cur) { if (buf.length) out.push("<ul class=\"cl\">" + buf.join("") + "</ul>"); buf = []; cur = d; out.push("<h3 class=\"day\">" + esc(d) + "</h3>"); }
            buf.push(item(t, false));
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
