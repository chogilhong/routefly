/*
 * 노선 안내도(route.html?prefix=osmb-6374513- 또는 ?trail=해파랑길 [&name=…][&back=list|series]) - 국토종주 자전거길 · 국가숲길 · 코리아둘레길 ·
 * 백두대간 · 정맥(osmh-, 2026-10-12 홍TV님) 한 노선 전체를 한 장에.
 * 2026-10-12 홍TV님: 국토종주 자전거길 노선도(나무위키)처럼 - 빨간 노선 · 인증센터 차례 번호. 구간을 누르면 그 구간을 따라가기로.
 * 자료: /api/group?prefix=…&lines=1 (구간 목록 · 줄인 선 · 인증센터 이름표 자리), data/series.json(노선 이름 · 길이 · 인증센터 차례 · 다른 이름),
 * 도장은 이 핸드폰의 rf-stamps(따라가기가 남김)만 읽음.
 */
(function () {
    "use strict";
    var RF = window.RF;
    function $(id) { return document.getElementById(id); }
    var q = new URLSearchParams(location.search), prefix = q.get("prefix") || "", trail = q.get("trail") || "", backTo = q.get("back");
    var map, data = null, series = null, ctrs = [];
    // 코스 · 구간 번호를 지도에 붙이는 노선(인증센터가 없는 것): 코리아둘레길 · 백두대간 · 정맥
    var numbered = !!trail || /^osmh-/.test(prefix);

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
            return r.json().catch(function () { return { success: false, message: "응답을 읽지 못했습니다 (HTTP " + r.status + ")" }; })
                .then(function (j) {
                    if (!r.ok || !j || j.success === false) throw new Error((j && j.message) || ("HTTP " + r.status));
                    return j;
                });
        });
    }

    function loadStamps() { try { return JSON.parse(localStorage.getItem("rf-stamps") || "{}") || {}; } catch (e) { return {}; } }

    /** series.json 에서 이 노선(prefix 가 같은 것, 둘레길은 이름이 같은 것). 없으면 null. */
    function findSeries(d) {
        var hit = null, tk = trail.replace(/\s+/g, "");
        ((d && d.groups) || []).forEach(function (g) {
            g.series.forEach(function (s) {
                if (prefix ? s.prefix === prefix : (s.match || s.name || "").replace(/\s+/g, "") === tk) hit = s;
            });
        });
        return hit;
    }

    /** 둘레길 · 백두대간 · 정맥 - 코스(구간)마다 시작점에 번호(1, 2, 19-1 …). */
    function drawCourseNumbers() {
        data.courses.forEach(function (c) {
            var line = data.lines[c.course_id], no = RF.courseNo(c.name);
            if (!line || !no) return;
            var e = document.createElement("div");
            e.className = "ctr num";   // 넓게 볼 때 겹치는 번호는 숨김(확대하면 보임)
            e.innerHTML = '<div class="no"></div>';
            e.querySelector(".no").textContent = no;
            e.title = RF.nameText(c.name);
            new maplibregl.Marker({ element: e }).setLngLat(line[0]).addTo(map);
            ctrs.push({ el: e, prio: +no.split("-")[0] });
        });
    }

    /** 구간 하나를 고름 - 굵게 · 아래 칸에 이름 · 거리와 따라가기. */
    function pick(c) {
        map.getSource("sel").setData(c && data.lines[c.course_id]
            ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: data.lines[c.course_id] } }
            : { type: "FeatureCollection", features: [] });
        if (!c) return;
        $("sheet").innerHTML = "";
        var nm = document.createElement("div");
        nm.className = "nm";
        nm.textContent = RF.nameText(c.name);
        var st = document.createElement("div");
        st.className = "st";
        st.textContent = RF.km(c.distance_m) + "km · 오르막 " + RF.num(c.ascent_m) + "m";
        var row = document.createElement("div");
        row.className = "row";
        var a = document.createElement("a");
        a.className = "main";
        a.href = "hike.html#c=" + encodeURIComponent(c.course_id);
        a.textContent = "따라가기";
        row.appendChild(a);
        $("sheet").appendChild(nm);
        $("sheet").appendChild(st);
        $("sheet").appendChild(row);
    }

    /**
     * 인증센터 - series.json 차례대로 번호(①②…), 도장 찍은 곳은 초록. 자리는 구간 이름표(같은 센터가 두 구간 끝에 있으면 하나만).
     * 이름표가 없는(차례 목록에만 있는) 센터는 그리지 않음.
     */
    function drawCenters() {
        if (!series || !series.centers || !data.centers) return;
        var stamps = loadStamps(), aka = series.aka || {};
        series.centers.forEach(function (n, i) {
            var ks = [n].concat(aka[n] || []).map(RF.stampKey);
            var at = data.centers.filter(function (m) {
                var k = String(m.name || "").replace(/\s+/g, "");
                return m.lat != null && ks.some(function (x) { return x && k.indexOf(x) >= 0; });
            })[0];
            if (!at) return;
            var e = document.createElement("div");
            e.className = "ctr" + (RF.stampOf(stamps, n, aka[n]) ? " got" : "");
            e.innerHTML = '<div class="no"></div><div class="lb"></div>';
            e.querySelector(".no").textContent = String(i + 1);
            e.querySelector(".lb").textContent = n;
            e.title = n + " 인증센터";
            new maplibregl.Marker({ element: e, anchor: "top" }).setLngLat([+at.lon, +at.lat]).addTo(map);
            ctrs.push({ el: e.querySelector(".lb"), prio: i });
        });
    }

    function draw() {
        var ids = data.courses.map(function (c) { return c.course_id; }).filter(function (id) { return data.lines[id]; });
        var feats = data.courses.filter(function (c) { return data.lines[c.course_id]; }).map(function (c, i) {
            return { type: "Feature", properties: { i: data.courses.indexOf(c), alt: i % 2 }, geometry: { type: "LineString", coordinates: data.lines[c.course_id] } };
        });
        map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: feats } });
        map.addLayer({ id: "route-case", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 } });
        // 구간마다 빨강 · 진빨강 번갈아(어디서 구간이 바뀌는지 보이게)
        map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": ["case", ["==", ["get", "alt"], 1], "#a61e1e", "#e03131"], "line-width": 4 } });
        map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "sel", type: "line", source: "sel", layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": RF.LINE_COLOR, "line-width": 7 } });
        map.addLayer({ id: "route-hit", type: "line", source: "route", paint: { "line-color": "#000", "line-opacity": 0, "line-width": 22 } });
        map.on("click", "route-hit", function (e) {
            var f = e.features && e.features[0];
            if (f) pick(data.courses[f.properties.i]);
        });
        map.on("mouseenter", "route-hit", function () { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "route-hit", function () { map.getCanvas().style.cursor = ""; });
        if (numbered) drawCourseNumbers(); else drawCenters();
        // 겹치는 이름표 · 번호 숨기기 - 지도가 움직이는 동안 0.15초마다 다시(둘레길 번호도)
        var timer = 0;
        map.on("render", function () {
            if (timer) return;
            timer = setTimeout(function () { timer = 0; RF.declutter(ctrs); }, 150);
        });
        var b = null;
        ids.forEach(function (id) {
            data.lines[id].forEach(function (p) {
                if (!b) b = [p[0], p[1], p[0], p[1]];
                b = [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])];
            });
        });
        // 옆 여백은 센터 이름 글자 자리
        if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { top: 30, bottom: 40, left: 56, right: 56 }, duration: 0 });
        $("msg").style.display = "none";
    }

    function start() {
        // ← 뒤로: 따라가기 목록 카드에서 왔으면 그 목록(검색어는 rf-search 로 남아 있음), 그 밖은 도장 · 완주
        $("back").href = backTo === "list" ? "hike.html" : "series.html";
        $("followNone").addEventListener("click", function (e) {
            e.preventDefault();
            alert("구간을 선택하세요.");
        });
        if (!/^(osmb|kmf|osmh)-[0-9]+-$/.test(prefix) && !trail) { $("msg").textContent = "노선을 찾지 못했습니다."; return; }
        Promise.all([
            getJson("api/map-config").catch(function () { return {}; }),
            getJson(trail ? "api/group?trail=" + encodeURIComponent(trail) : "api/group?prefix=" + encodeURIComponent(prefix) + "&lines=1"),
            fetch("data/series.json").then(function (r) { return r.json(); }).catch(function () { return null; })
        ]).then(function (r) {
            var cfg = { demUrl: r[0].demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: r[0].vworldKey || null };
            data = r[1];
            series = findSeries(r[2]);
            // 둘레길: 이름 검색이라 다른 길("DMZ 평화의 길" 로 찾은 다른 이름)도 섞일 수 있어 그 길 코스만, 코스 번호 차례로
            if (trail) data.courses = RF.trailCourses(data.courses, trail);
            // 이름: series.json → 주소의 name → 첫 구간 이름 앞("백두대간 1구간 · …" → 백두대간)
            var name = (series && series.name) || q.get("name")
                || (data.courses[0] && String(data.courses[0].name || "").replace(/\s*\d+(?:-\d+)?\s*(?:구간|코스).*$/, "").trim()) || "노선";
            var km = series && series.km ? series.km : Math.round(data.courses.reduce(function (m, c) { return m + (+c.distance_m || 0); }, 0) / 1000);
            $("title").textContent = name + " " + km + "km" + (numbered ? " · " + data.courses.length + (trail ? "코스" : "구간") + (series && series.official ? "(공식 " + series.official + ")" : "") : "");
            document.title = name + " 노선 안내도 - routefly";
            if (!data.courses.length) { $("msg").textContent = "아직 코스가 없습니다."; return; }
            map = new maplibregl.Map({ container: "map", style: RF.baseStyle(cfg), center: [127.8, 36.3], zoom: 7,
                attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false });
            map.touchZoomRotate.disableRotation();
            map.addControl(new maplibregl.AttributionControl({ compact: true,
                customAttribution: "노선: © OpenStreetMap contributors · 산림청 · 한국등산트레킹지원센터 | <a href=\"about.html\">안내</a>" }), "top-right");
            // 출처는 ⓘ 로 접어 둠(탐방 안내도와 같게 - 지도를 가리지 않게)
            var fold = function () { var at = document.querySelector(".maplibregl-ctrl-attrib"); if (at) at.classList.remove("maplibregl-compact-show"); };
            fold();
            map.once("load", fold);
            map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
            map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
            map.once("load", draw);
        }).catch(function (e) {
            $("msg").textContent = e.message || "노선을 읽지 못했습니다.";
        });
    }

    start();
})();
