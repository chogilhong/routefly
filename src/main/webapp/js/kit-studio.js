/* 만든 파일 - 고치지 마세요. course-kit.js 를 고친 뒤 node tools/kit-split/split.js (이 화면이 쓰는 것만 남긴 course-kit) */
/*
 * routefly 공통 도구 - 비행 화면(app.js)과 산행 화면(hike.js)이 같이 씁니다.
 *   - 코스 위치 계산: at(진행 거리 → 위치 · 고도), grade(경사), snap(GPS 위치 → 코스 위 진행 거리 · 벗어난 거리)
 *   - 고도 그래프: 지점 이름(비스듬히) · km 눈금 · 지금 위치 점
 *   - 작은 평면 지도: 북쪽이 위, km 번호 · 지점 · 지금 위치
 * 코스 c = {lon[], lat[], ele[], dist[], total, pois[], course}
 */
(function (global) {
    "use strict";
    function num(n, digits) {
        if (n == null || !isFinite(n)) return "-";
        return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
    }
    function km(m) { return num(m / 1000, 2); }

    // ------------------------------------------------------------------ 화면 말(2026-10-17 홍TV님 - 따라가기 영어 1 · 2단계)
    // 따라가기(hike.js)가 RF.setLang("en") 을 부를 때만 영어 - 비행 화면 · 산 페이지(/m/ · /en/m/)는 이 값을 쓰지 않음(늘 그대로).
    var LANG = "ko";
    function setLang(l) {
        LANG = l === "en" ? "en" : "ko";
        // 종류 말(KINDS 는 같은 객체로 견주는 곳이 있어 안의 말만 바꿈)
        Object.keys(KINDS).forEach(function (k) {
            var o = KINDS[k];
            if (!o.ko) o.ko = { label: o.label, act: o.act, sos: o.sos };
            var w = LANG === "en" ? KINDS_EN[k] : o.ko;
            o.label = w.label; o.act = w.act; o.sos = w.sos;
        });
    }
    /** 지금 말로 고르기 - tr("출발", "Start"). */
    function tr(ko, en) { return LANG === "en" ? en : ko; }
    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    /**
     * 순수 함수 - 도장 인식 거리(m): GPS 오차 + 20m, 40m 보다 좁히지 않고 max(정상 150 · 인증센터 100)를 넘지 않음. 오차를 모르면 max.
     * 2026-10-16 홍TV님: 다른 도장 앱은 보통 30 ~ 40m(오차를 생각해 50 ~ 200m 까지 넓히기도) - 신호가 좋으면 정상에 가까이 가야 찍히게.
     */
    /**
     * 순수 함수 - 기록 점(track [위도, 경도, 시각, GPS 높이])의 오른 높이(m). GPS 높이는 흔들려서 step(기본 10m) 넘게 바뀐 것만 셈.
     * 2026-10-17 홍TV님 송산: 코스 밖(새 들머리)을 걸으면 코스 고도로 세는 오른 높이가 0m 였음 - 기록에는 이것과 큰 쪽을 남김.
     */
    function trackClimb(track, step) {
        step = step || 10;
        var up = 0, ref = null;
        (track || []).forEach(function (p) {
            var a = p && p[3];
            if (a == null || !isFinite(a)) return;
            if (ref == null) { ref = a; return; }
            if (a - ref >= step) { up += a - ref; ref = a; } else if (ref - a >= step) ref = a;
        });
        return Math.round(up);
    }

    // 2026-10-09 점검: 남이 준 파일이라 크기 · 지점 수에 한도(지점마다 모든 점을 훑어서, 지점이 아주 많으면 화면이 멈춤)
    var GPX_MAX_CHARS = 30 * 1024 * 1024, GPX_MAX_WPT = 1000;
    function indexAt(c, d) {
        var dist = c.dist, lo = 0, hi = dist.length - 1;
        if (d <= 0) return 0;
        if (d >= c.total) return hi;
        while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            if (dist[mid] <= d) lo = mid; else hi = mid;
        }
        return lo;
    }

    /** 순수 함수 - 걸음 수 추정. 보폭 = 키 × 0.415(등산은 오르내림으로 10% 짧게). 자전거는 null. */
    function steps(kind, cm, distM) {
        if (kind === "bike") return null;
        var stride = cm / 100 * 0.415 * (kind === "walk" ? 1 : 0.9);
        return Math.round(distM / stride);
    }

    /**
     * 순수 함수 - GPX 글 → 길마다 {name, track:[[위도, 경도, 시각ms|null, 높이|null]]}(GPX 편집 studio.html, 2026-10-31 홍TV님).
     * trk 하나가 길 하나(조각 trkseg 는 이어 붙임), trk 가 없으면 rte. 점은 솎지 않음(편집용). 브라우저 없이도 돌게 정규식으로.
     */
    function gpxTracks(text) {
        var src = String(text || ""), out = [];
        if (src.length > GPX_MAX_CHARS) throw new Error("GPX 파일이 너무 큽니다(30MB 까지).");
        if (!/<gpx[\s>]/.test(src)) throw new Error("GPX 파일이 아닙니다.");
        var unesc = function (x) { return String(x).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim(); };
        function pts(block, tag) {
            var re = new RegExp("<" + tag + "\\b([^>]*?)(?:/>|>([\\s\\S]*?)</" + tag + ">)", "g"), m, a = [];
            while ((m = re.exec(block))) {
                var la = /\blat\s*=\s*["']([^"']+)["']/.exec(m[1]), lo = /\blon\s*=\s*["']([^"']+)["']/.exec(m[1]);
                var lat = la ? +la[1] : NaN, lon = lo ? +lo[1] : NaN;
                if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat === 0 && lon === 0)) continue;
                var body = m[2] || "", e = /<ele>\s*([^<]+)<\/ele>/.exec(body), t = /<time>\s*([^<]+)<\/time>/.exec(body);
                var ev = e ? +e[1] : NaN, tv = t ? Date.parse(t[1].trim()) : NaN;
                a.push([lat, lon, isFinite(tv) ? tv : null, isFinite(ev) ? ev : null]);
            }
            return a;
        }
        function nameOf(block) { var n = /<name>([\s\S]*?)<\/name>/.exec(block.replace(/<(trkseg|rtept|trkpt)\b[\s\S]*$/, "")); return n ? unesc(n[1]) : ""; }
        var re = /<trk\b[^>]*>([\s\S]*?)<\/trk>/g, m;
        while ((m = re.exec(src))) { var tr = pts(m[1], "trkpt"); if (tr.length >= 2) out.push({ name: nameOf(m[1]), track: tr }); }
        if (!out.length) { re = /<rte\b[^>]*>([\s\S]*?)<\/rte>/g; while ((m = re.exec(src))) { var rt = pts(m[1], "rtept"); if (rt.length >= 2) out.push({ name: nameOf(m[1]), track: rt }); } }
        if (!out.length) throw new Error("GPX 에 경로 점이 2개보다 적습니다(trk · rte).");
        var meta = /<metadata>[\s\S]*?<name>([\s\S]*?)<\/name>/.exec(src);
        out.forEach(function (x, i) { if (!x.name) x.name = (meta ? unesc(meta[1]) : "GPX") + (out.length > 1 ? " " + (i + 1) : ""); });
        return out;
    }

    /** 순수 함수 - 길 요약: 거리(m) · 오르막 · 내리막(10m 문턱, trackClimb) · 걸린 시간(ms, 시각이 있을 때) · 점 수. */
    function trackStats(track) {
        var t = track || [], d = 0;
        for (var i = 1; i < t.length; i++) d += distM(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]);
        var t0 = null, t1 = null;
        t.forEach(function (p) { if (p[2] != null) { if (t0 == null) t0 = p[2]; t1 = p[2]; } });
        return { dist: d, up: trackClimb(t), down: trackClimb(t.slice().reverse()), ms: t0 != null && t1 > t0 ? t1 - t0 : null, n: t.length,
            hasEle: t.some(function (p) { return p[3] != null; }) };
    }

    /** 순수 함수 - atM(m) 에서 둘로 나눔(나눈 점은 양쪽에 다). 한쪽이 점 2개가 안 되면 null. */
    function splitTrack(track, atM) {
        var t = track || [], d = 0, k = 0;
        for (var i = 1; i < t.length; i++) { d += distM(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]); if (d >= atM) { k = i; break; } }
        if (k < 1 || k > t.length - 2) return null;
        return [t.slice(0, k + 1), t.slice(k)];
    }

    /** 순수 함수 - 두 길 잇기(b 의 첫 점이 a 의 끝과 5m 안이면 겹친 점 하나 뺌). */
    function joinTracks(a, b) {
        var x = (a || []).slice(), y = b || [];
        if (x.length && y.length && distM(x[x.length - 1][0], x[x.length - 1][1], y[0][0], y[0][1]) < 5) y = y.slice(1);
        return x.concat(y);
    }

    /** 순수 함수 - 가운데(d0 ~ d1 m)를 뺀 앞 · 뒤 두 토막(GPX 편집 "가운데 지우기", 2026-10-31). 한쪽이 점 2개 안 되면 그 토막은 빈 배열. */
    function cutMiddle(track, d0, d1) {
        var t = track || [], d = 0, a = [], b = [];
        for (var i = 0; i < t.length; i++) {
            if (i) d += distM(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]);
            if (d <= d0) a.push(t[i]); else if (d >= d1) b.push(t[i]);
        }
        return { a: a.length > 1 ? a : [], b: b.length > 1 ? b : [] };
    }

    /**
     * 순수 함수 - routefly 코스 선(/api/trails: [{id, coords:[[경도, 위도]…]}]) → osmRoute 가 읽는 모양(node · way).
     * 선끼리 joinM(기본 15m) 안에 닿는 점은 이어 줌(갈림길 - 코스마다 점이 따로라). 0.0002° 칸으로 가까운 점만 견줌.
     * 2026-10-31 PC: 공용 Overpass 가 PC 에서도 시간 초과 · 429 - 우리 서버 코스 선으로 먼저 길 찾기.
     */
    function trailsToElements(trails, joinM) {
        var lim = joinM || 15, out = [], id = 1, grid = {}, cell = 0.0002;
        (trails || []).forEach(function (t, k) {
            var ids = [];
            (t.coords || []).forEach(function (c) {
                var n = { type: "node", id: id++, lat: +c[1], lon: +c[0], t: k };
                out.push(n);
                ids.push(n.id);
                var g = Math.floor(n.lat / cell) + ":" + Math.floor(n.lon / cell);
                (grid[g] = grid[g] || []).push(n);
            });
            if (ids.length > 1) out.push({ type: "way", id: "t" + k, nodes: ids, tags: { highway: "path" } });
        });
        var r = Math.ceil(lim / 20) + 1;
        out.forEach(function (n) {
            if (n.type !== "node") return;
            var gy = Math.floor(n.lat / cell), gx = Math.floor(n.lon / cell);
            for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
                (grid[(gy + dy) + ":" + (gx + dx)] || []).forEach(function (m) {
                    if (m.t !== n.t && m.id > n.id && distM(n.lat, n.lon, m.lat, m.lon) <= lim) out.push({ type: "way", id: "j" + n.id + "_" + m.id, nodes: [n.id, m.id], tags: { highway: "path" } });
                });
            }
        });
        return out;
    }

    /** 걸을 수 있는 OSM 길 종류(GPX 편집 길 그리기 - Overpass 질의 · 길 찾기, tools/park-gaps 와 같은 범위). */
    var WALK_WAYS = "path|footway|steps|track|bridleway|pedestrian|cycleway|residential|unclassified|service|living_street|tertiary";

    /**
     * 순수 함수 - Overpass 답(elements: way{nodes, tags} · node{id, lat, lon})에서 from → to([위도, 경도]) 가장 짧은 걷는 길(GPX 편집 3단계, 2026-10-31 홍TV님).
     * 출입금지(access · foot = no · private)는 뺌. 처음 · 끝은 snapM(기본 200m) 안의 가장 가까운 길 점에 붙임. 다익스트라(이진 힙).
     * → {pts:[[위도, 경도]…], dist(m, 붙는 거리 포함), snap:[처음 m, 끝 m]} 또는 {error}.
     */
    function osmRoute(elements, from, to, snapM) {
        var lim = snapM || 200, nodes = {}, adj = {};
        (elements || []).forEach(function (e) { if (e.type === "node") nodes[e.id] = [e.lat, e.lon]; });
        (elements || []).forEach(function (w) {
            if (w.type !== "way" || !w.nodes || w.nodes.length < 2) return;
            var g = w.tags || {};
            if (/^(no|private)$/.test(String(g.access || g.foot || ""))) return;
            for (var i = 1; i < w.nodes.length; i++) {
                var a = w.nodes[i - 1], b = w.nodes[i];
                if (!nodes[a] || !nodes[b]) continue;
                var m = distM(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1]);
                (adj[a] = adj[a] || []).push([b, m]);
                (adj[b] = adj[b] || []).push([a, m]);
            }
        });
        var ids = Object.keys(adj);
        if (!ids.length) return { error: "둘레에 걷는 길이 없습니다." };
        var near = function (p) { var best = null, bd = Infinity; ids.forEach(function (id) { var x = distM(p[0], p[1], nodes[id][0], nodes[id][1]); if (x < bd) { bd = x; best = id; } }); return [best, bd]; };
        var s = near(from), t = near(to);
        if (s[1] > lim || t[1] > lim) return { error: "찍은 자리 " + lim + "m 안에 길이 없습니다(" + Math.round(Math.max(s[1], t[1])) + "m)." };
        var dist = {}, prev = {}, heap = [[0, s[0]]];
        dist[s[0]] = 0;
        var pushH = function (x) { heap.push(x); var i = heap.length - 1; while (i) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; var tmp = heap[p]; heap[p] = heap[i]; heap[i] = tmp; i = p; } };
        var popH = function () {
            var top = heap[0], last = heap.pop();
            if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; var tmp = heap[m]; heap[m] = heap[i]; heap[i] = tmp; i = m; } }
            return top;
        };
        while (heap.length) {
            var cu = popH(), u = cu[1];
            if (cu[0] > dist[u]) continue;
            if (u === t[0]) break;
            adj[u].forEach(function (e) {
                var v = String(e[0]), nd = dist[u] + e[1];
                if (dist[v] === undefined || nd < dist[v]) { dist[v] = nd; prev[v] = u; pushH([nd, v]); }
            });
        }
        if (dist[t[0]] === undefined) return { error: "두 점을 잇는 길이 없습니다." };
        var seq = [t[0]];
        while (seq[0] !== s[0]) seq.unshift(prev[seq[0]]);
        return { pts: seq.map(function (id) { return [nodes[id][0], nodes[id][1]]; }), dist: dist[t[0]] + s[1] + t[1], snap: [Math.round(s[1]), Math.round(t[1])] };
    }

    /** 순수 함수 - 길 → GPX 1.1 글(이름 · 종류 · 점마다 높이 · 시각이 있으면). */
    function trackGpx(name, kind, track) {
        var esc = function (x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
        return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="routefly studio" xmlns="http://www.topografix.com/GPX/1/1">\n'
            + "<trk><name>" + esc(name || "GPX") + "</name>" + (kind ? "<type>" + esc(kind) + "</type>" : "") + "<trkseg>\n"
            + (track || []).map(function (p) {
                return '<trkpt lat="' + p[0] + '" lon="' + p[1] + '">' + (p[3] != null ? "<ele>" + Math.round(p[3] * 10) / 10 + "</ele>" : "")
                    + (p[2] != null ? "<time>" + new Date(p[2]).toISOString() + "</time>" : "") + "</trkpt>";
            }).join("\n") + "\n</trkseg></trk>\n</gpx>\n";
    }

    /**
     * 순수 함수 - 기록 점들의 앞 · 뒤를 자름(코스로 올리기 전, 2026-10-31 홍TV님 "앱 안에서 자르는 기능 - 관리자만").
     * cut0 · cut1 = 앞 · 뒤에서 뺄 거리(m). 남는 점 · 남는 길이 · 자른 자리(앞 · 뒤 점 번호). 남는 점이 2개 안 되면 track 은 빈 배열.
     */
    function trimTrack(track, cut0, cut1) {
        var t = track || [], cum = [0];
        for (var i = 1; i < t.length; i++) cum.push(cum[i - 1] + distM(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]));
        var total = cum.length ? cum[cum.length - 1] : 0, a = 0, b = t.length - 1;
        while (a < t.length && cum[a] < (cut0 || 0)) a++;
        while (b >= 0 && total - cum[b] < (cut1 || 0)) b--;
        var ok = b - a >= 1;
        return { track: ok ? t.slice(a, b + 1) : [], from: a, to: b, total: total, kept: ok ? cum[b] - cum[a] : 0 };
    }

    /**
     * GPS 위치 → 코스 위 진행 거리 d 와 코스에서 벗어난 거리 off(m).
     * 같은 길을 오가거나 도는 코스에서 엉뚱한 쪽에 붙지 않게, 지난 자리(prevD) 앞뒤 800m 를 먼저 보고
     * 거기서 멀면(80m 넘게) 전체에서 다시 찾습니다.
     */
    function snap(c, lat, lon, prevD) {
        var kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
        function search(i0, i1) {
            var best = { d: 0, off: Infinity }, cands = [];
            for (var i = Math.max(0, i0); i < Math.min(c.lon.length - 1, i1); i++) {
                var ax = (c.lon[i] - lon) * kx, ay = (c.lat[i] - lat) * ky;
                var bx = (c.lon[i + 1] - lon) * kx, by = (c.lat[i + 1] - lat) * ky;
                var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
                var t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
                var px = ax + dx * t, py = ay + dy * t, off = Math.sqrt(px * px + py * py);
                var cand = { d: c.dist[i] + (c.dist[i + 1] - c.dist[i]) * t, off: off };
                if (off < best.off) best = cand;
                if (prevD != null) cands.push(cand);
            }
            // 같은 길을 갔다가 되돌아오는 코스(갔던 길로 내려옴)에서는 두 자리가 똑같이 가깝습니다 - 지난 자리에 가까운 쪽으로
            // (먼저 지나간 자리에 붙으면 진행 거리가 뒤로 튀어 "되돌아감" 으로 잘못 봅니다)
            if (prevD != null) {
                var minOff = best.off;
                cands.forEach(function (q) {
                    if (q.off <= minOff + 10 && Math.abs(q.d - prevD) < Math.abs(best.d - prevD)) best = q;
                });
            }
            return best;
        }
        if (prevD != null && isFinite(prevD)) {
            var near = search(indexAt(c, prevD - 800), indexAt(c, prevD + 800) + 1);
            if (near.off <= 80) return near;
            var all = search(0, c.lon.length);
            return all.off + 30 < near.off ? all : near;
        }
        return search(0, c.lon.length);
    }

    /** 종류별 이름 · 표준 빠르기 - 예상 시간에 씁니다. 등산 · 걷기는 오르막 600m/h 를 더합니다(네이스미스). */
    var KINDS = {
        hike: { label: "등산", kmh: 4, climb: 600, icon: "⛰️", act: "산행", sos: "등산 중", simKmh: 3.5, svg: "hiker" },
        walk: { label: "걷기", kmh: 4, climb: 600, icon: "🚶", act: "걷기", sos: "걷기 중", simKmh: 4, svg: "walker" },
        bike: { label: "자전거", kmh: 15, climb: 0, icon: "🚴", act: "라이딩", sos: "자전거 타던 중", simKmh: 15, svg: "cyclist" },
        // 2026-10-10: 등산 · 걷기가 애매한 코스(선자령순환등산로 등) - 두 탭 모두에 나오고, 따라가기는 등산과 같은 말 · 속도
        trek: { label: "등산 · 걷기", kmh: 4, climb: 600, icon: "🥾", act: "산행", sos: "산행 중", simKmh: 3.5, svg: "hiker" }
    };

    var KINDS_EN = { hike: { label: "Hiking", act: "Hike", sos: "hiking" }, walk: { label: "Walking", act: "Walk", sos: "walking" },
                     bike: { label: "Cycling", act: "Ride", sos: "cycling" }, trek: { label: "Hiking · Walking", act: "Hike", sos: "hiking" } };

    /**
     * 글자 크기(2026-10-14 홍TV님: 핸드폰에서 글씨가 작음) - 100 → 120 → 140%, 이 기기에 저장(rf-text).
     * 지도 · 그래프는 그대로 두고 글 칸(안내 칸 · 아래 창 · 목록 · 안내 화면)만 CSS zoom 으로 키웁니다(<html class="rfz"> + --rfz).
     */
    var TEXT_KEY = "rf-text", TEXT_STEPS = [1, 1.2, 1.4];
    function textScale() {
        try { var v = +localStorage.getItem(TEXT_KEY); return TEXT_STEPS.indexOf(v) >= 0 ? v : 1; } catch (e) { return 1; }
    }
    function applyTextScale(v) {
        if (!global.document || !document.documentElement) return;
        document.documentElement.style.setProperty("--rfz", String(v));
        document.documentElement.classList.toggle("rfz", v !== 1);
        // 단추 글은 짧게(가 · 가+ · 가++) - "가 140%" 는 위 줄 제목을 밀어 잘랐음(2026-10-14 PC: 다도해해상 탐방 안내도). 몇 %인지는 title 로
        var enPage = document.documentElement.lang === "en";   // /en/m/ 은 setLang 을 안 불러도 영어(2026-10-18 PC: "가/가++" 로 보였음)
        var t = textLabel(v, enPage || LANG === "en"), tip = enPage ? "Text size " + Math.round(v * 100) + "% - tap for 100 → 120 → 140%"   // 영어 산 페이지(2026-10-15 PC)
            : "글자 크기 " + Math.round(v * 100) + "% - 누를 때마다 100 → 120 → 140%";
        Array.prototype.forEach.call(document.querySelectorAll(".rfTextBtn"), function (b) { b.textContent = t; b.title = tip; b.setAttribute("aria-label", tip); });   // 화면 읽기 프로그램에도 지금 크기(2026-10-29 점검)
        // 화면마다 크기를 다시 맞출 수 있게 알림(2026-10-18 PC: 별거 별거 카카오 창 - 단추 클릭은 stopPropagation 이라 document click 으로는 못 받음)
        try { if (global.dispatchEvent && typeof Event === "function") global.dispatchEvent(new Event("rf-textscale")); } catch (e) { /* 옛 브라우저 */ }
    }
    /** 순수 함수 - 단추 글(100% 가 · 120% 가+ · 140% 가++). en - 영어 화면(없으면 지금 말). */
    function textLabel(v, en) { var a = (en === undefined ? LANG === "en" : en) ? "A" : "가"; return v >= 1.4 ? a + "++" : v >= 1.2 ? a + "+" : a; }
    if (global.document && document.documentElement) applyTextScale(textScale());
    // 안드로이드는 크롬의 "routefly 설치"(웹 앱) 권유를 띄우지 않음(2026-10-21 PC: 홍TV님이 설치해 원래 앱과 아이콘이 둘이 됨 -
    // 웹 앱은 화면을 끄면 위치가 멈춰 산악회 방 · 따라가기는 routefly 앱이 맞음). PC 등 다른 기기는 그대로. 크롬 메뉴의 "앱 설치"는 남음
    if (global.addEventListener && global.navigator && /Android/i.test(navigator.userAgent || "") && !global.Capacitor)
        global.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); });

    global.RF = {
        num: num,
        km: km,
        trimTrack: trimTrack,
        gpxTracks: gpxTracks,
        trackStats: trackStats,
        splitTrack: splitTrack,
        joinTracks: joinTracks,
        trackGpx: trackGpx,
        cutMiddle: cutMiddle,
        osmRoute: osmRoute,
        WALK_WAYS: WALK_WAYS,
        trailsToElements: trailsToElements,
        distM: distM
    };
})(window);
