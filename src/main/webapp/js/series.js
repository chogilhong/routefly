/*
 * 국토종주 자전거길 · 국가숲길 모아 보기(series.html) - data/series.json 의 노선 · 길마다 진행(인증센터 도장 · 코스 완주)과 코스 목록.
 * 도장 · 완주는 따라가기(hike.js)가 이 핸드폰의 localStorage 에 남긴 것(rf-stamps · rf-done)을 읽기만 합니다. 2026-10-11 홍TV님.
 */
(function () {
    "use strict";
    var RF = window.RF;
    function $(id) { return document.getElementById(id); }
    function load(key) { try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (e) { return {}; } }
    var stamps = load("rf-stamps"), done = load("rf-done");

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

    function card(g, s) {
        var p = RF.seriesProgress(s, stamps, done);
        var box = el("div", "card"), head = el("button"), nm = el("div", "nm", s.name), pg = el("div", "pg");
        head.type = "button";
        nm.appendChild(el("small", null, s.km + "km" + (s.centers ? " · 인증센터 " + s.centers.length + "곳" : " · " + s.courses + "코스")));
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
            getJson("api/group?prefix=" + encodeURIComponent(s.prefix)).then(function (j) {
                wait.remove();
                if (!j.courses.length) body.appendChild(el("div", "tip", "아직 코스가 없습니다."));
                // 지리산둘레길: 주천-운봉부터 걷는 차례로. 자전거길: 구간 끝 → 다음 시작으로 땅 위 차례(끊긴 묶음의 뒷번호 구간도 제자리)
                var list = s.chainFrom ? RF.chainOrder(j.courses, s.chainFrom) : s.centers ? RF.geoOrder(j.courses) : j.courses;
                list.forEach(function (c) { body.appendChild(courseRow(c)); });
            }).catch(function (e) { wait.textContent = e.message || "코스를 읽지 못했습니다."; });
        });
        return box;
    }

    getJson("data/series.json").catch(function () {
        return fetch("data/series.json").then(function (r) { return r.json(); });
    }).then(function (d) {
        var list = $("list");
        list.textContent = "";
        d.groups.forEach(function (g) {
            var got = 0, of = 0;
            g.series.forEach(function (s) { var p = RF.seriesProgress(s, stamps, done); got += p.got; of += p.of; });
            list.appendChild(el("h2", null, g.icon + " " + g.title));
            list.appendChild(el("div", "sum", g.series.length + "개 · " + g.unit + " " + got + " / " + of));
            g.series.forEach(function (s) { list.appendChild(card(g, s)); });
        });
    }).catch(function () { $("list").textContent = "목록을 읽지 못했습니다."; });
})();
