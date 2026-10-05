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
                 simLast: 0, simD: 0, speed: null, hist: [], wake: null, follow: true, arrived: false, lastFix: 0 };

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
            sources.label = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19,
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Hybrid/{z}/{y}/{x}.png"] };
            layers.push({ id: "sat", type: "raster", source: "sat" });
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", paint: { "hillshade-exaggeration": 0.2 } });
            layers.push({ id: "label", type: "raster", source: "label", paint: { "raster-opacity": 0.85 } });   // 걸을 때는 길 · 지명이 도움이 됩니다
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
            customAttribution: "지명: © OpenStreetMap contributors" }), "top-right");
        // 작은 화면에서는 출처를 ⓘ 로 접어 둡니다(누르면 펼쳐짐) - 지도를 가리지 않게
        map.once("load", function () {
            var a = document.querySelector(".maplibregl-ctrl-attrib");
            if (a) a.classList.remove("maplibregl-compact-show");
        });
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
        ["dragstart", "zoomstart"].forEach(function (ev) {
            map.on(ev, function (e) { if (e.originalEvent) setFollow(false); });   // 손으로 움직이면 따라가기를 끕니다
        });
        mapReady = new Promise(function (resolve) {
            map.once("style.load", function () {
                map.addSource("route", { type: "geojson", lineMetrics: true, data: { type: "FeatureCollection", features: [] } });
                map.addLayer({ id: "route-case", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#000", "line-opacity": 0.45, "line-width": 8 } });
                map.addLayer({ id: "route-all", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#ffffff", "line-width": 4.5 } });
                map.addLayer({ id: "route-done", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-width": 5, "line-gradient": progressGradient(0) } });
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
        var b = new maplibregl.LngLatBounds();
        for (var i = 0; i < c.lon.length; i++) b.extend([c.lon[i], c.lat[i]]);
        map.fitBounds(b, { padding: 40, duration: 0, maxZoom: 16 });
    }

    function setMe(lat, lon, heading) {
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
        try { localStorage.setItem(saveKey(), JSON.stringify({ start: hike.start, d: hike.d })); } catch (e) { /* 저장 못 해도 산행은 계속 */ }
    }

    function clearSaved() {
        try { localStorage.removeItem(saveKey()); } catch (e) { /* 무시 */ }
    }

    // ------------------------------------------------------------------ 산행

    function start(sim) {
        if (!c) return;
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
        setFollow(true);
        $("go").textContent = sim ? "모의 끝내기" : "산행 끝내기";
        $("go").classList.add("stop");
        $("sim").style.display = "none";
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
        if (!hike.sim) clearSaved();
        hike.sim = false;
        $("go").textContent = "산행 시작";
        $("go").classList.remove("stop");
        $("sim").style.display = "";
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
        save();
        render();
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
        var std = function (distM, ascM) { return (distM / 4000 + ascM / 600) * 3600000; };
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
        if (d >= c.total - ARRIVE_M) setV("sEta", "도착");
        else {
            var rem = remainingMs(elapsed);
            setV("sEta", clock((hike.running ? now() : Date.now()) + rem), " (" + Math.floor(rem / 3600000) + "시간 " + Math.round(rem / 60000) % 60 + "분)");
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
        // 코스에서 벗어남 - 코스 쪽 방향을 알려 줍니다
        if (hike.running && hike.off > OFF_ROUTE_M && meMarker) {
            var me = meMarker.getLngLat(), s = RF.snap(c, me.lat, me.lng, null), sp = RF.at(c, s.d);
            $("offroute").textContent = "⚠ 코스에서 " + num(hike.off) + "m 벗어났습니다 · 코스는 " + dirWord(bearing(me.lat, me.lng, sp.lat, sp.lon));
            $("offroute").style.display = "block";
        } else {
            $("offroute").style.display = "none";
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
            getJson("api/courses?q=" + encodeURIComponent(q)).then(function (j) { listCourses(j.courses || [], null); })
                .catch(function (e) { toast("검색 실패: " + e.message); });
        }, 300);
    });

    $("nearMe").addEventListener("click", function () {
        if (!navigator.geolocation || !window.isSecureContext) { toast("위치는 https 주소에서만 쓸 수 있습니다. 산 이름으로 찾아보세요.", 5000); return; }
        toast("현재 위치를 찾는 중…");
        navigator.geolocation.getCurrentPosition(function (pos) {
            var lat = pos.coords.latitude, lon = pos.coords.longitude, r = 0.045;   // 약 5km
            getJson("api/courses?bbox=" + [lon - r, lat - r, lon + r, lat + r].map(function (v) { return v.toFixed(5); }).join(","))
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
        if (/[?&]debug\b/.test(location.search)) window.routeflyHike = { map: map, hike: hike, get c() { return c; } };   // 시험용
        route();
    });
})();
