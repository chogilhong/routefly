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

    var NUMBERED_PARK = /[^\s·→()\d]+\d+\s*\(([^()]+공원)\)/g;
    // "수변공원49까지"(서해랑길 16코스) - 공원 이름 뒤 관리 번호도 뗌
    var PARK_NO = /([가-힣](?:공원|광장))\d+(?![\d)])/g;
    function numberedPark(name) { return name == null ? name : String(name).replace(NUMBERED_PARK, "$1").replace(PARK_NO, "$1"); }

    function stampKey(name) { return String(name || "").replace(/\s+/g, "").replace(/인증센터$/, ""); }

    /**
     * 순수 함수 - series.json 의 센터 이름(n)에 찍힌 도장. 똑같은 키가 없으면 키에 n 이 든 것
     * (2026-10-11 PC: 공식 파일 이름은 "통일전망대(민통선내)" · "삼척임원무인" 처럼 길어 "통일전망대" · "임원" 과 안 맞았음).
     * alts: 다른 이름(series.json aka - "영산하구둑" · OSM 오타 "망양휴계소").
     */
    function stampOf(stamps, n, alts) {
        if (!stamps) return null;
        var ks = [n].concat(alts || []).map(stampKey).filter(Boolean);
        for (var i = 0; i < ks.length; i++) if (stamps[ks[i]]) return stamps[ks[i]];
        for (var key in stamps) {
            if (!Object.prototype.hasOwnProperty.call(stamps, key)) continue;
            for (var j = 0; j < ks.length; j++) if (key.indexOf(ks[j]) >= 0) return stamps[key];
        }
        return null;
    }

    /** 산 정상 도장 열쇠 - 자료의 id(같은 이름 산이 여럿 - 백운산 등), 없으면 이름. */
    function peakKey(p) { return String((p && (p.id || p.name)) || "").replace(/\s+/g, ""); }

    /**
     * 순수 함수 - (lat, lon) 에서 그 산 정상까지 거리(m). 정상 둘(alt - 가야산은 산림청 자료의 칠불봉과 정상석이 있는 상왕봉이 약 240m 떨어짐,
     * 2026-10-14 홍TV님 도장 · 완주 검토: 해인사 → 상왕봉 코스는 칠불봉 150m 밖이라 도장이 안 찍혔음)이면 가까운 쪽.
     */
    function peakGapM(p, lat, lon) {
        return [p].concat(p.alt || []).reduce(function (m, q) {
            return isFinite(+q.lat) && isFinite(+q.lon) ? Math.min(m, distM(lat, lon, +q.lat, +q.lon)) : m;
        }, Infinity);
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

    function peakCourses(courses, peak, nearM) {
        var r = nearM || 2000, out = [];
        (courses || []).filter(function (c) { return !isClosedTrail(c.name); }).forEach(function (c) {
            var d = Math.min(c.end_lat != null ? peakGapM(peak, +c.end_lat, +c.end_lon) : Infinity,
                             c.start_lat != null ? peakGapM(peak, +c.start_lat, +c.start_lon) : Infinity);
            if (d <= r) out.push({ c: c, d: d });
        });
        return out.sort(function (a, b) { return a.d - b.d; }).map(function (x) { return x.c; });
    }

    /**
     * 순수 함수 - 인증센터마다 따라갈 구간 코스(centers 와 같은 길이, 못 찾으면 null).
     * marks: /api/group 의 centers - 구간마다 지나는 인증센터 이름표 {course_id, name, dist_m(구간 시작에서)}. aka: 센터의 다른 이름(series.json).
     * 그 센터에서 출발하거나 구간 안에 있는 구간(도착 500m 앞까지) 중 가장 앞(dist_m 작은) 것, 없으면 도착하는 구간(노선 마지막 센터).
     * 이름표가 없으면(예전 서버) 구간 이름 "… · A인증센터 → B인증센터" 의 출발 · 도착으로. 공식 이름이 길어("통일전망대(민통선내)") 이름 안에 든 것으로 봄.
     * 2026-10-12 홍TV님 "인증센터마다 따라가기" - PC: 이름만으로는 구간 안 센터가 다음 구간에 붙었음(낙단보 → 9구간).
     */
    function centerCourses(courses, centers, marks, aka) {
        var byId = {};
        (courses || []).forEach(function (c) { byId[c.course_id] = c; });
        function key(n) { return String(n || "").replace(/\s+/g, ""); }
        function ends(c) {
            var tail = key(String((c && c.name) || "").split(" · ").slice(1).join(" · "));
            var parts = tail ? tail.split("→") : [];
            return parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : null;
        }
        return (centers || []).map(function (n) {
            var ks = [n].concat((aka && aka[n]) || []).map(stampKey).filter(Boolean);
            if (!ks.length) return null;
            var has = function (t) { return ks.some(function (k) { return t.indexOf(k) >= 0; }); };
            var best = null, bestD = Infinity, last = null;
            (marks || []).forEach(function (m) {
                var c = byId[m.course_id];
                if (!c || !has(key(m.name))) return;
                var d = +m.dist_m || 0, len = +c.distance_m || 0;
                if (len && d > len - 500) { last = last || c; return; }   // 도착 - 다음 구간에서 출발하면 그쪽
                if (d < bestD) { bestD = d; best = c; }
            });
            if (best || last) return best || last;
            var hit = null;
            (courses || []).some(function (c) { var e = ends(c); return e && has(e[0]) && (hit = c); });
            if (!hit) (courses || []).some(function (c) { var e = ends(c); return e && has(e[1]) && (hit = c); });
            return hit;
        });
    }

    /**
     * 순수 함수 - 묶음 하나의 진행: 자전거길은 인증센터 도장 수/센터 수, 숲길은 끝까지 간 코스 수/코스 수.
     * series: series.json 의 한 줄, stamps: {stampKey: …}, done: {코스ID: …}, peakStamps: {peakKey: …}(100대 명산 정상).
     */
    function seriesProgress(series, stamps, done, peakStamps) {
        if (Array.isArray(series.peaks)) {   // 100대 명산 - 정상 도장(rf-peaks)
            return { got: series.peaks.filter(function (p) { return peakStamps && peakStamps[peakKey(p)]; }).length, of: series.peaks.length };
        }
        if (series.centers) {
            var got = series.centers.filter(function (n) { return stampOf(stamps, n, series.aka && series.aka[n]); }).length;
            return { got: got, of: series.centers.length };
        }
        // 이름으로 찾는 길(코리아둘레길 - 두루누비 코스 번호에 길 번호가 없음)은 받아 온 코스 ID 목록(ids)으로 셈
        if (series.ids) {
            return { got: series.ids.filter(function (id) { return done && done[id]; }).length, of: series.ids.length };
        }
        var n = 0;
        Object.keys(done || {}).forEach(function (id) { if (id.indexOf(series.prefix) === 0) n++; });
        return { got: n, of: series.courses || 0 };
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

    function trailCourses(courses, name) {
        var key = String(name || "").replace(/\s+/g, "");
        // 원래 이름으로 봄(nameText 는 "[해파랑길] 1코스 · …" 로 바꿔 앞이 길 이름이 아님)
        // "19-1코스(우회로)" 는 19 와 20 사이(예전에는 뒤의 1 만 읽어 1코스 앞에 왔음 - 2026-10-12 PC)
        function no(c) { var n = courseNo(c.name); if (!n) return 1e9; var p = n.split("-"); return +p[0] + (p[1] ? +p[1] / 100 : 0); }
        return (courses || []).filter(function (c) { return String(c.name || "").replace(/\s+/g, "").indexOf(key) === 0; })
            .sort(function (a, b) { return no(a) - no(b) || (a.name < b.name ? -1 : 1); });
    }

    /**
     * 순수 함수 - 코스를 걷는 차례로: 이름 끝 "가-나"(지리산둘레길 "주천-운봉")를 from 부터 끝 → 다음 코스 처음으로 잇습니다.
     * 갈림(오미 → 방광 · 난동)에서는 그다음이 이어지는 쪽을 먼저. 잇지 못한 코스는 원래 순서로 뒤에.
     * 2026-10-11 PC: 지리산둘레길 21개가 가나다 순(가탄-송정 …)이었음 - 이름에 구간 번호가 없어서.
     */
    function chainOrder(courses, from) {
        var ends = function (c) { var m = /([가-힣]+)-([가-힣]+)\s*$/.exec((c && c.name) || ""); return m ? [m[1], m[2]] : null; };
        var left = courses.slice(), out = [], at = from;
        while (at) {
            var cands = left.filter(function (c) { var e = ends(c); return e && e[0] === at; });
            if (!cands.length) break;
            var next = cands.filter(function (c) {
                var to = ends(c)[1];
                return left.some(function (o) { var e = ends(o); return o !== c && e && e[0] === to; });
            })[0] || cands[0];
            out.push(next);
            left.splice(left.indexOf(next), 1);
            at = ends(next)[1];
        }
        return out.concat(left);
    }

    /**
     * 순수 함수 - 구간 코스를 땅 위 차례로: 앞 구간 끝(end_lat/lon)과 가장 가까운(nearM 안) 시작을 다음으로 잇습니다.
     * 맨 앞은 다른 구간 끝이 nearM 안에 없는 시작. 한 바퀴(맨 앞이 없음) · 잇지 못한 구간은 원래 순서로 뒤에.
     * 2026-10-11 PC: 동해안(강원) 5구간(고포 → 오분동)은 실제로 1구간 앞인데 맨 뒤에 보였음 - 끊긴 묶음이라 번호가 뒤.
     */
    function geoOrder(courses, nearM) {
        nearM = nearM || 10000;
        var ok = function (c) { return c && c.start_lat != null && c.end_lat != null; };
        var gap = function (a, b) { return distM(a.end_lat, a.end_lon, b.start_lat, b.start_lon); };
        var left = courses.slice(), out = [];
        var head = left.filter(function (c) {
            return ok(c) && !left.some(function (o) { return o !== c && ok(o) && gap(o, c) <= nearM; });
        })[0];
        for (var cur = head; cur; ) {
            out.push(cur);
            left.splice(left.indexOf(cur), 1);
            var best = null, bestD = nearM;
            left.forEach(function (o) { if (ok(o) && gap(cur, o) <= bestD) { bestD = gap(cur, o); best = o; } });
            cur = best;
        }
        return out.concat(left);
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
     * 순수 함수 - 공단 공식 코스 이름(park-notes official, "knps-7013": "가야산1코스"). 배치가 이름을 들머리 → 목적지로 바꿔
     * "가야산1코스" 로는 찾을 수 없었음(2026-10-13 홍TV님). 키는 코스 ID 그대로나 앞부분. 없으면 "".
     */
    function officialName(notes, id) {
        var out = "";
        Object.keys(notes || {}).forEach(function (park) {
            var of = notes[park] && notes[park].official;
            Object.keys(of || {}).forEach(function (k) {
                if (String(id) === k || String(id).indexOf(k + "-") === 0) out = of[k];
            });
        });
        return out;
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

    /**
     * 순수 함수 - 인증센터 지도 점(2026-10-15 PC: 지도 88곳 · 카드 85곳 어긋남) - series.json 의 센터(공식 이름 · 다른 이름 aka)마다
     * api/group centers 에서 같은 이름(stampKey 같거나 서로 품음)의 자리를 찾음. 자리를 못 찾은 센터는 뺌. → [{name, lat, lon}]
     */
    function centerPoints(names, aka, apiCenters) {
        var api = (apiCenters || []).filter(function (c) { return isFinite(+c.lat) && isFinite(+c.lon); })
            .map(function (c) { return { k: stampKey(c.name), lat: +c.lat, lon: +c.lon }; });
        var out = [];
        (names || []).forEach(function (n) {
            var ks = [n].concat((aka && aka[n]) || []).map(stampKey).filter(Boolean), hit = null;
            ks.some(function (k) { hit = api.filter(function (a) { return a.k === k; })[0] || null; return hit; });
            if (!hit) ks.some(function (k) { hit = api.filter(function (a) { return a.k.indexOf(k) >= 0 || k.indexOf(a.k) >= 0; })[0] || null; return hit; });
            if (hit) out.push({ name: n, lat: hit.lat, lon: hit.lon });
        });
        return out;
    }

    /**
     * 순수 함수 - 점 지도(다녀온 산 - 2026-10-15 홍TV님): [{lat, lon, …}] → 같은 차례 [x, y](w × h 안, pad 여백). 경도는 cos(위도)로 줄여 모양을 맞춤.
     */
    function dotMap(points, w, h, pad) {
        if (!points.length) return [];
        var la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
        points.forEach(function (p) { la0 = Math.min(la0, p.lat); la1 = Math.max(la1, p.lat); lo0 = Math.min(lo0, p.lon); lo1 = Math.max(lo1, p.lon); });
        var k = Math.cos((la0 + la1) / 2 * Math.PI / 180), sx = (lo1 - lo0) * k || 1e-6, sy = (la1 - la0) || 1e-6;
        var s = Math.min((w - 2 * pad) / sx, (h - 2 * pad) / sy), ox = (w - sx * s) / 2, oy = (h - sy * s) / 2;
        return points.map(function (p) { return [ox + (p.lon - lo0) * k * s, oy + (la1 - p.lat) * s]; });
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
     * 순수 함수 - 100대 명산 배지(2026-10-15 홍TV님): 10 · 30 · 50 · 70곳과 완등(정상 자료가 있는 산 모두).
     * peaks - mountains100.json 의 peaks, peakStamps - rf-peaks {peakKey: {t}}. → [{n, label, t(그 수에 닿은 날, 아직이면 null)}]
     */
    function peakMilestones(peaks, peakStamps) {
        var ts = (peaks || []).map(function (p) { var s = peakStamps && peakStamps[peakKey(p)]; return s && s.t ? +s.t : null; })
            .filter(function (t) { return t != null; }).sort(function (a, b) { return a - b; });
        var all = (peaks || []).length, steps = [10, 30, 50, 70].filter(function (n) { return n < all; });
        return steps.map(function (n) { return { n: n, label: n + "곳", t: ts.length >= n ? ts[n - 1] : null }; })
            .concat(all ? [{ n: all, label: "완등", t: ts.length >= all ? ts[all - 1] : null }] : []);
    }

    /**
     * 국립공원 스탬프투어 인증지(2026-10-28 홍TV님, data/np-stamps.json - 국립공원공단 공식 목록). 순수 함수.
     * npStampKey - 다녀감 저장 키. npStampsOn - 코스 선에서 maxM 안의 인증지 [{s, off(m), at(점 번호)}], 코스 차례대로.
     * npStampsDue - 지금 자리에서 radiusM 안이고 아직 안 다녀간 인증지.
     */
    function npStampKey(s) { return String(s.park || "") + "|" + String(s.name || "").replace(/\s+/g, ""); }
    function npStampsOn(stamps, c, maxM) {
        var out = [];
        if (!c || !c.lat || !c.lat.length) return out;
        (stamps || []).forEach(function (s) {
            if (typeof s.lat !== "number" || typeof s.lon !== "number") return;
            var best = Infinity, at = -1;
            for (var i = 0; i < c.lat.length; i++) { var d = distM(s.lat, s.lon, c.lat[i], c.lon[i]); if (d < best) { best = d; at = i; } }
            if (best <= (maxM || 300)) out.push({ s: s, off: Math.round(best), at: at });
        });
        return out.sort(function (a, b) { return a.at - b.at; });
    }
    function npStampsDue(stamps, lat, lon, have, radiusM) {
        return (stamps || []).filter(function (s) { return typeof s.lat === "number" && typeof s.lon === "number" && !(have || {})[npStampKey(s)] && distM(s.lat, s.lon, lat, lon) <= radiusM; });
    }

    global.RF = {
        num: num,
        km: km,
        stampOf: stampOf,
        peakKey: peakKey,
        peakGapM: peakGapM,
        peakCourses: peakCourses,
        isHiddenCourse: isHiddenCourse,
        centerCourses: centerCourses,
        seriesProgress: seriesProgress,
        trailCourses: trailCourses,
        chainOrder: chainOrder,
        geoOrder: geoOrder,
        nameText: nameText,
        noteTrailName: noteTrailName,
        officialName: officialName,
        textButton: textButton,
        setLang: setLang,
        tr: tr,
        pageLang: pageLang,
        applyEn: applyEn,
        npStampKey: npStampKey,
        centerPoints: centerPoints,
        dotMap: dotMap,
        peakMilestones: peakMilestones,
        enName: enName
    };
})(window);
