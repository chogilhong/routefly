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
     * 불러온 GPX 를 이 기기에 둡니다(따라가기 · 코스 미리보기가 같이 씀). 코스 ID "gpx-<글자 지문>"(같은 파일은 같은 ID),
     * 최근 GPX_KEEP 개만. 서버에는 올리지 않습니다.
     */
    var GPX_PREFIX = "gpx-", GPX_LIST_KEY = "rf-gpx-list", GPX_KEEP = 10;
    function gpxId(text) {
        var h = 5381;
        for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
        return GPX_PREFIX + (h >>> 0).toString(36) + "-" + text.length.toString(36);
    }
    function storeGpx(id, api) {
        var list;
        try { list = JSON.parse(localStorage.getItem(GPX_LIST_KEY) || "[]"); } catch (e) { list = []; }
        list = [id].concat(list.filter(function (x) { return x !== id; }));
        list.slice(GPX_KEEP).forEach(function (old) { try { localStorage.removeItem("rf-" + old); } catch (e) { /* 무시 */ } });
        localStorage.setItem("rf-" + id, JSON.stringify(api));   // 공간이 모자라면 여기서 던집니다(부르는 쪽이 알림)
        localStorage.setItem(GPX_LIST_KEY, JSON.stringify(list.slice(0, GPX_KEEP)));
    }
    var GPX_JOIN_M = 60;   // 구간(trk · trkseg) 끝끼리 이 안이면 이어진 길

    /**
     * 순수 함수 - 여러 구간을 한 줄로. 가장 긴 구간에서 시작해 끝이 GPX_JOIN_M 안에 닿는 구간만(필요하면 뒤집어) 붙입니다.
     * 떨어진 구간(옆 가지 · 다른 날 기록)은 뺍니다 - 다 이으면 빈 곳이 곧은 선으로 지도에 그려지고 거리에도 들어갑니다
     * (komount 돌산 4: trk 3개, 빈 곳 241m · 1,396m - 배치는 1.75km, 다 이으면 3.67km).
     */
    function joinSegments(segs) {
        if (!segs.length) return [];
        var len = function (s) { var d = 0; for (var i = 1; i < s.length; i++) d += distM(s[i - 1][0], s[i - 1][1], s[i][0], s[i][1]); return d; };
        var rest = segs.slice().sort(function (a, b) { return len(b) - len(a); });
        var line = rest.shift().slice();
        for (;;) {
            var best = null;
            rest.forEach(function (s, k) {
                var h = line[0], t = line[line.length - 1], a = s[0], z = s[s.length - 1];
                [[distM(t[0], t[1], a[0], a[1]), "tail", false], [distM(t[0], t[1], z[0], z[1]), "tail", true],
                 [distM(h[0], h[1], z[0], z[1]), "head", false], [distM(h[0], h[1], a[0], a[1]), "head", true]].forEach(function (o) {
                    if (o[0] <= GPX_JOIN_M && (!best || o[0] < best.d)) best = { k: k, d: o[0], at: o[1], rev: o[2] };
                });
            });
            if (!best) break;
            var s = rest.splice(best.k, 1)[0].slice();
            if (best.rev) s.reverse();
            line = best.at === "tail" ? line.concat(s) : s.concat(line);
        }
        return line;
    }

    // 2026-10-09 점검: 남이 준 파일이라 크기 · 지점 수에 한도(지점마다 모든 점을 훑어서, 지점이 아주 많으면 화면이 멈춤)
    var GPX_MAX_CHARS = 30 * 1024 * 1024, GPX_MAX_WPT = 1000;
    function gpxToApi(text, fileName) {
        if (String(text || "").length > GPX_MAX_CHARS) throw new Error("GPX 파일이 너무 큽니다(30MB 까지).");
        var doc = new DOMParser().parseFromString(String(text || ""), "application/xml");
        var root = doc.documentElement;
        if (!root || (root.localName || root.nodeName) !== "gpx" || doc.getElementsByTagName("parsererror").length) {
            throw new Error("GPX 파일이 아닙니다.");
        }
        function kids(el, name) {
            var out = [];
            if (!el) return out;
            for (var n = el.firstElementChild; n; n = n.nextElementSibling) if ((n.localName || n.nodeName) === name) out.push(n);
            return out;
        }
        function first(el, name) { return kids(el, name)[0] || null; }
        function txt(el) { var t = el && el.textContent != null ? el.textContent.trim() : ""; return t === "" ? null : t; }
        function numOf(s) { var v = s == null || String(s).trim() === "" ? NaN : Number(s); return v; }
        function valid(lat, lon) { return isFinite(lat) && isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0); }
        function point(el) {
            var lat = numOf(el.getAttribute("lat")), lon = numOf(el.getAttribute("lon")), e = numOf(txt(first(el, "ele")));
            return valid(lat, lon) ? [lat, lon, isFinite(e) ? e : null] : null;
        }
        var segs = [];
        kids(root, "trk").forEach(function (t) { kids(t, "trkseg").forEach(function (s) {
            var seg = [];
            kids(s, "trkpt").forEach(function (p) { var q = point(p); if (q) seg.push(q); });
            if (seg.length) segs.push(seg);
        }); });
        if (!segs.length) kids(root, "rte").forEach(function (r) {
            var seg = [];
            kids(r, "rtept").forEach(function (p) { var q = point(p); if (q) seg.push(q); });
            if (seg.length) segs.push(seg);
        });
        var raw = joinSegments(segs);
        if (raw.length < 2) throw new Error("GPX 에 경로 점이 2개보다 적습니다(trk · rte).");
        // 솎기 - CourseMath.thin 과 같은 규칙
        var pts = [raw[0]], kept = raw[0], last = raw.length - 1;
        for (var i = 1; i < last; i++) {
            if (distM(kept[0], kept[1], raw[i][0], raw[i][1]) >= GPX_SPACING_M) { pts.push(raw[i]); kept = raw[i]; }
        }
        if (pts.length > 1 && distM(kept[0], kept[1], raw[last][0], raw[last][1]) < GPX_SPACING_M / 2) pts[pts.length - 1] = raw[last];
        else pts.push(raw[last]);
        var points = [], d = 0;
        pts.forEach(function (p, k) {
            if (k) d += distM(pts[k - 1][0], pts[k - 1][1], p[0], p[1]);
            points.push([p[1], p[0], p[2] == null ? null : Math.round(p[2] * 10) / 10, Math.round(d)]);
        });
        var pois = [];
        kids(root, "wpt").slice(0, GPX_MAX_WPT).forEach(function (w) {
            var lat = numOf(w.getAttribute("lat")), lon = numOf(w.getAttribute("lon")), nm = txt(first(w, "name"));
            if (nm && nm.length > 80) nm = nm.slice(0, 80);
            if (!valid(lat, lon) || nm == null) return;
            var best = 0, bd = Infinity;
            points.forEach(function (p, k) { var x = distM(lat, lon, p[1], p[0]); if (x < bd) { bd = x; best = k; } });
            var e = numOf(txt(first(w, "ele")));
            pois.push({ name: nm, lat: lat, lon: lon, ele_m: isFinite(e) ? e : null, dist_m: points[best][3], off_route_m: Math.round(bd) });
        });
        pois.sort(function (a, b) { return a.dist_m - b.dist_m; });
        pois.forEach(function (p, k) { p.seq = k + 1; });
        var name = txt(first(first(root, "metadata"), "name")) || txt(first(first(root, "trk"), "name")) || txt(first(first(root, "rte"), "name"))
            || String(fileName || "GPX").replace(/\.gpx$/i, "");
        var type = (txt(first(first(root, "trk"), "type")) || "").toLowerCase();
        var kind = /bik|cycl|자전거|ride/.test(type) ? "bike" : /walk|걷기/.test(type) ? "walk" : "hike";
        // 요약 칸(서버 코스와 같은 이름) - 목록 · 코스 미리보기 거리 줄이 씁니다(없으면 "-km · 약 NaN분")
        var up = 0, down = 0, ref = null, lo = null, hi = null;
        points.forEach(function (p) {
            var e = p[2];
            if (e == null) return;
            lo = lo == null ? e : Math.min(lo, e);
            hi = hi == null ? e : Math.max(hi, e);
            // GPS 고도 흔들림은 3m 넘게 바뀔 때만 셉니다
            if (ref == null) ref = e;
            else if (e - ref >= 3) { up += e - ref; ref = e; }
            else if (ref - e >= 3) { down += ref - e; ref = e; }
        });
        var a = pts[0], z = pts[pts.length - 1];
        var course = { name: name, kind: kind, distance_m: points[points.length - 1][3], point_cnt: points.length,
                       ascent_m: hi == null ? null : Math.round(up), descent_m: hi == null ? null : Math.round(down),
                       ele_min_m: lo == null ? null : Math.round(lo), ele_max_m: hi == null ? null : Math.round(hi),
                       start_lat: a[0], start_lon: a[1], end_lat: z[0], end_lon: z[1] };
        return { course: course, points: points, pois: pois };
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
        // opts.top - 부르는 쪽이 정한 값(기록 보기: "가장 높은 곳" 과 같은 recordHighest, 2026-11-25 홍TV님 "일치해야지" - 화대종주 그래프 1,897 · 요약 1,915)
        var top = opts.top != null ? opts.top : c.course && c.course.ele_max_m != null && +c.course.ele_max_m >= max ? +c.course.ele_max_m : max;
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
        fromApi: fromApi,
        gpxToApi: gpxToApi,
        gpxId: gpxId,
        storeGpx: storeGpx,
        baseStyle: baseStyle,
        trackGpx: trackGpx,
        profile: profile,
        setLang: setLang,
        tr: tr,
        pageLang: pageLang,
        applyEn: applyEn,
        mapLocale: mapLocale
    };
})(window);
