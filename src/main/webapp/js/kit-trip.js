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

    /**
     * "3시간 5분" - 2026-10-09 점검: 분을 먼저 반올림하고 시 · 분을 나눕니다(예전에는 3시간 59분 40초가 "3시간 0분").
     * withZeroHour 면 1시간 안 될 때도 "0시간 40분".
     */
    function hm(ms, withZeroHour) {
        var m = Math.max(0, Math.round(ms / 60000)), h = Math.floor(m / 60);
        if (LANG === "en") return (h || withZeroHour ? h + " h " : "") + (m % 60) + " min";
        return (h || withZeroHour ? h + "시간 " : "") + (m % 60) + "분";
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

    /** 공단 오름 시간이 선 1km 에 이보다 길면 선이 공식 구간의 일부(2026-10-30 점검: 공단 코스 147개는 40 ~ 55분, 설악산 소공원 → 희운각 1.47km 에 230분). */
    var INFO_PART_MIN_PER_KM = 65;

    /** 순수 함수 - 공단 시간이 이 선(distM) 전체가 아니라 더 긴 공식 구간 것인가. 거리 · 시간이 없으면 false. */
    function infoPartial(info, distM) {
        return !!info && +info.up_min > 0 && +distM > 0 && +info.up_min / (+distM / 1000) > INFO_PART_MIN_PER_KM;
    }

    /**
     * 공식 정보(국립공원 탐방로 자료) → "공단 기준 오름 4시간 · 내림 3시간 · 난이도 2.27". 없으면 null.
     * info: {up_min, down_min, level} (api/course 의 info).
     * distM - 선 길이(있으면 공단 시간이 더 긴 공식 구간 것일 때 그렇다고 덧붙임 - infoPartial).
     */
    function infoText(info, distM) {
        if (!info) return null;
        var parts = [], part = infoPartial(info, distM);
        if (LANG === "en") {
            if (+info.up_min > 0) parts.push("up " + hm(+info.up_min * 60000));
            if (+info.down_min > 0) parts.push("down " + hm(+info.down_min * 60000));
            return parts.length ? "Park service: " + parts.join(" · ") + (part ? " (for the whole official route - this line is only part of it)" : "") : null;
        }
        if (+info.up_min > 0) parts.push("오름 " + hm(+info.up_min * 60000));
        if (+info.down_min > 0) parts.push("내림 " + hm(+info.down_min * 60000));
        if (info.level != null && String(info.level).trim()) parts.push("난이도 " + String(info.level).trim());
        return parts.length ? "공단 기준 " + parts.join(" · ") + (part ? " (공단 시간은 전체 구간 기준 - 이 선은 그 일부)" : "") : null;
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

    /** 국립공원 이름(서버 ParkServlet.PARKS 와 같은 차례). */
    var PARKS = ["지리산", "경주", "계룡산", "한려해상", "설악산", "속리산", "한라산", "내장산", "가야산", "덕유산", "오대산", "주왕산",
        "태안해안", "다도해해상", "북한산", "치악산", "월악산", "소백산", "월출산", "변산반도", "무등산", "태백산", "팔공산"];

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

    /** 구간 끊는 곳 둘이 이만큼(m, minGapM 보다 크지 않게) 안이면 같은 자리 - 선에 더 가까운 이름 하나로(trackSegments). */
    var SAME_CUT_M = 300;
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
            // 지날 때마다(원점회귀로 비선대를 오갈 때 두 번 - 2026-11-26 홍TV님 "소공원 ~ 비선대 … 비선대 ~ 소공원")
            passesNear(c, s.lat, s.lon, maxM).forEach(function (q) {
                if (q.d > minGapM && q.d < c.total - minGapM) cuts.push({ d: q.d, off: q.off, name: s.name || null });
            });
        });
        cuts.sort(function (a, b) { return a.d - b.d; });
        var at0 = [0], names = [null], offs = [0], asc = c.asc || cumAscent(c.ele);
        cuts.forEach(function (q) {
            var k = at0.length - 1;
            // 거의 같은 자리(SAME_CUT_M 안)에 둘이면 선에 더 가까운 이름으로(2026-11-26 홍TV님: 무너미고개에서 끊은 곳이 옆 "희운각대피소" 로 나왔음 - "희운각은 안 들렸어")
            if (k > 0 && Math.abs(q.d - c.dist[at0[k]]) < Math.min(SAME_CUT_M, minGapM)) { if (q.off < offs[k]) { names[k] = q.name; offs[k] = q.off; } return; }
            if (q.d - c.dist[at0[k]] < minGapM) return;
            var i = indexAt(c, q.d) + 1;
            if (i > at0[k] && i < n - 1) { at0.push(i); names.push(q.name); offs.push(q.off); }
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
     * 순수 함수 - 공단 탐방로(/api/park trails - name "설악산 · 비선대 → 마등령", coords [[경도, 위도], …])의 처음 · 끝 → [{name, lat, lon}](구간 끊는 곳 - 갈림길, 2026-11-26 홍TV님).
     * 이름에 " → " 가 없는 탐방로는 뺌(어느 끝이 어디인지 모름). 같은 이름 · 같은 자리(50m 안)는 하나.
     * places(/api/park places - 탐방로 위 지점 이름 · 자리)가 끝에서 PLACE_END_M 안이면 그 이름으로 - 공단 탐방로 "소공원 → 희운각대피소" 는 끝이 실제로는
     * 무너미고개 갈림길(희운각대피소는 약 190m 남쪽)이라 "희운각대피소" 로 끊겼음(2026-11-26 홍TV님 "희운각은 안 들렸어", PC 가 운영 응답으로 확인).
     */
    var PLACE_END_M = 50;
    function trailEnds(trails, places) {
        var out = [], pl = (places || []).filter(function (p) { return p && p.name && isFinite(+p.lat) && isFinite(+p.lon); });
        function placeName(lat, lon, name) {
            var best = null, bd = PLACE_END_M;
            pl.forEach(function (p) { var d = distM(lat, lon, +p.lat, +p.lon); if (d <= bd) { bd = d; best = p.name; } });
            return best || name;
        }
        (trails || []).forEach(function (t) {
            var co = t && t.coords, nm = String((t && t.name) || "");
            var route = nm.indexOf(" · ") >= 0 ? nm.slice(nm.indexOf(" · ") + 3) : nm, ends = route.split(" → ");
            if (!co || co.length < 2 || ends.length !== 2 || !ends[0].trim() || !ends[1].trim()) return;
            [[ends[0].trim(), co[0]], [ends[1].trim(), co[co.length - 1]]].forEach(function (e) {
                var p = { name: e[0], lat: +e[1][1], lon: +e[1][0] };
                if (!isFinite(p.lat) || !isFinite(p.lon)) return;
                p.name = placeName(p.lat, p.lon, p.name);
                if (out.some(function (q) { return q.name === p.name && distM(q.lat, q.lon, p.lat, p.lon) < 50; })) return;
                out.push(p);
            });
        });
        return out;
    }
    /**
     * 순수 함수 - 선이 (lat, lon) 의 maxM 안을 지나는 때마다 가장 가까운 점 [{d: 출발부터 거리 m, off: 선까지 m}] - 선이 maxM 밖으로 나갔다 다시 오면 또 하나.
     * 한 번(또는 점이 띄엄띄엄해 점으로는 못 찾음)이면 snap 과 같은 자리(선분 위 가장 가까운 곳).
     */
    function passesNear(c, lat, lon, maxM) {
        var kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540, out = [], run = null;
        for (var i = 0; i < c.lat.length; i++) {
            var x = (c.lon[i] - lon) * kx, y = (c.lat[i] - lat) * ky, off = Math.sqrt(x * x + y * y);
            if (off <= maxM) { if (!run || off < run.off) run = { i: i, off: off }; continue; }
            if (run) { out.push(run); run = null; }
        }
        if (run) out.push(run);
        if (out.length < 2) { var q = snap(c, lat, lon); return q && q.off <= maxM ? [{ d: q.d, off: q.off }] : []; }   // 점이 띄엄띄엄해도 선분으로(예전과 같게)
        return out.map(function (r) { return { d: c.dist[r.i], off: r.off }; });
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
     * 순수 함수 - 기록의 이동 시간 · 휴식 시간 · 이동 중 평균 속도(2026-11-22 홍TV님 - 램블러 기록 요약을 보고). track [[위도, 경도, ms, …]].
     * 점 → 다음 점 사이마다 앞 점에서 MOVE_WINDOW_MS 뒤까지 · 뒤 점에서 MOVE_WINDOW_MS 앞부터(없으면 끝 점) 곧은 거리로 빠르기를 보고, 둘 다 MOVE_MIN_MS(m/s)
     * 넘을 때만 이동 - 쉬는 동안 GPS 가 몇 m 씩 튀어도 2분 사이 옮겨 간 거리는 작아 이동으로 세지 않고, 쉬기 바로 앞 · 뒤 사이도 쉼으로 남음. 시각이 없으면 null.
     * 돌려줌 {moveMs, restMs, moveM(이동 사이 거리 합), kmh(moveM / moveMs, 이동 시간이 없으면 null)}.
     */
    /**
     * 순수 함수 - 기록 그래프에 겹쳐 그릴 속도(km/h, 2026-11-22 홍TV님 - 램블러 그래프처럼 고도 + 속도). c = recordCourse.
     * 점마다 앞뒤 1분(SPEED_HALF_MS) 사이 거리 / 시간 - GPS 가 튀는 점 하나로 들쭉날쭉하지 않게. 시각이 없는 점은 null, 모두 없으면 null.
     */
    /**
     * 순수 함수 - 기록의 처음 · 끝을 m 만큼 잘라 냄(2026-11-22 홍TV님 - 영상 · 공개 기록에 집 · 주차한 곳이 나오지 않게). 길이를 따라 잰 거리.
     * 남는 것이 없으면(기록이 2m 보다 짧음) 빈 배열.
     */
    function trimEnds(track, m) {
        var tr = track || [], n = tr.length;
        if (n < 2 || !(m > 0)) return tr.slice();
        var cum = [0];
        for (var i = 1; i < n; i++) cum.push(cum[i - 1] + distM(tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1]));
        var total = cum[n - 1];
        if (total <= 2 * m) return [];
        return tr.filter(function (p, i) { return cum[i] >= m && cum[i] <= total - m; });
    }

    /**
     * 순수 함수 - 기록 → 사진 · 메모까지 든 GPX 1.1(2026-11-22 홍TV님 "GPX 파일 저장 - 사진, 메모 등 모든 정보를 저장해서 공유", 램블러 화면처럼 보이게).
     * 다른 앱은 선(trk) · 지점(wpt 이름 · 메모 · 시각)만 읽고, routefly 는 &lt;extensions&gt; 의 rf:photo(JPEG base64) · rf:record(요약)까지 읽어 내 기록으로 넣음(gpxRecord).
     * photos - {사진 열쇠: base64(앞의 data: 없이)}, 없는 사진은 빼고 메모만.
     */
    var RF_GPX_NS = "https://routefly.kr/gpx/1";
    /**
     * 🛩 3D 비행 영상 준비(2026-11-22 홍TV님 - 내 기록, 2026-11-23 홍TV님 - 코스 모음에서 연 GPX 파일도): 튐을 거르고 처음 · 끝 FLY_TRIM_M 을 늘 잘라(집 · 주차한 곳)
     * 이 기기 GPX(storeGpx)로 넣고, 3D 화면(app.js videoRecord)이 읽을 이름 · 사진 자리를 sessionStorage "rf-fly-rec" 에 둠.
     * 사진은 남은 구간의 것만(시각이 있으면 그 사이, 시각 없는 GPX 는 잘라 낸 처음 · 끝 점에서 FLY_TRIM_M 밖). 사진 그림은 3D 화면이 IndexedDB rf-photos 에서 읽음.
     * keepEnds - 공개 코스(코스 보기 ?c=, 2026-11-25 홍TV님 "이 화면에서는 모두 촬영")는 집 · 주차한 곳이 아니라 자르지 않음.
     * 시각 없는 GPX(코스 파일 - 📂 GPX 열기로 연 이은 코스 등)도 자르지 않음(2026-11-26).
     * 돌려줌 {secs, url, msg} - 영상 길이(약 250m 에 1초, 20 ~ 60초) · 3D 화면 주소 · 묻는 글. 남는 점이 2개보다 적으면 {short: 안내 글}.
     */
    var FLY_TRIM_M = 300;
    /**
     * 촬영을 시작한 기록 보기(trip.html - 📂 연 GPX · 코스 보기 · 내 기록 보기) 주소 - 3D 화면이 촬영 뒤 그리로 돌아가고 그 화면이 💾 저장(2026-11-25 홍TV님 "촬영이 끝나면 그냥 이 자리에").
     * trip.js 가 sessionStorage "rf-vid-back" 에 {u, t} 를 둠 - 15분 안 · trip.html 주소만, 아니면 null(따라가기 hike.html#vid 로).
     */
    function vidBackUrl() {
        try {
            var b = JSON.parse(sessionStorage.getItem("rf-vid-back") || "null");
            return b && Date.now() - b.t < 15 * 60000 && /^trip\.html(\?[^#]*)?(#open)?$/.test(String(b.u)) ? b.u : null;
        } catch (e) { return null; }
    }
    /**
     * 3D 화면이 만든 영상(IndexedDB rf-video "last") - 있으면 ask(글, 단추 글) 뒤 이 기기에 저장하고 지움(따라가기 · 기록 보기가 같이 씀).
     * 앱은 갤러리(RfGallery - Movies/routefly), 옛 앱은 공유 창(Filesystem + Share), 브라우저는 내려받기. note(글) - 끝 알림.
     */
    function videoReady(en, ask, note) {
        if (!window.indexedDB) return;
        var r = indexedDB.open("rf-video", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("v"); };
        r.onsuccess = function () {
            var db = r.result, q;
            try { q = db.transaction("v", "readonly").objectStore("v").get("last"); } catch (e) { db.close(); return; }
            q.onsuccess = function () {
                var v = q.result;
                if (!v || !v.blob) { db.close(); return; }
                ask(en ? "🛩 The 3D flight video is ready." : "🛩 3D 비행 영상이 준비됐습니다.", en ? "💾 Save" : "💾 저장").then(function () {
                    videoSave(v.blob, v.name, (v.title ? v.title + " - " : "") + "routefly", en, note);
                    try { db.transaction("v", "readwrite").objectStore("v").delete("last"); } catch (e) { /* 다음에 덮어씀 */ }
                });
            };
        };
    }
    /**
     * 기록 · GPX 높이를 지형 자료 높이로(2026-11-25 홍TV님 "둘 다 해" - 폰 GPS 높이는 지구 타원체 기준이라 우리나라에서 약 25m 높음: 덕기봉 GPS 111m · 실제 약 85m).
     * 지도 음영 · 3D 와 같은 지형 그림(demUrl, Terrarium)을 확대 z(기본 14 - 약 10m 칸) 조각으로 받아 점마다 그 칸 값을 읽음(조각 번호 · 화소는 RFMap.tilePixel · terrariumEle).
     * 돌려줌 Promise(점마다 m 배열 | null) - 조각이 TERRAIN_MAX_TILES 보다 많거나 한 점이라도 못 읽으면 null(그때는 기록 높이 그대로). 서버로는 아무것도 보내지 않음.
     */
    var TERRAIN_MAX_TILES = 120;
    function terrainEles(lat, lon, demUrl, z) {
        var M = window.RFMap;
        z = z || 14;
        if (!M || !M.tilePixel || !M.terrariumEle || !demUrl || !lat || !lat.length || !window.Image || !window.document) return Promise.resolve(null);
        var tiles = {}, at = lat.map(function (la, i) {
            var t = M.tilePixel(lon[i], la, z), k = t.x + "/" + t.y;
            if (!tiles[k]) tiles[k] = { x: t.x, y: t.y, d: null };
            return { k: k, px: t.px, py: t.py };
        });
        var keys = Object.keys(tiles);
        if (keys.length > TERRAIN_MAX_TILES) return Promise.resolve(null);
        return Promise.all(keys.map(function (k) {
            var t = tiles[k], url = String(demUrl).replace("{z}", z).replace("{x}", t.x).replace("{y}", t.y);
            return new Promise(function (resolve) {
                var img = new window.Image();
                img.crossOrigin = "anonymous";
                img.onload = function () {
                    try {
                        var cv = window.document.createElement("canvas");
                        cv.width = img.width; cv.height = img.height;
                        var g = cv.getContext("2d");
                        g.drawImage(img, 0, 0);
                        t.d = g.getImageData(0, 0, img.width, img.height);
                    } catch (e) { /* 못 읽음 */ }
                    resolve();
                };
                img.onerror = function () { resolve(); };
                img.src = url;
            });
        })).then(function () {
            var out = at.map(function (a) {
                var d = tiles[a.k].d;
                if (!d) return null;
                var k = d.width / 256, i = (Math.floor(a.py * k) * d.width + Math.floor(a.px * k)) * 4, e = M.terrariumEle(d.data[i], d.data[i + 1], d.data[i + 2]);
                return e > -100 ? Math.round(e * 10) / 10 : null;
            });
            return out.some(function (e) { return e == null; }) ? null : out;
        });
    }
    /** 순수 함수 - 기록(track 점 [위도, 경도, 시각, 높이, …])의 높이만 eles 로 바꾼 새 기록(eleSrc "terrain"). eles 가 없거나 수가 다르면 그대로. */
    function withEles(rec, eles) {
        if (!rec || !eles || !rec.track || eles.length !== rec.track.length) return rec;
        var out = {};
        Object.keys(rec).forEach(function (k) { out[k] = rec[k]; });
        out.track = rec.track.map(function (p, i) { var q = p.slice(); q[3] = eles[i]; return q; });
        out.eleSrc = "terrain";
        return out;
    }
    function videoSave(blob, name, text, en, note) {
        var L = function (ko, e) { return en ? e : ko; }, CAP = window.Capacitor, nat = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
        var plug = function (n) {   // 원격 주소로 띄운 앱은 Capacitor.Plugins 에 바로 있음(hike.js plugin 과 같은 찾기)
            if (!nat) return null;
            if (CAP.Plugins && CAP.Plugins[n]) return CAP.Plugins[n];
            if (CAP.isPluginAvailable && !CAP.isPluginAvailable(n)) return null;
            return CAP.registerPlugin ? CAP.registerPlugin(n) : null;
        };
        var down = function () {
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
            note(L("💾 저장했습니다(다운로드 폴더): ", "💾 Saved (Downloads): ") + name);
        };
        var b64 = function () {
            return new Promise(function (resolve, reject) {
                var fr = new FileReader();
                fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
                fr.onerror = reject;
                fr.readAsDataURL(blob);
            });
        };
        var share = function () {   // 옛 앱 - 공유 창으로
            var fs = plug("Filesystem"), sh = plug("Share");
            if (!fs || !sh) { down(); return; }
            b64().then(function (d) { return fs.writeFile({ path: name, data: d, directory: "CACHE" }); })
                .then(function (w) { return sh.share({ title: name, text: text || "", files: [w.uri], dialogTitle: L("보내기", "Send") }); })
                .catch(function () { /* 닫음 */ });
        };
        if (!nat) { down(); return; }
        var gal = plug("RfGallery");
        if (!gal) { share(); return; }
        b64().then(function (d) { return gal.saveMedia({ data: d, name: name }); })
            .then(function () { note(L("💾 갤러리 routefly 앨범에 저장했습니다.", "💾 Saved to the gallery (routefly album).")); }, share);
    }
    /**
     * 순수 함수 - 3D 영상에 쓸 선: 걸은 기록은 처음 · 끝 FLY_TRIM_M 을 자름(집 · 주차한 곳). keepEnds 이거나 시각이 하나도 없는 GPX(코스 파일 - GPX 편집으로
     * 이어 올린 코스 · 코스 받기, 집 · 주차한 곳이 없음)는 그대로(2026-11-26 홍TV님 "내가 코스 연결해서 올린 것은 앞 뒤 300m 자르지 말고").
     */
    function flyTrack(all, keepEnds) {
        var timed = (all || []).some(function (p) { return typeof p[2] === "number"; });
        return keepEnds || !timed ? (all || []).slice() : trimEnds(all, FLY_TRIM_M);
    }
    function flyStart(rec, en, keepEnds) {
        var L = function (ko, e) { return en ? e : ko; }, name = String((en && rec.name != null ? enName(rec.name) : rec.name) || "");   // RF.nameIn 과 같은 이름
        var all = cleanTrack(rec.track, rec.kind === "bike"), tr = flyTrack(all, keepEnds);
        if (tr.length < 2) return { short: L("기록이 짧아(처음 · 끝 " + FLY_TRIM_M + "m 를 빼면 남는 것이 없음) 만들 수 없습니다.", "The record is too short (nothing left after trimming " + FLY_TRIM_M + " m at each end).") };
        var t0 = tr[0][2], t1 = tr[tr.length - 1][2], timed = typeof t0 === "number" && typeof t1 === "number";
        var notes = (rec.notes || []).filter(function (n) {
            if (n.lat == null || n.lon == null) return false;
            if (timed) return n.t >= t0 && n.t <= t1;
            return distM(n.lat, n.lon, all[0][0], all[0][1]) > FLY_TRIM_M && distM(n.lat, n.lon, all[all.length - 1][0], all[all.length - 1][1]) > FLY_TRIM_M;
        });
        var rc = recordCourse({ name: rec.name, kind: rec.kind, track: tr, notes: [] });
        var text = recordGpx({ name: rec.name, kind: rec.kind, start: rec.start, track: tr, notes: [] }, {}), id = gpxId(text);
        storeGpx(id, gpxToApi(text, name + ".gpx"));
        var d = new Date(typeof rec.start === "number" ? rec.start : Date.now()), p = function (n) { return (n < 10 ? "0" : "") + n; };
        sessionStorage.setItem("rf-fly-rec", JSON.stringify({ name: name, stamp: d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()),
            photos: notes.filter(function (n) { return n.photo; }).map(function (n) { return { lat: n.lat, lon: n.lon, photo: n.photo }; }) }));
        var secs = Math.max(20, Math.min(60, Math.round(rc.total / 250)));
        return { secs: secs, url: "index.html?video=1&rec=1&secs=" + secs + (en ? "&lang=en" : "") + "#c=" + encodeURIComponent(id),
            msg: L("3D 화면에서 " + secs + "초 동안 날며 영상을 만들고 따라가기 화면으로 돌아옵니다. 화면을 켜 둔 채 기다려 주세요. 영상 모양은 지금 화면 모양 그대로입니다(폰을 세로로 들면 세로 영상).",
                "The 3D screen flies for " + secs + " s while recording, then comes back to the hike screen. Keep the screen on. The video has the shape of your screen (hold the phone upright for a vertical video).") };
    }

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
        var sum = { kind: rec.kind || "hike", start: rec.start, end: rec.end, up: rec.up != null ? rec.up : null, kcal: rec.kcal != null ? rec.kcal : null, steps: rec.steps != null ? rec.steps : null, courseId: rec.courseId || null,
            via: rec.via === "app" || rec.via === "web" ? rec.via : null, saver: typeof rec.saver === "boolean" ? rec.saver : null };   // via · saver - 어디서 기록했나(2026-11-23)
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
                        courseId: typeof sum.courseId === "string" ? sum.courseId : null, via: sum.via === "app" || sum.via === "web" ? sum.via : null,
                        saver: typeof sum.saver === "boolean" ? sum.saver : null, track: track, notes: notes }, photos: photos };
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
     * 가운뎃값은 HIGH_NEAR_M 안의 점끼리만(2026-11-25 홍TV님 "덕기봉 85m" - 점이 드문 기록의 마지막 정상 점 하나가 210m 앞의 낮은 점들과 묶여 48m 가 됐음).
     */
    var HIGH_NEAR_M = 150;   // 지리산 기록 튐(약 110m 간격 점)은 묶고, 덕기봉 210m 앞 정상 점은 따로
    function recordHighest(rc, peaks, elev) {
        var e = rc && rc.ele || [], best = null, at = -1;
        for (var i = 0; i < e.length; i++) {
            var w = [];
            for (var j = Math.max(0, i - 2); j <= Math.min(e.length - 1, i + 2); j++) {
                if (e[j] != null && (j === i || !rc.lat || distM(rc.lat[i], rc.lon[i], rc.lat[j], rc.lon[j]) <= HIGH_NEAR_M)) w.push(e[j]);
            }
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
    function isGpxId(id) { return String(id).indexOf(GPX_PREFIX) === 0; }
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

    /** 순수 함수 - 코스 위 d0 → d1 사이에 오른 · 내려간 높이(m). 코스 고도로 셉니다(GPS 고도는 많이 흔들림). */
    function climbBetween(c, d0, d1) {
        var i0 = indexAt(c, Math.min(d0, d1)), i1 = indexAt(c, Math.max(d0, d1));
        var up = c.asc[i1] - c.asc[i0], e0 = c.ele ? c.ele[i0] : null, e1 = c.ele ? c.ele[i1] : null;
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
     * 순수 함수 - 코스 ID → 출처 {kind:"source", text, en, checked:false}(서버 CourseSource.of 와 같은 앞부분 - 2026-11-01 홍TV님).
     * 서버 답의 course.source 가 먼저이고, 이것은 그 칸이 없을 때(받아 둔 옛 코스 · 내 GPX)만. 이은 코스는 첫 구간 것. 올린 코스(u-)는 만든 이를 몰라 null, 모르는 앞부분도 null.
     */
    function courseSource(id) {
        var parts = parseJoinId(id), base = parts && parts.length ? parts[0].base : String(id || "");
        var P = [["knps-", "국립공원공단", "Korea National Park Service"], ["frst-", "산림청", "Korea Forest Service"],
                 ["drnb-", "한국관광공사 두루누비", "Korea Tourism Organization Durunubi"],
                 ["kmp-", "한국등산·트레킹지원센터", "Korea Hiking & Trekking Support Center"], ["kmf-", "한국등산·트레킹지원센터", "Korea Hiking & Trekking Support Center"],
                 ["osm", "OpenStreetMap", "OpenStreetMap"]];
        if (isGpxId(base)) return { kind: "source", text: "내 GPX", en: "My GPX", checked: false };
        for (var i = 0; i < P.length; i++) if (base.indexOf(P[i][0]) === 0) return { kind: "source", text: P[i][1], en: P[i][2], checked: false };
        return null;
    }

    /**
     * 순수 함수 - 코스 GPX 를 누구나 💾 저장해도 되는가(2026-11-24 홍TV님 "너가 보기에 다운받을 수 있는 것만. 걸리는 것은 못 받게").
     * 되는 것: 공공데이터포털 "이용허락범위 제한 없음" 을 확인한 자료 - 국립공원공단(knps- · frst-9000NN 선형시설) · 산림청 등산로(frst-) ·
     *   한국등산·트레킹지원센터(kmp- · kmf-)(routefly-batch docs/public-gpx-sources.md), OpenStreetMap(osm…, ODbL - 출처 표시하면 됨),
     *   routefly 가 직접 만든 코스(u- 인데 만든 이가 "routefly" - 홍TV님).
     * 안 되는 것: 두루누비(drnb- - API 이용 조건 미확인, 누리집 GPX 는 공공누리 4유형 변경금지 · 상업 금지), 다른 사람이 보낸 코스(u- + 만든 이 이름 - 동의는 "공개 코스" 까지), 내 GPX · 모르는 것.
     * src - 서버가 준 course.source(CourseSource, 없으면 null). 이은 코스(쉼표 · @)는 조각 모두 되어야 함.
     */
    function courseGpxFree(id, src) {
        var parts = parseJoinId(id), ids = parts && parts.length ? parts.map(function (p) { return p.base; }) : [String(id || "")];
        return ids.every(function (b) {
            if (b.indexOf("u-") === 0) return !parts && !!src && src.kind === "maker" && src.text === "routefly" && !src.checked && !src.partner;   // 보낸 사람 이름이 routefly 여도 남의 코스(checked)는 아님(점검 14차 B4)
            return /^(knps-|frst-|kmp-|kmf-|osm)/.test(b);
        });
    }
    /** 순수 함수 - 💾 코스 GPX 에 넣는 출처 한 줄(코스 출처 + 지명 · 이름의 OpenStreetMap ODbL). */
    function courseGpxCredit(id, src, en) {
        var s = src || courseSource(id), who = s ? (en ? s.en || s.text : s.text) : "";
        var osm = "© OpenStreetMap contributors (ODbL)";
        if (!who || /^OpenStreetMap$/.test(who)) return (en ? "Source: " : "출처: ") + osm + " · routefly";
        return (en ? "Source: " : "출처: ") + who + (s.kind === "maker" ? "" : en ? " (public data)" : " (공공데이터)") + (en ? " · names: " : " · 지명: ") + osm + (who === "routefly" ? "" : " · routefly");
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

    /** 순수 함수 - 그날 해 지는 시각(ms, 그 위치 기준). 극지방처럼 해가 안 지면 null. (Almanac for Computers 공식) */
    function sunset(dateMs, lat, lon) { return sunTime(dateMs, lat, lon, false); }
    /** 순수 함수 - 그 날 해 뜨는 시각(산 소개 페이지, 2026-10-14). 계산은 sunset 과 같음. */
    function sunrise(dateMs, lat, lon) { return sunTime(dateMs, lat, lon, true); }

    function sunTime(dateMs, lat, lon, rise) {
        // 그 자리의 날짜로(경도로 어림한 현지 시각) - UTC 날짜를 쓰면 한국 아침 9시 전은 전날 일몰이 나왔음(2026-10-14 PC: 08:00 출발에 일몰 경고)
        var r = Math.PI / 180, d = new Date(dateMs + lon / 15 * 3600000);
        var start = Date.UTC(d.getUTCFullYear(), 0, 0), N = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000);
        var lngHour = lon / 15, t = N + ((rise ? 6 : 18) - lngHour) / 24;
        var Mn = 0.9856 * t - 3.289;
        var L = (Mn + 1.916 * Math.sin(Mn * r) + 0.020 * Math.sin(2 * Mn * r) + 282.634 + 360) % 360;
        var RA = (Math.atan(0.91764 * Math.tan(L * r)) / r + 360) % 360;
        RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
        var sinDec = 0.39782 * Math.sin(L * r), cosDec = Math.cos(Math.asin(sinDec));
        var cosH = (Math.cos(90.833 * r) - sinDec * Math.sin(lat * r)) / (cosDec * Math.cos(lat * r));
        if (cosH > 1 || cosH < -1) return null;
        var H = (rise ? 360 - Math.acos(cosH) / r : Math.acos(cosH) / r) / 15;
        var UT = ((H + RA - 0.06571 * t - 6.622 - lngHour) % 24 + 24) % 24;
        var day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), out = day + UT * 3600000;
        // UT 는 0~24시라 해 뜨는 시각(한국 아침 = 전날 UTC 저녁)은 하루 뒤로 나옴 - 현지 날짜가 그 날이 되게 맞춤
        var local = Math.floor((out + lngHour * 3600000 - day) / 86400000);
        return out - local * 86400000;
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
    /** 순수 함수 - 코스 위 d0 → d1 표준 소요 시간(ms) - 그 사이 오르막 · 내리막(climbBetween)을 함께(2026-11-03 홍TV님). */
    function legMs(c, d0, d1) {
        var cl = climbBetween(c, d0, d1);
        return standardMs(c.course && c.course.kind, Math.abs(d1 - d0), cl.up, cl.down);
    }

    /** 순수 함수 - 기상청 하늘(sky 1 · 3 · 4) · 강수 형태(pty 0 ~ 4) → "☀️ 맑음" 같은 말. */
    function weatherWord(sky, pty) {
        var p = { 1: "🌧 비", 2: "🌨 비/눈", 3: "❄️ 눈", 4: "🌦 소나기" }[+pty];
        if (p) return p;
        return { 1: "☀️ 맑음", 3: "⛅ 구름많음", 4: "☁️ 흐림" }[+sky] || "-";
    }

    // ── 기상청 날씨누리처럼 시간별 가로 표(2026-10-30 홍TV님 "참고해" - 날씨누리 동네예보 화면) ──
    var DIR16 = ["북", "북북동", "북동", "동북동", "동", "동남동", "남동", "남남동", "남", "남남서", "남서", "서남서", "서", "서북서", "북서", "북북서"];
    var DIR16_EN = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    /** 순수 함수 - 강수량 글("강수없음" · "1mm 미만" · "1.0mm" · "30.0~50.0mm") → 칸 글. */
    function pcpText(p, en) {
        var t = String(p == null ? "" : p).trim();
        if (!t || /없음/.test(t) || t === "0") return "-";
        if (/미만/.test(t)) return en ? "<1mm" : "1mm 미만";
        return t.replace(/\.0(?=mm|~)/g, "");
    }
    /**
     * 순수 함수 - 그 날(day "2026-10-30")의 시간별 칸 [{h, icon, word, tmp, pop, pcp, wsd, reh, arrow, dir}] - 날씨누리 표의 한 열씩.
     * arrow 는 바람이 불어 가는 쪽 화살표(VEC 는 불어오는 쪽), dir 은 "북서" 처럼 불어오는 쪽 이름(…풍).
     * max 가 있으면 그 날 첫 시각부터 다음 날로 이어 max 칸까지(2026-11-21 홍TV님 "23시로 끊어지잖아" - 오늘 밤 산행 · 새벽 출발도 보이게),
     * 다음 날 칸은 nd(그 날짜의 일, 예 "22")가 붙음.
     */
    function wxCols(hours, day, en, max) {
        var arrows = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"];
        var list = (hours || []).filter(function (h) { return max ? String(h.t).slice(0, 10) >= day : String(h.t).slice(0, 10) === day; });
        if (max) list = list.slice(0, max);
        return list.map(function (h) {
            var w = weatherWord(h.sky, h.pty), sp = w.indexOf(" "), v = h.vec != null && isFinite(h.vec) ? ((+h.vec % 360) + 360) % 360 : null;
            var word = sp > 0 ? w.slice(sp + 1) : w;
            if (en) word = { "맑음": "Clear", "구름많음": "Mostly cloudy", "흐림": "Overcast", "비": "Rain", "비/눈": "Rain/snow", "눈": "Snow", "소나기": "Showers" }[word] || word;
            return { h: String(h.t).slice(11, 13), nd: String(h.t).slice(0, 10) !== day ? String(+String(h.t).slice(8, 10)) : null, icon: sp > 0 ? w.slice(0, sp) : w, word: word, tmp: h.tmp, pop: h.pop, pcp: pcpText(h.pcp, en), wsd: h.wsd, reh: h.reh,
                arrow: v == null ? "" : arrows[Math.round(v / 45) % 8], dir: v == null ? "" : (en ? DIR16_EN : DIR16)[Math.round(v / 22.5) % 16] };
        });
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
        // 오른 높이 - 기록 값, 없으면(다른 앱 GPX 파일) 점 높이로 센 오르막(2026-11-23 PC: 파일로 열면 줄이 없었음)
        var up = has(rec.up) ? rec.up : rc.asc && rc.asc.length ? rc.asc[rc.asc.length - 1] : null;
        if (has(up)) out.push([L("오른 높이", "Climb"), num(up) + " m"]);
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

    // ------------------------------------------------------------------ 난이도 · 안내판 고도 그래프(2026-10-15 홍TV님 - 국립공원 탐방로 안내판처럼)

    /** 5단계 - 색은 공단 탐방로 안내판 범례(매우쉬움 연두 · 쉬움 초록 · 보통 주황 · 어려움 자주 · 매우어려움 검정)에 맞춤. MountainServlet.LEVELS 와 같음. */
    // 영어는 한국어 단계 그대로(2026-11-02 홍TV님 점검: 쉬움이 "Moderate" 로 한 칸씩 밀려 보였음)
    var LEVELS = [{ ko: "매우 쉬움", en: "Very easy", color: "#a3c93a" }, { ko: "쉬움", en: "Easy", color: "#3fae5c" }, { ko: "보통", en: "Moderate", color: "#e8822a" },
                  { ko: "어려움", en: "Hard", color: "#a23a6b" }, { ko: "매우 어려움", en: "Very hard", color: "#3a3f46" }];
    /** 구간 경사(%) 단계 경계 - 안내판 구간 색 · 음성. 코스 난이도는 시간 · 오르막 총량(HOUR_STEPS · ASC_STEPS). MountainServlet 과 같은 값. */
    var SLOPE_STEPS = [5, 10, 18, 28], HOUR_STEPS = [1.5, 3, 5, 8], ASC_STEPS = [300, 700, 1100, 1500], STEEP_STEPS = [20, 28, 36, 46];
    function stepOf(v, steps) { var i = 0; while (i < steps.length && v >= steps[i]) i++; return i; }

    /**
     * 순수 함수 - 등산 코스 난이도 0~4(routefly 기준 - 공단 공식 등급이 아님). 표준 시간(4km/h + 오르막 600m/h) · 오르막 총량 ·
     * 가장 가파른 1km 경사(steep %, 오르막 · 내리막 - 서버 Steep 이 목록에 steep_pct 로 줌, 없으면 뺌) 가운데 높은 단계.
     * 코스가 길어지거나 오르막이 늘면 절대 내려가지 않음 - 2026-10-16 홍TV님: 예전 기준(전체 평균 경사)은 남설악 → 대청봉(4.7km · 1,273m)이 어려움인데
     * 대청봉 → 가라피로 이어 내려가는 10.5km · 1,480m 코스가 평균 경사가 묽어져 보통이었음. 가파른 구간은 📈 고도 · 📋 안내판의 구간 경사로 봄.
     */
    function difficulty(distM, ascM, steep) {
        distM = +distM || 0;
        ascM = +ascM || 0;
        if (distM <= 0) return null;
        var base = Math.max(stepOf(distM / 1000 / 4 + ascM / 600, HOUR_STEPS), stepOf(ascM, ASC_STEPS));
        // 가파름은 한 단계까지 올림(2026-10-16 PC: 문턱 12 · 18 · 25 · 32% 로는 설악산 57 중 47 이 매우 어려움 - 산길은 1km 30 ~ 40% 가 흔함).
        // 다만 가장 가파른 1km 가 36% 이상이면 짧아도 적어도 어려움(2026-10-18 홍TV님: 내장사 → 신선봉 2.2km · 41% 가 보통) - MountainServlet.difficulty 와 같음
        if (steep == null || !isFinite(+steep)) return base;
        var s = stepOf(+steep, STEEP_STEPS);
        return Math.max(base, Math.min(s, s >= 3 ? Math.max(base + 1, 3) : base + 1));
    }

    /** 순수 함수 - 가장 가파른 1km 구간 경사(%, 오르막 · 내리막) - Steep.steepest 와 같음. 1km 보다 짧으면 처음 ~ 끝, 300m 보다 짧거나 고도가 없으면 null. */
    function steepest(dist, ele) {
        var p = [];
        for (var i = 0; i < (dist || []).length; i++) if (ele[i] != null) p.push([+dist[i], +ele[i]]);
        if (p.length < 2) return null;
        var total = p[p.length - 1][0] - p[0][0], best = 0;
        if (total < 300) return null;
        if (total < 1000) best = Math.abs(p[p.length - 1][1] - p[0][1]) / total * 100;
        else for (var a = 0, b = 0; a < p.length; a++) {
            if (b < a) b = a;
            while (b < p.length && p[b][0] - p[a][0] < 1000) b++;
            if (b >= p.length) break;
            best = Math.max(best, Math.abs(p[b][1] - p[a][1]) / (p[b][0] - p[a][0]) * 100);
        }
        return Math.round(best * 10) / 10;
    }

    /** 난이도 표(i.lv) - 거리가 없으면 null. MountainServlet.levelChip 과 같은 모양. */
    function levelChip(distM, ascM, en, steep, info) {
        // 공단 공식 난이도가 있으면 그것 하나만(2026-11-03 홍TV님 점검: 한 코스에 "매우 쉬움" 칩과 공단 "보통(2.57)" 이 함께 나와 헷갈렸음)
        var off = info && info.level != null ? String(info.level).trim() : "";
        if (off) {
            var k = officialLevel(off), o = el("i", "lv" + (k != null ? " lv" + k : ""), en ? "Park service: " + (k != null ? LEVELS[k].en + off.replace(/^[^(]*/, " ").replace(/^ $/, "") : off) : "공단 " + off);
            o.title = en ? "Official difficulty (Korea National Park Service)" : "국립공원공단 공식 난이도";
            return o;
        }
        var lv = difficulty(distM, ascM, steep);
        if (lv == null) return null;
        var i = el("i", "lv lv" + lv, en ? LEVELS[lv].en : LEVELS[lv].ko);
        i.title = en ? "Difficulty (routefly estimate from time and total ascent)" : "난이도(걸리는 시간 · 오르막 총량으로 어림 - 공단 공식 등급 아님)";
        return i;
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

    /** 순수 함수 - 공단 난이도 글("보통(2.57)" · "매우 어려움") → LEVELS 차례(0 ~ 4). 모르는 말이면 null. MountainServlet.officialLevel 과 같음. */
    function officialLevel(text) {
        // 띄어쓰기는 모두 빼고 견줌 - 공단은 "매우어려움" 으로 보냄(점검 11차 A8, MountainServlet.officialLevel 과 같게)
        var t = String(text == null ? "" : text).replace(/\(.*$/, "").replace(/\s+/g, "");
        for (var i = 0; i < LEVELS.length; i++) if (t === LEVELS[i].ko.replace(/ /g, "")) return i;
        return null;
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
        hm: hm,
        fromApi: fromApi,
        gpxToApi: gpxToApi,
        recordCourse: recordCourse,
        trailEnds: trailEnds,
        flyStart: flyStart,
        vidBackUrl: vidBackUrl,
        videoReady: videoReady,
        terrainEles: terrainEles,
        withEles: withEles,
        gpxRecord: gpxRecord,
        gpxId: gpxId,
        storeGpx: storeGpx,
        infoText: infoText,
        baseStyle: baseStyle,
        at: at,
        snap: snap,
        indexAt: indexAt,
        trackGpx: trackGpx,
        courseFetch: courseFetch,
        recKey: recKey,
        myRecords: myRecords,
        ownerDevice: ownerDevice,
        courseGpxFree: courseGpxFree,
        courseGpxCredit: courseGpxCredit,
        sunset: sunset,
        sunrise: sunrise,
        speedProfile: speedProfile,
        famousMarks: famousMarks,
        famousFetch: famousFetch,
        trackSegments: trackSegments,
        stopsAlong: stopsAlong,
        recordPark: recordPark,
        segText: segText,
        climbBetween: climbBetween,
        standardMs: standardMs,
        legMs: legMs,
        wxCols: wxCols,
        distM: distM,
        profile: profile,
        nameIn: function (s) { return LANG === "en" && s != null ? enName(s) : s; },
        setLang: setLang,
        tr: tr,
        pageLang: pageLang,
        applyEn: applyEn,
        recordSummary: recordSummary,
        recordHighest: recordHighest,
        levelChip: levelChip,
        mapLocale: mapLocale,
        steepest: steepest,
        courseTrack: courseTrack
    };
})(window);
