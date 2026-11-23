/*!
 * rfmap - routefly 우리 지도 패키지(2026-11-23 홍TV님 "지도 모양까지 전부 · 패키지로 만들어 두자")
 *
 * 바탕(korea.pmtiles, OpenMapTiles 양식) + 더하기 층(korea-extra.pmtiles) + 구 이름 · 지하철 노선(data/) + 글꼴(fonts/, Noto Sans - OFL)을
 * MapLibre 지도 모양으로 엮습니다. 쓰는 곳은 이 폴더를 통째로 vendor/rfmap-<판>/ 에 복사해 씁니다(sync.js) - 고칠 때는 tools 저장소 map/rfmap/ 만.
 * 필요한 것: maplibre-gl(BSD-3) · pmtiles.js(BSD-3)가 먼저 실린 페이지. 출처 표시는 지도 모양의 sources 에 들어 있음(OpenMapTiles · OpenStreetMap).
 *
 * window.RFMap = { VERSION, open, style, ICONS, iconImage, poiShowFilter, peakOnFilter, PEAK_KEY_EXPR, peakKey, peaksNear,
 *                  mvtPoints, tilesAlong, tileLonLat, tilePeaks, CONTOUR_STEPS, contourPaint }
 * 자세한 것은 README.md.
 */
(function (global) {
    "use strict";
    var VERSION = "1.0.0";
    // 이 파일이 있는 폴더(글꼴 · 자료 기본 자리) - node 테스트에서는 빈 글자
    var BASE = (function () {
        try { var s = global.document && global.document.currentScript; return s && s.src ? new URL(".", s.src).href : ""; } catch (e) { return ""; }
    })();

    /** 두 점 사이 거리(m, 하버사인) - routefly course-kit.js 의 distM 과 같은 식(패키지가 혼자 서도록 따로 둠). */
    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    /**
     * 순수 함수 - 우리 바탕 지도(OSM → Planetiler 벡터 PMTiles, OpenMapTiles 양식 - docs/basemap/README.md)의 지도 모양(2026-11-22 홍TV님 "지도 작업을 계속 하자고", 2단계 기록 보기).
     * c - {basemapUrl, demUrl, extraUrl?, lang?("en" 이면 영어 이름), data?(구 이름 · 노선 자료 폴더, 기본 이 패키지 data/)}, fonts - 글꼴 폴더 주소(기본 이 패키지 fonts/). 색 · 굵기는 우리가 정함(램블러 · OpenTopoMap 을 따라 하지 않음).
     * 한글 글자는 폰 글꼴로 그림(지도 프로그램 localIdeographFontFamily) - 받는 글꼴은 숫자 · 로마자(Noto Sans, OFL)만. 지형 음영은 지금처럼 demUrl.
     */
    function vectorStyle(c, fonts) {
        fonts = fonts || BASE + "fonts/";
        var data = c.data || BASE + "data/", tr = function (ko, en) { return c.lang === "en" ? en : ko; };
        var src = "pmtiles://" + c.basemapUrl, ko = ["coalesce", ["get", "name:ko"], ["get", "name"]], F = ["Noto Sans Regular"];
        var line = function (id, filter, color, w, extra) {
            var l = { id: id, type: "line", source: "omt", "source-layer": "transportation", filter: filter,
                layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": color, "line-width": w } };
            for (var k in extra || {}) l.paint[k] = extra[k];
            return l;
        };
        var cls = function (list) { return ["match", ["get", "class"], list, true, false]; };
        var hikePoiIcon = ["case",
            ["all", ["==", ["get", "class"], "lodging"], ["==", ["get", "subclass"], "alpine_hut"]], "rf-hut",
            ["==", ["get", "class"], "shelter"], "rf-hut",
            ["all", ["==", ["get", "class"], "place_of_worship"], ["==", ["get", "subclass"], "buddhist"]], "rf-temple",
            ["all", ["==", ["get", "class"], "attraction"], ["==", ["get", "subclass"], "viewpoint"]], "rf-view",
            ["==", ["get", "class"], "drinking_water"], "rf-water",
            ["==", ["get", "class"], "railway"], "rf-rail", ""];   // 기차 · 지하철역(OMT poi class railway - 2026-11-23 홍TV님 "지하철역 · 도시 안내")
        var peakText = ["case", ["has", "ele"], ["concat", "▲ ", ko, "\n", ["to-string", ["get", "ele"]], "m"], ["concat", "▲ ", ko]];
        var style = {
            version: 8,
            glyphs: fonts + "{fontstack}/{range}.pbf",
            sources: {
                omt: { type: "vector", url: src, attribution: "© OpenMapTiles © OpenStreetMap contributors" },
                marks: { type: "geojson", data: { type: "FeatureCollection", features: [] } },   // 공단 대피소 · 100대 명산 정상(화면이 famousMarks 로 채움)
                subway: { type: "geojson", data: data + "subway-lines.json" },   // 지하철 노선(OSM, ODbL - 바탕 출처 줄의 OpenStreetMap 에 들어감)
                gu: { type: "geojson", data: data + "gu-labels.json" },   // 구 이름 자리 - 우리 지도 파일은 확대 14 조각에만 있어(OMT place borough) 미리 뽑아 둠(tools/basemap/gu-labels.py)
                hillshade: { type: "raster-dem", tiles: [c.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: tr("지형: ", "Terrain: ") + "Terrain Tiles (AWS Open Data)" }
            },
            layers: [
                { id: "bg", type: "background", paint: { "background-color": "#f2efe6" } },
                { id: "landuse", type: "fill", source: "omt", "source-layer": "landuse", filter: cls(["residential", "suburb", "neighbourhood", "commercial", "retail", "industrial"]), paint: { "fill-color": "#e9e2d6" } },
                { id: "farm", type: "fill", source: "omt", "source-layer": "landcover", filter: cls(["farmland", "grass"]), paint: { "fill-color": "#e6ecd3" } },
                { id: "wood", type: "fill", source: "omt", "source-layer": "landcover", filter: cls(["wood", "forest"]), paint: { "fill-color": "#cfe0bd" } },
                { id: "rock", type: "fill", source: "omt", "source-layer": "landcover", filter: cls(["rock", "sand", "ice"]), paint: { "fill-color": "#e4e0d8" } },
                { id: "park", type: "line", source: "omt", "source-layer": "park", paint: { "line-color": "#5f8f4e", "line-width": 1.2, "line-dasharray": [3, 2], "line-opacity": 0.7 } },
                { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": "#a8cbe0" } },
                { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": "#8bb8d6", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 15, 2] } },
                { id: "hillshade", type: "hillshade", source: "hillshade", paint: { "hillshade-exaggeration": 0.4, "hillshade-shadow-color": "#4a5544", "hillshade-highlight-color": "#fffdf5" } },
                { id: "boundary", type: "line", source: "omt", "source-layer": "boundary", filter: ["<=", ["get", "admin_level"], 6], paint: { "line-color": "#9a8fa6", "line-width": 1, "line-dasharray": [4, 2, 1, 2] } },
                line("path", cls(["path", "track"]), "#a0522d", ["interpolate", ["linear"], ["zoom"], 12, 0.8, 16, 2], { "line-dasharray": [2, 1.5] }),
                line("road-minor", cls(["minor", "service", "tertiary"]), "#ffffff", ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 4]),
                line("road-major", cls(["primary", "secondary", "trunk", "motorway"]), "#f4c96b", ["interpolate", ["linear"], ["zoom"], 7, 0.8, 16, 6]),
                line("rail", cls(["rail", "transit"]), "#8a8a8a", 1, { "line-dasharray": [3, 3] }),
                // 지하철 노선 색 선(2026-11-23 홍TV님 "지하철 노선끼리 선을 연결 · 노선표 색") - OSM 노선 관계의 colour 그대로(tools/basemap/subway-lines.py, 수도권만)
                { id: "subway", type: "line", source: "subway", minzoom: 9, layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": ["get", "colour"], "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 12, 2.2, 15, 4] } },
                // 큰길(고속도로 · 국도 · 큰 도로) 이름은 더 멀리서부터(2026-11-23 홍TV님 "큰길 이름 · 도시 안내"), 고속도로는 이름이 없으면 번호(ref)
                { id: "road-name-major", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 11, filter: cls(["motorway", "trunk", "primary"]),
                    layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:ko"], ["get", "name"], ["get", "ref"]], "text-font": F, "text-size": 11.5 },
                    paint: { "text-color": "#6b4a1a", "text-halo-color": "#fff", "text-halo-width": 1.5 } },
                { id: "road-name", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 13, filter: ["!", cls(["motorway", "trunk", "primary"])],
                    layout: { "symbol-placement": "line", "text-field": ko, "text-font": F, "text-size": 11 }, paint: { "text-color": "#5a4a3a", "text-halo-color": "#fff", "text-halo-width": 1.2 } },
                { id: "water-name", type: "symbol", source: "omt", "source-layer": "water_name",
                    layout: { "text-field": ko, "text-font": F, "text-size": 11 }, paint: { "text-color": "#3f6f8f", "text-halo-color": "#fff", "text-halo-width": 1 } },
                // 구 이름(2026-11-23 홍TV님 "종로구, 도봉구, 강북구, 노원구 등 구역 표시도") - 국토부 지도처럼 옅고 크게, 봉우리 · 역 · 마을 이름에 자리를 내줌(앞 층). 구 경계선은 boundary 층(admin_level 6)
                { id: "gu-name", type: "symbol", source: "gu", minzoom: 10,
                    layout: { "text-field": tr(["get", "name"], ["coalesce", ["get", "name_en"], ["get", "name"]]), "text-font": F,
                        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 13, 12, 17, 15, 21], "text-letter-spacing": 0.08, "text-allow-overlap": true, "text-ignore-placement": true },   // 국토부처럼 늘 깔림 - 다른 글자 자리는 막지 않음
                    paint: { "text-color": "#76688c", "text-opacity": 0.8, "text-halo-color": "#fffdf5", "text-halo-width": 1.4 } },
                { id: "peak", type: "symbol", source: "omt", "source-layer": "mountain_peak", minzoom: 10, filter: peakOnFilter([], false),
                    layout: { "text-field": peakText, "text-font": F, "text-size": 11, "text-anchor": "top", "text-offset": [0, 0.2] },
                    paint: { "text-color": "#6b3d1e", "text-halo-color": "#fffdf5", "text-halo-width": 1.4 } },
                { id: "place", type: "symbol", source: "omt", "source-layer": "place", filter: cls(["city", "town", "village", "hamlet", "suburb"]),
                    layout: { "text-field": ko, "text-font": F, "text-size": ["match", ["get", "class"], "city", 16, "town", 14, 12] },
                    paint: { "text-color": "#333", "text-halo-color": "#fff", "text-halo-width": 1.5 } },
                // 대피소 · 절 · 전망대 · 약수터(2026-11-22 홍TV님 "대피소, 절 등 표시해줘") - OpenMapTiles v3.15 poi 층: 산장 tourism=alpine_hut → class lodging · subclass alpine_hut,
                // 쉼터 amenity=shelter → class shelter, 절 amenity=place_of_worship → class place_of_worship · subclass 는 religion(buddhist), 전망대 → class attraction · subclass viewpoint,
                // 약수터 amenity=drinking_water → class drinking_water. 확대 12 ~ 13 은 중요한 것만, 14 부터 모두(OMT). 아이콘 그림은 화면이 그려 넣음(rf-hut 등 - 받는 글꼴에 그림 글자가 없음)
                { id: "poi-hike", type: "symbol", source: "omt", "source-layer": "poi", minzoom: 12, filter: poiShowFilter(hikePoiIcon, []),
                    layout: { "icon-image": hikePoiIcon, "icon-size": 1, "icon-allow-overlap": false, "text-font": F, "text-size": 11,
                        // 역은 국토부 지도처럼 "○○역"(이름이 역으로 안 끝나면 붙임 - OSM 지하철역 이름은 "노원" 처럼 역이 없음, 2026-11-23 홍TV님)
                        "text-field": ["case", ["all", ["==", hikePoiIcon, "rf-rail"], ["!=", ["slice", ko, ["max", 0, ["-", ["length", ko], 1]]], "역"]], ["concat", ko, "역"], ko],
                        "text-anchor": "top", "text-offset": ["case", ["==", hikePoiIcon, "rf-rail"], ["literal", [0, 0.5]], ["literal", [0, 0.9]]], "text-optional": true },
                    paint: { "text-color": ["match", hikePoiIcon, "rf-temple", "#8b1e1e", "rf-water", "#1f5f8b", "rf-rail", "#1f4e8c", "#5a3510"], "text-halo-color": "#fffdf5", "text-halo-width": 1.4 } },
                // 기록이 지나간 봉우리는 조금 크게 · 진하게(2026-11-22 홍TV님) - 어느 봉우리인지는 화면이 peaksNear 로 찾아 setFilter. 맨 뒤 층이라 글자 자리를 먼저 잡음
                { id: "peak-on", type: "symbol", source: "omt", "source-layer": "mountain_peak", minzoom: 9, filter: peakOnFilter([], true),
                    layout: { "text-field": peakText, "text-font": F, "text-size": 13.5, "text-anchor": "top", "text-offset": [0, 0.2], "symbol-sort-key": ["-", 0, ["coalesce", ["get", "ele"], 0]] },
                    paint: { "text-color": "#4a2208", "text-halo-color": "#fffdf5", "text-halo-width": 2 } },
                // 멀리 봐도 보이게 - 맨 뒤 층일수록 글자 자리를 먼저 잡음: 명산 정상(맨 뒤) > 공단 대피소(2026-11-23 PC: 처음 화면에서 천왕봉이 장터목에 밀려 빠졌음)
                { id: "rf-hut", type: "symbol", source: "marks", minzoom: 8, filter: ["==", ["get", "kind"], "hut"],
                    layout: { "icon-image": "rf-hut", "text-field": ["get", "label"], "text-font": F, "text-size": 11.5, "text-anchor": "top", "text-offset": [0, 0.9], "text-optional": true },
                    paint: { "text-color": "#5a3510", "text-halo-color": "#fffdf5", "text-halo-width": 1.6 } },
                { id: "rf-peak", type: "symbol", source: "marks", minzoom: 7, filter: ["==", ["get", "kind"], "peak"],
                    layout: { "text-field": ["get", "label"], "text-font": F, "text-size": 13.5, "text-anchor": "top", "text-offset": [0, 0.2] },
                    paint: { "text-color": "#4a2208", "text-halo-color": "#fffdf5", "text-halo-width": 2 } }
            ]
        };
        if (c.extraUrl) {   // 더하기 층 - 아파트 단지(확대 14 ~) · 아파트 동(15 ~) 이름, 봉우리 층 바로 앞(봉우리 · 역 · 대피소에 자리를 내줌)
            // 출처는 바탕 줄(© OpenMapTiles © OpenStreetMap contributors)에 OSM 이 이미 있어 따로 안 붙임(두 번 보이지 않게)
            style.sources.rfx = { type: "vector", url: "pmtiles://" + c.extraUrl };
            var label = function (id, kind, minzoom, size, color) {
                return { id: id, type: "symbol", source: "rfx", "source-layer": "rf_label", minzoom: minzoom, filter: ["==", ["get", "kind"], kind],
                    layout: { "text-field": tr(["get", "name"], ["coalesce", ["get", "name_en"], ["get", "name"]]), "text-font": F, "text-size": size, "text-max-width": 7, "text-padding": 3 },
                    paint: { "text-color": color, "text-halo-color": "#fffdf5", "text-halo-width": 1.3 } };
            };
            var at = style.layers.map(function (l) { return l.id; }).indexOf("peak");
            style.layers.splice(at, 0, label("rf-apt", "apartment", 15, 10.5, "#7a7287"), label("rf-complex", "complex", 14, 12.5, "#5d5470"));
        }
        return style;
    }

    /** 우리 지도 poi-hike 층 아이콘(이름 → 동그라미 색 · 안 그림). 화면이 캔버스로 그려 map.addImage - 집 · 눈 · 물방울은 선으로(글꼴마다 ⌂ 등이 뭉개짐), 절은 卍(한자라 폰 글꼴에 있음). */
    var MAP_ICONS = { "rf-hut": ["#7a4a1c", "house"], "rf-temple": ["#b23b2e", "卍"], "rf-view": ["#2f7d4f", "eye"], "rf-water": ["#2a73b8", "drop"], "rf-rail": ["#ffffff", "dot"] };   // 역은 국토부 지도처럼 작은 흰 동그라미(2026-11-23 홍TV님 "🚉 아이콘은 없어도 돼")

    /** 순수 함수 - 우리 지도 poi-hike 층 거름: 아이콘이 있고(icon = 층의 icon-image 식) 숨긴 것(hidden - "rf-hut" 등)이 아닌 것만(2026-11-22 홍TV님 "마커 별로 숨기고 보이고"). */
    function poiShowFilter(icon, hidden, dropNames) {
        var f = ["all", ["!=", icon, ""]];
        if (hidden && hidden.length) f.push(["!", ["in", icon, ["literal", hidden.slice()]]]);
        if (dropNames && dropNames.length) f.push(["!", ["in", ["get", "name"], ["literal", dropNames.slice()]]]);   // 공단 대피소(rf-hut 층)와 겹치는 OSM 대피소
        return f.length === 2 ? f[1] : f;
    }

    /**
     * 우리 바탕 지도(PMTiles) 준비 - 파일 머리를 먼저 읽고 되면 pmtiles:// 를 지도 프로그램에 걸고 style 을, 못 읽으면(404 등) null.
     * 기록 보기(trip.js) · 3D 비행 영상(app.js)이 함께 씀(2026-11-23). basemapUrl - 바탕 파일 주소(페이지 기준 상대 주소 가능), demUrl - 지형 타일, opts.lang - "en" 이면 영어 이름.
     */
    var pmtilesOn = false, basemapFile = null;   // 머리를 읽은 우리 지도 파일(trackTilePeaks 가 같은 파일에서 조각을 직접 읽음)

    /**
     * 순수 함수 - Mapbox 벡터 조각(MVT, protobuf) 한 장에서 layer 의 점(Point)만 꺼냄 → [{props, x, y, extent}].
     * 지도 프로그램 밖에서 조각을 읽을 때(trackTilePeaks) - 점 · 이름 정도만 읽는 작은 해석기(선 · 면은 건너뜀).
     */
    function mvtPoints(u8, layer) {
        var out = [];
        var varint = function (b, st) { var v = 0, m = 1, c; do { c = b[st.p++]; v += (c & 127) * m; m *= 128; } while (c >= 128); return v; };
        var skip = function (b, st, wt) { if (wt === 0) varint(b, st); else if (wt === 1) st.p += 8; else if (wt === 2) { var n = varint(b, st); st.p += n; } else if (wt === 5) st.p += 4; else throw new Error("mvt wire " + wt); };
        var str = function (b, a, e) { return new TextDecoder("utf-8").decode(b.subarray(a, e)); };
        var top = { p: 0 };
        while (top.p < u8.length) {
            var tag = varint(u8, top), f = Math.floor(tag / 8), wt = tag & 7;
            if (f !== 3 || wt !== 2) { skip(u8, top, wt); continue; }
            var len = varint(u8, top), end = top.p + len, st = { p: top.p }, name = null, keys = [], vals = [], feats = [], extent = 4096;
            while (st.p < end) {
                var t2 = varint(u8, st), f2 = Math.floor(t2 / 8), w2 = t2 & 7;
                if (f2 === 1 && w2 === 2) { var n1 = varint(u8, st); name = str(u8, st.p, st.p + n1); st.p += n1; }
                else if (f2 === 3 && w2 === 2) { var n3 = varint(u8, st); keys.push(str(u8, st.p, st.p + n3)); st.p += n3; }
                else if (f2 === 5 && w2 === 0) extent = varint(u8, st);
                else if ((f2 === 2 || f2 === 4) && w2 === 2) {
                    var n2 = varint(u8, st), e2 = st.p + n2;
                    if (f2 === 2) feats.push([st.p, e2]);
                    else {   // 값(Value): 1 글자 · 2 float · 3 double · 4 int · 5 uint · 6 sint · 7 참거짓
                        var v = null, sv = { p: st.p };
                        while (sv.p < e2) {
                            var t3 = varint(u8, sv), f3 = Math.floor(t3 / 8), w3 = t3 & 7;
                            if (f3 === 1 && w3 === 2) { var n4 = varint(u8, sv); v = str(u8, sv.p, sv.p + n4); sv.p += n4; }
                            else if (f3 === 2 && w3 === 5) { v = new DataView(u8.buffer, u8.byteOffset + sv.p, 4).getFloat32(0, true); sv.p += 4; }
                            else if (f3 === 3 && w3 === 1) { v = new DataView(u8.buffer, u8.byteOffset + sv.p, 8).getFloat64(0, true); sv.p += 8; }
                            else if ((f3 === 4 || f3 === 5) && w3 === 0) v = varint(u8, sv);
                            else if (f3 === 6 && w3 === 0) { var zz = varint(u8, sv); v = zz % 2 ? -(zz + 1) / 2 : zz / 2; }
                            else if (f3 === 7 && w3 === 0) v = !!varint(u8, sv);
                            else skip(u8, sv, w3);
                        }
                        vals.push(v);
                    }
                    st.p = e2;
                } else skip(u8, st, w2);
            }
            top.p = end;
            if (name !== layer) continue;
            feats.forEach(function (fe) {
                var sf = { p: fe[0] }, tags = [], type = 0, geom = [];
                while (sf.p < fe[1]) {
                    var t4 = varint(u8, sf), f4 = Math.floor(t4 / 8), w4 = t4 & 7;
                    if ((f4 === 2 || f4 === 4) && w4 === 2) { var n5 = varint(u8, sf), e5 = sf.p + n5, arr = f4 === 2 ? tags : geom; while (sf.p < e5) arr.push(varint(u8, sf)); }
                    else if (f4 === 3 && w4 === 0) type = varint(u8, sf);
                    else skip(u8, sf, w4);
                }
                if (type !== 1 || geom.length < 3 || (geom[0] & 7) !== 1) return;
                var props = {};
                for (var i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]];
                var zx = function (u) { return u % 2 ? -(u + 1) / 2 : u / 2; };
                out.push({ props: props, x: zx(geom[1]), y: zx(geom[2]), extent: extent });   // 점 여럿(MultiPoint)이면 첫 점만
            });
        }
        return out;
    }

    /** 순수 함수 - 선의 점들이 지나는 확대 z 조각 [x, y] 목록(겹치지 않게, 많으면 max 개까지). */
    function tilesAlong(lat, lon, z, max) {
        var n = Math.pow(2, z), seen = {}, out = [];
        for (var i = 0; i < Math.min(lat.length, lon.length); i++) {
            var x = Math.floor((lon[i] + 180) / 360 * n), r = lat[i] * Math.PI / 180, y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n), k = x + "/" + y;
            if (seen[k]) continue;
            seen[k] = true; out.push([x, y]);
            if (out.length >= max) break;
        }
        return out;
    }

    /** 순수 함수 - 조각 안 자리(px, py, extent) → [lon, lat]. */
    function tileLonLat(z, x, y, px, py, extent) {
        var n = Math.pow(2, z), lon = (x + px / extent) / n * 360 - 180, m = Math.PI * (1 - 2 * (y + py / extent) / n);
        return [lon, Math.atan(Math.sinh(m)) * 180 / Math.PI];
    }

    /**
     * 기록 선이 지나는 확대 12 조각의 봉우리(mountain_peak)를 지도 파일에서 바로 읽음 → Promise([{name, ele, cls, lon, lat}]).
     * 처음 열 때(확대 10 ~ 11) 지도 조각에는 작은 봉우리(사패산 등)가 빠져 있어 구간이 안 나뉘었음(2026-11-23 PC 운영 v360). 우리 지도가 아니면 빈 목록.
     */
    function trackTilePeaks(lat, lon) {
        if (!basemapFile) return Promise.resolve([]);
        var Z = 12, tiles = tilesAlong(lat, lon, Z, 40);
        return Promise.all(tiles.map(function (t) {
            return basemapFile.getZxy(Z, t[0], t[1]).then(function (r) {
                if (!r || !r.data) return [];
                return mvtPoints(new Uint8Array(r.data), "mountain_peak").map(function (p) {
                    var g = tileLonLat(Z, t[0], t[1], p.x, p.y, p.extent);
                    return { name: p.props.name, ele: p.props.ele, cls: p.props["class"], lon: g[0], lat: g[1] };
                });
            }, function () { return []; });
        })).then(function (all) { return [].concat.apply([], all); });
    }
    function vectorBasemap(basemapUrl, demUrl, opts) {
        opts = opts || {};
        if (!basemapUrl || !global.pmtiles || !global.maplibregl) return Promise.resolve(null);
        var url = new URL(basemapUrl, location.href).href, file = new global.pmtiles.PMTiles(url), proto = new global.pmtiles.Protocol();
        // 더하기 층(아파트 단지 이름 등 - tools 저장소 map/extra.yml) - 바탕 옆 "-extra.pmtiles", 없으면 바탕만(2026-11-23 홍TV님)
        var extraUrl = url.replace(/\.pmtiles$/, "-extra.pmtiles"), extra = new global.pmtiles.PMTiles(extraUrl);
        var extraOk = extraUrl === url ? Promise.resolve(false) : extra.getHeader().then(function () { return true; }, function () { return false; });
        return file.getHeader().then(function () {
            proto.add(file);   // 머리를 읽은 그 파일을 지도도 씀(머리를 두 번 받지 않음)
            basemapFile = file;
            if (!pmtilesOn) { global.maplibregl.addProtocol("pmtiles", proto.tile); pmtilesOn = true; }   // 파일 하나에서 필요한 조각만 Range 로 받음
            return extraOk.then(function (ok) {
                if (ok) proto.add(extra);
                return vectorStyle({ basemapUrl: url, demUrl: demUrl, extraUrl: ok ? extraUrl : null, lang: opts.lang });
            });
        }, function () { return null; });
    }

    /** 우리 지도 아이콘(MAP_ICONS) 하나를 캔버스로 그려 map.addImage(styleimagemissing 때) - 흰 테 동그라미 + 흰 그림. 모르는 이름 · 이미 있으면 그냥 둠. */
    function mapIconImage(map, id) {
        var ic = MAP_ICONS[id];
        if (!ic || map.hasImage(id)) return;
        if (ic[1] === "dot") {   // 역 - 작은 흰 동그라미 + 진한 테(12칸)
            var rr = global.devicePixelRatio > 1 ? 2 : 1, m = 12 * rr, cd = document.createElement("canvas"), gd = cd.getContext("2d");
            cd.width = cd.height = m;
            gd.beginPath(); gd.arc(m / 2, m / 2, m / 2 - 1.5 * rr, 0, Math.PI * 2);
            gd.fillStyle = ic[0]; gd.fill(); gd.lineWidth = 2 * rr; gd.strokeStyle = "#3a4654"; gd.stroke();
            map.addImage(id, gd.getImageData(0, 0, m, m), { pixelRatio: rr });
            return;
        }
        var r = global.devicePixelRatio > 1 ? 2 : 1, n = 22 * r, cv = document.createElement("canvas"), g = cv.getContext("2d");
        cv.width = cv.height = n;
        g.beginPath(); g.arc(n / 2, n / 2, n / 2 - r, 0, Math.PI * 2);
        g.fillStyle = ic[0]; g.fill(); g.lineWidth = 1.5 * r; g.strokeStyle = "#fff"; g.stroke();
        g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineWidth = 1.6 * r;
        var c = n / 2, u = r;   // 가운데 · 1단위(22칸 기준)
        g.beginPath();
        if (ic[1] === "house") {   // 지붕 세모 + 몸통 네모
            g.moveTo(c, c - 6 * u); g.lineTo(c + 6 * u, c); g.lineTo(c + 4 * u, c); g.lineTo(c + 4 * u, c + 5 * u); g.lineTo(c - 4 * u, c + 5 * u); g.lineTo(c - 4 * u, c); g.lineTo(c - 6 * u, c); g.closePath(); g.fill();
        } else if (ic[1] === "drop") {   // 물방울
            g.moveTo(c, c - 6 * u); g.bezierCurveTo(c + 5 * u, c, c + 5 * u, c + 5 * u, c, c + 5 * u); g.bezierCurveTo(c - 5 * u, c + 5 * u, c - 5 * u, c, c, c - 6 * u); g.fill();
        } else if (ic[1] === "eye") {   // 눈(전망)
            g.ellipse(c, c, 6.5 * u, 3.8 * u, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(c, c, 2 * u, 0, Math.PI * 2); g.fill();
        } else {
            g.font = "bold " + (13 * r) + "px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ic[1], c, c + u);
        }
        map.addImage(id, g.getImageData(0, 0, n, n), { pixelRatio: r });
    }

    /** 봉우리 하나를 가리키는 열쇠(이름|높이) - 지도 타일 안 봉우리와 peaksNear 가 같은 열쇠를 씀. */
    var PEAK_KEY_EXPR = ["concat", ["to-string", ["get", "name"]], "|", ["to-string", ["get", "ele"]]];
    function peakFeatureKey(props) { return String(props && props.name != null ? props.name : "") + "|" + String(props && props.ele != null ? props.ele : ""); }

    /** 순수 함수 - 우리 지도 봉우리 층의 거름: on 이면 keys 에 든 봉우리만, 아니면 keys 밖 봉우리만(같은 봉우리를 두 번 그리지 않게). */
    function peakOnFilter(keys, on, drop) {
        var has = ["in", PEAK_KEY_EXPR, ["literal", (keys || []).slice()]];
        if (!drop || !drop.length) return on ? has : ["!", has];
        // drop - 100대 명산 정상과 겹치는 OSM 봉우리(우리 rf-peak 가 공식 높이로 대신 보임): 어느 층에도 안 그림
        return on ? ["all", has, ["!", ["in", PEAK_KEY_EXPR, ["literal", drop.slice()]]]] : ["!", ["in", PEAK_KEY_EXPR, ["literal", (keys || []).concat(drop)]]];
    }

    /**
     * 순수 함수 - 기록이 지나간 봉우리(2026-11-22 홍TV님 "지나간 큰 봉우리는 글을 조금 크게"): 지도 타일의 봉우리 [{name, ele, lon, lat}] 가운데
     * 기록 선(lat[] · lon[])에서 maxM 안에 든 것의 열쇠(peakFeatureKey) 목록, 이름이 없으면 뺌. 선 점은 10m 남짓 간격이라 점까지 거리로 봄.
     */
    function peaksNear(peaks, lat, lon, maxM) {
        var out = [], seen = {}, n = Math.min(lat.length, lon.length), dLat = maxM / 111000;
        (peaks || []).forEach(function (p) {
            if (!p || p.name == null || p.name === "" || typeof p.lat !== "number" || typeof p.lon !== "number") return;
            var key = peakFeatureKey(p), dLon = dLat / Math.max(0.1, Math.cos(p.lat * Math.PI / 180));
            if (seen[key]) return;
            for (var i = 0; i < n; i++) {
                if (Math.abs(lat[i] - p.lat) > dLat || Math.abs(lon[i] - p.lon) > dLon) continue;
                if (distM(p.lat, p.lon, lat[i], lon[i]) <= maxM) { seen[key] = true; out.push(key); return; }
            }
        });
        return out;
    }

    /** 등고선 간격(확대 → [가는 선 m, 굵은 선 m]) - 따라가기 · 기록 보기가 함께 씀(2026-11-22). */
    var CONTOUR_STEPS = { 11: [100, 500], 12: [50, 250], 13: [20, 100] };
    /** 순수 함수 - 바탕에 맞는 등고선 색 · 진하기(위성 · 어두운 바탕은 흰 선, 밝은 지도 · 지형만은 갈색 선). */
    function contourPaint(light) {
        return light ? { color: "#8a5a2b", opacity: 0.6 } : { color: "#ffffff", opacity: 0.4 };
    }

    global.RFMap = {
        VERSION: VERSION, open: vectorBasemap, style: vectorStyle, ICONS: MAP_ICONS, iconImage: mapIconImage, poiShowFilter: poiShowFilter,
        peakOnFilter: peakOnFilter, PEAK_KEY_EXPR: PEAK_KEY_EXPR, peakKey: peakFeatureKey, peaksNear: peaksNear,
        mvtPoints: mvtPoints, tilesAlong: tilesAlong, tileLonLat: tileLonLat, tilePeaks: trackTilePeaks, CONTOUR_STEPS: CONTOUR_STEPS, contourPaint: contourPaint
    };
})(typeof window !== "undefined" ? window : this);
