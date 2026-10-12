/*
 * 공원 · 산 전체 보기(park.html?name=지리산[&from=코스ID]) - /api/park 의 탐방로 전체 선 · 이름표 · 위험지역 · 조망점.
 * 국립공원은 공단 공식 탐방로, 도립 · 군립공원과 다른 산은 from 코스 둘레의 같은 산 코스(2026-10-11 홍TV님).
 * 2026-10-10 홍TV님: 공원 안내도처럼 산 전체를 한눈에. 바탕 지도는 따라가기 화면과 같은 V-World(키가 없으면 지형 음영만).
 */
(function () {
    "use strict";
    var RF = window.RF;
    function $(id) { return document.getElementById(id); }
    var q = new URLSearchParams(location.search), park = q.get("name") || "", from = q.get("from"), backTo = q.get("back");
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

    /** 탐방로 하나를 고름 - 굵게 · 아래 칸에 이름 · 거리와 미리보기 · 산행하기. */
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
        // 따라가기 첫 화면 목록의 탐방 안내도 카드에서 왔으면(back=list) 단추 하나 - 그 탐방로를 따라가기 화면으로(2026-10-12 홍TV님)
        row.innerHTML = listMode ? '<a class="main" href="hike.html#c=' + id + '">따라가기</a>'
            : '<a href="index.html#c=' + id + '">미리보기</a><a class="main" href="hike.html#c=' + id + '">산행하기</a>';
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

        // 위험 · 조망 아이콘을 먼저 붙여 이름표 아래로(2026-10-11 PC: 천왕봉 · 피아골 둘레에서 아이콘이 이름 글자를 가렸음)
        // 아이콘도 겹침 거르기에 넣되 이름표보다 뒤(넓게 볼 때 이름표와 겹치면 숨기고, 확대하면 다시 보임 - 2026-10-12 홍TV님 "글자 겹치는 건?")
        var spotEls = [];
        (data.spots || []).forEach(function (sp) {
            var e = document.createElement("div");
            e.className = "spot";
            e.textContent = RF.spotIcon(sp.kind);
            e.title = RF.spotText(sp);
            // 점 아래쪽에 붙임 - 이름표는 점 위쪽(anchor bottom)이라 같은 자리(반야봉 · 헬기장)여도 늘 숨지 않게(2026-10-12 PC)
            new maplibregl.Marker({ element: e, anchor: "top" }).setLngLat([+sp.lon, +sp.lat]).addTo(map);
            spotEls.push(e);
        });
        // 이름표 - 높은 봉우리 먼저 보이게(겹치면 낮은 것을 숨김)
        data.places.forEach(function (p) {
            var e = document.createElement("div");
            e.className = "place";
            e.innerHTML = '<span class="ic"></span><span class="lb"></span>';
            e.querySelector(".ic").textContent = RF.poiIcon(p.name);
            e.querySelector(".lb").textContent = RF.cleanName(p.name) + (p.ele_m != null && RF.isTopName(p.name) ? " " + RF.num(p.ele_m) + "m" : "");
            new maplibregl.Marker({ element: e, anchor: "bottom" }).setLngLat([+p.lon, +p.lat]).addTo(map);
            places.push({ el: e, prio: -(p.ele_m == null ? 0 : +p.ele_m) - (RF.isTopName(p.name) ? 5000 : 0) });
        });
        // 이름표끼리 · 아이콘끼리 따로 겹침 거르기, 이름표에 걸린 아이콘은 그 이름표 바로 아래로 비킴(숨기지 않음) -
        // 2026-10-12 PC: 반야봉 이름표와 같은 자리 헬기장이 어느 축척에서도 숨었음(점이 정상보다 북쪽이라 아래에 붙여도 이름표 칸 안)
        var spots = spotEls.map(function (e) { return { el: e, prio: 0 }; });
        function placeSpots() {
            spotEls.forEach(function (e) { e.style.marginTop = "0px"; });
            RF.declutter(spots);
            var boxes = places.filter(function (it) { return !it.el.classList.contains("hid"); }).map(function (it) { return it.el.getBoundingClientRect(); });
            spotEls.forEach(function (e) {
                if (e.classList.contains("hid")) return;
                var r = e.getBoundingClientRect(), push = 0;
                boxes.forEach(function (l) {
                    if (r.left < l.right && r.right > l.left && r.top + push < l.bottom && r.bottom + push > l.top) push = l.bottom + 2 - r.top;
                });
                if (push > 0) e.style.marginTop = push + "px";
            });
        }
        var timer = 0;
        map.on("render", function () {
            if (timer) return;
            timer = setTimeout(function () { timer = 0; RF.declutter(places); placeSpots(); }, 150);
        });

        var b = data.bbox;
        // 2026-10-12 홍TV님 "조금 키워야": 여백 30 → 옆 20(이름표가 끝에 걸쳐 잘리지 않게) · 위아래 24, 한도 14 → 14.6(막대 200m 쯤).
        // 작은 산은 둘레 마을 · 길까지 보이게 확대 한도 14(MapLibre 512px 줌 - 폭 375px 폰에서 축척 막대 300m, 15 는 100m 였음 2026-10-12 터널로 확인) - 2026-10-12 홍TV님: 공주향교뒷산(코스 0.3km)이 막대 50m 로 너무 크게 보였음
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { top: 24, bottom: 24, left: 20, right: 20 }, duration: 0, maxZoom: OVERVIEW_MAX_ZOOM });
        // 목록 카드에서 왔으면 from 은 그 산을 찾는 데만 쓰고 고르지 않음(아무 코스나 골라져 있어 헷갈렸음)
        if (from && !listMode) data.trails.forEach(function (t) { if (t.id === from) pick(t); });
        $("msg").style.display = "none";
    }

    /** 전체 보기 첫 화면의 최대 확대(손으로는 더 확대할 수 있음). */
    var OVERVIEW_MAX_ZOOM = 14.6;

    /** 따라가기 첫 화면 목록의 탐방 안내도 카드에서 왔는가 - ‹ 코스 단추 없이, 아래는 "따라가기" 하나. */
    var listMode = backTo === "list";

    function start() {
        $("title").textContent = park ? park + " 탐방 안내도" : "탐방 안내도";   // 2026-10-12 홍TV님: "전체 보기" → "탐방 안내도"
        // ‹ 코스 - 코스 미리보기에서 왔으면(back=preview) 따라가기의 "🗺 코스 미리보기" 와 같은 첫 화면(검색 · 목록, 2026-10-11 홍TV님),
        // 따라가기에서 왔으면 그 코스의 따라가기
        if (backTo === "preview") $("back").href = "./";
        else if (listMode) {   // 목록 카드에서 왔으면: 위 "← 뒤로" 는 따라가기 화면(검색 목록 - 검색어는 rf-search 로 남아 있음), 아래 "따라가기" 는 고른 탐방로로
            $("back").textContent = "← 뒤로";
            $("back").href = "hike.html";
            $("sheet").classList.add("listmode");
            $("sheet").innerHTML = '<div class="tip">탐방로를 누르면 그 코스를 따라갈 수 있습니다.</div><div class="row"><a class="main" id="followNone" href="hike.html">따라가기</a></div>';
            $("followNone").addEventListener("click", function (e) {   // 탐방로를 고르기 전(2026-10-12 홍TV님)
                e.preventDefault();
                alert("탐방로를 선택하세요.");
            });
        }
        else if (from) $("back").href = "hike.html#c=" + encodeURIComponent(from);
        Promise.all([
            getJson("api/map-config").catch(function () { return {}; }),
            getJson("api/park?name=" + encodeURIComponent(park) + (from ? "&from=" + encodeURIComponent(from) : ""))
        ]).then(function (r) {
            cfg = { demUrl: r[0].demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: r[0].vworldKey || null };
            data = r[1];
            // 국립공원도 "지리산 탐방 안내도" - "국립공원" 을 붙이면 375px 에서 공식 지도 단추에 잘림(2026-10-12)
            if (data.map && /^https:\/\//.test(data.map)) {   // https 주소만(javascript: 등은 넣지 않음 - 2026-10-11 점검)
                $("official").href = data.map;
                $("official").style.display = "inline-block";
                $("credit").style.display = "block";
            }
            map = new maplibregl.Map({ container: "map", style: style(cfg), center: [127.8, 36.3], zoom: 7,
                attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false });
            map.touchZoomRotate.disableRotation();
            map.addControl(new maplibregl.AttributionControl({ compact: true,
                customAttribution: (data.national ? "탐방로: 국립공원공단 탐방로 공간데이터" : "등산로: 산림청 · 한국등산트레킹지원센터 · OpenStreetMap")
                    + " | 지명: © OpenStreetMap contributors | <a href=\"about.html\">안내</a>" }), "top-right");
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
