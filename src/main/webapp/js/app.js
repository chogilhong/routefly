/* routefly 화면 - 코스를 고르면 3D 지형 위에서 경로를 그리며 따라 날아갑니다.
 *
 * 자료: /api/map-config · /api/courses · /api/course?id=  (routefly-batch 가 넣은 표)
 * 지도: MapLibre GL JS - 3D 지형(Terrarium 고도 타일) + 배경(V-World 위성사진, 키가 없으면 지형 음영)
 *
 * 비행 한 번의 흐름
 *   1) 출발점으로 날아가 낮게 기울입니다.
 *   2) 매 프레임 진행 거리(d)를 늘리고, 그 거리의 위치로 카메라를 옮깁니다. 방향은 조금 앞 지점을 바라보게 부드럽게 돌립니다.
 *   3) 경로선은 line-gradient 로 지나온 만큼만 칠합니다. 거리 · 고도 · 고도 그래프 커서 · 이름표가 같이 움직입니다.
 *   4) 끝나면 코스 전체가 보이게 물러납니다.
 * 지도를 끌거나 돌리면 비행을 멈춥니다(사용자 조작이 먼저). */
(function () {
    "use strict";

    var ROUTE_COLOR = "#ffb703";   // 화면 강조색(목록 · 버튼 · 출발점)
    var LINE_COLOR = "#38d9ea";    // 지나온 길 - 위성사진 위에서 잘 보이는 하늘색(영상처럼)
    var SPEEDS = [1, 2, 4];

    var map;
    var mapReady;            // 지도 스타일이 읽힌 뒤 경로 층을 붙이고 풀리는 약속 - 목록은 이것을 기다리지 않습니다
    var courses = [];
    var list = { q: null, truncated: false, seq: 0, timer: 0 };   // 목록 상태 - 검색어가 있으면 검색, 없으면 지도 범위
    var cur = null;          // 지금 코스 {id, course, lon[], lat[], ele[], dist[], total, pois[], markers[]}
    var anim = { running: false, d: 0, speedIdx: 0, last: 0, bearing: 0, pitch: 70, pitchWant: 70, pitchAt: 0, raf: 0 };

    // ------------------------------------------------------------------ 작은 도구

    function $(id) { return document.getElementById(id); }
    function num(n, digits) {
        if (n == null || !isFinite(n)) return "-";
        return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
    }
    function km(m) { return num(m / 1000, 2); }
    function show(text) {
        var el = $("msg");
        if (!text) { el.style.display = "none"; return; }
        el.textContent = text;
        el.style.display = "block";
    }
    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
            return r.json().catch(function () { return { success: false, message: "응답을 읽지 못했습니다 (HTTP " + r.status + ")" }; })
                .then(function (j) {
                    if (!r.ok || !j.success) throw new Error(j.message || ("HTTP " + r.status));
                    return j;
                });
        });
    }

    /** 두 점 사이 방위각(도, 북 0 · 동 90). */
    function bearingOf(lon1, lat1, lon2, lat2) {
        var p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
        var y = Math.sin(dl) * Math.cos(p2);
        var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }
    /** a → b 로 가는 가장 짧은 회전(-180 ~ 180). */
    function angleDiff(a, b) { return ((b - a + 540) % 360) - 180; }

    /** 진행 거리 d(m)의 위치 · 고도(course-kit.js). */
    var at = RF.at;

    /** 코스 길이에 맞춘 따라가기 줌 · 앞을 보는 거리 · 비행 시간(1× 기준). 등산로부터 장거리까지 한 식으로. */
    function flightPlan(totalM) {
        var k = Math.max(totalM / 1000, 0.5);
        return {
            zoom: Math.max(10.3, Math.min(16.1, 16.1 - 0.6 * Math.log2(k / 5))),   // 영상처럼 가깝게
            lookAhead: Math.max(150, Math.min(totalM * 0.04, 8000)),
            durationMs: Math.max(20000, Math.min(k * 2500, 90000))
        };
    }

    // ------------------------------------------------------------------ 지도

    function buildStyle(cfg) {
        var demSource = {
            type: "raster-dem", tiles: [cfg.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: 15,
            attribution: "지형: <a href=\"https://registry.opendata.aws/terrain-tiles/\" target=\"_blank\" rel=\"noopener\">Terrain Tiles (AWS Open Data)</a>"
        };
        var sources = {
            // 지형과 음영은 출처를 따로 둡니다(MapLibre 권장 - 같은 출처를 쓰면 음영 해상도가 떨어집니다).
            terrain: demSource,
            hillshade: Object.assign({}, demSource)
        };
        var layers = [{ id: "bg", type: "background", paint: { "background-color": cfg.vworldKey ? "#1b2430" : "#dcd6c6" } }];
        if (cfg.vworldKey) {
            var key = encodeURIComponent(cfg.vworldKey);
            sources.sat = {
                type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19,
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/{z}/{y}/{x}.jpeg"],
                attribution: "위성사진: <a href=\"https://www.vworld.kr\" target=\"_blank\" rel=\"noopener\">국토교통부 V-World</a>"
            };
            sources.label = {
                type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19,
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Hybrid/{z}/{y}/{x}.png"]
            };
            layers.push({ id: "sat", type: "raster", source: "sat" });
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade",
                paint: { "hillshade-exaggeration": 0.25, "hillshade-shadow-color": "#000000" } });
            // 지명 · 도로 겹침. 글자가 길을 따라 비스듬히 쓰여 우리 이름표와 겹치므로 비행 중에는 흐리게 숨깁니다(setMapLabels).
            layers.push({ id: "label", type: "raster", source: "label",
                paint: { "raster-opacity": 0.9, "raster-opacity-transition": { duration: 800, delay: 0 } } });
        } else {
            // 위성사진 키가 없으면 지형 음영만으로 그립니다(산 모양은 그대로 보입니다).
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade",
                paint: { "hillshade-exaggeration": 0.65, "hillshade-shadow-color": "#3d4a3a",
                         "hillshade-highlight-color": "#fbf7ea", "hillshade-accent-color": "#5f6f55" } });
        }
        return {
            version: 8,
            sources: sources,
            layers: layers,
            terrain: { source: "terrain", exaggeration: 1.25 },
            sky: { "sky-color": "#7fb4e8", "horizon-color": "#d9e8f5", "fog-color": "#e8eef4",
                   "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.35 }
        };
    }

    function addRouteLayers() {
        // 코스 출발점(목록과 같은 코스들) - 가까운 것은 묶어서 큰 원으로. 누르면 그 코스를 엽니다.
        map.addSource("starts", { type: "geojson", data: startsData(), cluster: true, clusterRadius: 42, clusterMaxZoom: 13 });
        map.addLayer({ id: "starts-cluster", type: "circle", source: "starts", filter: ["has", "point_count"],
            paint: { "circle-color": "rgba(255,183,3,0.82)", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2,
                     "circle-radius": ["step", ["get", "point_count"], 13, 10, 17, 50, 22, 200, 28] } });
        map.addLayer({ id: "starts-point", type: "circle", source: "starts", filter: ["!", ["has", "point_count"]],
            paint: { "circle-color": ROUTE_COLOR, "circle-radius": 6, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
        map.on("click", "starts-point", function (e) {
            var f = e.features && e.features[0];
            if (f) select(f.properties.id);
        });
        map.on("click", "starts-cluster", function (e) {
            var f = e.features && e.features[0];
            if (!f) return;
            Promise.resolve(map.getSource("starts").getClusterExpansionZoom(f.properties.cluster_id)).then(function (z) {
                map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.5 });
            });
        });
        ["starts-point", "starts-cluster"].forEach(function (id) {
            map.on("mouseenter", id, function () { map.getCanvas().style.cursor = "pointer"; });
            map.on("mouseleave", id, function () { map.getCanvas().style.cursor = ""; });
        });

        map.addSource("route", { type: "geojson", lineMetrics: true, data: emptyLine() });
        map.addSource("head", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        // 남은 길 - 흐린 가는 선(비행 전에도 코스가 보이게)
        map.addLayer({ id: "route-all", type: "line", source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#e8fff4", "line-opacity": 0.55, "line-width": 2 } });
        // 지나온 길 - 어두운 테두리 + 번짐 + 본선(밝은 위성사진 위에서도 또렷하게)
        map.addLayer({ id: "route-casing", type: "line", source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 7, "line-opacity": 0.35, "line-gradient": progressGradient(0, "rgba(0,20,30,1)") } });
        map.addLayer({ id: "route-glow", type: "line", source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 12, "line-blur": 8, "line-opacity": 0.5, "line-gradient": progressGradient(0) } });
        map.addLayer({ id: "route-done", type: "line", source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 4, "line-gradient": progressGradient(0) } });
        // 현재 위치 바닥의 번짐 - 숨 쉬듯 커졌다 작아집니다(tick 에서). 위치 표시 자체는 동그란 배지(headMarker)
        map.addLayer({ id: "head-halo", type: "circle", source: "head",
            paint: { "circle-radius": 14, "circle-color": LINE_COLOR, "circle-opacity": 0.35, "circle-blur": 0.5,
                     "circle-pitch-alignment": "map" } });
    }

    function emptyLine() { return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } }; }

    /** 경로선 0~p 만 칠하는 색 식. p 는 0~1 (line-progress 는 선 길이 비율입니다). */
    function progressGradient(p, color) {
        var on = color || LINE_COLOR, clear = "rgba(56,217,234,0)";
        if (p <= 0.0001) return ["step", ["line-progress"], clear, 1, clear];
        if (p >= 0.9999) return ["step", ["line-progress"], on, 1, on];
        return ["step", ["line-progress"], on, p, clear];
    }

    function setProgressPaint(p) {
        var g = progressGradient(p);
        map.setPaintProperty("route-done", "line-gradient", g);
        map.setPaintProperty("route-glow", "line-gradient", g);
        map.setPaintProperty("route-casing", "line-gradient", progressGradient(p, "rgba(0,20,30,1)"));
    }

    // ------------------------------------------------------------------ 코스 목록

    function startsData() {
        return { type: "FeatureCollection", features: courses.filter(function (c) {
            return !cur || c.course_id !== cur.id;
        }).map(function (c) {
            return { type: "Feature", properties: { id: c.course_id, name: c.name },
                     geometry: { type: "Point", coordinates: [+c.start_lon, +c.start_lat] } };
        }) };
    }

    /** 지금 지도 범위(경위도 사각형). 기울인 화면은 바깥 사각형입니다. */
    function viewBbox() {
        var b = map.getBounds();
        var w = Math.max(-180, b.getWest()), e = Math.min(180, b.getEast());
        var s = Math.max(-85, b.getSouth()), n = Math.min(85, b.getNorth());
        if (w >= e || s >= n) return null;
        return [w, s, e, n].map(function (v) { return v.toFixed(5); }).join(",");
    }

    /**
     * 목록 다시 받기. 검색어가 있으면 전국에서 이름으로, 없으면 지금 지도 범위 안에서.
     * 늦게 온 옛 응답이 새 목록을 덮지 않게 순번(seq)을 봅니다.
     */
    function loadCourses() {
        var url = "api/courses";
        if (list.q) url += "?q=" + encodeURIComponent(list.q);
        else if (map) {
            var bb = viewBbox();
            if (bb) url += "?bbox=" + bb;
        }
        var seq = ++list.seq;
        return getJson(url).then(function (j) {
            if (seq !== list.seq) return;
            courses = j.courses || [];
            list.truncated = !!j.truncated;
            renderList();
            if (map.getSource("starts")) map.getSource("starts").setData(startsData());
        }).catch(function (e) {
            if (seq !== list.seq) return;
            listMessage("코스 목록을 불러오지 못했습니다: " + e.message);
        });
    }

    /** 지도를 움직인 뒤 잠깐 멈추면 그 범위로 목록을 다시 받습니다(검색 중 · 비행 중에는 그대로). */
    function scheduleViewLoad() {
        if (list.q || anim.running) return;
        clearTimeout(list.timer);
        list.timer = setTimeout(loadCourses, 450);
    }

    function listMessage(text) {
        var box = $("list");
        box.textContent = "";
        var e = document.createElement("div");
        e.className = "empty";
        e.textContent = text;
        box.appendChild(e);
    }

    function renderList() {
        var box = $("list");
        box.textContent = "";
        var head = document.createElement("div");
        head.className = "count";
        head.textContent = (list.q ? "\u201C" + list.q + "\u201D 검색 " : "지도 범위 안 ") + num(courses.length) + "개"
            + (list.truncated ? " 넘음 - 앞 " + num(courses.length) + "개만 보여 줍니다. " + (list.q ? "검색어를 더 적어 주세요." : "지도를 확대하거나 검색하세요.") : "");
        box.appendChild(head);
        if (!courses.length) {
            var e = document.createElement("div");
            e.className = "empty";
            e.textContent = list.q ? "이름에 이 검색어가 든 코스가 없습니다."
                : "이 범위에 코스가 없습니다. 지도를 옮기거나 위에서 검색하세요. (코스는 routefly-batch 의 forestTrail · courseImport 배치가 넣습니다)";
            box.appendChild(e);
            return;
        }
        courses.forEach(function (c) {
            var item = document.createElement("div");
            item.className = "course" + (cur && cur.id === c.course_id ? " on" : "");
            item.dataset.id = c.course_id;
            var nm = document.createElement("div");
            nm.className = "nm";
            nm.textContent = c.name;
            var st = document.createElement("div");
            st.className = "st";
            st.textContent = statLine(c);
            item.appendChild(nm);
            item.appendChild(st);
            item.addEventListener("click", function () { select(c.course_id); });
            box.appendChild(item);
        });
    }

    function statLine(c) {
        var parts = [km(c.distance_m) + "km"];
        if (c.ascent_m != null) parts.push("오르막 " + num(c.ascent_m) + "m");
        if (c.ele_max_m != null) parts.push("최고 " + num(c.ele_max_m) + "m");
        return parts.join(" · ");
    }

    // ------------------------------------------------------------------ 코스 하나

    function select(id) {
        stop();
        show(null);
        // 코스 자료와 지도 준비를 같이 기다립니다(느린 기기에서 지도 타일이 늦어도 목록은 먼저 뜹니다).
        return Promise.all([getJson("api/course?id=" + encodeURIComponent(id)), mapReady]).then(function (r) {
            var j = r[0];
            clearMarkers();
            var pts = j.points;
            if (!pts || pts.length < 2) throw new Error("경로 점이 없습니다.");
            var c = { id: id, course: j.course, lon: [], lat: [], ele: [], dist: [], pois: j.pois || [], markers: [] };
            pts.forEach(function (p) { c.lon.push(+p[0]); c.lat.push(+p[1]); c.ele.push(p[2] == null ? null : +p[2]); c.dist.push(+p[3]); });
            c.total = c.dist[c.dist.length - 1];
            c.plan = flightPlan(c.total);
            cur = c;
            // 고른 코스의 출발점은 "출발" 이름표와 겹치므로 점 자료에서 뺍니다(묶음 원에도 안 들어가게)
            map.getSource("starts").setData(startsData());
            try { history.replaceState(null, "", "#c=" + encodeURIComponent(id)); } catch (e) { /* 주소를 못 바꿔도 됩니다 */ }

            map.getSource("route").setData({ type: "Feature", properties: {},
                geometry: { type: "LineString", coordinates: c.lon.map(function (lon, i) { return [lon, c.lat[i]]; }) } });
            anim.d = 0;
            setProgressPaint(0);
            setHead(null);
            addMarkers(c);
            c.captions = buildCaptions(c);
            c.capIdx = 0;
            hideCaption();

            $("courseName").textContent = j.course.name;
            $("courseStat").textContent = statLine(j.course)
                + (j.course.ele_source === "none" ? " · 고도 자료 없음" : "");
            $("bottom").style.display = "block";
            $("hud").style.display = "block";
            $("mini").style.display = "block";
            $("hikeLink").href = "hike.html#c=" + encodeURIComponent(id);
            renderProfile(c);
            placeHud();
            updateHud(0);
            renderList();
            overview(true);
        }).catch(function (e) {
            show("코스를 불러오지 못했습니다: " + e.message);
        });
    }

    function bounds(c) {
        var b = new maplibregl.LngLatBounds();
        for (var i = 0; i < c.lon.length; i++) b.extend([c.lon[i], c.lat[i]]);
        return b;
    }

    function isNarrow() { return window.innerWidth <= 640; }

    /** 좁은 화면에서는 진행 거리 표시를 아래 판 바로 위에 둡니다(판 높이가 글자 줄바꿈에 따라 달라져서). */
    function placeHud() {
        $("hud").style.bottom = isNarrow() && $("bottom").offsetHeight ? ($("bottom").offsetHeight + 24) + "px" : "";
    }

    /**
     * 따라가는 동안의 화면 여백. 아래는 고도 그래프 판만큼 비우고, 위를 조금 비워 현재 위치가
     * 화면 가운데보다 살짝 아래에 오게 합니다 - 앞길이 위쪽으로 뻗어 보입니다.
     */
    function flightPadding() {
        var b = $("bottom"), bottom = b.offsetHeight ? b.offsetHeight + 20 : 0;
        return { top: Math.round((window.innerHeight - bottom) * 0.14), left: 0, right: 0, bottom: bottom };
    }

    /** 코스 전체가 보이게(살짝 기울여서). */
    function overview(first) {
        if (!cur) return;
        var n = cur.lon.length - 1;
        map.fitBounds(bounds(cur), {
            padding: { top: 70, bottom: ($("bottom").offsetHeight || 150) + 40, left: window.innerWidth > 640 ? 340 : 40, right: 60 },
            pitch: 50,
            bearing: first ? bearingOf(cur.lon[0], cur.lat[0], cur.lon[n], cur.lat[n]) - 20 : map.getBearing(),
            duration: 1800, maxZoom: 15
        });
    }

    // ------------------------------------------------------------------ 이름표

    var poiIcon = RF.poiIcon;   // 지점 이름으로 아이콘(course-kit.js)

    /** 지도 위 이름표 - 아이콘 + 흰 글씨(영상처럼 상자 없이). 아이콘 자리가 그 지점입니다. */
    function poiMarker(text, sub, lngLat, cls) {
        var el = document.createElement("div");
        el.className = "poi " + (cls || "");
        var lb = document.createElement("div");
        lb.className = "lb";
        lb.textContent = text;
        if (sub) {
            var s = document.createElement("small");
            s.textContent = sub;
            lb.appendChild(s);
        }
        var ic = document.createElement("div");
        ic.className = "ic";
        ic.textContent = poiIcon(text);
        el.appendChild(lb); el.appendChild(ic);
        return new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, 13] }).setLngLat(lngLat).addTo(map);
    }

    function addMarkers(c) {
        var n = c.lon.length - 1;
        var nearStart = c.pois.some(function (p) { return +p.dist_m < 60 && +p.off_route_m < 60; });
        var nearEnd = c.pois.some(function (p) { return +p.dist_m > c.total - 60 && +p.off_route_m < 60; });
        if (!nearStart) c.markers.push({ dist: -1, m: poiMarker("출발", null, [c.lon[0], c.lat[0]], "always") });
        c.pois.forEach(function (p) {
            // 출발 · 도착 자리의 이름표는 그 이름으로 출발 / 도착을 대신합니다(예: 오색(남설악탐방지원센터) · 출발)
            var atStart = +p.dist_m < 60 && +p.off_route_m < 60, atEnd = +p.dist_m > c.total - 60 && +p.off_route_m < 60;
            var sub = [atStart ? "출발" : atEnd ? "도착" : null, p.ele_m != null ? num(p.ele_m) + "m" : null]
                .filter(function (x) { return x; }).join(" · ") || null;
            c.markers.push({ dist: +p.dist_m < 60 ? -1 : +p.dist_m, m: poiMarker(p.name, sub, [+p.lon, +p.lat], "always") });
        });
        if (!nearEnd) c.markers.push({ dist: c.total, m: poiMarker("도착", null, [c.lon[n], c.lat[n]], "always") });
        showMarkersUpTo(c.total);
    }

    // ------------------------------------------------------------------ 자막

    /**
     * 순수 함수 - 비행 중 화면 가운데 큰 자막. 출발 · 지나는 지점 · 거리 이정 · 도착을 코스 자료로 만듭니다.
     * [{d: 보여 줄 진행 거리(m), text, sub}]
     */
    function buildCaptions(c) {
        var out = [], total = c.total, course = c.course || {};
        var startPoi = null, endPoi = null;
        c.pois.forEach(function (p) {
            if (+p.dist_m < 60 && +p.off_route_m < 60 && !startPoi) startPoi = p;
            else if (+p.dist_m > total - 60 && +p.off_route_m < 60) endPoi = p;
        });
        var bare = function (name) { return name.replace(/\(.*\)$/, "").trim() || name; };
        out.push({ d: 0, text: startPoi ? bare(startPoi.name) + "에서 출발" : "출발",
                   sub: km(total) + "km" + (course.ascent_m != null ? " · 오르막 " + num(course.ascent_m) + "m" : "") });
        c.pois.forEach(function (p) {
            if (p === startPoi || p === endPoi) return;
            var e = p.ele_m != null ? " · 해발 " + num(p.ele_m) + "m" : "";
            out.push({ d: +p.dist_m, text: p.name, sub: km(+p.dist_m) + "km 지점" + e });
        });
        // 이름표가 드문 구간은 거리 이정(1/4 · 1/2 · 3/4)으로 채웁니다
        [0.25, 0.5, 0.75].forEach(function (f) {
            var d = total * f;
            var near = out.some(function (x) { return Math.abs(x.d - d) < total * 0.1; });
            if (near) return;
            var p = at(c, d);
            out.push({ d: d, text: "약 " + num(Math.round(d / 100) / 10, 1) + "km", sub: p.ele != null ? "해발 " + num(p.ele) + "m" : null });
        });
        out.push({ d: total, text: (endPoi ? bare(endPoi.name) : "도착") + (endPoi ? " 도착!" : "!"),
                   sub: "총 " + km(total) + "km" + (course.ascent_m != null ? " · 오르막 " + num(course.ascent_m) + "m" : "") });
        out.sort(function (a, b) { return a.d - b.d; });
        return out;
    }

    var captionTimer = 0;

    function showCaption(cap) {
        var box = $("caption");
        box.innerHTML = "";
        var t = document.createElement("div"); t.className = "t"; t.textContent = cap.text; box.appendChild(t);
        if (cap.sub) { var s = document.createElement("div"); s.className = "s"; s.textContent = cap.sub; box.appendChild(s); }
        box.classList.add("on");
        clearTimeout(captionTimer);
        captionTimer = setTimeout(function () { box.classList.remove("on"); }, 3200);
    }

    function hideCaption() {
        clearTimeout(captionTimer);
        $("caption").classList.remove("on");
    }

    /** d 까지 지난 자막은 건너뛰도록 다음 자막 번호를 맞춥니다(되감기 · 그래프로 옮길 때). */
    function seekCaptions(d) {
        if (!cur || !cur.captions) return;
        var i = 0;
        while (i < cur.captions.length && cur.captions[i].d < d - 1) i++;
        cur.capIdx = i;
    }

    /** 비행 중 d 에 닿은 자막을 띄웁니다(한 번에 여러 개를 지나면 마지막 것만). */
    function stepCaptions(d) {
        if (!cur || !cur.captions) return;
        var shown = null;
        while (cur.capIdx < cur.captions.length && cur.captions[cur.capIdx].d <= d + 1) shown = cur.captions[cur.capIdx++];
        if (shown) showCaption(shown);
    }

    function showMarkersUpTo(d) {
        if (!cur) return;
        cur.markers.forEach(function (k) {
            k.m.getElement().classList.toggle("on", k.dist <= d + 30);
        });
    }

    function clearMarkers() {
        if (cur) cur.markers.forEach(function (k) { k.m.remove(); });
    }

    // ------------------------------------------------------------------ 고도 그래프

    /** 아래 고도 그래프(지점 이름 · km 눈금) + 작은 평면 지도(km 번호 · 지금 위치) - course-kit.js. */
    function renderProfile(c) {
        c.profile = RF.profile($("profile"), c, { onSeek: function (d) {
            stop();
            anim.d = d;
            seekCaptions(d);
            frameAt(d, true);
        } });
        c.mini = RF.miniMap($("mini"), c);
    }

    // ------------------------------------------------------------------ 비행

    var headMarker = null;

    /** 현재 위치 - 흰 테두리 동그란 배지(등산객) + 바닥 번짐. p 가 null 이면 숨깁니다. */
    function setHead(p) {
        map.getSource("head").setData({ type: "FeatureCollection", features: p ? [{
            type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } }] : [] });
        if (!p) {
            if (headMarker) headMarker.getElement().style.display = "none";
            return;
        }
        if (!headMarker) {
            var el = document.createElement("div");
            el.className = "head-badge";
            el.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><g fill="#fff">'
                + '<circle cx="13" cy="4" r="2.2"/>'
                + '<path d="M11.2 7.6l-2.6 1.6-1 4 1.6.4.8-3 1.2-.6-1 5.2-2.4 5.6 1.8.8 2.4-5.4 1.8 2v5h1.9v-5.8l-2.2-2.6.6-3 1 1.6 2.6.6.4-1.7-2-.5-1.6-2.8c-.5-.8-1.5-1.2-2.4-.9z"/>'
                + '<path d="M18.6 9.2l-1 .2 1.2 13.4h.9z"/></g></svg>';
            headMarker = new maplibregl.Marker({ element: el, anchor: "center", pitchAlignment: "viewport" })
                .setLngLat([p.lon, p.lat]).addTo(map);
        }
        headMarker.getElement().style.display = "";
        headMarker.setLngLat([p.lon, p.lat]);
    }

    function updateHud(d) {
        $("hudKm").textContent = km(d);
        var p = cur ? at(cur, d) : null;
        $("hudEle").textContent = p && p.ele != null ? "고도 " + num(p.ele) + "m" : "고도 -";
        var g = cur ? RF.grade(cur, d) : null;
        $("hudGrade").textContent = g == null ? "" : "경사 " + (g > 0 ? "+" : "") + num(g) + "%";
        if (cur && cur.profile) cur.profile.set(d);
        if (cur && cur.mini) cur.mini.set(d);
    }

    var FLY_PITCH = 58;        // 평소 기울기 - 비스듬히 내려다보며 앞길이 화면 위쪽으로 뻗게(영상처럼)
    var MIN_PITCH = 42;        // 능선에 가릴 때 이 정도까지 카메라를 들어 올립니다
    var CLEAR_M = 40;          // 시선과 지형 사이에 남길 여유(m)

    /**
     * 현재 위치 p 를 bearing 방향 뒤에서 볼 때, 시선이 지형에 막히지 않는 가장 낮은(가장 많이 기운) 기울기.
     * 봉우리를 넘어 내려가는 길처럼 바로 뒤 능선이 더 높으면 70° 시선은 능선에 걸려 경로가 안 보입니다.
     * 카메라 쪽으로 몇 곳의 지형 높이를 재서, 각 지점을 넘으려면 시선이 얼마나 서야 하는지 구합니다.
     */
    function clearPitch(p, bearing) {
        if (!map.getTerrain || !map.getTerrain()) return FLY_PITCH;
        var headE = map.queryTerrainElevation([p.lon, p.lat]);
        if (headE == null) return FLY_PITCH;
        // 카메라 ~ 화면 중심 거리(m) - MapLibre 와 같은 식(시야각 · 화면 높이 · 줌)
        var fov = (map.getVerticalFieldOfView ? map.getVerticalFieldOfView() : 36.87) * Math.PI / 180;
        var px = 0.5 / Math.tan(fov / 2) * map.getCanvas().clientHeight;
        var mpp = 40075016.686 * Math.cos(p.lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom()));
        var dist = px * mpp;
        var back = (bearing + 180) * Math.PI / 180, need = 90 - FLY_PITCH;   // 시선이 지평선에서 서야 할 각도
        var maxX = dist * Math.sin(FLY_PITCH * Math.PI / 180);
        [0.02, 0.04, 0.07, 0.1, 0.14, 0.19, 0.25, 0.33, 0.43, 0.55, 0.7, 0.85].forEach(function (f) {
            var x = maxX * f;
            var dLat = Math.cos(back) * x / 111320, dLon = Math.sin(back) * x / (111320 * Math.cos(p.lat * Math.PI / 180));
            var e = map.queryTerrainElevation([p.lon + dLon, p.lat + dLat]);
            if (e == null || !e) return;   // 아직 안 받은 지형은 0 - 건너뜁니다
            var a = Math.atan2(e + CLEAR_M - headE, x) * 180 / Math.PI;
            // 이 각도로 선 카메라가 이 지점보다 멀리 있어야 걸리는 것 - 가까운 카메라는 그 위에 있습니다
            if (a > need && dist * Math.sin((90 - a) * Math.PI / 180) > x) need = a;
        });
        return Math.max(MIN_PITCH, Math.min(FLY_PITCH, 90 - need));
    }

    /**
     * 앞쪽 경로가 향하는 방향(도). 한 점이 아니라 앞 구간 세 곳을 향한 방향의 평균이라,
     * 지그재그 등산로에서도 시선이 좌우로 흔들리지 않습니다.
     */
    function lookBearing(c, d) {
        var p = at(c, d), x = 0, y = 0;
        [0.5, 1, 1.6].forEach(function (k, i) {
            var q = at(c, Math.min(d + c.plan.lookAhead * k, c.total));
            if (q.lon === p.lon && q.lat === p.lat) return;
            var b = bearingOf(p.lon, p.lat, q.lon, q.lat) * Math.PI / 180, w = 1 + i;
            x += Math.sin(b) * w;
            y += Math.cos(b) * w;
        });
        return x === 0 && y === 0 ? anim.bearing : (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
    }

    /**
     * 진행 거리 d 의 화면 한 장. dt(ms)는 지난 프레임과의 간격 - 0 이면 카메라를 그 자리로 바로 옮깁니다.
     * 카메라는 현재 위치를 화면 아래쪽에 두고 낮게 기울여, 뒤에서 따라가며 앞길을 내다보는 시점입니다(flightPadding).
     */
    function frameAt(d, moveCamera, dt) {
        var c = cur, p = at(c, d);
        setProgressPaint(d / c.total);
        setHead(p);
        updateHud(d);
        showMarkersUpTo(d);
        if (moveCamera) {
            if (d < c.total - 1) {
                var want = lookBearing(c, d);
                // 시간 기준으로 부드럽게(프레임 수와 상관없이 약 0.7초에 63% 따라감)
                var k = dt ? 1 - Math.exp(-dt / 700) : 1;
                anim.bearing = (anim.bearing + angleDiff(anim.bearing, want) * k + 360) % 360;
            }
            // 능선 검사는 0.15초마다(지형 높이 읽기가 공짜는 아니라서). 지금 자리와 조금 앞 자리 중 더 서야 하는 쪽으로 -
            // 미리 들어 올려야 넘어간 뒤에 갑자기 가리지 않습니다.
            var now = performance.now();
            if (!dt || now - anim.pitchAt > 150) {
                anim.pitchAt = now;
                anim.pitchWant = Math.min(clearPitch(p, anim.bearing),
                                          clearPitch(at(c, Math.min(d + c.plan.lookAhead * 0.6, c.total)), anim.bearing));
            }
            // 가릴 때는 빨리 들고(0.4초), 풀릴 때는 천천히 내립니다(1.5초) - 오르내림이 출렁이지 않게
            var kp = dt ? 1 - Math.exp(-dt / (anim.pitchWant < anim.pitch ? 400 : 1500)) : 1;
            anim.pitch += (anim.pitchWant - anim.pitch) * kp;
            map.jumpTo(withGround({ center: [p.lon, p.lat], bearing: anim.bearing, pitch: anim.pitch, zoom: c.plan.zoom,
                                    padding: flightPadding() }, p));
        }
    }

    /**
     * 카메라 중심 높이를 그 자리 지형 높이로. MapLibre 는 지형 타일을 새로 받을 때만 중심 높이를 고치므로,
     * 매 프레임 jumpTo 로 옮기면 높이가 예전 자리 그대로 남아 산 위에서는 현재 위치가 화면 위로 밀려 나갑니다.
     */
    function withGround(opts, p) {
        var e = map.getTerrain && map.getTerrain() ? map.queryTerrainElevation([p.lon, p.lat]) : null;
        if (e != null && isFinite(e)) opts.elevation = e;
        return opts;
    }

    function tick(now) {
        if (!anim.running) return;
        var dt = Math.min(now - anim.last, 100);   // 탭이 뒤로 갔다 오면 한 번에 건너뛰지 않게
        anim.last = now;
        anim.d = Math.min(cur.total, anim.d + cur.total / cur.plan.durationMs * dt * SPEEDS[anim.speedIdx]);
        frameAt(anim.d, true, dt);
        stepCaptions(anim.d);
        map.setPaintProperty("head-halo", "circle-radius", 13 + 5 * Math.sin(now / 260));
        if (anim.d >= cur.total) {
            stop();
            setTimeout(function () { if (!anim.running) overview(false); }, 900);
            return;
        }
        anim.raf = requestAnimationFrame(tick);
    }

    function play() {
        if (!cur) return;
        if (anim.d >= cur.total) anim.d = 0;
        var p = at(cur, anim.d);
        anim.bearing = lookBearing(cur, anim.d);
        anim.running = true;
        setStartsVisible(false);   // 비행 중에는 다른 코스 출발점이 화면을 어지럽히지 않게
        setMapLabels(false);
        setPlayButton();
        // 좁은 화면에서는 목록을 접어 지도를 넓게 씁니다
        if (isNarrow() && !$("side").classList.contains("closed")) $("toggle").click();
        if (anim.d === 0) {
            setProgressPaint(0);
            showMarkersUpTo(0);
            setHead(p);
            updateHud(0);
        }
        seekCaptions(anim.d);
        // 비행 중에는 목록을 숨겨 지도를 꽉 차게(멈추면 다시)
        document.body.classList.add("flying");
        // 인트로 - 지금 자리에서 높이 떠올랐다가 출발 지점 뒤로 내려앉습니다(curve 가 클수록 높이 뜸).
        // 처음부터일 때는 조금 길게, 이어서일 때는 짧게.
        anim.pitch = anim.pitchWant = anim.d === 0 ? FLY_PITCH : Math.min(anim.pitch, FLY_PITCH);
        anim.pitchAt = 0;
        map.flyTo(withGround({ center: [p.lon, p.lat], zoom: cur.plan.zoom, pitch: anim.pitch, bearing: anim.bearing,
                    duration: anim.d === 0 ? 3800 : 1600, curve: anim.d === 0 ? 1.7 : 1.2, essential: true,
                    padding: flightPadding() }, p));
        map.once("moveend", function () {
            if (!anim.running) return;
            stepCaptions(anim.d);   // 출발 자막
            anim.last = performance.now();
            anim.raf = requestAnimationFrame(tick);
        });
    }

    /** V-World 지명 겹침 - 비행 중에는 숨겨 우리 이름표(반듯한 아이콘 + 글씨)만 보이게. */
    function setMapLabels(on) {
        if (map.getLayer("label")) map.setPaintProperty("label", "raster-opacity", on ? 0.9 : 0);
    }

    function setStartsVisible(on) {
        ["starts-point", "starts-cluster"].forEach(function (id) {
            if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
        });
    }

    function stop() {
        if (anim.running && map) {
            setStartsVisible(true);
            setMapLabels(true);
        }
        anim.running = false;
        document.body.classList.remove("flying");
        if (anim.raf) cancelAnimationFrame(anim.raf);
        anim.raf = 0;
        setPlayButton();
    }

    function setPlayButton() {
        $("play").textContent = anim.running ? "❚❚ 멈춤" : (cur && anim.d > 0 && anim.d < cur.total ? "▶ 이어서" : "▶ 비행");
    }

    // ------------------------------------------------------------------ 시작

    function start(cfg) {
        map = new maplibregl.Map({
            container: "map",
            style: buildStyle(cfg),
            center: [127.8, 36.3], zoom: 6.2, pitch: 0, maxPitch: 85,
            attributionControl: false
        });
        if (/[?&]debug\b/.test(location.search)) window.routeflyDebug = { map: map, anim: anim, at: function (d) { return at(cur, d); } };   // 시험용
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        // 출처 표시(지형 · 위성사진 이용 조건)는 아래 판에 가리지 않게 확대 버튼 아래에 둡니다.
        // 코스 · 지점 이름은 routefly-batch 가 OpenStreetMap 지명(ODbL)으로 붙입니다 - 출처를 같이 표시합니다.
        map.addControl(new maplibregl.AttributionControl({ compact: true,
            customAttribution: "등산로: 산림청 등산로정보 | 지명: <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">© OpenStreetMap contributors</a>"
                + " | <a href=\"about.html\">안전 · 개인정보 · 출처 안내</a>" }), "top-right");
        map.on("error", function (e) {
            // 타일 한 장이 안 와도 지도는 계속 씁니다 - 콘솔에만 남깁니다.
            if (window.console) console.warn("map", e && e.error ? e.error.message : e);
        });
        // 사용자가 지도를 직접 움직이면 비행을 멈춥니다(originalEvent 가 있으면 사람이 한 조작).
        ["dragstart", "rotatestart", "pitchstart", "wheel", "touchstart"].forEach(function (ev) {
            map.on(ev, function (e) { if (anim.running && e.originalEvent) stop(); });
        });
        // 'load' 는 첫 화면 타일을 다 받은 뒤라 느린 망에서 한참 걸립니다. 경로 층은 스타일만 읽히면 붙일 수 있어
        // 'style.load' 를 기다립니다(코스를 고르자마자 그릴 수 있게).
        mapReady = new Promise(function (resolve) {
            map.once("style.load", function () {
                addRouteLayers();
                resolve();
            });
        });
        // 처음 목록은 지도가 뜨기 전에 바로 받습니다(처음 화면 = 우리나라 전체 범위).
        loadCourses();
        map.on("moveend", scheduleViewLoad);
        var m = /[#&]c=([^&]+)/.exec(location.hash);
        if (m) select(decodeURIComponent(m[1]));
    }

    // 검색 - 입력을 멈추면(0.3초) 찾습니다. 지우면 다시 지도 범위 목록으로.
    $("q").addEventListener("input", function () {
        var v = this.value.trim();
        clearTimeout(list.timer);
        list.timer = setTimeout(function () {
            list.q = v || null;
            loadCourses();
        }, 300);
    });
    $("q").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            clearTimeout(list.timer);
            list.q = this.value.trim() || null;
            loadCourses();
        } else if (e.key === "Escape") {
            this.value = "";
            list.q = null;
            loadCourses();
        }
    });

    $("play").addEventListener("click", function () { if (anim.running) stop(); else play(); });
    $("speed").addEventListener("click", function () {
        anim.speedIdx = (anim.speedIdx + 1) % SPEEDS.length;
        this.textContent = SPEEDS[anim.speedIdx] + "×";
    });
    $("overview").addEventListener("click", function () { stop(); overview(false); });
    $("toggle").addEventListener("click", function () {
        var side = $("side");
        side.classList.toggle("closed");
        this.textContent = side.classList.contains("closed") ? "코스" : "접기";
    });
    window.addEventListener("resize", placeHud);
    document.addEventListener("keydown", function (e) {
        if (e.code === "Space" && cur && e.target === document.body) { e.preventDefault(); $("play").click(); }
    });

    if (!window.maplibregl) { show("지도 라이브러리를 불러오지 못했습니다."); return; }
    getJson("api/map-config")
        .catch(function () { return { demUrl: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: null }; })
        .then(start);
})();
