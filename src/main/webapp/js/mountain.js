/*
 * 산 소개 페이지(/m/가야산 - MountainServlet) - 오늘 날씨(api/weather, 정상 좌표의 기상청 격자)와 일출 · 일몰(course-kit.js).
 * 2026-10-14 홍TV님. 코스 목록은 서버가 HTML 로 그립니다.
 */
(function () {
    // fly(3D) · 따라가기로 갈 때 적어 둠 - 그 화면의 ‹ · ← 뒤로가 새로 고친 뒤에도 history.back() 으로 이 화면 · 스크롤 자리로(2026-10-14 PC)
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest(".go a");
        if (a) try { sessionStorage.setItem("rf-fly-back", "1"); } catch (err) { /* 그때는 새로 엶 */ }
    });
    var box = document.getElementById("wx"), out = document.getElementById("wxBody");
    if (!box || !out || !window.RF) return;
    var lat = +box.getAttribute("data-lat"), lon = +box.getAttribute("data-lon"), RF = window.RF;
    function clock(ms) { var d = new Date(ms + 9 * 3600000); return d.getUTCHours() + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
    var now = Date.now(), rise = RF.sunrise(now, lat, lon), set = RF.sunset(now, lat, lon);
    var sunLine = "🌅 일출 " + (rise ? clock(rise) : "-") + " · 🌇 일몰 " + (set ? clock(set) : "-");
    function show(lines) {
        out.textContent = "";
        lines.forEach(function (t, i) {
            var p = document.createElement(i ? "div" : "b");
            p.textContent = t;
            out.appendChild(p);
        });
        out.className = "";
    }
    show([sunLine, "날씨 불러오는 중…"]);
    // 상대 주소 - 이 페이지는 /m/산 이라 한 단계 위가 앱 뿌리
    fetch("../api/weather?lat=" + lat.toFixed(4) + "&lon=" + lon.toFixed(4)).then(function (r) { return r.json(); }).then(function (w) {
        if (w.unavailable || !(w.hours || []).length) { show([sunLine, "날씨를 지금 받지 못했습니다."]); return; }
        var today = w.hours[0].t.slice(0, 10), mm = w.days && w.days[today], lines = [sunLine];
        if (mm && (mm.tmn != null || mm.tmx != null)) lines.push("오늘 최저 " + (mm.tmn != null ? mm.tmn + "℃" : "-") + " / 최고 " + (mm.tmx != null ? mm.tmx + "℃" : "-"));
        w.hours.filter(function (h, i) { return i % 3 === 0; }).slice(0, 6).forEach(function (h) {
            lines.push(h.t.slice(11, 13) + "시  " + RF.weatherWord(h.sky, h.pty) + "  " + (h.tmp != null ? h.tmp + "℃" : "-")
                + "  · 비 " + (h.pop != null ? h.pop + "%" : "-") + "  · 바람 " + (h.wsd != null ? h.wsd + "m/s" : "-"));
        });
        lines.push("기상청 단기예보(" + w.base + " 발표) · 정상 둘레 5km 격자 - 정상은 이보다 춥고 바람이 셀 수 있습니다.");
        show(lines);
    }).catch(function () { show([sunLine, "날씨를 지금 받지 못했습니다."]); });
})();
