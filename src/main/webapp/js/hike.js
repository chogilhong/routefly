/*
 * routefly 산행 화면(hike.html) - 핸드폰으로 걸으면서 봅니다.
 *
 *   GPS 위치 → 코스 위 진행 거리(course-kit snap) → ① 고도 그래프 ② 산행 기록 ③ 경로 지도를 함께 움직입니다.
 *   코스에서 50m 넘게 벗어나면 빨간 알림, 끝점에 닿으면 도착 알림. 화면이 꺼지지 않게 Wake Lock 을 겁니다.
 *   새로 고침해도 산행 기록(시작 시각 · 진행 거리)은 이 기기에 남아 이어집니다(localStorage).
 *   "모의 산행" 은 GPS 없이 코스를 따라 걷는 흉내(시간 40배 빠르게) - 집에서 화면을 시험할 때.
 */
(function () {
    "use strict";

    var OFF_ROUTE_M = 50;      // 이보다 멀면 "코스에서 벗어남"
    var ARRIVE_M = 30;         // 끝점까지 이 안이면 도착
    var SIM_X = 40;            // 모의 산행 - 시간 배속
    var SIM_KMH = 3.5;         // 모의 산행 - 걷는 빠르기

    var $ = function (id) { return document.getElementById(id); };
    var num = RF.num, km = RF.km;

    var map, mapReady, cfg;
    var c = null;              // 지금 코스
    var prof = null;           // ① 고도 그래프
    var meMarker = null;
    var hike = { running: false, sim: false, start: 0, d: 0, off: 0, watch: null, timer: 0, simTimer: 0, simClock: 0,
                 simLast: 0, simD: 0, speed: null, hist: [], wake: null, follow: true, arrived: false, lastFix: 0,
                 fix: null,            // 마지막 위치 {lat, lon, acc, alt, t} - SOS 에 씁니다
                 track: [],            // 걸은 자리 [[위도, 경도, 시각, 고도]] - 기록 · GPX
                 walked: 0,            // 걸은 거리(m)
                 alerted: {},          // 이미 알린 갈림길(진행 거리)
                 sunWarned: false };
    var trails = [];                   // 주변 등산로(api/trails) - 코스에서 벗어났을 때 가장 가까운 길 찾기
    var compass = { on: false, up: false, heading: null, lastTurn: 0 };   // 나침반 - on: 켜짐, up: 내 방향으로 지도 돌림
    var kindFilter = "";

    function now() { return hike.sim ? hike.simClock : Date.now(); }

    function toast(text, ms) {
        var t = $("toast");
        t.textContent = text;
        t.style.display = "block";
        clearTimeout(toast.timer);
        toast.timer = setTimeout(function () { t.style.display = "none"; }, ms || 3500);
    }

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
            return r.json().then(function (j) {
                if (!r.ok || j.success === false) throw new Error(j.message || ("HTTP " + r.status));
                return j;
            });
        });
    }

    function hhmmss(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
        return h + ":" + (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x;
    }

    function clock(ms) {
        var d = new Date(ms);
        return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
    }

    function bearing(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
        var x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
        return (Math.atan2(y, x) / r + 360) % 360;
    }

    function dirWord(b) {
        return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round(b / 45) % 8] + "쪽";
    }

    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    // ------------------------------------------------------------------ 지도

    function buildStyle(cfg) {
        var dem = { type: "raster-dem", tiles: [cfg.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: 15,
            attribution: "지형: Terrain Tiles (AWS Open Data)" };
        var sources = { hillshade: dem }, layers = [{ id: "bg", type: "background", paint: { "background-color": cfg.vworldKey ? "#1b2430" : "#dcd6c6" } }];
        if (cfg.vworldKey) {
            var key = encodeURIComponent(cfg.vworldKey);
            sources.sat = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19,
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/{z}/{y}/{x}.jpeg"], attribution: "위성사진: 국토교통부 V-World" };
            layers.push({ id: "sat", type: "raster", source: "sat" });
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", paint: { "hillshade-exaggeration": 0.2 } });
            // V-World 지명 겹침은 쓰지 않습니다 - 우리 이름표와 같은 이름이 비스듬히 한 번 더 나와 겹쳐 보입니다
        } else {
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade",
                paint: { "hillshade-exaggeration": 0.65, "hillshade-shadow-color": "#3d4a3a", "hillshade-highlight-color": "#fbf7ea" } });
        }
        return { version: 8, sources: sources, layers: layers };
    }

    function progressGradient(p) {
        var on = RF.LINE_COLOR, clear = "rgba(56,217,234,0)";
        if (p <= 0.0001) return ["step", ["line-progress"], clear, 1, clear];
        if (p >= 0.9999) return ["step", ["line-progress"], on, 1, on];
        return ["step", ["line-progress"], on, p, clear];
    }

    function startMap() {
        map = new maplibregl.Map({ container: "map", style: buildStyle(cfg), center: [127.8, 36.3], zoom: 6.2,
            attributionControl: false, pitchWithRotate: false, dragRotate: false, touchPitch: false });
        map.touchZoomRotate.disableRotation();   // 북쪽이 늘 위(작은 화면에서 길 잃지 않게)
        map.addControl(new maplibregl.AttributionControl({ compact: true,
            customAttribution: "등산로: 산림청 등산로정보 | 걷기길: 한국관광공사 두루누비 | 지명 · 자전거길: © OpenStreetMap contributors | <a href=\"about.html\">안내</a>" }), "top-right");
        // 작은 화면에서는 출처를 ⓘ 로 접어 둡니다(누르면 펼쳐짐) - 지도를 가리지 않게
        // (MapLibre 는 처음에 펼쳐 두고 첫 끌기 때 접습니다 - 바로 접고, 지도가 다 뜬 뒤에도 한 번 더)
        function foldAttrib() {
            var a = document.querySelector(".maplibregl-ctrl-attrib");
            if (a) a.classList.remove("maplibregl-compact-show");
        }
        foldAttrib();
        map.once("styledata", foldAttrib);
        map.once("load", foldAttrib);
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
        ["dragstart", "zoomstart"].forEach(function (ev) {
            map.on(ev, function (e) { if (e.originalEvent) setFollow(false); });   // 손으로 움직이면 따라가기를 끕니다
        });
        mapReady = new Promise(function (resolve) {
            map.once("style.load", function () {
                var empty = { type: "FeatureCollection", features: [] };
                // 주변 다른 등산로 - 흐린 선(코스 밖으로 빠졌을 때 어느 길로 돌아갈지 보이게)
                map.addSource("trails", { type: "geojson", data: empty });
                map.addLayer({ id: "trails", type: "line", source: "trails", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#ffe8a3", "line-opacity": 0.55, "line-width": 2, "line-dasharray": [2, 1.5] } });
                map.addSource("route", { type: "geojson", lineMetrics: true, data: empty });
                map.addLayer({ id: "route-case", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#000", "line-opacity": 0.45, "line-width": 8 } });
                map.addLayer({ id: "route-all", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#ffffff", "line-width": 4.5 } });
                map.addLayer({ id: "route-done", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-width": 5, "line-gradient": progressGradient(0) } });
                // 갈림길 - 글자 없이 작은 점
                map.addSource("junctions", { type: "geojson", data: empty });
                map.addLayer({ id: "junctions", type: "circle", source: "junctions",
                    paint: { "circle-radius": 4.5, "circle-color": "#ffffff", "circle-stroke-color": "#1a73e8", "circle-stroke-width": 2 } });
                // 코스에서 벗어났을 때 가장 가까운 길까지 점선
                map.addSource("guide", { type: "geojson", data: empty });
                map.addLayer({ id: "guide", type: "line", source: "guide",
                    paint: { "line-color": "#ff5d5d", "line-width": 3, "line-dasharray": [1.5, 1.2] } });
                resolve();
            });
        });
    }

    function marker(elm, lngLat, anchor) {
        return new maplibregl.Marker({ element: elm, anchor: anchor || "center" }).setLngLat(lngLat).addTo(map);
    }

    function drawCourse() {
        (drawCourse.markers || []).forEach(function (m) { m.remove(); });
        var ms = drawCourse.markers = [];
        map.getSource("route").setData({ type: "Feature", properties: {},
            geometry: { type: "LineString", coordinates: c.lon.map(function (lon, i) { return [lon, c.lat[i]]; }) } });
        // km 번호(동그라미)
        var step = RF.kmStep(c.total);
        for (var m = step; m < c.total - step * 0.3; m += step) {
            var p = RF.at(c, m), e = document.createElement("div");
            e.className = "km";
            e.textContent = String(Math.round(m / 1000));
            ms.push(marker(e, [p.lon, p.lat]));
        }
        // 지점 - 아이콘 + 이름. 출발 · 도착 자리에 이름표가 없으면 "출발" · "도착".
        var n = c.lon.length - 1;
        var hasStart = c.pois.some(function (q) { return +q.dist_m < 60 && +q.off_route_m < 60; });
        var hasEnd = c.pois.some(function (q) { return +q.dist_m > c.total - 60 && +q.off_route_m < 60; });
        var list = c.pois.map(function (q) { return { name: q.name, lon: +q.lon, lat: +q.lat }; });
        if (!hasStart) list.unshift({ name: "출발", lon: c.lon[0], lat: c.lat[0] });
        if (!hasEnd) list.push({ name: "도착", lon: c.lon[n], lat: c.lat[n] });
        list.forEach(function (q) {
            var e = document.createElement("div");
            e.className = "poi";
            e.innerHTML = '<div class="lb"></div><div class="ic"></div>';
            e.querySelector(".lb").textContent = q.name;
            e.querySelector(".ic").textContent = RF.poiIcon(q.name);
            ms.push(new maplibregl.Marker({ element: e, anchor: "bottom", offset: [0, 11] }).setLngLat([q.lon, q.lat]).addTo(map));
        });
        map.getSource("junctions").setData({ type: "FeatureCollection", features: (c.junctions || []).map(function (jd) {
            var jp = RF.at(c, jd);
            return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [jp.lon, jp.lat] } };
        }) });
        var b = new maplibregl.LngLatBounds();
        for (var i = 0; i < c.lon.length; i++) b.extend([c.lon[i], c.lat[i]]);
        map.fitBounds(b, { padding: 40, duration: 0, maxZoom: 16 });
        loadTrails();
    }

    /** 코스 범위(+약 1km)의 주변 등산로. 오프라인이면 저장해 둔 것(서비스 워커)을 씁니다. */
    function courseBbox(pad) {
        var w = Math.min.apply(null, c.lon) - pad, e = Math.max.apply(null, c.lon) + pad;
        var s = Math.min.apply(null, c.lat) - pad, n = Math.max.apply(null, c.lat) + pad;
        // API 는 0.2° 안만 받습니다 - 넓은 코스는 가운데 0.2° 만
        if (e - w > 0.2) { var cx = (w + e) / 2; w = cx - 0.099; e = cx + 0.099; }
        if (n - s > 0.2) { var cy = (s + n) / 2; s = cy - 0.099; n = cy + 0.099; }
        return [w, s, e, n].map(function (v) { return v.toFixed(5); }).join(",");
    }

    function loadTrails() {
        trails = [];
        var id = c.id;
        getJson("api/trails?bbox=" + courseBbox(0.01)).then(function (j) {
            if (!c || c.id !== id) return;
            trails = (j.trails || []).filter(function (t) { return t.id !== id && t.coords.length > 1; }).map(function (t) {
                var tc = { name: t.name, lon: [], lat: [], dist: [0], ele: [] };
                t.coords.forEach(function (p, i) {
                    tc.lon.push(p[0]); tc.lat.push(p[1]); tc.ele.push(null);
                    if (i) tc.dist.push(tc.dist[i - 1] + RF.distM(tc.lat[i - 1], tc.lon[i - 1], p[1], p[0]));
                });
                tc.total = tc.dist[tc.dist.length - 1];
                return tc;
            });
            map.getSource("trails").setData({ type: "FeatureCollection", features: trails.map(function (t) {
                return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: t.lon.map(function (lon, i) { return [lon, t.lat[i]]; }) } };
            }) });
        }).catch(function () { /* 주변 길은 없어도 됩니다 */ });
    }

    /** 가장 가까운 등산로 자리 - 지금 코스와 주변 길 가운데. {lat, lon, off, name(다른 길이면)} */
    function nearestTrail(lat, lon) {
        var s0 = RF.snap(c, lat, lon, null), p0 = RF.at(c, s0.d);
        var best = { lat: p0.lat, lon: p0.lon, off: s0.off, name: null };
        trails.forEach(function (t) {
            var st = RF.snap(t, lat, lon, null);
            if (st.off < best.off) {
                var pt = RF.at(t, st.d);
                best = { lat: pt.lat, lon: pt.lon, off: st.off, name: t.name };
            }
        });
        return best;
    }

    function setMe(lat, lon, heading) {
        // 멈춰 있을 때(GPS 방향이 없을 때)는 나침반 방향을 씁니다
        if ((heading == null || !isFinite(heading) || (hike.speed != null && hike.speed < 0.5)) && compass.heading != null) heading = compass.heading;
        if (!meMarker) {
            var e = document.createElement("div");
            e.className = "me";
            e.innerHTML = '<div class="cone"></div><div class="dot"></div>';
            meMarker = marker(e, [lon, lat]);
        }
        meMarker.setLngLat([lon, lat]);
        var cone = meMarker.getElement().querySelector(".cone");
        if (heading != null && isFinite(heading)) {
            cone.style.display = "block";
            cone.style.transform = "rotate(" + heading + "deg)";
        } else {
            cone.style.display = "none";
        }
    }

    function setFollow(on) {
        hike.follow = on;
        $("follow").classList.toggle("on", on);
    }

    // ------------------------------------------------------------------ 코스

    function loadCourse(id) {
        $("pick").style.display = "none";
        return Promise.all([getJson("api/course?id=" + encodeURIComponent(id)), mapReady]).then(function (r) {
            c = RF.fromApi(id, r[0]);
            if (c.lon.length < 2) throw new Error("경로 점이 없습니다.");
            $("name").textContent = c.course.name;
            document.title = c.course.name + " - routefly 산행";
            drawCourse();
            prof = RF.profile($("profile"), c, {});
            try { $("save").textContent = JSON.parse(localStorage.getItem("rf-offline") || "[]").indexOf(id) >= 0 ? "✅ 저장됨" : "📥 저장"; } catch (e) { /* 무시 */ }
            // 이 기기에 남은 산행 기록(새로 고침 · 화면 꺼짐 뒤에도 이어서)
            var saved = loadSaved();
            hike.d = saved ? saved.d : 0;
            render();
            if (saved) {
                $("go").textContent = "이어서 산행";
                toast("진행 중이던 산행이 있습니다(" + km(saved.d) + "km). \"이어서 산행\" 을 누르세요.", 5000);
            }
        }).catch(function (e) {
            toast("코스를 불러오지 못했습니다: " + e.message, 6000);
            showPick();
        });
    }

    function saveKey() { return "rf-hike-" + c.id; }

    function loadSaved() {
        try {
            var s = JSON.parse(localStorage.getItem(saveKey()) || "null");
            return s && Date.now() - s.start < 24 * 3600 * 1000 ? s : null;   // 하루 지난 기록은 버립니다
        } catch (e) {
            return null;
        }
    }

    function save() {
        if (hike.sim) return;
        try { localStorage.setItem(saveKey(), JSON.stringify({ start: hike.start, d: hike.d, walked: hike.walked })); } catch (e) { /* 저장 못 해도 산행은 계속 */ }
    }

    function clearSaved() {
        try {
            localStorage.removeItem(saveKey());
            localStorage.removeItem(saveKey() + "-track");
        } catch (e) { /* 무시 */ }
    }

    // ------------------------------------------------------------------ 기록(걸은 길) · GPX

    function loadTrack() {
        try { return JSON.parse(localStorage.getItem(saveKey() + "-track") || "[]"); } catch (e) { return []; }
    }

    /** 걸은 자리 하나 - 8m 넘게 움직였거나 1분 지났을 때만(배터리 · 저장 공간 아끼게). */
    function addTrack(lat, lon, t, alt) {
        var last = hike.track[hike.track.length - 1];
        if (last) {
            var d = RF.distM(last[0], last[1], lat, lon);
            if (d < 8 && t - last[2] < 60000) return;
            if (d < 300) hike.walked += d;   // GPS 튐(한 번에 300m 넘게)은 거리에 넣지 않습니다
        }
        hike.track.push([Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6, Math.round(t), alt == null ? null : Math.round(alt)]);
        if (hike.sim) return;
        try { localStorage.setItem(saveKey() + "-track", JSON.stringify(hike.track)); } catch (e) { /* 공간이 모자라도 산행은 계속 */ }
    }

    function records() {
        try { return JSON.parse(localStorage.getItem("rf-records") || "[]"); } catch (e) { return []; }
    }

    /** 순수 함수 - 기록 → GPX 1.1 글. */
    function toGpx(rec) {
        var esc = function (x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
        var pts = rec.track.map(function (p) {
            return '<trkpt lat="' + p[0] + '" lon="' + p[1] + '">' + (p[3] != null ? "<ele>" + p[3] + "</ele>" : "")
                + "<time>" + new Date(p[2]).toISOString() + "</time></trkpt>";
        }).join("\n");
        return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="routefly" xmlns="http://www.topografix.com/GPX/1/1">\n'
            + "<metadata><name>" + esc(rec.name) + "</name><time>" + new Date(rec.start).toISOString() + "</time></metadata>\n"
            + "<trk><name>" + esc(rec.name) + "</name><type>" + esc(rec.kind || "hike") + "</type><trkseg>\n" + pts + "\n</trkseg></trk>\n</gpx>\n";
    }

    function downloadGpx(rec) {
        var blob = new Blob([toGpx(rec)], { type: "application/gpx+xml" });
        var a = document.createElement("a");
        var d = new Date(rec.start);
        a.href = URL.createObjectURL(blob);
        a.download = "routefly-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0")
            + "-" + (rec.courseId || "track") + ".gpx";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    /** 산행을 끝낼 때 - 기록을 "내 기록" 에 남기고 요약을 보여 줍니다(최근 20개만). */
    function finishRecord() {
        if (hike.track.length < 2) return;
        var rec = { courseId: c.id, name: c.course.name, kind: c.course.kind, start: hike.start, end: now(),
                    walked: Math.round(hike.walked), done: Math.round(hike.d), track: hike.track };
        var list = records();
        list.unshift(rec);
        try { localStorage.setItem("rf-records", JSON.stringify(list.slice(0, 20))); } catch (e) {
            try { localStorage.setItem("rf-records", JSON.stringify(list.slice(0, 5))); } catch (e2) { /* 공간 부족 */ }
        }
        var sum = $("doneSum");
        sum.innerHTML = "";
        [["코스", rec.name], ["걸은 거리", km(rec.walked) + " km"], ["코스 진행", km(rec.done) + " / " + km(c.total) + " km"],
         ["걸린 시간", hhmmss(rec.end - rec.start)], ["기록 점", rec.track.length + "개"]].forEach(function (r) {
            var row = document.createElement("div"), a = document.createElement("span"), b = document.createElement("b");
            a.textContent = r[0]; b.textContent = r[1];
            row.appendChild(a); row.appendChild(b); sum.appendChild(row);
        });
        $("doneGpx").onclick = function () { downloadGpx(rec); };
        $("doneSheet").style.display = "flex";
    }

    function showRecords() {
        var box = $("recList"), list = records();
        box.innerHTML = "";
        if (!list.length) {
            box.innerHTML = '<p class="tip">아직 기록이 없습니다. 산행을 시작했다가 "산행 끝내기" 를 누르면 남습니다.</p>';
        }
        list.forEach(function (r, i) {
            var row = document.createElement("div");
            row.className = "rec";
            var info = document.createElement("div"), b = document.createElement("b"), sp = document.createElement("span");
            b.textContent = r.name;
            var d = new Date(r.start);
            sp.textContent = d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + " · " + km(r.walked) + "km · " + hhmmss(r.end - r.start);
            info.appendChild(b); info.appendChild(sp);
            var g = document.createElement("button"); g.textContent = "GPX"; g.onclick = function () { downloadGpx(r); };
            var x = document.createElement("button"); x.textContent = "지우기";
            x.onclick = function () {
                if (!confirm("이 기록을 지울까요?")) return;
                var l = records(); l.splice(i, 1);
                try { localStorage.setItem("rf-records", JSON.stringify(l)); } catch (e) { /* 무시 */ }
                showRecords();
            };
            row.appendChild(info); row.appendChild(g); row.appendChild(x);
            box.appendChild(row);
        });
        $("recSheet").style.display = "flex";
    }

    // ------------------------------------------------------------------ 산행

    var SAFETY_KEY = "rf-safety-ok-v1";   // 안전 · 위치 안내를 읽었는지(내용을 크게 바꾸면 v2 로)

    function safetyOk() {
        try { return localStorage.getItem(SAFETY_KEY) === "1"; } catch (e) { return false; }
    }

    /** 실제 산행을 처음 시작할 때 안전 · 위치 안내를 보여 주고, 확인하면 시작합니다. */
    function askSafety(then) {
        var box = $("safety");
        box.style.display = "flex";
        $("safetyChk").checked = false;
        $("safetyGo").disabled = true;
        $("safetyGo").onclick = function () {
            try { localStorage.setItem(SAFETY_KEY, "1"); } catch (e) { /* 저장 못 하면 다음에 다시 물음 */ }
            box.style.display = "none";
            then();
        };
        $("safetyNo").onclick = function () { box.style.display = "none"; };
    }

    function start(sim) {
        if (!c) return;
        if (!sim && !safetyOk()) { askSafety(function () { start(false); }); return; }
        if (!sim && !navigator.geolocation) { toast("이 기기는 위치(GPS)를 쓸 수 없습니다."); return; }
        if (!sim && !window.isSecureContext) {
            toast("GPS 는 https 주소에서만 켜집니다. 지금은 \"모의 산행\" 으로 화면을 시험해 보세요.", 6000);
            return;
        }
        var saved = sim ? null : loadSaved();
        hike.sim = sim;
        hike.running = true;
        hike.arrived = false;
        hike.hist = [];
        hike.speed = null;
        hike.simClock = Date.now();
        hike.start = saved ? saved.start : now();
        hike.d = saved ? saved.d : 0;
        hike.track = saved ? loadTrack() : [];
        hike.walked = saved && saved.walked ? saved.walked : 0;
        hike.alerted = {};
        hike.sunWarned = false;
        $("save").style.display = "none";
        setFollow(true);
        $("go").textContent = sim ? "모의 끝내기" : "산행 끝내기";
        $("go").classList.add("stop");
        $("sim").style.display = "none";
        $("share").style.display = "none";
        $("arrived").style.display = "none";
        if (sim) {
            hike.simD = 0;
            hike.simLast = performance.now();
            $("gps").textContent = "모의 " + SIM_X + "배속";
            $("gps").className = "";
            hike.simTimer = setInterval(simStep, 500);
            simStep();
        } else {
            $("gps").textContent = "GPS 찾는 중…";
            $("gps").className = "";
            hike.watch = navigator.geolocation.watchPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
            keepAwake();
        }
        hike.timer = setInterval(render, 1000);
        render();
    }

    function stopHike(ask) {
        if (!hike.running) return;
        if (ask && !hike.sim && !confirm("산행을 끝낼까요? 기록(경과 시간 · 진행 거리)이 지워집니다.")) return;
        hike.running = false;
        if (hike.watch != null) navigator.geolocation.clearWatch(hike.watch);
        hike.watch = null;
        clearInterval(hike.timer);
        clearInterval(hike.simTimer);
        if (hike.wake) { try { hike.wake.release(); } catch (e) { /* 무시 */ } hike.wake = null; }
        var wasSim = hike.sim;
        if (!wasSim) {
            finishRecord();
            clearSaved();
        }
        hike.sim = false;
        $("go").textContent = "산행 시작";
        $("go").classList.remove("stop");
        $("sim").style.display = "";
        $("save").style.display = "";
        $("share").style.display = "";
        $("turn").style.display = "none";
        map.getSource("guide").setData({ type: "FeatureCollection", features: [] });
        $("gps").textContent = "GPS 꺼짐";
        $("gps").className = "";
        $("offroute").style.display = "none";
    }

    /** 화면이 꺼지지 않게(지원하는 브라우저에서). 다른 앱에 갔다 오면 다시 겁니다. */
    function keepAwake() {
        if (!("wakeLock" in navigator)) return;
        navigator.wakeLock.request("screen").then(function (w) { hike.wake = w; }).catch(function () { /* 배터리 절약 모드 등 */ });
    }
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible" && hike.running && !hike.sim) keepAwake();
    });

    function onGpsError(e) {
        $("gps").className = "bad";
        $("gps").textContent = e.code === 1 ? "위치 권한 없음" : "GPS 신호 없음";
        if (e.code === 1) toast("위치 권한이 꺼져 있습니다. 브라우저 설정에서 이 사이트의 위치 권한을 허용해 주세요.", 7000);
    }

    /** 위치 한 번 - 코스에 맞추고 화면을 고칩니다. */
    function onFix(pos) {
        if (!c || !hike.running) return;
        var co = pos.coords, t = pos.timestamp || now();
        var acc = co.accuracy;
        if (!hike.sim) {
            $("gps").className = acc != null && acc <= 30 ? "ok" : "";
            $("gps").textContent = "GPS ±" + (acc == null ? "?" : Math.round(acc)) + "m";
            if (acc != null && acc > 100) return;   // 너무 부정확한 위치는 쓰지 않습니다(실내 · 계곡 첫 신호)
        }
        hike.fix = { lat: co.latitude, lon: co.longitude, acc: acc, alt: co.altitude, t: t };
        addTrack(co.latitude, co.longitude, t, co.altitude);
        var s = RF.snap(c, co.latitude, co.longitude, hike.lastFix ? hike.d : null);
        hike.lastFix = t;
        hike.off = s.off;
        if (s.off <= OFF_ROUTE_M * 2) hike.d = s.d;   // 코스에서 아주 멀면 진행 거리는 그대로 둡니다
        // 빠르기 - GPS 가 주면 그것, 아니면 최근 1분 이동 거리로
        hike.hist.push({ t: t, lat: co.latitude, lon: co.longitude });
        while (hike.hist.length > 2 && t - hike.hist[0].t > 60000) hike.hist.shift();
        var v = co.speed;
        if (v == null || !isFinite(v)) {
            var h0 = hike.hist[0], dt = (t - h0.t) / 1000;
            v = dt >= 10 ? distM(h0.lat, h0.lon, co.latitude, co.longitude) / dt : null;
        }
        if (v != null) hike.speed = hike.speed == null ? v : hike.speed * 0.7 + v * 0.3;
        setMe(co.latitude, co.longitude, co.heading);
        if (hike.follow) map.easeTo({ center: [co.longitude, co.latitude], zoom: Math.max(map.getZoom(), 15), duration: 600 });
        if (!hike.arrived && c.total - hike.d <= ARRIVE_M && s.off <= OFF_ROUTE_M) {
            hike.arrived = true;
            var endPoi = c.pois.filter(function (q) { return +q.dist_m > c.total - 60 && +q.off_route_m < 60; }).pop();
            $("arrived").textContent = "🎉 " + (endPoi ? endPoi.name + " " : "") + "도착! " + km(c.total) + "km · " + hhmmss(now() - hike.start);
            $("arrived").style.display = "block";
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        checkJunction();
        save();
        render();
    }

    /** 갈림길 80m 앞이면 한 번 알립니다(진동 + 파란 띠) - "40m 앞 갈림길 · 오른쪽 길". */
    function checkJunction() {
        var box = $("turn");
        if (hike.off > OFF_ROUTE_M) { box.style.display = "none"; return; }
        var next = null;
        (c.junctions || []).forEach(function (jd) { if (jd > hike.d - 15 && (next == null || jd < next)) next = jd; });
        if (next == null || next - hike.d > 80) { box.style.display = "none"; return; }
        var ahead = Math.max(0, Math.round(next - hike.d));
        box.textContent = "🔀 " + (ahead < 15 ? "갈림길" : ahead + "m 앞 갈림길") + " · " + RF.turnWord(c, next);
        box.style.display = "block";
        if (!hike.alerted[next]) {
            hike.alerted[next] = true;
            if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
        }
    }

    /** 모의 산행 - 코스를 따라 걷는 위치를 만들어 onFix 에 넣습니다(약간 흔들리게). */
    function simStep() {
        var nowP = performance.now(), dtReal = nowP - hike.simLast;
        hike.simLast = nowP;
        hike.simClock += dtReal * SIM_X;
        hike.simD = Math.min(c.total, hike.simD + SIM_KMH / 3.6 * dtReal / 1000 * SIM_X);
        var p = RF.at(c, hike.simD), q = RF.at(c, Math.min(c.total, hike.simD + 20));
        var jitter = 4 / 111320;
        onFix({ timestamp: hike.simClock, coords: {
            latitude: p.lat + (Math.random() - 0.5) * jitter, longitude: p.lon + (Math.random() - 0.5) * jitter,
            accuracy: 6, speed: SIM_KMH / 3.6, heading: bearing(p.lat, p.lon, q.lat, q.lon) } });
        if (hike.simD >= c.total) clearInterval(hike.simTimer);
    }

    // ------------------------------------------------------------------ ② 산행 기록

    function setV(id, text, unit) {
        $(id).innerHTML = "";
        $(id).appendChild(document.createTextNode(text));
        if (unit) {
            var s = document.createElement("small");
            s.textContent = unit;
            $(id).appendChild(s);
        }
    }

    /**
     * 남은 시간(ms) - 표준 산행 시간(평지 4km/h + 오르막 600m/h, 네이스미스 규칙)에
     * 지금까지 걸은 빠르기 비율을 곱합니다(10분 넘게 걸은 뒤부터, 0.6~2.5배).
     */
    function remainingMs(elapsed) {
        var std = function (distM, ascM) { return RF.standardMs(c.course.kind, distM, ascM); };
        var left = std(c.total - hike.d, RF.ascentLeft(c, hike.d));
        var factor = 1;
        var doneStd = std(hike.d, RF.ascentLeft(c, 0) - RF.ascentLeft(c, hike.d));
        if (elapsed > 600000 && doneStd > 300000) factor = Math.max(0.6, Math.min(2.5, elapsed / doneStd));
        return left * factor;
    }

    function render() {
        if (!c) return;
        var d = hike.d, p = RF.at(c, d), g = RF.grade(c, d);
        setV("sDone", km(d), "km");
        setV("sLeft", km(Math.max(0, c.total - d)), "km");
        setV("sEle", p.ele == null ? "-" : num(p.ele), "m");
        setV("sGrade", g == null ? "-" : (g > 0 ? "↗ " : g < 0 ? "↘ " : "") + num(Math.abs(g)), "%");
        setV("sSpeed", hike.speed == null || !hike.running ? "-" : num(hike.speed * 3.6, 1), "km/h");
        var elapsed = hike.running ? now() - hike.start : 0;
        setV("sTime", hhmmss(elapsed));
        setV("sAsc", num(RF.ascentLeft(c, d)), "m");
        var nowMs = hike.running ? now() : Date.now();
        var sun = RF.sunset(nowMs, c.lat[0], c.lon[0]);
        $("sunTxt").textContent = sun ? "· 일몰 " + clock(sun) : "";
        $("etaBox").classList.remove("late");
        if (d >= c.total - ARRIVE_M) setV("sEta", "도착");
        else {
            var rem = remainingMs(elapsed), eta = nowMs + rem;
            setV("sEta", clock(eta), " (" + Math.floor(rem / 3600000) + "시간 " + Math.round(rem / 60000) % 60 + "분)");
            // 해 지기 30분 전까지 못 닿을 것 같으면 빨갛게 + 한 번 알림
            if (sun && eta > sun - 1800000) {
                $("etaBox").classList.add("late");
                if (hike.running && !hike.sunWarned) {
                    hike.sunWarned = true;
                    toast("⚠ 예상 도착이 해 지기 30분 전(" + clock(sun - 1800000) + ")보다 늦습니다. 일찍 돌아서는 것도 생각하세요.", 8000);
                    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
                }
            }
        }
        var nx = RF.nextPoi(c, d);
        if (nx) {
            var np = RF.at(c, +nx.dist_m);
            var dEle = np.ele != null && p.ele != null ? np.ele - p.ele : null;
            $("next").innerHTML = "";
            $("next").appendChild(document.createTextNode("다음 "));
            var b = document.createElement("b");
            b.textContent = nx.name;
            $("next").appendChild(b);
            $("next").appendChild(document.createTextNode(" · " + km(+nx.dist_m - d) + "km"
                + (dEle == null ? "" : " · " + (dEle >= 0 ? "+" : "") + num(dEle) + "m")));
        } else {
            $("next").textContent = "다음 지점 없음 - 끝까지 " + km(Math.max(0, c.total - d)) + "km";
        }
        // 코스에서 벗어남 - 가장 가까운 등산로(지금 코스 · 주변 길)까지 거리 · 방향, 지도에 점선
        if (hike.running && hike.off > OFF_ROUTE_M && hike.fix) {
            var me = hike.fix, nt = nearestTrail(me.lat, me.lon), br = bearing(me.lat, me.lon, nt.lat, nt.lon);
            // 화살표: 나침반이 있으면 핸드폰 위쪽 기준(그쪽으로 몸을 돌려 걷게), 없으면 지도(북쪽 위) 기준
            var rel = compass.heading != null ? br - compass.heading : br - map.getBearing();
            $("guideArrow").style.transform = "rotate(" + rel + "deg)";   // 화살표 그림은 위쪽을 가리킵니다
            $("offText").textContent = "코스에서 " + num(hike.off) + "m 벗어남 · " + (nt.name ? "가장 가까운 길(" + nt.name + ")" : "가장 가까운 등산로")
                + "까지 " + num(nt.off) + "m · " + dirWord(br);
            $("offroute").style.display = "flex";
            map.getSource("guide").setData({ type: "Feature", properties: {},
                geometry: { type: "LineString", coordinates: [[me.lon, me.lat], [nt.lon, nt.lat]] } });
        } else {
            $("offroute").style.display = "none";
            if (map.getSource("guide")) map.getSource("guide").setData({ type: "FeatureCollection", features: [] });
        }
        if (prof) prof.set(d);
        if (map.getLayer("route-done")) map.setPaintProperty("route-done", "line-gradient", progressGradient(d / c.total));
    }

    // ------------------------------------------------------------------ 코스 고르기

    function showPick() {
        $("pick").style.display = "flex";
    }

    function listCourses(rows, from) {
        var box = $("pickList");
        box.textContent = "";
        if (!rows.length) {
            var m = document.createElement("div");
            m.className = "msg";
            m.textContent = from ? "주변 5km 안에 코스가 없습니다. 산 이름으로 찾아보세요." : "찾은 코스가 없습니다.";
            box.appendChild(m);
            return;
        }
        rows.forEach(function (r) {
            var it = document.createElement("div");
            it.className = "it";
            var b = document.createElement("b");
            b.textContent = r.name;
            var s = document.createElement("span");
            s.textContent = km(+r.distance_m) + "km" + (r.ascent_m != null ? " · 오르막 " + num(+r.ascent_m) + "m" : "")
                + (r.ele_max_m != null ? " · 최고 " + num(+r.ele_max_m) + "m" : "")
                + (r.away != null ? " · 출발점까지 " + km(r.away) + "km" : "");
            it.appendChild(b);
            it.appendChild(s);
            it.onclick = function () { location.hash = "#c=" + encodeURIComponent(r.course_id); };
            box.appendChild(it);
        });
    }

    var searchTimer = 0;
    $("q").addEventListener("input", function () {
        clearTimeout(searchTimer);
        var q = this.value.trim();
        searchTimer = setTimeout(function () {
            if (!q) return;
            getJson("api/courses?q=" + encodeURIComponent(q) + (kindFilter ? "&kind=" + kindFilter : "")).then(function (j) { listCourses(j.courses || [], null); })
                .catch(function (e) { toast("검색 실패: " + e.message); });
        }, 300);
    });

    $("nearMe").addEventListener("click", function () {
        if (!navigator.geolocation || !window.isSecureContext) { toast("위치는 https 주소에서만 쓸 수 있습니다. 산 이름으로 찾아보세요.", 5000); return; }
        toast("현재 위치를 찾는 중…");
        navigator.geolocation.getCurrentPosition(function (pos) {
            var lat = pos.coords.latitude, lon = pos.coords.longitude, r = 0.045;   // 약 5km
            getJson("api/courses?bbox=" + [lon - r, lat - r, lon + r, lat + r].map(function (v) { return v.toFixed(5); }).join(",")
                    + (kindFilter ? "&kind=" + kindFilter : ""))
                .then(function (j) {
                    var rows = (j.courses || []).map(function (x) {
                        x.away = distM(lat, lon, +x.start_lat, +x.start_lon);
                        return x;
                    }).sort(function (a, b) { return a.away - b.away; });
                    listCourses(rows, true);
                }).catch(function (e) { toast("코스를 찾지 못했습니다: " + e.message); });
        }, function (e) { onGpsError(e); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    });

    // ------------------------------------------------------------------ 시작

    $("safetyChk").addEventListener("change", function () { $("safetyGo").disabled = !this.checked; });
    [].forEach.call(document.querySelectorAll("#kindTabs button"), function (b) {
        b.addEventListener("click", function () {
            kindFilter = b.getAttribute("data-kind");
            [].forEach.call(document.querySelectorAll("#kindTabs button"), function (x) { x.classList.toggle("on", x === b); });
            var ev = document.createEvent("Event"); ev.initEvent("input", true, true); $("q").dispatchEvent(ev);
        });
    });
    $("myRecords").addEventListener("click", showRecords);
    $("recClose").addEventListener("click", function () { $("recSheet").style.display = "none"; });
    $("doneClose").addEventListener("click", function () { $("doneSheet").style.display = "none"; });

    // ------------------------------------------------------------------ 나침반

    function onOrientation(e) {
        var h = null;
        if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;                 // 아이폰
        else if (e.absolute && e.alpha != null) h = (360 - e.alpha) % 360;              // 안드로이드(절대 방위)
        if (h == null) return;
        var sa = screen.orientation && screen.orientation.angle ? screen.orientation.angle : (window.orientation || 0);
        h = (h + sa + 360) % 360;   // 가로 화면 보정
        compass.heading = h;
        $("compass").querySelector(".needle").style.transform = "rotate(" + (-h + (compass.up ? h : 0)) + "deg)";
        $("compassText").textContent = Math.round(h) + "°";
        var t = performance.now();
        if (compass.up && t - compass.lastTurn > 120) {   // 내 방향으로 지도 돌리기(초당 8번까지)
            compass.lastTurn = t;
            map.rotateTo(h, { duration: 100 });
        }
        if (meMarker && hike.fix) setMe(hike.fix.lat, hike.fix.lon, null);
    }

    function compassOn() {
        var go = function () {
            compass.on = true;
            if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", onOrientation);
            else window.addEventListener("deviceorientation", onOrientation);
            $("compass").classList.add("on");
            setTimeout(function () { if (compass.heading == null) toast("이 기기에서는 나침반 방향을 읽지 못했습니다(센서 없음 · 권한 거부).", 5000); }, 2500);
        };
        // 아이폰은 사용자가 누른 순간에 권한을 물어야 합니다
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
            DeviceOrientationEvent.requestPermission().then(function (r) { if (r === "granted") go(); else toast("나침반 권한이 거부되었습니다."); })
                .catch(function () { toast("나침반 권한을 받지 못했습니다."); });
        } else {
            go();
        }
    }

    $("compass").addEventListener("click", function () {
        if (!compass.on) { compassOn(); return; }
        compass.up = !compass.up;   // 켜진 뒤 누르면: 내 방향으로 지도 돌리기 ↔ 북쪽 위로
        $("compass").classList.toggle("up", compass.up);
        if (!compass.up) map.rotateTo(0, { duration: 300 });
        toast(compass.up ? "내가 보는 방향이 위로 오게 지도를 돌립니다." : "북쪽이 위로 오게 되돌렸습니다.", 2500);
    });

    // ------------------------------------------------------------------ SOS

    function fillSos(f) {
        $("sosGrid").textContent = f ? (RF.nationalPoint(f.lat, f.lon) || "범위 밖") : "위치를 찾는 중…";
        $("sosLatLon").textContent = f ? f.lat.toFixed(5) + ", " + f.lon.toFixed(5) + (f.acc ? " (±" + Math.round(f.acc) + "m)" : "") : "-";
        // 해발: GPS 고도가 있으면 그것, 없으면 산행 중 코스 위에 있을 때만 코스 고도(아니면 엉뚱한 값이라 비움)
        var ele = null, eleNote = "";
        if (f && f.alt != null) ele = Math.round(f.alt);
        else if (c && hike.running && hike.off <= OFF_ROUTE_M) { ele = RF.at(c, hike.d).ele; eleNote = " (코스 기준)"; }
        $("sosEle").textContent = ele == null ? "-" : num(ele) + "m" + eleNote;
        var where = c && hike.running ? km(hike.d) + "km 지점" + (hike.off > OFF_ROUTE_M ? " · 코스에서 " + num(hike.off) + "m 벗어남" : "") : "";
        $("sosCourse").textContent = c ? c.course.name + (where ? " · " + where : "") : "-";

        // 보낼 글 - 화면에 보이는 내용 그대로(구조대가 읽기 쉽게 줄바꿈)
        var lines = ["[등산 중 긴급 신고]"];
        if (f) {
            lines.push("국가지점번호: " + (RF.nationalPoint(f.lat, f.lon) || "-"));
            lines.push("위치: " + f.lat.toFixed(5) + ", " + f.lon.toFixed(5) + (f.acc ? " (오차 약 " + Math.round(f.acc) + "m)" : ""));
            if (f.acc && f.acc > 100) lines.push("※ GPS 오차가 큼 - 주변 위치표지판 번호를 함께 확인 바람");
        } else {
            lines.push("위치: 확인 못 함 - 위치표지판 번호로 연락 바람");
        }
        if (ele != null) lines.push("해발: " + Math.round(ele) + "m" + eleNote);
        if (c) lines.push("코스: " + c.course.name + (where ? " (" + where + ")" : ""));
        var nx = c && hike.running ? RF.nextPoi(c, hike.d) : null;
        if (nx) lines.push("다음 지점: " + nx.name + "까지 " + km(+nx.dist_m - hike.d) + "km");
        lines.push("시각: " + clock(Date.now()));
        var body = lines.join("\n");
        sosNow = { f: f, lines: lines, body: body };
        $("sosPhoto").disabled = !f;
        $("sosBody").textContent = body;
        $("sosSms").href = "sms:119" + (/iPhone|iPad/.test(navigator.userAgent) ? "&" : "?") + "body=" + encodeURIComponent(body);
        $("sosCopy").onclick = function () {
            (navigator.clipboard ? navigator.clipboard.writeText(body) : Promise.reject()).then(function () { toast("위치를 복사했습니다."); })
                .catch(function () { prompt("아래 글을 길게 눌러 복사하세요", body); });
        };
    }

    // ---- 위치 사진: 지금 지도(내 위치 · 코스 · 주변 등산로) + 문자와 같은 위치 글을 한 장으로 만들어 공유 창으로 보냅니다
    //      (문자 앱이 링크로 글만 받으므로 사진은 공유 창 → 메시지 → 받는 사람 119 로 보냅니다)

    var sosNow = { f: null, lines: [], body: "" };

    function waitIdle(ms) {
        return new Promise(function (resolve) {
            var done = false, finish = function () { if (!done) { done = true; resolve(); } };
            map.once("idle", finish);
            setTimeout(finish, ms);
        });
    }

    /** 지도 그림을 2D 그림판으로 옮깁니다 - WebGL 은 그린 바로 그때(render 이벤트 안)에만 읽을 수 있습니다. */
    function grabMap() {
        return new Promise(function (resolve) {
            map.once("render", function () {
                var cv = map.getCanvas(), out = document.createElement("canvas");
                out.width = cv.width; out.height = cv.height;
                out.getContext("2d").drawImage(cv, 0, 0);
                resolve(out);
            });
            map.triggerRepaint();
        });
    }

    function scaleBar(mpp) {   // 화면 90px 안에 들어가는 깔끔한 거리
        var steps = [20, 50, 100, 200, 500, 1000, 2000, 5000], m = steps[0];
        steps.forEach(function (x) { if (x / mpp <= 110) m = x; });
        return { m: m, px: m / mpp, label: m >= 1000 ? (m / 1000) + "km" : m + "m" };
    }

    function drawLabel(g, text, x, y, size, color) {
        g.font = "bold " + size + "px sans-serif";
        g.lineWidth = size * 0.28; g.strokeStyle = "rgba(0,0,0,0.85)"; g.lineJoin = "round";
        g.strokeText(text, x, y);
        g.fillStyle = color; g.fillText(text, x, y);
    }

    function sosImage(f, lines) {
        var cam = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing() };
        var zoom = f.acc && f.acc > 300 ? 14 : 15;
        map.jumpTo({ center: [f.lon, f.lat], zoom: zoom, bearing: 0 });
        return waitIdle(8000).then(grabMap).then(function (shot) {
            var cssW = map.getContainer().clientWidth || shot.width;
            var px = shot.width / cssW;                        // 화면 1px 이 그림에서 몇 px
            var W = Math.max(720, shot.width), k = W / shot.width, u = px * k;   // u: 화면 1px → 결과 px
            var mapH = Math.round(shot.height * k);
            var fs = Math.round(W / 26), lh = Math.round(fs * 1.45), pad = Math.round(fs * 0.8);
            var H = mapH + pad * 2 + lh * lines.length + Math.round(fs * 1.2);
            var out = document.createElement("canvas");
            out.width = W; out.height = H;
            var g = out.getContext("2d");
            g.fillStyle = "#11161d"; g.fillRect(0, 0, W, H);
            g.drawImage(shot, 0, 0, W, mapH);

            function xy(lon, lat) { var p = map.project([lon, lat]); return { x: p.x * u, y: p.y * u }; }
            g.save();
            g.beginPath(); g.rect(0, 0, W, mapH); g.clip();
            // 코스 이름표(지도 위 DOM 표시는 사진에 안 찍히므로 직접 씁니다)
            g.textAlign = "left"; g.textBaseline = "middle";
            (c ? c.pois : []).forEach(function (q) {
                var p = xy(+q.lon, +q.lat);
                if (p.x < 0 || p.y < 0 || p.x > W || p.y > mapH) return;
                g.beginPath(); g.arc(p.x, p.y, 4 * u, 0, Math.PI * 2);
                g.fillStyle = "#ffd43b"; g.fill(); g.lineWidth = 1.5 * u; g.strokeStyle = "#000"; g.stroke();
                drawLabel(g, RF.poiIcon(q.name) + " " + q.name, p.x + 7 * u, p.y, Math.round(12 * u), "#fff");
            });
            // 내 위치 - 오차 원 + 빨간 점 + "내 위치"
            var me = xy(f.lon, f.lat);
            var mpp = 40075016.686 * Math.cos(f.lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom()));   // 화면 1px 당 m
            if (f.acc) {
                g.beginPath(); g.arc(me.x, me.y, Math.max(8 * u, f.acc / mpp * u), 0, Math.PI * 2);
                g.fillStyle = "rgba(255,59,48,0.18)"; g.fill();
                g.lineWidth = 2 * u; g.strokeStyle = "rgba(255,59,48,0.9)"; g.stroke();
            }
            g.beginPath(); g.arc(me.x, me.y, 9 * u, 0, Math.PI * 2);
            g.fillStyle = "#ff3b30"; g.fill(); g.lineWidth = 3 * u; g.strokeStyle = "#fff"; g.stroke();
            g.textAlign = "center";
            drawLabel(g, "내 위치", me.x, me.y - 22 * u, Math.round(15 * u), "#ff8787");
            g.restore();
            // 북쪽 · 축척
            g.textAlign = "left";
            drawLabel(g, "▲ 북", 10 * u, 18 * u, Math.round(13 * u), "#fff");
            var sb = scaleBar(mpp), y0 = mapH - 14 * u;
            g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(8 * u, y0 - 18 * u, sb.px * u + 16 * u, 26 * u);
            g.fillStyle = "#fff"; g.fillRect(16 * u, y0, sb.px * u, 3 * u);
            g.font = "bold " + Math.round(11 * u) + "px sans-serif"; g.textBaseline = "alphabetic";
            g.fillText(sb.label, 16 * u, y0 - 4 * u);
            // 위치 글(문자와 똑같은 내용)
            var y = mapH + pad + lh * 0.75;
            lines.forEach(function (t, i) {
                g.font = (i === 0 ? "bold " : "") + fs + "px sans-serif";
                g.fillStyle = i === 0 ? "#ff6b6b" : (/^국가지점번호/.test(t) ? "#ffd43b" : "#eef2f6");
                g.fillText(t, pad, y, W - pad * 2);
                y += lh;
            });
            g.font = Math.round(fs * 0.62) + "px sans-serif"; g.fillStyle = "#8a96a3";
            g.fillText("지도: " + (cfg.vworldKey ? "위성사진 국토교통부 V-World · " : "") + "지형 Terrain Tiles · 등산로 산림청 · routefly", pad, H - pad * 0.7, W - pad * 2);
            return out;
        }).finally(function () {
            map.jumpTo(cam);
        });
    }

    function stamp(ms) {
        var d = new Date(ms), p = function (n) { return (n < 10 ? "0" : "") + n; };
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
    }

    var PHOTO_LABEL = "📷 위치 사진 보내기(지도 + 위치 글)";
    var photoReady = null;   // 만든 사진 {file, url, body} - 공유가 막히면(누른 지 오래됨) 한 번 더 누를 때 보냅니다

    function sharePhoto(p) {
        if (!(navigator.canShare && navigator.canShare({ files: [p.file] }))) {
            // 공유 창을 못 쓰는 브라우저 - 사진을 저장하게 합니다
            var a = document.createElement("a");
            a.href = p.url; a.download = p.file.name;
            document.body.appendChild(a); a.click(); a.remove();
            $("sosPhotoTip").innerHTML = "이 브라우저는 바로 보내기를 못 합니다. 사진을 저장했습니다(안 되면 사진을 <b>길게 눌러 저장</b>).<br>" +
                "문자 앱에서 119 에게 사진을 붙여 보내세요.";
            return Promise.resolve();
        }
        $("sosPhotoTip").innerHTML = "공유 창에서 <b>메시지</b> → 받는 사람 <b>119</b> → 보내기. 공유 창이 닫혔으면 버튼을 다시 누르세요.";
        return navigator.share({ files: [p.file], text: p.body }).catch(function (e) {
            if (e && e.name === "NotAllowedError") {   // 사진 만드는 사이 '누름'이 만료됨 - 한 번 더 누르게
                $("sosPhoto").textContent = "📤 사진 보내기(한 번 더 누르세요)";
                toast("사진이 준비됐습니다. 📤 버튼을 한 번 더 누르세요.", 5000);
                return "again";
            }
            if (e && e.name !== "AbortError") throw e;
        });
    }

    $("sosPhoto").addEventListener("click", function () {
        var now0 = sosNow, btn = $("sosPhoto");
        if (!now0.f) { toast("위치를 찾은 뒤에 만들 수 있습니다."); return; }
        if (photoReady && photoReady.f === now0.f && photoReady.body === now0.body) {   // 이미 만든 사진 - 바로 보냅니다
            sharePhoto(photoReady).then(function (r) { if (r !== "again") btn.textContent = PHOTO_LABEL; })
                .catch(function (e) { toast("보내기 실패: " + (e && e.message || e), 5000); });
            return;
        }
        btn.disabled = true;
        btn.textContent = "📷 사진 만드는 중…";
        var label = PHOTO_LABEL;
        sosImage(now0.f, now0.lines).then(function (cv) {
            return new Promise(function (resolve, reject) {
                cv.toBlob(function (b) { b ? resolve(b) : reject(new Error("그림 저장 실패")); }, "image/jpeg", 0.88);
            });
        }).then(function (blob) {
            var name = "sos119-" + stamp(Date.now()) + ".jpg";
            var img = $("sosPhotoImg");
            if (photoReady) URL.revokeObjectURL(photoReady.url);
            photoReady = { f: now0.f, body: now0.body, url: URL.createObjectURL(blob), file: new File([blob], name, { type: "image/jpeg" }) };
            img.src = photoReady.url;
            $("sosPhotoBox").style.display = "block";
            return sharePhoto(photoReady);
        }).then(function (r) {
            if (r === "again") label = "📤 사진 보내기(한 번 더 누르세요)";
        }).catch(function (e) {
            toast("사진을 못 만들었습니다: " + (e && e.message || e) + " - 문자 신고를 쓰세요.", 5000);
        }).finally(function () { btn.disabled = false; btn.textContent = label; });
    });

    $("sos").addEventListener("click", function () {
        $("sosSheet").style.display = "flex";
        $("sosPhotoBox").style.display = "none";
        $("sosPhoto").textContent = PHOTO_LABEL;
        var fresh = hike.fix && Date.now() - (hike.sim ? Date.now() : hike.fix.t) < 60000 ? hike.fix : null;
        fillSos(fresh);
        if (!fresh && navigator.geolocation && window.isSecureContext) {
            navigator.geolocation.getCurrentPosition(function (pos) {
                fillSos({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, alt: pos.coords.altitude, t: Date.now() });
            }, function () { $("sosGrid").textContent = "위치를 못 찾음 - 표지판 번호를 불러 주세요"; },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
        } else if (!fresh) {
            $("sosGrid").textContent = "위치를 못 씀(https 필요) - 표지판 번호를 불러 주세요";
        }
    });
    $("sosClose").addEventListener("click", function () { $("sosSheet").style.display = "none"; });

    // ------------------------------------------------------------------ 공유 · 오프라인 저장

    $("share").addEventListener("click", function () {
        if (!c) return;
        var url = new URL("s/" + encodeURIComponent(c.id) + "?to=hike", location.href).href;
        var text = c.course.name + " · " + km(c.total) + "km";
        if (navigator.share) navigator.share({ title: c.course.name, text: text, url: url }).catch(function () {});
        else (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("링크를 복사했습니다: " + url, 5000); })
            .catch(function () { prompt("링크를 복사하세요", url); });
    });

    /** 지도 타일 주소들 - 코스 범위의 z(lo~hi). */
    function tileUrls(template, z0, z1, bbox) {
        var out = [];
        function tx(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
        function ty(lat, z) { var r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); }
        for (var z = z0; z <= z1; z++) {
            for (var x = tx(bbox[0], z); x <= tx(bbox[2], z); x++) {
                for (var y = ty(bbox[3], z); y <= ty(bbox[1], z); y++) {
                    out.push(template.replace("{z}", z).replace("{x}", x).replace("{y}", y));
                }
            }
        }
        return out;
    }

    /**
     * 오프라인 저장 - 코스 · 주변 길 자료와 코스 둘레(약 500m) 지도 그림을 핸드폰에 받아 둡니다(서비스 워커가 통신이 끊기면 씀).
     * 타일은 3,000장 안으로 - 넘으면 가장 자세한 단계를 줄입니다.
     */
    $("save").addEventListener("click", function () {
        if (!c) return;
        if (!("caches" in window) || !window.isSecureContext) { toast("오프라인 저장은 https 주소에서만 됩니다.", 5000); return; }
        var pad = 0.005, b = [Math.min.apply(null, c.lon) - pad, Math.min.apply(null, c.lat) - pad, Math.max.apply(null, c.lon) + pad, Math.max.apply(null, c.lat) + pad];
        var style = map.getStyle(), urls = [];
        var zMax = 16, list;
        do {
            list = [];
            Object.keys(style.sources).forEach(function (k) {
                var src = style.sources[k];
                if (!src.tiles || !src.tiles[0]) return;
                var hi = Math.min(zMax, src.maxzoom || 16);
                list = list.concat(tileUrls(src.tiles[0], 10, hi, b));
            });
            zMax--;
        } while (list.length > 3000 && zMax >= 12);
        urls = ["api/course?id=" + encodeURIComponent(c.id), "api/trails?bbox=" + courseBbox(0.01), "api/map-config"].concat(list);
        var btn = $("save"), done = 0, failed = 0, i = 0;
        btn.disabled = true;
        caches.open("rf-offline-v1").then(function (cache) {
            function next() {
                if (i >= urls.length) return Promise.resolve();
                var u = urls[i++];
                return fetch(u, { mode: "cors" }).then(function (r) {
                    if (r.ok) return cache.put(u, r);
                    failed++;
                }).catch(function () { failed++; }).then(function () {
                    done++;
                    btn.textContent = Math.round(done / urls.length * 100) + "%";
                    return next();
                });
            }
            return Promise.all([next(), next(), next(), next(), next(), next()]);
        }).then(function () {
            btn.disabled = false;
            btn.textContent = "✅ 저장됨";
            try {
                var saved = JSON.parse(localStorage.getItem("rf-offline") || "[]");
                if (saved.indexOf(c.id) < 0) saved.push(c.id);
                localStorage.setItem("rf-offline", JSON.stringify(saved));
            } catch (e) { /* 무시 */ }
            toast("오프라인 저장 끝 - 지도 " + (urls.length - 3) + "장" + (failed ? " (못 받은 " + failed + "장)" : "") + ". 통신이 끊겨도 이 코스는 보입니다.", 6000);
        }).catch(function (e) {
            btn.disabled = false;
            btn.textContent = "📥 저장";
            toast("저장하지 못했습니다: " + e.message, 5000);
        });
    });

    $("go").addEventListener("click", function () { if (hike.running) stopHike(true); else start(false); });
    $("sim").addEventListener("click", function () { start(true); });
    $("follow").addEventListener("click", function () {
        setFollow(true);
        if (meMarker) map.easeTo({ center: meMarker.getLngLat(), zoom: Math.max(map.getZoom(), 15), duration: 500 });
    });

    function route() {
        var m = /[#&]c=([^&]+)/.exec(location.hash);
        if (hike.running) stopHike(false);
        if (m) loadCourse(decodeURIComponent(m[1])); else showPick();
    }
    window.addEventListener("hashchange", route);

    getJson("api/map-config").catch(function () {
        return { demUrl: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: null };
    }).then(function (j) {
        cfg = { demUrl: j.demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: j.vworldKey || null };
        startMap();
        if (/[?&]debug\b/.test(location.search)) window.routeflyHike = { map: map, hike: hike, get c() { return c; },   // 시험용
            fix: function (lat, lon) { onFix({ timestamp: now(), coords: { latitude: lat, longitude: lon, accuracy: 5, speed: 1, heading: null } }); },
            heading: function (h) { onOrientation({ webkitCompassHeading: h }); } };
        route();
    });
})();
