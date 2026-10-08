/*
 * routefly 공통 도구 - 비행 화면(app.js)과 산행 화면(hike.js)이 같이 씁니다.
 *   - 코스 위치 계산: at(진행 거리 → 위치 · 고도), grade(경사), snap(GPS 위치 → 코스 위 진행 거리 · 벗어난 거리)
 *   - 고도 그래프: 지점 이름(비스듬히) · km 눈금 · 지금 위치 점
 *   - 작은 평면 지도: 북쪽이 위, km 번호 · 지점 · 지금 위치
 * 코스 c = {lon[], lat[], ele[], dist[], total, pois[], course}
 */
(function (global) {
    "use strict";

    var LINE_COLOR = "#38d9ea";
    var NS = "http://www.w3.org/2000/svg";

    function num(n, digits) {
        if (n == null || !isFinite(n)) return "-";
        return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
    }
    function km(m) { return num(m / 1000, 2); }

    /** 화면에 쓸 장소 이름 - "설악산국립공원사무소남설악탐방지원센터" → "남설악탐방지원센터", "중청 대피소" → "중청대피소". */
    function cleanName(name) {
        var n = String(name || "").trim().replace(/\s+/g, " ");
        var cut = n.replace(/^\S{0,12}?(국립공원(관리)?(공단|사무소)?|도립공원(관리)?사무소|군립공원(관리)?사무소|관리사무소)\s*(?=\S*(탐방지원센터|탐방안내소|안내소|안내센터|분소|매표소))/, "").trim();
        if (cut.length < 2) cut = n;
        return cut.replace(/\s+(탐방지원센터|탐방안내소|안내소|분소|매표소|대피소|휴게소|주차장|폭포)$/, "$1");
    }

    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    /**
     * 이름표 정리 - 이름을 다듬고, 같은 곳이 여러 이름으로 들어온 것을 하나만 남깁니다
     * (이름이 서로 들어 있고 200m 안, 또는 40m 안이면 같은 곳). 경로 순서 · 짧은 이름 먼저.
     */
    function dedupePois(pois) {
        var key = function (s) { return s.replace(/[\s()·]/g, ""); };
        var list = (pois || []).map(function (p) { return Object.assign({}, p, { name: cleanName(p.name) }); })
            .sort(function (a, b) { return Math.round(+a.dist_m / 20) - Math.round(+b.dist_m / 20) || a.name.length - b.name.length; });
        var kept = [];
        list.forEach(function (p) {
            var k = key(p.name);
            var dup = kept.some(function (w) {
                var d = distM(+w.lat, +w.lon, +p.lat, +p.lon), wk = key(w.name);
                // 이름이 다르면 가까워도 남깁니다 - 같은 자리 이름표는 groupPois 가 한 이름표로 묶습니다
                return wk === k || (wk.indexOf(k) >= 0 || k.indexOf(wk) >= 0) && d < 200;
            });
            if (!dup) kept.push(p);
        });
        return kept;
    }

    /**
     * 순수 함수 - 같은 자리(radiusM 안) 이름표를 한 묶음으로. 코스에 가장 가까운 것이 대표(그림 · 고도), 나머지는 이름만 덧붙입니다
     * (예: 로타리대피소 / 법계사 / 로타리대피소샘터). [{lead, names[], pois[]}] - 대표의 진행 거리 순.
     */
    function groupPois(pois, radiusM) {
        var r = radiusM || 80, groups = [];
        (pois || []).slice().sort(function (a, b) { return (+a.off_route_m || 0) - (+b.off_route_m || 0); }).forEach(function (p) {
            var g = null;
            for (var i = 0; i < groups.length && !g; i++) {
                if (distM(+groups[i].lead.lat, +groups[i].lead.lon, +p.lat, +p.lon) <= r) g = groups[i];
            }
            if (g) { g.pois.push(p); g.names.push(p.name); } else groups.push({ lead: p, names: [p.name], pois: [p] });
        });
        return groups.sort(function (a, b) { return +a.lead.dist_m - +b.lead.dist_m; });
    }

    /**
     * 화면에서 포개지는 이름표 숨기기. items: [{el, prio}] (prio 작을수록 먼저 남김). 남긴 것과 겹치면 el 에 "hid" 를 붙입니다.
     * 3D 로 기울여 보면 떨어진 지점도 화면에서 겹칩니다 - 출발 · 도착 · 지금 위치에 가까운 것을 남깁니다.
     */
    function declutter(items, pad) {
        var p = pad == null ? 3 : pad, kept = [];
        items.slice().sort(function (a, b) { return a.prio - b.prio; }).forEach(function (it) {
            var r = it.el.getBoundingClientRect();
            if (!r.width) { it.el.classList.remove("hid"); return; }
            var hit = kept.some(function (k) {
                return r.left < k.right + p && r.right > k.left - p && r.top < k.bottom + p && r.bottom > k.top - p;
            });
            it.el.classList.toggle("hid", hit);
            if (!hit) kept.push(r);
        });
    }

    var JUNCTION = "갈림길";   // routefly-batch 가 넣는 갈림길 이름표 - 지도 글자 대신 산행 화면 미리 알림에 씁니다

    /** 코스 자료(api/course 응답) → 계산하기 쉬운 모양. 갈림길은 이름표와 따로 c.junctions(진행 거리 목록). */
    function fromApi(id, j) {
        var all = j.pois || [];
        var c = { id: id, course: j.course, lon: [], lat: [], ele: [], dist: [], markers: [],
                  pois: dedupePois(all.filter(function (p) { return p.name !== JUNCTION; })),
                  junctions: all.filter(function (p) { return p.name === JUNCTION; }).map(function (p) { return +p.dist_m; })
                      .sort(function (a, b) { return a - b; }) };
        (j.points || []).forEach(function (p) {
            c.lon.push(+p[0]); c.lat.push(+p[1]); c.ele.push(p[2] == null ? null : +p[2]); c.dist.push(+p[3]);
        });
        c.total = c.dist.length ? c.dist[c.dist.length - 1] : 0;
        c.asc = cumAscent(c.ele);
        return c;
    }

    /** 누적 오르막(m) - 남은 오르막을 빨리 구하려고 미리 셉니다. */
    function cumAscent(ele) {
        var asc = [0];
        for (var i = 1; i < ele.length; i++) {
            var de = ele[i] != null && ele[i - 1] != null ? ele[i] - ele[i - 1] : 0;
            asc.push(asc[i - 1] + Math.max(0, de));
        }
        return asc;
    }

    /** 순수 함수 - 코스 이름을 거꾸로: "송산 · 들머리 → 정상" → "송산 · 정상 → 들머리". 화살표가 없으면 "(거꾸로)" 를 붙입니다. */
    function reverseName(name) {
        name = name || "";
        var a = name.indexOf(" → ");
        if (a < 0) return name + " (거꾸로)";
        var dot = name.lastIndexOf(" · ", a);
        var head = dot >= 0 ? name.slice(0, dot + 3) : "";
        return head + name.slice(head.length).split(" → ").reverse().join(" → ");
    }

    /**
     * 코스를 거꾸로(끝 → 처음) - 올라가다 되돌아 내려올 때 그 길로 안내하려고. 이름표 · 갈림길 거리도 뒤집습니다.
     * c.rev 는 원래 방향인지(저장한 산행을 이어 갈 때 다시 뒤집으려고).
     */
    function reverseCourse(c) {
        var T = c.total, r = { id: c.id, rev: !c.rev, markers: [], lon: c.lon.slice().reverse(), lat: c.lat.slice().reverse(),
                               ele: c.ele.slice().reverse(), total: T };
        r.course = {};
        for (var k in c.course) if (Object.prototype.hasOwnProperty.call(c.course, k)) r.course[k] = c.course[k];
        r.course.name = reverseName(c.course.name);
        r.dist = c.dist.map(function (d) { return T - d; }).reverse();
        r.pois = c.pois.map(function (p) {
            var q = {};
            for (var k2 in p) if (Object.prototype.hasOwnProperty.call(p, k2)) q[k2] = p[k2];
            q.dist_m = T - (+p.dist_m);
            return q;
        }).sort(function (a, b) { return a.dist_m - b.dist_m; });
        r.junctions = (c.junctions || []).map(function (d) { return T - d; }).sort(function (a, b) { return a - b; });
        r.asc = cumAscent(r.ele);
        return r;
    }

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

    /** 진행 거리 d(m)의 위치 · 고도. 누적 거리 배열에서 이분 탐색 후 선형 보간. */
    function at(c, d) {
        var n = c.dist.length;
        if (d <= 0) return { lon: c.lon[0], lat: c.lat[0], ele: c.ele[0] };
        if (d >= c.total) return { lon: c.lon[n - 1], lat: c.lat[n - 1], ele: c.ele[n - 1] };
        var lo = indexAt(c, d), hi = lo + 1;
        var span = c.dist[hi] - c.dist[lo], t = span > 0 ? (d - c.dist[lo]) / span : 0;
        var e0 = c.ele[lo], e1 = c.ele[hi];
        return {
            lon: c.lon[lo] + (c.lon[hi] - c.lon[lo]) * t,
            lat: c.lat[lo] + (c.lat[hi] - c.lat[lo]) * t,
            ele: e0 == null || e1 == null ? null : e0 + (e1 - e0) * t
        };
    }

    /** 경사(%) - d 앞뒤 50m 고도 차. 고도를 모르면 null. */
    function grade(c, d) {
        var a = at(c, Math.max(0, d - 50)), b = at(c, Math.min(c.total, d + 50));
        var run = Math.min(c.total, d + 50) - Math.max(0, d - 50);
        if (a.ele == null || b.ele == null || run < 20) return null;
        return (b.ele - a.ele) / run * 100;
    }

    /** d 부터 끝까지 남은 오르막(m). */
    function ascentLeft(c, d) {
        var i = indexAt(c, d);
        return Math.max(0, c.asc[c.asc.length - 1] - c.asc[i]);
    }

    /** 순수 함수 - 코스 위 d0 → d1 사이에 오른 · 내려간 높이(m). 코스 고도로 셉니다(GPS 고도는 많이 흔들림). */
    function climbBetween(c, d0, d1) {
        var i0 = indexAt(c, Math.min(d0, d1)), i1 = indexAt(c, Math.max(d0, d1));
        var up = c.asc[i1] - c.asc[i0], e0 = c.ele[i0], e1 = c.ele[i1];
        var down = e0 == null || e1 == null ? 0 : Math.max(0, up - (e1 - e0));
        return { up: Math.max(0, up), down: down };
    }

    /**
     * 순수 함수 - 소모 칼로리(kcal) 추정. 몸무게 kg × (평지 거리 + 오른 높이 + 내려간 높이).
     *   걷기 · 등산: 0.7 kcal/kg/km, 오르막 0.0094 kcal/kg/m(몸을 1m 들어 올리는 일 ÷ 효율 25%), 내리막 그 1/3
     *   자전거: 0.25 kcal/kg/km(약 15km/h), 오르막은 같고 내리막은 0
     * 기기 만보계 · 심박 없이 거리 · 높이로만 셈하는 대략값입니다.
     */
    function kcal(kind, kg, distM, upM, downM) {
        var bike = kind === "bike";
        return Math.round(kg * ((bike ? 0.25 : 0.7) * distM / 1000 + 0.0094 * upM + (bike ? 0 : 0.0031) * downM));
    }

    /** 순수 함수 - 걸음 수 추정. 보폭 = 키 × 0.415(등산은 오르내림으로 10% 짧게). 자전거는 null. */
    function steps(kind, cm, distM) {
        if (kind === "bike") return null;
        var stride = cm / 100 * 0.415 * (kind === "walk" ? 1 : 0.9);
        return Math.round(distM / stride);
    }

    /** d 다음의 이름표(출발 자리 것은 빼고). 없으면 null. */
    /**
     * 경로 밖 이름표(들머리 가는 길의 주차장 · 버스 정류장 - routefly-batch 가 들머리 1km 안에서 넣음).
     * 지도에는 보이되 '다음 지점' · 음성 · 그래프 이름 · 비행 자막에는 쓰지 않습니다.
     */
    function isAccess(p) { return +p.off_route_m > 100; }

    function nextPoi(c, d) {
        var best = null;
        c.pois.forEach(function (p) {
            if (isAccess(p)) return;
            var pd = +p.dist_m;
            if (pd > d + 15 && (best == null || pd < +best.dist_m)) best = p;
        });
        return best;
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

    /** 코스 길이에 맞는 km 표시 간격(1 · 2 · 5 · 10 · 20 · 50km) - 표시가 20개 안쪽이 되게. */
    function kmStep(total) {
        var steps = [1000, 2000, 5000, 10000, 20000, 50000];
        for (var i = 0; i < steps.length; i++) if (total / steps[i] <= 20) return steps[i];
        return 100000;
    }

    /** 순수 함수 - 지점 이름으로 아이콘(이름표 종류는 표에 없어 이름 끝말로 봅니다). */
    /**
     * 이름표 그림. Windows 10 글꼴에도 있는 이모지만 씁니다(🪨 · 🛖 · 🛕 처럼 최근 이모지는 빈칸으로 보임).
     * 걷기길 · 자전거길 지명(해수욕장 · 공원 · 역 · 항 · 다리 · 인증센터)도.
     */
    function poiIcon(name) {
        var n = (name || "").replace(/\(.*\)$/, "").trim();
        if (/인증센터/.test(n)) return "🚲";
        if (/(지원센터|안내소|안내센터|분소|매표소|사무소)/.test(name)) return "ℹ️";
        if (/주차장/.test(n)) return "🅿️";
        if (/(정류장|정류소)$/.test(n)) return "🚏";
        if (/케이블카/.test(n)) return "🚡";
        if (/(대피소|산장|쉼터|휴게소)/.test(n)) return "🏠";
        if (/(해수욕장|해변|해안)/.test(n)) return "🏖️";
        if (/(등대|항|포구|선착장|부두)$/.test(n)) return "⚓";
        if (/(역|터미널)$/.test(n)) return "🚉";
        if (/(대교|다리|교)$/.test(n)) return "🌉";
        if (/(공원|수목원|광장)$/.test(n) || /공원/.test(n)) return "🌳";
        if (/시장$/.test(n)) return "🛒";
        if (/(호|저수지|댐|보)$/.test(n)) return "💧";
        if (/폭포/.test(n)) return "💧";
        if (/(굴|동굴)$/.test(n)) return "🕳️";
        if (/(사|암)$/.test(n)) return "🏯";
        if (/(령|재|고개|치|목)$/.test(n)) return "🚩";
        if (/(봉|산|정상|峰)$/.test(n) || /정상/.test(n)) return "⛰️";
        if (/전망대$/.test(n)) return "🔭";
        if (/(대|바위)$/.test(n)) return "🗻";
        return "📍";
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    /** 순수 함수 - 갈림길 d 에서 코스가 꺾는 쪽(앞뒤 40m 방향 차이). "오른쪽 길" · "왼쪽 길" · "직진". */
    function turnWord(c, d) {
        var a = at(c, Math.max(0, d - 40)), m = at(c, d), b = at(c, Math.min(c.total, d + 40));
        var b1 = bearingOf(a.lat, a.lon, m.lat, m.lon), b2 = bearingOf(m.lat, m.lon, b.lat, b.lon);
        var diff = ((b2 - b1 + 540) % 360) - 180;
        if (Math.abs(diff) < 25) return "직진";
        return (Math.abs(diff) < 60 ? "살짝 " : "") + (diff > 0 ? "오른쪽 길" : "왼쪽 길");
    }

    function bearingOf(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
        var x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
        return (Math.atan2(y, x) / r + 360) % 360;
    }

    /**
     * 순수 함수 - 위경도 → UTM-K(EPSG:5179, GRS80 · 중앙경선 127.5° · 원점 38° · 축척 0.9996 · 1,000,000 / 2,000,000).
     * 국가지점번호를 셈하려고 씁니다(WGS84 와 GRS80 차이는 무시해도 되는 수준).
     */
    function utmk(lat, lon) {
        var a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, ep2 = e2 / (1 - e2), k0 = 0.9996;
        var r = Math.PI / 180, phi = lat * r, lam = lon * r, phi0 = 38 * r, lam0 = 127.5 * r;
        function M(p) {
            var e4 = e2 * e2, e6 = e4 * e2;
            return a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * p)
                + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * p) - (35 * e6 / 3072) * Math.sin(6 * p));
        }
        var N = a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi)), T = Math.tan(phi) * Math.tan(phi);
        var C = ep2 * Math.cos(phi) * Math.cos(phi), A = (lam - lam0) * Math.cos(phi);
        var x = 1000000 + k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5) / 120);
        var y = 2000000 + k0 * (M(phi) - M(phi0) + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
            + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6) / 720));
        return { x: x, y: y };
    }

    /**
     * 순수 함수 - 국가지점번호(예: "다사 5371 5148"). 구조대가 쓰는 전국 10m 격자 주소 - 산의 위치표지판에 적힌 번호와 같은 체계.
     * 글자는 100km 칸(가~아), 숫자는 그 안의 동 · 북 거리를 10m 단위로. 범위 밖이면 null.
     */
    function nationalPoint(lat, lon) {
        var p = utmk(lat, lon), L = "가나다라마바사아";
        var ix = Math.floor(p.x / 100000) - 7, iy = Math.floor(p.y / 100000) - 13;
        if (ix < 0 || ix > 7 || iy < 0 || iy > 7) return null;
        var pad = function (v) { v = String(Math.floor(v)); while (v.length < 4) v = "0" + v; return v; };
        return L.charAt(ix) + L.charAt(iy) + " " + pad((p.x % 100000) / 10) + " " + pad((p.y % 100000) / 10);
    }

    /** 순수 함수 - 그날 해 지는 시각(ms, 그 위치 기준). 극지방처럼 해가 안 지면 null. (Almanac for Computers 공식) */
    function sunset(dateMs, lat, lon) {
        var r = Math.PI / 180, d = new Date(dateMs);
        var start = Date.UTC(d.getUTCFullYear(), 0, 0), N = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000);
        var lngHour = lon / 15, t = N + (18 - lngHour) / 24;
        var Mn = 0.9856 * t - 3.289;
        var L = (Mn + 1.916 * Math.sin(Mn * r) + 0.020 * Math.sin(2 * Mn * r) + 282.634 + 360) % 360;
        var RA = (Math.atan(0.91764 * Math.tan(L * r)) / r + 360) % 360;
        RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
        var sinDec = 0.39782 * Math.sin(L * r), cosDec = Math.cos(Math.asin(sinDec));
        var cosH = (Math.cos(90.833 * r) - sinDec * Math.sin(lat * r)) / (cosDec * Math.cos(lat * r));
        if (cosH > 1 || cosH < -1) return null;
        var H = Math.acos(cosH) / r / 15;
        var UT = ((H + RA - 0.06571 * t - 6.622 - lngHour) % 24 + 24) % 24;
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + UT * 3600000;
    }

    /** 종류별 이름 · 표준 빠르기 - 예상 시간에 씁니다. 등산 · 걷기는 오르막 600m/h 를 더합니다(네이스미스). */
    var KINDS = {
        hike: { label: "등산", kmh: 4, climb: 600, icon: "⛰️", act: "산행", sos: "등산 중", simKmh: 3.5, svg: "hiker" },
        walk: { label: "걷기", kmh: 4, climb: 600, icon: "🚶", act: "걷기", sos: "걷기 중", simKmh: 4, svg: "walker" },
        bike: { label: "자전거", kmh: 15, climb: 0, icon: "🚴", act: "라이딩", sos: "자전거 타던 중", simKmh: 15, svg: "cyclist" }
    };

    /** 종류별 사람 그림(흰색, 24×24) - 비행 화면의 현재 위치 배지. 등산은 스틱 든 등산객, 걷기는 걷는 사람, 자전거는 자전거 탄 사람. */
    var PERSON = {
        hiker: '<g fill="#fff"><circle cx="13" cy="4" r="2.2"/>'
            + '<path d="M11.2 7.6l-2.6 1.6-1 4 1.6.4.8-3 1.2-.6-1 5.2-2.4 5.6 1.8.8 2.4-5.4 1.8 2v5h1.9v-5.8l-2.2-2.6.6-3 1 1.6 2.6.6.4-1.7-2-.5-1.6-2.8c-.5-.8-1.5-1.2-2.4-.9z"/>'
            + '<path d="M18.6 9.2l-1 .2 1.2 13.4h.9z"/></g>',
        walker: '<g fill="#fff"><circle cx="13" cy="4" r="2.2"/>'
            + '<path d="M11.2 7.6l-2.6 1.6-1 4 1.6.4.8-3 1.2-.6-1 5.2-2.4 5.6 1.8.8 2.4-5.4 1.8 2v5h1.9v-5.8l-2.2-2.6.6-3 1 1.6 2.6.6.4-1.7-2-.5-1.6-2.8c-.5-.8-1.5-1.2-2.4-.9z"/></g>',
        cyclist: '<g fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
            + '<circle cx="5.5" cy="17" r="3.6"/><circle cx="18.5" cy="17" r="3.6"/>'
            + '<path d="M5.5 17l4-7h6l3 7M9.5 10l3.5 7h-7.5M15.5 10l-1-2.5h-2"/>'
            + '<path d="M12.5 13.5l-2.3-4.2 3.6-2.2 2.4 3.3h2.3" stroke-width="2"/></g>'
            + '<circle cx="16.2" cy="4" r="2.1" fill="#fff"/>'
    };
    function personSvg(kind, size) {
        var s = size || 18;
        return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true">' + PERSON[kindOf(kind).svg] + '</svg>';
    }
    function kindOf(k) { return KINDS[k] || KINDS.hike; }

    /** 순수 함수 - 표준 소요 시간(ms). */
    function standardMs(kind, distM, ascM) {
        var k = kindOf(kind);
        return (distM / 1000 / k.kmh + (k.climb ? ascM / k.climb : 0)) * 3600000;
    }

    // ------------------------------------------------------------------ ① 고도 그래프

    var PW = 1000, PH = 100;

    /**
     * box 안에 고도 그래프를 그립니다. 지나온 부분은 하늘색, 지점은 빨간 점 + 비스듬한 이름, 아래에 km 눈금.
     * 돌려주는 값: {set(d)} - 지금 위치를 옮깁니다. opts.onSeek(d) 가 있으면 누른 자리로.
     */
    /**
     * 그래프 이름표의 기울어진 글자 상자(네 모서리, 화면 px). CSS 와 같게: 보통은 왼쪽 아래를 축으로 -38°,
     * 끝 이름(.end)은 오른쪽 아래를 축으로 +38°, 둘 다 translate(±2px, -8px).
     */
    function labelRect(x, yTop, w, h, end) {
        var cs = Math.cos(38 * Math.PI / 180), sn = Math.sin(38 * Math.PI / 180);
        var ax = end ? x - 2 : x + 2, ay = yTop + h - 8;
        var u = end ? [-cs, -sn] : [cs, -sn], v = end ? [sn, -cs] : [-sn, -cs];
        var pad = 2;   // 글자 그림자만큼
        ax -= u[0] * pad; ay -= u[1] * pad;
        w += pad * 2;
        return [[ax, ay], [ax + u[0] * w, ay + u[1] * w], [ax + u[0] * w + v[0] * h, ay + u[1] * w + v[1] * h], [ax + v[0] * h, ay + v[1] * h]];
    }

    /** 순수 함수 - 볼록 사각형 둘이 겹치는가(분리축). */
    function rectsOverlap(a, b) {
        var axes = [a, b].reduce(function (acc, r) {
            for (var i = 0; i < 2; i++) acc.push([r[i + 1][1] - r[i][1], r[i][0] - r[i + 1][0]]);
            return acc;
        }, []);
        return axes.every(function (ax) {
            var pa = a.map(function (p) { return p[0] * ax[0] + p[1] * ax[1]; }), pb = b.map(function (p) { return p[0] * ax[0] + p[1] * ax[1]; });
            return Math.max.apply(null, pa) > Math.min.apply(null, pb) && Math.max.apply(null, pb) > Math.min.apply(null, pa);
        });
    }

    function profile(box, c, opts) {
        opts = opts || {};
        box.textContent = "";
        box.classList.add("rf-profile");
        var eles = c.ele.filter(function (e) { return e != null; });
        if (eles.length < 2) {
            box.appendChild(el("div", "rf-cap rf-empty", "고도 자료가 없는 코스입니다 - 거리만 표시합니다."));
            return { set: function () {} };
        }
        var min = Math.min.apply(null, eles), max = Math.max.apply(null, eles);
        var pad = Math.max((max - min) * 0.12, 5);
        var lo = min - pad, hi = max + pad * (opts.labels === false ? 1 : 3.2);   // 위쪽은 지점 이름 자리
        function y(e) { return (1 - (e - lo) / (hi - lo)) * PH; }
        var pts = [];
        for (var i = 0; i < c.dist.length; i++) {
            if (c.ele[i] == null) continue;
            pts.push((c.dist[i] / c.total * PW).toFixed(1) + "," + y(c.ele[i]).toFixed(1));
        }
        var uid = "rf" + Math.random().toString(36).slice(2, 8);
        var svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 " + PW + " " + PH);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.innerHTML =
            '<defs><linearGradient id="' + uid + 'g" x1="0" y1="0" x2="0" y2="1">'
            + '<stop offset="0" stop-color="' + LINE_COLOR + '" stop-opacity="0.55"/>'
            + '<stop offset="1" stop-color="' + LINE_COLOR + '" stop-opacity="0.06"/></linearGradient>'
            + '<clipPath id="' + uid + 'c"><rect class="done" x="0" y="0" width="0" height="' + PH + '"/></clipPath></defs>'
            + '<polygon points="0,' + PH + ' ' + pts.join(" ") + ' ' + PW + ',' + PH + '" fill="rgba(255,255,255,0.10)"/>'
            + '<polyline points="' + pts.join(" ") + '" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
            + '<g clip-path="url(#' + uid + 'c)"><polygon points="0,' + PH + ' ' + pts.join(" ") + ' ' + PW + ',' + PH + '" fill="url(#' + uid + 'g)"/>'
            + '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + LINE_COLOR + '" stroke-width="2.5" vector-effect="non-scaling-stroke"/></g>'
            + '<line class="cursor" x1="0" x2="0" y1="0" y2="' + PH + '" stroke="rgba(255,255,255,0.8)" stroke-width="1" vector-effect="non-scaling-stroke"/>';
        box.appendChild(svg);

        // km 눈금(아래)
        var step = kmStep(c.total), bw = box.clientWidth || 300;
        for (var m = step; m < c.total - Math.max(step * 0.3, c.total * 0.07) && (c.total - m) / c.total * bw > 64; m += step) {   // 끝의 총 거리(10.45km)와 겹치지 않게
            var t = el("div", "rf-tick", String(Math.round(m / 1000)));
            t.style.left = (m / c.total * 100) + "%";
            box.appendChild(t);
        }
        // 지점 - 빨간 점 + 비스듬한 이름(영상처럼). 이름끼리 실제로 겹치면(기울어진 글자 상자로 셈) 뒤의 것을 뺍니다.
        // 오르막이 이어지면 다음 이름이 앞 이름 위로 올라가 겹치므로 가로 간격만으로는 모자랍니다(지리산 그래프).
        if (opts.labels !== false) {
            var bw = box.clientWidth, bh = box.clientHeight, placed = [], lastX = -1;
            var list = c.pois.filter(function (p) { return !isAccess(p); }).map(function (p) {
                var pd = Math.max(0, Math.min(c.total, +p.dist_m));
                return { p: p, d: pd, a: at(c, pd) };
            }).filter(function (q) { return q.a.ele != null; });
            list.forEach(function (q) {
                var dot = el("div", "rf-pdot");
                dot.style.left = (q.d / c.total * 100) + "%";
                dot.style.top = (y(q.a.ele) / PH * 100) + "%";
                box.appendChild(dot);
            });
            // 이름을 놓는 차례: 출발 · 도착 → 가장 높은 곳 → 나머지는 거리 순
            var top = list.reduce(function (m, q) { return m == null || q.a.ele > m.a.ele ? q : m; }, null);
            var rank = function (q) { return q.d < 60 || q.d > c.total - 60 ? 0 : q === top ? 1 : 2; };
            list.slice().sort(function (u, v) { return rank(u) - rank(v) || u.d - v.d; }).forEach(function (q) {
                var xp = q.d / c.total * 100;
                if (!bw && lastX >= 0 && Math.abs(xp - lastX) < 6) return;   // 크기를 모를 때(숨은 화면)는 예전처럼 간격으로
                var nm = q.p.name.replace(/\(.*\)$/, "").trim() || q.p.name;
                if (nm.length > 9) nm = nm.slice(0, 8) + "…";   // 비스듬한 이름이 길면 그래프 위 칸까지 올라감(전체 이름은 지도 · '다음' 줄에)
                var lb = el("div", "rf-plabel", nm);
                lb.title = q.p.name;
                var end = xp > 72;   // 오른쪽 끝 이름은 왼쪽 위로 기울여 잘리지 않게
                if (end) {
                    lb.classList.add("end");
                    lb.style.right = (100 - xp) + "%";
                } else {
                    lb.style.left = xp + "%";
                }
                lb.style.top = (y(q.a.ele) / PH * 100) + "%";
                box.appendChild(lb);
                if (bw) {
                    var r = labelRect(xp / 100 * bw, y(q.a.ele) / PH * bh, lb.offsetWidth, lb.offsetHeight, end);
                    if (placed.some(function (o) { return rectsOverlap(o, r); })) { box.removeChild(lb); return; }
                    placed.push(r);
                }
                lastX = xp;
            });
        }
        var capMax = el("div", "rf-cap", "최고 " + num(max) + "m"); capMax.style.cssText = "left:3px;top:0"; box.appendChild(capMax);
        var capTot = el("div", "rf-cap", km(c.total) + "km"); capTot.style.cssText = "right:3px;bottom:1px"; box.appendChild(capTot);
        var me = el("div", "rf-me");
        box.appendChild(me);

        var cursor = svg.querySelector(".cursor"), done = svg.querySelector(".done");
        if (opts.onSeek) {
            box.style.cursor = "pointer";
            box.onclick = function (ev) {
                var r = box.getBoundingClientRect();
                opts.onSeek(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * c.total);
            };
        }
        return {
            set: function (d) {
                var x = d / c.total * PW;
                cursor.setAttribute("x1", x.toFixed(1));
                cursor.setAttribute("x2", x.toFixed(1));
                done.setAttribute("width", x.toFixed(1));
                var p = at(c, d);
                me.style.left = (d / c.total * 100) + "%";
                me.style.top = p.ele == null ? "50%" : (y(p.ele) / PH * 100) + "%";
            }
        };
    }

    // ------------------------------------------------------------------ ③ 작은 평면 지도

    /**
     * box 안에 북쪽이 위인 평면 지도(SVG). 코스 선 · km 번호(동그라미) · 지점(빨간 점) · 출/도 · 지금 위치.
     * 돌려주는 값: {set(d)}.
     */
    function miniMap(box, c) {
        box.textContent = "";
        box.classList.add("rf-mini");
        var lat0 = c.lat.reduce(function (a, b) { return a + b; }, 0) / c.lat.length;
        var kx = Math.cos(lat0 * Math.PI / 180);
        var xs = c.lon.map(function (v) { return v * kx; }), ys = c.lat.map(function (v) { return -v; });
        var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
        var w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6), S = 100 / Math.max(w, h);
        function X(lon) { return (lon * kx - minX) * S + (100 - w * S) / 2; }
        function Y(lat) { return (-lat - minY) * S + (100 - h * S) / 2; }
        var d = c.lon.map(function (lon, i) { return (i ? "L" : "M") + X(lon).toFixed(2) + " " + Y(c.lat[i]).toFixed(2); }).join("");
        var svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "-12 -12 124 124");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        var html = '<path d="' + d + '" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/>'
            + '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
            + '<path class="done" d="' + d + '" pathLength="1000" fill="none" stroke="' + LINE_COLOR + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="0 1000"/>';
        var step = kmStep(c.total);
        for (var m = step; m < c.total - step * 0.3; m += step) {
            var p = at(c, m);
            html += '<g transform="translate(' + X(p.lon).toFixed(2) + ' ' + Y(p.lat).toFixed(2) + ')"><circle r="4.6" fill="rgba(0,0,0,0.6)" stroke="#fff" stroke-width="0.9"/>'
                + '<text y="1.9" text-anchor="middle" font-size="5.4" font-weight="bold" fill="#fff">' + Math.round(m / 1000) + '</text></g>';
        }
        c.pois.forEach(function (q) {
            html += '<circle cx="' + X(+q.lon).toFixed(2) + '" cy="' + Y(+q.lat).toFixed(2) + '" r="1.8" fill="#ff4d4f" stroke="#fff" stroke-width="0.6"/>';
        });
        var n = c.lon.length - 1;
        html += '<text x="' + X(c.lon[0]).toFixed(2) + '" y="' + (Y(c.lat[0]) + 9).toFixed(2) + '" text-anchor="middle" font-size="6" font-weight="bold" fill="#fff" stroke="#000" stroke-width="0.4" paint-order="stroke">출</text>'
            + '<text x="' + X(c.lon[n]).toFixed(2) + '" y="' + (Y(c.lat[n]) - 5).toFixed(2) + '" text-anchor="middle" font-size="6" font-weight="bold" fill="#fff" stroke="#000" stroke-width="0.4" paint-order="stroke">도</text>'
            + '<g transform="translate(106 -4)"><path d="M0 -6 L3 2 L0 0.5 L-3 2 Z" fill="#ff4d4f" stroke="#fff" stroke-width="0.5"/>'
            + '<text y="9" text-anchor="middle" font-size="5.5" font-weight="bold" fill="#fff">N</text></g>'
            + '<circle class="me" r="3.4" cx="-50" cy="-50" fill="' + LINE_COLOR + '" stroke="#fff" stroke-width="1.2"/>';
        svg.innerHTML = html;
        box.appendChild(svg);
        var done = svg.querySelector(".done"), me = svg.querySelector(".me");
        return {
            set: function (dd) {
                var f = Math.max(0, Math.min(1, dd / c.total)) * 1000;
                done.setAttribute("stroke-dasharray", f.toFixed(1) + " 1000");
                var p = at(c, dd);
                me.setAttribute("cx", X(p.lon).toFixed(2));
                me.setAttribute("cy", Y(p.lat).toFixed(2));
            }
        };
    }

    global.RF = {
        LINE_COLOR: LINE_COLOR, num: num, km: km, fromApi: fromApi, isAccess: isAccess, reverseCourse: reverseCourse, reverseName: reverseName, cleanName: cleanName, dedupePois: dedupePois, at: at, grade: grade, ascentLeft: ascentLeft,
        nextPoi: nextPoi, snap: snap, turnWord: turnWord, bearingOf: bearingOf, utmk: utmk, nationalPoint: nationalPoint,
        sunset: sunset, KINDS: KINDS, kindOf: kindOf, personSvg: personSvg, groupPois: groupPois, declutter: declutter, climbBetween: climbBetween, kcal: kcal, steps: steps, standardMs: standardMs, distM: distM, JUNCTION: JUNCTION, kmStep: kmStep, poiIcon: poiIcon, profile: profile, miniMap: miniMap
    };
})(window);
