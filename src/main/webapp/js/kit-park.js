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
     * 화면에서 포개지는 이름표 숨기기. items: [{el, prio}] (prio 작을수록 먼저 남김). 남긴 것과 겹치면 el 에 "hid" 를 붙입니다.
     * 3D 로 기울여 보면 떨어진 지점도 화면에서 겹칩니다 - 출발 · 도착 · 지금 위치에 가까운 것을 남깁니다.
     */
    function declutter(items, pad) {
        var p = pad == null ? 3 : pad, kept = [];
        // 자리를 모두 먼저 읽고 그다음 한꺼번에 숨김(2026-11-02 홍TV님 점검: 읽기 · 쓰기를 번갈아 이름표마다 화면 배치를 다시 셈).
        // hid 는 opacity · visibility 만 바꿔 자리는 그대로라 먼저 읽어도 같음
        var sorted = items.slice().sort(function (a, b) { return a.prio - b.prio; }), rects = sorted.map(function (it) { return it.el.getBoundingClientRect(); });
        var hide = rects.map(function (r) {
            if (!r.width) return false;
            var hit = kept.some(function (k) {
                return r.left < k.right + p && r.right > k.left - p && r.top < k.bottom + p && r.bottom > k.top - p;
            });
            if (!hit) kept.push(r);
            return hit;
        });
        sorted.forEach(function (it, i) { it.el.classList.toggle("hid", hide[i]); });
    }

    var NUMBERED_PARK = /[^\s·→()\d]+\d+\s*\(([^()]+공원)\)/g;
    // "수변공원49까지"(서해랑길 16코스) - 공원 이름 뒤 관리 번호도 뗌
    var PARK_NO = /([가-힣](?:공원|광장))\d+(?![\d)])/g;
    function numberedPark(name) { return name == null ? name : String(name).replace(NUMBERED_PARK, "$1").replace(PARK_NO, "$1"); }

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
     * 위험 · 조망 아이콘(낙석주의 · 구급함 · 헬기장 …)을 보이는 확대 정도. 넓게 볼 때는 들머리 · 날머리 · 중요 지점만 보이고,
     * 확대하면 자연스럽게 나타남(2026-10-13 홍TV님: 따라가기 첫 화면에서 '낙석주의' 는 중요하지 않음). 줌 14 - 폰 축척 막대 300m 쯤.
     */
    var SPOT_ZOOM = 14;

    /** 지도가 넓게 보이면(SPOT_ZOOM 미만) 지도 상자에 "far" - CSS 가 .spot 을 숨김. 확대 · 축소할 때마다. */
    function spotsByZoom(map) {
        var box = map.getContainer(), set = function () { box.classList.toggle("far", map.getZoom() < SPOT_ZOOM); };
        map.on("zoom", set);
        set();
    }

    /** 국립공원 이름(서버 ParkServlet.PARKS 와 같은 차례). */
    var PARKS = ["지리산", "경주", "계룡산", "한려해상", "설악산", "속리산", "한라산", "내장산", "가야산", "덕유산", "오대산", "주왕산",
        "태안해안", "다도해해상", "북한산", "치악산", "월악산", "소백산", "월출산", "변산반도", "무등산", "태백산", "팔공산"];

    /**
     * 순수 함수 - 검색 표준 주소(canonical): 지금 주소에서 keys 가운데 처음 있는 것 하나만 남김(없으면 쪽 주소만).
     * 노선 안내도 · 국립공원(route.html · park.html)은 같은 빈 틀에 주소 꼬리(&name= · &back= · &lang=)만 달라 구글이 "표준이 없는 중복" 62개로 봤음(2026-11-08 Search Console).
     */
    function canonicalHref(href, keys) {
        var u = new URL(href), q = new URLSearchParams(u.search), out = u.origin + u.pathname;
        for (var i = 0; i < keys.length; i++) {
            var v = q.get(keys[i]);
            if (v) return out + "?" + keys[i] + "=" + encodeURIComponent(v);
        }
        return out;
    }

    /** 화면 머리의 canonical 을 canonicalHref 로(없으면 만듦). route.js · park.js 가 부름. */
    function setCanonical(keys) {
        var l = document.querySelector('link[rel="canonical"]');
        if (!l) { l = document.createElement("link"); l.rel = "canonical"; document.head.appendChild(l); }
        l.href = canonicalHref(location.href, keys);
    }

    /**
     * 순수 함수 - 정상(peak.lat/lon)까지 가는 코스: 끝(없으면 시작)이 nearM(기본 2km - 2026-10-12 PC: 강천산 · 선운산 등 코스 끝이 정상에서 1~1.8km) 안인 것, 가까운 차례.
     * 이름 검색(같은 이름 산이 여럿 - 백운산)에서 그 산 코스만 고릅니다. 2026-10-12 홍TV님 "100대 명산은 따라가기 버튼이 없어?"
     */
    /**
     * 순수 함수 - 비법정탐방로(출입 금지 구간)인가. 국립공원공단 자료의 "비매칭코스"(2026-10-13 홍TV님: 북한산 상장능선 · 염초봉 · 파랑새능선 ·
     * 만경대 · 보현봉 · 향로봉 일부 · 도선사 무당골 같은 비법정탐방로). 목록 · 탐방 안내도 · 대표 산 코스에서 뺌.
     */
    function isClosedTrail(name) { return /비매칭|비법정/.test(String(name || "")); }

    /**
     * 순수 함수 - 지금은 없는 공단 탐방로(park-notes hide - 코스 ID 그대로나 앞부분). 목록 · 탐방 안내도에서만 빼고 DB 는 그대로.
     * 2026-10-14 홍TV님: 가야산3코스(knps-7014)는 공단 누리집 목록에 없음(2017 자료에만 있음).
     */
    function isHiddenCourse(notes, id) {
        var s = String(id || "");
        return Object.keys(notes || {}).some(function (park) {
            return ((notes[park] && notes[park].hide) || []).some(function (k) { return s === k || s.indexOf(k + "-") === 0; });
        });
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

    /** 국립공원 위험지역 · 조망점 종류 → 지도 아이콘. */
    var SPOT_ICONS = { danger: "⚠️", aid: "⛑️", heli: "🚁", ranger: "🏠", view: "🔭" };
    function spotIcon(kind) { return SPOT_ICONS[kind] || "•"; }

    /** 순수 함수 - 방위(도) → 8 방위 말(255 → 서남서가 아니라 "서"). 모르면 "". */
    function azWord(az) {
        if (az == null || isNaN(+az)) return "";
        if (LANG === "en") return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round(((+az % 360) + 360) % 360 / 45) % 8];
        return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round(((+az % 360) + 360) % 360 / 45) % 8];
    }

    /** 순수 함수 - 이름표 글: 위험 "낙석주의", 이름과 종류가 다르면 "미끄럼주의(추락주의)", 조망점 "제석봉 조망점 · 서쪽 0.7km". */
    function spotText(s) {
        if (!s) return "";
        if (LANG === "en") {
            if (s.kind === "danger") return enName(s.info && s.info !== "기타" && s.name.indexOf(s.info) < 0 ? s.name + "(" + s.info + ")" : s.name);
            if (s.kind === "view" && s.view_az != null) return enName(s.name) + " · to the " + azWord(s.view_az) + (s.view_m ? " " + km(+s.view_m) + " km" : "");
            return enName(s.name);
        }
        if (s.kind === "danger") return s.info && s.info !== "기타" && s.name.indexOf(s.info) < 0 ? s.name + "(" + s.info + ")" : s.name;
        if (s.kind === "view" && s.view_az != null) return s.name + " · " + azWord(s.view_az) + "쪽" + (s.view_m ? " " + km(+s.view_m) + "km" : "");
        return s.name;
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

    /**
     * 순수 함수 - 공단 탐방로(trails)에 빠진 길을 다른 자료 등산 코스(others - /api/park 의 others)로 메웁니다(2026-10-12 홍TV님:
     * 설악산 소공원 → 비선대 → 천불동이 공단 자료에 없어 원점회귀를 못 만듦, 지도가 비어 보임).
     * 다른 코스에서 공단 탐방로와 FAR_M 넘게 떨어진 점이 이어진 부분만 떼어(양 끝 한 점씩 붙여 공단 탐방로에 닿게), 양 끝이 공단 탐방로에 닿거나
     * 한 끝은 닿고 다른 끝이 들머리(heads · 코스 끝) 둘레면 씀. 300m 안은 뺌, 같은 자리 · 같은 길이는 하나(dedupeSegs).
     * → [{id: "다른코스ID@비율-비율:처음>끝", base, name: "공원 · 처음 → 끝", coords, distance_m, ascent_m: null, extra: true, nocut: true}]
     * 끝 이름은 places · heads 가운데 300m 안 가까운 것, 없으면 "갈림길"(코스 끝이면 그 코스 이름의 처음 · 끝).
     */
    function gapFill(trails, others, places, heads, park) {
        var FAR_M = 120, MIN_M = 300, d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        if (!others || !others.length || !trails || !trails.length) return [];
        var grid = {}, cell = function (p) { return Math.round(p[0] * 300) + "," + Math.round(p[1] * 300); };
        trails.forEach(function (t) { t.coords.forEach(function (p) { (grid[cell(p)] = grid[cell(p)] || []).push(p); }); });
        var nearKnps = function (p, lim) {
            var cx = Math.round(p[0] * 300), cy = Math.round(p[1] * 300);
            for (var dx = -2; dx <= 2; dx++) for (var dy = -2; dy <= 2; dy++) {
                var g = grid[(cx + dx) + "," + (cy + dy)];
                if (g) for (var i = 0; i < g.length; i++) if (d(p, g[i]) < lim) return true;
            }
            return false;
        };
        var knpsD = function (p) {   // 가까운 공단 탐방로 점까지(m) - 둘레 칸에 없으면 아주 큼
            var cx = Math.round(p[0] * 300), cy = Math.round(p[1] * 300), best = Infinity;
            for (var dx = -2; dx <= 2; dx++) for (var dy = -2; dy <= 2; dy++) {
                var g = grid[(cx + dx) + "," + (cy + dy)];
                if (g) for (var i = 0; i < g.length; i++) best = Math.min(best, d(p, g[i]));
            }
            return best;
        };
        // 점이 닿은 공단 탐방로와 그 탐방로 위 거리(처음부터 m) - 같은 탐방로 옆을 나란히 그린 선을 거르려고
        var tcum = trails.map(function (t) { var cu = [0]; for (var i = 1; i < t.coords.length; i++) cu.push(cu[i - 1] + d(t.coords[i - 1], t.coords[i])); return cu; });
        var onTrail = function (p) {
            var best = null, bd = 200;
            trails.forEach(function (t, ti) { t.coords.forEach(function (q, k) { var x = d(p, q); if (x < bd) { bd = x; best = { t: ti, at: tcum[ti][k] }; } }); });
            return best;
        };
        var named = (places || []).concat(heads || []);
        var nameAt = function (p) {
            var best = null, bd = 300;
            named.forEach(function (pl) {
                var nm = placeName(pl.name);
                if (!nm || /^(삼각점|정상|갈림길|삼거리|사거리|헬기장|이정표)$/.test(nm)) return;
                var x = d(p, [+pl.lon, +pl.lat]);
                // 가장 가까운 것이 먼 봉우리면 이름 없이(그 뒤 다른 이름을 붙이지 않음 - 치악산 남대봉 237m · 남대봉안전센터 239m)
                if (x < bd) { bd = x; best = x > peakNearM(nm) ? null : nm; }
            });
            return best;
        };
        var nearHead = function (p) { return (heads || []).some(function (h) { return d(p, [+h.lon, +h.lat]) < 500; }); };
        // 100대 명산 정상(/api/park 의 summit 이름표) - 정상까지 가는 짧은 막다른 길도 씀(2026-10-30 홍TV님: 북한산 위문 → 백운대 250m 가 300m 미만 · 막다른 길이라 빠졌음)
        var tops = (places || []).filter(function (p) { return p.summit; });
        var nearTop = function (p) { return tops.some(function (t) { return d(p, [+t.lon, +t.lat]) < 80; }); };
        var out = [];
        others.forEach(function (o) {
            var c = o.coords;
            if (!c || c.length < 3) return;
            var cum = [0];
            for (var i = 1; i < c.length; i++) cum.push(cum[i - 1] + d(c[i - 1], c[i]));
            var total = cum[cum.length - 1], far = c.map(function (p) { return !nearKnps(p, FAR_M); }), e = routeEnds(o.name), prevEnd = -1;
            for (var a = 0; a < c.length; a++) {
                if (!far[a]) continue;
                var b = a;
                while (b + 1 < c.length && far[b + 1]) b++;
                var i0 = Math.max(0, a - 1), i1 = Math.min(c.length - 1, b + 1);
                // 양 끝을 공단 탐방로에 가장 가까운 점까지 늘림(가까운 구간 안에서) - 120m 밖부터 그리면 공단 선이 끝나는 곳에서 틈이 보였음(2026-10-30 숨은벽)
                var nextFar = b + 1;
                while (nextFar < c.length && !far[nextFar]) nextFar++;
                // 25m 안에 닿으면 멈춤 · 최대 150m(그 너머는 공단 선과 나란한 길이라 덮지 않음)
                var a0 = i0, b1 = i1;
                for (var k0 = i0 - 1, best0 = knpsD(c[i0]); best0 > 25 && k0 > prevEnd && k0 >= 0 && cum[a0] - cum[k0] <= 150; k0--) { var x0 = knpsD(c[k0]); if (x0 < best0) { best0 = x0; i0 = k0; } }
                for (var k1 = i1 + 1, best1 = knpsD(c[i1]); best1 > 25 && k1 < nextFar && k1 < c.length && cum[k1] - cum[b1] <= 150; k1++) { var x1 = knpsD(c[k1]); if (x1 < best1) { best1 = x1; i1 = k1; } }
                prevEnd = b;
                var attA = a > 0, attB = b < c.length - 1;   // 앞 · 뒤 점이 공단 탐방로 둘레
                var headA = !attA && (nearHead(c[0]) || nearTop(c[0])), headB = !attB && (nearHead(c[c.length - 1]) || nearTop(c[c.length - 1]));
                var top = false;
                for (var k = i0; k <= i1 && !top; k++) top = nearTop(c[k]);
                a = b;
                if (!((attA && attB) || (attA && headB) || (attB && headA))) continue;
                if (cum[i1] - cum[i0] < (top ? 30 : MIN_M) || !total) continue;
                // 양 끝이 같은 공단 탐방로에 닿고 그 사이 공단 길이와 비슷하면(0.6 ~ 1.6배) 같은 길을 옆에 나란히 그린 것 - 뺌
                // (2026-10-13: 설악산 "대청봉 → 중청봉 → 대청봉" 같은 가짜 고리가 생겼음)
                var ta = onTrail(c[i0]), tb = onTrail(c[i1]);
                if (ta && tb && ta.t === tb.t && !top) {   // 정상으로 가는 막다른 길은 공단 선 끝 옆이라 나란해 보여도 씀(2026-10-30: 위문 → 백운대가 걸러졌음)
                    var along = Math.abs(tb.at - ta.at), run = cum[i1] - cum[i0];
                    if (along > 0.6 * run && along < 1.6 * run) continue;
                }
                var from = nameAt(c[i0]) || (i0 === 0 && e.from) || "갈림길", to = nameAt(c[i1]) || (i1 === c.length - 1 && e.to) || "갈림길";
                var r0 = cum[i0] / total, r1 = cum[i1] / total;
                out.push({ id: o.id + "@" + r0.toFixed(4) + "-" + r1.toFixed(4) + ":" + from + ">" + to, base: o.id,
                           name: (park ? park + " · " : "") + endsText(from, to), coords: c.slice(i0, i1 + 1),
                           distance_m: Math.round(cum[i1] - cum[i0]), ascent_m: null, extra: true, nocut: true });
            }
        });
        return dedupeSegs(out);
    }

    /** 순수 함수 - 고른 구간 안에 이은 구간(mergeBare)이 있으면 풀어서 코스 조각 차례로(거꾸로면 차례 · ~ 도 뒤집음). */
    function flattenSel(sel) {
        var out = [];
        (sel || []).forEach(function (s) {
            var parts = s.id.indexOf(",") >= 0 ? parseJoinId(s.id) : null;
            if (!parts) { out.push(s); return; }
            (s.rev ? reverseSel(parts) : parts).forEach(function (p) { out.push({ id: p.id, rev: p.rev }); });
        });
        return out;
    }

    /*
     * 산의 입산 · 통제 안내(data/park-notes.json - 2026-10-12 한라산: 하절기 4~9월 · 동절기 10~3월, 코스마다 통제 지점 · 시각).
     */

    /** 순수 함수 - 그날의 계절과 코스(이름들 가운데 match 가 맞는 것)의 통제 · 하산 시각. note 가 없으면 null. 달은 한국 날짜로(폰 시간대와 관계없이, 2026-11-02 홍TV님 점검). */
    function parkRules(note, names, date) {
        if (!note) return null;
        var m = new Date(date.getTime() + 9 * 3600000).getUTCMonth() + 1, season = null;
        Object.keys(note.seasons || {}).forEach(function (k) { if (note.seasons[k].indexOf(m) >= 0) season = k; });
        var c = (note.courses || []).filter(function (x) {
            var re = new RegExp(x.match);
            return (names || []).some(function (n) { return re.test(String(n || "")); });
        })[0] || null;
        var at = function (list) { return (list || []).map(function (g) { return { name: g.name, time: season ? g[season] : null }; }).filter(function (g) { return g.time; }); };
        return { season: season, open: note.open || null,
                 course: c ? { label: c.label, reserve: c.reserve || null, gates: at(c.gates), down: at(c.down) } : null };
    }

    /** 순수 함수 - parkRules → 한 줄("성판악(하절기): 성판악 입구 · 진달래밭통제소 12:30 입산 통제 · 동릉정상(백록담) 14:30 하산 · …"). */
    function rulesText(r) {
        if (!r || !r.course) return null;
        var c = r.course, parts = [];
        if (LANG === "en") {
            c.gates.forEach(function (g) { parts.push(enName(g.name) + " closes to climbers at " + g.time); });
            c.down.forEach(function (g) { parts.push("leave " + enName(g.name) + " by " + g.time); });
            if (r.open) parts.unshift("entry from " + r.open);
            return "Trail hours" + (r.season ? " (" + r.season.replace(/(\d+)월/g, "$1/").replace(/\s*~\s*/g, " - ") + ")" : "") + ": " + parts.join(" · ");
        }
        c.gates.forEach(function (g) { parts.push(g.name + " " + g.time + " 입산 통제"); });
        c.down.forEach(function (g) { parts.push(g.name + " " + g.time + " 하산"); });
        if (c.reserve) parts.push(c.reserve);
        if (r.open) parts.unshift("입산 " + r.open + "부터");
        return c.label + (r.season ? "(" + r.season + ")" : "") + ": " + parts.join(" · ");
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
     * 순수 함수 - 코스의 r0 ~ r1(길이 비율) 부분만. 이름표 · 갈림길은 그 안의 것만 거리를 당겨서, 위치표지 · 위험지역은 그대로(자리로 씀).
     * name 은 새 이름("지리산 · 노고단고개 → 장터목") - 끝 이름표는 endPois 가 이 이름으로.
     */
    function sliceCourse(c, r0, r1, name, id) {
        var d0 = Math.max(0, r0) * c.total, d1 = Math.min(1, r1) * c.total;
        // 끝은 d1 에 닿는 첫 점(점 바로 위에서 자르면 그 점까지)
        var i0 = indexAt(c, d0), j1 = indexAt(c, d1), i1 = Math.min(c.lon.length - 1, c.dist[j1] >= d1 - 0.5 ? j1 : j1 + 1), base = c.dist[i0];
        var s = { id: id || c.id, rev: false, markers: [], lon: c.lon.slice(i0, i1 + 1), lat: c.lat.slice(i0, i1 + 1), ele: c.ele.slice(i0, i1 + 1),
                  signs: c.signs || [], spots: c.spots || [], info: null };
        s.dist = c.dist.slice(i0, i1 + 1).map(function (d) { return d - base; });
        s.total = s.dist[s.dist.length - 1];
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
        return s;
    }

    /**
     * 순수 함수 - 고른 구간(차례대로)이 등산 코스 모양인가(2026-10-12 홍TV님: 칼바위를 두 번 지나며 오르내리는 코스는 없음 - 둘레길과 다름).
     * 지나는 갈림길(구간 사이 점)을 차례로 보고:
     *   path  - 같은 곳을 두 번 지나지 않음(한쪽에서 올라 다른 쪽으로)
     *   loop  - 끝이 처음 자리(원점회귀)
     *   lolli - 끝이 지나온 갈림길 k(들머리 → 갈림길 → 한 바퀴 → 갈림길 → 들머리: 중산리 → 칼바위 → 로터리 → 천왕봉 → 장터목 → 칼바위 → 중산리) -
     *           따라가기는 처음 k 구간을 거꾸로 붙여 들머리로 돌아옴
     *   bad   - 그 밖(같은 곳을 엉뚱하게 두 번)
     * → {type, k}. nearM 안이면 같은 곳.
     */
    /**
     * 순수 함수 - 이어 걷기 그림: 구간마다 걷는 방향 좌표 + 빈틈 점선. 다음 구간 시작이 갈림길을 지나쳐 그려진 자료면(지리산 벽소령 -
     * 연하천삼거리 선 끝이 대피소 남쪽 120m) 앞 구간 끝에서 가장 가까운 점까지 잘라 V 자로 내려갔다 오지 않게(2026-10-14 PC).
     * 앞 구간 끝이 지나쳐 그려진 것 · 둘 다 지나쳐 나란히 그려진 것도 같은 방법. 잘라도 더 가까워지지 않으면 그대로. → {lines: [[[lon,lat]…]…], gaps: [[a, b]…]}
     */
    function joinDraw(sel, lines, maxM) {
        var max = maxM == null ? 200 : maxM, segs = [];
        (sel || []).forEach(function (s) {
            var q = lines[s.id];
            if (q && q.length) segs.push(s.rev ? q.slice().reverse() : q.slice());
        });
        var gaps = [];
        var d = function (a, b) { return distM(a[1], a[0], b[1], b[0]); };
        for (var i = 0; i + 1 < segs.length; i++) {
            var A = segs[i], B = segs[i + 1], aEnd = A[A.length - 1], gap0 = d(aEnd, B[0]);
            // A 뒤쪽 절반 × B 앞쪽 절반에서 가장 가까운 두 점 - 둘 다 갈림길을 지나쳐 나란히 그려진 자료도(지리산 세석평전 - 2026-10-14 PC: 15m 간격으로 나란히)
            var ai = A.length - 1, bj = 0, best = gap0, k, m;
            for (k = Math.floor(A.length / 2); k < A.length; k++) {
                for (m = 0; m < Math.ceil(B.length / 2); m++) { var x = d(A[k], B[m]); if (x < best) { best = x; ai = k; bj = m; } }
            }
            if (best < gap0 - 10) { segs[i] = A = A.slice(0, ai + 1); segs[i + 1] = B = B.slice(bj); }
            var g = d(A[A.length - 1], B[0]);
            if (g > 3 && g <= max) gaps.push([A[A.length - 1], B[0]]);
        }
        return { lines: segs, gaps: gaps };
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
     * 순수 함수 - 탐방로 이름의 처음 · 끝이 들머리 이름의 앞부분이고(중산리 ↔ 중산리탐방지원센터) 그 끝 500m 안에 그 들머리가 있으면 들머리 이름으로.
     * heads: [{name, lat, lon}](/api/park - 다른 자료 코스 이름에서 모은 탐방지원센터 · 탐방안내소). 2026-10-12 홍TV님.
     */
    function headAlias(trails, heads, nearM) {
        var near = nearM == null ? 500 : nearM;
        if (!heads || !heads.length) return trails;
        return (trails || []).map(function (t) {
            var e = routeEnds(t.name), names = {};
            [e.from, e.to].forEach(function (w) {
                // 폭포 · 봉우리 · 고개 · 절 같은 자연 · 지명은 그대로(2026-10-13 PC: 설악산 용소폭포가 용소폭포탐방지원센터로 바뀌었음)
                if (!w || SMALL_SUFFIX.test(w) || /(폭포|봉|산|대|령|재|고개|골|계곡|담|소|암|굴|바위)$/.test(w)) return;
                var key = w.replace(/\s+/g, "");
                [t.coords[0], t.coords[t.coords.length - 1]].forEach(function (p) {
                    heads.forEach(function (h) {
                        var hn = String(h.name || "");
                        if (names[w] || hn.replace(SMALL_SUFFIX, "") !== key) return;
                        if (distM(p[1], p[0], +h.lat, +h.lon) < near) names[w] = hn;
                    });
                });
            });
            if (!Object.keys(names).length) return t;
            var x = {};
            for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) x[k] = t[k];
            x.name = aliasName(t.name, names);
            return x;
        });
    }

    /**
     * 순수 함수 - 고른 탐방로 묶음(차례 없음)을 실제로 걷는 순서로(2026-10-12 홍TV님: 중산리 → 칼바위 → 로터리 → 천왕봉 → 로터리 → 순두류 → 중산리 처럼
     * 정상은 올랐다 같은 길로 내려와 다른 길로 - 한 줄로 잇는 방식으로는 못 골랐음).
     *   - 출발: 들머리(heads 500m 안 막다른 끝), 없으면 처음 고른 탐방로의 막다른 끝, 없으면 그 처음
     *   - 막다른 끝 가운데 다른 들머리는 도착(한쪽으로 가는 코스), 들머리가 아닌 막다른 끝(정상 · 폭포 …)은 올랐다 같은 길로(두 번)
     *   - 그래도 갈림길에서 끝나면 출발까지 가장 짧은 길로 돌아옴(원점회귀)
     * ids: 고른 탐방로 ID, lines: {ID: 좌표}, opts: {heads, first(처음 고른 ID), nearM, start([경도, 위도] - 출발을 정할 때, 300m 안 끝)}.
     * → {ok, walk:[{id, rev}], loop, start:[경도, 위도], end:[경도, 위도]}. 이어지지 않으면 ok:false.
     */
    function planWalk(ids, lines, opts) {
        opts = opts || {};
        var near = opts.nearM == null ? 150 : opts.nearM, d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        ids = (ids || []).filter(function (id) { return lines[id] && lines[id].length > 1; });
        if (!ids.length) return { ok: false };
        var nodes = [], node = function (p) {
            for (var i = 0; i < nodes.length; i++) if (d(p, nodes[i]) < near) return i;
            nodes.push(p);
            return nodes.length - 1;
        };
        var E = ids.map(function (id) { var l = lines[id]; return { id: id, a: node(l[0]), b: node(l[l.length - 1]) }; });
        var adj = nodes.map(function () { return []; });
        E.forEach(function (e, i) { adj[e.a].push(i); adj[e.b].push(i); });
        // 이어져 있나
        var seen = { 0: true }, st = [0];
        while (st.length) adj[st.pop()].forEach(function (i) { [E[i].a, E[i].b].forEach(function (n) { if (!seen[n]) { seen[n] = true; st.push(n); } }); });
        if (Object.keys(seen).length !== nodes.length) return { ok: false, reason: "apart" };   // 아직 이어지지 않음
        var deg = adj.map(function (a) { return a.length; }), leaves = [];
        deg.forEach(function (g, n) { if (g === 1) leaves.push(n); });
        var isHead = function (n) { return (opts.heads || []).some(function (h) { return d(nodes[n], [+h.lon, +h.lat]) < 500; }); };
        var firstE = E.filter(function (e) { return e.id === opts.first; })[0] || E[0];
        // 들머리가 여럿이면 탐방지원센터에 가장 가까운 곳(중산리탐방지원센터 3m · 법계교 257m)
        var headD = function (n) { return Math.min.apply(null, (opts.heads || []).map(function (h) { return d(nodes[n], [+h.lon, +h.lat]); }).concat([Infinity])); };
        // 먼저 누른 탐방로 쪽 들머리가 출발(2026-10-13 홍TV님: 한계령을 먼저 누르고 남설악을 눌렀는데 남설악이 출발이 됐음)
        var s = [firstE.a, firstE.b].filter(function (n) { return deg[n] === 1 && isHead(n); })[0];
        if (s == null) s = leaves.filter(isHead).sort(function (x, y) { return headD(x) - headD(y); })[0];
        if (s == null) s = [firstE.a, firstE.b].filter(function (n) { return deg[n] === 1; })[0];
        if (s == null) s = firstE.a;
        // 출발을 정해 줌(원점회귀 예시의 들머리 - 고리 위 들머리는 막다른 끝이 아니라 첫 탐방로 끝이 출발이 됐음, 2026-10-13)
        if (opts.start) {
            var sd = 300;
            nodes.forEach(function (q, n) { var x = d(q, opts.start); if (x < sd) { sd = x; s = n; } });
        }
        var others = leaves.filter(function (n) { return n !== s; }), ends = others.filter(isHead);
        var end = ends.length ? ends[0] : null, spurs;
        // 들머리 자료가 없고 막다른 끝이 하나뿐인 그냥 길이면 거기가 도착
        if (end == null && others.length === 1 && E.length === nodes.length - 1) end = others[0];
        spurs = others.filter(function (n) { return n !== end; });
        // 막다른 갈래(올랐다 같은 길로 돌아올 곳)는 하나만 - 둘 이상이면 사이 탐방로가 빠진 것(2026-10-13 홍TV님: 설악산 무너미고개 · 양폭대피소
        // 사이가 빠졌는데 둘 다 되돌아오는 26km 원점회귀로 짰음). 아직 이어지지 않은 것으로 봄
        // 막다른 끝 자리(loose)도 줌 - "끝이 소공원 · 양폭대피소 · 무너미고개 세 곳으로 갈라져 있습니다"(2026-10-13 PC)
        if (spurs.length > 1) return { ok: false, reason: "apart", loose: leaves.map(function (n) { return nodes[n]; }) };
        var M = E.map(function (e) { return { id: e.id, a: e.a, b: e.b }; });   // 걷는 길(두 번 걷는 길은 두 벌)
        // 막다른 갈래는 막다른 끝에서 갈림길(세 갈래 이상)까지 전부 두 번(2026-10-13 PC: 천왕봉 370m 앞에서 잘려 "법계사 → 갈림길 → 천왕봉" 두 조각이면
        // 마지막 조각만 두 번이라 못 짰음)
        spurs.forEach(function (n) {
            var prevE = -1, cur = n;
            while (true) {
                var nxt = adj[cur].filter(function (i) { return i !== prevE; })[0];
                if (nxt == null) break;
                M.push({ id: E[nxt].id, a: E[nxt].a, b: E[nxt].b });
                cur = E[nxt].a === cur ? E[nxt].b : E[nxt].a;
                prevE = nxt;
                if (adj[cur].length !== 2 || cur === s || cur === end) break;
            }
        });
        var mdeg = nodes.map(function () { return 0; });
        M.forEach(function (e) { mdeg[e.a]++; mdeg[e.b]++; });
        var odd = mdeg.map(function (g, n) { return g % 2 ? n : -1; }).filter(function (n) { return n >= 0; });
        if (odd.length === 2 && odd.indexOf(s) >= 0) {
            var t = odd[0] === s ? odd[1] : odd[0];
            if (t !== end) {
                // 갈림길에서 끝남 - 출발까지 가장 짧은 길(고른 탐방로 안)을 한 번 더 걸어 돌아옴
                var dist = {}, prev = {}, q = [t];
                dist[t] = 0;
                while (q.length) {
                    q.sort(function (x, y) { return dist[x] - dist[y]; });
                    var u = q.shift();
                    adj[u].forEach(function (i) {
                        var v = E[i].a === u ? E[i].b : E[i].a, L = d(nodes[E[i].a], nodes[E[i].b]) + 1;
                        if (dist[v] == null || dist[u] + L < dist[v]) { dist[v] = dist[u] + L; prev[v] = i; q.push(v); }
                    });
                }
                for (var v = s; v !== t && prev[v] != null; v = E[prev[v]].a === v ? E[prev[v]].b : E[prev[v]].a)
                    M.push({ id: E[prev[v]].id, a: E[prev[v]].a, b: E[prev[v]].b });
                mdeg = nodes.map(function () { return 0; });
                M.forEach(function (e) { mdeg[e.a]++; mdeg[e.b]++; });
                odd = mdeg.map(function (g, n) { return g % 2 ? n : -1; }).filter(function (n) { return n >= 0; });
            }
        }
        if (!(odd.length === 0 || (odd.length === 2 && odd.indexOf(s) >= 0))) return { ok: false, reason: "shape" };
        // 한 붓 그리기(Hierholzer) - s 에서
        var madj = nodes.map(function () { return []; }), used = M.map(function () { return false; });
        M.forEach(function (e, i) { madj[e.a].push(i); madj[e.b].push(i); });
        var stack = [{ n: s, e: -1 }], path = [];
        while (stack.length) {
            var top = stack[stack.length - 1], nx = -1;
            while (madj[top.n].length) { var i2 = madj[top.n].pop(); if (!used[i2]) { nx = i2; break; } }
            if (nx < 0) { path.push(stack.pop()); continue; }
            used[nx] = true;
            stack.push({ n: M[nx].a === top.n ? M[nx].b : M[nx].a, e: nx, from: top.n });
        }
        path.reverse();
        var walk = path.filter(function (x) { return x.e >= 0; }).map(function (x) { return { id: M[x.e].id, rev: M[x.e].a !== x.from }; });
        if (walk.length !== M.length) return { ok: false, reason: "shape" };
        var last = path[path.length - 1].n;
        // 끝이 출발 600m 안이면 원점회귀(중산리탐방지원센터 ↔ 법계교 375m)
        // 한 구간이 정상을 지나 조금 되돌아 끝나는 것(지리산 "갈림길 → 천왕봉" 491m)은 원점회귀가 아님 - 2km 넘게 걸을 때만(2026-10-13 PC)
        var walkM = walk.reduce(function (m, x) { var l = lines[x.id]; for (var i = 1; i < l.length; i++) m += d(l[i - 1], l[i]); return m; }, 0);
        return { ok: true, walk: walk, loop: last === s || (d(nodes[last], nodes[s]) < 600 && walkM > 2000), start: nodes[s], end: nodes[last] };
    }

    /**
     * 순수 함수 - 탐방 안내도의 원점회귀 예시(2026-10-13 홍TV님: 모든 산에 원점회귀 코스 예시). 들머리에서 봉우리까지 가장 짧은 길로 오르고,
     * 그 길을 되도록 피한 다른 길로 내려오는 고리(올라간 길과 1km 넘게 · 30% 넘게 달라야). 고리가 없으면 같은 길 왕복.
     * 옅은 선(gapFill - 산림청 · 등산트레킹 자료)은 1.5km 안 짧은 이음만 - 한라산 남벽분기점 → 정상처럼 막힌 길이 섞였음.
     * segs: [{id, coords, distance_m, extra}], heads: [{name, lat, lon}](들머리 - 300m 안 구간 끝), peaks: [{name, lat, lon, ele_m}](150m 안 구간 끝),
     * opts: {max(3), minM(3000), maxM(20000), planHeads(planWalk 의 heads), block([[경도, 위도]] - 지나갈 수 없는 곳, park-notes 의 noPass)}.
     * → [{ids, walk, loop, head, peak, m, start}] - 높은 봉우리부터, 봉우리마다 하나, 앞 예시와 절반 넘게 같은 길이면 뺌.
     */
    function loopExamples(segs, heads, peaks, opts) {
        opts = opts || {};
        var max = opts.max || 3, minM = opts.minM || 3000, maxM = opts.maxM || 20000;
        var d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); }, nodes = [], lines = {}, len = {};
        var node = function (p) {
            for (var i = 0; i < nodes.length; i++) if (d(p, nodes[i]) < 150) return i;
            nodes.push(p);
            return nodes.length - 1;
        };
        var E = [];
        (segs || []).forEach(function (s) {
            // 옅은 선은 1.5km 안 짧은 이음만(설악산 중청 → 대청봉 600m 는 공단 자료에 없음), 지나갈 수 없는 곳(opts.block - 한라산 남벽분기점) 둘레는 빼고
            if (!s.coords || s.coords.length < 2 || (s.extra && !(+s.distance_m <= 1500))) return;
            if (s.extra && (opts.block || []).some(function (b) { return d(s.coords[0], b) < 300 || d(s.coords[s.coords.length - 1], b) < 300; })) return;
            lines[s.id] = s.coords;
            len[s.id] = +s.distance_m || 1;
            E.push({ id: s.id, a: node(s.coords[0]), b: node(s.coords[s.coords.length - 1]), m: len[s.id] });
        });
        var adj = nodes.map(function () { return []; });
        E.forEach(function (e, i) { if (e.a !== e.b) { adj[e.a].push(i); adj[e.b].push(i); } });
        var nearest = function (p, lim) {
            var best = -1, bd = lim;
            nodes.forEach(function (q, n) { var x = d(p, q); if (x < bd) { bd = x; best = n; } });
            return best;
        };
        var path = function (from, to, cost) {
            var dist = nodes.map(function () { return Infinity; }), pe = nodes.map(function () { return -1; }), done = {}, q = [from];
            dist[from] = 0;
            while (q.length) {
                q.sort(function (x, y) { return dist[x] - dist[y]; });
                var u = q.shift();
                if (done[u]) continue;
                done[u] = true;
                if (u === to) break;
                adj[u].forEach(function (i) {
                    var v = E[i].a === u ? E[i].b : E[i].a, w = dist[u] + cost(i);
                    if (w < dist[v]) { dist[v] = w; pe[v] = i; q.push(v); }
                });
            }
            if (!isFinite(dist[to])) return null;
            var out = [], n = to;
            while (n !== from) { out.push(pe[n]); n = E[pe[n]].a === n ? E[pe[n]].b : E[pe[n]].a; }
            return out.reverse();
        };
        var H = (heads || []).map(function (h) { return { h: h, n: nearest([+h.lon, +h.lat], 300) }; }).filter(function (x) { return x.n >= 0; });
        var P = (peaks || []).filter(function (p) { return p.ele_m != null; }).slice().sort(function (x, y) { return +y.ele_m - +x.ele_m; })
            .map(function (p) { return { p: p, n: nearest([+p.lon, +p.lat], 150) }; }).filter(function (x) { return x.n >= 0; });
        var out = [], usedHead = {};
        P.forEach(function (pk) {
            // 이웃한 봉우리(1km - 도봉산 신선대 · 자운봉, 설악산 대청봉 · 중청봉)는 같은 산행이라 빼고
            if (out.length >= max) return;
            if (out.some(function (o) { return o.at !== pk.p && d([+o.at.lon, +o.at.lat], [+pk.p.lon, +pk.p.lat]) < 1000; })) return;
            var cands = [];
            H.forEach(function (hd) {
                if (hd.n === pk.n) return;
                var up = path(hd.n, pk.n, function (i) { return E[i].m; });
                if (!up) return;
                var upSet = {};
                up.forEach(function (i) { upSet[i] = true; });
                var upM = up.reduce(function (m, i) { return m + E[i].m; }, 0);
                var down = path(pk.n, hd.n, function (i) { return upSet[i] ? E[i].m * 5 : E[i].m; });
                var other = down ? down.filter(function (i) { return !upSet[i]; }) : [];
                var otherM = other.reduce(function (m, i) { return m + E[i].m; }, 0);
                var ids = (otherM >= 1000 && otherM >= 0.3 * upM ? up.concat(other) : up).map(function (i) { return E[i].id; })
                    .filter(function (id, k, a) { return a.indexOf(id) === k; });
                var loop = ids.length > up.length;
                var at0 = [+hd.h.lon, +hd.h.lat];
                var plan = planWalk(ids, lines, { heads: opts.planHeads || heads, first: ids[0], start: at0 });
                if (!plan.ok) return;
                if (loop && !plan.loop) return;
                // 왕복은 봉우리에서 돌아서야(지리산 범왕교 ↔ 반야봉이 쟁기소까지 가는 편도였음 - 2026-10-13 PC)
                if (!loop && d(plan.end, nodes[pk.n]) > 200) return;
                var walk = plan.walk;
                if (!loop) walk = walk.concat(reverseSel(walk));   // 같은 길 왕복
                var m = walk.reduce(function (t, x) { return t + len[x.id]; }, 0);
                if (m < minM || m > maxM) return;
                // "한라산동능정상" → "한라산 정상", "도봉산신선대" → "신선대"
                var pn = String(pk.p.name).replace(/^(\S+산)\S*정상$/, "$1 정상").replace(/^\S+산(?=\S*(봉|대)$)(?!$)/, "");
                cands.push({ ids: ids, walk: walk, loop: loop, head: hd.h.name, peak: pn || pk.p.name, m: m, at: pk.p, start: at0 });
            });
            // 고리가 왕복보다 먼저, 그다음 아직 안 쓴 들머리, 짧은 것
            cands = cands.filter(function (c) { return !usedHead[c.head]; });
            cands.sort(function (x, y) { return (y.loop - x.loop) || x.m - y.m; });
            // 앞 예시와 절반 넘게 같은 길(도봉산 신선대 · 자운봉, 설악산 중청봉 · 소청봉)은 빼고
            cands = cands.filter(function (c) {
                return !out.some(function (o) { return c.ids.filter(function (id) { return o.ids.indexOf(id) >= 0; }).length > 0.5 * Math.min(c.ids.length, o.ids.length); });
            });
            // 높은 봉우리는 다른 들머리로 한 번 더(설악산 대청봉 - 남설악 · 한계령)
            var per = 0;
            cands.forEach(function (c) {
                if (out.length >= max || usedHead[c.head] || per >= 2) return;
                if (out.some(function (o) { return o.ids.filter(function (id) { return c.ids.indexOf(id) >= 0; }).length > 0.5 * Math.min(c.ids.length, o.ids.length); })) return;
                out.push(c);
                usedHead[c.head] = true;
                per++;
            });
        });
        return out;
    }

    /**
     * 순수 함수 - 탐방로망의 들머리 · 날머리(2026-10-13 홍TV님: 모든 산에 표시). 구간 끝을 150m 로 묶은 자리마다:
     *   - 이름이 탐방지원센터 · 탐방안내소 · 분소 · 매표소 · 주차장이면 들머리(원효분소 · 화엄사탐방안내소 - 여러 탐방로가 만나도)
     *   - 거기 닿은 탐방로가 모두 거기서 시작하면 들머리(송추 → 사패능선 · 송추 → 오봉능선)
     *   - 막다른 끝이 탐방로의 끝(이름 "… → X" 의 X)이면 X 가 마을 · 입구 · 교 같은 곳일 때만(운봉아래 · 제방 · 숯가마터는 산 위 끝)
     *   - "관음사 탐방로" 처럼 이름에 출발 · 도착이 없으면 다른 탐방로가 덜 닿은 끝이 "관음사"
     *   - 다른 자료 코스가 마을 · 휴게소 · 주차장에서 시작하는 자리(300m - 성삼재휴게소)
     * 다른 탐방로 가운데를 지나는 자리는 빼고, 봉우리 · 폭포 같은 산 위 이름도 뺌. 이름은 그 자리의 탐방지원센터 이름 → 500m 안 heads → 탐방로 끝 이름.
     * 서버 heads 가운데 가까운 들머리가 없는 것도 넣음. 같은 이름 · 300m 안, "백무동" · "백무동탐방지원센터" 처럼 앞이 같은 이름(2km 안)은 하나.
     * 탐방로 옆 다른 자료 코스가 절 · 주차장에서 시작하는 곳(대원사석등 → 대원사), want(park-notes heads)에 적은 이름표(도선사)도.
     * segs: [{id, name, coords}], flips: routeFlips, others: [{name, coords}](다른 자료 코스), places: [{name, lat, lon}], want: [이름]. → [{name, lat, lon}].
     */
    function trailHeads(segs, heads, flips, others, places, want) {
        var near = 150, d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); }, ends = [];
        var HEAD = /(탐방지원센터|탐방안내소|안내센터|분소|매표소|주차장|휴게소)$/;
        var ACCESS = /(마을|리|동|입구|재|령|고개|주차장|휴게소|매표소|분소|탐방지원센터|탐방안내소|교|IC|정류장|중|초|중학교|초등학교)$/;
        var HIGH = /(대피소|산장|봉|산|대|단|정상|오름|폭포|전망대|암|굴|바위|능선|고지|갈림길|탐방로 끝|쪽 끝|부근|분기점|코스\d*|탐방로\s*\d*|삼거리|사거리|경계|문)$/;
        var DEAD_HIGH = /(대피소|산장|봉|산|정상|오름|폭포|전망대|굴|바위|능선|고지|갈림길|끝|부근|분기점|삼거리|사거리|터|옛길|제방|소|담|탕|치|대|단|문|암|코스\d*|탐방로\s*\d*)$/;
        var JUNK = /(소리길|둘레길|옛길|대피소|산장|봉|산|정상|오름|폭포|능선|갈림길|쪽끝|탐방로끝|부근|분기점|삼거리|사거리|코스\d*|탐방로\d*|문|연결선|해안가|산행)$/;
        // "우이분소 밑" → 우이분소, "강북구 우이동" → 우이동(2026-10-13 홍TV님)
        var clean = function (n) { return String(n || "").replace(/\s*(밑|아래|뒤)$/, "").replace(/^[가-힣]{1,4}[구군시]\s+(?=[가-힣])/, "").trim(); };
        (segs || []).forEach(function (s) {
            if (!s.coords || s.coords.length < 2) return;
            var e = routeEnds(s.name), f = flips && flips[s.id];
            // "관음사 탐방로", 이름이 한 곳뿐인 탐방로("설악산 · 백담사")
            var rt = nameParts(s.name).route, title = !e.from && !e.to && !s.extra && (/^(.+?)\s*탐방로$/.exec(rt) || (/^[가-힣]{2,8}$/.test(rt) && !/(코스|탐방로)$/.test(rt) && !HIGH.test(rt) && !DEAD_HIGH.test(rt) ? [rt, rt] : null));
            ends.push({ p: s.coords[0], name: f ? e.to : e.from, from: !f, s: s, title: title && title[1], other: f ? e.from : e.to });
            ends.push({ p: s.coords[s.coords.length - 1], name: f ? e.from : e.to, from: !!f, s: s, title: title && title[1], other: f ? e.to : e.from });
        });
        // 끝 묶기
        var groups = [];
        ends.forEach(function (x) {
            var g = groups.filter(function (g) { return d(g[0].p, x.p) < near; })[0];
            if (g) g.push(x); else groups.push([x]);
        });
        var count = function (s, p) { return groups.filter(function (g) { return d(g[0].p, p) < near; })[0].length; };
        var otherStarts = (others || []).map(function (o) {
            var e = routeEnds(o.name);
            return o.coords && o.coords.length && e.from && ACCESS.test(e.from.replace(/\s+/g, "")) ? o.coords[0] : null;
        }).filter(Boolean);
        // 길이 닿는 곳(휴게소 · 주차장 · 마을 …)에서 시작하는 다른 자료 코스 - 고개가 들머리인지 볼 때(성삼재휴게소)
        var roadStarts = (others || []).map(function (o) {
            var e = routeEnds(o.name);
            return o.coords && o.coords.length && e.from && /(휴게소|주차장|마을|리|동|입구|정류장|탐방지원센터|탐방안내소|분소|매표소)$/.test(e.from.replace(/\s+/g, "")) ? o.coords[0] : null;
        }).filter(Boolean);
        var out = [];
        groups.forEach(function (g) {
            var p = g[0].p;
            // 다른 탐방로 가운데를 지나는 자리(자르지 않은 곳)는 들머리 아님
            // 같은 자리에서 나란히 시작하는 탐방로(300m 안 - 북한산 송추 → 사패능선 · 송추폭포입구 → 오봉능선)는 괜찮음
            var mid = (segs || []).some(function (s) {
                if (g.some(function (x) { return x.s === s; })) return false;
                var c = s.coords, cum = 0;
                for (var k = 1; k < c.length - 1; k++) {
                    cum += d(c[k - 1], c[k]);
                    if (d(p, c[k]) < 60 && cum > 300 && d(p, c[0]) > 300 && d(p, c[c.length - 1]) > 300) return true;
                }
                return false;
            });
            if (mid) return;
            var names = g.map(function (x) { return x.name; }).filter(Boolean);
            var own = names.filter(function (n) { return HEAD.test(n.replace(/\s+/g, "")); })[0];
            var server = (heads || []).filter(function (h) { return d(p, [+h.lon, +h.lat]) < 500; })
                .sort(function (x, y) { return d(p, [+x.lon, +x.lat]) - d(p, [+y.lon, +y.lat]); })[0];
            // 이름에 출발 · 도착이 없는 탐방로("관음사 탐방로")는 다른 탐방로가 덜 닿은 끝
            var title = g.filter(function (x) {
                if (!x.title) return false;
                var c = x.s.coords, other = x.p === c[0] ? c[c.length - 1] : c[0];
                return g.length <= count(x.s, other);
            })[0];
            // 옅은 선(다른 자료로 메운 길) 끝은 빼고 봄(북한산 송추 - "갈림길 → 갈림길" 옅은 선이 닿아 있었음)
            var own2 = g.filter(function (x) { return !x.s.extra; });
            var allFrom = own2.length > 0 && own2.every(function (x) { return x.from && x.name; });
            // 탐방로 끝이 막다른 곳이면 내려온 들머리(장수대 · 운봉아래 · 다불마을) - 산 위 이름 · 옛터 · 제방은 빼고
            // 출발이 산 위(봉 · 폭포 · 삼거리)면 끝은 아래, 출발이 마을 · 입구 · 절이면 끝은 산 위, 모르면 끝 이름으로
            var deadTo = false;
            if (g.length === 1 && !g[0].from && g[0].name) {
                var o = String(g[0].other || "").replace(/\s+/g, ""), nm0 = String(g[0].name).replace(/\s+/g, "");
                // 끝 이름이 마을 · 리면 늘(설악산 "곰배골입구 → 곰배령 → 강선리")
                deadTo = /(마을|리)$/.test(nm0) || (HIGH.test(o) ? !/(봉|산|정상|오름)$/.test(nm0) : ACCESS.test(o) || /(사|약수터)$/.test(o) ? false : !DEAD_HIGH.test(nm0));
            }
            // 다른 자료 코스가 시작하는 곳은 막다른 끝이거나 마을 · 입구 같은 이름일 때만(지리산 숯가마터 · 북한산 부왕동암문은 산 위)
            var started = (g.length === 1 && g[0].from || names.some(function (n) { return ACCESS.test(n.replace(/\s+/g, "")); }))
                && otherStarts.some(function (q) { return d(p, q) < 300; });
            if (!(own || allFrom || deadTo || title || server || started)) return;
            // 마을 · 입구 같은 이름 먼저("새재" 보다 "윗새재마을")
            var fromNames = g.filter(function (x) { return x.from && x.name && !HIGH.test(x.name); }).map(function (x) { return x.name; });
            var fromName = fromNames.filter(function (n) { return /(마을|리|동|입구|주차장)$/.test(n.replace(/\s+/g, "")); })[0] || fromNames[0];
            var name = own || (server && server.name) || (title && title.title) || fromName
                || names.filter(function (n) { return !HIGH.test(n); })[0];
            if (deadTo && !own && !server) name = g[0].name;
            var raw = String(name || "");   // "운봉아래" 는 산 아래(봉우리 이름 빼기는 원래 이름으로)
            name = clean(name);
            if (!name || (!own && !server && !title && !deadTo && (HIGH.test(name) || name === "삼거리"))) return;
            // 길 이름 · 갈림길 · 산 위 이름은 어느 쪽이든 빼고(포대능선 · 대성문 · "배나무등 쪽 끝" · 금수산코스 · 제3폭포)
            if (!own && !server && JUNK.test(raw.replace(/\s+/g, ""))) return;
            // 고개(재 · 령 · 고개 · 치)는 길이 닿는 곳만 - 다른 자료 코스가 거기서 시작할 때(성삼재 · 육십령), 능선 위 고개(덕유산 횡경재 · 주왕산 칼등고개)는 빼고
            if (!own && !server && /(재|령|고개|치)$/.test(name.replace(/\s+/g, "")) && !roadStarts.some(function (q) { return d(p, q) < 300; })) return;
            out.push({ name: name, lat: p[1], lon: p[0] });
        });
        // 탐방로에서 먼 서버 heads 도(다른 자료 코스 끝 - 지리산남부탐방안내소)
        (heads || []).forEach(function (h) { out.push({ name: String(h.name), lat: +h.lat, lon: +h.lon, server: true }); });
        // park-notes heads 에 적은 들머리(2026-10-13 홍TV님: 도선사 · 대원사 · 육십령 …) - 같은 이름 이름표, 다른 자료 코스 출발
        // ("대원사석등 → 써리봉" · "진고개정상휴게소 → 두로봉"), 그 낱말이 든 이름표 차례로 자리를 찾음. 적지 않은 절 · 주차장은 넣지 않음(북한산 54곳이 됐었음)
        var extra = [];
        (want || []).forEach(function (w) {
            var key0 = String(w).replace(/\s+/g, ""), hit = null;
            (places || []).forEach(function (q) { if (!hit && String(q.name || "").replace(/\s+/g, "") === key0) hit = [+q.lon, +q.lat]; });
            (others || []).forEach(function (o) {
                var f = String(routeEnds(o.name).from || "").replace(/\s+/g, "");
                if (!hit && o.coords && o.coords.length && f.indexOf(key0) >= 0) hit = o.coords[0];
            });
            // 낱말이 든 이름표는 마지막(지리산 "대원사집단시설지구주차장" 이름표가 중산리 자리에 있었음)
            (places || []).forEach(function (q) { if (!hit && String(q.name || "").replace(/\s+/g, "").indexOf(key0) >= 0) hit = [+q.lon, +q.lat]; });
            if (hit) extra.push({ name: String(w), lat: hit[1], lon: hit[0], want: true });
        });
        extra.sort(function (x, y) { return x.name.length - y.name.length; });   // "대원사" 가 "산청대원사" 보다 먼저
        out = out.concat(extra);
        var key = function (n) { return n.replace(/\s+/g, "").replace(/(탐방지원센터|탐방안내소|안내센터|분소|매표소)$/, "").replace(/산$/, ""); };
        // 탐방지원센터 · 탐방안내소 > 분소 > 매표소(옛 이름) > 그 밖
        var rank = function (n) { return /(탐방지원센터|탐방안내소)$/.test(n) ? 3 : /분소$/.test(n) ? 2 : /매표소$/.test(n) ? 1 : 0; };
        var kept = [];
        out.forEach(function (h) {
            var dup = kept.filter(function (o) {
                var x = d([o.lon, o.lat], [h.lon, h.lat]);
                // 절은 탐방지원센터 옆이어도 따로(백운대탐방지원센터 · 도선사) - 같은 자리(100m)만 하나
                var temple = /사$/.test(o.name) !== /사$/.test(h.name);
                // 탐방지원센터 600m 안 그냥 지명(오색약수터 · 남설악탐방지원센터)은 같은 들머리 - 절은 빼고
                if (!temple && Math.abs(rank(o.name) - rank(h.name)) === 3 && x < 600) return true;
                return o.name === h.name || x < (temple ? 100 : 300) || (key(o.name) === key(h.name) && x < 2000) || key(h.name).indexOf(key(o.name)) >= 0 && x < 1000;   // "산청대원사" · "우이동공영주차장" 은 "대원사" · "우이동" 옆이면 하나
            })[0];
            if (!dup) { kept.push(h); return; }
            // 같은 곳이면 탐방지원센터 이름을, 자리는 탐방로 위(서버 heads 는 다른 자료 코스 끝이라 조금 떨어짐)
            if (rank(h.name) > rank(dup.name) && key(dup.name) === key(h.name)) dup.name = h.name;
        });
        return kept.map(function (h) { return { name: h.name, lat: h.lat, lon: h.lon }; });
    }

    /**
     * 순수 함수 - 이름에 거쳐 가는 곳이 있는 탐방로("쟁기소 → 반야봉 → 삼도봉삼거리")의 선이 그 가운데서 시작 · 끝나면 이름을 거기까지로.
     * 2026-10-13 PC: 공단 선은 반야봉 → 삼도봉삼거리 970m 뿐인데 처음이 "쟁기소" 라 범왕교 ↔ 반야봉 왕복이 "쟁기소" 까지 가는 편도로 보였음.
     * 선 끝 200m 안의 places 이름이 거쳐 가는 곳이면 그 끝을 그 이름으로. → 바꾼 것만 새 객체.
     */
    function viaTrim(trails, places) {
        var d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        var at = {};
        (places || []).forEach(function (p) { var k = String(p.name || "").replace(/\s+/g, ""); (at[k] = at[k] || []).push([+p.lon, +p.lat]); });
        return (trails || []).map(function (t) {
            var np = nameParts(t.name), parts = String(np.route || "").split(" → ");
            if (parts.length < 3 || !t.coords || t.coords.length < 2) return t;
            var idx = function (p) {
                var best = -1, bd = 200;
                parts.forEach(function (w, i) { (at[w.replace(/\s+/g, "")] || []).forEach(function (q) { var x = d(p, q); if (x < bd) { bd = x; best = i; } }); });
                return best;
            };
            var a = idx(t.coords[0]), z = idx(t.coords[t.coords.length - 1]);
            var mid = function (i) { return i > 0 && i < parts.length - 1; };
            if (!mid(a) && !mid(z)) return t;
            // 거꾸로 그린 선이면 처음 쪽이 이름의 끝
            var lo, hi;
            if (a >= 0 && z >= 0) { lo = Math.min(a, z); hi = Math.max(a, z); }
            else if (a >= 0) { lo = a; hi = parts.length - 1; }
            else { lo = 0; hi = z; }
            if (hi - lo < 1) return t;
            var x = {};
            for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) x[k] = t[k];
            x.name = (np.group ? np.group + " · " : "") + parts.slice(lo, hi + 1).join(" → ");
            return x;
        });
    }

    /**
     * 순수 함수 - park-notes 의 trails(공단 자료 이름이 틀리거나 비어 있는 탐방로 - "knps-4016": "백담사 → 소청봉")로 코스 이름을 바로잡음.
     * notes: park-notes.json 의 parks, id: 코스 ID("knps-4016-55eabbcc"). 없으면 그대로. 2026-10-13 홍TV님: "출발" · "도착" 보다 들머리 · 날머리 이름.
     */
    function noteTrailName(notes, id, name) {
        var out = name;
        Object.keys(notes || {}).forEach(function (park) {
            var tr = notes[park] && notes[park].trails;
            Object.keys(tr || {}).forEach(function (k) {
                // 코스 ID 그대로("kmp-2322010639-1") 또는 앞부분("knps-4016" → knps-4016-55eabbcc), 값에 " · " 가 있으면 이름 전체
                if (String(id) !== k && String(id).indexOf(k + "-") !== 0) return;
                out = tr[k].indexOf(" · ") >= 0 ? tr[k] : (nameParts(name).group || park) + " · " + tr[k];
            });
        });
        return out;
    }

    /**
     * 순수 함수 - 같은 자리(150m) 이름표 가운데 산 이름만 앞에 더 붙은 것("설악산 울산바위" · "울산바위")은 짧은 것 하나만.
     * 2026-10-13 PC: 설악산 탐방 안내도에 둘이 같은 자리에 겹쳐 보였음. places: [{name, lat, lon, ele_m}].
     */
    function dedupePlaceNames(places) {
        var key = function (n) { return String(n || "").replace(/\s+/g, ""); };
        return (places || []).filter(function (p, i, all) {
            var k = key(p.name);
            return !all.some(function (q, j) {
                var kq = key(q.name);
                return j !== i && kq.length < k.length && k.slice(-kq.length) === kq && /^[가-힣]{1,6}산$/.test(k.slice(0, k.length - kq.length))
                    && distM(+p.lat, +p.lon, +q.lat, +q.lon) < 150;
            });
        });
    }

    /** 순수 함수 - 이름의 길 부분에서 다른 이름으로("지리산 · 중산리 → 천왕봉" + {중산리: 중산리탐방지원센터}). names 가 없으면 그대로. */
    function aliasName(name, names) {
        if (!names) return name;
        var n = String(name || ""), i = n.indexOf(" · "), head = i > 0 ? n.slice(0, i + 3) : "", route = i > 0 ? n.slice(i + 3) : n;
        return head + route.split(" → ").map(function (x) { return Object.prototype.hasOwnProperty.call(names, x.trim()) ? names[x.trim()] : x; }).join(" → ");
    }

    /** 순수 함수 - 고른 구간을 반대 방향으로(차례도 거꾸로, 구간마다 ~ 도 바꿈). */
    function reverseSel(sel) {
        return (sel || []).slice().reverse().map(function (s) { return { id: s.id, rev: !s.rev }; });
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

    /**
     * 봉우리 · 고개 이름인가 - 능선 길이 꼭대기를 비켜 가 경로에서 조금 멀어도(배치는 150m 까지 넣음) 경로 위 지점으로 봅니다.
     * 2026-10-10 PC: 상재봉 1코스 소지봉(경로에서 95m)이 지도 · 그래프에 안 보였음.
     */
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

    /** 순수 함수 - 지점 이름으로 아이콘(이름표 종류는 표에 없어 이름 끝말로 봅니다). */
    /**
     * 이름표 그림. Windows 10 글꼴에도 있는 이모지만 씁니다(🪨 · 🛖 · 🛕 처럼 최근 이모지는 빈칸으로 보임).
     * 걷기길 · 자전거길 지명(해수욕장 · 공원 · 역 · 항 · 다리 · 인증센터)도.
     */
    var UNIV = /^(서울|부산|대구|인천|광주|대전|울산|강원|충북|충남|전북|전남|경북|경남|제주|목포|순천|군산|창원|안동|공주|전주|청주|춘천|원주|강릉|포항|진주|여수|목원|한밭|부경|경상|경기|한림|동아|조선|영남|계명|인하|아주|한남|배재|우석|원광|호남|동신|초당|세한|한서|선문|호서|상지|가톨릭관동)대$/;
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
        // 학교("…학교" 가 다리 "교" 로 보이지 않게 먼저) - "목포대" 처럼 도시 이름 + 대는 대학(2026-10-13 홍TV님: 서해랑길 20코스 목포대가 바위 🗻). 비선대 · 문장대 같은 바위는 그대로
        if (/(대학교|대학|학교|초교|중교|고교|캠퍼스)$/.test(n) || UNIV.test(n)) return "🏫";
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
    /** 순수 함수 - 다음 글자 크기(140% 다음은 100%). */
    function nextTextScale(v) { return TEXT_STEPS[(TEXT_STEPS.indexOf(v) + 1) % TEXT_STEPS.length]; }
    /** "가+" 단추 - 누를 때마다 다음 크기. 모든 화면이 같은 설정을 씁니다. */
    function textButton() {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "rfTextBtn";
        b.title = tr("글자 크기(누를 때마다 100 → 120 → 140%)", "Text size (100 → 120 → 140% each tap)");
        b.setAttribute("aria-label", tr("글자 크기", "Text size"));
        b.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            var n = nextTextScale(textScale());
            try { localStorage.setItem(TEXT_KEY, String(n)); } catch (err) { /* 이번 화면만 */ }
            applyTextScale(n);
        });
        setTimeout(function () { applyTextScale(textScale()); }, 0);
        return b;
    }
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

    global.RF = {
        LINE_COLOR: LINE_COLOR,
        num: num,
        km: km,
        isTopName: isTopName,
        cleanName: cleanName,
        nameParts: nameParts,
        spotIcon: spotIcon,
        PARKS: PARKS,
        baseStyle: baseStyle,
        setCanonical: setCanonical,
        isClosedTrail: isClosedTrail,
        isHiddenCourse: isHiddenCourse,
        spotText: spotText,
        nameText: nameText,
        declutter: declutter,
        routeEnds: routeEnds,
        routeFlips: routeFlips,
        joinId: joinId,
        parseJoinId: parseJoinId,
        splitTrails: splitTrails,
        endsText: endsText,
        mergeBare: mergeBare,
        gapFill: gapFill,
        flattenSel: flattenSel,
        planWalk: planWalk,
        trailHeads: trailHeads,
        viaTrim: viaTrim,
        noteTrailName: noteTrailName,
        dedupePlaceNames: dedupePlaceNames,
        spotsByZoom: spotsByZoom,
        loopExamples: loopExamples,
        aliasName: aliasName,
        nameNodes: nameNodes,
        headAlias: headAlias,
        parkRules: parkRules,
        rulesText: rulesText,
        reverseSel: reverseSel,
        placeName: placeName,
        peakNearM: peakNearM,
        joinDraw: joinDraw,
        textButton: textButton,
        distM: distM,
        poiIcon: poiIcon,
        nameIn: function (s) { return LANG === "en" && s != null ? enName(s) : s; },
        setLang: setLang,
        tr: tr,
        pageLang: pageLang,
        applyEn: applyEn,
        mapLocale: mapLocale
    };
})(window);
