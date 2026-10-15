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
    // 쉬운 코스 거르기(2026-10-15 홍TV님) - 코스가 넷 이상이면 "모두 · 2시간 이내 · 4시간 이내"
    var csList = document.querySelector(".cs");
    if (csList && window.RF && csList.children.length >= 4) {
        var chips = document.createElement("div");
        chips.className = "days easy";
        var apply = function (key) {
            var n = 0;
            Array.prototype.forEach.call(csList.children, function (li) {
                var ok = window.RF.easyOk(key, "hike", li.getAttribute("data-dist"), li.getAttribute("data-asc"));
                li.hidden = !ok;
                if (ok) n++;
            });
            Array.prototype.forEach.call(chips.children, function (b) { var on = b.getAttribute("data-k") === key; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
            none.hidden = n > 0;
        };
        window.RF.EASY.forEach(function (e) {
            var b = document.createElement("button");
            b.type = "button";
            b.textContent = e.label;
            b.setAttribute("data-k", e.key);
            b.addEventListener("click", function () { apply(e.key); });
            chips.appendChild(b);
        });
        var none = document.createElement("p");
        none.className = "dim";
        none.textContent = "이 시간 안에 걸을 수 있는 코스가 없습니다. \"모두\" 를 눌러 보세요.";
        csList.parentNode.insertBefore(chips, csList);
        csList.parentNode.insertBefore(none, csList.nextSibling);
        apply("");
    }
    // 산불조심기간(봄 2/1 ~ 5/15 · 가을 11/1 ~ 12/15) 안내 - 제목 아래(2026-10-15 홍TV님)
    var lead = document.querySelector(".lead"), fire = window.RF && window.RF.fireNote(Date.now());
    if (lead && fire) { var fp = document.createElement("p"); fp.className = "fire"; fp.textContent = fire; lead.parentNode.insertBefore(fp, lead.nextSibling); }
    // 🌄 일출 산행 - 코스마다 "내일 일출(6:39)을 정상에서 보려면 들머리 출발 약 4:20"(표준 소요 시간, 15분 여유). 정상 좌표로 일출
    var wxs = document.getElementById("wx");
    if (wxs && window.RF && csList) {
        var la = +wxs.getAttribute("data-lat"), lo = +wxs.getAttribute("data-lon"), tmr = Date.now() + 86400000, rise = window.RF.sunrise(tmr, la, lo);
        var hhmm = function (ms) { var d = new Date(ms + 9 * 3600000); return d.getUTCHours() + ":" + String(d.getUTCMinutes()).padStart(2, "0"); };
        if (rise) Array.prototype.forEach.call(csList.children, function (li) {
            var span = li.querySelector("span");
            if (!span) return;
            var up = window.RF.standardMs("hike", +li.getAttribute("data-dist") || 0, +li.getAttribute("data-asc") || 0);
            var s = document.createElement("small");
            s.className = "sunrise";
            s.textContent = "🌄 내일 일출(" + hhmm(rise) + ") 보려면 들머리 " + hhmm(window.RF.sunriseStart(rise, up)) + " 출발";
            span.parentNode.insertBefore(s, span.nextSibling);
        });
    }
    // 📍 내 근처 100대 명산(2026-10-15 홍TV님) - 위치는 이 핸드폰 안에서만 견줌(서버로 보내지 않음)
    var nearBtn = document.getElementById("nearMe"), nearList = document.getElementById("nearList");
    if (nearBtn && nearList && window.RF) nearBtn.addEventListener("click", function () {
        if (!navigator.geolocation || !window.isSecureContext) { nearList.textContent = "위치는 https 주소에서만 쓸 수 있습니다."; return; }
        nearList.textContent = "현재 위치를 찾는 중…";
        navigator.geolocation.getCurrentPosition(function (pos) {
            fetch("../data/mountains100.json").then(function (r) { return r.json(); }).then(function (j) {
                var me = pos.coords, list = (j.peaks || []).map(function (k) { return { k: k, d: window.RF.distM(me.latitude, me.longitude, k.lat, k.lon) }; })
                    .sort(function (a, b) { return a.d - b.d; }).slice(0, 8);
                nearList.textContent = "";
                var ul = document.createElement("ul");
                ul.className = "ms";
                list.forEach(function (x) {
                    var li = document.createElement("li"), a = document.createElement("a"), sm = document.createElement("small");
                    a.href = encodeURIComponent(x.k.id || x.k.name);
                    a.textContent = (x.k.id || x.k.name) + " ";
                    sm.textContent = Math.round(x.d / 1000) + "km";
                    a.appendChild(sm);
                    li.appendChild(a);
                    ul.appendChild(li);
                });
                nearList.appendChild(ul);
            }).catch(function () { nearList.textContent = "산 목록을 받지 못했습니다."; });
        }, function () { nearList.textContent = "위치를 받지 못했습니다(핸드폰 위치 · 권한을 확인하세요)."; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    });
    // ☀️ 이번 주말 날씨 좋은 산(코스 모음 /m/ - 2026-10-15 홍TV님): 권역마다 토 · 일 낮 날씨, 좋은 권역의 100대 명산
    var wk = document.getElementById("weekend");
    if (wk && window.RF) fetch("../api/weekend").then(function (r) { return r.json(); }).then(function (w) {
        if (w.unavailable || !(w.regions || []).length) return;
        var h = document.createElement("h2");
        h.textContent = "☀️ 이번 주말 날씨 좋은 곳";
        wk.appendChild(h);
        var today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
        w.dates.forEach(function (d) {
            var good = w.regions.filter(function (r) { return r.days[d] && r.days[d].good; });
            var p = document.createElement("p"), b = document.createElement("b");
            b.textContent = window.RF.dayLabel(d, today).replace(/^(오늘|내일|모레|글피) /, "$1 · ");
            p.className = "wday";
            p.appendChild(b);
            p.appendChild(document.createTextNode(good.length ? " 맑거나 구름 조금 · 비 걱정 적은 곳 " + good.length + "권역" : " 날씨 좋은 권역이 없습니다 - 비 · 흐림 예보"));
            wk.appendChild(p);
            good.forEach(function (r) {
                var row = document.createElement("div"), nm = document.createElement("div"), ul = document.createElement("ul");
                row.className = "wreg";
                nm.textContent = r.name + " · " + r.days[d].word + " · 비 " + r.days[d].pop + "%";
                ul.className = "ms";
                r.peaks.slice(0, 8).forEach(function (id) {
                    var li = document.createElement("li"), a = document.createElement("a");
                    a.href = encodeURIComponent(id);
                    a.textContent = id;
                    li.appendChild(a);
                    ul.appendChild(li);
                });
                if (r.peaks.length > 8) { var more = document.createElement("li"); more.className = "dim"; more.textContent = "외 " + (r.peaks.length - 8) + "곳"; ul.appendChild(more); }
                row.appendChild(nm);
                row.appendChild(ul);
                wk.appendChild(row);
            });
        });
        var note = document.createElement("p");
        note.className = "dim";
        note.textContent = "기상청 단기 · 중기예보의 권역 날씨(낮 06 ~ 18시)입니다. 산 위 날씨는 다를 수 있으니 산 페이지의 날짜별 예보를 함께 보세요.";
        wk.appendChild(note);
        wk.hidden = false;
    }).catch(function () { /* 없이 */ });
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
    // 오늘은 단추, 나머지 날은 고르는 칸(2026-10-15 홍TV님: 단추 11개가 세 줄을 차지했음)
    var todayBtn = document.createElement("button"), pick = document.createElement("select");
    todayBtn.type = "button";
    todayBtn.addEventListener("click", function () { picked = today; draw(); });
    pick.setAttribute("aria-label", "다른 날 고르기");
    var hint = document.createElement("option");
    hint.value = "";
    hint.textContent = "다른 날";   // 고르는 칸 제 화살표가 있어 ▾ 는 뺌(2026-10-15 PC: 두 개로 보일 수 있음)
    pick.appendChild(hint);
    pick.addEventListener("change", function () { if (pick.value) { picked = pick.value; draw(); } });
    tabs.appendChild(todayBtn);
    tabs.appendChild(pick);
    var airBox = document.createElement("p");
    airBox.className = "dim";
    box.appendChild(airBox);
    var air = null, wx = null, mid = null, today = null, picked = null;
    function draw() {
        if (!wx) return;
        var day = picked || today, dayMs = Date.parse(day + "T12:00:00+09:00"), mm = wx.days && wx.days[day], lines = [sunLine(dayMs)];
        var md = mid && mid.days && mid.days[day];
        if (md && !wx.hours.some(function (h) { return h.t.slice(0, 10) === day; })) {   // 단기예보 뒤(4~10일) - 기상청 중기예보
            if (RF.tempRange(md.tmn, md.tmx)) lines.push(RF.tempRange(md.tmn, md.tmx));
            RF.midLines(md).forEach(function (l) { lines.push(l); });
            lines.push("기상청 중기예보(" + mid.tmFc + " 발표) · " + mid.region + " 권역 · 기온은 " + mid.city + " 기준 - 산 위는 이보다 춥고 바람이 셉니다. 날이 가까워지면 3시간마다 예보로 바뀝니다.");
            show(lines);
            airBox.textContent = "😷 이 날 미세먼지 예보는 아직 없습니다(에어코리아 예보는 모레까지).";
            airBox.hidden = false;
            markTabs(day);
            return;
        }
        if (mm && RF.tempRange(mm.tmn, mm.tmx)) lines.push(RF.tempRange(mm.tmn, mm.tmx));
        var hours = wx.hours.filter(function (h) { return h.t.slice(0, 10) === day; });
        hours.filter(function (h, i) { return day === today ? i % 3 === 0 : +h.t.slice(11, 13) % 3 === 0; }).slice(0, 8).forEach(function (h) {
            lines.push(h.t.slice(11, 13) + "시  " + RF.weatherWord(h.sky, h.pty) + "  " + (h.tmp != null ? h.tmp + "℃" : "-")
                + "  · 비 " + (h.pop != null ? h.pop + "%" : "-") + "  · 바람 " + (h.wsd != null ? h.wsd + "m/s" : "-"));
        });
        var lastH = hours.length ? +hours[hours.length - 1].t.slice(11, 13) : 23;
        lines.push("기상청 단기예보(" + wx.base + " 발표) · 정상 둘레 5km 격자 - 정상은 이보다 춥고 바람이 셀 수 있습니다."
            + (lastH < 21 ? " 이 날은 " + lastH + "시까지만 나왔습니다(다음 발표에 이어짐)." : ""));
        show(lines);
        var t = day === today ? RF.airText(air) : RF.airForecastText(air, day);
        airBox.textContent = t ? "😷 " + t + " · 에어코리아" : day === today ? "" : "😷 이 날 미세먼지 예보는 아직 없습니다(에어코리아 예보는 모레까지).";
        airBox.hidden = !airBox.textContent;
        markTabs(day);
    }
    function markTabs(day) {
        var on = day === today;
        todayBtn.classList.toggle("on", on);
        todayBtn.setAttribute("aria-pressed", on ? "true" : "false");
        pick.classList.toggle("on", !on);
        pick.value = on ? "" : day;
    }
    function addTab(d) {
        if (d === today) { todayBtn.setAttribute("data-day", d); todayBtn.textContent = RF.dayLabel(d, today); return; }
        if (pick.querySelector('[value="' + d + '"]')) return;
        var o = document.createElement("option");
        o.value = d;
        o.textContent = RF.dayLabel(d, today);
        pick.appendChild(o);
    }
    function addMidTabs() {   // 단기예보 다음 날부터 10일 뒤까지(2026-10-15 홍TV님)
        if (!wx || !mid || !mid.days) return;
        var last = pick.options.length > 1 ? pick.options[pick.options.length - 1].value : today;
        Object.keys(mid.days).sort().forEach(function (d) { if (d > last) addTab(d); });
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
        days.forEach(addTab);   // 단기예보가 주는 날 모두(17시 발표면 나흘 뒤 일부까지 - 2026-10-15 PC: 10/19 단추가 빠졌음)
        addMidTabs();
        draw();
    }).catch(function () { show([sunLine(Date.now()), "날씨를 지금 받지 못했습니다."]); });
})();
