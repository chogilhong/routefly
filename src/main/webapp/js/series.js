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

    /** 인증 받는 곳 한 줄 - routefly 도장 · 완주는 내 기록용이라 운영 기관 인증으로 보냄(2026-10-11 홍TV님). 묶음(g.cert) · 길(s.cert)마다. */
    function certLine(cert) {
        var line = el("div", "cert", "공식 인증: "), link = el("a", null, cert.by + " ›");
        link.href = cert.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        line.appendChild(link);
        if (cert.how) line.appendChild(el("span", null, " - " + cert.how));
        return line;
    }

    /** 100대 명산 - 산 목록(정상 도장)만, 코스 목록은 없음. */
    function peakCard(g, s) {
        var p = RF.seriesProgress(s, stamps, done, peakStamps);
        var box = el("div", "card"), head = el("button"), nm = el("div", "nm", s.name), pg = el("div", "pg");
        head.type = "button";
        // 정상 자료가 없는 산(천성산 · 대암산 - GPX 가 정상 쪽을 안 지남)은 빠져 있음
        nm.appendChild(el("small", null, s.peaks.length + "산" + (s.official > s.peaks.length ? "(" + s.official + "곳 중 정상 자료가 있는 곳)" : "") + " · 정상 150m 안에 가면 도장"));
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
                var st = peakStamps[RF.peakKey(k)], row = el("div", "row"), t = el("div", "t", (st ? "⛰️ " : "⬜ ") + (k.id || k.name));
                // 높이는 안 보임 - GPX 의 GPS 높이라 알려진 높이보다 20~35m 높음(2026-10-12 PC 견줌)
                var info = [k.summit && k.summit !== k.name ? k.summit : "", st ? "도장 " + day(st.t) : "",
                    s.notes && s.notes[k.id] ? s.notes[k.id] : ""].filter(Boolean).join(" · ");   // notes: 정상 대신 다른 곳에서 찍는 까닭(점봉산 - 2026-10-12)
                if (info) t.appendChild(el("span", null, info));
                row.appendChild(t);
                // 코스 - 산 이름으로 찾아 정상 2km 안에서 끝나는(시작하는) 코스만, 누르면 펼침(미리보기 · 따라가기)
                // state: 0 안 부름 · 1 부르는 중 · 2 받음 · 3 실패(다음 누름에 바로 다시 부름 - 2026-10-12 PC: 오류 뒤 첫 누름이 닫기만 했음)
                var more = el("button", "more", "코스 ▾"), list = el("div", "sublist"), state = 0;
                more.type = "button";
                var setOpen = function (open) {
                    list.classList.toggle("open", open);
                    more.textContent = open ? "코스 ▴" : "코스 ▾";
                };
                more.addEventListener("click", function () {
                    if (state === 1) return;
                    if (state === 2) { setOpen(!list.classList.contains("open")); return; }
                    setOpen(true);
                    state = 1;
                    list.textContent = "";
                    var wait = el("div", "tip", "코스를 찾는 중…");
                    list.appendChild(wait);
                    getJson("api/courses?q=" + encodeURIComponent(k.name)).then(function (j) {
                        if (!j || !Array.isArray(j.courses)) throw new Error("코스를 읽지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
                        wait.remove();
                        state = 2;
                        var cs = RF.peakCourses(j.courses, k, 2000).slice(0, 8);
                        if (!cs.length) list.appendChild(el("div", "tip", "정상까지 가는 코스를 찾지 못했습니다."));
                        cs.forEach(function (c) { list.appendChild(courseRow(c)); });
                    }).catch(function (e) {
                        state = 3;
                        wait.textContent = (e.message || "코스를 읽지 못했습니다.") + " (코스 ▴ 를 다시 누르면 다시 찾습니다)";
                    });
                });
                row.appendChild(more);
                body.appendChild(row);
                body.appendChild(list);
            });
        });
        return box;
    }

    function card(g, s) {
        if (s.peaks) return peakCard(g, s);
        var p = RF.seriesProgress(s, stamps, done);
        var box = el("div", "card"), head = el("button"), nm = el("div", "nm", s.name), pg = el("div", "pg");
        head.type = "button";
        // 코리아둘레길: 두루누비 API 가 일부 코스만 줌 - 공식 코스 수(official)를 함께 보여 "다 걸었다" 로 오해하지 않게(2026-10-12 PC)
        nm.appendChild(el("small", null, s.ids ? s.ids.length + g.unit + " · " + Math.round(s.meters / 1000) + "km" + (s.official ? " (공식 " + s.official + "코스 중 앱에 있는 것)" : "")
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
            var centerRows = [];
            if (s.centers) {
                body.appendChild(el("div", "sub", "인증센터(차례대로)"));
                s.centers.forEach(function (n) {
                    var st = RF.stampOf(stamps, n, s.aka && s.aka[n]), row = el("div", "row"), t = el("div", "t", (st ? "📮 " : "⬜ ") + n + " 인증센터");
                    if (st) t.appendChild(el("span", null, "도장 " + day(st.t)));
                    row.appendChild(t);
                    body.appendChild(row);
                    centerRows.push(row);
                });
            }
            if (s.prefix || s.q) {   // 노선 안내도 - 구간 · 코스 전체 지도(2026-10-12 홍TV님), 코리아둘레길은 이름으로(trail)
                var rl = el("a", "routemap", "🗺 " + s.name + " 노선 안내도 ›");
                rl.href = "route.html?" + (s.prefix ? "prefix=" + encodeURIComponent(s.prefix) : "trail=" + encodeURIComponent(s.match || s.name)) + "&back=series";
                body.insertBefore(rl, body.firstChild);
            }
            if (s.cert) body.appendChild(certLine(s.cert));
            body.appendChild(el("div", "sub", "코스"));
            var wait = el("div", "tip", "코스를 불러오는 중…");
            body.appendChild(wait);
            (s.list ? Promise.resolve({ courses: s.list }) : getJson("api/group?prefix=" + encodeURIComponent(s.prefix))).then(function (j) {
                wait.remove();
                if (!j.courses.length) body.appendChild(el("div", "tip", "아직 코스가 없습니다."));
                // 지리산둘레길: 주천-운봉부터 걷는 차례로. 자전거길: 구간 끝 → 다음 시작으로 땅 위 차례(끊긴 묶음의 뒷번호 구간도 제자리)
                var list = s.chainFrom ? RF.chainOrder(j.courses, s.chainFrom) : s.centers ? RF.geoOrder(j.courses) : j.courses;
                list.forEach(function (c) { body.appendChild(courseRow(c)); });
                // 인증센터마다 그 센터를 지나는 구간의 미리보기 · 따라가기(2026-10-12 홍TV님)
                if (centerRows.length) RF.centerCourses(list, s.centers, j.centers, s.aka).forEach(function (c, i) {
                    if (!c) return;
                    var id = encodeURIComponent(c.course_id), a = el("a", null, "미리보기"), b = el("a", "main", "따라가기");
                    a.href = "index.html#c=" + id;
                    b.href = "hike.html#c=" + id;
                    a.title = b.title = RF.nameText(c.name);
                    centerRows[i].appendChild(a);
                    centerRows[i].appendChild(b);
                });
            }).catch(function (e) { wait.textContent = e.message || "코스를 읽지 못했습니다."; });
        });
        return box;
    }

    /** 이름으로 찾는 길(q - 코리아둘레길) · 구간 수가 없는 노선(백두대간 · 정맥)은 그리기 전에 코스 목록을 받아 수 · 길이 · 완주를 셈. 못 받으면 0 으로. */
    function loadNamed(d) {
        var named = [], files = [];
        d.groups.forEach(function (g) {
            g.series.forEach(function (s) {
                // 백두대간 · 정맥: 공식 구간 수가 없어 앱에 있는 구간(api/group)으로 셈
                if (s.q || (s.prefix && s.courses == null && !s.centers)) named.push(s);
                if (s.summits) files.push(s);
            });
        });
        // 100대 명산: 정상 목록 파일(summits)을 받아 둠. 못 받거나 비면 그 묶음을 안 보임
        var peaksReady = files.map(function (s) {
            return fetch(s.summits).then(function (r) { return r.json(); }).then(function (j) { s.peaks = (j && j.peaks) || []; }, function () { s.peaks = []; });
        });
        return Promise.all(peaksReady.concat(named.map(function (s) {
            var url = s.q ? "api/courses?q=" + encodeURIComponent(s.q) : "api/group?prefix=" + encodeURIComponent(s.prefix);
            return getJson(url).then(function (j) { return j.courses; }, function () { return []; }).then(function (all) {
                s.list = s.q ? RF.trailCourses(all, s.match || s.name) : all;
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
            if (g.cert) list.appendChild(certLine(g.cert));
            g.series.forEach(function (s) { list.appendChild(card(g, s)); });
        });
    }).catch(function () { $("list").textContent = "목록을 읽지 못했습니다."; });
})();
