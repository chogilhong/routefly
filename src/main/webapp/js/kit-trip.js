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

    var LINE_COLOR = "#38d9ea";
    var NS = "http://www.w3.org/2000/svg";

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
    /** 순수 함수 - 따라가기 화면 말: 주소 ?lang=en · ?lang=ko 가 먼저(stored 는 기억해 둔 말), 없으면 stored, 없으면 "ko". */
    function pageLang(search, stored) {
        var m = /[?&]lang=(en|ko)\b/.exec(search || "");
        return m ? m[1] : stored === "en" ? "en" : "ko";
    }
    /**
     * 화면의 data-en 글을 영어로(hike.html): data-en 은 안의 HTML(우리가 쓴 글만 - 바깥 자료 아님), data-en-title · -placeholder · -aria-label · -alt · -href(영어판 문서로, 2026-10-29) 는 그 속성.
     */
    function applyEn(root) {
        Array.prototype.forEach.call(root.querySelectorAll("[data-en]"), function (el) { el.innerHTML = el.getAttribute("data-en"); });
        ["title", "placeholder", "aria-label", "alt", "href"].forEach(function (a) {
            Array.prototype.forEach.call(root.querySelectorAll("[data-en-" + a + "]"), function (el) { el.setAttribute(a, el.getAttribute("data-en-" + a)); });
        });
    }

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

    /** 국립공원 이름(서버 ParkServlet.PARKS 와 같은 차례). */
    var PARKS = ["지리산", "경주", "계룡산", "한려해상", "설악산", "속리산", "한라산", "내장산", "가야산", "덕유산", "오대산", "주왕산",
        "태안해안", "다도해해상", "북한산", "치악산", "월악산", "소백산", "월출산", "변산반도", "무등산", "태백산", "팔공산"];

    /**
     * 안내도(탐방 안내도 park.html · 노선 안내도 route.html) 바탕 지도 - V-World 지도(위성은 숨겨 둠) + 지형 음영, 키가 없으면 음영만.
     * c: {demUrl, vworldKey} (/api/map-config).
     */
    function baseStyle(c) {
        // V-World 지도 위 옅은 음영만이라 지형은 z12 까지(더 가까이는 늘려 씀 - 2026-11-02 홍TV님 점검: z15 까지 받던 타일). 키가 없어 음영이 바탕 전부면 z15
        var dem = { type: "raster-dem", tiles: [c.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: c.vworldKey ? 12 : 15, attribution: tr("지형: ", "Terrain: ") + "Terrain Tiles (AWS Open Data)" };
        var sources = { hillshade: dem }, layers = [{ id: "bg", type: "background", paint: { "background-color": c.vworldKey ? "#1b2430" : "#dcd6c6" } }];
        if (c.vworldKey) {
            var key = encodeURIComponent(c.vworldKey);
            sources.sat = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, attribution: tr("위성사진: 국토교통부 V-World", "Satellite: V-World (Korea MOLIT)"),
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/{z}/{y}/{x}.jpeg"] };
            sources.base = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, attribution: tr("지도: 국토교통부 V-World", "Map: V-World (Korea MOLIT)"),
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Base/{z}/{y}/{x}.png"] };
            layers.push({ id: "sat", type: "raster", source: "sat", layout: { visibility: "none" } });
            layers.push({ id: "base", type: "raster", source: "base" });
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", minzoom: 9, paint: { "hillshade-exaggeration": 0.3 } });
        } else {
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade",
                paint: { "hillshade-exaggeration": 0.65, "hillshade-shadow-color": "#3d4a3a", "hillshade-highlight-color": "#fbf7ea" } });
        }
        return { version: 8, sources: sources, layers: layers };
    }

    /** 구간 색(탐방 안내도처럼 구간마다 다른 색 - 바탕의 초록 · 갈색 · 파랑 물과 헷갈리지 않는 진한 색). */
    var SEG_COLORS = ["#e8590c", "#5b45ff", "#d6336c", "#1c7ed6", "#9c36b5", "#f59f00", "#0b7285", "#c92a2a"];

    /**
     * 순수 함수 - 기록 선을 지나간 쉼터 · 정상에서 끊어 구간마다 다른 색으로(2026-11-23 홍TV님 "안내도처럼 코스를 전부 다른 색으로").
     * c = recordCourse, stops = [{lat, lon}](공단 대피소 · 100대 명산 정상), 선에서 maxM 안인 것만 끊는 곳으로, 끊는 곳끼리 minGapM 보다 가까우면 하나로.
     * 돌려줌 GeoJSON 선 목록 - properties: color, seg(차례), from · to(구간 처음 · 끝 이름 - 끊은 곳 이름, 기록 처음 · 끝은 null),
     * d(구간 처음까지 거리), m(거리), ms(걸린 시간 - 시각이 없으면 null), up · down(오르막 · 내리막 m - cumAscent 와 같은 셈, 높이가 없으면 null).
     * 끊을 곳이 없으면 선 하나(첫 색). 2026-11-23 홍TV님 "구간마다 거리 · 시간 · 구간 목록"
     */
    function trackSegments(c, stops, maxM, minGapM) {
        var n = c.lat.length, cuts = [];
        (stops || []).forEach(function (s) {
            var q = snap(c, s.lat, s.lon);
            if (q && q.off <= maxM && q.d > minGapM && q.d < c.total - minGapM) cuts.push({ d: q.d, name: s.name || null });
        });
        cuts.sort(function (a, b) { return a.d - b.d; });
        var at0 = [0], names = [null], asc = c.asc || cumAscent(c.ele);
        cuts.forEach(function (q) {
            if (q.d - c.dist[at0[at0.length - 1]] < minGapM) return;
            var i = indexAt(c, q.d) + 1;
            if (i > at0[at0.length - 1] && i < n - 1) { at0.push(i); names.push(q.name); }
        });
        at0.push(n - 1); names.push(null);
        var out = [];
        for (var k = 0; k + 1 < at0.length; k++) {
            var a = at0[k], b = at0[k + 1], co = [];
            for (var i = a; i <= b; i++) co.push([c.lon[i], c.lat[i]]);   // 끝점을 다음 구간과 함께 써서 이어짐
            if (co.length < 2) continue;
            var up = asc[b] != null && asc[a] != null ? Math.round(asc[b] - asc[a]) : null;
            var net = c.ele[a] != null && c.ele[b] != null ? c.ele[b] - c.ele[a] : null;
            out.push({ type: "Feature", geometry: { type: "LineString", coordinates: co }, properties: {
                color: SEG_COLORS[k % SEG_COLORS.length], seg: k, from: names[k], to: names[k + 1], d: Math.round(c.dist[a]), m: Math.round(c.dist[b] - c.dist[a]),
                ms: c.time && c.time[a] != null && c.time[b] != null && c.time[b] >= c.time[a] ? c.time[b] - c.time[a] : null,
                up: up, down: up != null && net != null ? Math.max(0, Math.round(up - net)) : null } });
        }
        return { type: "FeatureCollection", features: out };
    }

    /**
     * 순수 함수 - 기록 선에서 maxM 안에 있는 곳(stops [{lat, lon, …}])을 기록 위 거리 차례로 [{s: 그곳, d: 출발부터 m}](2026-11-23 홍TV님 "대피소 사진을
     * 사용자가 찍은 사진과 위치로 비교해서 위치 선정" - 사진 카드 사이에 끼울 자리).
     */
    function stopsAlong(c, stops, maxM) {
        var out = [];
        (stops || []).forEach(function (s) {
            if (!s || typeof s.lat !== "number" || typeof s.lon !== "number") return;
            var q = snap(c, s.lat, s.lon);
            if (q && q.off <= maxM) out.push({ s: s, d: Math.round(q.d) });
        });
        return out.sort(function (a, b) { return a.d - b.d; });
    }

    /**
     * 순수 함수 - 기록이 어느 국립공원 안인가(2026-11-23 홍TV님 "지리산 안내도 코스들을 그려줘"): cands [{park, lat, lon}](공단 대피소의 공원 ·
     * 국립공원 이름과 같은 100대 명산 정상) 가운데 기록 선에서 maxM 안에 든 첫 공원 이름(PARKS 에 있는 것만), 없으면 null. 폰 안에서만 셈 - 서버로는 공원 이름만.
     */
    function recordPark(c, cands, maxM) {
        for (var i = 0; i < (cands || []).length; i++) {
            var p = cands[i];
            if (!p || PARKS.indexOf(p.park) < 0 || typeof p.lat !== "number" || typeof p.lon !== "number") continue;
            var q = snap(c, p.lat, p.lon);
            if (q && q.off <= maxM) return p.park;
        }
        return null;
    }

    /** 순수 함수 - 구간 한 줄 글 "4.24 km · 1시간 45분 · ↑520 ↓120 m"(없는 값 · 0 은 뺌). p = trackSegments 의 properties. */
    function segText(p) {
        // 걸린 시간은 "32분" · "4시간 19분"(2026-11-23 홍TV님 "0:32 는 뭐야?" - 시:분이 헷갈림)
        var mins = p.ms != null ? Math.round(p.ms / 60000) : null;
        var t = mins == null ? null : mins < 60 ? mins + tr("분", "m") : Math.floor(mins / 60) + tr("시간", "h") + (mins % 60 ? " " + mins % 60 + tr("분", "m") : "");
        var ud = [p.up ? "↑" + num(p.up) : null, p.down ? "↓" + num(p.down) : null].filter(Boolean).join(" ");   // 0 · 모름은 뺌
        ud = ud ? ud + " m" : null;
        return [km(p.m) + " km", t, ud].filter(Boolean).join(" · ");
    }

    /** 공단 대피소 · 한라산 대피소 · 100대 명산 정상 자료(famousMarks 의 바탕)를 한 번에 받음 - {gj, peaks, elev, shelters}, 하나라도 못 받으면 그 칸은 빈 것. */
    function famousFetch() {
        var j = function (u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }); };
        // 한라산 대피소(data/halla-shelters.json - 제주도 관리라 공단 자료에 없음, 2026-11-23 홍TV님 "한라산은 별도로")는 지도 표시(gj)에만 - shelters(국립공원 찾기 후보)는 공단 것만
        return Promise.all([j("data/mountains100.json"), j("data/peak-elev.json"), j("data/knps-shelters.json"), j("data/halla-shelters.json")]).then(function (d) {
            var peaks = (d[0] && d[0].peaks) || [], elev = (d[1] && d[1].elev) || {}, shelters = (d[2] && d[2].shelters) || [], halla = (d[3] && d[3].shelters) || [];
            return { gj: famousMarks(peaks, elev, shelters.concat(halla)), peaks: peaks, elev: elev, shelters: shelters };
        });
    }

    /**
     * 순수 함수 - 멀리 봐도 늘 보일 표시(2026-11-22 홍TV님 "대피소는 처음부터 나오게 · 천왕봉 등 유명 봉우리 포함"): 국립공원 대피소(knps-shelters.json, 공단 공공데이터)와
     * 100대 명산 정상(mountains100.json 의 정상 자리 + peak-elev.json 공식 높이 - GPS 높이 height 는 쓰지 않음). 돌려줌 GeoJSON {features: [{properties: {kind: "hut" | "peak", name, label}}]}.
     */
    function famousMarks(peaks, elev, shelters) {
        var f = [];
        (shelters || []).forEach(function (s) {
            if (typeof s.lat === "number" && typeof s.lon === "number" && s.name) f.push({ type: "Feature", properties: { kind: "hut", name: s.name, label: s.name }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } });
        });
        (peaks || []).forEach(function (p) {
            if (typeof p.lat !== "number" || typeof p.lon !== "number") return;
            var nm = p.summit || p.name, h = elev && elev[p.id];
            f.push({ type: "Feature", properties: { kind: "peak", name: nm, label: "▲ " + nm + (typeof h === "number" ? "\n" + h + "m" : "") }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } });
        });
        return { type: "FeatureCollection", features: f };
    }

    /**
     * 순수 함수 - "내 기록" 하나(rec.track: [[위도, 경도, 시각, 고도|null], …], rec.notes) → 고도 그래프 · 지도에 그릴 코스 모양.
     * 점은 10m 보다 가까우면 솎고(끝점은 남김), 사진 · 메모는 가장 가까운 기록 점의 거리에 이름표로 둡니다.
     */
    /**
     * 순수 함수 - 기록 점에서 GPS 튐 빼기(2026-10-28 PC: 10-23 지리산 기록 카드에 긴 직선 왕복 - 튐 걸러내기 전에 저장된 옛 기록).
     * 앞 점에서 걸어서 못 가는 빠르기(걷기 10 · 자전거 25 m/s)로 100m 넘게 나갔다가 다시 앞 점 둘레로 돌아온 점(5개까지 이어진 것도)은 버림 - onFix 규칙과 같은 생각.
     * track: [[위도, 경도, ms, 고도], …].
     */
    function cleanTrack(tr, bike) {
        var lim = bike ? 25 : 10, out = [], i = 0;
        tr = tr || [];
        // 첫 점이 튐(폰이 옛 위치 · 기지국 위치를 먼저 줌, 2026-10-28 버그 점검) - 첫 점은 앞 점이 없어 아래에서 못 거름
        if (tr.length >= 3) {
            var d01 = distM(tr[0][0], tr[0][1], tr[1][0], tr[1][1]), d12 = distM(tr[1][0], tr[1][1], tr[2][0], tr[2][1]);
            if (d01 > 100 && d12 < d01 * 0.5 && d01 / Math.max(1, (tr[1][2] - tr[0][2]) / 1000) > lim) i = 1;
        }
        while (i < tr.length) {
            var a = out[out.length - 1], skip = 0;
            if (a) for (var k = 1; k <= 5 && i + k < tr.length; k++) {
                var f = tr[i], l = tr[i + k - 1], b = tr[i + k];
                var dOut = distM(a[0], a[1], f[0], f[1]), dBack = distM(l[0], l[1], b[0], b[1]), dAB = distM(a[0], a[1], b[0], b[1]);
                var vOut = dOut / Math.max(1, (f[2] - a[2]) / 1000), vBack = dBack / Math.max(1, (b[2] - l[2]) / 1000);
                if (dOut > 100 && dBack > 100 && dAB < Math.min(dOut, dBack) * 0.5 && (vOut > lim || vBack > lim)) { skip = k; break; }
            }
            if (skip) { i += skip; continue; }
            out.push(tr[i]);
            i++;
        }
        return out;
    }

    /**
     * 위치가 끊긴 구간(크롬 화면 꺼짐 등) - 이만큼 넘게 벌어지면 카드 · 지도에서 점선.
     * 2026-11-15 홍TV님 덕기봉 앱 기록(화면 끔): 6분 공백 뒤 218m 앞 한 점이 300m 가 안 돼 숲을 가로지르는 실선 → 100m. 쉬느라 서 있던 공백은 거의 안 움직여 실선 그대로.
     */
    var GAP_MS = 60000, GAP_M = 100;

    function recordCourse(rec) {
        var c = { id: "rec", course: { name: rec.name, kind: rec.kind }, lon: [], lat: [], ele: [], dist: [], time: [], gap: [], markers: [], pois: [], junctions: [] };
        var tr = cleanTrack(rec.track, rec.kind === "bike"), last = null, d = 0;
        tr.forEach(function (p, i) {
            var step = last ? distM(last[0], last[1], p[0], p[1]) : 0;
            if (last && step < GPX_SPACING_M && i < tr.length - 1) return;
            d += step;
            c.lat.push(+p[0]); c.lon.push(+p[1]); c.ele.push(p[3] == null ? null : +p[3]); c.dist.push(d);
            c.time.push(typeof p[2] === "number" ? p[2] : null);   // 속도 그래프(speedProfile)
            c.gap.push(!!(last && step > GAP_M && p[2] - last[2] > GAP_MS));   // 앞 점에서 여기까지가 끊긴 구간
            last = p;
        });
        c.total = d;
        c.asc = cumAscent(c.ele);
        (rec.notes || []).forEach(function (n) {
            var best = 0, bd = Infinity;
            for (var i = 0; i < c.lat.length; i++) {
                var x = distM(n.lat, n.lon, c.lat[i], c.lon[i]);
                if (x < bd) { bd = x; best = i; }
            }
            var nm = n.text ? n.text.replace(/\s+/g, " ").slice(0, 20) : "사진";
            c.pois.push({ name: (n.photo ? "📷 " : "📝 ") + nm, lat: n.lat, lon: n.lon, ele_m: n.ele, dist_m: c.dist[best] || 0, off_route_m: 0 });
        });
        return c;
    }

    /**
     * 순수 함수 - 기록 → 사진 · 메모까지 든 GPX 1.1(2026-11-22 홍TV님 "GPX 파일 저장 - 사진, 메모 등 모든 정보를 저장해서 공유", 램블러 화면처럼 보이게).
     * 다른 앱은 선(trk) · 지점(wpt 이름 · 메모 · 시각)만 읽고, routefly 는 &lt;extensions&gt; 의 rf:photo(JPEG base64) · rf:record(요약)까지 읽어 내 기록으로 넣음(gpxRecord).
     * photos - {사진 열쇠: base64(앞의 data: 없이)}, 없는 사진은 빼고 메모만.
     */
    var RF_GPX_NS = "https://routefly.kr/gpx/1";
    function recordGpx(rec, photos) {
        var esc = function (x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
        var iso = function (t) { return new Date(t).toISOString(); };
        var tr = (rec.track || []).map(function (p) {
            return '<trkpt lat="' + p[0] + '" lon="' + p[1] + '">' + (p[3] != null ? "<ele>" + p[3] + "</ele>" : "") + (typeof p[2] === "number" ? "<time>" + iso(p[2]) + "</time>" : "") + "</trkpt>";
        }).join("\n");
        var wpts = (rec.notes || []).filter(function (n) { return n && isFinite(n.lat) && isFinite(n.lon); }).map(function (n) {
            var b64 = n.photo && photos && photos[n.photo], nm = n.text ? n.text.replace(/\s+/g, " ").slice(0, 30) : "사진";
            return '<wpt lat="' + n.lat + '" lon="' + n.lon + '">' + (n.ele != null ? "<ele>" + n.ele + "</ele>" : "") + (n.t ? "<time>" + iso(n.t) + "</time>" : "")
                + "<name>" + esc(nm) + "</name>" + (n.text ? "<desc>" + esc(n.text) + "</desc>" : "") + (n.photo ? "<type>photo</type>" : "")
                + (b64 ? "<extensions><rf:photo>" + String(b64).replace(/[^A-Za-z0-9+/=]/g, "") + "</rf:photo></extensions>" : "") + "</wpt>";
        }).join("\n");
        var sum = { kind: rec.kind || "hike", start: rec.start, end: rec.end, up: rec.up != null ? rec.up : null, kcal: rec.kcal != null ? rec.kcal : null, steps: rec.steps != null ? rec.steps : null, courseId: rec.courseId || null };
        return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="routefly" xmlns="http://www.topografix.com/GPX/1/1" xmlns:rf="' + RF_GPX_NS + '">\n'
            + "<metadata><name>" + esc(rec.name || "") + "</name>" + (rec.start ? "<time>" + iso(rec.start) + "</time>" : "")
            + "<extensions><rf:record>" + esc(JSON.stringify(sum)) + "</rf:record></extensions></metadata>\n"
            + (wpts ? wpts + "\n" : "")
            + "<trk><name>" + esc(rec.name || "") + "</name><type>" + esc(rec.kind || "hike") + "</type><trkseg>\n" + tr + "\n</trkseg></trk>\n</gpx>\n";
    }

    /**
     * 순수 함수 - GPX 글 → 내 기록 하나(시각이 든 trkpt 가 2개 넘을 때만 - 걸은 기록, 코스 파일은 null). recordGpx 로 만든 것은 요약 · 사진까지.
     * 돌려줌 {rec: {name, kind, start, end, up, kcal, steps, courseId, track:[[위도, 경도, ms, 높이]], notes:[{t, lat, lon, ele, text, photo}]}, photos: {열쇠: base64}}.
     * 사진 열쇠는 사진 글의 지문으로 새로 만듦(같은 파일을 두 번 넣어도 같은 열쇠).
     * any - 기록 보기(trip.html)처럼 시각 없는 코스 GPX 도 받음(2026-11-22 홍TV님 "왜 안 열리지?"): 점 시각 null, 경로(rtept)도, 이름만 있는 지점은 그 이름을 메모로.
     * file - 파일 이름. GPX 안에 이름이 없으면(트랭글 등 - metadata · trk 에 name 없음) 이것에서 .gpx 를 뗀 것을 이름으로(2026-11-22 PC: 제목이 "GPX" 로만 보였음).
     */
    function gpxRecord(text, any, file) {
        text = String(text || "");
        var un = function (x) { return String(x).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&"); };
        var tag = function (body, t) { var m = new RegExp("<" + t + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + t + ">").exec(body); return m ? m[1].trim() : null; };
        var attr = function (head, a) { var m = new RegExp("\\b" + a + "\\s*=\\s*[\"']([^\"']+)[\"']").exec(head); return m ? +m[1] : NaN; };
        var track = [], re = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g, m;
        if (any && !/<trkpt\b/.test(text)) re = /<rtept\b([^>]*?)(?:\/>|>([\s\S]*?)<\/rtept>)/g;   // 경로(rte)만 있는 코스 파일
        while ((m = re.exec(text))) {
            var lat = attr(m[1], "lat"), lon = attr(m[1], "lon"), body = m[2] || "", tm = tag(body, "time"), el = tag(body, "ele"), t = tm ? Date.parse(tm) : NaN;
            if (!isFinite(lat) || !isFinite(lon) || (!isFinite(t) && !any)) continue;
            track.push([lat, lon, isFinite(t) ? t : null, el != null && isFinite(+el) ? +el : null]);
        }
        if (track.length < 2) return null;
        var timed = track.filter(function (p) { return p[2] != null; });
        if (timed.length === track.length) track.sort(function (a, b) { return a[2] - b[2]; });   // 시각이 다 있을 때만 차례를 시각으로(코스 파일은 그대로)
        var meta = tag(text, "metadata") || "", sumText = tag(meta, "rf:record"), sum = {};
        try { sum = sumText ? JSON.parse(un(sumText)) || {} : {}; } catch (e) { sum = {}; }
        var name = un(tag(meta, "name") || tag(tag(text, "trk") || "", "name") || "") || String(file || "").replace(/\.gpx$/i, "").trim() || "GPX";
        var notes = [], photos = {}, wr = /<wpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/wpt>)/g;
        while ((m = wr.exec(text))) {
            var la = attr(m[1], "lat"), lo = attr(m[1], "lon"), b = m[2] || "";
            if (!isFinite(la) || !isFinite(lo)) continue;
            var wt = tag(b, "time"), we = tag(b, "ele"), desc = tag(b, "desc"), ph = tag(b, "rf:photo"), n = { t: wt ? Date.parse(wt) : null, lat: la, lon: lo, ele: we != null && isFinite(+we) ? Math.round(+we) : null, text: desc ? un(desc) : null, photo: null };
            if (n.t != null && !isFinite(n.t)) n.t = null;
            if (ph && /^[A-Za-z0-9+/=\s]+$/.test(ph)) {
                var h = 5381, c = ph.replace(/\s+/g, "");
                for (var i = 0; i < c.length; i += 7) h = ((h << 5) + h + c.charCodeAt(i)) | 0;
                n.photo = "g" + (h >>> 0).toString(36) + c.length.toString(36);
                photos[n.photo] = c;
            }
            if (!n.photo && !n.text && any && !/<type>photo<\/type>/.test(b)) { var wn = tag(b, "name"); if (wn) n.text = un(wn); }   // 코스 파일의 지점 이름(갈림길 · 정상 등)
            if (!n.photo && !n.text) continue;   // 이름만 있는 지점(출발 · 정상 표시 등)은 기록 메모가 아님
            if (n.t == null) n.t = track[0][2];
            notes.push(n);
        }
        if (timed.length === track.length) notes.sort(function (a, b) { return a.t - b.t; });
        var kind = /^(hike|walk|bike)$/.test(sum.kind) ? sum.kind : /^(hike|walk|bike)$/.test(tag(tag(text, "trk") || "", "type") || "") ? tag(tag(text, "trk"), "type") : "hike";
        var t0 = timed.length ? timed[0][2] : null, t1 = timed.length ? timed[timed.length - 1][2] : null;
        return { rec: { name: name, kind: kind, start: isFinite(sum.start) && sum.start !== null ? +sum.start : t0, end: isFinite(sum.end) && sum.end !== null ? +sum.end : t1,
                        up: isFinite(sum.up) && sum.up !== null ? +sum.up : null, kcal: isFinite(sum.kcal) && sum.kcal !== null ? +sum.kcal : null, steps: isFinite(sum.steps) && sum.steps !== null ? +sum.steps : null,
                        courseId: typeof sum.courseId === "string" ? sum.courseId : null, track: track, notes: notes }, photos: photos };
    }

    var SPEED_HALF_MS = 60000;

    /**
     * 순수 함수 - 그래프에 그릴 속도 선을 거리 n 칸마다 평균으로(2026-11-22 홍TV님 - 12시간 기록에서 붉은 선이 톱니처럼 흔들려 읽기 어려웠음).
     * 돌려줌 [[칸 가운데 거리 비율 0 ~ 1, 평균 km/h]], 점이 없는 칸은 뺌. "최고" 숫자는 그래프가 원래 값(speedProfile)으로 따로 셈.
     */
    function speedBuckets(speed, dist, total, n) {
        var sum = [], cnt = [], out = [];
        if (!speed || !(total > 0) || !(n > 0)) return out;
        speed.forEach(function (v, k) {
            if (v == null || dist[k] == null) return;
            var b = Math.min(n - 1, Math.max(0, Math.floor(dist[k] / total * n)));
            sum[b] = (sum[b] || 0) + v; cnt[b] = (cnt[b] || 0) + 1;
        });
        for (var b = 0; b < n; b++) if (cnt[b]) out.push([(b + 0.5) / n, sum[b] / cnt[b]]);
        return out;
    }
    function speedProfile(c) {
        var t = c && c.time, n = t ? t.length : 0, out = [], a = 0, b = 0, any = false;
        for (var i = 0; i < n; i++) {
            if (t[i] == null) { out.push(null); continue; }
            while (a < i && (t[a] == null || t[i] - t[a] > SPEED_HALF_MS)) a++;
            if (b < i) b = i;
            while (b < n - 1 && t[b + 1] != null && t[b + 1] - t[i] <= SPEED_HALF_MS) b++;
            var dt = t[b] - t[a], v = dt > 0 ? (c.dist[b] - c.dist[a]) / dt * 3600 : null;
            if (v != null) any = true;
            out.push(v);
        }
        return any ? out : null;
    }

    var MOVE_WINDOW_MS = 120000, MOVE_MIN_MS = 0.2;   // 0.2 m/s = 시속 0.72km - 가파른 오르막을 천천히 오를 때도 이동으로, 2분에 24m 못 가면 쉼
    function moveStats(track) {
        var t = (track || []).filter(function (p) { return p && typeof p[2] === "number"; });
        if (t.length < 2) return null;
        var move = 0, rest = 0, dist = 0, j = 1, k = 0;
        function fast(a, b) { var w = t[b][2] - t[a][2]; return w > 0 && distM(t[a][0], t[a][1], t[b][0], t[b][1]) / (w / 1000) >= MOVE_MIN_MS; }
        for (var i = 0; i < t.length - 1; i++) {
            if (j <= i) j = i + 1;
            while (j < t.length - 1 && t[j][2] - t[i][2] < MOVE_WINDOW_MS) j++;   // 앞 점에서 2분 뒤
            while (k + 1 <= i && t[i + 1][2] - t[k + 1][2] >= MOVE_WINDOW_MS) k++;   // 뒤 점에서 2분 앞
            var dt = t[i + 1][2] - t[i][2];
            if (dt <= 0) continue;
            var going = fast(i, j) && fast(k, i + 1);
            if (going) { move += dt; dist += distM(t[i][0], t[i][1], t[i + 1][0], t[i + 1][1]); } else rest += dt;
        }
        return { moveMs: move, restMs: rest, moveM: dist, kmh: move > 0 ? dist / (move / 3600000) / 1000 : null };
    }

    /**
     * 2026-10-08 (홍TV님 - 다른 앱 · 친구가 준 GPX 를 열어 따라가기): GPX 글 → /api/course 와 같은 모양
     * {course: {name, kind}, points: [[경도, 위도, 고도|null, 누적 거리]], pois: [{seq, name, lat, lon, ele_m, dist_m}]}.
     * 규칙은 routefly-batch 의 GpxReader · CourseMath.thin 과 같습니다 - 이름공간은 보지 않고 태그 이름만, trk/trkseg/trkpt 를
     * 파일 순서대로 이어 붙이고 trk 가 없으면 rte/rtept, 위경도가 비었거나 범위 밖이거나 (0,0) 인 점은 버림, 이름 없는 wpt 는 버림,
     * 점은 10m 보다 가까우면 솎음(끝점은 남김). 경로 점이 2개보다 적으면 오류. 이름: metadata → trk → rte → 파일 이름.
     * DOMParser 는 외부 엔티티 · DTD 를 받아 오지 않습니다(남이 만든 파일이라).
     */
    var GPX_SPACING_M = 10;

    /**
     * 순수 함수 - 기록의 가장 높은 곳(2026-10-28 PC: 지리산 기록이 1,950m - 천왕봉 1,915m). GPS 높이는 앞뒤 5점 가운뎃값으로 튐을 누르고,
     * 그 자리가 100대 명산 정상(peaks: mountains100 의 {id, lat, lon}) 200m 안이면 공식 높이(elev: peak-elev.json 의 elev)로.
     */
    function recordHighest(rc, peaks, elev) {
        var e = rc && rc.ele || [], best = null, at = -1;
        for (var i = 0; i < e.length; i++) {
            var w = [];
            for (var j = Math.max(0, i - 2); j <= Math.min(e.length - 1, i + 2); j++) if (e[j] != null) w.push(e[j]);
            if (!w.length) continue;
            w.sort(function (x, y) { return x - y; });
            var m = w[Math.floor(w.length / 2)];
            if (best == null || m > best) { best = m; at = i; }
        }
        if (best == null) return null;
        var hit = null, hd = 200;
        (peaks || []).forEach(function (p) {
            var id = p.id || p.name, d = distM(rc.lat[at], rc.lon[at], p.lat, p.lon);
            if (elev && elev[id] != null && d <= hd) { hd = d; hit = +elev[id]; }
        });
        return Math.round(hit != null ? hit : best);
    }
    /**
     * 누적 오르막(m) - 남은 오르막을 빨리 구하려고 미리 셉니다. 배치(CourseMath.elevation, course.ascentThresholdM 5m)와 같게
     * 5m 넘게 바뀔 때만 셉니다 - 2026-10-12 PC: 노선 안내도 "오르막 1,012m"(DB) · 따라가기 "남은 오르막 1,191m"(잔 오르내림까지 더함)이 달랐음.
     */
    var ASCENT_STEP_M = 5;
    function cumAscent(ele) {
        var asc = [0], ref = null, up = 0;
        for (var i = 0; i < ele.length; i++) {
            var e = ele[i];
            if (e != null) {
                if (ref == null) ref = e;
                else if (e - ref >= ASCENT_STEP_M) { up += e - ref; ref = e; }
                else if (ref - e >= ASCENT_STEP_M) ref = e;
            }
            if (i > 0) asc.push(up);
        }
        return asc;
    }

    /**
     * el 에 이름 글을 넣되 "탐방지원센터" · "탐방안내소" 는 작은 글씨로(2026-10-12 홍TV님: 중산리탐방지원센터 등 - 전체 동일).
     * 글은 textContent 로만(이름에 꺾쇠가 있어도 안전).
     */
    var SMALL_SUFFIX = /(탐방지원센터|탐방안내소)/;
    function nameNodes(el, text) {
        el.textContent = "";
        if (LANG === "en") text = enName(text);   // 따라가기 영어 - 한글 이름은 로마자(2026-10-17)
        String(text == null ? "" : text).split(SMALL_SUFFIX).forEach(function (part, i) {
            if (!part) return;
            if (i % 2) {
                var s = document.createElement("small");
                s.className = "rf-sfx";
                s.textContent = part;
                el.appendChild(s);
            } else el.appendChild(document.createTextNode(part));
        });
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
    function isAccess(p) { return +p.off_route_m > (isTopName(p.name) ? 160 : 100); }

    function isTopName(name) { return /(봉|산|령|재|고개|峰|정상)(\s*\(.*\))?$/.test(String(name || "").trim()); }

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

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    /**
     * 종류별 이름 · 표준 빠르기 - 예상 시간에 씁니다. 등산 · 장거리(hike · trek)는 국립공원공단 기준 1km 에 34분(쉬는 시간 포함, 오르막 · 내리막 따로 더하지 않음 -
     * 2026-11-04 홍TV님 "공단과 동일하게 해. 산에서 휴식 시간도 산행이라고 봐야지": 공단 공식 시간 560개가 경사와 상관없이 1km 중앙 34분, MountainServlet.MIN_PER_KM).
     * 걷기(해안길 · 도로 둘레길 - 공단 자료 밖)는 예전처럼 시속 4km + 오르막 600m/h + 내리막 300m 에 10분(CoursePageServlet.WALK_RULE).
     */
    var KINDS = {
        hike: { label: "등산", kmh: 60 / 34, climb: 0, down: 0, icon: "⛰️", act: "산행", sos: "등산 중", simKmh: 3.5, svg: "hiker" },
        walk: { label: "걷기", kmh: 4, climb: 600, down: 1800, icon: "🚶", act: "걷기", sos: "걷기 중", simKmh: 4, svg: "walker" },
        bike: { label: "자전거", kmh: 15, climb: 0, down: 0, icon: "🚴", act: "라이딩", sos: "자전거 타던 중", simKmh: 15, svg: "cyclist" },
        // 2026-10-10: 등산 · 걷기가 애매한 코스(선자령순환등산로 등) - 두 탭 모두에 나오고, 따라가기는 등산과 같은 말 · 속도
        trek: { label: "등산 · 걷기", kmh: 60 / 34, climb: 0, down: 0, icon: "🥾", act: "산행", sos: "산행 중", simKmh: 3.5, svg: "hiker" }
    };

    var KINDS_EN = { hike: { label: "Hiking", act: "Hike", sos: "hiking" }, walk: { label: "Walking", act: "Walk", sos: "walking" },
                     bike: { label: "Cycling", act: "Ride", sos: "cycling" }, trek: { label: "Hiking · Walking", act: "Hike", sos: "hiking" } };

    function kindOf(k) { return KINDS[k] || KINDS.hike; }

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

    /** 순수 함수 - 표준 소요 시간(ms): 거리 ÷ 빠르기 + 오르막 ÷ climb + 내리막 ÷ down(KINDS). descM 이 없으면 내리막 0. */
    function standardMs(kind, distM, ascM, descM) {
        var k = kindOf(kind);
        return (distM / 1000 / k.kmh + (k.climb ? (+ascM || 0) / k.climb : 0) + (k.down ? (+descM || 0) / k.down : 0)) * 3600000;
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

    /** 순수 함수 - 눕힌 이름(.rf-plabel.flat - 점 아래 4px, 끝 이름은 점 왼쪽으로)의 네 꼭짓점. */
    function flatRect(x, y, w, h, end) {
        var l = end ? x - 4 - w : x + 4, t = y + 4;
        return [[l, t], [l + w, t], [l + w, t + h], [l, t + h]];
    }

    /** 순수 함수 - 점 위에 눕힌 출발 이름(.rf-plabel.flat.up - 점 오른쪽 위 9px)의 네 꼭짓점. */
    function flatUpRect(x, y, w, h) {
        var l = x + 9, t = y - 9 - h;
        return [[l, t], [l + w, t], [l + w, t + h], [l, t + h]];
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

    var SPEED_BUCKETS = 100;   // 그래프 폭을 100칸으로 - 35km 면 칸마다 350m, 5km 면 50m
    function profile(box, c, opts) {
        opts = opts || {};
        box.textContent = "";
        box.classList.add("rf-profile");
        var eles = c.ele.filter(function (e) { return e != null; });
        if (eles.length < 2) {
            box.appendChild(el("div", "rf-cap rf-empty", tr("고도 자료가 없는 코스입니다 - 거리만 표시합니다.", "No elevation data for this trail - distance only.")));
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
        // 속도(opts.speed = speedProfile, 내 기록 그래프만) - 붉은 가는 선, 높이와 따로 0 ~ 최고 속도로(2026-11-22 홍TV님 - 램블러 그래프처럼)
        var spd = (opts.speed || []).filter(function (v) { return v != null; }), smax = spd.length ? Math.max.apply(null, spd) : 0;
        if (smax > 0 && c.total > 0) {
            var sp = [];
            speedBuckets(opts.speed, c.dist, c.total, SPEED_BUCKETS).forEach(function (q) { sp.push((q[0] * PW).toFixed(1) + "," + ((1 - q[1] / (smax * 1.15)) * PH).toFixed(1)); });
            var pl = document.createElementNS(NS, "polyline");
            pl.setAttribute("points", sp.join(" "));
            pl.setAttribute("fill", "none");
            pl.setAttribute("stroke", "#ff6b6b");
            pl.setAttribute("stroke-width", "1.5");
            pl.setAttribute("vector-effect", "non-scaling-stroke");
            pl.setAttribute("class", "speed");
            svg.insertBefore(pl, svg.querySelector(".cursor"));
        }
        // 자료가 끊긴 구간(opts.gaps = courseGaps) - 그래프에 붉은 띠(2026-10-30 홍TV님 "추천한 것 작업해줘")
        (opts.gaps || []).forEach(function (g) {
            if (!(c.total > 0) || g.at == null) return;
            var r = document.createElementNS(NS, "rect");
            r.setAttribute("x", (g.at / c.total * PW).toFixed(1));
            r.setAttribute("width", Math.max(2, g.m / c.total * PW).toFixed(1));
            r.setAttribute("y", "0");
            r.setAttribute("height", String(PH));
            r.setAttribute("fill", "rgba(255,90,60,0.32)");
            r.setAttribute("class", "gap");
            svg.insertBefore(r, svg.querySelector(".cursor"));
        });
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
            // 코스 이름에 든 지점(구기분소 → 대남문 → 구기분소 의 대남문)도 정상처럼 먼저 - 반환점에 옆 봉우리 "잠룡봉" 만 남았었음(2026-10-13 PC)
            var titled = nameParts(c.course && c.course.name).route.split(" → ").map(function (x) { return x.trim(); });
            // 이름 앞이 같아도(제목 "노고단" ↔ 이름표 "노고단고개" - 화대종주, 2026-10-13 PC)
            var inTitle = function (n) { return titled.some(function (t) { return t.length >= 2 && (n === t || n.indexOf(t) === 0); }); };
            // 이름 없는 고갯마루("안부") 같은 흔한 이름은 맨 나중에 - 자리가 남을 때만(2026-10-13 홍TV님: 화대종주 안부1 은 돼지령 → 임걸령 사이 안부)
            var plain = function (n) { return /^(안부|갈림길|삼거리)$/.test(n); };
            var rank = function (q) { return q.d < 60 || q.d > c.total - 60 ? 0 : q === top || inTitle(q.p.name) ? 1 : plain(q.p.name) ? 3 : 2; };
            // 같은 자리면 출발 · 도착 이름표(end) 먼저 - 순환 코스 끝이 옆 지명 "루암리" 로 남았었음(2026-10-13 PC)
            list.slice().sort(function (u, v) { return rank(u) - rank(v) || (v.p.end ? 1 : 0) - (u.p.end ? 1 : 0) || u.d - v.d; }).forEach(function (q) {
                var xp = q.d / c.total * 100;
                if (!bw && lastX >= 0 && Math.abs(xp - lastX) < 6) return;   // 크기를 모를 때(숨은 화면)는 예전처럼 간격으로
                var nm = q.p.name.replace(/\(.*\)$/, "").trim() || q.p.name;
                if (LANG === "en") { nm = enName(nm.replace(/(탐방지원센터|탐방안내소)$/, "") || nm); if (nm.length > 13) nm = nm.slice(0, 12) + "…"; }
                // 길면 탐방지원센터 · 탐방안내소는 떼고("관음사지구탐방지…" 로 잘렸음 - 2026-10-13 PC), 그래도 길면 말줄임
                if (nm.length > 9) nm = nm.replace(/(탐방지원센터|탐방안내소)$/, "") || nm;
                if (nm.length > 9) nm = nm.slice(0, 8) + "…";   // 비스듬한 이름이 길면 그래프 위 칸까지 올라감(전체 이름은 지도 · '다음' 줄에)
                var lb = el("div", "rf-plabel" + (rank(q) < 2 ? " key" : ""), nm);   // key - 출발 · 도착 · 정상(좁은 화면에서도 남김)
                nameNodes(lb, nm);   // 탐방지원센터는 작은 글씨
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
                    // 비스듬한 이름이 그래프 위로 삐져나가면(정상이 끝에 있는 짧은 코스 - 위 줄 단추와 겹침) 점 아래에 눕혀 씀
                    // (2026-10-12 홍TV님: 공주향교뒷산 "공주향교뒷산 정상" 이 미리보기 단추 줄까지 올라감)
                    var px = xp / 100 * bw, py = y(q.a.ele) / PH * bh;
                    // 출발 이름은 지금 자리 동그라미(.rf-me, 지름 15px) 오른쪽에서 시작(22px)(2026-10-13 홍TV님: 한계령탐방지원센터의 "한" 이 가렸음)
                    var first = q.d < 60 && !end;
                    if (first) lb.classList.add("first");
                    var r = labelRect(first ? px + 20 : px, py, lb.offsetWidth, lb.offsetHeight, end);
                    if (Math.min(r[0][1], r[1][1], r[2][1], r[3][1]) < -2) {
                        lb.classList.add("flat");
                        r = flatRect(px, py, lb.offsetWidth, lb.offsetHeight, end);
                        // 출발 이름은 지금 자리 동그라미(.rf-me)에 첫 글자가 가렸음 - 점 위로 눕혀 씀(2026-10-13 홍TV님: 한계령탐방지원센터의 "한")
                        if (first) {
                            var ru = flatUpRect(px, py, lb.offsetWidth, lb.offsetHeight);
                            if (ru[0][1] >= -2) { lb.classList.add("up"); r = ru; }
                            else lb.classList.add("past");   // 위로도 넘치면 동그라미 오른쪽으로 비켜
                        }
                    }
                    if (placed.some(function (o) { return rectsOverlap(o, r); })) { box.removeChild(lb); return; }
                    placed.push(r);
                }
                lastX = xp;
            });
        }
        // 최고 - 서버가 정상을 지나는 코스는 공식 높이로 바꿔 보냄(course.ele_max_m, 2026-10-16 PC: 그래프만 선 고도 1,700m 였음). 선보다 낮으면 선 값
        var top = c.course && c.course.ele_max_m != null && +c.course.ele_max_m >= max ? +c.course.ele_max_m : max;
        var capMax = el("div", "rf-cap", tr("최고 ", "top ") + num(top) + "m"); capMax.style.cssText = "left:3px;top:0"; box.appendChild(capMax);
        var capTot = el("div", "rf-cap", km(c.total) + "km"); capTot.style.cssText = "right:3px;bottom:1px"; box.appendChild(capTot);
        if (smax > 0 && c.total > 0) {
            var capSpd = el("div", "rf-cap", tr("빨강 속도 · 최고 ", "red speed · max ") + num(smax, 1) + "km/h");
            capSpd.style.cssText = "right:3px;top:0;color:#ff8787"; box.appendChild(capSpd);
        }
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
                var x = Math.max(0, Math.min(PW, d / c.total * PW));   // 처음 · 끝을 넘지 않게(2026-11-23 PC: 3D 영상에서 막대 너비가 -0.1 로 경고)
                cursor.setAttribute("x1", x.toFixed(1));
                cursor.setAttribute("x2", x.toFixed(1));
                done.setAttribute("width", x.toFixed(1));
                var p = at(c, d);
                me.style.left = (d / c.total * 100) + "%";
                me.style.top = p.ele == null ? "50%" : (y(p.ele) / PH * 100) + "%";
            }
        };
    }

    /**
     * 산행 결산(2026-10-15 홍TV님) - 기록(최근 30개, 걸은 길 포함)과 따로, 끝낸 산행마다 요약 한 줄을 오래 남김(localStorage "rf-log").
     * 순수 함수 - 기록 → 요약 {start, end, walked, up, courseId, name, kind}.
     */
    /** 순수 함수 - 기록의 거리: 걸은 거리와 코스 진행 가운데 큰 값(2026-10-28 - 화면이 꺼져 짧게 남은 옛 기록, 카드 · 목록 · 합계가 같은 값). */
    function recDist(r) { return Math.max(+(r && r.walked) || 0, +(r && r.done) || 0); }

    /**
     * 순수 함수 - 기록 요약 줄 [[이름, 값]](2026-11-23 홍TV님 "GPX 열기 화면에 두 번째 정보" - 내 기록 📈 창에 있던 것을 기록 보기 trip.html 로 옮김).
     * 날짜 · 시각은 한국 시간, 이동 · 휴식 · 평균 속도는 moveStats, 가장 높은 곳은 recordHighest(100대 명산 정상 근처면 공식 높이). en - 영어 이름.
     */
    function recordSummary(rec, peaks, elev, en) {
        var L = function (ko, e) { return en ? e : ko; };
        var hms = function (ms) {
            var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
            return h + ":" + (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x;
        };
        var rc = recordCourse(rec), out = [], has = function (v) { return v != null && isFinite(v); };
        if (has(rec.start)) {
            var d = new Date(rec.start + 9 * 3600000);
            out.push([L("날짜", "Date"), d.getUTCFullYear() + "." + (d.getUTCMonth() + 1) + "." + d.getUTCDate() + " "
                + (d.getUTCHours() < 10 ? "0" : "") + d.getUTCHours() + ":" + (d.getUTCMinutes() < 10 ? "0" : "") + d.getUTCMinutes()]);
        }
        out.push([L("거리", "Distance"), km(recDist(rec) || rc.total) + " km"]);
        if (has(rec.start) && has(rec.end) && rec.end > rec.start) out.push([L("걸린 시간", "Time"), hms(rec.end - rec.start)]);
        var mv = rec.track && rec.track.length ? moveStats(cleanTrack(rec.track, rec.kind === "bike")) : null;
        if (mv && mv.moveMs > 0) out.push([L("이동 시간", "Moving time"), hms(mv.moveMs)], [L("휴식 시간", "Rest time"), hms(mv.restMs)],
            [L("평균 속도(이동 중)", "Avg speed (moving)"), num(mv.kmh, 1) + " km/h"]);
        if (has(rec.up)) out.push([L("오른 높이", "Climb"), num(rec.up) + " m"]);
        if (rc.ele.some(function (e) { return e != null; })) out.push([L("가장 높은 곳", "Highest"), num(recordHighest(rc, peaks, elev)) + " m"]);
        if (has(rec.kcal)) out.push([L("칼로리(추정)", "Calories (est.)"), num(rec.kcal) + " kcal"]);
        return out;
    }
    // ------------------------------------------------------------------ 로마자(Roman.java 를 옮김 - 영어 화면의 지점 이름, 2026-10-16)
    var RO_INI = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
    var RO_VOW = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
    var RO_FS = [0, 1, 1, 1, 2, 2, 2, 3, 4, 1, 5, 4, 4, 4, 6, 4, 5, 6, 6, 3, 3, 7, 3, 3, 1, 3, 6, 3];
    var RO_LINK = ["", "g", "kk", "ks", "n", "nj", "n", "d", "r", "lg", "lm", "lb", "ls", "lt", "lp", "r", "m", "b", "ps", "s", "ss", "ng", "j", "ch", "k", "t", "p", ""];
    var RO_SND = ["", "k", "n", "t", "l", "m", "p", "ng"];
    function roNasal(s) { return s === 1 ? 7 : s === 3 ? 2 : s === 6 ? 5 : s; }
    function roFirst(link) { return { k: 1, n: 4, l: 8 }[link.charAt(0)] || 17; }
    function roWord(w) {
        var ini = [], vow = [], fin = [], b = "", carry = null, len = w.length;
        for (var k = 0; k < len; k++) { var code = w.charCodeAt(k) - 0xAC00; ini.push(Math.floor(code / 588)); vow.push(Math.floor(code % 588 / 28)); fin.push(code % 28); }
        for (k = 0; k < len; k++) {
            b += (carry != null ? carry : RO_INI[ini[k]]) + RO_VOW[vow[k]];
            carry = null;
            if (!fin[k]) continue;
            if (k === len - 1) { b += RO_SND[RO_FS[fin[k]]]; continue; }
            var next = ini[k + 1], snd = RO_FS[fin[k]];
            if (k === len - 2 && w.charAt(k + 1) === "리") { b += RO_SND[snd] + "-"; continue; }
            if (next === 11) {
                var link = RO_LINK[fin[k]];
                if (fin[k] === 21) b += "ng";
                else if (link.length === 2 && ["kk", "ss", "ng", "ch"].indexOf(link) < 0) { b += RO_SND[RO_FS[roFirst(link)]]; carry = link.slice(1); }
                else carry = link;
                continue;
            }
            if (snd === 4 && (next === 5 || next === 2)) { b += "l"; carry = "l"; }
            else if (snd === 2 && next === 5) { b += "l"; carry = "l"; }
            else if (next === 5) { b += RO_SND[roNasal(snd)]; carry = "n"; }
            else if (next === 2 || next === 6) b += RO_SND[roNasal(snd)];
            else b += RO_SND[snd];
        }
        return b;
    }
    /** 순수 함수 - 한글 로마자(국어의 로마자 표기법 - Roman.of 와 같은 결과). "설악산" → "Seoraksan". */
    function roman(s) {
        s = String(s == null ? "" : s);
        return s.replace(/[가-힣]+/g, function (w, i) {
            var r = roWord(w), prev = i > 0 ? s.charAt(i - 1) : "";
            return (/[A-Za-z]/.test(prev) ? " " : "") + (/\d/.test(prev) ? r : r.charAt(0).toUpperCase() + r.slice(1));
        });
    }
    /** 영어로 옮길 낱말(MountainEn.WORDS 와 같은 목록 · 차례 - MountainEnTest 가 봄, 2026-11-07) - 나머지는 로마자. */
    var EN_WORDS = [["남동쪽", "southeast"], ["남서쪽", "southwest"], ["북동쪽", "northeast"], ["북서쪽", "northwest"],
        ["동쪽", "east"], ["서쪽", "west"], ["남쪽", "south"], ["북쪽", "north"], ["들머리", "trailhead"], ["날머리", "trail end"],   // 2026-10-18 PC: 남동쪽 들머리
        ["국립공원", "National Park"], ["국림공원", "National Park"], ["화장실", "restroom"], ["탐방지원센터", "visitor center"], ["탐방안내소", "visitor center"], ["공원지킴터", "ranger post"], ["매표소", "ticket booth"], ["주차장", "parking"],
        ["대피소", "shelter"], ["휴게소", "rest area"], ["삼거리", "junction"], ["사거리", "crossroads"], ["갈림길", "junction"], ["탐방로", "trail"], ["등산로", "trail"],
        ["입구", "entrance"], ["정상", "summit"], ["코스", "course"], ["구간", "section"], ["순환", "loop"], ["왕복", "round trip"], ["분소", "office"],
        // 따라가기 영어(2026-10-17) - 위험지역 · 시설 이름
        ["급경사", "steep slope"], ["낙석", "falling rocks"], ["추락", "fall"], ["미끄럼", "slippery"], ["실족", "slip"], ["주의", "caution"], ["위험", "danger"],
        ["조망점", "viewpoint"], ["전망대", "observatory"], ["약수터", "spring"], ["샘터", "spring"], ["쉼터", "rest spot"], ["헬기장", "helipad"],
        ["구급함", "first-aid box"], ["정류장", "bus stop"],
        ["자전거길", " bike path"], ["관광안내소", " tourist info center"], ["해수욕장", " beach"], ["계곡", " valley"], ["아래", " below"]];
    /** 순수 함수 - 지점 · 코스 이름 영어로(MountainEn.courseName 과 같음). "수렴동대피소" → "Suryeomdong shelter". */
    function enName(ko) {
        // 붙어 쓴 산 이름 + 봉우리 · 고개 · 절은 띄움("설악산대청봉" → "Seoraksan Daecheongbong", MountainEn.courseName 과 같음)
        var s = String(ko == null ? "" : ko).replace(/([가-힣]+산)([가-힣]{1,4}(?:봉|대|령|재|사|암|폭포|계곡))(?![가-힣])/g, "$1 $2");
        s = s.replace(/(^|\s)위(?=\s|\d|$)/g, "$1above");   // 따로 쓴 '위'만("갈림길 위 250m") - 위봉 · 위례 같은 이름은 그대로(2026-10-17 PC)
        EN_WORDS.forEach(function (w) { s = s.split(w[0]).join(" " + w[1] + " "); });
        return roman(s).replace(/([a-z])(\d)/g, "$1 $2").replace(/\s+/g, " ").replace(/ ([)\],])/g, "$1").replace(/([(\[]) /g, "$1").trim();
    }

    /**
     * MapLibre 지도 단추 글(확대 · 축소 · 북쪽 · 출처 · 내 위치) - 한국어 화면은 한국어(2026-11-03 홍TV님 점검: 한국어 화면에 "Zoom in" 이 나왔음).
     * 영어 화면은 undefined(MapLibre 기본 영어). new maplibregl.Map({ locale: RF.mapLocale() }).
     */
    function mapLocale() {
        if (LANG === "en") return undefined;
        return { "AttributionControl.ToggleAttribution": "출처 보기 · 접기", "AttributionControl.MapFeedback": "지도 의견",
                 "FullscreenControl.Enter": "전체 화면", "FullscreenControl.Exit": "전체 화면 끝내기",
                 "GeolocateControl.FindMyLocation": "내 위치 찾기", "GeolocateControl.LocationNotAvailable": "위치를 알 수 없음",
                 "LogoControl.Title": "MapLibre 로고", "Marker.Title": "지도 표시",   // 이름을 안 붙인 표시는 "Map marker" 대신
                 "NavigationControl.ResetBearing": "끌면 지도 돌리기, 누르면 북쪽을 위로",
                 "NavigationControl.ZoomIn": "확대", "NavigationControl.ZoomOut": "축소",
                 "TerrainControl.Enable": "지형 켜기", "TerrainControl.Disable": "지형 끄기" };
    }

    /**
     * 순수 함수 - 코스 선에서 점 사이가 minM(기본 250m) 넘게 뛰는 곳(자료가 끊긴 구간) [{at(누적 m), m}] - 따라가기가 알림(2026-10-30 홍TV님 "끊어짐 없이"
     * - 코스 점검(tools/course-audit) 에서 공단 공식 선도 2곳: 설악산 양폭대피소 → 무너미고개 344m · 지리산 추성동 → 천왕봉 315m). c: {lon, lat, dist}.
     */
    function courseGaps(c, minM) {
        var lim = minM || 250, out = [];
        for (var i = 1; c && c.lat && i < c.lat.length; i++) {
            var m = distM(c.lat[i - 1], c.lon[i - 1], c.lat[i], c.lon[i]);
            if (m > lim) out.push({ at: c.dist ? Math.round(+c.dist[i - 1]) : null, m: Math.round(m) });
        }
        return out;
    }

    global.RF = {
        num: num,
        km: km,
        recordCourse: recordCourse,
        gpxRecord: gpxRecord,
        baseStyle: baseStyle,
        at: at,
        snap: snap,
        speedProfile: speedProfile,
        famousMarks: famousMarks,
        famousFetch: famousFetch,
        trackSegments: trackSegments,
        stopsAlong: stopsAlong,
        recordPark: recordPark,
        segText: segText,
        standardMs: standardMs,
        distM: distM,
        profile: profile,
        nameIn: function (s) { return LANG === "en" && s != null ? enName(s) : s; },
        setLang: setLang,
        tr: tr,
        pageLang: pageLang,
        applyEn: applyEn,
        recordSummary: recordSummary,
        mapLocale: mapLocale
    };
})(window);
