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

    var ROUTE_COLOR = "#ffb703";
    var SPEEDS = [1, 2, 4];

    var map;
    var mapReady;            // 지도 스타일이 읽힌 뒤 경로 층을 붙이고 풀리는 약속 - 목록은 이것을 기다리지 않습니다
    var courses = [];
    var list = { q: null, truncated: false, seq: 0, timer: 0 };   // 목록 상태 - 검색어가 있으면 검색, 없으면 지도 범위
    var cur = null;          // 지금 코스 {id, course, lon[], lat[], ele[], dist[], total, pois[], markers[]}
    var anim = { running: false, d: 0, speedIdx: 0, last: 0, bearing: 0, raf: 0 };

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

    /** 진행 거리 d(m)의 위치 · 고도. 누적 거리 배열에서 이분 탐색 후 선형 보간. */
    function at(c, d) {
        var dist = c.dist, n = dist.length;
        if (d <= 0) return { lon: c.lon[0], lat: c.lat[0], ele: c.ele[0] };
        if (d >= c.total) return { lon: c.lon[n - 1], lat: c.lat[n - 1], ele: c.ele[n - 1] };
        var lo = 0, hi = n - 1;
        while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            if (dist[mid] <= d) lo = mid; else hi = mid;
        }
        var span = dist[hi] - dist[lo], t = span > 0 ? (d - dist[lo]) / span : 0;
        var e0 = c.ele[lo], e1 = c.ele[hi];
        return {
            lon: c.lon[lo] + (c.lon[hi] - c.lon[lo]) * t,
            lat: c.lat[lo] + (c.lat[hi] - c.lat[lo]) * t,
            ele: e0 == null || e1 == null ? null : e0 + (e1 - e0) * t
        };
    }

    /** 코스 길이에 맞춘 따라가기 줌 · 앞을 보는 거리 · 비행 시간(1× 기준). 등산로부터 장거리까지 한 식으로. */
    function flightPlan(totalM) {
        var k = Math.max(totalM / 1000, 0.5);
        return {
            zoom: Math.max(9.5, Math.min(15.2, 15.2 - 0.6 * Math.log2(k / 5))),
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
            layers.push({ id: "label", type: "raster", source: "label", paint: { "raster-opacity": 0.9 } });
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
        // 전체 경로(흐리게) - 비행 전에도 코스가 보이게
        map.addLayer({ id: "route-all", type: "line", source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-opacity": 0.55, "line-width": 3 } });
        // 지나온 길 - 번짐 + 본선
        map.addLayer({ id: "route-glow", type: "line", source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 12, "line-blur": 8, "line-opacity": 0.55, "line-gradient": progressGradient(0) } });
        map.addLayer({ id: "route-done", type: "line", source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-width": 5, "line-gradient": progressGradient(0) } });
        map.addLayer({ id: "head", type: "circle", source: "head",
            paint: { "circle-radius": 7, "circle-color": ROUTE_COLOR, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5,
                     "circle-pitch-alignment": "map" } });
    }

    function emptyLine() { return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } }; }

    /** 경로선 0~p 만 칠하는 색 식. p 는 0~1 (line-progress 는 선 길이 비율입니다). */
    function progressGradient(p) {
        var clear = "rgba(255,183,3,0)";
        if (p <= 0.0001) return ["step", ["line-progress"], clear, 1, clear];
        if (p >= 0.9999) return ["step", ["line-progress"], ROUTE_COLOR, 1, ROUTE_COLOR];
        return ["step", ["line-progress"], ROUTE_COLOR, p, clear];
    }

    function setProgressPaint(p) {
        var g = progressGradient(p);
        map.setPaintProperty("route-done", "line-gradient", g);
        map.setPaintProperty("route-glow", "line-gradient", g);
    }

    // ------------------------------------------------------------------ 코스 목록

    function startsData() {
        return { type: "FeatureCollection", features: courses.map(function (c) {
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
            // 고른 코스의 출발점 점은 "출발" 이름표와 겹치므로 감춥니다
            map.setFilter("starts-point", ["all", ["!", ["has", "point_count"]], ["!=", ["get", "id"], id]]);
            try { history.replaceState(null, "", "#c=" + encodeURIComponent(id)); } catch (e) { /* 주소를 못 바꿔도 됩니다 */ }

            map.getSource("route").setData({ type: "Feature", properties: {},
                geometry: { type: "LineString", coordinates: c.lon.map(function (lon, i) { return [lon, c.lat[i]]; }) } });
            anim.d = 0;
            setProgressPaint(0);
            setHead(null);
            addMarkers(c);

            $("courseName").textContent = j.course.name;
            $("courseStat").textContent = statLine(j.course)
                + (j.course.ele_source === "none" ? " · 고도 자료 없음" : "");
            $("bottom").style.display = "block";
            $("hud").style.display = "block";
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

    /** 따라가는 동안 현재 위치가 아래 판(고도 그래프)에 가리지 않게 화면 중심을 그 위로 올립니다. */
    function flightPadding() {
        var b = $("bottom");
        return { top: 0, left: 0, right: 0, bottom: b.offsetHeight ? b.offsetHeight + 20 : 0 };
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
        var stem = document.createElement("div"); stem.className = "stem";
        var dot = document.createElement("div"); dot.className = "dot";
        el.appendChild(lb); el.appendChild(stem); el.appendChild(dot);
        return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(lngLat).addTo(map);
    }

    function addMarkers(c) {
        var n = c.lon.length - 1;
        var nearStart = c.pois.some(function (p) { return +p.dist_m < 60 && +p.off_route_m < 60; });
        var nearEnd = c.pois.some(function (p) { return +p.dist_m > c.total - 60 && +p.off_route_m < 60; });
        if (!nearStart) c.markers.push({ dist: -1, m: poiMarker("출발", null, [c.lon[0], c.lat[0]], "always") });
        c.pois.forEach(function (p) {
            var sub = p.ele_m != null ? num(p.ele_m) + "m" : null;
            c.markers.push({ dist: +p.dist_m < 60 ? -1 : +p.dist_m, m: poiMarker(p.name, sub, [+p.lon, +p.lat], +p.dist_m < 60 ? "always" : "") });
        });
        if (!nearEnd) c.markers.push({ dist: c.total, m: poiMarker("도착", null, [c.lon[n], c.lat[n]]) });
        showMarkersUpTo(c.total);   // 비행 전에는 전부 보여 줍니다
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

    var PW = 1000, PH = 100;

    function renderProfile(c) {
        var box = $("profile");
        box.textContent = "";
        var eles = c.ele.filter(function (e) { return e != null; });
        if (eles.length < 2) {
            var e = document.createElement("div");
            e.className = "cap";
            e.style.cssText = "left:0;top:30px;font-size:12px";
            e.textContent = "고도 자료가 없는 코스입니다 - 거리만 표시합니다.";
            box.appendChild(e);
            c.profile = null;
            return;
        }
        var min = Math.min.apply(null, eles), max = Math.max.apply(null, eles);
        var pad = Math.max((max - min) * 0.12, 5);
        var lo = min - pad, hi = max + pad;
        var pts = [];
        for (var i = 0; i < c.dist.length; i++) {
            if (c.ele[i] == null) continue;
            pts.push((c.dist[i] / c.total * PW).toFixed(1) + "," + ((1 - (c.ele[i] - lo) / (hi - lo)) * PH).toFixed(1));
        }
        var ns = "http://www.w3.org/2000/svg";
        var svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 " + PW + " " + PH);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.innerHTML =
            '<defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1">'
            + '<stop offset="0" stop-color="' + ROUTE_COLOR + '" stop-opacity="0.55"/>'
            + '<stop offset="1" stop-color="' + ROUTE_COLOR + '" stop-opacity="0.05"/></linearGradient>'
            + '<clipPath id="done"><rect id="doneRect" x="0" y="0" width="0" height="' + PH + '"/></clipPath></defs>'
            + '<polygon points="0,' + PH + ' ' + pts.join(" ") + ' ' + PW + ',' + PH + '" fill="rgba(255,255,255,0.10)"/>'
            + '<polyline points="' + pts.join(" ") + '" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
            + '<g clip-path="url(#done)"><polygon points="0,' + PH + ' ' + pts.join(" ") + ' ' + PW + ',' + PH + '" fill="url(#pf)"/>'
            + '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + ROUTE_COLOR + '" stroke-width="2.5" vector-effect="non-scaling-stroke"/></g>'
            + '<line id="cursor" x1="0" x2="0" y1="0" y2="' + PH + '" stroke="#ffffff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
        box.appendChild(svg);
        caption(box, "left:3px;top:0", "최고 " + num(max) + "m");
        caption(box, "left:3px;bottom:1px", "최저 " + num(min) + "m");
        caption(box, "right:3px;bottom:1px", km(c.total) + "km");
        c.profile = { cursor: svg.querySelector("#cursor"), done: svg.querySelector("#doneRect") };

        // 그래프를 누르면 그 거리로 옮깁니다(멈춘 상태로)
        box.onclick = function (ev) {
            var r = box.getBoundingClientRect();
            var d = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * c.total;
            stop();
            anim.d = d;
            frameAt(d, true);
        };
    }

    function caption(box, css, text) {
        var el = document.createElement("div");
        el.className = "cap";
        el.style.cssText = css;
        el.textContent = text;
        box.appendChild(el);
    }

    // ------------------------------------------------------------------ 비행

    function setHead(p) {
        map.getSource("head").setData({ type: "FeatureCollection", features: p ? [{
            type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [p.lon, p.lat] } }] : [] });
    }

    function updateHud(d) {
        $("hudKm").textContent = km(d);
        var p = cur ? at(cur, d) : null;
        $("hudEle").textContent = p && p.ele != null ? "고도 " + num(p.ele) + "m" : "고도 -";
        if (cur && cur.profile) {
            var x = (d / cur.total * PW).toFixed(1);
            cur.profile.cursor.setAttribute("x1", x);
            cur.profile.cursor.setAttribute("x2", x);
            cur.profile.done.setAttribute("width", x);
        }
    }

    /** 진행 거리 d 의 화면 한 장. moveCamera=false 면 카메라는 그대로. */
    function frameAt(d, moveCamera) {
        var c = cur, p = at(c, d);
        setProgressPaint(d / c.total);
        setHead(p);
        updateHud(d);
        showMarkersUpTo(d);
        if (moveCamera) {
            var ahead = at(c, Math.min(d + c.plan.lookAhead, c.total));
            if (d < c.total - 1) {
                var want = bearingOf(p.lon, p.lat, ahead.lon, ahead.lat);
                // 방향은 천천히 따라 돌립니다(경로가 꺾일 때마다 화면이 휙 돌지 않게)
                anim.bearing += angleDiff(anim.bearing, want) * 0.04;
            }
            map.jumpTo({ center: [p.lon, p.lat], bearing: anim.bearing, pitch: 62, zoom: c.plan.zoom, padding: flightPadding() });
        }
    }

    function tick(now) {
        if (!anim.running) return;
        var dt = Math.min(now - anim.last, 100);   // 탭이 뒤로 갔다 오면 한 번에 건너뛰지 않게
        anim.last = now;
        anim.d = Math.min(cur.total, anim.d + cur.total / cur.plan.durationMs * dt * SPEEDS[anim.speedIdx]);
        frameAt(anim.d, true);
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
        var p = at(cur, anim.d), ahead = at(cur, Math.min(anim.d + cur.plan.lookAhead, cur.total));
        anim.bearing = bearingOf(p.lon, p.lat, ahead.lon, ahead.lat);
        anim.running = true;
        setStartsVisible(false);   // 비행 중에는 다른 코스 출발점이 화면을 어지럽히지 않게
        setPlayButton();
        // 좁은 화면에서는 목록을 접어 지도를 넓게 씁니다
        if (isNarrow() && !$("side").classList.contains("closed")) $("toggle").click();
        if (anim.d === 0) {
            setProgressPaint(0);
            showMarkersUpTo(0);
            setHead(p);
            updateHud(0);
        }
        // 지금 자리에서 출발 지점까지 먼저 날아간 뒤 따라가기를 시작합니다
        map.flyTo({ center: [p.lon, p.lat], zoom: cur.plan.zoom, pitch: 62, bearing: anim.bearing, duration: 2200, essential: true,
                    padding: flightPadding() });
        map.once("moveend", function () {
            if (!anim.running) return;
            anim.last = performance.now();
            anim.raf = requestAnimationFrame(tick);
        });
    }

    function setStartsVisible(on) {
        ["starts-point", "starts-cluster"].forEach(function (id) {
            if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
        });
    }

    function stop() {
        if (anim.running && map) setStartsVisible(true);
        anim.running = false;
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
        map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
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
