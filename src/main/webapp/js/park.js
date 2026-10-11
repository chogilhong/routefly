/*
 * 국립공원 전체 보기(park.html?name=지리산[&from=코스ID]) - /api/park 의 공식 탐방로 전체 선 · 이름표 · 위험지역 · 조망점.
 * 2026-10-10 홍TV님: 공원 안내도처럼 산 전체를 한눈에. 바탕 지도는 따라가기 화면과 같은 V-World(키가 없으면 지형 음영만).
 */
(function () {
    "use strict";
    var RF = window.RF;
    function $(id) { return document.getElementById(id); }
    var q = new URLSearchParams(location.search), park = q.get("name") || "", from = q.get("from");
    var map, light = true, cfg = null, data = null, places = [];

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
            return r.json().catch(function () { return { success: false, message: "응답을 읽지 못했습니다 (HTTP " + r.status + ")" }; })
                .then(function (j) {
                    if (!r.ok || !j || j.success === false) throw new Error((j && j.message) || ("HTTP " + r.status));
                    return j;
                });
        });
    }

    function style(c) {
        var dem = { type: "raster-dem", tiles: [c.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: "지형: Terrain Tiles (AWS Open Data)" };
        var sources = { hillshade: dem }, layers = [{ id: "bg", type: "background", paint: { "background-color": c.vworldKey ? "#1b2430" : "#dcd6c6" } }];
        if (c.vworldKey) {
            var key = encodeURIComponent(c.vworldKey);
            sources.sat = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, attribution: "위성사진: 국토교통부 V-World",
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/{z}/{y}/{x}.jpeg"] };
            sources.base = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, attribution: "지도: 국토교통부 V-World",
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Base/{z}/{y}/{x}.png"] };
            layers.push({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } });
            layers.push({ id: "base", type: "raster", source: "base" });
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", paint: { "hillshade-exaggeration": 0.3 } });
        } else {
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade",
                paint: { "hillshade-exaggeration": 0.65, "hillshade-shadow-color": "#3d4a3a", "hillshade-highlight-color": "#fbf7ea" } });
        }
        return { version: 8, sources: sources, layers: layers };
    }

    function setLight(on) {
        light = on;
        if (map.getLayer("sat")) map.setLayoutProperty("sat", "visibility", on ? "none" : "visible");
        if (map.getLayer("base")) map.setLayoutProperty("base", "visibility", on ? "visible" : "none");
        map.setPaintProperty("trails", "line-color", on ? "#e8590c" : "#ffffff");
        map.setPaintProperty("trails-case", "line-color", on ? "#ffffff" : "#000000");
        $("layerBtn").textContent = on ? "🛰️" : "🗺️";
    }

    /** 탐방로 하나를 고름 - 굵게 · 아래 칸에 이름 · 거리와 미리보기 · 따라가기. */
    function pick(t) {
        map.getSource("sel").setData(t ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: t.coords } }
            : { type: "FeatureCollection", features: [] });
        if (!t) return;
        var id = encodeURIComponent(t.id);
        $("sheet").innerHTML = "";
        var nm = document.createElement("div");
        nm.className = "nm";
        nm.textContent = t.name;
        var st = document.createElement("div");
        st.className = "st";
        st.textContent = RF.km(t.distance_m) + "km · 오르막 " + RF.num(t.ascent_m) + "m";
        var row = document.createElement("div");
        row.className = "row";
        row.innerHTML = '<a href="index.html#c=' + id + '">미리보기</a><a class="main" href="hike.html#c=' + id + '">따라가기</a>';
        $("sheet").appendChild(nm);
        $("sheet").appendChild(st);
        $("sheet").appendChild(row);
    }

    function draw() {
        var lines = data.trails.map(function (t, i) {
            return { type: "Feature", id: i, properties: { i: i }, geometry: { type: "LineString", coordinates: t.coords } };
        });
        map.addSource("trails", { type: "geojson", data: { type: "FeatureCollection", features: lines } });
        map.addLayer({ id: "trails-case", type: "line", source: "trails", layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 } });
        map.addLayer({ id: "trails", type: "line", source: "trails", layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#e8590c", "line-width": 3 } });
        map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "sel", type: "line", source: "sel", layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": RF.LINE_COLOR, "line-width": 6 } });
        // 손가락으로 누르기 쉽게 - 보이지 않는 굵은 선으로 고름
        map.addLayer({ id: "trails-hit", type: "line", source: "trails", paint: { "line-color": "#000", "line-opacity": 0, "line-width": 22 } });
        map.on("click", "trails-hit", function (e) {
            var f = e.features && e.features[0];
            if (f) pick(data.trails[f.properties.i]);
        });
        map.on("mouseenter", "trails-hit", function () { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "trails-hit", function () { map.getCanvas().style.cursor = ""; });

        // 이름표 - 높은 봉우리 먼저 보이게(겹치면 낮은 것을 숨김)
        data.places.forEach(function (p) {
            var e = document.createElement("div");
            e.className = "place";
            e.innerHTML = '<span class="ic"></span><span class="lb"></span>';
            e.querySelector(".ic").textContent = RF.poiIcon(p.name);
            e.querySelector(".lb").textContent = p.name + (p.ele_m != null && RF.isTopName(p.name) ? " " + RF.num(p.ele_m) + "m" : "");
            new maplibregl.Marker({ element: e, anchor: "bottom" }).setLngLat([+p.lon, +p.lat]).addTo(map);
            places.push({ el: e, prio: -(p.ele_m == null ? 0 : +p.ele_m) - (RF.isTopName(p.name) ? 5000 : 0) });
        });
        (data.spots || []).forEach(function (sp) {
            var e = document.createElement("div");
            e.className = "spot";
            e.textContent = RF.spotIcon(sp.kind);
            e.title = RF.spotText(sp);
            new maplibregl.Marker({ element: e }).setLngLat([+sp.lon, +sp.lat]).addTo(map);
        });
        var timer = 0;
        map.on("render", function () {
            if (timer) return;
            timer = setTimeout(function () { timer = 0; RF.declutter(places); }, 150);
        });

        var b = data.bbox;
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 30, duration: 0 });
        if (from) data.trails.forEach(function (t) { if (t.id === from) pick(t); });
        $("msg").style.display = "none";
    }

    function start() {
        $("title").textContent = park ? park + " 국립공원 전체 보기" : "국립공원 전체 보기";
        if (from) $("back").href = "hike.html#c=" + encodeURIComponent(from);
        Promise.all([
            getJson("api/map-config").catch(function () { return {}; }),
            getJson("api/park?name=" + encodeURIComponent(park))
        ]).then(function (r) {
            cfg = { demUrl: r[0].demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: r[0].vworldKey || null };
            data = r[1];
            if (data.map) {
                $("official").href = data.map;
                $("official").style.display = "inline-block";
            }
            map = new maplibregl.Map({ container: "map", style: style(cfg), center: [127.8, 36.3], zoom: 7,
                attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false });
            map.touchZoomRotate.disableRotation();
            map.addControl(new maplibregl.AttributionControl({ compact: true,
                customAttribution: "탐방로: 국립공원공단 탐방로 공간데이터 | 지명: © OpenStreetMap contributors | <a href=\"about.html\">안내</a>" }), "top-right");
            // 출처는 ⓘ 로 접어 둠(따라가기 화면과 같게 - 지도를 가리지 않게)
            var fold = function () { var a = document.querySelector(".maplibregl-ctrl-attrib"); if (a) a.classList.remove("maplibregl-compact-show"); };
            fold();
            map.once("load", fold);
            map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
            map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
            map.once("load", function () {
                draw();
                if (cfg.vworldKey) {
                    $("layerBtn").style.display = "block";
                    $("layerBtn").addEventListener("click", function () { setLight(!light); });
                }
            });
        }).catch(function (e) {
            $("msg").textContent = e.message || "공원 탐방로를 읽지 못했습니다.";
        });
    }

    start();
})();
