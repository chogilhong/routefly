/*
 * 탐방 안내도 빈 구간 메우기(2026-10-30 홍TV님 "숨은벽에서 백운대까지의 코스가 없어") - 공단 · 산림청 · 다른 코스 자료에 없는 길을
 * OpenStreetMap 길(way)에서 찾아 src/main/webapp/data/park-gaps.json 에 넣음. 서버(ParkServlet)가 그 공원의 others 에 더하고, 화면(gapFill)이 메움.
 *
 * 사용: node tools/park-gaps/fetch.js <공원> "<처음 이름>" <위도,경도> "<끝 이름>" <위도,경도>
 *   예) node tools/park-gaps/fetch.js 북한산 "숨은벽" 37.661826,126.977586 "백운대" 37.658722,126.978088
 *   --dry : 파일에 쓰지 않고 찾은 길만 보여 줌
 * - Overpass(overpass-api.de)에 두 점 둘레(300m 더)의 걷는 길(path · footway · steps · track)을 묻고, 길 이음(노드)을 따라 가장 짧은 길을 찾음.
 * - 지나는 길에 access=no · private 이 있으면 쓰지 않음(출입금지 길을 그리지 않으려고). sac_scale(난이도) 은 함께 적어 둠.
 * - 자료는 © OpenStreetMap contributors(ODbL) - 화면 지도 출처에 이미 있음.
 */
"use strict";
var fs = require("fs"), path = require("path");
var FILE = path.join(__dirname, "../../src/main/webapp/data/park-gaps.json");

function distM(a, b) {
    var r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * 순수 함수 - Overpass 답(elements: way{id, nodes[], tags} · node{id, lat, lon}) 에서 from → to 가장 짧은 길.
 * → {coords:[[lon, lat]…], distance_m, ways:[id…], tags:[{id, highway, sac_scale, access}…], snap:[처음 m, 끝 m]} 또는 {error}.
 */
function route(elements, from, to) {
    var nodes = {}, adj = {}, wayOf = {};
    elements.forEach(function (e) { if (e.type === "node") nodes[e.id] = [e.lat, e.lon]; });
    // 출입금지 길(access · foot = no · private)은 처음부터 빼고 찾음 - 열린 다른 길이 있으면 그것으로
    var ways = elements.filter(function (e) { return e.type === "way" && e.nodes && e.nodes.length > 1 && !closedWays([{ access: e.tags && (e.tags.access || e.tags.foot) }]).length; });
    ways.forEach(function (w) {
        for (var i = 1; i < w.nodes.length; i++) {
            var a = w.nodes[i - 1], b = w.nodes[i];
            if (!nodes[a] || !nodes[b]) continue;
            var m = distM(nodes[a], nodes[b]);
            (adj[a] = adj[a] || []).push([b, m, w.id]);
            (adj[b] = adj[b] || []).push([a, m, w.id]);
        }
    });
    var ids = Object.keys(adj);
    if (!ids.length) return { error: "둘레에 걷는 길이 없음" };
    var near = function (p) { var best = null, bd = Infinity; ids.forEach(function (id) { var x = distM(p, nodes[id]); if (x < bd) { bd = x; best = id; } }); return [best, bd]; };
    var s = near(from), t = near(to);
    if (s[1] > 150 || t[1] > 150) return { error: "처음 · 끝에서 150m 안에 길이 없음(" + Math.round(s[1]) + "m · " + Math.round(t[1]) + "m)" };
    var dist = {}, prev = {}, done = {};
    dist[s[0]] = 0;
    for (;;) {   // 작은 그래프라 단순 다익스트라
        var u = null;
        Object.keys(dist).forEach(function (k) { if (!done[k] && (u === null || dist[k] < dist[u])) u = k; });
        if (u === null) break;
        if (u === t[0]) break;
        done[u] = true;
        adj[u].forEach(function (e) {
            var v = String(e[0]), nd = dist[u] + e[1];
            if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = [u, e[2]]; }
        });
    }
    if (dist[t[0]] === undefined) return { error: "처음과 끝을 잇는 길이 없음" };
    var seq = [t[0]], used = [];
    while (seq[0] !== s[0]) { var pv = prev[seq[0]]; if (used.indexOf(pv[1]) < 0) used.unshift(pv[1]); seq.unshift(pv[0]); }
    var tags = used.map(function (id) { var w = ways.filter(function (x) { return x.id === id; })[0], g = w.tags || {}; return { id: id, highway: g.highway || null, sac_scale: g.sac_scale || null, access: g.access || g.foot || null, name: g.name || null }; });
    return { coords: seq.map(function (id) { return [+nodes[id][1].toFixed(6), +nodes[id][0].toFixed(6)]; }), distance_m: Math.round(dist[t[0]]), ways: used, tags: tags, snap: [Math.round(s[1]), Math.round(t[1])] };
}

/** 순수 함수 - 지나는 길 가운데 출입금지(access · foot = no · private)인 것. */
function closedWays(tags) {
    return (tags || []).filter(function (t) { return /^(no|private)$/.test(String(t.access || "")); });
}

module.exports = { route: route, closedWays: closedWays, distM: distM, FILE: FILE };

if (require.main === module) {
    var a = process.argv.slice(2).filter(function (x) { return x !== "--dry"; }), dry = process.argv.indexOf("--dry") > 0;
    var ll = function (s) { var m = /^(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)$/.exec(s || ""); return m ? [+m[1], +m[3]] : null; };
    var park = a[0], fromName = a[1], from = ll(a[2]), toName = a[3], to = ll(a[4]);
    if (!park || !fromName || !from || !toName || !to) { console.log("사용: node tools/park-gaps/fetch.js <공원> \"<처음>\" 위도,경도 \"<끝>\" 위도,경도 [--dry]"); process.exit(2); }
    var pad = 0.003, s = Math.min(from[0], to[0]) - pad, n = Math.max(from[0], to[0]) + pad, w = Math.min(from[1], to[1]) - pad * 1.25, e = Math.max(from[1], to[1]) + pad * 1.25;
    var q = "[out:json][timeout:25];way[\"highway\"~\"^(path|footway|steps|track)$\"](" + [s, w, n, e].map(function (v) { return v.toFixed(5); }).join(",") + ");(._;>;);out body;";
    fetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "routefly park-gaps" }, body: "data=" + encodeURIComponent(q) })
        .then(function (r) { if (!r.ok) throw new Error("Overpass " + r.status); return r.json(); })
        .then(function (j) {
            var r = route(j.elements || [], from, to);
            if (r.error) { console.log("못 찾음: " + r.error); process.exit(1); }
            console.log("찾음 " + r.distance_m + "m · 길 " + r.ways.length + "개 · 처음/끝에서 " + r.snap.join("m / ") + "m");
            r.tags.forEach(function (t) { console.log("  way " + t.id + " " + t.highway + (t.sac_scale ? " sac=" + t.sac_scale : "") + (t.access ? " access=" + t.access : "") + (t.name ? " " + t.name : "")); });
            var closed = closedWays(r.tags);
            if (closed.length) { console.log("출입금지 길(access=no · private)이 있어 쓰지 않음: " + closed.map(function (t) { return t.id; }).join(", ")); process.exit(1); }
            if (dry) return;
            var doc = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : { parks: {} };
            var list = doc.parks[park] = (doc.parks[park] || []).filter(function (x) { return x.name !== park + " · " + fromName + " → " + toName; });
            list.push({ id: "osmgap-" + r.ways[0] + "-" + r.ways[r.ways.length - 1], name: park + " · " + fromName + " → " + toName, distance_m: r.distance_m, coords: r.coords,
                src: "© OpenStreetMap contributors", ways: r.ways, sac: r.tags.map(function (t) { return t.sac_scale; }).filter(Boolean), fetched: new Date().toISOString().slice(0, 10) });
            fs.writeFileSync(FILE, JSON.stringify(doc, null, 1) + "\n");
            console.log("넣음: " + FILE);
        })
        .catch(function (err) { console.log("실패: " + err.message); process.exit(1); });
}
