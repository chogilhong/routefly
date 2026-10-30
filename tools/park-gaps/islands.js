/*
 * 탐방 안내도의 "따로 떨어진 조각" 을 큰 묶음과 잇는 빈 구간을 OpenStreetMap 길에서 찾아 data/park-gaps.json 에 넣음
 * (2026-10-30 홍TV님 "코스가 끊어짐 없이 이어져야지" - 코스 점검(tools/course-audit) 의 island 를 메움).
 *
 * 사용: node tools/park-gaps/islands.js [--parks=설악산,지리산] [--max=2600] [--base=https://routefly.kr/routefly] [--dry]
 *   --dry : 파일에 쓰지 않고 찾은 것만 보여 줌
 * 순서(공원마다):
 *   1) /api/park 답 → checkPark(코스 점검과 같은 규칙)로 조각과, 조각 ↔ 큰 묶음의 가장 가까운 두 점(link)
 *   2) 직선 max(m) 안인 것만 Overpass 에 걷는 길(등산로 · 임도 · 마을 안 작은 길)을 묻고, 조각의 어느 점 → 큰 묶음의 어느 점 가장 짧은 길(fetch.js routeSets)
 *   3) 받지 않음: 출입금지 길(access · foot = no · private) · 4km 넘음 · 직선의 3배(+800m) 넘게 돌아감
 *   4) 그 길을 others 에 더해 checkPark 를 다시 - 묶음 수가 줄 때만 넣음(화면 gapFill 이 실제로 이어 주는 것만)
 *   5) 점마다 높이(Terrain Tiles) 붙여 park-gaps.json 에 - 이름 "공원 · 처음 → 끝"(가까운 지명)
 * 자료는 © OpenStreetMap contributors(ODbL) - 화면 지도 출처에 이미 있음. Overpass 는 공용 서버라 요청 사이 3초 쉼.
 */
"use strict";
var fs = require("fs");
var G = require("./fetch.js"), A = require("../course-audit/audit.js");
var NOTES = require("../../src/main/webapp/data/park-notes.json").parks;

var MOUNTAIN_PARKS = ["설악산", "지리산", "속리산", "월악산", "무등산", "경주", "변산반도", "계룡산", "한라산", "월출산", "가야산", "내장산", "덕유산", "오대산", "치악산", "소백산", "주왕산", "북한산"];
var MAX_TOTAL_M = 4000, MAX_ROAD_M = 3000;
/** 걷는 길 - 등산로 · 오솔길 · 계단 · 임도에 마을 안 작은 길(들머리 사이를 잇는 마을길 - 2026-10-30 PC: 등산로만으로는 거의 못 이었음). 큰 차도는 뺌. */
var WALK = "path|footway|steps|track|bridleway|pedestrian|cycleway|residential|unclassified|service|living_street|tertiary";
/** 묻는 범위 - 후보 점들 둘레 이만큼 더(도, 약 800m). */
var PAD = 0.008;
var SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

/** 순수 함수 - 찾은 길을 받을지: 출입금지 없음 · 4km 안 · 직선의 3배(+800m) 안. 받으면 null, 아니면 까닭. */
function rejectReason(r, straightM) {
    if (!r || r.error) return (r && r.error) || "길 없음";
    if (G.closedWays(r.tags).length) return "출입금지 길(access=no · private)";
    if (r.distance_m > MAX_TOTAL_M) return r.distance_m + "m - 4km 넘음";
    if (r.distance_m > straightM * 3 + 800) return r.distance_m + "m - 직선 " + straightM + "m 보다 너무 돌아감";
    // 차도(tertiary · unclassified)를 지나며 3km 넘으면 등산로 잇기가 아니라 차 길 걷기 - 넣지 않음(2026-10-30 지리산 구룡폭포 3762m · 속리산 상판리 3329m)
    if (r.distance_m > MAX_ROAD_M && roadNote(r.tags) === " (차도 포함)") return r.distance_m + "m - 차도를 3km 넘게 걸음";
    return null;
}

/** 순수 함수 - 지나는 길에 차가 다니는 길이 있으면 이름 뒤에 붙일 말(안내도 · 따라가기에서 보이게 - 2026-10-30 월출산 · 가야산 --dry). */
function roadNote(tags) {
    var hw = (tags || []).map(function (t) { return t.highway; });
    if (hw.some(function (h) { return /^(tertiary|unclassified)$/.test(h); })) return " (차도 포함)";
    if (hw.some(function (h) { return /^(residential|service|living_street)$/.test(h); })) return " (마을길 포함)";
    return "";
}

/** 순수 함수 - 가까운 지명 글("백운대 38m") → 이름만. */
function placeName(s) {
    return String(s || "").replace(/\s+\d+m$/, "").trim() || "?";
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function overpass(q) {
    // 공용 서버라 바쁘면 429 · 504 - 서버를 돌아가며, 한 바퀴 실패마다 더 오래 쉬고 세 바퀴까지(2026-10-30 PC: 무등산 3곳 "모두 실패")
    var waits = [0, 30000, 90000];
    for (var round = 0; round < waits.length; round++) {
        if (waits[round]) await sleep(waits[round]);
        for (var k = 0; k < SERVERS.length; k++) {
            try {
                var res = await fetch(SERVERS[k], { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "routefly park-gaps" }, body: "data=" + encodeURIComponent(q) });
                if (res.ok) return await res.json();
            } catch (e) { /* 다음 서버 */ }
            await sleep(5000);
        }
    }
    throw new Error("Overpass 서버 모두 실패(세 바퀴)");
}

module.exports = { rejectReason: rejectReason, placeName: placeName, roadNote: roadNote };

if (require.main === module) {
    var arg = function (k, dflt) { var a = process.argv.filter(function (x) { return x.indexOf("--" + k + "=") === 0; })[0]; return a ? a.slice(k.length + 3) : dflt; };
    var BASE = arg("base", "https://routefly.kr/routefly").replace(/\/$/, ""), MAX = +arg("max", "2600"), dry = process.argv.indexOf("--dry") > 0;
    var parks = arg("parks", "") ? arg("parks", "").split(",") : MOUNTAIN_PARKS;
    (async function () {
        var doc = fs.existsSync(G.FILE) ? JSON.parse(fs.readFileSync(G.FILE, "utf8")) : { parks: {} };
        var added = 0;
        for (var pk of parks) {
            var data = await (await fetch(BASE + "/api/park?name=" + encodeURIComponent(pk), { headers: { "User-Agent": "routefly park-gaps" } })).json();
            if (!data || !data.trails) { console.log("## " + pk + " - 공원 자료 없음"); continue; }
            var r0 = A.checkPark(data, pk, NOTES), groups = r0.groups;
            var isl = r0.issues.filter(function (x) { return x.kind === "island" && x.link && x.link.m <= MAX; });
            console.log("## " + pk + " 묶음 " + groups + " · 직선 " + MAX + "m 안 조각 " + isl.length);
            for (var x of isl) {
                var L = x.link, an = placeName(L.an), bn = placeName(L.bn);
                var all = (L.aPts || [L.a]).concat(L.bPts || [L.b]), la = all.map(function (p) { return p[1]; }), lo = all.map(function (p) { return p[0]; });
                var pad = PAD, s = Math.min.apply(null, la) - pad, n = Math.max.apply(null, la) + pad, w = Math.min.apply(null, lo) - pad * 1.25, e = Math.max.apply(null, lo) + pad * 1.25;
                var q = "[out:json][timeout:60];way[\"highway\"~\"^(" + WALK + ")$\"](" + [s, w, n, e].map(function (v) { return v.toFixed(5); }).join(",") + ");(._;>;);out body;";
                var r;
                try {
                    r = G.routeSets((await overpass(q)).elements || [], (L.aPts || [L.a]).map(function (p) { return [p[1], p[0]]; }), (L.bPts || [L.b]).map(function (p) { return [p[1], p[0]]; }), 150);
                } catch (err) { console.log("  ✗ " + an + " → " + bn + " - " + err.message); continue; }
                await sleep(3000);
                if (r && !r.error) {   // 두 끝을 탐방로 점에 붙임(길 노드는 탐방로에서 150m 안 - 안내도가 끝끼리 잇게)
                    var closest = function (p, pts) { var best = null, bd = Infinity; pts.forEach(function (q2) { var dd = G.distM([p[1], p[0]], [q2[1], q2[0]]); if (dd < bd) { bd = dd; best = q2; } }); return bd > 1 ? [best[0], best[1]] : null; };
                    var ca = closest(r.coords[0], L.aPts || [L.a]), cb = closest(r.coords[r.coords.length - 1], L.bPts || [L.b]);
                    if (ca) r.coords.unshift(ca);
                    if (cb) r.coords.push(cb);
                }
                if (r && !r.error) {   // 실제로 이은 두 끝의 가까운 지명
                    var near = function (p) { var best = null, bd = Infinity; (data.places || []).concat(data.heads || []).forEach(function (q2) { var dd = G.distM([p[1], p[0]], [+q2.lat, +q2.lon]); if (dd < bd) { bd = dd; best = q2.name; } }); return best || "?"; };
                    an = near(r.coords[0]);
                    bn = near(r.coords[r.coords.length - 1]);
                }
                var why = rejectReason(r, L.m);
                if (why) { console.log("  ✗ " + an + " → " + bn + " (직선 " + L.m + "m) - " + why); continue; }
                var name = pk + " · " + (an === bn ? an + " 둘레" : an + " → " + bn) + roadNote(r.tags);
                var gap = { id: "osmgap-" + r.ways[0] + "-" + r.ways[r.ways.length - 1], name: name, distance_m: r.distance_m, ascent_m: null, coords: r.coords };
                data.others = (data.others || []).concat([gap]);
                var r1 = A.checkPark(data, pk, NOTES);
                if (r1.groups >= groups) { data.others.pop(); console.log("  ✗ " + name + " " + r.distance_m + "m - 이어도 묶음이 그대로(" + groups + ")"); continue; }
                groups = r1.groups;
                console.log("  ✓ " + name + " " + r.distance_m + "m (직선 " + L.m + "m) · 묶음 → " + groups + " · " + r.tags.map(function (t) { return t.highway + (t.sac_scale ? "/" + t.sac_scale : ""); }).join(","));
                if (dry) continue;
                var coords = await G.withEle(r.coords);
                var list = doc.parks[pk] = (doc.parks[pk] || []).filter(function (g) { return g.id !== gap.id && g.name !== name; });
                list.push({ id: gap.id, name: name, distance_m: r.distance_m, coords: coords, src: "© OpenStreetMap contributors", ele: "Terrain Tiles(AWS Open Data) terrarium 15",
                    ways: r.ways, sac: r.tags.map(function (t) { return t.sac_scale; }).filter(Boolean), fetched: new Date().toISOString().slice(0, 10), by: "tools/park-gaps/islands.js" });
                added++;
            }
        }
        if (!dry && added) fs.writeFileSync(G.FILE, JSON.stringify(doc, null, 1) + "\n");
        console.log(dry ? "끝(--dry, 쓰지 않음)" : "끝 - 넣은 빈 구간 " + added + "개" + (added ? " → " + G.FILE : ""));
    })().catch(function (err) { console.log("실패: " + err.message); process.exit(1); });
}
