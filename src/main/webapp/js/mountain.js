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
    var crumb = document.querySelector(".crumb") || document.querySelector("h1");
    if (crumb && window.RF) { var tb = window.RF.textButton(); tb.style.float = "right"; crumb.appendChild(tb); }   // 글자 크기 "가+"
    // ☆ 찜(2026-10-15) - 코스마다. 따라가기 첫 화면에 모아 보임(이 기기 rf-fav)
    if (window.RF) Array.prototype.forEach.call(document.querySelectorAll(".cs li[data-id]"), function (li) {
        var go = li.querySelector(".go");
        if (!go) return;
        go.insertBefore(window.RF.favButton(function () {
            var asc = li.getAttribute("data-asc");
            return { id: li.getAttribute("data-id"), name: li.getAttribute("data-name"), kind: "hike", dist: +li.getAttribute("data-dist"), asc: asc != null ? +asc : null };
        }), go.firstChild);
    });
    // 🎒 챙길 것(2026-10-15) - 날씨 칸 아래. 오르막은 이 산 코스 가운데 가장 큰 값. 쿠팡 파트너스 링크는 설정에 있을 때만(+ 수수료 문구)
    var wx0 = document.getElementById("wx");
    if (wx0 && window.RF) {
        // 오르막은 이 산 코스들의 가운데 값 - 가장 큰 값은 긴 종주 코스라 "오르막 2,672m" 처럼 보였음(2026-10-15 홍TV님)
        var ascs = Array.prototype.map.call(document.querySelectorAll(".cs li[data-asc]"), function (li) { return +li.getAttribute("data-asc") || 0; })
            .sort(function (a, b) { return a - b; });
        var asc = ascs.length ? ascs[Math.floor(ascs.length / 2)] : 0;
        var gs = document.createElement("section"), gh = document.createElement("h2"), ul = document.createElement("ul");
        gh.textContent = "🎒 챙길 것";
        ul.className = "gear";
        gs.appendChild(gh);
        gs.appendChild(ul);
        var items = window.RF.gearList(new Date().getMonth() + 1, asc, "hike").map(function (g) {
            var li = document.createElement("li"), b = document.createElement("b"), sp = document.createElement("span");
            b.textContent = g.label;
            sp.textContent = g.why;
            li.appendChild(b);
            li.appendChild(sp);
            ul.appendChild(li);
            return [g, li];
        });
        wx0.parentNode.insertBefore(gs, wx0.nextSibling);
        fetch("../api/partners").then(function (r) { return r.json(); }).then(function (p) {
            var any = false;
            items.forEach(function (x) {
                var links = window.RF.partnerLinks(p.coupang && p.coupang[x[0].key]);
                if (!links.length) return;
                var box = document.createElement("div");   // 링크는 한 덩어리로(좁으면 함께 다음 줄로)
                box.className = "gl";
                links.forEach(function (k) {
                    var a = document.createElement("a");
                    a.href = k.href;
                    a.target = "_blank";
                    a.rel = "noopener sponsored";
                    a.textContent = k.text;
                    box.appendChild(a);
                });
                x[1].appendChild(box);
                any = true;
            });
            if (any) { var n = document.createElement("p"); n.className = "dim"; n.textContent = window.RF.COUPANG_NOTE; gs.appendChild(n); }
        }).catch(function () { /* 링크 없이 */ });
    }
    var box = document.getElementById("wx"), out = document.getElementById("wxBody");
    if (!box || !out || !window.RF) return;
    var lat = +box.getAttribute("data-lat"), lon = +box.getAttribute("data-lon"), RF = window.RF;
    function clock(ms) { var d = new Date(ms + 9 * 3600000); return d.getUTCHours() + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
    // 날짜 고르기(2026-10-15 홍TV님: 며칠 뒤 산행 날의 날씨 · 미세먼지) - 기상청 단기예보가 주는 날(오늘 ~ 글피)만큼 칸.
    // 그 날을 누르면 일출 · 일몰 · 최저 · 최고 · 3시간마다 날씨, 미세먼지는 오늘은 지금 값 · 내일 · 모레는 에어코리아 예보
    function sunLine(dayMs) {
        var rise = RF.sunrise(dayMs, lat, lon), set = RF.sunset(dayMs, lat, lon);
        return "🌅 일출 " + (rise ? clock(rise) : "-") + " · 🌇 일몰 " + (set ? clock(set) : "-");
    }
    function show(lines) {
        out.textContent = "";
        lines.forEach(function (t, i) {
            var p = document.createElement(i ? "div" : "b");
            p.textContent = t;
            out.appendChild(p);
        });
        out.className = "";
    }
    show([sunLine(Date.now()), "날씨 불러오는 중…"]);
    var tabs = document.createElement("div");
    tabs.className = "days";
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "날짜 고르기");
    out.parentNode.insertBefore(tabs, out);
    var airBox = document.createElement("p");
    airBox.className = "dim";
    box.appendChild(airBox);
    var air = null, wx = null, mid = null, today = null, picked = null;
    function draw() {
        if (!wx) return;
        var day = picked || today, dayMs = Date.parse(day + "T12:00:00+09:00"), mm = wx.days && wx.days[day], lines = [sunLine(dayMs)];
        var md = mid && mid.days && mid.days[day];
        if (md && !wx.hours.some(function (h) { return h.t.slice(0, 10) === day; })) {   // 단기예보 뒤(4~10일) - 기상청 중기예보
            if (md.tmn != null || md.tmx != null) lines.push("최저 " + (md.tmn != null ? md.tmn + "℃" : "-") + " / 최고 " + (md.tmx != null ? md.tmx + "℃" : "-"));
            RF.midLines(md).forEach(function (l) { lines.push(l); });
            lines.push("기상청 중기예보(" + mid.tmFc + " 발표) · " + mid.region + " 권역 · 기온은 " + mid.city + " 기준 - 산 위는 이보다 춥고 바람이 셉니다. 날이 가까워지면 3시간마다 예보로 바뀝니다.");
            show(lines);
            airBox.textContent = "😷 이 날 미세먼지 예보는 아직 없습니다(에어코리아 예보는 모레까지).";
            airBox.hidden = false;
            markTabs(day);
            return;
        }
        if (mm && (mm.tmn != null || mm.tmx != null)) lines.push("최저 " + (mm.tmn != null ? mm.tmn + "℃" : "-") + " / 최고 " + (mm.tmx != null ? mm.tmx + "℃" : "-"));
        var hours = wx.hours.filter(function (h) { return h.t.slice(0, 10) === day; });
        hours.filter(function (h, i) { return day === today ? i % 3 === 0 : +h.t.slice(11, 13) % 3 === 0; }).slice(0, 8).forEach(function (h) {
            lines.push(h.t.slice(11, 13) + "시  " + RF.weatherWord(h.sky, h.pty) + "  " + (h.tmp != null ? h.tmp + "℃" : "-")
                + "  · 비 " + (h.pop != null ? h.pop + "%" : "-") + "  · 바람 " + (h.wsd != null ? h.wsd + "m/s" : "-"));
        });
        lines.push("기상청 단기예보(" + wx.base + " 발표) · 정상 둘레 5km 격자 - 정상은 이보다 춥고 바람이 셀 수 있습니다. 3시간마다 예보는 글피까지입니다.");
        show(lines);
        var t = day === today ? RF.airText(air) : RF.airForecastText(air, day);
        airBox.textContent = t ? "😷 " + t + " · 에어코리아" : day === today ? "" : "😷 이 날 미세먼지 예보는 아직 없습니다(에어코리아 예보는 모레까지).";
        airBox.hidden = !airBox.textContent;
        markTabs(day);
    }
    function markTabs(day) {
        Array.prototype.forEach.call(tabs.children, function (b) { var on = b.getAttribute("data-day") === day; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    }
    function addTab(d) {
        if (tabs.querySelector('[data-day="' + d + '"]')) return;
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-day", d);
        b.textContent = RF.dayLabel(d, today);
        b.addEventListener("click", function () { picked = d; draw(); });
        tabs.appendChild(b);
    }
    function addMidTabs() {   // 단기예보 다음 날부터 10일 뒤까지(2026-10-15 홍TV님)
        if (!wx || !mid || !mid.days) return;
        var last = tabs.lastChild && tabs.lastChild.getAttribute("data-day");
        Object.keys(mid.days).sort().forEach(function (d) { if (!last || d > last) addTab(d); });
    }
    fetch("../api/mid?lat=" + lat.toFixed(4) + "&lon=" + lon.toFixed(4)).then(function (r) { return r.json(); }).then(function (m) {
        if (m.unavailable) return;
        mid = m;
        addMidTabs();
    }).catch(function () { /* 4일 뒤부터는 없이 */ });
    fetch("../api/air?lat=" + lat.toFixed(4) + "&lon=" + lon.toFixed(4)).then(function (r) { return r.json(); }).then(function (a) { air = a; draw(); })
        .catch(function () { /* 미세먼지 없이 */ });
    // 상대 주소 - 이 페이지는 /m/산 이라 한 단계 위가 앱 뿌리
    fetch("../api/weather?lat=" + lat.toFixed(4) + "&lon=" + lon.toFixed(4)).then(function (r) { return r.json(); }).then(function (w) {
        if (w.unavailable || !(w.hours || []).length) { show([sunLine(Date.now()), "날씨를 지금 받지 못했습니다."]); return; }
        wx = w;
        today = w.hours[0].t.slice(0, 10);
        var days = [];
        w.hours.forEach(function (h) { var d = h.t.slice(0, 10); if (days.indexOf(d) < 0) days.push(d); });
        days.slice(0, 4).forEach(addTab);
        addMidTabs();
        draw();
    }).catch(function () { show([sunLine(Date.now()), "날씨를 지금 받지 못했습니다."]); });
})();
