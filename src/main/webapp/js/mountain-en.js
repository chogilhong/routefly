/*
 * 영어 산 페이지(/en/m/seoraksan - MountainEn, 2026-10-15 홍TV님) - 날씨(api/weather) · 미세먼지(api/air) · 일출 · 일몰(course-kit.js), 내 근처 산.
 * 한국어 화면(js/mountain.js)과 같은 자료를 영어로. 이 페이지는 /en/m/ 아래라 앱 뿌리는 두 단계 위(../../).
 */
(function () {
    var RF = window.RF;
    if (!RF) return;
    var crumb = document.querySelector(".crumb") || document.querySelector("h1");
    if (crumb) {   // 오른쪽 위: 한/EN · 글자 크기(한국어 페이지와 같은 자리)
        var tools = document.createElement("span"), lt = RF.langToggle("en"), tb = RF.textButton();
        tools.className = "rfTools";
        tb.title = "Text size";
        tb.setAttribute("aria-label", "Text size");
        if (lt) tools.appendChild(lt);
        tools.appendChild(tb);
        crumb.insertBefore(tools, crumb.firstChild);   // 앞에 두어야 h1 글과 같은 줄 오른쪽(뒤에 두면 다음 줄로 밀림)
    }
    RF.foldOne(document);   // 하나를 펴면 나머지는 접힘(/m/ 과 같음)
    RF.boardButtons("../..", true);   // 📈 Elevation(한국어 화면과 같음)
    // 📥 Save for offline(한국어 화면과 같은 칸)
    RF.offlineBox({ title: "📥 Save for no signal", btn: "Save this mountain", again: "Save again (fresh weather)", saving: "Saving…",
        fail: "This browser cannot save pages (works in Chrome or Samsung Internet on an https address).", tip: "Tap before you go. This page, the weather and the trail lines are saved on this phone.",
        done: function (t) { return "✓ Saved " + t + " - this page, the weather at that time and trail following (line + GPS) open without signal. For map imagery, open a trail in Follow and save it offline there."; } },
        "../..", "mountain-en.js");
    var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var AIR = { "좋음": "Good", "보통": "Moderate", "나쁨": "Unhealthy", "매우나쁨": "Very unhealthy" };
    function clock(ms) { var d = new Date(ms + 9 * 3600000); return d.getUTCHours() + ":" + String(d.getUTCMinutes()).padStart(2, "0"); }
    function sky(s, p) {
        return { 1: "🌧 Rain", 2: "🌨 Rain/snow", 3: "❄️ Snow", 4: "🌦 Showers" }[+p] || { 1: "☀️ Clear", 3: "⛅ Mostly cloudy", 4: "☁️ Overcast" }[+s] || "-";
    }
    function dayLabel(d, today) {
        var t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)), n = Math.round((t - Date.parse(today + "T00:00:00Z")) / 86400000);
        return (["Today ", "Tomorrow "][n] || "") + DAYS[new Date(t).getUTCDay()] + " " + (+d.slice(5, 7)) + "/" + (+d.slice(8, 10));
    }

    // 📍 near me (목록 /en/m/) - 위치는 이 기기 안에서만 견줌, 페이지의 좌표(data-lat · data-lon)로
    var nearBtn = document.getElementById("nearMe"), nearList = document.getElementById("nearList");
    if (nearBtn && nearList) nearBtn.addEventListener("click", function () {
        if (!navigator.geolocation || !window.isSecureContext) { nearList.textContent = "Location works only on an https address."; return; }
        nearList.textContent = "Finding your location…";
        navigator.geolocation.getCurrentPosition(function (pos) {
            var me = pos.coords, list = Array.prototype.map.call(document.querySelectorAll("#peakList a[data-lat]"), function (a) {
                return { a: a, d: RF.distM(me.latitude, me.longitude, +a.getAttribute("data-lat"), +a.getAttribute("data-lon")) };
            }).sort(function (x, y) { return x.d - y.d; }).slice(0, 8);
            nearList.textContent = "";
            var ul = document.createElement("ul");
            ul.className = "ms";
            list.forEach(function (x) {
                var li = document.createElement("li"), a = x.a.cloneNode(true), sm = a.querySelector("small");
                if (sm) sm.textContent = Math.round(x.d / 1000) + " km";
                li.appendChild(a);
                ul.appendChild(li);
            });
            nearList.appendChild(ul);
        }, function () { nearList.textContent = "Could not get your location (check location permission)."; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    });

    // 🌄 sunrise start - 코스마다 내일 일출을 정상에서 보려면 들머리 출발 시각
    var box = document.getElementById("wx"), out = document.getElementById("wxBody"), cs = document.querySelector(".cs");
    if (!box || !out) return;
    var lat = +box.getAttribute("data-lat"), lon = +box.getAttribute("data-lon");
    var rise = RF.sunrise(Date.now() + 86400000, lat, lon);
    if (cs && rise) Array.prototype.forEach.call(cs.children, function (li) {
        var span = li.querySelector("span");
        if (!span) return;
        var s = document.createElement("small");
        s.className = "sunrise";
        s.textContent = "🌄 For tomorrow's sunrise (" + clock(rise) + ") at the top, start by " + clock(RF.sunriseStart(rise, RF.standardMs("hike", +li.getAttribute("data-dist") || 0, +li.getAttribute("data-asc") || 0)));
        span.parentNode.insertBefore(s, span.nextSibling);
    });
    function sunLine(dayMs) {
        var r = RF.sunrise(dayMs, lat, lon), s = RF.sunset(dayMs, lat, lon);
        return "🌅 Sunrise " + (r ? clock(r) : "-") + " · 🌇 Sunset " + (s ? clock(s) : "-") + " (KST)";
    }
    function show(lines) {
        out.textContent = "";
        lines.forEach(function (t, i) { var p = document.createElement(i ? "div" : "b"); p.textContent = t; out.appendChild(p); });
        out.className = "";
    }
    show([sunLine(Date.now()), "Loading weather…"]);
    var tabs = document.createElement("div"), airBox = document.createElement("p"), wx = null, mid = null, air = null, today = null, picked = null;
    tabs.className = "days";
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Pick a day");
    out.parentNode.insertBefore(tabs, out);
    // 오늘은 단추, 나머지 날(단기예보 ~ 10일 뒤 중기예보)은 고르는 칸 - 한국어 화면과 같은 모양
    var todayBtn = document.createElement("button"), pick = document.createElement("select"), hint = document.createElement("option");
    todayBtn.type = "button";
    todayBtn.addEventListener("click", function () { picked = today; draw(); });
    pick.setAttribute("aria-label", "Pick another day");
    hint.value = "";
    hint.textContent = "Other days";
    pick.appendChild(hint);
    pick.addEventListener("change", function () { if (pick.value) { picked = pick.value; draw(); } });
    tabs.appendChild(todayBtn);
    tabs.appendChild(pick);
    airBox.className = "dim";
    box.appendChild(airBox);
    function airText(a) {
        if (!a || a.unavailable || (a.pm10 == null && a.pm25 == null)) return "";
        var p = [];
        if (a.pm10 != null) p.push("PM10 " + (AIR[a.pm10Word] || "") + " (" + a.pm10 + " µg/m³)");
        if (a.pm25 != null) p.push("PM2.5 " + (AIR[a.pm25Word] || "") + " (" + a.pm25 + " µg/m³)");
        return "😷 Air quality now: " + p.join(" · ") + (a.dist_km != null ? " - station " + a.dist_km + " km away" : "") + " · AirKorea";
    }
    function range(n, x) { return [n != null ? "Low " + n + "°C" : "", x != null ? "High " + x + "°C" : ""].filter(Boolean).join(" / "); }
    function draw() {
        if (!wx) return;
        var day = picked || today, mm = wx.days && wx.days[day], lines = [sunLine(Date.parse(day + "T12:00:00+09:00"))];
        var hours = wx.hours.filter(function (h) { return h.t.slice(0, 10) === day; }), md = mid && mid.days && mid.days[day];
        if (!hours.length && md) {   // 단기예보 뒤(4~10일) - 기상청 중기예보, 날씨 말은 영어로(RF.wfEn)
            if (range(md.tmn, md.tmx)) lines.push(range(md.tmn, md.tmx));
            var half = function (n, w, p) { return (n ? n + " " : "") + (RF.wfEn(w) || "-") + (p != null ? " · rain " + p + "%" : ""); };
            if (md.wfAm === md.wfPm && md.popAm === md.popPm) lines.push(half("", md.wfAm, md.popAm));
            else { lines.push(half("Morning", md.wfAm, md.popAm)); lines.push(half("Afternoon", md.wfPm, md.popPm)); }
            lines.push("Korea Meteorological Administration mid-term regional forecast (issued " + mid.tmFc + " KST). Temperatures are for the nearest city - "
                + "much colder and windier on the summit. Hourly forecasts appear as the day gets closer.");
        } else {
            if (mm && range(mm.tmn, mm.tmx)) lines.push(range(mm.tmn, mm.tmx));
            hours.filter(function (h, i) { return day === today ? i % 3 === 0 : +h.t.slice(11, 13) % 3 === 0; }).slice(0, 8).forEach(function (h) {
                lines.push(h.t.slice(11, 13) + ":00  " + sky(h.sky, h.pty) + "  " + (h.tmp != null ? h.tmp + "°C" : "-") + "  · rain " + (h.pop != null ? h.pop + "%" : "-")
                    + "  · wind " + (h.wsd != null ? h.wsd + " m/s" : "-"));
            });
            lines.push("Korea Meteorological Administration short-term forecast (issued " + wx.base + " KST) for a 5 km grid around the summit. The summit can be colder and windier.");
        }
        show(lines);
        airBox.textContent = day === today ? airText(air) : "";
        airBox.hidden = !airBox.textContent;
        var on = day === today;
        todayBtn.classList.toggle("on", on);
        todayBtn.setAttribute("aria-pressed", on ? "true" : "false");
        pick.classList.toggle("on", !on);
        pick.value = on ? "" : day;
    }
    function addDay(d) {
        if (d === today) { todayBtn.textContent = dayLabel(d, today); return; }
        if (pick.querySelector('[value="' + d + '"]')) return;
        var o = document.createElement("option");
        o.value = d;
        o.textContent = dayLabel(d, today);
        pick.appendChild(o);
    }
    function addMid() {
        if (!wx || !mid || !mid.days) return;
        var last = pick.options.length > 1 ? pick.options[pick.options.length - 1].value : today;
        Object.keys(mid.days).sort().forEach(function (d) { if (d > last) addDay(d); });
    }
    fetch("../../api/mid?lat=" + lat.toFixed(4) + "&lon=" + lon.toFixed(4)).then(function (r) { return r.json(); }).then(function (m) {
        if (m.unavailable) return;
        mid = m;
        addMid();
    }).catch(function () { /* 4일 뒤부터는 없이 */ });
    fetch("../../api/air?lat=" + lat.toFixed(4) + "&lon=" + lon.toFixed(4)).then(function (r) { return r.json(); }).then(function (a) { air = a; draw(); }).catch(function () { /* 없이 */ });
    fetch("../../api/weather?lat=" + lat.toFixed(4) + "&lon=" + lon.toFixed(4)).then(function (r) { return r.json(); }).then(function (w) {
        if (w.unavailable || !(w.hours || []).length) { show([sunLine(Date.now()), "Weather is not available right now."]); return; }
        wx = w;
        today = w.hours[0].t.slice(0, 10);
        var days = [];
        w.hours.forEach(function (h) { var d = h.t.slice(0, 10); if (days.indexOf(d) < 0) days.push(d); });
        days.forEach(addDay);
        addMid();
        draw();
    }).catch(function () { show([sunLine(Date.now()), "Weather is not available right now."]); });
})();
