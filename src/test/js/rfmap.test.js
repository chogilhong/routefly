/*
 * rfmap 테스트 - node map/rfmap/test/rfmap.test.js [rfmap.js 경로] [조각 파일 경로]
 * 앱(routefly)의 자세한 테스트는 그쪽 course-kit.test.js(복사본 vendor/rfmap-<판>/rfmap.js 로)에도 있습니다. 여기는 패키지가 혼자 서는지만.
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");
var src = process.argv[2] || path.join(__dirname, "../rfmap.js"), tile = process.argv[3] || path.join(__dirname, "omt-z12-3493-1583.pbf");
var sb = { window: {}, console: console, URL: URL, TextDecoder: TextDecoder };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(src, "utf8"), sb);
var M = sb.window.RFMap, fails = 0, runs = 0;
function eq(name, got, want) {
    runs++;
    if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log("FAIL " + name + ": " + JSON.stringify(got) + " (기대 " + JSON.stringify(want) + ")"); }
}
var vs = M.style({ basemapUrl: "https://x/k.pmtiles", demUrl: "https://d/{z}/{x}/{y}.png" }, "https://x/f/"), ids = vs.layers.map(function (l) { return l.id; });
eq("판 · 내보내는 것", [M.VERSION, Object.keys(M).sort()], ["1.1.3", ["CONTOUR_STEPS", "ICONS", "PEAK_KEY_EXPR", "VERSION", "contourPaint", "iconImage", "mvtPoints", "open", "peakKey", "peakOnFilter", "peaksNear", "poiShowFilter", "shopList", "style", "tileLonLat", "tilePeaks", "tilesAlong"]]);
eq("지도 모양 - 바탕 · 지형 · 글꼴 · 출처", [vs.sources.omt.url, vs.sources.hillshade.tiles[0], vs.glyphs, vs.sources.omt.attribution], ["pmtiles://https://x/k.pmtiles", "https://d/{z}/{x}/{y}.png", "https://x/f/{fontstack}/{range}.pbf", "© OpenMapTiles © OpenStreetMap contributors"]);
eq("지도 모양 - 자료 폴더는 c.data(없으면 이 패키지 data/)", [vs.sources.gu.data, M.style({ basemapUrl: "a.pmtiles", demUrl: "d", data: "https://y/d/" }, "f/").sources.subway.data], ["data/gu-labels.json", "https://y/d/subway-lines.json"]);
eq("지도 모양 - 영어(c.lang en)면 구 이름도 영어", JSON.stringify(M.style({ basemapUrl: "a.pmtiles", demUrl: "d", lang: "en" }, "f/").layers.filter(function (l) { return l.id === "gu-name"; })[0].layout["text-field"]),
    JSON.stringify(["coalesce", ["get", "name_en"], ["get", "name"]]));
eq("지도 모양 - 더하기 층은 extraUrl 이 있을 때만", [ids.indexOf("rf-complex"), M.style({ basemapUrl: "a.pmtiles", demUrl: "d", extraUrl: "a-extra.pmtiles" }, "f/").sources.rfx.url], [-1, "pmtiles://a-extra.pmtiles"]);
eq("지도 모양 - 늘 보이는 표시가 맨 뒤(글자 자리를 먼저)", ids.slice(-2), ["rf-hut", "rf-peak"]);
var st = vs.layers[ids.indexOf("rf-station")];
eq("역 - 미리 뽑은 자리(data/stations.json)로 확대 10 부터, 지도 파일 역(poi-hike) 바로 앞, 흰 동그라미", [vs.sources.stations.data, st.minzoom, ids.indexOf("rf-station") === ids.indexOf("poi-hike") - 1, st.layout["icon-image"]],
    ["data/stations.json", 10, true, "rf-rail"]);
var vx = M.style({ basemapUrl: "a.pmtiles", demUrl: "d", extraUrl: "a-extra.pmtiles" }, "f/"), xid = vx.layers.map(function (l) { return l.id; }), tl = vx.layers[xid.indexOf("rf-trail-label")];
eq("산림청 등산로(더하기 층 rf_trail) - 선은 길 층 바로 위 12 부터, 글자는 13 부터 \"↑오름 거리 ↓내림\", 더하기 층이 없으면 없음", [xid.indexOf("rf-trail") === xid.indexOf("path") + 1,
    vx.layers[xid.indexOf("rf-trail")]["source-layer"], tl.minzoom, tl.layout["symbol-placement"], JSON.stringify(tl.layout["text-field"][2]).indexOf("PMNTN") < 0, ids.indexOf("rf-trail")],
    [true, "rf_trail", 13, "line", true, -1]);
var sh = vx.layers[xid.indexOf("rf-shop")], shIcon = sh.layout["icon-image"], vcity = vx.layers[xid.indexOf("poi-city")];
eq("가게(상가정보 rf_shop) - 확대 16, OSM 생활 시설 바로 위, 아이콘은 모두 그림이 있음, OSM 의 식당 · 카페 · 가게 · 병원 · 학교 · 숙소는 뺌", [sh.minzoom, xid.indexOf("rf-shop") === xid.indexOf("poi-city") + 1,
    shIcon.filter(function (v, k) { return typeof v === "string" && k > 2 && k % 2 === 1 && v; }).every(function (id) { return !!M.ICONS[id]; }), JSON.stringify(vcity.filter[vcity.filter.length - 1][1][2][1])],
    [16, true, true, JSON.stringify(["rf-food", "rf-cafe", "rf-shop", "rf-med", "rf-school", "rf-bed"])]);
var vo = M.style({ basemapUrl: "a.pmtiles", demUrl: "d", extraUrl: "a-extra.pmtiles", extraLayers: ["rf_label"] }, "f/"), oid = vo.layers.map(function (l) { return l.id; });
eq("더하기 층 - 파일에 든 층만(가게 · 산길 없는 옛 파일이면 OSM 가게 그대로)", [oid.indexOf("rf-shop"), oid.indexOf("rf-trail"), oid.indexOf("rf-complex") > 0, JSON.stringify(vo.layers[oid.indexOf("poi-city")].filter) === JSON.stringify(vs.layers[ids.indexOf("poi-city")].filter)],
    [-1, -1, true, true]);
var vm = M.style({ basemapUrl: "a.pmtiles", demUrl: "d", extraUrl: "a-extra.pmtiles", extraLayers: ["rf_label", "rf_shop", "rf_trail", "rf_trail_mid"] }, "f/"), mid = vm.layers[vm.layers.map(function (l) { return l.id; }).indexOf("rf-trail-label")];
eq("산림청 산길 글자 - 등산 표시(poi-hike) 바로 앞, 가운데 점이 있으면 그 점에 가로로, 없으면 곧은 곳(꺾임 25)에만 선을 따라", [xid.indexOf("rf-trail-label") === xid.indexOf("poi-hike") - 1,
    mid["source-layer"], mid.layout["symbol-placement"], tl["source-layer"], tl.layout["text-max-angle"]], [true, "rf_trail_mid", undefined, "rf_trail", 25]);
eq("가게 - 이름 없는 업소(업소명없음)는 업종으로, 같은 점 여러 곳은 \"외 n곳\"", [JSON.stringify(sh.layout["text-field"][1][1]), JSON.stringify(sh.layout["text-field"][3][1]), sh.layout["text-field"][4]["font-scale"], sh.layout["text-max-width"], sh.layout["text-size"]],
    [JSON.stringify(["==", ["get", "name"], "업소명없음"]), JSON.stringify([">", ["coalesce", ["get", "n"], 1], 1]), 0.85, 10, 10]);
eq("산림청 등산로 글자 - 오름 · 내림 시간이 있을 때", JSON.stringify(tl.layout["text-field"][2]), JSON.stringify(["concat", "↑", ["to-string", ["get", "up"]], "분 ", ["to-string", ["get", "km"]], "km ↓", ["to-string", ["get", "down"]], "분"]));
var city = vs.layers[ids.indexOf("poi-city")], bus = vs.layers[ids.indexOf("poi-bus")], cityIcon = city.layout["icon-image"];
eq("생활 시설 - 식당 · 카페 · 가게 · 병원 등 확대 15, 버스 정류장 16, 등산 표시 앞(글자 자리를 내줌), 건물은 14 부터", [city.minzoom, bus.minzoom, ids.indexOf("poi-city") < ids.indexOf("poi-hike"),
    vs.layers[ids.indexOf("building")]["source-layer"], vs.layers[ids.indexOf("building")].minzoom, cityIcon[0], cityIcon[1][1]], [15, 16, true, "building", 14, "match", "class"]);
eq("생활 시설 - 아이콘 이름은 모두 그림이 있음", cityIcon.filter(function (v, k) { return typeof v === "string" && k > 2 && k % 2 === 1 && v; }).every(function (id) { return !!M.ICONS[id]; }), true);
var poi = vs.layers[ids.indexOf("poi-hike")].layout["icon-image"];
eq("아이콘 - poi 층이 쓰는 이름은 모두 그림이 있음", poi.filter(function (v, k) { return typeof v === "string" && k > 0 && k % 2 === 0 && v; }).every(function (id) { return !!M.ICONS[id]; }), true);
eq("봉우리 열쇠 · 거름", [M.peakKey({ name: "사패산", ele: 551 }), M.peakOnFilter(["a|1"], true)[0], M.peakOnFilter(["a|1"], false)[0]], ["사패산|551", "in", "!"]);
eq("봉우리 - 선에서 150m 안만", M.peaksNear([{ name: "가", ele: 1, lat: 35.337, lon: 127.731 }, { name: "나", ele: 2, lat: 35.337, lon: 127.733 }], [35.336, 35.337, 35.338], [127.73, 127.73, 127.73], 150), ["가|1"]);
var u8 = new Uint8Array(fs.readFileSync(tile)), sp = M.mvtPoints(u8, "mountain_peak").filter(function (p) { return p.props.name === "사패산"; })[0], g = M.tileLonLat(12, 3493, 1583, sp.x, sp.y, sp.extent);
eq("조각 읽기 - 운영 지도 파일의 사패산(551m, 127.01045 · 37.72238)", [sp.props.ele, Math.round(g[0] * 1e5) / 1e5, Math.round(g[1] * 1e5) / 1e5], [551, 127.01045, 37.72238]);
eq("선이 지나는 조각", M.tilesAlong([37.72238, 37.7224, 37.6], [127.01044, 127.0105, 127.01], 12, 40), [[3493, 1583], [3493, 1585]]);
eq("등고선", [M.CONTOUR_STEPS[13], M.contourPaint(true).color], [[20, 100], "#8a5a2b"]);
var dir = path.dirname(src), stn = JSON.parse(fs.readFileSync(path.join(dir, "data/stations.json"), "utf8")), gu = JSON.parse(fs.readFileSync(path.join(dir, "data/gu-labels.json"), "utf8")), sub = JSON.parse(fs.readFileSync(path.join(dir, "data/subway-lines.json"), "utf8"));
eq("자료 - 역은 수도권 600곳 남짓, 회룡 · 망월사 · 도봉산 포함, 같은 이름은 400m 안에 하나만", [stn.features.length > 600, ["회룡", "망월사", "도봉산"].every(function (n) { return stn.features.some(function (f) { return f.properties.name === n; }); }),
    stn.features.filter(function (f) { return f.properties.name === "회룡"; }).length <= 2], [true, true, true]);
eq("자료 - 구 이름은 …구만 · 노선은 OSM 색", [gu.features.length > 90, gu.features.every(function (f) { return /구$/.test(f.properties.name); }), sub.features.filter(function (f) { return f.properties.ref === "1"; })[0].properties.colour],
    [true, true, "#004A85"]);
eq("글꼴 - 숫자 · 로마자 · ▲(9472-9727) 조각 + OFL", ["0-255.pbf", "9472-9727.pbf"].map(function (f) { return fs.existsSync(path.join(dir, "fonts/Noto Sans Regular", f)); }).concat(fs.existsSync(path.join(dir, "fonts/OFL.txt"))), [true, true, true]);
console.log((fails ? "FAILED " : "OK ") + (runs - fails) + "/" + runs);
process.exit(fails ? 1 : 0);
