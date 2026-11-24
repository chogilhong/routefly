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

    /**
     * 순수 함수 - 선이 이름과 거꾸로 그려진 코스({코스ID: true}). 2026-10-12: 국가숲길 지리산둘레길 GPX 가운데 "금계-동강" ·
     * "성심원-운리" 들은 선이 이름 뒤쪽(동강 · 운리)에서 시작함. 같은 이름이 여러 코스 끝에 나오면 그 끝들이 모이는 점이
     * 그 곳 - 그 점이 이름 앞쪽(from)인데 선 끝에 있으면 거꾸로. 모르면 이름 차례 그대로.
     */
    function routeFlips(courses, lines, nearM) {
        var near = nearM == null ? 300 : nearM, cands = {}, at = {}, out = {};
        function key(n) { return String(n || "").replace(/\s+/g, ""); }
        (courses || []).forEach(function (c) {
            var l = lines && lines[c.course_id], e = routeEnds(c.name);
            if (!l || l.length < 2) return;
            [e.from, e.to].forEach(function (n) {
                if (!n) return;
                (cands[key(n)] = cands[key(n)] || []).push(l[0], l[l.length - 1]);
            });
        });
        Object.keys(cands).forEach(function (k) {
            var best = null, bn = 1;
            cands[k].forEach(function (p) {
                var n = cands[k].filter(function (q) { return distM(p[1], p[0], q[1], q[0]) < near; }).length;
                if (n > bn) { bn = n; best = p; }
            });
            if (best) at[k] = best;
        });
        (courses || []).forEach(function (c) {
            var l = lines && lines[c.course_id], e = routeEnds(c.name);
            if (!l || l.length < 2) return;
            var a = l[0], z = l[l.length - 1], f = e.from && at[key(e.from)], t = e.to && at[key(e.to)];
            var d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
            if ((f && d(f, z) < near && d(f, a) >= near) || (t && d(t, a) < near && d(t, z) >= near)) out[c.course_id] = true;
        });
        return out;
    }

    // 지명으로 다듬기(2026-10-12 PC: 해파랑길 · 백두대간 지명에 가게 · 창고 이름, 긴 괄호)
    // 가게 · 시설 이름은 빼고, 긴 괄호("(경상북도기념물제39호)")와 뒤 숫자("솔잎공원267")는 떼고, "660 봉" 은 붙이고,
    // 탐방지원센터 · 휴게소는 앞 지명만("죽령탐방지원센터" → 죽령, "제3관문휴게소" → 제3관문)
    function placeName(raw) {
        var n = cleanName(raw || "").replace(/\(([^)]*)\)/g, function (m, x) { return x.length > 6 || /[0-9]/.test(x) ? "" : m; })
            .replace(/([0-9]+)\s+(봉|고지)$/, "$1$2").replace(/([가-힣])[0-9]+$/, "$1").trim();
        // 마을 이름 뒤 민박 · 펜션 · 식당은 마을 이름으로("가탄마을민박" → 가탄마을 - 2026-10-12 홍TV님: 지리산둘레길 끝 지명이 없었음)
        var vil = /^(.+(마을|리|동))(민박|펜션|식당|슈퍼|가게)$/.exec(n);
        if (vil) n = vil[1];
        if (/(본점|해변점|역점|항점|샵|민박|낚시점|창고|쉼터|관리본부|식당|카페|펜션|모텔|마트|편의점)$|^(씨유|GS25|세븐일레븐)/.test(n)) return "";
        var cut = n.replace(/(탐방지원센터|휴게소)$/, "");
        return cut.length >= 2 ? cut : n;
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

    function cleanName(name) {
        var n = summitName(String(name || "").trim().replace(/\s+/g, " "));
        // 한글 이름 뒤 영어 이름은 뺌("피아골 대피소 Piagol Shelter" - OSM, 2026-10-12 지리산 전체 보기 글자 겹침)
        if (/[가-힣]/.test(n)) n = n.replace(/\s*\([A-Za-z0-9 '.\-]*\)\s*$/, "").replace(/\s+[A-Za-z][A-Za-z0-9 '.\-]*$/, "");   // 괄호 안 영어도("안부1 (Anbu 1)")
        var cut = n.replace(/^\S{0,12}?(국립공원(관리)?(공단|사무소)?|도립공원(관리)?사무소|군립공원(관리)?사무소|관리사무소)\s*(?=\S*(탐방지원센터|탐방안내소|안내소|안내센터|분소|매표소))/, "").trim();
        if (cut.length < 2) cut = n;
        return cut.replace(/\s+(탐방지원센터|탐방안내소|안내소|분소|매표소|대피소|휴게소|주차장|폭포)$/, "$1");
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

    /** 길만 - "가 → 나", 국가숲길 "지리산둘레길 가탄-송정" 은 "가탄 → 송정"(2026-10-12 PC: 머리글 117px 를 넘어 잘림). */
    function routeOnly(name) {
        var p = nameParts(name);
        if (p.route.indexOf(" → ") >= 0) return p.route;
        var e = routeEnds(name);
        // "덕전리 순환" 은 그대로("덕전리 → 덕전리" 가 됐음 - 2026-10-13 PC)
        return e.from && e.to && e.from !== e.to ? e.from + " → " + e.to : p.route;
    }

    /** 글로만 쓸 곳(창 제목 등) - "[무리] 길", routeFirst 면 길만(따라가기 탭 제목 - 머리글과 같게). */
    function nameText(name, routeFirst) {
        if (LANG === "en") { var en = LANG; LANG = "ko"; var t = nameText(name, routeFirst); LANG = en; return enName(t); }
        var p = nameParts(name);
        if (routeFirst) return routeOnly(name);
        return p.group ? "[" + p.group + "] " + p.route : p.route;
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
                // 2026-10-09 점검: 같은 이름도 200m 안일 때만 - 3km 떨어진 두 "쉼터" · "약수터" 는 다른 곳입니다
                return (wk === k || wk.indexOf(k) >= 0 || k.indexOf(wk) >= 0) && d < 200;
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
            // 같은 이름은 한 번만(원점회귀는 출발 · 도착 이름표가 같은 자리 같은 이름 - 2026-10-13 홍TV님: 윗새재마을이 두 줄)
            if (g) { g.pois.push(p); if (g.names.indexOf(p.name) < 0) g.names.push(p.name); } else groups.push({ lead: p, names: [p.name], pois: [p] });
        });
        return groups.sort(function (a, b) { return +a.lead.dist_m - +b.lead.dist_m; });
    }

    var JUNCTION = "갈림길";   // routefly-batch 가 넣는 갈림길 이름표 - 지도 글자 대신 산행 화면 미리 알림에 씁니다

    /** 코스 자료(api/course 응답) → 계산하기 쉬운 모양. 갈림길은 이름표와 따로 c.junctions(진행 거리 목록). */
    /** 두루누비 사진 지점 이름("49코스 (거진항~통일안보 공원)_12.3km-0") - 지점 이름표로 쓰지 않음(2026-10-13 PC: 해파랑길 처음 · 끝 이름표). */
    var PHOTO_POI = /_[\d.]+\s*km(-\d+)?$/;
    /** 기계가 붙인 번호 이름("GPX-726" · "WPT012") - 이름표가 아님(2026-10-13 홍TV님: 서해랑길 20코스 지점 730개가 GPX-n. 배치 GpxReader.autoName 과 같게). */
    var AUTO_POI = /^(gpx|wpt|wp|waypoint|point|pt)[-_ ]?\d+$/i;

    var NUMBERED_PARK = /[^\s·→()\d]+\d+\s*\(([^()]+공원)\)/g;
    // "수변공원49까지"(서해랑길 16코스) - 공원 이름 뒤 관리 번호도 뗌
    var PARK_NO = /([가-힣](?:공원|광장))\d+(?![\d)])/g;
    function numberedPark(name) { return name == null ? name : String(name).replace(NUMBERED_PARK, "$1").replace(PARK_NO, "$1"); }

    function fromApi(id, j) {
        var raw = j.pois || [];
        // 사진 지점 이름의 "(가~나)" 는 코스 이름에 출발 · 도착이 없을 때 들머리 · 날머리 이름으로
        var photoEnds = null;
        raw.forEach(function (p) {
            var m = PHOTO_POI.test(String(p.name || "")) && /\(([^~()]+)~([^~()]+)\)/.exec(p.name);
            if (m && !photoEnds) photoEnds = { start: m[1].trim(), end: m[2].trim() };
        });
        var all = raw.filter(function (p) { var n = String(p.name || ""); return !PHOTO_POI.test(n) && !AUTO_POI.test(n.trim()); });
        // OSM 의 띄어 쓴 "남벽분 기점" → 남벽분기점(배치 tidyEnd 와 같게 - 이름표는 배치를 다시 돌리기 전 것도 있음)
        all.forEach(function (p) { if (/\s+기점$/.test(String(p.name || ""))) p.name = String(p.name).replace(/\s+기점$/, "기점"); });
        // 관리 번호가 붙은 공원 이름은 괄호 안 공원 이름으로(서해랑길 50코스 "문화공원11(부안공원)" → 부안공원, 배치 EndNames.firstName 과 같게)
        all.forEach(function (p) { p.name = numberedPark(p.name); });
        // "931 봉" → 931봉(배치 EndNames.firstName 과 같게 - 덕유산 육십령, 2026-10-13 PC)
        all.forEach(function (p) { p.name = String(p.name || "").replace(/^(\d+)\s+(봉|고지)$/, "$1$2"); });
        // 이름 없는 안부에 붙은 번호("안부1")는 뗌 - 번호는 자료가 붙인 것이라 현장에서 알 수 없음
        all.forEach(function (p) { p.name = String(p.name || "").replace(/^안부\s*\d+(\s*\([^()]*\))?$/, "안부"); });   // 실제 이름은 "안부1 (Anbu 1)"
        // 같은 번호가 뒤에 한 번 더 붙은 이름("551계단 551" - 화대종주, 2026-10-13 PC)
        all.forEach(function (p) { p.name = String(p.name || "").replace(/^(\d+)(\S+)\s+\1(\s+[A-Za-z][A-Za-z ]*)?$/, "$1$2"); });   // 실제 이름은 "551계단 551 Stairs"(PC 확인)
        if (j.course && j.course.name) j.course.name = numberedPark(j.course.name);
        var se = j.ends || {};
        // 코스 자기 자료("(거진항~통일안보 공원)")가 서버가 찾은 둘레 이름(고성군관광안내소)보다 먼저(2026-10-13 PC)
        var ends = photoEnds || se.start || se.end ? { start: (photoEnds && photoEnds.start) || se.start, end: (photoEnds && photoEnds.end) || se.end } : null;
        var c = { id: id, course: j.course, info: j.info || null, ends: ends, signs: j.signs || [], spots: j.spots || [], lon: [], lat: [], ele: [], dist: [], markers: [],
                  pois: dedupePois(all.filter(function (p) { return p.name !== JUNCTION; })),
                  junctions: all.filter(function (p) { return p.name === JUNCTION; }).map(function (p) { return +p.dist_m; })
                      .sort(function (a, b) { return a - b; }) };
        (j.points || []).forEach(function (p) {
            c.lon.push(+p[0]); c.lat.push(+p[1]); c.ele.push(p[2] == null ? null : +p[2]); c.dist.push(+p[3]);
        });
        c.total = c.dist.length ? c.dist[c.dist.length - 1] : 0;
        c.asc = cumAscent(c.ele);
        endPois(c);
        return c;
    }

    /**
     * 출발 · 도착 자리에 이름표가 없으면 코스 이름의 출발 · 도착 이름으로 하나씩(지도 · 고도 그래프 이름표).
     * 2026-10-12 PC: 국가숲길(kmf) 코스는 이름표가 없어 그래프 이름 0개 · 지도 "출발 · 도착" 만 - "지리산둘레길 가탄-송정" 이면 가탄 · 송정.
     */
    function endPois(c) {
        var n = c.lon.length - 1, e = routeEnds(c.course && c.course.name);
        if (n < 1) return;
        // 이름에 출발 · 도착이 없으면 서버가 찾은 둘레 다른 코스 끝 이름(api/course ends - 2026-10-13 홍TV님: 모든 산 · 걷기 · 자전거 "출발" 대신 들머리 이름)
        e = { from: e.from || (c.ends && c.ends.start) || null, to: e.to || (c.ends && c.ends.end) || null };
        // 코스 끝 이름이 탐방지원센터 같은 들머리면, 그 끝 500m 안 다른 들머리 이름표(배치가 지도용으로 받은 OSM 주차장 · 안내소)는 빼고
        // (2026-10-13 PC: 중산리 출발 이름표가 "중산리탐방안내소" + "중산리주차장" 두 줄, 그래프 처음 "중산리주차장")
        var HEADISH = /(탐방지원센터|탐방안내소|안내소|분소|매표소|주차장)$/;
        // 길찾기의 들머리 주차장 · 정류장(hike.js accessOf)은 아래 이름표 정리 전 것으로(2026-11-09 PC: 광양 가야산 - 출발 500m 안 주차장 둘 가운데
        // 길에 가까운 "주차장"(37m)만 남고 길 밖 "공영주차장"(255m)이 빠져, 길찾기 창에 주차장 고르기가 안 나왔음). 거꾸로 걷기는 reverseCourse 가 함께 뒤집음
        c.access = c.pois.filter(function (q) { return isAccess(q); });
        c.pois = c.pois.filter(function (q) {
            var nm = String(q.name || "").replace(/\s+/g, "");
            if (!HEADISH.test(nm)) return true;
            if (e.from && HEADISH.test(e.from) && +q.dist_m < 500 && nm !== e.from.replace(/\s+/g, "")) return false;
            if (e.to && HEADISH.test(e.to) && +q.dist_m > c.total - 500 && nm !== e.to.replace(/\s+/g, "")) return false;
            return true;
        });
        // 끝 이름이 "중산리" 처럼 짧으면, 그 끝 500m 안 들머리 이름표(주차장 · 안내소) 가운데 그 낱말이 든 것 하나만(없으면 길에 가장 가까운 것)
        // (2026-10-13 PC: 중산리 → 천왕봉 그래프 처음이 "중산리주차장", 지도에 "대원사집단시설지구주차장" 까지)
        [[e.from, function (q) { return +q.dist_m < 500; }], [e.to, function (q) { return +q.dist_m > c.total - 500; }]].forEach(function (w) {
            if (!w[0] || HEADISH.test(w[0])) return;
            var key = w[0].replace(/\s+/g, "");
            var hs = c.pois.filter(function (q) { return HEADISH.test(String(q.name || "").replace(/\s+/g, "")) && w[1](q); });
            if (hs.length < 2) return;
            var byOff = hs.slice().sort(function (a, b) { return +a.off_route_m - +b.off_route_m; });
            var keep = byOff.filter(function (q) { return String(q.name).replace(/\s+/g, "").indexOf(key) >= 0; }).concat(byOff)[0];
            c.pois = c.pois.filter(function (q) { return hs.indexOf(q) < 0 || q === keep; });
        });
        var near = function (d) { return c.pois.some(function (q) { return Math.abs(+q.dist_m - d) < 60 && +q.off_route_m < 60; }); };
        // 같은 이름 이름표가 그 끝 300m 안에 있으면 더 붙이지 않음(2026-10-12 PC: 중산리 → 천왕봉 은 천왕봉 이름표가 끝 123m 앞 - 두 번 나왔음)
        // 같은 이름이 길에서 떨어져 있으면(설악산 백담사 이름표 - 길에서 117m) 그 이름표를 들머리 · 날머리 자리로 옮김 - "출발" 로 남았었음(2026-10-13 홍TV님)
        var same = function (nm, d) {
            var q = c.pois.filter(function (x) { return x.name === nm && Math.abs(+x.dist_m - d) < 300; })[0];
            if (q && +q.off_route_m >= 60) {
                var k = d ? n : 0;
                q.lat = c.lat[k]; q.lon = c.lon[k]; q.ele_m = c.ele[k]; q.dist_m = d; q.off_route_m = 0; q.end = true;
            }
            return !!q;
        };
        if (e.from && !near(0) && !same(e.from, 0)) c.pois.unshift({ name: e.from, lat: c.lat[0], lon: c.lon[0], ele_m: c.ele[0], dist_m: 0, off_route_m: 0, end: true });
        // 원점회귀(처음 · 끝 이름 같고 300m 안)는 끝 둘레 다른 이름표가 있어도 끝 이름을 붙임(탄금호 순환 그래프 끝이 "루암리" 였음)
        var back = e.from && e.from === e.to && distM(c.lat[0], c.lon[0], c.lat[n], c.lon[n]) < 300;
        // again - 순환 코스 끝(출발과 같은 이름 · 같은 자리)은 그래프에만, 지도에는 출발 이름표 하나(9px 차이로 둘 다 보였음)
        var atEnd = function (nm) { return c.pois.some(function (q) { return q.name === nm && +q.dist_m > c.total - 60; }); };
        if (back ? !atEnd(e.to) : e.to && !near(c.total) && !same(e.to, c.total)) c.pois.push({ name: e.to, lat: c.lat[n], lon: c.lon[n], ele_m: c.ele[n], dist_m: c.total, off_route_m: 0, end: true, again: back });
    }

    /** 국립공원 이름(서버 ParkServlet.PARKS 와 같은 차례). */
    var PARKS = ["지리산", "경주", "계룡산", "한려해상", "설악산", "속리산", "한라산", "내장산", "가야산", "덕유산", "오대산", "주왕산",
        "태안해안", "다도해해상", "북한산", "치악산", "월악산", "소백산", "월출산", "변산반도", "무등산", "태백산", "팔공산"];

    /**
     * 순수 함수 - 코스 이름이 국립공원 이름으로 시작하면 그 공원("지리산 · 백무동 → 천왕봉" · "지리산 자락 21코스" · "지리산(천왕봉) 1코스" → 지리산).
     * 아니면 null. 2026-10-10 홍TV님: 공원 전체 보기 · 공식 안내도 바로가기.
     */
    function parkOf(name) {
        var n = String(name || "").replace(/^\[|\]/g, "").trim();
        for (var i = 0; i < PARKS.length; i++) {
            var p = PARKS[i];
            if (n.indexOf(p) === 0 && (n.length === p.length || /[\s·(]/.test(n.charAt(p.length)))) return p;
        }
        return null;
    }

    /**
     * 순수 함수 - 코스 이름 맨 앞의 산 이름("모악산 · 화율봉 → 모악산" · "마이산 자락 2코스" · "대둔산(마천대) 1코스" → 모악산 · 마이산 · 대둔산).
     * id 가 산림청 코스(frst-)면 앞의 시 · 군 낱말을 건너뜀.
     * 도립 · 군립공원과 다른 산의 전체 보기용(2026-10-11 홍TV님). 국립공원이면 parkOf 가 먼저. 산 이름이 아니면 null.
     */
    /** 산 이름 낱말 - (숫자) + 한글 + 산 · 봉 · 악 · 령 · 대 · 오름 · 고지. 서버 ParkServlet.MOUNTAIN 과 같은 규칙. */
    var MOUNTAIN_WORD = /^(?:[0-9]{1,4}[가-힣]{0,12}|[가-힣]{1,12})(?:산|봉|악|령|대|오름|고지)(?:\(.*\))?$/;
    var MOUNTAIN_HEAD = /^((?:[0-9]{1,4}[가-힣]{0,12}|[가-힣]{1,12})(?:산|봉|악|령|대|오름|고지))(?=[\s·(]|$)/;

    function mountainOf(name, id) {
        var n = String(name || "").replace(/^\[|\]/g, "").trim();
        // 산림청 코스(frst-)는 앞에 시 · 군 - "김제 모악산 · …", "논산 대둔산 마천대 · …" 는 둘째 낱말(2026-10-11 PC)
        // 낱말이 여럿이면 "…산" 으로 끝나는 마지막 낱말("서산 덕산 가야산" → 가야산, "논산 대둔산 마천대" → 대둔산), 없으면 둘째 낱말
        // 2026-10-12 PC(전국 등산 25,809개 중 카드 없음 1,939): 앞에 시 · 구가 둘 이상("인천 영종 국사봉", "전남광주통합 동구 깃대봉"),
        // …오름(제주) · …고지(100고지)도 산으로 봄. 정맥 · 대간 · 숲길은 산이 아니라 그대로 null
        if (/^frst-/.test(id || "")) {
            var head = n.split(" · ")[0].split(/\s+/), pick = -1;
            for (var i = 1; i < head.length; i++) if (MOUNTAIN_WORD.test(head[i]) && /(산|오름|고지)(\(.*\))?$/.test(head[i])) pick = i;
            for (var j = 1; pick < 0 && j < head.length; j++) if (MOUNTAIN_WORD.test(head[j])) pick = j;   // …봉 · 악 · 령 · 대 - 앞에서 첫 것
            if (pick > 0) n = head.slice(pick).join(" ");
        }
        // 숫자로 시작하는 산 이름도("157고지우송대뒷산" - 2026-10-12 PC: 전체 보기 단추가 없었음)
        var m = MOUNTAIN_HEAD.exec(n);
        return m ? m[1] : null;
    }

    /** 순수 함수 - 주소의 % 글자 풀기. 깨진 값(#c=%E0)이면 예외 대신 null - 화면이 멈추지 않게(2026-10-11 오픈 전 점검). */
    function safeDecode(s) {
        try { return decodeURIComponent(s); } catch (e) { return null; }
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

    /**
     * 순수 함수 - 코스 목록에 든 공원 · 산의 탐방 안내도(코스 목록 맨 위 카드). [{name, label, from(그 산 첫 코스 ID), n(코스 수)}].
     * 같은 이름 다른 산(광양 · 정선 · 포천 백운산)은 출발점 거리(20km)로 갈라 따로, 이름은 코스 무리 글("광양 백운산")이 있으면 그것.
     * q(검색어)가 이름에 든 산이 있으면 그 산들만. 코스가 많은 산 먼저, 같으면 목록에 먼저 나온 산.
     * 2026-10-12 홍TV님: 산에 가면 먼저 보는 것이 탐방 안내도 - 첫 화면에서 바로.
     */
    function guideMaps(rows, max, q) {
        var order = [];
        // 공단 코스(knps-)를 먼저 묶어 국립공원 카드의 출발점을 다 모은 뒤 다른 자료 코스를 견줌(2026-11-01 홍TV님 북한산 안내도 둘 -
        // 맨 앞의 이은 코스(출발점 좌표 없음)가 국립공원 카드를 점 없이 만들어, 바로 뒤 산림청 코스가 20km 비교를 못 하고 따로 "북한산(…)" 카드가 됐음)
        var list = (rows || []).filter(function (r) { return /^knps-/.test(String(r.course_id || "")); })
            .concat((rows || []).filter(function (r) { return !/^knps-/.test(String(r.course_id || "")); }));
        list.forEach(function (r) {
            // 국립공원 묶음은 공단 코스(knps-)만 이름으로 - 다른 자료의 "가야산 1코스"(광양)가 국립공원 가야산 카드에 섞여 카드 이름이 "광양 가야산"
            // 이 됐음(2026-10-14 PC). 다른 자료 코스는 아래 거리(20km) 규칙으로 같은 산인지 봄
            var park = /^knps-/.test(String(r.course_id || "")) ? parkOf(r.name) : null, n = park || parkOf(r.name) || mountainOf(r.name, r.course_id);
            if (!n) return;
            // 백두대간 · 정맥 무리("백두대간건의령고적대")는 산이 아님 - 노선 안내도(routeGuides)로(2026-10-12 PC)
            // 다만 "금남정맥안골산" 처럼 뒤에 산 이름이 붙으면 그 산(안골산 - 2026-10-12 PC)
            var tail = !park && /(?:대간|정맥)([가-힣]{1,12}(?:산|봉|악|오름))$/.exec(n), own = false;
            if (tail) { n = tail[1]; own = true; }
            else if (!park && /대간|정맥/.test(nameParts(r.name).group || String(r.name || ""))) return;
            var lat = +r.start_lat, lon = +r.start_lon, has = r.start_lat != null && isFinite(lat) && isFinite(lon);
            // 국립공원 코스는 이름으로 한 장. 그 밖은 같은 이름이고 그 묶음 어느 코스 출발점과 20km 안이면 같은 산
            // (산림청 지리산 코스 → 지리산 국립공원), 멀면 다른 산(광양 · 정선 백운산, 통영 지리산)
            // 이름이 같거나 한쪽이 다른 쪽으로 끝나면(사량도지리산 · 지리산 - 통영 사량도) 같은 이름으로 봄
            var same = function (o) { return o.name === n || (o.name.length > n.length ? o.name.slice(-n.length) === n : n.slice(-o.name.length) === o.name); };
            var g = order.filter(function (o) {
                if (!same(o)) return false;
                if (park && o.park) return true;
                return has ? o.pts.some(function (q) { return distM(lat, lon, q[0], q[1]) < 20000; }) : !o.pts.length;
            })[0];
            if (!g) {
                var grp = nameParts(r.name).group || "";
                g = { name: n, label: !own && grp.indexOf(n) > 0 && grp.length <= n.length + 6 ? grp : n, from: r.course_id, n: 0, park: !!park, pts: [] };
                order.push(g);
            }
            if (park && !g.park) { g.park = true; g.label = n; g.from = r.course_id; }   // 국립공원 코스가 있으면 그 이름 · 그 코스로
            else if (g.label === g.name && !own) {   // 지역이 붙은 무리 이름("포천 백운산")이 뒤에 나오면 그것으로
                var grp2 = nameParts(r.name).group || "";
                if (grp2.indexOf(n) > 0 && grp2.length <= n.length + 6) g.label = grp2;
            }
            if (!g.start) g.start = firstPlace(r.name);
            if (has) g.pts.push([lat, lon]);
            g.n++;
        });
        var key = String(q || "").replace(/\s+/g, "");
        var hit = key ? order.filter(function (g) { return g.label.replace(/\s+/g, "").indexOf(key) >= 0; }) : [];
        var ranked = (hit.length ? hit : order).map(function (g, i) { return { g: g, i: i }; })
            .sort(function (a, b) { return b.g.n - a.g.n || a.i - b.i; }).map(function (x) { return x.g; });
        // 국립공원 카드는 코스 수와 상관없이 맨 앞, 장 수(max)에도 세지 않음(2026-10-14 PC: "가야산" 에서 서산 40 · 나주 18 · 광양 13 에 밀려
        // 국립공원 카드가 빠졌고, 앞에 두니 광양이 빠졌음 - 같은 이름 산이 셋이면 셋 다)
        var out = ranked.filter(function (g) { return g.park; }).concat(ranked.filter(function (g) { return !g.park; }).slice(0, max || 3));
        // 그래도 같은 이름표가 둘 이상이면(지역 없는 백운산 둘) 첫 코스 들머리로 가름: "백운산(오두재)"
        var dup = out.map(function (g) { return out.filter(function (o) { return o.label === g.label; }).length > 1; });
        out.forEach(function (g, i) { if (dup[i] && g.start) g.label += "(" + g.start + ")"; });
        return out.map(function (g) { return { name: g.name, label: g.label, from: g.from, n: g.n }; });
    }

    /**
     * 순수 함수 - 코스 목록에 든 노선(국토종주 자전거길 osmb- · 국가숲길 kmf- · 코리아둘레길 drnb-)의 노선 안내도(route.html) 카드.
     * [{prefix 또는 trail, name, kind, n}],
     * 코스가 많은 노선 먼저. 이름은 "국토종주 섬진강 자전거길 1구간 · …" → 섬진강 자전거길, "지리산둘레길 주천-운봉" → 지리산둘레길.
     * 2026-10-12 홍TV님: 국토종주 자전거길 지도(나무위키 노선도)처럼 노선 전체를 한 장으로.
     */
    function routeGuides(rows, max, series, q) {
        var by = {}, order = [];
        // 다른 자료의 같은 노선(산림청 "금호남정맥 · …" = OSM 금남호남정맥) - series.json 의 이름 · aka 와 무리 이름이 같으면 그 노선(2026-10-12 PC)
        var named = {};
        (series || []).forEach(function (s) {
            if (!s.prefix) return;
            [s.name].concat(s.aka || []).forEach(function (n) { named[String(n).replace(/\s+/g, "")] = s; });
        });
        (rows || []).forEach(function (r) {
            var id = String(r.course_id || ""), m = /^((osmb|kmf|osmh)-[0-9]+-)/.exec(id);
            var alias = !m && named[String(nameParts(r.name).group || "").replace(/\s+/g, "")];
            if (alias) {
                var ak = /^((osmb|kmf|osmh)-[0-9]+-)/.exec(alias.prefix);
                if (!ak) return;
                if (!by[ak[1]]) { by[ak[1]] = { prefix: ak[1], name: alias.name, kind: ak[2] === "osmb" ? "bike" : ak[2] === "osmh" ? "ridge" : "walk", n: 0 }; order.push(by[ak[1]]); }
                by[ak[1]].n++;
                return;
            }
            // 코리아둘레길(두루누비 drnb-) - 코스 ID 에 노선 묶음이 없어 이름("해파랑길 1코스 · …")으로 묶음, trail 로 찾음
            if (!m && /^drnb-/.test(id)) {
                var tn = (nameParts(r.name).group || String(r.name || "")).replace(/\s*\d+(?:-\d+)?\s*(?:코스|\().*$/, "").trim();   // "64-3(지선3코스)" 도 번호에서 뗌(2026-11-03 코스 점검 - "서해랑길 64-3(지선" 카드가 따로 생겼음)
                if (!tn || tn === String(r.name || "").trim()) return;
                var tk = "trail:" + tn.replace(/\s+/g, "");
                if (!by[tk]) { by[tk] = { trail: tn, name: tn, kind: "walk", n: 0 }; order.push(by[tk]); }
                by[tk].n++;
                return;
            }
            if (!m) return;
            if (!by[m[1]]) {
                var g = nameParts(r.name).group, nm = g ? g : String(r.name || "").split(/\s+/)[0];
                nm = nm.replace(/^국토종주\s*/, "").replace(/\s*[0-9]+구간$/, "").trim();
                // ⛰ 는 백두대간 · 정맥만(OSM 등산 · 걷기 노선에는 둘레길 한 구간도 있음 - "지리산둘레길 (가탄-송정)")
                by[m[1]] = { prefix: m[1], name: nm, kind: m[2] === "osmb" ? "bike" : m[2] === "osmh" && /대간|정맥/.test(nm) ? "ridge" : "walk", n: 0 };
                order.push(by[m[1]]);
            }
            by[m[1]].n++;
        });
        // 다른 자료의 같은 길 한 구간(OSM "지리산둘레길 (가탄-송정)" ⊂ 국가숲길 지리산둘레길)은 그 길 카드에 맡김 - 2026-10-12 홍TV님
        var key = function (s) { return String(s || "").replace(/\s+/g, ""); };
        order = order.filter(function (g) {
            return !order.some(function (h) { return h !== g && key(h.name) !== key(g.name) && key(g.name).indexOf(key(h.name) + "(") === 0; });   // "백두대간트레일" 은 다른 길
        });
        // 검색어와 이름이 같은 노선을 맨 앞에(2026-10-12 PC: "호남정맥" 에 금남호남정맥(33) 이 호남정맥(32) 보다 위)
        var qk = key(q), same = function (g) { return qk && key(g.name) === qk ? 1 : 0; };
        return order.map(function (g, i) { return { g: g, i: i }; }).sort(function (a, b) { return same(b.g) - same(a.g) || b.g.n - a.g.n || a.i - b.i; })
            .slice(0, max || 3).map(function (x) { return x.g; });
    }

    /** 순수 함수 - 코스 이름의 들머리("백운산 · 오두재 → 백운산" → 오두재). 없으면 null. */
    function firstPlace(name) {
        var r = nameParts(name).route.split(" → ")[0].trim();
        return r && r !== nameParts(name).route ? r : null;
    }

    /**
     * 순수 함수 - 이름 검색 결과에서 그 길 코스만(이름이 길 이름으로 시작 - "해파랑길 1코스 · …"), "n코스" 번호 순.
     * 길 이름의 띄어쓰기는 무시("DMZ 평화의 길" · "DMZ평화의길"). 2026-10-11 코리아둘레길 완주.
     */
    /**
     * 순수 함수 - 코스 · 구간 번호("해파랑길 19-1코스 · …" → "19-1", "백두대간 46구간" → "46"). 없으면 null.
     * 이름 앞(" · " 앞)의 첫 번호 - 2026-10-12 PC: "서해랑길 64-3(지선3코스)" 가 괄호 안 3 으로 읽혀 3코스와 겹쳤음.
     */
    function courseNo(name) {
        var head = String(name || "").split(" · ")[0];
        if (!/코스|구간/.test(head)) return null;
        var m = /(\d+(?:-\d+)?)/.exec(head);
        return m ? m[1] : null;
    }

    /**
     * 순수 함수 - 위험지역 · 조망점의 길 위 거리(dist_m)를 거꾸로 · 자른 · 이은 코스에 맞게 옮긴 새 배열(2026-11-16 점검 11차 A1).
     * 예전에는 원래 코스 거리 그대로라 왕복 하산길 · &rev=1 · 이은 ★ 대표 코스에서 낙석주의가 그 자리 234m 지나 울렸음(knps-150195 거꾸로).
     * f(거리) → 새 거리, 범위 [lo, hi] 밖이면 dist_m 을 null(알림에 안 씀, 자리 아이콘은 그대로).
     */
    function shiftSpots(spots, f, lo, hi) {
        return (spots || []).map(function (s) {
            var q = {};
            for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) q[k] = s[k];
            if (s.dist_m == null) return q;
            var d = f(+s.dist_m);
            q.dist_m = d >= lo - 1 && d <= hi + 1 ? d : null;
            return q;
        });
    }

    // 2026-10-09 점검: 남이 준 파일이라 크기 · 지점 수에 한도(지점마다 모든 점을 훑어서, 지점이 아주 많으면 화면이 멈춤)
    var GPX_MAX_CHARS = 30 * 1024 * 1024, GPX_MAX_WPT = 1000;
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

    /** 순수 함수 - 코스 이름을 거꾸로: "송산 · 들머리 → 정상" → "송산 · 정상 → 들머리". 화살표가 없으면 "(거꾸로)" 를 붙입니다. */
    function reverseName(name) {
        name = name || "";
        var a = name.indexOf(" → ");
        // "무등산 · 가에서" ↔ "무등산 · 가까지"(이은 구간의 첫 · 끝 조각 이름 - 거꾸로 이어도 처음 · 끝 이름이 남게)
        var one = a < 0 && /^(.*?)(\S+?)(에서|까지)$/.exec(name);
        if (one) return one[1] + one[2] + (one[3] === "에서" ? "까지" : "에서");
        // 국가숲길 "지리산둘레길 가탄-송정" → "지리산둘레길 송정-가탄"(2026-10-12 PC: "(거꾸로)" 대신)
        var ab = a < 0 && /^(.*?)([가-힣]+)-([가-힣]+)(\s*\)?\s*)$/.exec(name);
        if (ab) return ab[1] + ab[3] + "-" + ab[2] + ab[4];
        // 2026-10-23 지리산: 두 번 뒤집으면 "(거꾸로) (거꾸로)" 가 붙었음 - 떼어 원래 이름으로
        if (a < 0) return / \(거꾸로\)$/.test(name) ? name.slice(0, -6) : name + " (거꾸로)";
        var dot = name.lastIndexOf(" · ", a);
        var head = dot >= 0 ? name.slice(0, dot + 3) : "";
        return head + name.slice(head.length).split(" → ").reverse().join(" → ");
    }

    /**
     * 코스를 거꾸로(끝 → 처음) - 올라가다 되돌아 내려올 때 그 길로 안내하려고. 이름표 · 갈림길 거리도 뒤집습니다.
     * c.rev 는 원래 방향인지(저장한 산행을 이어 갈 때 다시 뒤집으려고).
     */
    function reverseCourse(c) {
        // 위치표지 · 공식 정보는 자리(좌표)로 쓰므로 그대로, 위험지역 · 조망점은 길 위 거리를 뒤집음(shiftSpots - 알림이 그 거리로 울림)
        var T = c.total, r = { id: c.id, rev: !c.rev, markers: [], lon: c.lon.slice().reverse(), lat: c.lat.slice().reverse(),
                               ele: c.ele.slice().reverse(), total: T, signs: c.signs || [],
                               spots: shiftSpots(c.spots, function (d) { return T - d; }, 0, T), info: c.info || null, parts: c.parts };
        r.course = {};
        for (var k in c.course) if (Object.prototype.hasOwnProperty.call(c.course, k)) r.course[k] = c.course[k];
        r.course.name = reverseName(c.course.name);
        // 거꾸로 걸으면 오르막 ↔ 내리막, 처음 ↔ 끝(2026-11-03 코스 점검: 3D 시간 · 난이도가 원래 방향 값이었음). 내리막을 모르면 점으로 셈한 오르막
        r.asc = cumAscent(r.ele);
        var up = c.course.ascent_m;
        r.course.ascent_m = c.course.descent_m != null ? c.course.descent_m : Math.round(r.asc[r.asc.length - 1] || 0);
        r.course.descent_m = up;
        if (c.course.start_lat != null || c.course.end_lat != null) {
            r.course.start_lat = c.course.end_lat; r.course.start_lon = c.course.end_lon;
            r.course.end_lat = c.course.start_lat; r.course.end_lon = c.course.start_lon;
        }
        r.dist = c.dist.map(function (d) { return T - d; }).reverse();
        r.pois = c.pois.map(function (p) {
            var q = {};
            for (var k2 in p) if (Object.prototype.hasOwnProperty.call(p, k2)) q[k2] = p[k2];
            q.dist_m = T - (+p.dist_m);
            return q;
        }).sort(function (a, b) { return a.dist_m - b.dist_m; });
        r.junctions = (c.junctions || []).map(function (d) { return T - d; }).sort(function (a, b) { return a - b; });
        if (c.access) r.access = c.access.map(function (p) { var q = Object.assign({}, p); q.dist_m = T - (+p.dist_m); return q; });   // 길찾기 주차장 · 정류장(fromApi)
        return r;
    }

    /*
     * 여러 구간 이어 걷기(2026-10-12 홍TV님: 지리산둘레길 위태-하동호에 덕산-위태 · 하동호-삼화실을 이어서).
     * 이은 코스 ID 는 "구간ID,구간ID~,…"(~ 는 그 구간을 거꾸로). 한 구간이면 예전처럼 그 ID 하나.
     */

    /** 순수 함수 - [{id, rev}] → 이은 코스 ID. */
    function joinId(sel) {
        return (sel || []).map(function (s) { return s.id + (s.rev ? "~" : ""); }).join(",");
    }

    /**
     * 순수 함수 - 이은 코스 ID → [{id, rev, base, r0, r1, from, to}]. 이은 것도 자른 것도 아니면 null.
     * 구간 하나는 "코스ID" 또는 자른 구간 "코스ID@0.1234-0.5678:노고단고개>장터목"(코스 길이의 비율 · 끝 이름 - splitTrails),
     * 뒤의 ~ 는 거꾸로. 자른 구간은 base 코스를 받아 sliceCourse 로 자름.
     */
    function parseJoinId(id) {
        id = String(id || "");
        if (id.indexOf(",") < 0 && id.indexOf("@") < 0) return null;
        return id.split(",").filter(Boolean).map(function (s) {
            var rev = /~$/.test(s), one = rev ? s.slice(0, -1) : s;
            var m = /^([^@]+)@([0-9.]+)-([0-9.]+)(?::([^>]*)>(.*))?$/.exec(one);
            return m ? { id: one, rev: rev, base: m[1], r0: +m[2], r1: +m[3], from: m[4] || null, to: m[5] || null }
                : { id: one, rev: rev, base: one, r0: null, r1: null, from: null, to: null };
        });
    }

    /**
     * 순수 함수 - 탐방로를 다른 탐방로 끝이 닿는 곳(갈림길)에서 잘라 작은 구간으로(2026-10-12 홍TV님: 주능선 노고단고개 → 천왕봉 25km 를
     * 장터목 · 세석에서 갈라지는 탐방로와 이어 고를 수 있게). trails: [{id, name, coords, distance_m, ascent_m}], flips: routeFlips.
     * 끝에서 150m 안 · 갈림길끼리 150m 안은 자르지 않음. 자른 구간 id 는 "코스ID@비율-비율:처음>끝", 이름은 "무리 · 처음 → 끝", 오르막은 모름(null).
     */
    /**
     * 순수 함수 - 이 이름을 붙여도 되는 거리(m). 봉우리 · 정상은 한 점이라 120m, 그 밖(고개 · 대피소 · 마을)은 제한 없음(부르는 쪽 한도).
     * 2026-10-13 홍TV님: 정상 291m 아래(산림청 제석봉 코스 조각 끝)가 "천왕봉" 이 되어 깃발이 "도착 천왕봉" 이었음.
     */
    function peakNearM(name) {
        var n = String(name || "").replace(/\s+/g, "").replace(/\(.*\)$/, "");   // "남대봉 (망경봉)"
        if (/(전망대|쉼터)$/.test(n)) return Infinity;
        // 성문 · 바위문(통천문 · 개천문 · 대남문)도 한 점 - 지리산 정상 아래 갈림길이 263m 떨어진 "통천문" 이 됐음
        return /(봉|정상|오름|대)$/.test(n) ? 120 : /문$/.test(n) ? 150 : Infinity;
    }

    function splitTrails(trails, flips, nearM, poiNames) {
        // near 150m - 대피소가 능선에서 조금 떨어짐(음정 → 벽소령 끝 129m). MIN_M 300m - 짧은 조각은 처음 화면에서 10px 도 안 돼
        // 누를 수 없었음(2026-10-12 PC: 북한산 300m 안 34개) - 끝에서 · 갈림길끼리 이만큼 안은 자르지 않음
        // 갈림길끼리는 JOIN_M(100m) 안만 하나로 - 300m 로 합치면 북한산 대동문 · 보국문처럼 가까운 두 갈림길이 하나가 되어 길이 끊겼음(2026-10-12)
        var near = nearM == null ? 150 : nearM, MIN_M = 300, JOIN_M = 100, out = [];
        var ends = (trails || []).map(function (t) {
            var e = routeEnds(t.name), f = flips && flips[t.id];
            // 국립공원 "성판악 탐방로" · "관음사 탐방로" 는 들머리 이름(2026-10-12 홍TV님: 성판악탐방안내소 → … → 백록담)
            var head = !e.from && !e.to && /^(.+?)\s*탐방로$/.exec(nameParts(t.name).route);
            if (head) e = { from: head[1], to: null };
            return { a: t.coords[0], z: t.coords[t.coords.length - 1], an: f ? e.to : e.from, zn: f ? e.from : e.to };
        });
        (trails || []).forEach(function (t, ti) {
            var c = t.coords, cum = [0];
            for (var i = 1; i < c.length; i++) cum.push(cum[i - 1] + distM(c[i - 1][1], c[i - 1][0], c[i][1], c[i][0]));
            var total = cum[cum.length - 1], cuts = [];
            ends.forEach(function (u, ui) {
                if (ui === ti || trails[ui].id === t.id) return;
                [[u.a, u.an], [u.z, u.zn]].forEach(function (pn) {
                    var best = -1, bd = near;
                    for (var k = 0; k < c.length; k++) {
                        var d = distM(pn[0][1], pn[0][0], c[k][1], c[k][0]);
                        if (d < bd) { bd = d; best = k; }
                    }
                    if (best < 0 || cum[best] < MIN_M || cum[best] > total - MIN_M) return;
                    cuts.push({ k: best, name: pn[1] });
                });
            });
            cuts.sort(function (x, y) { return x.k - y.k; });
            var kept = [];
            cuts.forEach(function (x) {
                var prev = kept[kept.length - 1];
                if (prev && cum[x.k] - cum[prev.k] < JOIN_M) { if (!prev.name) prev.name = x.name; return; }
                kept.push(x);
            });
            if (!kept.length || !total || t.merged || t.nocut) { out.push(t); return; }   // 이은 구간(mergeBare)은 자르지 않음 - 따라가기가 자를 수 없음
            var e = ends[ti], g = nameParts(t.name).group || "", title = nameParts(t.name).route;
            // 갈림길 이름을 모르면("동엽령코스" · "성판악 탐방로" 처럼 이름에 출발 · 도착이 없는 탐방로 끝) 300m 안 다른 탐방로의 이름 있는 끝에서
            var named = function (k) {
                var best = null, bd = 300;
                ends.forEach(function (u) {
                    [[u.a, u.an], [u.z, u.zn]].forEach(function (pn) {
                        // "삼거리" · "갈림길" 은 어디인지 모름(2026-10-12 PC: 지리산 "대원교 → 삼거리")
                        if (!pn[1] || /^(삼거리|갈림길|사거리|정상)$/.test(pn[1])) return;
                        var d = distM(pn[0][1], pn[0][0], c[k][1], c[k][0]);
                        if (d < bd) { bd = d; best = d > peakNearM(pn[1]) ? null : pn[1]; }
                    });
                });
                return best;
            };
            // 그 탐방로 자신의 이름표(api/course 의 pois - 이름에 출발 · 도착이 없는 "종주코스" · "성판악 탐방로" 만 받아 옴, 2026-10-12 홍TV님:
            // 덕유산 종주코스 향적봉 · 중봉 · 백암봉 · 동엽령 …, 성판악 속밭대피소 · 진달래밭대피소 …) - 갈림길은 300m, 탐방로 끝은 700m 안
            var own = function (k, lim, end) {
                var pn = poiNames && poiNames[t.id];
                if (!pn || !pn.total) return null;
                var want = cum[k] / total * pn.total, best = null, bd = lim;
                (pn.pois || []).forEach(function (q) {
                    var nm = placeName(q.name);
                    // 탐방로 끝의 "정상" 은 그 산 정상("한라산동능정상" → 한라산 정상)
                    if (end && nm === "정상" && g) nm = g.replace(/^\S+\s+(?=\S+$)/, "") + " 정상";
                    if (!nm || /^(삼각점|정상|안부\s*\d*|갈림길|삼거리|사거리|헬기장|이정표)$/.test(nm)) return;
                    var d = Math.abs(+q.dist_m - want);
                    // 탐방로 끝에서 700m 까지는 봉우리 · 정상만(산 위 끝), 그 밖 이름은 200m 안(2026-10-13 PC: 북한산 "비매칭코스" 끝 229m 앞 청봉사가 끝 이름 · 들머리가 됐음)
                    if (end && d > 200 && !isTopName(nm) && !/(정상|오름|악)$/.test(nm)) return;
                    if (d < bd) { bd = d; best = nm; }
                });
                return best;
            };
            var bounds = [{ k: 0, name: e.an, end: true }].concat(kept, [{ k: c.length - 1, name: e.zn, end: true }]);
            bounds.forEach(function (x) { if (!x.name) x.name = x.end ? own(x.k, 700, true) || named(x.k) : named(x.k) || own(x.k, 300); });
            for (var b = 0; b < bounds.length - 1; b++) {
                var s0 = bounds[b], s1 = bounds[b + 1], r0 = cum[s0.k] / total, r1 = cum[s1.k] / total;
                var from = s0.name || "", to = s1.name || "";
                // 한쪽만 아는 갈림길(탐방로 끝이 아닌 자른 자리)은 "갈림길" - "월하탄 → 갈림길"
                // 모르는 갈림길은 "갈림길", 모르는 탐방로 끝은 원래 탐방로 이름("대청봉코스(백담) → 황장폭포") - 한 탐방로 안에서 이름 방식이
                // 섞이지 않게("(1/4)" 조각 이름은 뺐음, 2026-10-12 PC)
                // "낙타봉까지" · "선정암에서" · "장불재 부근" 같은 이름은 탐방로 이름으로 쓰지 않음("낙타봉까지 → 안양산" 이 됐음 - 2026-10-13 PC)
                var plain = /(에서|까지|부근)$/.test(title) ? null : title;
                if (!from) from = s0.end ? plain || "탐방로 끝" : "갈림길";
                if (!to) to = s1.end ? plain || "탐방로 끝" : "갈림길";
                out.push({ id: t.id + "@" + r0.toFixed(4) + "-" + r1.toFixed(4) + ":" + from + ">" + to, base: t.id,
                           name: (g ? g + " · " : "") + endsText(from, to), coords: c.slice(s0.k, s1.k + 1),
                           distance_m: Math.round((cum[s1.k] - cum[s0.k]) * (+t.distance_m || total) / total), ascent_m: null });
            }
        });
        return dedupeSegs(out);
    }

    /**
     * 순수 함수 - 같은 길이 여러 벌(산림청 코스는 같은 길을 지나는 코스가 많음 · 백무동 탐방로와 주능선의 장터목 → 천왕봉)이면 하나만.
     * 처음 · 끝이 서로 150m 안(같은 방향이든 거꾸로든)이고 길이가 25% 안이면 같은 것 - 먼저 나온 것(자르지 않은 것 먼저)을 남김.
     * 2026-10-12 PC: 겹친 선을 누르면 다른 것이 잡혔음.
     */
    function dedupeSegs(segs) {
        var keep = [], d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        segs.slice().sort(function (x, y) { return (x.base ? 1 : 0) - (y.base ? 1 : 0); }).forEach(function (s) {
            var a = s.coords[0], z = s.coords[s.coords.length - 1], L = +s.distance_m || 0;
            var same = keep.some(function (k) {
                var ka = k.coords[0], kz = k.coords[k.coords.length - 1], kl = +k.distance_m || 0;
                // 150m - 자른 자리가 탐방로마다 조금 다름(장터목 → 천왕봉 1,361m · 1,464m 가 하나로 안 됐음 - 2026-10-12 PC)
                var ends = (d(a, ka) < 150 && d(z, kz) < 150) || (d(a, kz) < 150 && d(z, ka) < 150);
                return ends && Math.abs(L - kl) <= 0.25 * Math.max(L, kl, 1);   // 25% - 같은 길 두 벌(설악산 중청봉 → 대청봉 550 · 436m)
            });
            if (!same) keep.push(s);
        });
        // 원래 차례대로(그리는 차례 · 테스트가 보는 차례)
        return segs.filter(function (s) { return keep.indexOf(s) >= 0; });
    }

    /**
     * 순수 함수 - 이름 없는 탐방로 조각(무등산 knps-pg… 103개가 모두 "무등산" - 2026-10-12 홍TV님: 무등산도 확인)을 갈림길 사이 한 구간으로 잇고
     * 이름을 붙입니다. 두 조각만 만나는 점(갈림길이 아님)은 지나서 이음. 끝 이름은 places(탐방 안내도 지명) 가운데 가까운 것
     * (갈림길 300m · 막다른 끝 600m), 없으면 "갈림길" · "탐방로 끝". 이은 구간 id 는 이은 코스 ID(첫 조각에 처음 이름, 끝 조각에 끝 이름 -
     * 따라가기 제목), 하나뿐이면 "코스ID@0.0000-1.0000:처음>끝". 이름 있는 탐방로는 그대로.
     */
    function mergeBare(trails, places) {
        var bare = [], out = [], d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        (trails || []).forEach(function (t) {
            // 이름이 산 이름뿐인 조각만(무등산 knps-pg "무등산") - "덕유산 · 종주코스" 같은 공식 탐방로까지 잇던 것(2026-10-12 PC)
            // 공단 2017 자료의 이름 없는 조각(knps-pg…)은 배치가 끝 이름을 붙여도("무등산 · 군왕봉까지") 조각이라 이어 붙임(2026-10-13 PC)
            var piece = /^knps-pg/.test(String(t.id));
            if ((String(t.name || "").indexOf(" · ") >= 0 && !piece) || !t.coords || t.coords.length < 2) out.push(t); else bare.push(t);
        });
        if (!bare.length) return out;
        var nodes = [], node = function (p) {
            for (var i = 0; i < nodes.length; i++) if (d(p, nodes[i].p) < 30) return i;
            nodes.push({ p: p, inc: [] });
            return nodes.length - 1;
        };
        bare.forEach(function (t, i) {
            t._a = node(t.coords[0]); t._z = node(t.coords[t.coords.length - 1]);
            nodes[t._a].inc.push(i); nodes[t._z].inc.push(i);
        });
        var nameAt = function (n) {
            var deg = nodes[n].inc.length, best = null, bd = Infinity;
            (places || []).forEach(function (pl) {
                var nm = placeName(pl.name);
                if (!nm || /^(삼각점|정상|갈림길|삼거리|사거리|헬기장|이정표)$/.test(nm)) return;
                var x = d([+pl.lon, +pl.lat], nodes[n].p);
                if (x < bd) { bd = x; best = nm; }
            });
            if (best && bd < (deg === 1 ? 600 : 300)) return best;
            // 가까이 없으면 1.5km 안 지명 쪽("큰암산 쪽 갈림길") - "갈림길 → 갈림길" 만으로는 어디인지 모름
            var kind = deg === 1 ? "끝" : "갈림길";
            return best && bd < 1500 ? best + " 쪽 " + kind : (deg === 1 ? "탐방로 끝" : "갈림길");
        };
        var used = {}, chains = [];
        var walk = function (n, i) {
            var parts = [], cur = n;
            while (i != null && !used[i]) {
                used[i] = true;
                var t = bare[i], rev = t._a !== cur;
                parts.push({ t: t, rev: rev });
                cur = rev ? t._a : t._z;
                var inc = nodes[cur].inc;
                i = inc.length === 2 ? (inc[0] === bare.indexOf(t) && inc[1] !== inc[0] ? inc[1] : inc[0]) : null;
            }
            chains.push({ parts: parts, a: n, z: cur });
        };
        nodes.forEach(function (nd, n) { if (nd.inc.length !== 2) nd.inc.forEach(function (i) { if (!used[i]) walk(n, i); }); });
        bare.forEach(function (t, i) { if (!used[i]) walk(t._a, i); });   // 갈림길 없는 고리
        chains.forEach(function (ch) {
            // 끝 이름: 그 조각 이름의 처음 · 끝(배치가 붙인 이름 - 무등산 · 군왕봉까지) 먼저, 없으면 지명
            var own = function (p, atStart) {
                var e = routeEnds(p.t.name);
                return atStart ? (p.rev ? e.to : e.from) : (p.rev ? e.from : e.to);
            };
            var fp = ch.parts[0], lp = ch.parts[ch.parts.length - 1];
            var A = own(fp, true) || nameAt(ch.a), B = own(lp, false) || nameAt(ch.z), g = nameParts(bare[0].name).group || bare[0].name, coords = [], L = 0;
            ch.parts.forEach(function (p) {
                var c = p.rev ? p.t.coords.slice().reverse() : p.t.coords;
                coords = coords.concat(coords.length ? c.slice(1) : c);
                L += +p.t.distance_m || 0;
            });
            var id;
            if (ch.parts.length === 1) {
                var one = ch.parts[0];
                id = one.t.id + "@0.0000-1.0000:" + (one.rev ? B + ">" + A : A + ">" + B);
                coords = one.t.coords;   // 하나면 원래 방향 그대로(이름도 그 방향으로)
                if (one.rev) { var x = A; A = B; B = x; }
            } else {
                // 이름은 그 조각 선이 그려진 방향으로 적음(선 처음 = 에서, 선 끝 = 까지) - 거꾸로 걷는 조각은 뒤집으면 맞게 바뀜
                id = joinId(ch.parts.map(function (p, k) {
                    var at = function (nm, walkStart) { return walkStart !== p.rev ? nm + ">" : ">" + nm; };
                    var lab = k === 0 ? "@0.0000-1.0000:" + at(A, true) : k === ch.parts.length - 1 ? "@0.0000-1.0000:" + at(B, false) : "";
                    return { id: p.t.id + lab, rev: p.rev };
                }));
            }
            out.push({ id: id, name: g + " · " + endsText(A, B), coords: coords, distance_m: Math.round(L), ascent_m: ch.parts.length === 1 ? ch.parts[0].t.ascent_m : null, merged: true });
        });
        bare.forEach(function (t) { delete t._a; delete t._z; });
        return out;
    }

    /** 순수 함수 - 처음 · 끝 이름 → "가 → 나"(같으면 "가 부근", 한쪽만이면 "가에서" · "나까지", 둘 다 없으면 ""). */
    function endsText(from, to) {
        // 같은 곳이면 "가 부근"(갈림길 · 끝처럼 어디인지 모르는 이름은 그대로 둘)
        if (LANG === "en") return from && to ? (from === to && !/(갈림길|끝)$/.test(from) ? "around " + from : from + " → " + to) : from ? "from " + from : to ? "to " + to : "";
        if (from && to) return from === to && !/(갈림길|끝)$/.test(from) ? from + " 부근" : from + " → " + to;
        if (from) return from + "에서";
        if (to) return to + "까지";
        return "";
    }

    /**
     * 순수 함수 - 코스의 r0 ~ r1(길이 비율) 부분만. 이름표 · 갈림길 · 위험지역은 그 안의 것만 거리를 당겨서(밖 위험지역은 dist_m null), 위치표지는 그대로(자리로 씀).
     * name 은 새 이름("지리산 · 노고단고개 → 장터목") - 끝 이름표는 endPois 가 이 이름으로.
     */
    function sliceCourse(c, r0, r1, name, id) {
        var d0 = Math.max(0, r0) * c.total, d1 = Math.min(1, r1) * c.total;
        // 끝은 d1 에 닿는 첫 점(점 바로 위에서 자르면 그 점까지)
        var i0 = indexAt(c, d0), j1 = indexAt(c, d1), i1 = Math.min(c.lon.length - 1, c.dist[j1] >= d1 - 0.5 ? j1 : j1 + 1), base = c.dist[i0];
        var s = { id: id || c.id, rev: false, markers: [], lon: c.lon.slice(i0, i1 + 1), lat: c.lat.slice(i0, i1 + 1), ele: c.ele.slice(i0, i1 + 1),
                  signs: c.signs || [], info: null };
        s.dist = c.dist.slice(i0, i1 + 1).map(function (d) { return d - base; });
        s.total = s.dist[s.dist.length - 1];
        s.spots = shiftSpots(c.spots, function (d) { return d - base; }, 0, s.total);
        s.pois = (c.pois || []).filter(function (p) { return !p.end && +p.dist_m >= base - 1 && +p.dist_m <= base + s.total + 1; }).map(function (p) {
            var q = {};
            for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) q[k] = p[k];
            q.dist_m = +p.dist_m - base;
            return q;
        });
        s.junctions = (c.junctions || []).filter(function (d) { return d >= base && d <= base + s.total; }).map(function (d) { return d - base; });
        s.course = {};
        for (var k2 in c.course) if (Object.prototype.hasOwnProperty.call(c.course, k2)) s.course[k2] = c.course[k2];
        s.course.name = name || c.course.name;
        s.course.distance_m = Math.round(s.total);
        s.asc = cumAscent(s.ele);
        // 내리막 · 최고 · 최저 · 두 끝도 자른 구간 것으로(2026-11-03 코스 점검: 오르기만 하는 앞 절반에 코스 전체의 내리막 1,000m 가 남아 3D 시간 · 난이도가 틀렸음)
        var asc = s.asc[s.asc.length - 1] || 0, rg = eleRange(s);
        s.course.ascent_m = Math.round(asc);
        s.course.descent_m = descentOf(s, asc);
        s.course.ele_min_m = rg[0] == null ? null : Math.round(rg[0]);
        s.course.ele_max_m = rg[1] == null ? null : Math.round(rg[1]);
        s.course.start_lat = s.lat[0];
        s.course.start_lon = s.lon[0];
        s.course.end_lat = s.lat[s.lat.length - 1];
        s.course.end_lon = s.lon[s.lon.length - 1];
        endPois(s);
        // 길찾기 주차장 · 정류장(fromApi 의 c.access)도 같은 구간으로 - endPois 가 정리된 이름표로 덮은 뒤에(2026-11-12 점검: 자른 코스에서는 길 밖 "공영주차장" 이 빠졌음)
        if (c.access) s.access = c.access.filter(function (p) { return +p.dist_m >= base - 1 && +p.dist_m <= base + s.total + 1; }).map(function (p) {
            var q = Object.assign({}, p); q.dist_m = +p.dist_m - base; return q;
        });
        return s;
    }

    /**
     * 순수 함수 - 이은 코스 ID(parseJoinId 조각들)와 조각마다 받은 /api/course 답 → 하나로 이은 코스(fromApi 모양). 따라가기 · fly(3D) 가 함께 씀
     * (2026-10-30 홍TV님 "fly(3D) 가 없는데 - 우리가 그 코스를 만들면 되잖아": 대표 코스 숨은벽 · 백운대(밤골)). 조각 하나(갈림길에서 자른 것)도.
     */
    function joinedCourse(id, parts, jsons) {
        var one = function (p, j) {
            var x = fromApi(p.base, j);
            if (x.lon.length < 2) throw new Error("코스 조각 " + p.base + " 의 선이 없습니다");   // 이을 수 없음(2026-10-30 점검: NaN 거리로 그렸음)
            if (p.r0 != null) {
                var g = nameParts(x.course.name).group;
                var label = endsText(p.from, p.to);   // 이은 구간의 첫 조각은 "가에서", 끝 조각은 "나까지"(mergeBare)
                x = sliceCourse(x, p.r0, p.r1, label ? (g || x.course.name) + " · " + label : x.course.name, p.id);
            }
            return x;
        };
        return parts.length === 1 ? one(parts[0], jsons[0])   // 자른 구간 하나 - 거꾸로는 &rev=1 로
            : joinCourses(jsons.map(function (j, i) { var x = one(parts[i], j); return parts[i].rev ? reverseCourse(x) : x; }), id);
    }

    /** 순수 함수 - 이은 코스 조각들의 서로 다른 코스 ID(같은 코스를 앞뒤로 쓰면 한 번만 받게 - 2026-10-30 점검: 밤골 8조각 · 4코스). */
    /**
     * 순수 함수 - 코스(fromApi · joinedCourse 꼴 {lat, lon, ele})를 GPX 편집의 길 점 [위도, 경도, 시각(없음), 높이]로. rev 면 거꾸로.
     * 안내도에서 이어 고른 길을 GPX 편집으로 가져와 새 코스로 만들 때(2026-11-16 홍TV님 "안내도에서 여러개를 이어서 … 코스를 만들려고").
     */
    function courseTrack(c, rev) {
        var out = [];
        for (var i = 0; c && c.lat && i < c.lat.length; i++) {
            var e = c.ele && typeof c.ele[i] === "number" && isFinite(c.ele[i]) ? Math.round(c.ele[i]) : null;
            out.push([c.lat[i], c.lon[i], null, e]);
        }
        return rev ? out.reverse() : out;
    }

    /** 순수 함수 - 기록 하나의 열쇠 "시작 시각|코스 ID" - 따라가기 내 기록 · 기록 보기 ?rec= · GPX 편집 #rec= 가 같이 씀(점검 14차 F2 - 같은 식 여러 벌). 없으면 "". */
    function recKey(r) { return r ? r.start + "|" + (r.courseId || "") : ""; }

    /** 이 기기의 내 기록 목록(따라가기가 쓰는 IndexedDB rf-records, 못 쓰는 기기는 localStorage rf-records) - 기록 보기 · GPX 편집이 같이 씀. 못 읽으면 []. */
    function myRecords() {
        var local = function () { try { var a = JSON.parse(localStorage.getItem("rf-records") || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
        return new Promise(function (resolve) {
            if (!global.indexedDB) { resolve(null); return; }
            var r = indexedDB.open("rf-records", 1);
            r.onupgradeneeded = function () { r.result.createObjectStore("r"); };   // 따라가기와 같은 모양(처음이면 빈 저장소)
            r.onerror = function () { resolve(null); };
            r.onsuccess = function () {
                var db = r.result;
                try {
                    var q = db.transaction("r", "readonly").objectStore("r").get("list");
                    q.onsuccess = function () { db.close(); resolve(Array.isArray(q.result) ? q.result : null); };
                    q.onerror = function () { db.close(); resolve(null); };
                } catch (e) { db.close(); resolve(null); }
            };
        }).then(function (list) {   // 따라가기가 IndexedDB 를 못 써 localStorage 에만 남긴 기록도 합침(따라가기 recordsReady 와 같게, 30개)
            var ls = local();
            return list ? (ls.length ? mergeRecords(list, ls, 30) : list) : ls;
        });
    }

    /** 운영자 기기인가 - GET api/course-upload 의 owner(서버가 /stats 쿠키로 확인). 한 번만 묻고 기억(점검 14차 F2 - 화면마다 같은 물음 여섯 벌). root - 앞 경로("../" 등). */
    var ownerQ = null;
    function ownerDevice(root) {
        if (!ownerQ) ownerQ = fetch((root || "") + "api/course-upload", { headers: { Accept: "application/json" }, cache: "no-store" }).then(function (r) { return r.ok ? r.json() : {}; })
            .then(function (j) { return !!(j && j.owner); }).catch(function () { return false; });
        return ownerQ;
    }

    /**
     * 코스 하나를 받아 fromApi 꼴로(이은 코스 · 자른 구간이면 조각마다 받아 joinedCourse) - GPX 편집 · 코스 보기 · 코스 GPX 저장이 같이 씀
     * (점검 14차 A5, 2026-11-24: 코스 보기 · GPX 저장이 이은 ID 를 api/course 에 한 번에 물어 400 으로 실패했음). json(url) → Promise(JSON, 실패면 reject).
     */
    function courseFetch(id, json) {
        var parts = parseJoinId(id);
        if (!parts) return json("api/course?id=" + encodeURIComponent(id)).then(function (r) { return fromApi(id, r); });
        var bases = partBases(parts);
        return Promise.all(bases.map(function (b) { return json("api/course?id=" + encodeURIComponent(b)); }))
            .then(function (rs) { return joinedCourse(id, parts, partAnswers(parts, bases, rs)); });
    }
    function partBases(parts) {
        var out = [];
        (parts || []).forEach(function (p) { if (out.indexOf(p.base) < 0) out.push(p.base); });
        return out;
    }

    /** 순수 함수 - partBases 차례로 받은 답들 → 조각 차례 답(조각마다 따로 고치므로 복사). */
    function partAnswers(parts, bases, answers) {
        return parts.map(function (p) { return JSON.parse(JSON.stringify(answers[bases.indexOf(p.base)])); });
    }

    /**
     * 순수 함수 - 코스 여러 개(이미 걷는 방향으로 돌린 것)를 하나로 잇습니다. 끝과 다음 처음이 떨어져 있으면 그 거리만큼 더함.
     * 이름은 "무리 N구간 · 처음 → 끝", 이름표 · 갈림길 · 위치표지 · 위험지역은 거리를 밀어 모두. id 는 이은 코스 ID, parts 는 [{id, rev}].
     */
    function joinCourses(list, id) {
        var c = { id: id, rev: false, markers: [], lon: [], lat: [], ele: [], dist: [], pois: [], junctions: [], signs: [], spots: [], info: null,
                  parts: parseJoinId(id) || [] };
        list.forEach(function (p, k) {
            var off = 0, skip = 0;
            if (c.lon.length) {
                var n = c.lon.length - 1, gap = distM(c.lat[n], c.lon[n], p.lat[0], p.lon[0]);
                off = c.dist[n] + gap;
                if (gap < 1) { skip = 1; off = c.dist[n]; }
            }
            for (var i = skip; i < p.lon.length; i++) {
                c.lon.push(p.lon[i]); c.lat.push(p.lat[i]); c.ele.push(p.ele[i]); c.dist.push(off + p.dist[i]);
            }
            (p.pois || []).forEach(function (q) {
                var r = {};
                for (var key in q) if (Object.prototype.hasOwnProperty.call(q, key)) r[key] = q[key];
                r.dist_m = off + (+q.dist_m);
                // 이은 곳의 끝 이름표는 하나만(앞 구간 도착 = 다음 구간 출발)
                // 이름표가 끝 이름이든 지점 이름표든(2026-10-12 PC: 원점회귀 그래프에 천왕봉이 바로 붙어 두 번)
                // 이은 곳 둘레 300m 안(2026-10-12 PC: 중산리 → 천왕봉 선은 천왕봉 이름표 123m 뒤에서 끝나고, 다음 구간 끝과도 115m 떨어짐)
                if (k > 0 && +q.dist_m < 150 && c.pois.some(function (o) { return o.name === q.name && Math.abs(+o.dist_m - r.dist_m) < 300; })) return;
                c.pois.push(r);
            });
            (p.junctions || []).forEach(function (d) { c.junctions.push(off + d); });
            c.signs = c.signs.concat(p.signs || []);
            c.spots = c.spots.concat(shiftSpots(p.spots, function (d) { return off + d; }, -Infinity, Infinity));
            if (k === 0 && p.access) c.access = p.access.map(function (q) { return Object.assign({}, q); });   // 길찾기는 들머리 쪽(첫 구간) 것만(2026-11-12 점검)
        });
        c.total = c.dist.length ? c.dist[c.dist.length - 1] : 0;
        c.asc = cumAscent(c.ele);
        var first = list[0].course || {}, last = list[list.length - 1].course || {}, g = nameParts(first.name).group;
        // 무리 이름: "지리산둘레길 가탄-송정" 처럼 · 가 없으면 끝의 "가-나" 를 뗀 것, "N구간 · N코스" 도 뗌
        g = String(g || String(first.name || "").replace(/\s*\(?[가-힣]+-[가-힣]+\)?\s*$/, "")).replace(/\s*\d+(?:-\d+)?\s*(?:구간|코스|\().*$/, "").trim();   // "64-3(지선3코스)" 도(routeGuides 와 같게)
        // 자전거길은 "인증센터" 를 뗌(제목이 길어 잘림 - 2026-10-12 PC)
        var short = function (x) { return x ? String(x).replace(/인증센터/g, "") : x; };
        var from = short(routeEnds(first.name).from), to = short(routeEnds(last.name).to);
        // "[백두대간 3구간]" 이 3구간째로 읽혀 헷갈림(2026-10-12 PC) - 번호가 있으면 "2~4구간", 없으면 "3구간 이어 걷기"
        var nos = list.map(function (p) { return courseNo(p.course && p.course.name); });
        var nums = nos.every(Boolean) ? nos.map(function (x) { return +String(x).split("-")[0]; }) : null;
        var unit = /코스/.test(String(first.name || "")) ? "코스" : "구간";
        var span = nums ? Math.min.apply(null, nums) + "~" + Math.max.apply(null, nums) + unit : list.length + "구간 이어 걷기";
        var asc = c.asc[c.asc.length - 1] || 0, down = descentOf(c, asc), rg = eleRange(c), lo = rg[0], hi = rg[1];
        // 처음 자리로 돌아오면 "중산리탐방지원센터 원점회귀"(2026-10-12 홍TV님 - 지리산 대표 원점회귀 코스)
        var back = c.lat.length > 1 && distM(c.lat[0], c.lon[0], c.lat[c.lat.length - 1], c.lon[c.lon.length - 1]) < 600;   // 끝이 출발 600m 안(중산리 ↔ 법계교 257m)
        var route = from && (from === to || back) ? from + " 원점회귀" : endsText(from, to);
        // 등산 조각이 하나라도 있으면 등산(2026-10-30 밤골 대표 코스: 매표소 → 효자길(둘레길 walk) 로 시작해 걷기가 됐음 - 난이도 · 시간이 빠짐)
        var kinds = list.map(function (p) { return p.course && p.course.kind; });
        c.course = { name: g + " " + span + (route ? " · " + route : ""), kind: kinds.indexOf("hike") >= 0 ? "hike" : kinds.indexOf("trek") >= 0 ? "trek" : first.kind,
                     distance_m: Math.round(c.total), ascent_m: Math.round(asc), descent_m: down,
                     ele_min_m: lo == null ? null : Math.round(lo), ele_max_m: hi == null ? null : Math.round(hi),
                     start_lat: c.lat[0], start_lon: c.lon[0], end_lat: c.lat[c.lat.length - 1], end_lon: c.lon[c.lon.length - 1] };
        return c;
    }

    /**
     * 순수 함수 - 코스(점 · 이름표)의 [가장 낮은, 가장 높은] 높이(m, 모르면 null). 이은 코스 · 자른 구간이 같이 씀.
     * 지나는 정상의 공식 높이(서버가 이름표에 ele_official 로 붙임)도 최고에 - 이은 코스는 선 높이만 봐서 백운대 836m 가 808m 로 보였음(2026-10-30 PC).
     */
    function eleRange(c) {
        var lo = null, hi = null;
        c.ele.forEach(function (e) { if (e != null) { lo = lo == null ? e : Math.min(lo, e); hi = hi == null ? e : Math.max(hi, e); } });
        (c.pois || []).forEach(function (q) { if (q.ele_official && q.ele_m != null && !(+q.off_route_m > 160)) hi = hi == null ? +q.ele_m : Math.max(hi, +q.ele_m); });
        return [lo, hi];
    }

    /** 순수 함수 - 오르막 합(asc)과 두 끝 높이로 내리막(m). 끝 높이를 모르면 null. 이은 코스 · 자른 구간이 같이 씀. */
    function descentOf(c, asc) {
        var e0 = c.ele[0], e1 = c.ele[c.ele.length - 1];
        return e0 == null || e1 == null ? null : Math.max(0, Math.round(asc - (e1 - e0)));
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
        // 붙일 길의 시각이 앞 길 끝보다 이르면(다른 날 · 뒤집은 길) 그 시각은 비움 - GPX 시각이 뒤로 가지 않게(점검 11차 A15)
        var lastT = null;
        for (var i = x.length - 1; i >= 0 && lastT == null; i--) if (typeof x[i][2] === "number") lastT = x[i][2];
        var firstT = null;
        for (var k = 0; k < y.length && firstT == null; k++) if (typeof y[k][2] === "number") firstT = y[k][2];
        if (lastT != null && firstT != null && firstT < lastT) y = y.map(function (p) { return [p[0], p[1], null].concat(p.slice(3)); });
        return x.concat(y);
    }

    /**
     * 순수 함수 - 두 길을 어느 끝끼리 이을지(2026-11-16 홍TV님 "잇기가 되는 것이 있고 안 되는 것이 있어": 예전에는 고른 길 끝 → 붙일 길 처음만 재서
     * 방향이 반대인 길은 손으로 뒤집어야 했고, 붙일 길이 고른 길 앞에 닿으면 아예 못 이었음). 네 가지 끝 짝 가운데 가장 가까운 것.
     * 고른 길 a 의 방향은 그대로 두고 b 를 뒤집거나 앞에 붙임. 같은 거리면 아래 차례(뒤에 그대로가 먼저).
     * 돌려줌 {gap(m), how: "ab" 뒤에 · "ab~" 뒤집어 뒤에 · "ba" 앞에 · "b~a" 뒤집어 앞에, track: 이은 길}.
     */
    function joinPlan(a, b) {
        var A0 = a[0], A1 = a[a.length - 1], B0 = b[0], B1 = b[b.length - 1];
        var d = function (p, q) { return distM(p[0], p[1], q[0], q[1]); };
        var ps = [{ gap: d(A1, B0), how: "ab" }, { gap: d(A1, B1), how: "ab~" }, { gap: d(B1, A0), how: "ba" }, { gap: d(B0, A0), how: "b~a" }];
        var best = ps[0];
        for (var i = 1; i < ps.length; i++) if (ps[i].gap < best.gap) best = ps[i];
        var rb = best.how.indexOf("~") >= 0 ? reverseTrack(b) : b;
        best.track = best.how.charAt(0) === "a" ? joinTracks(a, rb) : joinTracks(rb, a);
        return best;
    }

    /**
     * 순수 함수 - 이웃 두 점 사이가 가장 먼 곳 {m, at(그 앞까지 거리 m)} - 곧은 선(산을 가로지르는 선)이 든 길을 코스로 만들지 않게(2026-11-16 홍TV님
     * "이런 코스는 만들면 안 돼잖아": 🔗 잇기가 2km 떨어진 두 끝을 곧은 선으로 이었음). track: [[위도, 경도, …]…]. 점이 둘 안 되면 {m: 0, at: 0}.
     */
    var JOIN_GAP_M = 200;
    /**
     * 순수 함수 - 점 줄이기(더글러스-퓨커, tolM 미터 안에서 모양이 같게 - 점검 11차 E6). 처음 · 끝은 늘 남기고 남긴 점의 시각 · 높이는 그대로.
     * 올리기 전 큰 GPX(점 몇 만 개)를 가볍게. track: [[위도, 경도, 시각, 높이]…].
     */
    function simplifyTrack(track, tolM) {
        var t = track || [], n = t.length;
        if (n < 3) return t.slice();
        var lat0 = t[0][0] * Math.PI / 180, kx = 111320 * Math.cos(lat0), ky = 110540;
        var xy = t.map(function (p) { return [p[1] * kx, p[0] * ky]; }), keep = new Array(n), stack = [[0, n - 1]];
        keep[0] = keep[n - 1] = true;
        while (stack.length) {
            var se = stack.pop(), a = se[0], b = se[1], ax = xy[a][0], ay = xy[a][1], dx = xy[b][0] - ax, dy = xy[b][1] - ay, L = dx * dx + dy * dy, far = -1, fd = tolM;
            for (var i = a + 1; i < b; i++) {
                var px = xy[i][0] - ax, py = xy[i][1] - ay, u = L ? Math.max(0, Math.min(1, (px * dx + py * dy) / L)) : 0, d = Math.hypot(px - u * dx, py - u * dy);
                if (d > fd) { fd = d; far = i; }
            }
            if (far > 0) { keep[far] = true; stack.push([a, far], [far, b]); }
        }
        return t.filter(function (p, i) { return keep[i]; });
    }

    /**
     * 순수 함수 - 점 사이가 stepM 넘으면 사이에 점을 더 둠(높이 그래프가 맞게). 단 maxM(곧은 선 한도 JOIN_GAP_M) 넘는 사이는 그대로 -
     * 2026-11-22 점검: GPX 편집 "다 그림" 이 곧은 선 위에도 30m 마다 점을 채워 longestJump · 서버 CourseUploadServlet.check 가 그린 곧은 선을 못 잡았음.
     */
    function densify(track, stepM, maxM) {
        var t = track || [], out = t.length ? [t[0]] : [];
        for (var i = 1; i < t.length; i++) {
            var a = t[i - 1], b = t[i], d = distM(a[0], a[1], b[0], b[1]), k = d <= maxM ? Math.floor(d / stepM) : 0;
            for (var j = 1; j <= k; j++) out.push([a[0] + (b[0] - a[0]) * j / (k + 1), a[1] + (b[1] - a[1]) * j / (k + 1)]);
            out.push(b);
        }
        return out;
    }

    function longestJump(track) {
        var t = track || [], best = { m: 0, at: 0 }, d = 0;
        for (var i = 1; i < t.length; i++) {
            var g = distM(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]);
            if (g > best.m) best = { m: g, at: d };
            d += g;
        }
        return best;
    }

    /**
     * 순수 함수 - 길을 거꾸로(끝 → 처음). 시각은 걸린 시간 그대로 앞으로 가게 비춤(t0 + t1 - t) - 그대로 뒤집으면 GPX 시각이 줄어드는 차례가 되어
     * 다른 앱이 이상하게 읽고 "걸린 시간" 이 없어졌음(점검 11차 A15, 2026-11-16). 점: [위도, 경도, 시각, 높이].
     */
    function reverseTrack(track) {
        var t = (track || []).slice().reverse(), ts = t.map(function (p) { return p[2]; }).filter(function (v) { return typeof v === "number"; });
        if (!ts.length) return t;
        var sum = Math.min.apply(null, ts) + Math.max.apply(null, ts);
        return t.map(function (p) { return typeof p[2] === "number" ? [p[0], p[1], sum - p[2]].concat(p.slice(3)) : p; });
    }

    /**
     * 순수 함수 - GPX 편집 "⭕ 원점회귀로"(2026-11-16 홍TV님: 안내도에서 연 지리산 고리가 법계교에서 시작해 탐방지원센터에서 끝났음).
     * 출발 · 도착 한쪽이 지나온 길 위(touchM 안)에 있으면 그 사이를 같은 길로 한 번 더 걸어 출발 = 도착으로 만듦.
     * - 도착이 앞부분 길 위: 그 자리 → 출발을 거꾸로 뒤에 붙임(출발은 그대로)
     * - 출발이 뒷부분 길 위: 도착 → 그 자리를 거꾸로 앞에 붙임(도착이 새 출발 - 들머리에서 갈림길까지 올라갔다 고리를 돌고 내려옴)
     * 둘 다 되면 더하는 길이 짧은 쪽. 더한 점은 시각을 비움(같은 시각 두 번 없게). track: [[위도, 경도, 시각, 높이]…].
     * 돌려줌: {track, addM, at: "end"|"start"} · 이미 원점회귀면 {same: true} · 안 되면 {nearM: 지나온 길과 가장 가까운 거리}.
     */
    var LOOP_SAME_M = 30;
    function loopTrack(track, touchM) {
        var t = track || [], n = t.length, lim = touchM || 50;
        if (n < 3) return { nearM: Infinity };
        var s = t[0], e = t[n - 1];
        if (distM(s[0], s[1], e[0], e[1]) < LOOP_SAME_M) return { same: true };
        var cum = [0];
        for (var i = 1; i < n; i++) cum.push(cum[i - 1] + distM(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]));
        var total = cum[n - 1], nearE = { d: Infinity }, nearS = { d: Infinity };
        var bare = function (p) { return [p[0], p[1], null, p.length > 3 ? p[3] : null]; };
        // 도착이 지나온 길 위(출발에서 30m 넘게 간 곳) - 그 자리 j 에서 출발까지 거꾸로.
        // 도착 바로 앞(도착에서 touchM 안으로 이어진 끝 꼬리)만 빼고 찾음 - 예전에는 앞쪽 절반만 봐서 들머리 → 고리가 고리보다 길면 못 했음(점검 11차 A14)
        var tail = n - 1, head = 0;
        while (tail > 0 && distM(e[0], e[1], t[tail][0], t[tail][1]) < lim) tail--;
        while (head < n - 1 && distM(s[0], s[1], t[head][0], t[head][1]) < lim) head++;
        for (var j = 1; j <= tail; j++) {
            var dj = distM(e[0], e[1], t[j][0], t[j][1]);
            if (cum[j] >= LOOP_SAME_M && dj < nearE.d) nearE = { d: dj, k: j, addM: cum[j], at: "end" };
        }
        // 출발이 지나온 길 위(도착에서 30m 넘게 떨어진 곳, 출발 바로 뒤 머리는 빼고) - 도착에서 그 자리 k 까지 거꾸로 앞에
        for (var k = n - 2; k >= head && k > 0; k--) {
            var dk = distM(s[0], s[1], t[k][0], t[k][1]), back = total - cum[k];
            if (back >= LOOP_SAME_M && dk < nearS.d) nearS = { d: dk, k: k, addM: back, at: "start" };
        }
        // 각 쪽에서 가장 가까운 점(갈림길 자리)으로 - 둘 다 닿으면 더하는 길이 짧은 쪽
        var ok = [nearE, nearS].filter(function (x) { return x.d < lim; }).sort(function (a, b) { return a.addM - b.addM; }), best = ok[0];
        if (!best) return { nearM: Math.round(Math.min(nearE.d, nearS.d)) };
        var out = best.at === "end" ? t.concat(t.slice(0, best.k).reverse().map(bare))
            : t.slice(best.k + 1).reverse().map(bare).concat(t);
        return { track: out, addM: Math.round(best.addM), at: best.at };
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

    function trackGpx(name, kind, track, opt) {
        var esc = function (x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
        var t = track || [], first = t[0] && t[0][2], wpts = "", meta = "";
        // 💾 저장 파일에는 출발 · 정상(가장 높은 점) · 도착 표시와 만든 때(점검 11차 E6, 2026-11-16 홍TV님 "전부 작업해") - 올리기 · 보내기는 점만(서버가 trkpt 만 읽음)
        if (opt && opt.wpt && t.length > 1) {
            var hi = -1;
            t.forEach(function (p, i) { if (p[3] != null && (hi < 0 || p[3] > t[hi][3])) hi = i; });
            var w = function (p, nm) { return '<wpt lat="' + p[0] + '" lon="' + p[1] + '">' + (p[3] != null ? "<ele>" + Math.round(p[3] * 10) / 10 + "</ele>" : "") + "<name>" + esc(nm) + "</name></wpt>\n"; };
            wpts = w(t[0], opt.en ? "Start" : "출발") + (hi > 0 && hi < t.length - 1 ? w(t[hi], opt.en ? "Highest point" : "가장 높은 곳") : "") + w(t[t.length - 1], opt.en ? "Finish" : "도착");
            meta = "<metadata><name>" + esc(name || "GPX") + "</name>" + (opt.credit ? "<desc>" + esc(opt.credit) + "</desc>" : "") + (typeof first === "number" ? "<time>" + new Date(first).toISOString() + "</time>" : "") + "</metadata>\n";
        }
        return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="routefly studio" xmlns="http://www.topografix.com/GPX/1/1">\n' + meta + wpts
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
     * 보내기 창 - o = {name, kind, track, sent(알림 글)}. 앞 · 뒤 자르기는 GPX 편집의 ✂ 도구로 먼저(2026-11-24 - 따라가기 내 기록의 등록 요청은 GPX 편집으로 옮김).
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
            + '<p style="margin:0"><span class="km tip"></span></p>'
            + '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px"><input type="checkbox" class="ag" style="margin-top:3px"><span class="agt"></span></label>'
            + '<p class="er" role="alert" style="color:#ff8787;margin:8px 0 0"></p>'
            + '<p style="display:flex;gap:8px;margin:12px 0 0"><button type="button" class="no" style="flex:1">' + tr("취소", "Cancel") + '</button><button type="button" class="go main" style="flex:1">' + tr("보내기", "Send") + '</button></p>';
        box.querySelector(".agt").textContent = submitAgree();
        box.querySelector(".nm").value = String(o.name || "").slice(0, 60);
        box.querySelector(".sd").value = sender;
        box.querySelector(".kd").value = /^(hike|walk|bike)$/.test(o.kind) ? o.kind : "hike";
        wrap.appendChild(box);
        document.body.appendChild(wrap);
        function close() { wrap.remove(); }
        box.querySelector(".km").textContent = km(trackStats(track).dist) + " km";
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

    /** 순수 함수 - 기록 합치기: 같은 시작 시각 · 코스는 하나로(지금 것을 남김), 최근 것부터 max 개. */
    function mergeRecords(cur, add, max) {
        var seen = {}, out = [];
        (cur || []).concat(add || []).forEach(function (r) {
            if (!r || typeof r.start !== "number" || !Array.isArray(r.track)) return;
            var k = recKey(r);
            if (seen[k]) return;
            seen[k] = 1;
            out.push(r);
        });
        out.sort(function (a, b) { return b.start - a.start; });
        return out.slice(0, max);
    }

    global.RF = {
        num: num,
        km: km,
        nameParts: nameParts,
        PARKS: PARKS,
        guideMaps: guideMaps,
        routeGuides: routeGuides,
        safeDecode: safeDecode,
        nameText: nameText,
        trimTrack: trimTrack,
        gpxTracks: gpxTracks,
        trackStats: trackStats,
        splitTrack: splitTrack,
        joinTracks: joinTracks,
        joinPlan: joinPlan,
        trackGpx: trackGpx,
        courseFetch: courseFetch,
        recKey: recKey,
        myRecords: myRecords,
        ownerDevice: ownerDevice,
        submitSheet: submitSheet,
        courseName: courseName,
        sourceText: sourceText,
        cutMiddle: cutMiddle,
        osmRoute: osmRoute,
        WALK_WAYS: WALK_WAYS,
        trailsToElements: trailsToElements,
        overlapShare: overlapShare,
        routeEnds: routeEnds,
        parseJoinId: parseJoinId,
        loopTrack: loopTrack,
        reverseTrack: reverseTrack,
        longestJump: longestJump,
        densify: densify,
        simplifyTrack: simplifyTrack,
        JOIN_GAP_M: JOIN_GAP_M,
        distM: distM,
        mapLocale: mapLocale,
        courseTrack: courseTrack
    };
})(window);
