/*
 * 국토종주 자전거길 · 국가숲길 · 코리아둘레길 · 100대 명산 모아 보기(series.html) - data/series.json 의 노선 · 길마다 진행(인증센터 도장 · 코스 완주)과 코스 목록.
 * 도장 · 완주는 따라가기(hike.js)가 이 핸드폰의 localStorage 에 남긴 것(rf-stamps · rf-done · rf-peaks)을 읽기만 합니다. 2026-10-11 홍TV님.
 */
(function () {
    "use strict";
    var RF = window.RF;
    function $(id) { return document.getElementById(id); }
    function load(key) { try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (e) { return {}; } }
    var stamps = load("rf-stamps"), done = load("rf-done"), peakStamps = load("rf-peaks");

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
            return r.json().then(function (j) {
                if (!r.ok || !j || j.success === false) throw new Error((j && j.message) || ("HTTP " + r.status));
                return j;
            });
        });
    }

    function day(t) {
        var d = new Date(t);
        return d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate();
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    /** 코스 한 줄 - 이름 · 거리 · (완주) · 미리보기 · 따라가기. */
    function courseRow(c) {
        var row = el("div", "row"), t = el("div", "t");
        var d = done[c.course_id];
        t.appendChild(document.createTextNode((d ? "✅ " : "") + RF.nameText(c.name)));
        t.appendChild(el("span", null, RF.km(c.distance_m) + "km · 오르막 " + RF.num(c.ascent_m) + "m" + (d ? " · 완주 " + day(d.t) : "")));
        row.appendChild(t);
        var id = encodeURIComponent(c.course_id), a = el("a", null, "미리보기"), b = el("a", "main", "따라가기");
        a.href = "index.html#c=" + id;
        b.href = "hike.html#c=" + id;
        row.appendChild(a);
        row.appendChild(b);
        return row;
    }

    /** 100대 명산 - 산 목록(정상 도장)만, 코스 목록은 없음. */
    function peakCard(g, s) {
        var p = RF.seriesProgress(s, stamps, done, peakStamps);
        var box = el("div", "card"), head = el("button"), nm = el("div", "nm", s.name), pg = el("div", "pg");
        head.type = "button";
        nm.appendChild(el("small", null, s.peaks.length + "산 · 정상 150m 안에 가면 도장"));
        pg.innerHTML = "<b>" + p.got + "</b> / " + p.of + " " + g.unit;
        head.appendChild(nm);
        head.appendChild(pg);
        var bar = el("div", "bar"), fill = el("i"), body = el("div", "body");
        fill.style.width = (p.of ? Math.round(p.got * 100 / p.of) : 0) + "%";
        bar.appendChild(fill);
        box.appendChild(head);
        box.appendChild(bar);
        box.appendChild(body);
        var loaded = false;
        head.addEventListener("click", function () {
            box.classList.toggle("open");
            if (loaded) return;
            loaded = true;
            s.peaks.forEach(function (k) {
                var st = peakStamps[RF.peakKey(k)], row = el("div", "row"), t = el("div", "t", (st ? "⛰️ " : "⬜ ") + k.name);
                var info = [k.region, k.height ? RF.num(k.height) + "m" : "", st ? "도장 " + day(st.t) : ""].filter(Boolean).join(" · ");
                if (info) t.appendChild(el("span", null, info));
                row.appendChild(t);
                body.appendChild(row);
            });
        });
        return box;
    }

    function card(g, s) {
        if (s.peaks) return peakCard(g, s);
        var p = RF.seriesProgress(s, stamps, done);
        var box = el("div", "card"), head = el("button"), nm = el("div", "nm", s.name), pg = el("div", "pg");
        head.type = "button";
        nm.appendChild(el("small", null, s.ids ? s.ids.length + "코스 · " + Math.round(s.meters / 1000) + "km"
            : s.km + "km" + (s.centers ? " · 인증센터 " + s.centers.length + "곳" : " · " + s.courses + "코스")));
        pg.innerHTML = "<b>" + p.got + "</b> / " + p.of + " " + g.unit;
        head.appendChild(nm);
        head.appendChild(pg);
        var bar = el("div", "bar"), fill = el("i");
        fill.style.width = (p.of ? Math.round(p.got * 100 / p.of) : 0) + "%";
        bar.appendChild(fill);
        var body = el("div", "body");
        box.appendChild(head);
        box.appendChild(bar);
        box.appendChild(body);
        var loaded = false;
        head.addEventListener("click", function () {
            box.classList.toggle("open");
            if (loaded) return;
            loaded = true;
            if (s.centers) {
                body.appendChild(el("div", "sub", "인증센터(차례대로)"));
                s.centers.forEach(function (n) {
                    var st = RF.stampOf(stamps, n), row = el("div", "row"), t = el("div", "t", (st ? "📮 " : "⬜ ") + n + " 인증센터");
                    if (st) t.appendChild(el("span", null, "도장 " + day(st.t)));
                    row.appendChild(t);
                    body.appendChild(row);
                });
            }
            body.appendChild(el("div", "sub", "코스"));
            var wait = el("div", "tip", "코스를 불러오는 중…");
            body.appendChild(wait);
            (s.list ? Promise.resolve({ courses: s.list }) : getJson("api/group?prefix=" + encodeURIComponent(s.prefix))).then(function (j) {
                wait.remove();
                if (!j.courses.length) body.appendChild(el("div", "tip", "아직 코스가 없습니다."));
                // 지리산둘레길: 주천-운봉부터 걷는 차례로. 자전거길: 구간 끝 → 다음 시작으로 땅 위 차례(끊긴 묶음의 뒷번호 구간도 제자리)
                var list = s.chainFrom ? RF.chainOrder(j.courses, s.chainFrom) : s.centers ? RF.geoOrder(j.courses) : j.courses;
                list.forEach(function (c) { body.appendChild(courseRow(c)); });
            }).catch(function (e) { wait.textContent = e.message || "코스를 읽지 못했습니다."; });
        });
        return box;
    }

    /** 이름으로 찾는 길(q - 코리아둘레길)은 그리기 전에 코스 목록을 받아 수 · 길이 · 완주를 셈. 못 받으면 0 코스로. */
    function loadNamed(d) {
        var named = [], files = [];
        d.groups.forEach(function (g) { g.series.forEach(function (s) { if (s.q) named.push(s); if (s.summits) files.push(s); }); });
        // 100대 명산: 정상 목록 파일(summits)을 받아 둠. 못 받거나 비면 그 묶음을 안 보임
        var peaksReady = files.map(function (s) {
            return fetch(s.summits).then(function (r) { return r.json(); }).then(function (j) { s.peaks = (j && j.peaks) || []; }, function () { s.peaks = []; });
        });
        return Promise.all(peaksReady.concat(named.map(function (s) {
            return getJson("api/courses?q=" + encodeURIComponent(s.q)).then(function (j) { return j.courses; }, function () { return []; }).then(function (all) {
                s.list = RF.trailCourses(all, s.match || s.name);
                s.ids = s.list.map(function (c) { return c.course_id; });
                s.meters = s.list.reduce(function (m, c) { return m + (+c.distance_m || 0); }, 0);
            });
        }))).then(function () { return d; });
    }

    getJson("data/series.json").catch(function () {
        return fetch("data/series.json").then(function (r) { return r.json(); });
    }).then(loadNamed).then(function (d) {
        var list = $("list");
        list.textContent = "";
        d.groups.forEach(function (g) {
            var got = 0, of = 0;
            g.series = g.series.filter(function (s) { return !s.summits || s.peaks.length; });
            if (!g.series.length) return;
            g.series.forEach(function (s) { var p = RF.seriesProgress(s, stamps, done, peakStamps); got += p.got; of += p.of; });
            list.appendChild(el("h2", null, g.icon + " " + g.title));
            list.appendChild(el("div", "sum", g.series.length + "개 · " + g.unit + " " + got + " / " + of));
            if (g.cert) {   // 나라(기관)가 인정하는 인증 받는 곳 - routefly 도장 · 완주는 내 기록용(2026-10-11 홍TV님)
                var cert = el("div", "cert", "공식 인증: "), link = el("a", null, g.cert.by + " ›");
                link.href = g.cert.url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                cert.appendChild(link);
                if (g.cert.how) cert.appendChild(el("span", null, " - " + g.cert.how));
                list.appendChild(cert);
            }
            g.series.forEach(function (s) { list.appendChild(card(g, s)); });
        });
    }).catch(function () { $("list").textContent = "목록을 읽지 못했습니다."; });
})();
