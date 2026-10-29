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

    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    /**
     * 순수 함수 - 서버에 묻는 자리(날씨 · 안전): 내 위치 대신 0.05도(약 5km) 고정 칸의 가운데 [lat, lon] - 그 칸 안 모든 사람이 같음.
     * 개인정보처리방침 "GPS 위치는 서버로 보내지 않음"(2026-10-18 점검: 별거 별거 "내 위치로" 가 GPS 그대로 보냈음).
     */
    function cellCenter(lat, lon) {
        var c = 0.05, k = 1e6, f = function (v) { return Math.round((Math.floor(v / c + 1e-9) * c + c / 2) * k) / k; };
        return [f(lat), f(lon)];
    }
    // ------------------------------------------------------------------ 🏠 오늘의 안부(2026-10-17 홍TV님 - 혼자 사는 분, 서버 없이 가볍게. 늦은 귀가 안심은 2026-10-18 뺌)

    /** 순수 함수 - 이 기기 시각의 날짜 "2026-10-17". */
    function dayKey(ms) {
        var d = new Date(ms);
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    /**
     * 🧰 별거 별거 - 단위 변환(tools.html - 2026-10-18 홍TV님). 칸마다 [영문 기호, 한국어 이름, 영어 이름, 기준 단위로 몇(곱)].
     * 길이 m · 무게 g · 넓이 ㎡ · 부피 mL · 속도 m/s · 주파수 Hz · 데이터 B(1KB = 1024B). 온도는 곱이 아니라 따로(unitConv).
     * 평 = 400/121 ㎡(1평 = 3.3058㎡), 자 = 10/33 m, 근 = 600g(고기 - 채소는 375g), 돈 = 3.75g, 컵 = 200mL(한국 요리 계량).
     */
    var UNITS = {
        length: { ko: "길이", en: "Length", u: [["mm", "밀리미터", "millimeter", 0.001], ["cm", "센티미터", "centimeter", 0.01], ["m", "미터", "meter", 1], ["km", "킬로미터", "kilometer", 1000],
            ["in", "인치", "inch", 0.0254], ["ft", "피트", "foot", 0.3048], ["yd", "야드", "yard", 0.9144], ["mi", "마일", "mile", 1609.344], ["자", "자(척)", "ja (Korean foot)", 10 / 33]] },
        weight: { ko: "무게", en: "Weight", u: [["mg", "밀리그램", "milligram", 0.001], ["g", "그램", "gram", 1], ["kg", "킬로그램", "kilogram", 1000], ["t", "톤", "tonne", 1e6],
            ["oz", "온스", "ounce", 28.349523125], ["lb", "파운드", "pound", 453.59237], ["근", "근(고기 600g)", "geun (600 g)", 600], ["돈", "돈(3.75g)", "don (3.75 g)", 3.75]] },
        area: { ko: "넓이", en: "Area", u: [["㎡", "제곱미터", "square meter", 1], ["평", "평", "pyeong", 400 / 121], ["a", "아르", "are", 100], ["ha", "헥타르", "hectare", 10000],
            ["㎢", "제곱킬로미터", "square kilometer", 1e6], ["ft²", "제곱피트", "square foot", 0.09290304], ["ac", "에이커", "acre", 4046.8564224]] },
        volume: { ko: "부피", en: "Volume", u: [["mL", "밀리리터", "milliliter", 1], ["L", "리터", "liter", 1000], ["㎥", "세제곱미터", "cubic meter", 1e6], ["컵", "컵(200mL)", "cup (200 mL)", 200],
            ["fl oz", "액량 온스(미국)", "fluid ounce (US)", 29.5735295625], ["gal", "갤런(미국)", "gallon (US)", 3785.411784]] },
        temp: { ko: "온도", en: "Temperature", u: [["°C", "섭씨", "Celsius"], ["°F", "화씨", "Fahrenheit"], ["K", "켈빈", "Kelvin"]] },
        speed: { ko: "속도", en: "Speed", u: [["m/s", "초속 미터", "meters per second", 1], ["km/h", "시속 킬로미터", "kilometers per hour", 1 / 3.6], ["mph", "시속 마일", "miles per hour", 0.44704],
            ["kn", "노트", "knot", 1852 / 3600]] },
        freq: { ko: "주파수", en: "Frequency", u: [["Hz", "헤르츠", "hertz", 1], ["kHz", "킬로헤르츠", "kilohertz", 1e3], ["MHz", "메가헤르츠", "megahertz", 1e6], ["GHz", "기가헤르츠", "gigahertz", 1e9]] },
        data: { ko: "데이터", en: "Data", u: [["B", "바이트", "byte", 1], ["KB", "킬로바이트", "kilobyte", 1024], ["MB", "메가바이트", "megabyte", 1048576], ["GB", "기가바이트", "gigabyte", 1073741824],
            ["TB", "테라바이트", "terabyte", 1099511627776]] }
    };
    /** 순수 함수 - 단위 변환. cat 은 UNITS 의 칸, from · to 는 기호. 모르는 단위 · 숫자가 아니면 null. */
    function unitConv(cat, v, from, to) {
        var c = UNITS[cat], x = Number(v);
        if (!c || v === "" || v == null || !isFinite(x)) return null;
        function find(sym) { for (var i = 0; i < c.u.length; i++) if (c.u[i][0] === sym) return c.u[i]; return null; }
        var a = find(from), b = find(to);
        if (!a || !b) return null;
        if (cat === "temp") {
            var k = from === "°C" ? x + 273.15 : from === "°F" ? (x - 32) * 5 / 9 + 273.15 : x;
            return to === "°C" ? k - 273.15 : to === "°F" ? (k - 273.15) * 9 / 5 + 32 : k;
        }
        return x * a[3] / b[3];
    }
    /** 순수 함수 - 변환 결과 글: 유효숫자 10자리까지, 정수 부분에 쉼표, 아주 크거나 작으면 1.2345e-7 꼴. */
    function unitFmt(x) {
        if (x == null || !isFinite(x)) return "";
        if (x === 0) return "0";
        var ax = Math.abs(x);
        if (ax >= 1e15 || ax < 1e-6) return x.toExponential(4).replace(/\.?0+e/, "e");
        var s = String(Number(x.toPrecision(10)));
        if (s.indexOf("e") >= 0) s = Number(s).toFixed(10).replace(/\.?0+$/, "");
        var p = s.split(".");
        return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (p[1] ? "." + p[1] : "");
    }

    // ── 🧰 별거 별거 계산(2026-10-18 홍TV님 - 서버 없이) ──
    /** 순수 함수 - 날짜 [년, 월, 일] 을 날 번호로(시간대 · 서머타임 영향 없게 UTC 로). 잘못된 날짜(2월 30일 등)는 null. */
    function dayNo(y, m, d) {
        y = +y; m = +m; d = +d;
        if (!y || !m || !d) return null;
        var t = Date.UTC(y, m - 1, d), dt = new Date(t);
        if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
        return Math.round(t / 86400000);
    }
    /** 순수 함수 - 날 번호 → [년, 월, 일]. */
    function dayYmd(n) { var dt = new Date(n * 86400000); return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]; }
    var DDI = [["쥐", "Rat"], ["소", "Ox"], ["호랑이", "Tiger"], ["토끼", "Rabbit"], ["용", "Dragon"], ["뱀", "Snake"], ["말", "Horse"], ["양", "Goat"], ["원숭이", "Monkey"], ["닭", "Rooster"], ["개", "Dog"], ["돼지", "Pig"]];
    /**
     * 순수 함수 - 나이(2023-06-28 부터 법 · 행정은 만 나이). birth · today 는 [년, 월, 일].
     * man 만 나이(생일이 지나야 한 살), year 연 나이(올해 - 태어난 해), ddi 띠(태어난 해 기준 - 음력 설 전 1 · 2월생은 앞 해 띠일 수 있음), nextDays 다음 생일까지 날 수.
     */
    function ageInfo(birth, today) {
        var b = dayNo(birth[0], birth[1], birth[2]), t = dayNo(today[0], today[1], today[2]);
        if (b == null || t == null || b > t) return null;
        var man = today[0] - birth[0] - (today[1] < birth[1] || (today[1] === birth[1] && today[2] < birth[2]) ? 1 : 0);
        function bd(y) { return dayNo(y, birth[1], birth[2]) != null ? dayNo(y, birth[1], birth[2]) : dayNo(y, 3, 1); }   // 2월 29일생은 평년에 3월 1일
        var nx = bd(today[0]);
        if (nx < t) nx = bd(today[0] + 1);
        var z = DDI[((birth[0] - 4) % 12 + 12) % 12];
        return { man: man, year: today[0] - birth[0], ddi: LANG === "en" ? z[1] : z[0], nextDays: nx - t };
    }
    /** 순수 함수 - D-day 글: 오늘 기준 target 이 남았으면 "D-12", 지났으면 "D+3", 오늘이면 "D-day". */
    function dDay(today, target) {
        var t = dayNo(today[0], today[1], today[2]), g = dayNo(target[0], target[1], target[2]);
        if (t == null || g == null) return "";
        return g === t ? "D-day" : g > t ? "D-" + (g - t) : "D+" + (t - g);
    }
    /** 순수 함수 - 날짜 더하기: [년, 월, 일] 에서 n 일 뒤(음수면 앞). firstIsOne 이면 첫날을 1일로 셈(100일 기념일 - 100일째는 99일 뒤). */
    function dateAdd(ymd, n, firstIsOne) {
        var s = dayNo(ymd[0], ymd[1], ymd[2]);
        if (s == null || !isFinite(+n)) return null;
        return dayYmd(s + Math.trunc(+n) - (firstIsOne && +n > 0 ? 1 : 0));
    }
    /** 순수 함수 - 두 날짜 사이 날 수(b - a). firstIsOne 이면 첫날을 1일로(사귄 지 며칠째). */
    function dateDiff(a, b, firstIsOne) {
        var x = dayNo(a[0], a[1], a[2]), y = dayNo(b[0], b[1], b[2]);
        if (x == null || y == null) return null;
        return y - x + (firstIsOne && y >= x ? 1 : 0);
    }
    /**
     * 순수 함수 - 퍼센트 계산. kind: "of" b 의 a%, "is" a 는 b 의 몇 %, "change" a → b 몇 % 올랐나(내렸나), "sale" 값 a 를 b% 깎으면.
     */
    function pctCalc(kind, a, b) {
        a = Number(a); b = Number(b);
        if (!isFinite(a) || !isFinite(b)) return null;
        if (kind === "of") return b * a / 100;
        if (kind === "is") return b === 0 ? null : a / b * 100;
        if (kind === "change") return a === 0 ? null : (b - a) / Math.abs(a) * 100;
        if (kind === "sale") return a * (100 - b) / 100;
        return null;
    }
    /**
     * 순수 함수 - 더치페이: total 을 n 명이 unit 원 단위로 올려 나눔. per 한 사람, rest 마지막 한 사람(총무)이 덜 내는 몫을 뺀 값.
     * 예) 50,000원 3명 100원 단위 → 16,700원씩 2명 + 16,600원 1명.
     */
    function dutchPay(total, n, unit) {
        total = Math.round(Number(total)); n = Math.floor(Number(n)); unit = Math.max(1, Math.round(Number(unit) || 1));
        if (!isFinite(total) || total <= 0 || !(n >= 1)) return null;
        var per = Math.ceil(total / n / unit) * unit, last = total - per * (n - 1);
        if (last <= 0) { per = Math.floor(total / n); last = total - per * (n - 1); }
        return { per: per, last: last, n: n };
    }
    /**
     * 순수 함수 - 글자 수: chars 공백 포함, noSpace 공백 · 줄바꿈 빼고, bytes 문자 기준(한글 · 그 밖 2바이트, 영문 · 숫자 1바이트 - 단문 90 · 장문 2,000바이트),
     * words 낱말, lines 줄. 이모지 같은 두 칸 글자도 한 글자로.
     */
    function textCount(t) {
        var a = Array.from(String(t || "")), bytes = 0, ns = 0;
        a.forEach(function (c) { bytes += c.charCodeAt(0) <= 0x7f ? 1 : 2; if (!/\s/.test(c)) ns++; });
        var w = String(t || "").trim();
        return { chars: a.length, noSpace: ns, bytes: bytes, words: w ? w.split(/\s+/).length : 0, lines: a.length ? String(t).split("\n").length : 0 };
    }
    /** 순수 함수 - 문자 종류: 90바이트까지 단문(SMS), 2,000바이트까지 장문(LMS), 넘으면 null. */
    function smsKind(bytes) { return bytes <= 90 ? "SMS" : bytes <= 2000 ? "LMS" : null; }
    /**
     * 순수 함수 - 나침반 방향(0 = 북, 시계 방향 도). iOS 는 webkitCompassHeading(이미 북 기준), 안드로이드는 절대 방향 alpha(반시계)라 360 - alpha.
     * 화면을 가로로 돌렸으면 screenAngle 만큼 더함. 모르면 null.
     */
    function compassHeading(alpha, absolute, webkitHeading, screenAngle) {
        var h;
        if (webkitHeading != null && isFinite(webkitHeading)) h = +webkitHeading;
        else if (absolute && alpha != null && isFinite(alpha)) h = 360 - alpha;
        else return null;
        return Math.round((((h + (+screenAngle || 0)) % 360) + 360) % 360);
    }
    /** SOS 깜박임 · 호루라기 박자(ms): 짧게 셋 · 길게 셋 · 짧게 셋, 그다음 쉼. [켜짐, 꺼짐] 쌍. */
    var SOS_PATTERN = [[200, 200], [200, 200], [200, 600], [600, 200], [600, 200], [600, 600], [200, 200], [200, 200], [200, 1400]];
    /** 순수 함수 - 환율 바꾸기: rates 는 base 1 에 대한 각 통화 값({KRW: 1380, JPY: 150 ...}, base 자신은 없어도 됨). */
    function fxConv(v, from, to, base, rates) {
        v = Number(v);
        if (!isFinite(v) || !rates) return null;
        function r(c) { return c === base ? 1 : rates[c]; }
        var a = r(from), b = r(to);
        if (!a || !b) return null;
        return v / a * b;
    }

    // ── 🧰 별거 별거 2차(2026-10-18 홍TV님 "전부 해줘") ──
    /**
     * 음력(한국 - Intl 의 dangi 달력, 없으면 chinese). 양력 [년, 월, 일] → {y, m, d, leap}. 브라우저가 음력을 모르면 null.
     * dangi 는 서울 기준이라 중국 음력(chinese)과 가끔 하루 다름(1950 ~ 2050 사이 1,377일).
     */
    var LUNAR_FMT;
    function lunarFmt() {
        if (LUNAR_FMT !== undefined) return LUNAR_FMT;
        LUNAR_FMT = null;
        ["dangi", "chinese"].some(function (c) {
            try {
                var f = new Intl.DateTimeFormat("en-u-ca-" + c, { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });
                if (f.resolvedOptions().calendar !== c) return false;
                LUNAR_FMT = { f: f, cal: c };
                return true;
            } catch (e) { return false; }
        });
        return LUNAR_FMT;
    }
    function toLunar(ymd) {
        var n = dayNo(ymd[0], ymd[1], ymd[2]), L = lunarFmt();
        if (n == null || !L) return null;
        var o = {};
        L.f.formatToParts(new Date(n * 86400000)).forEach(function (p) { o[p.type] = p.value; });
        var m = /^(\d+)(bis)?$/.exec(o.month || "");
        if (!m || !o.day || !(o.relatedYear || o.year)) return null;
        return { y: +(o.relatedYear || o.year), m: +m[1], d: +o.day, leap: !!m[2], cal: L.cal };
    }
    /** 순수 함수(브라우저 달력 씀) - 음력 → 양력 [년, 월, 일]. 그 해에 없는 날(윤달이 없는 해의 윤달, 30일이 없는 달)은 null. */
    function fromLunar(y, m, d, leap) {
        var s = dayNo(y, 1, 1);
        if (s == null || !lunarFmt()) return null;
        for (var n = s; n < s + 420; n++) {   // 음력 y년 m월은 양력 y년 1월 ~ y+1년 2월 사이
            var l = toLunar(dayYmd(n));
            if (l && l.y === +y && l.m === +m && l.d === +d && l.leap === !!leap) return dayYmd(n);
        }
        return null;
    }
    /**
     * 순수 함수(브라우저 달력 씀) - 음력 생일 m월 d일이 오늘(today [년, 월, 일]) 뒤로 처음 오는 양력 날짜. 그 해에 30일이 없으면 29일로(흔히 그렇게 쇰).
     * 윤달 생일은 보통 평달에 쇠므로 평달로 셈. 못 찾으면 null. 2026-10-18 홍TV님(만 나이 · 띠 - 음력 생일).
     */
    /** 순수 함수(브라우저 달력 씀) - 음력 y년의 윤달(몇 월), 없으면 0, 음력 달력이 없으면 null. 2026-10-18 홍TV님("윤달은?") */
    function leapMonth(y) {
        if (!lunarFmt()) return null;
        var s = dayNo(y, 1, 15);
        for (var n = s; n < s + 400; n += 10) {   // 한 달은 29일 넘으니 10일마다 보면 윤달을 놓치지 않음
            var l = toLunar(dayYmd(n));
            if (l && l.y === +y && l.leap) return l.m;
            if (l && l.y > +y) break;
        }
        return 0;
    }
    function nextLunarBirthday(m, d, today) {
        var lt = toLunar(today);
        if (!lt) return null;
        var t = dayNo(today[0], today[1], today[2]);
        for (var y = lt.y - 1; y <= lt.y + 1; y++) {
            var s = fromLunar(y, m, d, false) || (d === 30 ? fromLunar(y, m, 29, false) : null);
            if (s && dayNo(s[0], s[1], s[2]) >= t) return s;
        }
        return null;
    }
    /**
     * 순수 함수 - 달 모양(ms 때). 기준 삭 2000-01-06 18:14 UTC, 삭망월 29.530588853일로 어림(하루 안팎 차이).
     * age 월령(일), illum 밝은 부분(0 ~ 1), i 모양 번호(0 삭 · 1 초승 · 2 상현 · 3 차오름 · 4 보름 · 5 기욺 · 6 하현 · 7 그믐), nextFull · nextNew 다음 보름 · 삭(ms).
     */
    var SYNODIC = 29.530588853;
    function moonPhase(ms) {
        var days = (ms - Date.UTC(2000, 0, 6, 18, 14)) / 86400000, age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
        var illum = (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2;
        var i = Math.floor((age / SYNODIC * 8) + 0.5) % 8;
        var full = SYNODIC / 2, toFull = age <= full ? full - age : SYNODIC - age + full;
        return { age: age, illum: illum, i: i, nextFull: ms + toFull * 86400000, nextNew: ms + (SYNODIC - age) * 86400000 };
    }
    var MOON_NAMES = [["🌑", "삭(달이 안 보임)", "New moon"], ["🌒", "초승달", "Waxing crescent"], ["🌓", "상현달", "First quarter"], ["🌔", "보름 앞 달", "Waxing gibbous"],
        ["🌕", "보름달", "Full moon"], ["🌖", "보름 지난 달", "Waning gibbous"], ["🌗", "하현달", "Last quarter"], ["🌘", "그믐달", "Waning crescent"]];
    /**
     * 순수 함수 - 이자. kind: "deposit" 예금(a 원금, months 개월, compound 면 월복리), "saving" 적금(a 매달 넣는 돈, 단리),
     * "loanEq" 대출 원리금균등 · "loanPr" 원금균등 · "loanBullet" 만기일시(a 빌린 돈). rate 연 %. 세금은 이자소득세 15.4%(일반과세).
     * → 예금 · 적금 {paid 넣은 돈, interest 세전 이자, tax, net 세후 받는 돈}, 대출 {first 첫 달 갚을 돈, last 마지막 달, interest 총이자, total 총 갚을 돈}.
     */
    var INTEREST_TAX = 0.154;
    function interestCalc(kind, a, rate, months, compound) {
        a = Number(a); rate = Number(rate) / 100; months = Math.round(Number(months));
        if (!(a > 0) || !(rate >= 0) || !(months >= 1)) return null;
        var i = rate / 12, interest;
        if (kind === "deposit" || kind === "saving") {
            var paid = kind === "deposit" ? a : a * months;
            if (kind === "deposit") interest = compound ? a * (Math.pow(1 + i, months) - 1) : a * i * months;
            else interest = a * i * months * (months + 1) / 2;
            interest = Math.floor(interest);
            var tax = Math.floor(interest * INTEREST_TAX / 10) * 10;   // 원 단위 버림(10원 미만)
            return { paid: paid, interest: interest, tax: tax, net: paid + interest - tax };
        }
        if (kind === "loanEq") {
            var pay = i === 0 ? a / months : a * i / (1 - Math.pow(1 + i, -months));
            return { first: Math.round(pay), last: Math.round(pay), interest: Math.round(pay * months - a), total: Math.round(pay * months) };
        }
        if (kind === "loanPr") {
            interest = a * i * (months + 1) / 2;
            return { first: Math.round(a / months + a * i), last: Math.round(a / months * (1 + i)), interest: Math.round(interest), total: Math.round(a + interest) };
        }
        if (kind === "loanBullet") return { first: Math.round(a * i), last: Math.round(a * i + a), interest: Math.round(a * i * months), total: Math.round(a + a * i * months) };
        return null;
    }
    /** 순수 함수 - 부가세 10%. mode "supply" 면 a 가 공급가, "total" 이면 a 가 합계(부가세 포함). 원 단위(합계에서 나눌 때는 공급가 반올림). */
    function vatCalc(a, mode) {
        a = Math.round(Number(a));
        if (!isFinite(a) || a < 0) return null;
        if (mode === "total") { var sp = Math.round(a / 1.1); return { supply: sp, vat: a - sp, total: a }; }
        var v = Math.floor(a * 0.1);
        return { supply: a, vat: v, total: a + v };
    }
    /**
     * 순수 함수 - BMI(대한비만학회 2022 기준: 18.5 미만 저체중 · 23 미만 정상 · 25 미만 비만 전단계 · 30 미만 1단계 비만 · 35 미만 2단계 · 그 위 3단계).
     * → {bmi(소수 한 자리), k 단계 번호(0 ~ 5), lo · hi 정상 체중 범위(kg)}.
     */
    var BMI_WORDS = [["저체중", "Underweight"], ["정상", "Normal"], ["비만 전단계", "Pre-obese"], ["1단계 비만", "Obese class 1"], ["2단계 비만", "Obese class 2"], ["3단계 비만(고도 비만)", "Obese class 3"]];
    function bmiInfo(cm, kg) {
        cm = Number(cm); kg = Number(kg);
        if (!(cm >= 50 && cm <= 250) || !(kg >= 10 && kg <= 400)) return null;
        var m2 = cm * cm / 10000, b = kg / m2, r = Math.round(b * 10) / 10;
        var k = r < 18.5 ? 0 : r < 23 ? 1 : r < 25 ? 2 : r < 30 ? 3 : r < 35 ? 4 : 5;
        return { bmi: r, k: k, word: BMI_WORDS[k][LANG === "en" ? 1 : 0], lo: Math.round(18.5 * m2 * 10) / 10, hi: Math.round(22.9 * m2 * 10) / 10 };
    }
    /** 순수 함수 - 불쾌지수(기상청 식, 기온 ℃ · 습도 %) → {di, k(0 낮음 · 1 보통 · 2 높음 · 3 매우 높음)}. */
    function discomfort(t, rh) {
        t = Number(t); rh = Number(rh);
        if (!isFinite(t) || !(rh >= 0 && rh <= 100)) return null;
        var di = Math.round((0.81 * t + 0.01 * rh * (0.99 * t - 14.3) + 46.3) * 10) / 10;
        return { di: di, k: di >= 80 ? 3 : di >= 75 ? 2 : di >= 68 ? 1 : 0 };
    }
    /**
     * 순수 함수 - 여권 영문 이름. 성은 흔히 쓰는 표기(김 KIM · 이 LEE · 박 PARK …)와 표준 로마자를 함께, 이름은 글자마다 따로 로마자(여권은 소리 바뀜을 적지 않음 - 한복남 BOKNAM).
     * 두 글자 성(남궁 · 황보 · 제갈 · 선우 · 독고 · 사공 · 서문)은 네 글자 이름이거나 twoSur 일 때. → {sur, surStd, given, alt}. 한글 아닌 글자가 있으면 null.
     */
    var SUR_COMMON = { "김": "KIM", "이": "LEE", "박": "PARK", "최": "CHOI", "정": "JUNG", "강": "KANG", "조": "CHO", "윤": "YOON", "장": "JANG", "임": "LIM", "한": "HAN", "오": "OH",
        "서": "SEO", "신": "SHIN", "권": "KWON", "황": "HWANG", "안": "AHN", "송": "SONG", "류": "RYU", "유": "YOO", "전": "JEON", "홍": "HONG", "고": "KO", "문": "MOON", "양": "YANG",
        "손": "SON", "배": "BAE", "백": "BAEK", "허": "HEO", "남": "NAM", "심": "SHIM", "노": "NOH", "하": "HA", "곽": "KWAK", "성": "SUNG", "차": "CHA", "주": "JOO", "우": "WOO",
        "구": "KOO", "민": "MIN", "진": "JIN", "나": "NA", "지": "JI", "엄": "UM", "변": "BYUN", "채": "CHAE", "원": "WON", "천": "CHUN", "방": "BANG", "공": "KONG", "현": "HYUN",
        "함": "HAM", "여": "YEO", "추": "CHOO", "도": "DO", "석": "SEOK", "선": "SUN", "설": "SEOL", "길": "KIL", "연": "YEON", "표": "PYO", "명": "MYUNG", "기": "KI", "반": "BAN",
        "왕": "WANG", "금": "KEUM", "옥": "OK", "육": "YOOK", "인": "IN", "맹": "MAENG", "탁": "TAK", "국": "KOOK", "은": "EUN", "편": "PYUN", "용": "YONG", "경": "KYUNG",
        "남궁": "NAMGOONG", "황보": "HWANGBO", "제갈": "JEGAL", "선우": "SUNWOO", "독고": "DOKGO", "사공": "SAGONG", "서문": "SEOMUN" };
    var SUR_TWO = ["남궁", "황보", "제갈", "선우", "독고", "사공", "서문"];
    function nameRoman(name, twoSur) {
        var n = String(name || "").replace(/\s+/g, "");
        if (!n || !/^[가-힣]+$/.test(n) || n.length < 2) return null;
        var two = SUR_TWO.indexOf(n.slice(0, 2)) >= 0 && (n.length >= 4 || twoSur), sur = n.slice(0, two ? 2 : 1), giv = n.slice(sur.length);
        function syl(t) { return Array.from(t).map(function (c) { return roman(c).toUpperCase(); }).join(""); }
        var std = syl(sur), g = syl(giv);
        return { sur: SUR_COMMON[sur] || std, surStd: std, given: g, alt: g.length > 0 && giv.length > 1 ? syl(giv.charAt(0)) + "-" + syl(giv.slice(1)) : g };
    }
    /** 순수 함수 - 그 시간대가 UTC 보다 몇 분 빠른가(서머타임 포함, Intl). 모르는 시간대면 null. */
    function tzOffsetMin(tz, ms) {
        try {
            var o = {};
            new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
                .formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
            return Math.round((Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute) - Math.floor(ms / 60000) * 60000) / 60000);
        } catch (e) { return null; }
    }
    /**
     * 순수 함수 - 사다리: n 줄, rows 칸. rnd() 는 0 ~ 1(테스트는 고정 값). 가로줄은 옆 가로줄과 붙지 않게. → rungs[row][col](col 과 col+1 사이 가로줄이면 true).
     */
    function ladderMake(n, rows, rnd) {
        var r = [];
        for (var y = 0; y < rows; y++) {
            var line = [];
            for (var x = 0; x < n - 1; x++) line.push(!(x > 0 && line[x - 1]) && rnd() < 0.45);
            r.push(line);
        }
        for (var c = 0; c < n - 1; c++) {   // 이웃 두 줄 사이에 가로줄이 하나도 없으면 하나 넣음(섞이게)
            if (!r.some(function (l) { return l[c]; })) {
                for (var t = 0; t < rows; t++) if (!(c > 0 && r[t][c - 1]) && !(c < n - 2 && r[t][c + 1])) { r[t][c] = true; break; }
            }
        }
        return r;
    }
    /** 순수 함수 - 사다리 타기: start 줄에서 내려가 닿는 줄과 지나간 [줄, 칸] 길. */
    function ladderTrace(rungs, start) {
        var x = start, path = [[x, 0]];
        rungs.forEach(function (l, y) {
            if (l[x]) { path.push([x, y + 0.5]); x++; path.push([x, y + 0.5]); }
            else if (x > 0 && l[x - 1]) { path.push([x, y + 0.5]); x--; path.push([x, y + 0.5]); }
        });
        path.push([x, rungs.length]);
        return { end: x, path: path };
    }

    /**
     * 순수 함수 - 연휴: 공휴일 날짜("2026-10-03")와 토 · 일을 이어 3일 이상 쉬는 덩어리(공휴일이 하나라도 낀 것만). → [{from, to, days}] 날짜 차례.
     */
    function holidayRuns(dates) {
        var hol = {}, ns = [];
        (dates || []).forEach(function (d) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d); if (m) { var n = dayNo(+m[1], +m[2], +m[3]); if (n != null) { hol[n] = true; ns.push(n); } } });
        if (!ns.length) return [];
        ns.sort(function (a, b) { return a - b; });
        function off(n) { var w = new Date(n * 86400000).getUTCDay(); return hol[n] || w === 0 || w === 6; }
        function key(n) { var y = dayYmd(n); return y[0] + "-" + String(y[1]).padStart(2, "0") + "-" + String(y[2]).padStart(2, "0"); }
        var out = [], seen = {};
        ns.forEach(function (n) {
            if (seen[n]) return;
            var a = n, b = n;
            while (off(a - 1)) a--;
            while (off(b + 1)) b++;
            for (var i = a; i <= b; i++) seen[i] = true;
            if (b - a + 1 >= 3) out.push({ from: key(a), to: key(b), days: b - a + 1 });
        });
        return out;
    }

    /**
     * 순수 함수 - 🧮 큰 글씨 계산기(2026-10-18 홍TV님). "12+3×4" · "50%" · "-3÷2" 처럼 + − × ÷ % 와 소수점. 곱셈 · 나눗셈 먼저.
     * eval 을 쓰지 않음(CSP). 0 으로 나누기 · 잘못된 식은 null. 끝이 연산 기호면 그것만 빼고 계산.
     */
    function calcEval(expr) {
        var s = String(expr || "").replace(/\s+/g, "").replace(/[x*]/g, "×").replace(/\//g, "÷").replace(/-/g, "−");
        s = s.replace(/[+−×÷]+$/, "");
        if (!s) return null;
        var toks = [], i = 0;
        while (i < s.length) {
            var c = s.charAt(i);
            if (/[0-9.]/.test(c) || (c === "−" && (i === 0 || /[+−×÷]/.test(s.charAt(i - 1))))) {
                var j = i + 1;
                while (j < s.length && /[0-9.]/.test(s.charAt(j))) j++;
                var t = s.slice(i, j).replace("−", "-");
                if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
                var n = parseFloat(t);
                while (s.charAt(j) === "%") { n /= 100; j++; }
                toks.push(n); i = j;
            } else if (/[+−×÷]/.test(c)) { toks.push(c); i++; }
            else return null;
        }
        if (typeof toks[0] !== "number") return null;
        var terms = [toks[0]], ops = [];
        for (var k = 1; k < toks.length; k += 2) {
            var op = toks[k], v = toks[k + 1];
            if (typeof op !== "string" || typeof v !== "number") return null;
            if (op === "×") terms[terms.length - 1] *= v;
            else if (op === "÷") { if (v === 0) return null; terms[terms.length - 1] /= v; }
            else { ops.push(op); terms.push(v); }
        }
        var r = terms[0];
        for (var m = 0; m < ops.length; m++) r = ops[m] === "+" ? r + terms[m + 1] : r - terms[m + 1];
        return isFinite(r) ? Number(r.toPrecision(12)) : null;
    }

    /** 순수 함수 - 방위(도) → 8 방위 말(255 → 서남서가 아니라 "서"). 모르면 "". */
    function azWord(az) {
        if (az == null || isNaN(+az)) return "";
        if (LANG === "en") return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round(((+az % 360) + 360) % 360 / 45) % 8];
        return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round(((+az % 360) + 360) % 360 / 45) % 8];
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

    /** 순수 함수 - 기상청 하늘(sky 1 · 3 · 4) · 강수 형태(pty 0 ~ 4) → "☀️ 맑음" 같은 말. */
    function weatherWord(sky, pty) {
        var p = { 1: "🌧 비", 2: "🌨 비/눈", 3: "❄️ 눈", 4: "🌦 소나기" }[+pty];
        if (p) return p;
        return { 1: "☀️ 맑음", 3: "⛅ 구름많음", 4: "☁️ 흐림" }[+sky] || "-";
    }

    /**
     * 순수 함수 - 체감온도(℃, 기상청 겨울철 식: 기온 10℃ 이하 · 바람 1.3m/s 이상일 때만, 아니면 null). 정상 기온 + 들머리 바람으로 어림.
     * 2026-10-16 홍TV님(추가 기능 6번 강풍) - 산 위는 바람에 체감이 크게 떨어짐.
     */
    function windChill(tmp, wsd) {
        if (tmp == null || wsd == null || tmp > 10 || wsd < 1.3) return null;
        var v = Math.pow(wsd * 3.6, 0.16);
        return Math.round(13.12 + 0.6215 * tmp - 11.37 * v + 0.3965 * tmp * v);
    }

    /**
     * 순수 함수 - 챙길 것(2026-10-15 홍TV님). month 1~12, ascentM 오르막(m), kind hike · walk · bike.
     * key 는 PartnersServlet.GEAR 와 같음(쿠팡 파트너스 링크를 설정에 넣으면 그 물건 옆에 링크).
     */
    function gearList(month, ascentM, kind) {
        var winter = month >= 11 || month <= 3, cold = month >= 10 || month <= 4, sunny = month >= 4 && month <= 9, hike = kind === "hike", out = [];
        out.push({ key: "water", label: "물 · 간식", why: "1시간에 물 500ml 남짓" });
        out.push({ key: "rain", label: "우비 · 바람막이", why: "산 위는 날씨가 빨리 바뀝니다" });
        if (kind !== "bike") out.push({ key: "headlamp", label: "헤드랜턴", why: "늦어지면 산은 해 지기 전에 어두워집니다" });
        out.push({ key: "battery", label: "보조배터리", why: "GPS · 119 신고용" });
        // 2026-10-15 홍TV님: 등산화 · 가방 · 구급약(늘), 모자 · 선크림(4~9월), 보온병 · 핫팩(11~3월), 무릎 보호대(오르막이 클 때)
        out.push({ key: "firstaid", label: "구급약 · 밴드", why: "물집 · 까진 곳 · 벌레 물림" });
        if (kind !== "bike") out.push({ key: "shoes", label: hike ? "등산화" : "걷기 편한 신발", why: hike ? "미끄럼을 막고 발목을 받쳐 줌" : "오래 걸어도 발이 편하게" });
        out.push({ key: "pack", label: hike ? "등산 가방" : "가벼운 배낭", why: "두 손을 비워 두면 넘어질 때 안전합니다" });
        if (hike && ascentM >= 500) out.push({ key: "stick", label: "등산 스틱", why: "오르막 " + num(ascentM) + "m - 무릎 부담을 덜어 줌" });
        if (hike && ascentM >= 800) out.push({ key: "knee", label: "무릎 보호대", why: "긴 내리막에서 무릎을 받쳐 줌" });
        if (sunny) out.push({ key: "sun", label: "모자 · 선크림", why: "능선 · 정상은 햇볕을 가릴 곳이 없습니다" });
        if (winter) out.push({ key: "warm", label: "보온병 · 핫팩", why: "쉴 때 몸이 빨리 식습니다" });
        if (hike && winter) out.push({ key: "crampon", label: "아이젠", why: "겨울 · 이른 봄 응달은 얼어 있습니다" });
        if (cold) out.push({ key: "glove", label: "장갑", why: "아침 · 정상은 쌀쌀합니다" });
        return out;
    }

    // ── ⛑️ 오늘의 산행 안전(api/safety - SafetyServlet) - 별거 별거 · 산 페이지 · 따라가기가 함께 씀(2026-10-18 홍TV님) ──
    var UV_WORD = [[2, "낮음", "Low"], [5, "보통", "Moderate"], [7, "높음", "High"], [10, "매우 높음", "Very high"], [99, "위험", "Extreme"]];
    var WARN_EN = { "강풍": "Strong wind", "호우": "Heavy rain", "한파": "Cold wave", "건조": "Dry air", "폭풍해일": "Storm surge", "풍랑": "High seas", "태풍": "Typhoon", "대설": "Heavy snow", "황사": "Yellow dust", "폭염": "Heat wave" };
    var FIRE_WORD = [["낮음", "Low"], ["다소 높음", "Moderate"], ["높음", "High"], ["매우 높음", "Very high"]];
    /** 순수 함수 - 특보 이름(영어 화면은 "강풍주의보" → "Strong wind advisory", 모르는 것은 그대로). */
    function warnName(t, en) {
        if (!en) return t;
        var m = /^(.+?)(주의보|경보)$/.exec(t || "");
        return m && WARN_EN[m[1]] ? WARN_EN[m[1]] + (m[2] === "경보" ? " warning" : " advisory") : t;
    }
    function uvWord(v, en) { for (var i = 0; i < UV_WORD.length; i++) if (v <= UV_WORD[i][0]) return en ? UV_WORD[i][2] : UV_WORD[i][1]; return ""; }
    /**
     * 순수 함수 - api/safety 응답 → 줄 [{icon, label, val, cls("bad" · "mid" · "")}]: 특보(내 시도 것은 빨강, 전국은 한 줄) · 산불위험 · 자외선.
     * 자외선은 발표 시각(date "yyyyMMddHH" KST) + h 시간. 저녁(오늘 남은 자외선이 없음)이면 내일 가장 높을 때(2026-10-18 PC).
     */
    function safetyRows(j, now, en) {
        var out = [], t = function (ko, e) { return en ? e : ko; };
        if (!j || j.unavailable) return out;
        if (j.warn && j.warn.lines) {
            var mine = j.warn.lines.filter(function (l) { return l.mine; }), all = j.warn.lines.map(function (l) { return warnName(l.type, en); });
            if (mine.length) mine.forEach(function (l) { out.push({ icon: "⚠", label: warnName(l.type, en), val: t("내 지역 발효 중", "in effect here"), cls: "bad", alert: true }); });
            else out.push({ icon: "✅", label: t("기상특보", "Weather warnings"), val: t("내 지역 없음", "None here"), cls: "" });
            if (all.length) out.push({ icon: "🗺", label: t("전국 특보", "Nationwide"), val: all.join(" · "), cls: "" });
        }
        if (j.fire) {
            var lv = Math.max(0, Math.min(3, j.fire.level || 0));
            out.push({ icon: "🔥", label: t("산불위험", "Wildfire risk"), val: FIRE_WORD[lv][en ? 1 : 0] + (j.fire.meanavg != null ? " (" + Math.round(j.fire.meanavg) + ")" : ""),
                cls: lv >= 2 ? "bad" : lv === 1 ? "mid" : "", alert: lv >= 2 });
        }
        if (j.uv && j.uv.hours && j.uv.hours.length && /^\d{10}$/.test(j.uv.date || "")) {
            var d = j.uv.date, base = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(8, 10)) - 9 * 3600000, cur = null, max = null;
            var todayKST = new Date(now + 9 * 3600000).toISOString().slice(0, 10), tomKST = new Date(now + 33 * 3600000).toISOString().slice(0, 10), tmax = null, restToday = false;
            j.uv.hours.forEach(function (p) {
                var at = base + p.h * 3600000, day = new Date(at + 9 * 3600000).toISOString().slice(0, 10);
                if (at <= now) cur = p.v;
                if (day === todayKST) { max = Math.max(max == null ? 0 : max, p.v); if (at > now && p.v > 0) restToday = true; }
                if (day === tomKST) tmax = Math.max(tmax == null ? 0 : tmax, p.v);
            });
            var tomorrow = !restToday && (cur == null || cur === 0) && tmax != null && new Date(now + 9 * 3600000).getUTCHours() >= 15;
            if (tomorrow) out.push({ icon: "☀", label: t("자외선(내일 가장 높을 때)", "UV (tomorrow's peak)"), val: tmax + " " + uvWord(tmax, en), cls: tmax >= 8 ? "bad" : tmax >= 6 ? "mid" : "" });
            else if (max != null) out.push({ icon: "☀", label: t("자외선(오늘 가장 높을 때)", "UV (today's peak)"), val: max + " " + uvWord(max, en) + (cur != null ? t(" · 지금 ", " · now ") + cur : ""),
                cls: max >= 8 ? "bad" : max >= 6 ? "mid" : "", alert: max >= 8 && restToday });
        }
        return out;
    }
    /**
     * api/safety 응답을 목록으로(ul - 줄, er - 가까운 응급실 ul, 없으면 null). erMax - 응급실 몇 곳(없으면 모두). 받은 줄 수를 돌려줌.
     * 응급실 이름은 카카오맵 검색, 전화는 tel: 링크.
     */
    function safetyRender(ul, er, j, en, erMax) {
        ul.innerHTML = "";
        var rows = safetyRows(j, Date.now(), en);
        rows.forEach(function (r) {
            var li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("b");
            sp.textContent = r.icon + " " + r.label; b.textContent = r.val;
            if (r.cls) li.className = r.cls;
            li.appendChild(sp); li.appendChild(b);
            ul.appendChild(li);
        });
        if (!rows.length) {
            var li0 = document.createElement("li"), s0 = document.createElement("span"), b0 = document.createElement("b");
            s0.textContent = "ℹ " + (en ? "Safety info" : "안전 정보"); b0.textContent = en ? "Not available" : "받지 못했습니다";
            li0.appendChild(s0); li0.appendChild(b0); ul.appendChild(li0);
        }
        if (er) {
            er.innerHTML = "";
            ((j && j.er) || []).slice(0, erMax || 99).forEach(function (h) {
                var li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("b"), a = document.createElement("a");
                a.href = "https://map.kakao.com/link/search/" + encodeURIComponent(h.addr || h.name); a.target = "_blank"; a.rel = "noopener";
                a.textContent = h.name; a.style.color = "var(--sky)";
                sp.appendChild(a);
                var sm = document.createElement("small"); sm.style.display = "block"; sm.textContent = (h.km != null ? h.km + "km · " : "") + (h.kind || "");
                sp.appendChild(sm);
                if (h.tel) { var t = document.createElement("a"); t.href = "tel:" + h.tel.replace(/[^0-9]/g, ""); t.textContent = "📞 " + h.tel; t.style.color = "var(--tx)"; b.appendChild(t); }
                li.appendChild(sp); li.appendChild(b);
                er.appendChild(li);
            });
        }
        return rows.length;
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
    /** 순수 함수 - api/air 응답 → "미세먼지 보통(42) · 초미세먼지 좋음(14) - 가야면 측정소 14시". 못 받았으면 "". 2026-10-15 */
    function airText(a) {
        if (!a || a.unavailable || (a.pm10 == null && a.pm25 == null)) return "";
        var parts = [];
        if (a.pm10 != null) parts.push("미세먼지 " + a.pm10Word + "(" + a.pm10 + ")");
        if (a.pm25 != null) parts.push("초미세먼지 " + a.pm25Word + "(" + a.pm25 + ")");
        var hh = /\d{4}-\d\d-\d\d (\d\d):/.exec(a.time || "");
        return parts.join(" · ") + " - " + a.station + " 측정소" + (hh ? " " + (+hh[1]) + "시" : "") + (a.dist_km != null ? "(" + a.dist_km + "km)" : "");
    }

    global.RF = {
        azWord: azWord,
        sunset: sunset,
        sunrise: sunrise,
        textButton: textButton,
        weatherWord: weatherWord,
        distM: distM,
        cellCenter: cellCenter,
        safetyRender: safetyRender,
        setLang: setLang,
        tr: tr,
        pageLang: pageLang,
        applyEn: applyEn,
        airText: airText,
        gearList: gearList,
        windChill: windChill,
        dayKey: dayKey,
        UNITS: UNITS,
        unitConv: unitConv,
        unitFmt: unitFmt,
        dayNo: dayNo,
        ageInfo: ageInfo,
        dDay: dDay,
        dateAdd: dateAdd,
        dateDiff: dateDiff,
        pctCalc: pctCalc,
        dutchPay: dutchPay,
        textCount: textCount,
        smsKind: smsKind,
        compassHeading: compassHeading,
        SOS_PATTERN: SOS_PATTERN,
        fxConv: fxConv,
        toLunar: toLunar,
        fromLunar: fromLunar,
        nextLunarBirthday: nextLunarBirthday,
        leapMonth: leapMonth,
        moonPhase: moonPhase,
        MOON_NAMES: MOON_NAMES,
        interestCalc: interestCalc,
        vatCalc: vatCalc,
        bmiInfo: bmiInfo,
        discomfort: discomfort,
        nameRoman: nameRoman,
        tzOffsetMin: tzOffsetMin,
        ladderMake: ladderMake,
        ladderTrace: ladderTrace,
        holidayRuns: holidayRuns,
        calcEval: calcEval
    };
})(window);
