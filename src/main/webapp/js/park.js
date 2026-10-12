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

    function setLight(on) {
        light = on;
        if (map.getLayer("sat")) map.setLayoutProperty("sat", "visibility", on ? "none" : "visible");
        if (map.getLayer("base")) map.setLayoutProperty("base", "visibility", on ? "visible" : "none");
        map.setPaintProperty("trails", "line-color", on ? "#e8590c" : "#ffffff");
        map.setPaintProperty("trails-case", "line-color", on ? "#ffffff" : "#000000");
        $("layerBtn").textContent = on ? "🛰️" : "🗺️";
    }

    /**
     * 탐방로 고르기 - 누르면 고르고 다시 누르면 뺌, 고른 것 앞 · 뒤로 이어지는 탐방로는 함께(2026-10-12 홍TV님: 등산도 노선 안내도처럼
     * 이어진 구간으로). 아래 칸에 처음 → 끝 두 방향 단추(따라가기), 하나만 골랐으면 미리보기도.
     */
    var sel = [], lines = {}, flips = {}, byId = {}, segs = [], emptySheet = "", poiNames = {};
    function pick(t) {
        if (t) sel = RF.chainPick(sel, t.id, lines);
        map.getSource("sel").setData({ type: "FeatureCollection", features: sel.map(function (s) {
            return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: lines[s.id] } };
        }) });
        if (!sel.length) { $("sheet").innerHTML = emptySheet; return; }
        var ends = function (s) {
            var e = RF.routeEnds(byId[s.id].name), a = flips[s.id] ? e.to : e.from, b = flips[s.id] ? e.from : e.to;
            return s.rev ? [b, a] : [a, b];
        };
        var from = ends(sel[0])[0], to = ends(sel[sel.length - 1])[1], one = sel.length === 1 ? byId[sel[0].id] : null;
        var meters = sel.reduce(function (m, s) { return m + (+byId[s.id].distance_m || 0); }, 0);
        $("sheet").innerHTML = "";
        var nm = document.createElement("div");
        nm.className = "nm";
        nm.textContent = one ? one.name : sel.length + "구간 이어 걷기" + (from || to ? " · " + (from || "") + " → " + (to || "") : "");
        var st = document.createElement("div");
        st.className = "st";
        st.textContent = RF.km(meters) + "km" + (one && one.ascent_m != null ? " · 오르막 " + RF.num(one.ascent_m) + "m" : " · 오르막은 따라가기 화면에서");
        if (one && !listMode && !one.base) {   // 하나만 골랐으면 코스 미리보기(3D)도 - 이은 코스는 미리보기가 받지 못함
            var pv = document.createElement("a");
            pv.href = "index.html#c=" + encodeURIComponent(one.id);
            pv.textContent = " · 미리보기 ›";
            pv.className = "pv";
            st.appendChild(pv);
        }
        var row = document.createElement("div");
        row.className = "row";
        var link = function (list) {
            return "hike.html#c=" + (list.length === 1 ? encodeURIComponent(list[0].id) + (list[0].rev ? "&rev=1" : "") : encodeURIComponent(RF.joinId(list)));
        };
        var both = from && to;
        [[both ? from + " → " + to : "따라가기", sel], [both ? to + " → " + from : "거꾸로 따라가기", RF.reverseSel(sel)]].forEach(function (d, k) {
            var a = document.createElement("a");
            if (k === 0) a.className = "main";
            a.href = link(d[1]);
            a.textContent = d[0];
            row.appendChild(a);
        });
        var tip = document.createElement("div");
        tip.className = "tip";
        tip.textContent = "이어진 탐방로를 더 누르면 함께 고르고, 다시 누르면 뺍니다. 따라갈 방향을 고르세요.";
        $("sheet").appendChild(nm);
        $("sheet").appendChild(st);
        $("sheet").appendChild(tip);
        $("sheet").appendChild(row);
    }

    function draw() {
        data.trails.forEach(function (t) { lines[t.id] = t.coords; });
        // 선이 이름과 거꾸로 그려진 탐방로(이웃 탐방로 끝이 모이는 점으로 앎) - 단추 · 이름을 걸어 나가는 차례로
        flips = RF.routeFlips(data.trails.map(function (t) { return { course_id: t.id, name: t.name }; }), lines);
        // 갈림길에서 자른 작은 구간(주능선 노고단고개 → 천왕봉을 장터목 · 세석 · 벽소령 … 에서) - 고르기 · 그리기는 이것으로
        segs = RF.splitTrails(data.trails, flips, null, poiNames);
        lines = {};
        segs.forEach(function (t) { lines[t.id] = t.coords; byId[t.id] = t; });
        var feats = segs.map(function (t, i) {
            return { type: "Feature", id: i, properties: { i: i }, geometry: { type: "LineString", coordinates: t.coords } };
        });
        map.addSource("trails", { type: "geojson", data: { type: "FeatureCollection", features: feats } });
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
            if (f) pick(segs[f.properties.i]);
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
        if (from && !listMode) segs.forEach(function (t) { if (t.id === from) pick(t); });   // 잘린 탐방로면 고르지 않음
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
        }
        else if (from) $("back").href = "hike.html#c=" + encodeURIComponent(from);
        // 고른 탐방로가 없을 때 아래 칸(모두 빼면 다시 이것으로). 따라가기는 아래 칸에 맡겨 받음(다시 그려도 됨)
        emptySheet = $("sheet").innerHTML;
        $("sheet").addEventListener("click", function (e) {
            if (!e.target || e.target.id !== "followNone") return;
            e.preventDefault();
            alert("탐방로를 선택하세요.");   // 탐방로를 고르기 전(2026-10-12 홍TV님)
        });
        Promise.all([
            getJson("api/map-config").catch(function () { return {}; }),
            getJson("api/park?name=" + encodeURIComponent(park) + (from ? "&from=" + encodeURIComponent(from) : ""))
        ]).then(function (r) {
            cfg = { demUrl: r[0].demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: r[0].vworldKey || null };
            data = r[1];
            // 이름에 출발 · 도착이 없는 탐방로("덕유산 · 종주코스" · "한라산 · 성판악 탐방로")는 코스 이름표를 받아 갈림길 이름으로(splitTrails).
            // 그런 탐방로만, 20개까지, 4초 안에 못 받으면 받은 것만으로 그림
            var bare = data.trails.filter(function (t) { var e = RF.routeEnds(t.name); return !e.from && !e.to; }).slice(0, 20);
            var poiReady = Promise.all(bare.map(function (t) {
                return getJson("api/course?id=" + encodeURIComponent(t.id)).then(function (j) {
                    var pts = j.points || [];
                    poiNames[t.id] = { total: pts.length ? +pts[pts.length - 1][3] : 0, pois: j.pois || [] };
                }, function () { /* 이름표 없이 */ });
            }));
            var poiWait = Promise.race([poiReady, new Promise(function (ok) { setTimeout(ok, 4000); })]);
            // 국립공원도 "지리산 탐방 안내도" - "국립공원" 을 붙이면 375px 에서 공식 지도 단추에 잘림(2026-10-12)
            if (data.map && /^https:\/\//.test(data.map)) {   // https 주소만(javascript: 등은 넣지 않음 - 2026-10-11 점검)
                $("official").href = data.map;
                $("official").style.display = "inline-block";
                $("credit").style.display = "block";
            }
            map = new maplibregl.Map({ container: "map", style: RF.baseStyle(cfg), center: [127.8, 36.3], zoom: 7,
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
                poiWait.then(function () {
                    draw();
                    if (cfg.vworldKey) {   // 바탕 바꾸기는 탐방로 층이 생긴 뒤에
                        $("layerBtn").style.display = "block";
                        $("layerBtn").addEventListener("click", function () { setLight(!light); });
                    }
                });
            });
        }).catch(function (e) {
            $("msg").textContent = e.message || "공원 탐방로를 읽지 못했습니다.";
        });
    }

    start();
})();
