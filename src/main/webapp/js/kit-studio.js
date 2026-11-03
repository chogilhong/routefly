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
    /** 화면에 쓸 장소 이름 - "설악산국립공원사무소남설악탐방지원센터" → "남설악탐방지원센터", "중청 대피소" → "중청대피소". */
    /**
     * 순수 함수 - "…정상" 이름 줄이기: 봉우리 이름이 있으면 그 봉 이름("지리산 천왕봉 정상" · "천왕봉정상" → 천왕봉),
     * 없으면 "정상"("공주향교뒷산 정상" → 정상). "정상" 으로 끝나지 않으면 그대로. 2026-10-12 홍TV님.
     */
    var NOT_PASS = ["고수치"];

    /**
     * 순수 함수 - 노선 안내도의 구간 시작 · 끝 지명(2026-10-12 홍TV님). courses 는 그릴 차례, lines 는 {코스ID: [[경도, 위도]…]}.
     * 이름은 코스 이름 길("복지봉 → 팔성사")의 처음과 끝. 앞 구간 끝과 다음 구간 시작처럼 nearM 안에 이미 지명이 있으면 하나만.
     * → [{name, lon, lat, start: 이 지명에서 시작하는 courses 번호(없으면 -1)}]
     */
    /**
     * 순수 함수 - 코스 이름의 출발 · 도착 이름 {from, to}(모르면 null). "가 → 나 → 다" 는 가 · 다,
     * 화살표 없는 "창옥봉에서" · "삼각점까지"(OSM 구간 한쪽 끝 - 2026-10-12 PC: 백두대간 끝 점이 둘로 보였음),
     * 국가숲길 "지리산둘레길 가탄-송정"(2026-10-12 홍TV님: 어디가 가탄이고 어디가 송정인지).
     */
    function routeEnds(name) {
        var parts = nameParts(name).route.split(" → ");
        if (parts.length >= 2) return { from: parts[0].trim(), to: parts[parts.length - 1].trim() };
        var one = /^(.+?)(에서|까지)$/.exec(parts[0].trim());
        if (one) return one[2] === "에서" ? { from: one[1], to: null } : { from: null, to: one[1] };
        // "덕전리 순환" - 거기서 나가 거기로 돌아옴(산림청 · 등산트레킹 · 자전거 순환 코스, 2026-10-13 홍TV님: 들머리 · 날머리 이름)
        var loop = /^(.+?)\s*순환$/.exec(parts[0].trim());
        if (loop) return { from: loop[1], to: loop[1] };
        var ab = /([가-힣]+)-([가-힣]+)\s*\)?\s*$/.exec(String(name || ""));
        return ab ? { from: ab[1], to: ab[2] } : { from: null, to: null };
    }

    function summitName(name) {
        var n = String(name || "").trim();
        if (!/정상$/.test(n)) return n;
        var words = n.replace(/\s*정상$/, "").trim().split(/\s+/), bong = null, last = words[words.length - 1];
        // 봉 · 단 · 대 봉우리 이름(노고단 · 백운대 · 마천대 - 2026-10-12: 이어 걷기 이름이 "만복대 → 정상" 으로 흐렸음), 전망대는 아님
        words.forEach(function (w) { if (/[가-힣](봉|단|대)(\(.*\))?$/.test(w) && !/(전망대|전망단)$/.test(w)) bong = w; });
        // 고개의 "정상" 은 고갯마루 - 고개 이름을 그대로(2026-10-12 홍TV님: "진부령정상" → 진부령, 등산 · 걷기 · 자전거 모두)
        // 고개가 아닌 것: 고수치(제주 서귀포 안덕면 고수치오름 - 2026-10-12 홍TV님 확인)
        if (!bong && /[가-힣](령|재|고개|치|티)$/.test(last) && NOT_PASS.indexOf(last) < 0) return last;
        return bong || "정상";
    }

    /**
     * 코스 이름 → {group, route}. 2026-10-10 홍TV님: "[무등산 서인봉 1코스] 증심사 → 무등산" 처럼 보이게 -
     * 첫 " · " 앞(산 · 코스 이름)을 group, 뒤(들머리 → 정상)를 route 로. " · " 가 없으면 group 없음.
     */
    function nameParts(name) {
        var n = String(name || "");
        var i = n.indexOf(" · ");
        // 무리에 든 산 이름이 길 이름 앞에 또 붙은 봉우리는 떼어 냄("[가야산 동성봉 자락 2코스] … → 가야산칠불봉" → 칠불봉, 2026-10-14 홍TV님)
        var mts = i > 0 ? n.slice(0, i).split(/\s+/).map(function (w) { return w.replace(/\(.*\)$/, ""); }).filter(function (w) { return /산$/.test(w); }) : [];
        var route = (i > 0 ? n.slice(i + 3) : n).split(" → ").map(function (x) { return summitName(numberedPark(stripMountain(x, mts))); }).join(" → ");   // "→ 공주향교뒷산 정상" → "→ 정상", 문화공원11(부안공원) → 부안공원
        return i > 0 ? { group: n.slice(0, i), route: route } : { group: null, route: route };
    }

    /** 순수 함수 - "가야산칠불봉" 처럼 산 이름(mts 가운데 하나) 바로 뒤에 봉우리 · 고개 이름이 붙었으면 봉우리 이름만. 아니면 그대로("가야산소리길" · "남산제일봉"). */
    function stripMountain(x, mts) {
        var t = String(x || "").trim();
        for (var k = 0; k < (mts || []).length; k++) {
            var m = mts[k], rest = t.indexOf(m) === 0 ? t.slice(m.length) : "";
            // "남산제일봉" 처럼 차례 이름(제일 · 제이 …)이 붙은 봉우리는 한 이름이라 그대로
            // 봉우리(…봉 · …대)만 - 고개("어산이재") · 전망대("무등산전망대")는 그대로(2026-10-14 PC, 배치 MountainNames.liftMountain 과 같게)
            if (rest && !/^제[일이삼사오]/.test(rest) && !/전망대$/.test(rest) && /^[가-힣]{1,8}(봉|대)(\(.*\))?$/.test(rest)) return rest;
        }
        return x;
    }

    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    var NUMBERED_PARK = /[^\s·→()\d]+\d+\s*\(([^()]+공원)\)/g;
    // "수변공원49까지"(서해랑길 16코스) - 공원 이름 뒤 관리 번호도 뗌
    var PARK_NO = /([가-힣](?:공원|광장))\d+(?![\d)])/g;
    function numberedPark(name) { return name == null ? name : String(name).replace(NUMBERED_PARK, "$1").replace(PARK_NO, "$1"); }

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

    /**
     * 순수 함수 - 받은 GPX 가 이미 있는 코스인지(2026-11-01 홍TV님 "없는 코스면 점검해서 올림"): track([위도, 경도, …] 점들) 가운데
     * routefly 코스 선(/api/trails: [{coords:[[경도, 위도]…]}]) 어느 마디에서 m(기본 30m) 안에 있는 점의 몫(0~1). 점이 없으면 0.
     * 마디는 0.002° 칸에 나눠 두고 그 점 칸과 둘레 칸의 마디만 견줌.
     */
    function overlapShare(track, trails, m) {
        var lim = m || 30, cell = 0.002, grid = {}, pts = (track || []).filter(function (p) { return p && isFinite(p[0]) && isFinite(p[1]); });
        if (!pts.length) return 0;
        (trails || []).forEach(function (t) {
            var c = t && t.coords || [];
            for (var i = 1; i < c.length; i++) {
                var a = c[i - 1], b = c[i], seg = [+a[1], +a[0], +b[1], +b[0]];
                var y0 = Math.floor(Math.min(seg[0], seg[2]) / cell), y1 = Math.floor(Math.max(seg[0], seg[2]) / cell);
                var x0 = Math.floor(Math.min(seg[1], seg[3]) / cell), x1 = Math.floor(Math.max(seg[1], seg[3]) / cell);
                if ((y1 - y0 + 1) * (x1 - x0 + 1) > 400) continue;   // 이상하게 긴 마디(자료 오류)는 뺌
                for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) (grid[y + ":" + x] = grid[y + ":" + x] || []).push(seg);
            }
        });
        var hit = 0;
        pts.forEach(function (p) {
            var ky = 110540, kx = 111320 * Math.cos(p[0] * Math.PI / 180), gy = Math.floor(p[0] / cell), gx = Math.floor(p[1] / cell), near = false;
            for (var dy = -1; dy <= 1 && !near; dy++) for (var dx = -1; dx <= 1 && !near; dx++) {
                (grid[(gy + dy) + ":" + (gx + dx)] || []).some(function (s) {
                    var ax = (s[1] - p[1]) * kx, ay = (s[0] - p[0]) * ky, bx = (s[3] - p[1]) * kx, by = (s[2] - p[0]) * ky, vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
                    var u = l2 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / l2)) : 0;
                    near = Math.hypot(ax + u * vx, ay + u * vy) <= lim;
                    return near;
                });
            }
            if (near) hit++;
        });
        return hit / pts.length;
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
    /**
     * 순수 함수 - 올릴 코스 이름 "북한산 숨은벽 · 밤골 → 백운대 → 우이동"(2026-11-01 홍TV님 "[산 · 코스 이름] 들머리 - 정상 - 날머리").
     * 묶음(산 · 코스 이름)과 길(들머리 → 정상 → 날머리)은 " · " 하나로, 길은 " → " 로 - 목록 · 따라가기가 이 꼴로 들머리 · 날머리를 읽음(nameParts · routeEnds).
     * 칸 안의 " · " · "→" · 괄호는 지움. 빈 칸은 뺌, 길이 없으면 묶음만. 보낸 사람(만든 이)은 이름에 넣지 않고 코스 화면에 따로 한 줄(2026-11-01 홍TV님 "이름은 깨끗하게").
     */
    function courseName(o) {
        function f(x) { return String(x || "").replace(/\s*(·|→)\s*/g, " ").replace(/[()]/g, "").replace(/\s+/g, " ").trim(); }
        o = o || {};
        var head = [f(o.mountain), f(o.title)].filter(Boolean).join(" ");
        var route = [f(o.start), f(o.top), f(o.end)].filter(Boolean).join(" → ");
        return head && route ? head + " · " + route : head || route;
    }

    /** 순수 함수 - 출처 · 만든 이 글(CourseSource.line 과 같음): "출처: 국립공원공단" · "만든 이: 시험대장 (routefly 점검)" · 제휴는 "[제휴]". 없으면 "". */
    function sourceText(s, en) {
        if (!s || !s.text) return "";
        var t = (en && s.en) || s.text;
        if (s.kind !== "maker") return (en ? "Source: " : "출처: ") + t;
        return (en ? "Made by: " : "만든 이: ") + t + (s.partner ? (en ? " [Partner]" : " [제휴]") : s.checked ? (en ? " (checked by routefly)" : " (routefly 점검)") : "");
    }

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
     * 📮 routefly 에 코스 보내기 - 따라가기 내 기록(hike.js)과 GPX 편집(studio.js, 2026-11-02 홍TV님 "GPX 편집을 누구나 - 올리기 대신 보내기")이 같이 씀.
     * 서버(CourseSubmitServlet)가 받는 한도: 본문 3MB(CourseUploadServlet.MAX_BODY) · 점 10~5만 개 · 이름 2~60자 - 보내기 전에 여기서 먼저 알려 줌(서버도 다시 봄).
     * 동의 글에 "내가 직접 걸은 기록" 을 넣음(2026-11-02 홍TV님) - 서버의 agree:true 뜻은 그대로.
     */
    var SUBMIT_MAX_BODY = 3 * 1024 * 1024, SUBMIT_MAX_POINTS = 50000, SUBMIT_SENDER_KEY = "rf-submit-sender";
    function submitAgree() {
        return tr("내가 직접 걸은 기록입니다(다른 앱 · 사이트에서 받은 남의 기록은 보내지 마세요). 위 내용을 읽었고 보내는 데 동의합니다",
            "This is a track I walked myself (please do not send other people's tracks taken from other apps or sites). I have read the above and agree to send it");
    }
    /** 순수 함수 - 보낼 본문(시각은 빼고 선 모양 · 높이만, agree:true). */
    function submitBody(name, sender, kind, note, track) {
        return { name: name, sender: sender, kind: kind, note: note, agree: true,
            gpx: trackGpx(name, kind, (track || []).map(function (p) { return [p[0], p[1], null, p[3]]; })) };
    }
    /** 순수 함수 - 보내기 전 점검: 보내도 되면 null, 아니면 까닭(서버 한도와 같음). bodyLen = JSON 본문 글자 수. */
    function submitProblem(name, track, bodyLen) {
        var n = (track || []).length;
        if (String(name || "").trim().length < 2 || String(name).trim().length > 60) return tr("코스 이름을 2~60자로 적어 주세요.", "Please enter a course name (2-60 characters).");
        if (n < 10) return tr("기록 점이 너무 적습니다(10개 넘게).", "Too few points (needs more than 10).");
        if (n > SUBMIT_MAX_POINTS) return tr("기록 점이 너무 많습니다(5만 개까지) - 길을 나눠 보내 주세요.", "Too many points (up to 50,000) - please split the track.");
        if (bodyLen > SUBMIT_MAX_BODY) return tr("GPX 가 너무 큽니다(3MB 까지) - 길을 나눠 보내 주세요.", "The GPX is too big (up to 3 MB) - please split the track.");
        return null;
    }
    /** 순수 함수 - JSON 이 아닌 실패 응답(nginx · 요청 제한 등)의 말. */
    function submitFail(status) {
        if (status === 429) return tr("요청이 너무 잦습니다. 잠시 뒤(오늘 더 못 보내면 내일) 다시 보내 주세요.", "Too many requests. Please try again later (or tomorrow).");
        if (status === 413) return tr("GPX 가 너무 큽니다 - 길을 나눠 보내 주세요.", "The GPX is too big - please split the track.");
        return tr("보내지 못했습니다(HTTP " + status + "). 잠시 뒤 다시 보내 주세요.", "Could not send (HTTP " + status + "). Please try again later.");
    }
    /**
     * 보내기 창 - o = {name, kind, track, trim(track) → Promise(자른 점 | null) (있을 때만 ✂ 단추), sent(알림 글)}.
     * 보내도 화면의 기록 · 편집 중인 길은 그대로(창만 닫힘). 보낸 사람 이름은 이 기기에 기억(rf-submit-sender).
     */
    function submitSheet(o) {
        var track = o.track || [], sender = "";
        try { sender = localStorage.getItem(SUBMIT_SENDER_KEY) || ""; } catch (e) { /* 처음 */ }
        var wrap = document.createElement("div");
        wrap.setAttribute("role", "dialog");
        wrap.setAttribute("aria-label", tr("코스로 보내기", "Send as a course"));
        wrap.style.cssText = "position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:12px";
        var box = document.createElement("div");
        box.style.cssText = "background:#1b2430;color:#e9eef4;border-radius:14px;padding:14px;width:min(440px,100%);max-height:96vh;overflow:auto;font-size:15px";
        var ls = "display:block;margin-top:10px", is = "display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border-radius:8px;border:1px solid #3a4655;background:#0f1720;color:#e9eef4;font-size:15px";
        box.innerHTML = '<b style="font-size:17px">' + tr("📮 routefly 에 코스로 보내기", "📮 Send to routefly as a course") + '</b>'
            + '<label style="' + ls + '">' + tr("코스 이름", "Course name") + '<input type="text" class="nm" maxlength="60" style="' + is + '"></label>'
            + '<label style="' + ls + '">' + tr("보내는 사람 이름(올리면 코스 화면에 \"만든 이\" 로 보임 · 비우면 익명)", "Your name (shown as \"Made by\" on the course screens if published · leave empty to stay anonymous)") + '<input type="text" class="sd" maxlength="20" style="' + is + '"></label>'
            + '<label style="' + ls + '">' + tr("종류", "Type") + '<select class="kd" style="' + is + '"><option value="hike">' + tr("⛰️ 등산", "⛰️ Hiking") + '</option><option value="walk">' + tr("🚶 걷기", "🚶 Walking") + '</option><option value="bike">' + tr("🚴 자전거", "🚴 Cycling") + '</option></select></label>'
            + '<label style="' + ls + '">' + tr("메모(골라서 - 들머리 · 주차 등)", "Note (optional - trailhead, parking, etc.)") + '<textarea class="nt" maxlength="200" rows="2" style="' + is + '"></textarea></label>'
            + '<p class="tip" style="margin:10px 0 6px">' + tr("길 모양 · 코스 이름 · 보낸 사람 이름을 routefly 가 점검해 공개 코스로 올릴 수 있습니다. 시각 · 사진 · 메모는 보내지 않습니다. 집 근처 출발 · 도착 부분은 먼저 자르세요.",
                "routefly may review the line, course name and your name and publish them as a public course. Times, photos and photo notes are not sent. Trim the start and end near your home first.")
            + ' <a href="' + tr("privacy.html", "privacy-en.html") + '#course-submit" target="_blank" rel="noopener" style="color:#38d9ea">' + tr("개인정보처리방침", "Privacy policy") + '</a></p>'
            + '<p style="display:flex;gap:8px;align-items:center;margin:0">' + (o.trim ? '<button type="button" class="tr">' + tr("✂ 앞 · 뒤 자르기", "✂ Trim start and end") + '</button>' : "") + '<span class="km tip"></span></p>'
            + '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px"><input type="checkbox" class="ag" style="margin-top:3px"><span class="agt"></span></label>'
            + '<p class="er" role="alert" style="color:#ff8787;margin:8px 0 0"></p>'
            + '<p style="display:flex;gap:8px;margin:12px 0 0"><button type="button" class="no" style="flex:1">' + tr("취소", "Cancel") + '</button><button type="button" class="go main" style="flex:1">' + tr("보내기", "Send") + '</button></p>';
        box.querySelector(".agt").textContent = submitAgree();
        box.querySelector(".nm").value = String(o.name || "").slice(0, 60);
        box.querySelector(".sd").value = sender;
        box.querySelector(".kd").value = /^(hike|walk|bike)$/.test(o.kind) ? o.kind : "hike";
        wrap.appendChild(box);
        document.body.appendChild(wrap);
        function shown() { box.querySelector(".km").textContent = km(trackStats(track).dist) + " km" + (track !== o.track ? tr(" (자름)", " (trimmed)") : ""); }
        function close() { wrap.remove(); }
        shown();
        if (o.trim) box.querySelector(".tr").onclick = function () {
            o.trim(track).then(function (kept) { if (kept) { track = kept; shown(); } });
        };
        box.querySelector(".no").onclick = close;
        wrap.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
        var go = box.querySelector(".go"), er = box.querySelector(".er");   // 알림(toast)은 이 창 아래에 깔려 창 안에 씀
        go.onclick = function () {
            var name = box.querySelector(".nm").value.trim(), kind = box.querySelector(".kd").value;
            sender = box.querySelector(".sd").value.trim();
            var body = JSON.stringify(submitBody(name, sender, kind, box.querySelector(".nt").value.trim(), track));
            var why = submitProblem(name, track, body.length);
            if (why) { er.textContent = why; return; }
            if (!box.querySelector(".ag").checked) { er.textContent = tr("안내를 읽고 동의에 체크해 주세요.", "Please read the notice and tick the box."); return; }
            er.textContent = "";
            try { if (sender) localStorage.setItem(SUBMIT_SENDER_KEY, sender); else localStorage.removeItem(SUBMIT_SENDER_KEY); } catch (e) { /* 이번만 */ }
            go.disabled = true;
            fetch("api/course-submit", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: body })
                .then(function (res) { return res.json().catch(function () { return { success: false, message: submitFail(res.status) }; }); })
                .then(function (j) {
                    if (!j || j.success === false) throw new Error(j && j.message || "?");
                    close();
                    if (o.sent) o.sent(tr("보냈습니다 - 점검 뒤 코스 목록에 올라갑니다(이미 있는 코스면 올리지 않을 수 있습니다)", "Sent - after review it will appear in the course list (we may skip it if the trail already exists)"));
                })
                .catch(function (e) { go.disabled = false; er.textContent = tr("보내지 못했습니다: ", "Could not send: ") + (e && e.message || e); });
        };
        box.querySelector(".nm").focus();
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

    /**
     * 종류별 이름 · 표준 빠르기 - 예상 시간에 씁니다. 등산 · 걷기는 오르막 600m/h 를 더하고(네이스미스),
     * 내리막도 300m 에 10분(1,800m/h)을 더합니다(2026-11-03 홍TV님 - 안전: 하산 시간이 빠져 일몰 · 귀가 어림이 짧았음.
     * 네이스미스 규칙의 랭뮤어 보정 가운데 가파른 내리막 값 - 산길 내리막은 무릎 · 미끄럼 때문에 평지보다 느림). MountainServlet.hours 와 같은 값.
     */
    var KINDS = {
        hike: { label: "등산", kmh: 4, climb: 600, down: 1800, icon: "⛰️", act: "산행", sos: "등산 중", simKmh: 3.5, svg: "hiker" },
        walk: { label: "걷기", kmh: 4, climb: 600, down: 1800, icon: "🚶", act: "걷기", sos: "걷기 중", simKmh: 4, svg: "walker" },
        bike: { label: "자전거", kmh: 15, climb: 0, down: 0, icon: "🚴", act: "라이딩", sos: "자전거 타던 중", simKmh: 15, svg: "cyclist" },
        // 2026-10-10: 등산 · 걷기가 애매한 코스(선자령순환등산로 등) - 두 탭 모두에 나오고, 따라가기는 등산과 같은 말 · 속도
        trek: { label: "등산 · 걷기", kmh: 4, climb: 600, down: 1800, icon: "🥾", act: "산행", sos: "산행 중", simKmh: 3.5, svg: "hiker" }
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

    /**
     * MapLibre 지도 단추 글(확대 · 축소 · 북쪽 · 출처 · 내 위치) - 한국어 화면은 한국어(2026-11-03 홍TV님 점검: 한국어 화면에 "Zoom in" 이 나왔음).
     * 영어 화면은 undefined(MapLibre 기본 영어). new maplibregl.Map({ locale: RF.mapLocale() }).
     */
    function mapLocale() {
        if (LANG === "en") return undefined;
        return { "AttributionControl.ToggleAttribution": "출처 보기 · 접기", "AttributionControl.MapFeedback": "지도 의견",
                 "FullscreenControl.Enter": "전체 화면", "FullscreenControl.Exit": "전체 화면 끝내기",
                 "GeolocateControl.FindMyLocation": "내 위치 찾기", "GeolocateControl.LocationNotAvailable": "위치를 알 수 없음",
                 "LogoControl.Title": "MapLibre 로고", "Marker.Title": "지도 표시",   // 이름을 안 붙인 표시는 "Map marker" 대신 "NavigationControl.ResetBearing": "끌면 지도 돌리기, 누르면 북쪽을 위로",
                 "NavigationControl.ZoomIn": "확대", "NavigationControl.ZoomOut": "축소",
                 "TerrainControl.Enable": "지형 켜기", "TerrainControl.Disable": "지형 끄기" };
    }

    global.RF = {
        num: num,
        km: km,
        nameParts: nameParts,
        trimTrack: trimTrack,
        gpxTracks: gpxTracks,
        trackStats: trackStats,
        splitTrack: splitTrack,
        joinTracks: joinTracks,
        trackGpx: trackGpx,
        submitSheet: submitSheet,
        courseName: courseName,
        sourceText: sourceText,
        cutMiddle: cutMiddle,
        osmRoute: osmRoute,
        WALK_WAYS: WALK_WAYS,
        trailsToElements: trailsToElements,
        overlapShare: overlapShare,
        routeEnds: routeEnds,
        distM: distM,
        mapLocale: mapLocale
    };
})(window);
