/*
 * 코스 정확도 점검(2026-10-30 홍TV님 "가장 기본이 코스 정확도 - 코스가 끊어짐 없이 이어져야지. 전체적으로 점검").
 * 운영(또는 로컬) API 로 코스를 하나씩 받아 문제를 찾아 보고서(report.json · report.md)로 씀. 화면과 같은 판단을 하려고 course-kit.js 함수를 그대로 씀.
 *
 * 사용: node tools/course-audit/audit.js [--base=https://routefly.kr/routefly] [--scope=parks|m100|all] [--only=북한산,설악산] [--out=폴더] [--rps=4]
 *   parks - 국립공원 탐방 안내도(/api/park): 막다른 끝 · 따로 떨어진 조각 · 이름과 거꾸로 그린 선
 *   m100  - 100대 명산 정상 2km 안 코스(/api/courses → /api/course): 끊김 · 튀는 점 · 높이 · 이름과 끝 · 정상 이름인데 정상에 안 감
 * 서버 요청 제한(초당 20번)보다 훨씬 천천히(기본 초당 4번) 묻고, 같은 코스는 한 번만.
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");
var ROOT = path.join(__dirname, "../..");
var WEB = path.join(ROOT, "src/main/webapp");

function kit() {
    var sb = { window: {}, console: console };
    vm.createContext(sb);
    vm.runInContext(fs.readFileSync(path.join(WEB, "js/course-kit.js"), "utf8"), sb);
    return sb.window.RF;
}
var RF = kit();

// ── 기준 ──
var GAP_M = 250;            // 점 사이가 이만큼 넘게 뛰면 끊김(보통 11 ~ 17m, 곧은 길을 줄인 곳도 100m 남짓)
var SPIKE_LEG_M = 80, SPIKE_DEG = 160, SPIKE_POI_M = 60;   // 짧게 갔다 바로 되돌아오는 점(GPS 튐) - 이름표 둘레는 뺌(정상 왕복)
var ELE_JUMP_M = 40, ELE_SLOPE = 1.2;   // 높이가 짧은 거리에서 급히 뜀(경사 50° 넘음)
var END_NAME_M = 300;       // 끝 이름은 끝 300m 안의 이름표
var SUMMIT_PASS_M = 200;    // 정상 이름 코스가 정상 200m 안을 지나야
var LINK_M = 60;            // 안내도 구간끼리 이 안이면 이어진 것
var HEAD_M = 400;           // 막다른 끝이 들머리 · 정상 · 지명 이 안이면 괜찮음

function d(a, b) { return RF.distM(a[1], a[0], b[1], b[0]); }
function bearing(a, b) { return Math.atan2((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI; }
function turn(a, b, c) { var x = Math.abs(bearing(a, b) - bearing(b, c)) % 360; return x > 180 ? 360 - x : x; }
function norm(s) { return String(s || "").replace(/\s+/g, "").replace(/\(.*?\)/g, ""); }

/**
 * 순수 함수 - 코스 하나(/api/course 답)의 문제 [{kind, msg, at(누적 m)}]. ctx: {name(화면 이름), peaks:[{id, summit, lat, lon, elev}]}.
 * kind: gap(끊김) · spike(튀는 점) · ele(높이) · end(끝 이름) · start(처음 이름) · flip(거꾸로) · summit(정상 이름인데 안 감) · dist(거리 다름)
 */
function checkCourse(j, ctx) {
    ctx = ctx || {};
    var out = [], P = (j && j.points) || [], c = (j && j.course) || {}, pois = (j && j.pois) || [];
    if (P.length < 2) return [{ kind: "gap", msg: "점이 둘 미만", at: 0 }];
    var xy = P.map(function (p) { return [+p[0], +p[1]]; }), total = +P[P.length - 1][3] || 0;
    for (var i = 1; i < P.length; i++) {
        var g = d(xy[i - 1], xy[i]);
        if (g > GAP_M) out.push({ kind: "gap", msg: "점 사이 " + Math.round(g) + "m 뜀", at: +P[i - 1][3] });
    }
    var named = pois.filter(function (q) { return !(+q.off_route_m > 100); });
    for (var k = 1; k < P.length - 1; k++) {
        var l1 = d(xy[k - 1], xy[k]), l2 = d(xy[k], xy[k + 1]);
        if (l1 > 15 && l2 > 15 && l1 < SPIKE_LEG_M && l2 < SPIKE_LEG_M && turn(xy[k - 1], xy[k], xy[k + 1]) > SPIKE_DEG
            && !named.some(function (q) { return Math.abs(+q.dist_m - +P[k][3]) < SPIKE_POI_M; }))
            out.push({ kind: "spike", msg: "튀는 점(" + Math.round(l1) + "m 갔다 " + Math.round(l2) + "m 되돌아옴)", at: +P[k][3] });
    }
    var nul = P.filter(function (p) { return p[2] == null; }).length;
    if (nul) out.push({ kind: "ele", msg: "높이 없는 점 " + nul + "/" + P.length, at: 0 });
    for (var m = 1; m < P.length; m++) {
        if (P[m][2] == null || P[m - 1][2] == null) continue;
        var de = Math.abs(P[m][2] - P[m - 1][2]), dd = d(xy[m - 1], xy[m]);
        if (de > ELE_JUMP_M && de > dd * ELE_SLOPE) out.push({ kind: "ele", msg: "높이 " + Math.round(de) + "m 를 " + Math.round(dd) + "m 사이에", at: +P[m][3] });
    }
    if (c.distance_m != null && total > 0 && Math.abs(+c.distance_m - total) > Math.max(50, total * 0.05)) out.push({ kind: "dist", msg: "거리 " + c.distance_m + " ↔ 선 " + Math.round(total), at: 0 });
    // 이름의 처음 · 끝 - 그 이름표가 코스에 있는데 끝(처음)에서 멀면 문제, 반대쪽 끝에 있으면 거꾸로
    var name = ctx.name || c.name || "", e = RF.routeEnds(name);
    var poiAt = function (nm) {
        var k2 = norm(RF.placeName ? RF.placeName(nm) : nm);
        return named.filter(function (q) { var qn = norm(RF.placeName ? RF.placeName(q.name) : q.name); return k2 && qn && (qn === k2 || qn.indexOf(k2) === 0 || k2.indexOf(qn) === 0); });
    };
    var near = function (list, at) { return list.some(function (q) { return Math.abs(+q.dist_m - at) <= END_NAME_M; }); };
    if (e.from && e.to && e.from !== e.to) {
        var f = poiAt(e.from), t = poiAt(e.to);
        if (f.length && t.length && !near(f, 0) && !near(t, total) && near(f, total) && near(t, 0)) out.push({ kind: "flip", msg: "이름과 거꾸로 그린 선(" + e.from + " 이 끝, " + e.to + " 가 처음)", at: 0 });
        else {
            if (t.length && !near(t, total)) out.push({ kind: "end", msg: "끝 이름 \"" + e.to + "\" 이 끝이 아니라 " + Math.round(+t[0].dist_m) + "m 지점에", at: total });
            if (f.length && !near(f, 0)) out.push({ kind: "start", msg: "처음 이름 \"" + e.from + "\" 이 처음이 아니라 " + Math.round(+f[0].dist_m) + "m 지점에", at: 0 });
        }
    }
    // 정상 이름(100대 명산 정상)인데 정상 200m 안을 안 지남
    (ctx.peaks || []).forEach(function (pk) {
        var base = String(pk.id).replace(/\(.*\)$/, ""), sm = norm(pk.summit), core = sm.indexOf(base) === 0 && sm.length - base.length >= 2 ? sm.slice(base.length) : sm;
        if (!core) return;
        var spots = RF.nameParts(name).route.split(" → ").map(norm);
        if (!spots.some(function (w) { return w === core || w === base + core || w === norm(pk.summit); })) return;
        if (d(xy[0], [pk.lon, pk.lat]) > 15000) return;   // 같은 이름 먼 산
        var best = Infinity;
        xy.forEach(function (p) { best = Math.min(best, d(p, [pk.lon, pk.lat])); });
        if (best > SUMMIT_PASS_M) out.push({ kind: "summit", msg: "이름에 정상(" + core + ")이 있는데 정상에서 가장 가까운 곳이 " + Math.round(best) + "m", at: 0 });
    });
    return out;
}

/**
 * 순수 함수 - 탐방 안내도(/api/park 답 + park-notes) 를 화면처럼 구간으로 나누고 메운 뒤 연결 문제. → {segs, issues:[{kind, msg, at:[경도, 위도]}]}
 * kind: dead(막다른 끝 - 들머리 · 정상 · 지명이 둘레에 없음) · island(따로 떨어진 조각)
 */
function checkPark(data, park, notes) {
    var note = (notes && notes[park]) || {}, noteTrails = note.trails ? { p: { trails: note.trails } } : null;
    data = JSON.parse(JSON.stringify(data));
    data.trails = data.trails.filter(function (t) { return !/자연관찰로/.test(t.name) && !RF.isClosedTrail(t.name) && !RF.isHiddenCourse(notes, t.id); }).map(function (t) {
        var x = Object.assign({}, t);
        if (noteTrails) x.name = RF.noteTrailName({ p: { trails: note.trails } }, t.id, t.name);
        return x;
    });
    data.trails = RF.headAlias(data.trails, data.heads);
    data.trails = RF.viaTrim(data.trails, data.places);
    var lines = {};
    data.trails.forEach(function (t) { lines[t.id] = t.coords; });
    var flips = RF.routeFlips(data.trails.map(function (t) { return { course_id: t.id, name: t.name }; }), lines);
    var extras = RF.gapFill(data.trails, data.others, data.places, data.heads, park);
    var segs = RF.splitTrails(RF.mergeBare(data.trails, data.places).concat(extras), flips, null, null);
    var hs = RF.trailHeads(segs, data.heads, flips, data.others, data.places, null);
    var anchors = (data.heads || []).concat(hs).concat((data.places || []).filter(function (p) { return p.summit || RF.isTopName(p.name) || /(대피소|사|암|폭포|전망대|약수|샘)$/.test(p.name); }));
    var issues = [];
    // 끝마다 다른 구간(점 어디든) 60m 안인가
    var grid = {}, cell = function (p) { return Math.round(p[0] * 500) + "," + Math.round(p[1] * 500); };
    segs.forEach(function (s, si) { s.coords.forEach(function (p) { (grid[cell(p)] = grid[cell(p)] || []).push([si, p]); }); });
    var touches = function (p, si) {
        var cx = Math.round(p[0] * 500), cy = Math.round(p[1] * 500);
        for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
            var g = grid[(cx + dx) + "," + (cy + dy)] || [];
            for (var i = 0; i < g.length; i++) if (g[i][0] !== si && d(p, g[i][1]) < LINK_M) return g[i][0];
        }
        return -1;
    };
    var nearestName = function (p) {
        var best = null, bd = Infinity;
        (data.places || []).concat(data.heads || [], hs).forEach(function (q) { var x = d(p, [+q.lon, +q.lat]); if (x < bd) { bd = x; best = q.name; } });
        return best ? best + " " + Math.round(bd) + "m" : "?";
    };
    // 이어진 묶음(union-find)
    var parent = segs.map(function (s, i) { return i; }), find = function (i) { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    segs.forEach(function (s, si) {
        [s.coords[0], s.coords[s.coords.length - 1]].forEach(function (p, k) {
            var o = touches(p, si);
            if (o >= 0) { parent[find(si)] = find(o); return; }
            var ok = anchors.some(function (q) { return d(p, [+q.lon, +q.lat]) <= HEAD_M; });
            if (!ok) issues.push({ kind: "dead", msg: "막다른 끝 - " + s.name + " 의 " + (k ? "끝" : "처음") + "(가까운 이름 " + nearestName(p) + ")", at: p, seg: s.id });
        });
    });
    var groups = {};
    segs.forEach(function (s, si) { var r = find(si); (groups[r] = groups[r] || { n: 0, m: 0, names: [] }).n++; groups[r].m += +s.distance_m || 0; if (groups[r].names.length < 3) groups[r].names.push(s.name); });
    var gl = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.m - a.m; });
    gl.slice(1).forEach(function (g) {
        if (g.m < 30000) issues.push({ kind: "island", msg: "따로 떨어진 조각 " + g.n + "구간 " + (g.m / 1000).toFixed(1) + "km - " + g.names.join(" / "), at: null });
    });
    return { segs: segs, groups: gl.length, issues: issues };
}

module.exports = { checkCourse: checkCourse, checkPark: checkPark, RF: RF, GAP_M: GAP_M };

// ── 실행 ──
if (require.main === module) {
    var arg = function (k, dflt) { var a = process.argv.filter(function (x) { return x.indexOf("--" + k + "=") === 0; })[0]; return a ? a.slice(k.length + 3) : dflt; };
    var BASE = arg("base", "https://routefly.kr/routefly").replace(/\/$/, ""), SCOPE = arg("scope", "all"), ONLY = arg("only", ""), OUT = arg("out", path.join(ROOT, "target/course-audit")), RPS = +arg("rps", "4");
    var only = ONLY ? ONLY.split(",") : null;
    fs.mkdirSync(OUT, { recursive: true });
    var last = 0, calls = 0;
    var get = function (u) {
        var wait = Math.max(0, last + 1000 / RPS - Date.now());
        last = Date.now() + wait;
        return new Promise(function (r) { setTimeout(r, wait); }).then(function () {
            calls++;
            var tryOnce = function (n) {
                return fetch(BASE + u, { headers: { "Accept": "application/json", "User-Agent": "routefly-course-audit" } }).then(function (r) {
                    if (r.status === 429 && n < 3) return new Promise(function (ok) { setTimeout(ok, 5000); }).then(function () { return tryOnce(n + 1); });
                    return r.json();
                }).catch(function (e) { if (n < 3) return new Promise(function (ok) { setTimeout(ok, 3000); }).then(function () { return tryOnce(n + 1); }); throw e; });
            };
            return tryOnce(0);
        });
    };
    var notes = JSON.parse(fs.readFileSync(path.join(WEB, "data/park-notes.json"), "utf8")).parks;
    var m100 = JSON.parse(fs.readFileSync(path.join(WEB, "data/mountains100.json"), "utf8")).peaks;
    var elev = JSON.parse(fs.readFileSync(path.join(WEB, "data/peak-elev.json"), "utf8")).elev || {};
    m100.forEach(function (p) { p.elev = elev[p.id]; });
    var PARKS = ["지리산", "경주", "계룡산", "한려해상", "설악산", "속리산", "한라산", "내장산", "가야산", "덕유산", "오대산", "주왕산", "태안해안", "다도해해상", "북한산", "치악산", "월악산", "소백산", "변산반도", "월출산", "무등산", "태백산", "팔공산"];
    var report = { base: BASE, at: new Date().toISOString(), parks: {}, courses: {}, counts: {} };
    var count = function (k) { report.counts[k] = (report.counts[k] || 0) + 1; };
    var doParks = function () {
        if (SCOPE === "m100") return Promise.resolve();
        var list = PARKS.filter(function (p) { return !only || only.indexOf(p) >= 0; });
        return list.reduce(function (pr, pk) {
            return pr.then(function () {
                return get("/api/park?name=" + encodeURIComponent(pk)).then(function (j) {
                    if (!j || !j.success || !j.trails) { report.parks[pk] = { error: (j && j.message) || "못 받음" }; return; }
                    var r = checkPark(j, pk, notes);
                    report.parks[pk] = { trails: j.trails.length, segs: r.segs.length, groups: r.groups, issues: r.issues.map(function (x) { return { kind: x.kind, msg: x.msg, at: x.at && x.at.map(function (v) { return +v.toFixed(5); }) }; }) };
                    r.issues.forEach(function (x) { count("park-" + x.kind); });
                    console.log("[공원] " + pk + " 구간 " + r.segs.length + " · 묶음 " + r.groups + " · 문제 " + r.issues.length);
                }).catch(function (e) { report.parks[pk] = { error: String(e.message || e) }; });
            });
        }, Promise.resolve());
    };
    var doM100 = function () {
        if (SCOPE === "parks") return Promise.resolve();
        var peaks = m100.filter(function (p) { return !only || only.indexOf(p.id) >= 0; }), ids = {};
        return peaks.reduce(function (pr, pk) {
            return pr.then(function () {
                var r = 0.03, rl = r / Math.cos(pk.lat * Math.PI / 180);
                return get("/api/courses?kind=hike&bbox=" + [pk.lon - rl, pk.lat - r, pk.lon + rl, pk.lat + r].map(function (v) { return v.toFixed(4); }).join(",")).then(function (j) {
                    (j.courses || []).forEach(function (c) {
                        var near = [[c.start_lon, c.start_lat], [c.end_lon, c.end_lat]].some(function (p) { return p[0] != null && d(p, [pk.lon, pk.lat]) < 2000; });
                        if (near && !ids[c.course_id]) ids[c.course_id] = pk.id;
                    });
                });
            });
        }, Promise.resolve()).then(function () {
            var all = Object.keys(ids);
            console.log("[명산] 코스 " + all.length + "개 받기 시작");
            return all.reduce(function (pr, id, n) {
                return pr.then(function () {
                    return get("/api/course?id=" + encodeURIComponent(id)).then(function (j) {
                        if (!j || !j.course) { report.courses[id] = { peak: ids[id], error: "못 받음" }; count("course-error"); return; }
                        var name = RF.noteTrailName(notes, id, j.course.name);
                        var iss = checkCourse(j, { name: name, peaks: m100.filter(function (p) { return p.id === ids[id]; }) });
                        report.courses[id] = { peak: ids[id], name: name, km: +(j.course.distance_m / 1000).toFixed(2), issues: iss };
                        iss.forEach(function (x) { count("course-" + x.kind); });
                        if (n % 100 === 0) console.log("  " + n + "/" + all.length + " · 요청 " + calls);
                    }).catch(function (e) { report.courses[id] = { peak: ids[id], error: String(e.message || e) }; count("course-error"); });
                });
            }, Promise.resolve());
        });
    };
    doParks().then(doM100).then(function () {
        fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
        fs.writeFileSync(path.join(OUT, "report.md"), toMd(report));
        console.log("끝 · 요청 " + calls + " · " + JSON.stringify(report.counts) + " → " + OUT);
    });
}

/** 보고서(마크다운) - 공원마다 · 산마다 문제. */
function toMd(r) {
    var L = ["# 코스 정확도 점검 " + r.at.slice(0, 16).replace("T", " "), "", "기준: " + r.base, "", "## 합계", ""];
    Object.keys(r.counts).sort().forEach(function (k) { L.push("- " + k + ": " + r.counts[k]); });
    L.push("", "## 국립공원 탐방 안내도", "");
    Object.keys(r.parks).forEach(function (pk) {
        var p = r.parks[pk];
        if (p.error) { L.push("### " + pk + " - " + p.error, ""); return; }
        L.push("### " + pk + " (탐방로 " + p.trails + " · 구간 " + p.segs + " · 이어진 묶음 " + p.groups + ")", "");
        p.issues.forEach(function (x) { L.push("- [" + x.kind + "] " + x.msg + (x.at ? " @" + x.at[1] + "," + x.at[0] : "")); });
        if (!p.issues.length) L.push("- 문제 없음");
        L.push("");
    });
    L.push("## 100대 명산 코스", "");
    var byPeak = {};
    Object.keys(r.courses).forEach(function (id) { var c = r.courses[id]; (byPeak[c.peak] = byPeak[c.peak] || []).push([id, c]); });
    Object.keys(byPeak).sort().forEach(function (pk) {
        var bad = byPeak[pk].filter(function (x) { return x[1].error || (x[1].issues || []).length; });
        L.push("### " + pk + " - 코스 " + byPeak[pk].length + " · 문제 있는 코스 " + bad.length, "");
        bad.forEach(function (x) {
            L.push("- " + x[0] + " " + (x[1].name || "") + (x[1].km ? " (" + x[1].km + "km)" : ""));
            if (x[1].error) L.push("  - [error] " + x[1].error);
            (x[1].issues || []).slice(0, 6).forEach(function (i) { L.push("  - [" + i.kind + "] " + i.msg + (i.at ? " @" + Math.round(i.at) + "m" : "")); });
            if ((x[1].issues || []).length > 6) L.push("  - … 그 밖 " + (x[1].issues.length - 6) + "건");
        });
        L.push("");
    });
    return L.join("\n") + "\n";
}
