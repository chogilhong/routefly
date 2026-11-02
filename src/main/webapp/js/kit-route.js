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

    function routePlaces(courses, lines, nearM) {
        var near = nearM == null ? 500 : nearM, out = [];
        function add(name, p, start) {
            name = placeName(name);
            // 어디나 있는 이름(삼각점 · 정상 · 안부 · 갈림길 …)은 지명이 아님 - 그 자리는 끝 점만
            if (!p || !name || /^(삼각점|정상|안부\s*\d*|갈림길|삼거리|사거리|헬기장|이정표)$/.test(name)) name = "";
            if (!p) return;
            var at = out.filter(function (o) { return distM(o.lat, o.lon, p[1], p[0]) < near; })[0];
            if (at) { if (start >= 0 && at.start < 0) at.start = start; if (!at.name) at.name = name; return; }
            out.push({ name: name, lon: p[0], lat: p[1], start: start });
        }
        var flips = routeFlips(courses, lines);
        (courses || []).forEach(function (c, i) {
            var line = lines && lines[c.course_id], e = routeEnds(c.name);
            if (!line || !line.length) return;
            // 선이 이름과 거꾸로면 이름을 바꿔 붙임(선 처음 = 걸어 나가는 곳)
            var first = flips[c.course_id] ? e.to : e.from, last = flips[c.course_id] ? e.from : e.to;
            if (first) add(first, line[0], i);
            if (last) add(last, line[line.length - 1], -1);
        });
        return out.filter(function (o, k) { o.last = k === out.length - 1; return o.name; });
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

    /*
     * 여러 구간 이어 걷기(2026-10-12 홍TV님: 지리산둘레길 위태-하동호에 덕산-위태 · 하동호-삼화실을 이어서).
     * 이은 코스 ID 는 "구간ID,구간ID~,…"(~ 는 그 구간을 거꾸로). 한 구간이면 예전처럼 그 ID 하나.
     */

    /** 순수 함수 - [{id, rev}] → 이은 코스 ID. */
    function joinId(sel) {
        return (sel || []).map(function (s) { return s.id + (s.rev ? "~" : ""); }).join(",");
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
     * 순수 함수 - 노선 안내도에서 구간을 누를 때 고른 구간(차례대로 [{id, rev}])을 바꿈. 한 번 누르면 고르고 다시 누르면 뺌.
     * 고른 것의 앞 끝 · 뒤 끝에 nearM 안으로 이어지는 구간이면 그쪽에 붙이고(방향은 이어지게), 이어지지 않으면 그 구간만 새로 고름.
     * 가운데 구간을 빼면 긴 쪽을 남김(건너뛴 구간 없이 늘 이어진 것만). lines: {코스ID: [[경도, 위도]…]}.
     */
    function chainPick(sel, id, lines, nearM) {
        var near = nearM == null ? 500 : nearM, l = lines && lines[id];
        sel = (sel || []).slice();
        var k = sel.map(function (s) { return s.id; }).indexOf(id);
        if (k >= 0) {
            if (k === 0) return sel.slice(1);
            if (k === sel.length - 1) return sel.slice(0, -1);
            return k >= sel.length - 1 - k ? sel.slice(0, k) : sel.slice(k + 1);
        }
        if (!l || l.length < 2) return sel;
        if (!sel.length) return [{ id: id, rev: false }];
        var endOf = function (s, last) { var q = lines[s.id]; return (!!s.rev !== last) ? q[q.length - 1] : q[0]; };
        var S = endOf(sel[0], false), E = endOf(sel[sel.length - 1], true), a = l[0], z = l[l.length - 1];
        var d = function (p, q) { return distM(p[1], p[0], q[1], q[0]); };
        if (d(a, E) < near) return sel.concat([{ id: id, rev: false }]);
        if (d(z, E) < near) return sel.concat([{ id: id, rev: true }]);
        if (d(z, S) < near) return [{ id: id, rev: false }].concat(sel);
        if (d(a, S) < near) return [{ id: id, rev: true }].concat(sel);
        return [{ id: id, rev: false }];   // 이어지지 않음 - 그 구간만 새로
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

    /** 순수 함수 - 고른 구간을 반대 방향으로(차례도 거꾸로, 구간마다 ~ 도 바꿈). */
    function reverseSel(sel) {
        return (sel || []).slice().reverse().map(function (s) { return { id: s.id, rev: !s.rev }; });
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
    /** 영어로 옮길 낱말(MountainEn.WORDS 와 같음) - 나머지는 로마자. */
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

    global.RF = {
        LINE_COLOR: LINE_COLOR,
        num: num,
        km: km,
        stampKey: stampKey,
        baseStyle: baseStyle,
        stampOf: stampOf,
        trailCourses: trailCourses,
        nameText: nameText,
        declutter: declutter,
        courseNo: courseNo,
        routeEnds: routeEnds,
        routeFlips: routeFlips,
        joinId: joinId,
        endsText: endsText,
        nameNodes: nameNodes,
        chainPick: chainPick,
        reverseSel: reverseSel,
        routePlaces: routePlaces,
        textButton: textButton,
        nameIn: function (s) { return LANG === "en" && s != null ? enName(s) : s; },
        setLang: setLang,
        tr: tr,
        pageLang: pageLang,
        applyEn: applyEn
    };
})(window);
