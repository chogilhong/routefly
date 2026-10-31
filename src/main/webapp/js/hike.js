/*
 * routefly 산행 화면(hike.html) - 핸드폰으로 걸으면서 봅니다.
 *
 *   GPS 위치 → 코스 위 진행 거리(course-kit snap) → ① 고도 그래프 ② 산행 기록 ③ 경로 지도를 함께 움직입니다.
 *   코스에서 50m 넘게 벗어나면 빨간 알림, 끝점에 닿으면 도착 알림. 브라우저는 화면이 꺼지지 않게 Wake Lock 을 겁니다
 *   (앱은 화면을 꺼도 백그라운드 위치로 이어지므로 걸지 않습니다 - 배터리).
 *   새로 고침해도 산행 기록(시작 시각 · 진행 거리)은 이 기기에 남아 이어집니다(localStorage).
 *   "모의 산행" 은 GPS 없이 코스를 따라 걷는 흉내(1× 는 미리보기 1× 와 같은 시간, 위쪽 글자로 빠르기) - 집에서 화면을 시험할 때.
 */
(function () {
    "use strict";

    var OFF_ROUTE_M = 50;      // 이보다 멀면 "코스에서 벗어남"
    var ARRIVE_M = 30;         // 끝점까지 이 안이면 도착
    var FAR_M = 3000;          // 코스에서 이보다 멀면 "벗어남" 대신 출발점(마지막 자리)까지 안내(집 · 차 안에서 시작했을 때)
    // 시험 걷기 빠르기 - 미리보기와 같게: 1× 는 미리보기 1× 비행 시간(RF.flightMs, 20 ~ 90초)에 코스를 다 걷는 빠르기,
    // 위쪽 "시험 1×" 를 누르면 2× · 4× · 0.25× · 0.5× 차례(2026-10-10 홍TV님). 시계(경과 시간 · 예상 도착)는 실제 걷는 시간으로 갑니다.
    var SIM_SPEEDS = [1, 2, 4, 0.25, 0.5];
    var SIM_SPEED = 1;   // 고른 빠르기
    var SIM_X = 1;       // 걷는 거리에 곱하는 배수 = (평지로 걷는 시간 ÷ 미리보기 1× 시간) × 고른 빠르기
    var SIM_CLOCK = 1;   // 시계에 곱하는 배수 - 도착 때 경과 시간이 미리보기의 예상 시간(오르막 포함, RF.standardMs)과 같게
    var STILL_M = 40;          // 움직임 없음 - 이 안(+ GPS 오차)에서
    var STILL_MS = (+(location.search.match(/[?&]stillmin=(\d+)/) || [])[1] || +lsGet("rf-stillmin") || 20) * 60000;   //   이만큼 있으면 "괜찮으세요?"(?stillmin=1 · 앱은 localStorage rf-stillmin - 점검용)
    var DEBUG = lsGet("rf-debug") === "1";   // 점검용(2026-10-17): 화면이 꺼진 동안 스크립트가 도는지 - 1분마다 콘솔(안드로이드는 logcat Capacitor/Console)
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    var STILL_ANSWER_MS = 60000;   // 답이 없으면 이 뒤 SOS 화면
    var TURN_BACK_M = 150;     // 코스를 따라 이만큼 되돌아가면 거꾸로 된 코스(내려가는 길)로 안내를 바꿉니다
    var BRANCH_ON_M = 20;      // 다른 길에서 이 안이면 "그 길 위" (코스에서는 40m 넘게 떨어졌을 때)
    var BRANCH_SWITCH_M = 120; // 다른 길로 이만큼 더 가면 그 길로 코스를 바꿉니다(들어설 때 한 번 알린 뒤)

    var $ = function (id) { return document.getElementById(id); };
    var num = RF.num, km = RF.km;
    // 화면 말(2026-10-17 홍TV님 - 따라가기 영어): ?lang=en(영어 산 페이지에서 올 때) · 한/EN 단추로 바꾸면 이 기기에 기억(rf-lang)
    var LANG = RF.pageLang(location.search, lsGet("rf-lang"));
    if (/[?&]lang=(en|ko)\b/.test(location.search)) { try { localStorage.setItem("rf-lang", LANG); } catch (e) { /* 이번만 */ } }
    var EN = LANG === "en", T = RF.tr, NM = RF.nameIn;   // T("한국어", "English"), NM(한글 이름) → 영어면 로마자
    RF.setLang(LANG);
    if (EN) { document.documentElement.lang = "en"; document.title = "routefly - Follow a trail"; RF.applyEn(document); }

    var map, mapReady, cfg;
    var c = null;              // 지금 코스
    var prof = null;           // ① 고도 그래프
    var meMarker = null;
    var hike = { running: false, sim: false, start: 0, d: 0, off: 0, watch: null, timer: 0, simTimer: 0, simClock: 0,
                 simLast: 0, simD: 0, speed: null, hist: [], wake: null, follow: true, arrived: false, lastFix: 0,
                 fix: null,            // 마지막 위치 {lat, lon, acc, alt, t} - SOS 에 씁니다
                 track: [],            // 걸은 자리 [[위도, 경도, 시각, 고도]] - 기록 · GPX
                 notes: [],            // 사진 · 메모 [{t, lat, lon, ele, text, photo}] - 기록 · GPX(wpt). 사진은 IndexedDB(photo = 열쇠)
                 walked: 0,            // 걸은 거리(m)
                 alerted: {},          // 이미 알린 갈림길(진행 거리)
                 sunWarned: false,
                 sun60: false,         // 🌇 해 지기 1시간 전 알림(한 번 - 2026-10-18 홍TV님)
                 spotDone: {},         // 알린 위험지역 · 조망점(RF.spotKey → true)
                 passed: {},           // 음성으로 알린 지점(이름)
                 kmSpoken: 0,          // 음성으로 알린 거리 이정(1km · 자전거 5km 단위)
                 wasOff: false,        // 코스에서 벗어나 있음(음성 - 벗어날 때 · 돌아올 때 한 번씩)
                 d0: null,             // 처음 코스에 닿은 진행 거리(오른 높이 · 칼로리는 여기서부터, 아직 안 닿았으면 null)
                 base: null,           // 코스를 바꾸기 전까지 한 것 {dist, up, down} - 칼로리 · 걸음 · 오른 높이에 더합니다
                 branch: null,         // 코스가 아닌 다른 길 위 {id, name, d0, lastD, loading}
                 segT0: 0,             // 지금 코스로 걷기 시작한 시각(예상 도착 빠르기 비율)
                 bgWatch: null };      // 앱 - 백그라운드 위치 감시 번호
    var trails = [];                   // 주변 등산로(api/trails) - 코스에서 벗어났을 때 가장 가까운 길 찾기
    var compass = { on: false, up: false, heading: null, lastTurn: 0, raw: null, raf: 0, listening: false };   // 나침반 - on: 켜짐, up: 내 방향으로 지도 돌림, raw: 센서가 준 마지막 방위
    var kindFilter = "";

    function now() { return hike.sim ? hike.simClock : Date.now(); }

    /** 지금 코스 종류의 말 · 빠르기(등산 "산행" · 걷기 "걷기" · 자전거 "라이딩"). 코스를 고르기 전에는 고른 탭. */
    function K() { return RF.kindOf(c ? c.course.kind : kindFilter || "hike"); }

    /** 시작 버튼 · 기록 제목을 코스 종류에 맞춥니다. */
    function setKindWords() {
        var k = K();
        if (!hike.running) $("go").textContent = T(k.act + " 시작", "Start " + k.act.toLowerCase());
        $("doneTitle").textContent = T(k.act + " 기록", k.act + " record");
        $("sim").title = T("코스를 따라 " + (k === RF.KINDS.bike ? "달리는" : "걷는") + " 흉내(GPS 없이 시험)", "Simulate " + (k === RF.KINDS.bike ? "riding" : "walking") + " the trail (test without GPS)");
    }

    function toast(text, ms) {
        var t = $("toast");
        t.textContent = text;
        t.style.display = "block";
        clearTimeout(toast.timer);
        toast.timer = setTimeout(function () { t.style.display = "none"; }, ms || 3500);
    }

    // ------------------------------------------------------------------ 앱(안드로이드 · Capacitor) 안에서만

    /**
     * routefly 앱(app/ - Capacitor)이 이 화면을 띄우면 window.Capacitor 가 있습니다. 그때만 앱 기능을 씁니다:
     *   BackgroundGeolocation - 화면을 꺼도 위치(알림창에 "따라가는 중"), TextToSpeech - 화면이 꺼져도 음성,
     *   Filesystem + Share - SOS 사진 · GPX 를 공유 창으로(앱 안 웹뷰는 navigator.share · 내려받기가 안 됨).
     * 브라우저에서는 모두 null 이라 지금까지처럼 웹 기능을 씁니다.
     */
    var CAP = window.Capacitor;
    var NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
    // 2026-10-17 PC: 원격 주소(server.url)로 띄우면 네이티브 다리만 들어오고 @capacitor/core 의 registerPlugin 은 없음 -
    // 그래서 BG · TTS 가 모두 null 이라 🔊 가 숨고 화면을 끄면 위치가 멈췄음. 플러그인은 Capacitor.Plugins.<이름> 에 바로 있음
    function plugin(name) {
        if (!NATIVE) return null;
        if (CAP.registerPlugin) return CAP.registerPlugin(name);
        if (CAP.isPluginAvailable && !CAP.isPluginAvailable(name)) return null;
        return CAP.Plugins && CAP.Plugins[name] || null;
    }
    var BATTERY_KEY = "rf-battery", batterySave = false;
    try { batterySave = localStorage.getItem(BATTERY_KEY) === "1"; } catch (e) { /* 기본은 끔 */ }
    var BG = plugin("BackgroundGeolocation"), TTS = plugin("TextToSpeech"), FS = plugin("Filesystem"), SHARE = plugin("Share");
    var LN = plugin("LocalNotifications");
    // 🏠 안부 알림을 누르면 안부 화면으로(앱은 늘 따라가기로 열림 - 2026-10-17)
    if (LN && LN.addListener) Promise.resolve(LN.addListener("localNotificationActionPerformed", function (ev) {
        if (ev && ev.notification && ev.notification.extra && ev.notification.extra.page === "anbu" && !hike.running) location.href = "anbu.html";
        if (ev && ev.notification && ev.notification.extra && ev.notification.extra.page === "pill" && !hike.running) location.href = "tools.html?open=t-pill";   // 💊 약 알림(2026-10-18)
    })).catch(function () { /* 옛 설치본 */ });   // 안전 알림 진동 · 소리(2026-10-17 홍TV님 폰: 화면이 꺼지면 웹뷰 navigator.vibrate 가 막힘) - 없는 옛 설치본이면 null

    /** 앱 - 파일을 앱 임시 폴더에 쓰고 공유 창으로(문자 · 카카오톡 · 파일 저장 …). */
    function nativeShareFile(name, base64, text) {
        return FS.writeFile({ path: name, data: base64, directory: "CACHE" }).then(function (r) {
            return SHARE.share({ title: name, text: text || "", files: [r.uri], dialogTitle: T("보내기", "Send") });
        });
    }

    function blobToBase64(blob) {
        return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload = function () { resolve(String(fr.result).split(",")[1]); };
            fr.onerror = reject;
            fr.readAsDataURL(blob);
        });
    }

    // ------------------------------------------------------------------ 음성 안내

    /**
     * 음성 안내 - 브라우저 내장 읽어 주기(Web Speech API, 한국어). 갈림길 · 지점 · 1km 마다 · 코스 이탈 · 일몰 · 도착.
     * 지도 왼쪽 버튼으로 자세히(🔊) → 짧게(🔉) → 끔(🔇) 차례로 바꿉니다(이 기기에 기억).
     * 짧게는 지점 이름 · 거리 이정 · 갈림길 · 이탈만 말하고 지난 시간 · 다음 지점까지는 빼고 말합니다.
     * 화면이 켜져 있을 때 확실히 나옵니다(꺼지면 브라우저가 멈출 수 있음).
     */
    var VOICE_KEY = "rf-voice";
    var VOICE_LEVELS = ["on", "short", "off"];   // 저장 값 - 예전 "on" 은 자세히
    var voice = { on: true, level: "on", ko: null, last: {} };
    try { var v0 = localStorage.getItem(VOICE_KEY); if (VOICE_LEVELS.indexOf(v0) >= 0) voice.level = v0; } catch (e) { /* 기본은 자세히 */ }
    voice.on = voice.level !== "off";

    function pickVoice() {
        if (!("speechSynthesis" in window)) return;
        var vs = speechSynthesis.getVoices();
        voice.ko = vs.filter(function (v) { return (EN ? /^en/i : /^ko/i).test(v.lang); })[0] || null;   // 영어 화면은 영어 목소리
    }
    if ("speechSynthesis" in window) {
        pickVoice();
        speechSynthesis.onvoiceschanged = pickVoice;
    }

    /**
     * 말하기. opt.key 가 있으면 같은 key 는 opt.gap(기본 60초) 안에 다시 말하지 않습니다.
     * opt.urgent 면 하던 말을 끊고 바로(코스 이탈 · 갈림길), 아니면 말하는 중일 때 건너뜁니다(모의 40배속에서 쌓이지 않게).
     */
    function say(text, opt) {
        opt = opt || {};
        if ((!voice.on && !opt.force) || !text || !TTS && !("speechSynthesis" in window)) return;
        var t = Date.now();
        if (opt.key) {
            if (voice.last[opt.key] && t - voice.last[opt.key] < (opt.gap || 60000)) return;
            voice.last[opt.key] = t;
        }
        if (TTS) {   // 앱 - 화면이 꺼져도 말합니다
            if (opt.urgent) TTS.stop().catch(function () { /* 말하는 중이 아니면 */ });
            else if (voice.busy) return;
            var my = voice.busy = (voice.busy || 0) + 1;
            if (DEBUG) console.info("[rf] say " + new Date().toTimeString().slice(0, 8) + " " + String(text).slice(0, 30));   // 실제로 말할 때만(gap · busy 로 건너뛴 것은 안 남김)
            TTS.speak({ text: text, lang: EN ? "en-US" : "ko-KR", rate: 1.0, category: "playback" })
                .catch(function () { /* 끊긴 말 */ })
                .then(function () { if (voice.busy === my) voice.busy = 0; });
            return;
        }
        if (opt.urgent) speechSynthesis.cancel();
        else if (speechSynthesis.speaking || speechSynthesis.pending) return;
        var u = new SpeechSynthesisUtterance(text);
        u.lang = EN ? "en-US" : "ko-KR";
        u.rate = 1.05;
        if (voice.ko) u.voice = voice.ko;
        speechSynthesis.speak(u);
    }

    function setVoice(level) {
        voice.level = level;
        voice.on = level !== "off";
        try { localStorage.setItem(VOICE_KEY, level); } catch (e) { /* 저장 못 해도 이번에는 */ }
        $("voice").textContent = level === "on" ? "🔊" : level === "short" ? "🔉" : "🔇";
        $("voice").setAttribute("aria-label", EN ? "Voice guide " + (level === "on" ? "detailed" : level === "short" ? "short" : "off") + " - tap to change"
            : "음성 안내 " + (level === "on" ? "자세히" : level === "short" ? "짧게" : "꺼짐") + " - 누르면 바꿈");
        $("voice").classList.toggle("on", voice.on);
        if (!voice.on) stopTalking();
    }

    function stopTalking() {
        if (TTS) TTS.stop().catch(function () { /* 무시 */ });
        else if ("speechSynthesis" in window) speechSynthesis.cancel();
        voice.busy = 0;
    }

    /** 받침이 있으면 a, 없으면 b(을/를 · 이/가). 한글이 아니면 b. */
    function josa(word, a, b) {
        var ch = (word || "").replace(/\(.*\)$/, "").trim().slice(-1), code = ch.charCodeAt(0) - 0xAC00;
        return code >= 0 && code < 11172 && code % 28 !== 0 ? a : b;
    }

    /**
     * 말할 코스 이름 - "지리산 천왕봉 · 산오름 → 천왕봉 → 탐방지원센터"
     *   → "지리산 천왕봉, 산오름에서 천왕봉을 거쳐 탐방지원센터까지". 둘이면 "A에서 B까지".
     */
    function spokenName(name) {
        if (EN) return String(RF.nameIn(name) || "").replace(/\s*→\s*/g, " to ").replace(/ · /g, ", ");   // "Osaek to Daecheongbong"
        var parts = String(name || "").split(" · ");
        return parts.map(function (p) {
            var seg = p.split(/\s*→\s*/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
            if (seg.length < 2) return p;
            var first = seg[0], last = seg[seg.length - 1], mid = seg.slice(1, -1);
            return first + "에서 " + (mid.length ? mid.join(", ") + josa(mid[mid.length - 1], "을", "를") + " 거쳐 " : "") + last + "까지";
        }).join(", ");
    }

    /** 화면 거리 - 1km 미만은 m, 넘으면 km 한 자리(179.5km) */
    function distText(m) { return m < 1000 ? num(m) + "m" : skm(m) + "km"; }
    function distSpoken(m) { return EN ? (m < 1000 ? num(m) + " meters" : skm(m) + " kilometers") : m < 1000 ? num(m) + "미터" : skm(m) + "킬로미터"; }

    /** 출발점 이름표(없으면 null) */
    function startName() {
        var p = c && c.pois.filter(function (q) { return +q.dist_m < 60 && +q.off_route_m < 60; })[0];
        return p ? p.name : null;
    }

    /** 말할 거리 - 소수 한 자리(5.8킬로미터) */
    function skm(m) { return (Math.round(m / 100) / 10).toString(); }

    /** "1시간 5분" · "40분" */
    function spokenTime(ms) {
        var m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60);
        if (EN) return ((h ? h + (h > 1 ? " hours " : " hour ") : "") + (m % 60 ? (m % 60) + (m % 60 > 1 ? " minutes" : " minute") : "")).trim();
        return (h ? h + "시간 " : "") + (m % 60 ? (m % 60) + "분" : "").trim();
    }

    /**
     * 지점을 지날 때 덧붙이는 말(2026-10-09 홍TV님 - 등산 앱처럼 지난 시간 · 다음 지점까지):
     * "출발한 지 5시간 20분. 다음 소청대피소까지 1.3킬로미터, 오르막 250미터입니다." 다음 지점이 없으면 도착까지.
     */
    function passInfo(atD) {
        if (voice.level === "short") return "";
        var out = EN ? spokenTime(now() - hike.start) + " since start." : "출발한 지 " + spokenTime(now() - hike.start) + ".";
        var nx = RF.nextPoi(c, atD), nd = nx ? Math.min(+nx.dist_m, c.total) : c.total;
        if (nd - atD < 100) return out;   // 바로 앞이면 거리는 빼고
        var up = RF.ascentLeft(c, atD) - RF.ascentLeft(c, nd);
        // 구간 난이도(2026-10-16 홍TV님 - 📋 안내판과 같은 단계) - 등산 · 걷기, 쉬움 이상만(매우 쉬운 길까지 말하면 시끄러움)
        var sl = K() !== RF.KINDS.bike ? RF.slopeBetween(c, atD, nd) : null, lvSay = sl && sl.lv >= 1 ? ", " + RF.LEVELS[sl.lv].ko + " " + (sl.up ? "오르막" : "내리막") + " 구간, 경사 " + Math.round(sl.pct) + "퍼센트" : "";
        if (EN) return out + " " + distSpoken(Math.round((nd - atD) / 10) * 10) + " to " + (!nx ? "the finish" : (nd < c.total - 60 ? "the next point, " : "") + NM(nx.name))
            + (up >= 30 && K() !== RF.KINDS.bike ? ", climbing " + num(up) + " meters" : "")
            + (sl && sl.lv >= 1 ? ", " + RF.LEVELS[sl.lv].en.toLowerCase() + " " + (sl.up ? "uphill" : "downhill") + ", " + Math.round(sl.pct) + " percent grade" : "") + ".";
        return out + " " + (!nx ? "도착" : nd < c.total - 60 ? "다음 " + nx.name : nx.name) + "까지 " + distSpoken(Math.round((nd - atD) / 10) * 10)
            + (up >= 30 && K() !== RF.KINDS.bike ? ", 오르막 " + num(up) + "미터" : "") + lvSay + "입니다.";
    }

    /** 1km(자전거 5km) 마다 · 지점을 지날 때 - onFix 에서 코스 위에 있을 때. */
    function voiceProgress() {
        if (!hike.running || hike.off > OFF_ROUTE_M) return;
        var d = hike.d;
        // 지점(이름표) - 지날 때 한 번. 출발 · 도착 자리는 시작 · 도착 안내가 대신합니다.
        // 같은 자리(80m 안) 지점은 한 문장으로 - "법계사, 로타리대피소샘터입니다. …"(지리산 3,351m 에 둘이 겹쳐 같은 말을 두 번 했음)
        var spoken = function (q) {
            var qd = +q.dist_m;
            return !(qd < 60 || qd > c.total - 60 || +q.off_route_m > (RF.isTopName(q.name) ? 160 : 80) || hike.passed[q.name + "@" + Math.round(qd)]);
        };
        // 지난번과 지금 사이에 지나친 지점도(2026-10-16 PC: 시험 걷기 · 띄엄띄엄한 GPS 는 한 번에 수백 m 라 30m 안을 건너뛰어 지점 안내가 빠졌음).
        // 한 번에 3km 넘게 뛰면(위치 튐) 그 사이는 말하지 않음. 여럿을 지나쳤으면 마지막 것만 말하고 앞의 것은 말한 셈 침
        var prev = hike.voiceD != null && d - hike.voiceD < 3000 ? hike.voiceD : d;
        hike.voiceD = d;
        var hits = c.pois.filter(function (q) { var qd = +q.dist_m; return spoken(q) && (Math.abs(d - qd) <= 30 || (prev < qd && qd <= d)); })
            .sort(function (a, b) { return +b.dist_m - +a.dist_m; });
        var hit = hits[0];
        hits.forEach(function (q) { if (+q.dist_m < +hit.dist_m - 80) hike.passed[q.name + "@" + Math.round(+q.dist_m)] = true; });
        if (hit) {
            var group = c.pois.filter(function (q) { return spoken(q) && Math.abs(+q.dist_m - +hit.dist_m) <= 80; });
            var names = [], ele = null, far = 0;
            group.forEach(function (q) {
                hike.passed[q.name + "@" + Math.round(+q.dist_m)] = true;   // 이름 + 자리(같은 이름 다른 쉼터)
                if (names.indexOf(q.name) < 0) names.push(q.name);
                if (ele == null && q.ele_m != null) ele = +q.ele_m;
                far = Math.max(far, +q.dist_m);
            });
            say(EN ? (names.map(NM).join(", ") + "." + (ele != null ? " Elevation " + num(ele) + " meters." : "") + " " + passInfo(far)).trim()
                : (names.join(", ") + "입니다." + (ele != null ? " 해발 " + num(ele) + "미터." : "") + " " + passInfo(far)).trim());
        }
        // 거리 이정
        var step = K() === RF.KINDS.bike ? 5000 : 1000;
        var k = Math.floor(d / step);
        if (c.total > step * 1.5 && k > hike.kmSpoken && c.total - d > 300) {
            hike.kmSpoken = k;
            var asc = RF.ascentLeft(c, d);
            if (EN) say(num(k * step / 1000) + " kilometers done. " + (voice.level === "short" ? "" : spokenTime(now() - hike.start) + " since start. ") + skm(c.total - d) + " kilometers to go"
                + (asc >= 50 && K() !== RF.KINDS.bike ? ", " + num(asc) + " meters of climbing left." : ".") + (paceDiff() != null ? " " + RF.paceText(paceDiff()) + "." : ""));
            else say(num(k * step / 1000) + "킬로미터 지났습니다. " + (voice.level === "short" ? "" : "출발한 지 " + spokenTime(now() - hike.start) + ". ") + "남은 거리 " + skm(c.total - d) + "킬로미터"
                + (asc >= 50 && K() !== RF.KINDS.bike ? ", 남은 오르막 " + num(asc) + "미터." : ".")
                + (paceDiff() != null ? " " + RF.paceText(paceDiff()).replace("빠름", "빠릅니다.").replace("늦음", "늦습니다.").replace("비슷", "비슷합니다.") : ""));
        }
    }

    // ------------------------------------------------------------------ 칼로리 · 걸음

    /** 몸무게 · 키 - 칼로리 · 걸음 수 추정에 씁니다. 이 기기에만 둡니다(rf-body). 넣지 않으면 65kg · 170cm. */
    var BODY_KEY = "rf-body";
    var body = { kg: 65, cm: 170, set: false };
    try { var b0 = JSON.parse(localStorage.getItem(BODY_KEY) || "null"); if (b0 && b0.kg) body = { kg: b0.kg, cm: b0.cm || 170, set: true }; } catch (e) { /* 기본값 */ }

    function saveBody() {
        body.set = true;
        try { localStorage.setItem(BODY_KEY, JSON.stringify({ kg: body.kg, cm: body.cm })); } catch (e) { /* 이번만 */ }
    }

    // 큰 글씨 확인 창(rf-dialog.js, 2026-10-28 접근성 - 앱 안에서 "routefly.kr 의 메시지" 작은 창 대신). 없으면 브라우저 창
    function hAsk(t, o) { return window.RFDialog ? RFDialog.confirm(t, o) : Promise.resolve(confirm(t)); }
    function hAskText(t, v, o) { return window.RFDialog ? RFDialog.prompt(t, v, o) : Promise.resolve(prompt(t, v)); }
    function askNumber(msg, cur, min, max) {
        var v = prompt(msg, String(cur));
        if (v == null) return null;
        var n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
        if (!isFinite(n) || n < min || n > max) { toast(T(min + " ~ " + max + " 사이로 넣어 주세요.", "Enter a number from " + min + " to " + max + ".")); return null; }
        return Math.round(n);
    }

    /** 이번 기록의 칼로리 · 걸음 · 오른 높이. 거리는 GPS 로 걸은 거리(없으면 코스 진행), 높이는 코스 고도로. */
    function effort() {
        // 가장 멀리 간 자리(dMax)까지로 셉니다 - 되돌아 내려오면 진행 거리는 줄어도 칼로리 · 걸음 · 오른 높이는 줄지 않게
        // (송산: 1.07km 에서 되돌아와 0.85km 가 되자 116 → 79kcal, 오른 높이 104 → 60m)
        var s = segEffort(), b = hike.base || { dist: 0, up: 0, down: 0 };
        var dist = Math.max(hike.walked || 0, b.dist + s.dist), up = b.up + s.up, down = b.down + s.down;
        var kind = c ? c.course.kind : "hike";
        return { dist: dist, up: Math.round(up), kcal: RF.kcal(kind, body.kg, dist, up, down), steps: RF.steps(kind, body.cm, dist) };
    }

    /** 지금 코스에서 한 것(코스를 바꾸면 hike.base 에 더하고 0 부터). */
    function segEffort() {
        var d0 = hike.d0 == null ? hike.d : hike.d0;   // 아직 코스에 닿기 전이면 코스 진행은 0
        var dm = Math.max(hike.dMax || 0, hike.d);
        var cl = c ? RF.climbBetween(c, d0, Math.max(d0, dm)) : { up: 0, down: 0 };
        return { dist: Math.max(0, dm - d0), up: cl.up, down: cl.down };
    }

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
            // 2026-10-10 점검: JSON 이 아닌 답(429 · 프록시 HTML)이면 r.json() 의 SyntaxError 대신 HTTP 번호를 알립니다(app.js 와 같음)
            return r.json().catch(function () { return { success: false, message: "응답을 읽지 못했습니다 (HTTP " + r.status + ")" }; }).then(function (j) {
                if (!r.ok || !j || j.success === false) {
                    var err = new Error(j.message || ("HTTP " + r.status));
                    err.data = j;   // 없는 코스면 같은 산 코스(similar)가 들어 있습니다
                    throw err;
                }
                return j;
            });
        });
    }

    function hhmmss(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
        return h + ":" + (m < 10 ? "0" : "") + m + ":" + (x < 10 ? "0" : "") + x;
    }

    function clock(ms) {
        var d = new Date(ms);
        return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
    }

    function bearing(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
        var x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
        return (Math.atan2(y, x) / r + 360) % 360;
    }

    function dirWord(b) {
        if (EN) return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Math.round(b / 45) % 8];
        return ["북", "북동", "동", "남동", "남", "남서", "서", "북서"][Math.round(b / 45) % 8] + "쪽";
    }

    function distM(lat1, lon1, lat2, lon2) {
        var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 6371000 * 2 * Math.asin(Math.sqrt(a));
    }

    // ------------------------------------------------------------------ 지도

    /**
     * 2026-10-09 (홍TV님): 바탕 지도 - 위성사진(sat) · 밝은 지도(light, V-World 일반지도 Base). 밖 햇빛 아래에서는
     * 밝은 지도가 더 잘 보이기도 합니다(등산 앱 비교 영상의 연한 바탕 지도). 고른 것은 이 기기에 기억합니다.
     */
    var BASEMAP_KEY = "rf-basemap";
    var basemap = "sat";
    try { if (localStorage.getItem(BASEMAP_KEY) === "light") basemap = "light"; } catch (e) { /* 기본 위성 */ }

    function buildStyle(cfg) {
        var dem = { type: "raster-dem", tiles: [cfg.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: 15,
            attribution: RF.tr("지형: ", "Terrain: ") + "Terrain Tiles (AWS Open Data)" };
        var sources = { hillshade: dem }, layers = [{ id: "bg", type: "background", paint: { "background-color": cfg.vworldKey ? "#1b2430" : "#dcd6c6" } }];
        if (cfg.vworldKey) {
            var key = encodeURIComponent(cfg.vworldKey);
            sources.sat = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19,
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/{z}/{y}/{x}.jpeg"], attribution: T("위성사진: 국토교통부 V-World", "Satellite: V-World (Korea MOLIT)") };
            sources.base = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19,
                tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Base/{z}/{y}/{x}.png"], attribution: T("지도: 국토교통부 V-World", "Map: V-World (Korea MOLIT)") };
            layers.push({ id: "sat", type: "raster", source: "sat", layout: { visibility: basemap === "sat" ? "visible" : "none" } });
            layers.push({ id: "base", type: "raster", source: "base", layout: { visibility: basemap === "light" ? "visible" : "none" } });
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", paint: { "hillshade-exaggeration": 0.2 } });
            // V-World 지명 겹침은 쓰지 않습니다 - 우리 이름표와 같은 이름이 비스듬히 한 번 더 나와 겹쳐 보입니다
        } else {
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade",
                paint: { "hillshade-exaggeration": 0.65, "hillshade-shadow-color": "#3d4a3a", "hillshade-highlight-color": "#fbf7ea" } });
        }
        return { version: 8, sources: sources, layers: layers };
    }

    /** 바탕 지도 바꾸기 - 타일 층은 보이기만 바꾸고, 밝은 지도에서는 코스 선을 진한 주황(흰 선이 안 보임)으로. */
    function setBasemap(mode, quiet) {
        basemap = mode === "light" ? "light" : "sat";
        try { localStorage.setItem(BASEMAP_KEY, basemap); } catch (e) { /* 기억 못 해도 됨 */ }
        var light = basemap === "light";
        if (map.getLayer("sat")) map.setLayoutProperty("sat", "visibility", light ? "none" : "visible");
        if (map.getLayer("base")) map.setLayoutProperty("base", "visibility", light ? "visible" : "none");
        if (map.getLayer("hillshade")) map.setPaintProperty("hillshade", "hillshade-exaggeration", light ? 0.3 : 0.2);
        if (map.getLayer("route-case")) {
            map.setPaintProperty("route-case", "line-color", light ? "#ffffff" : "#000");
            map.setPaintProperty("route-case", "line-opacity", light ? 0.95 : 0.45);
            map.setPaintProperty("route-all", "line-color", light ? "#e8590c" : "#ffffff");
            map.setPaintProperty("trails", "line-color", light ? "#8a6d00" : "#ffe8a3");
        }
        $("layerBtn").textContent = light ? "🛰️" : "🗺️";
        $("layerBtn").setAttribute("aria-label", light ? T("위성사진으로", "Satellite view") : T("밝은 지도로", "Light map"));
        $("layerBtn").title = light ? T("위성사진으로", "Satellite view") : T("밝은 지도로(햇빛 아래에서 잘 보임)", "Light map (easier to see in sunlight)");
        document.body.classList.toggle("lightmap", light);
        if (!quiet) toast(light ? T("밝은 지도", "Light map") : T("위성사진", "Satellite"), 1500);
    }

    function progressGradient(p) {
        var on = RF.LINE_COLOR, clear = "rgba(56,217,234,0)";
        if (p <= 0.0001) return ["step", ["line-progress"], clear, 1, clear];
        if (p >= 0.9999) return ["step", ["line-progress"], on, 1, on];
        return ["step", ["line-progress"], on, p, clear];
    }

    function startMap() {
        map = new maplibregl.Map({ container: "map", style: buildStyle(cfg), center: [127.8, 36.3], zoom: 6.2,
            attributionControl: false, pitchWithRotate: false, dragRotate: false, touchPitch: false });
        map.touchZoomRotate.disableRotation();   // 북쪽이 늘 위(작은 화면에서 길 잃지 않게)
        RF.spotsByZoom(map);   // 위험 · 조망 아이콘은 확대했을 때만
        map.addControl(new maplibregl.AttributionControl({ compact: true,
            customAttribution: RF.tr("등산로: 산림청 등산로정보 | 걷기길: 한국관광공사 두루누비 | 지명 · 자전거길: © OpenStreetMap contributors | <a href=\"about.html\">안내</a>",   // 영어(2026-10-22 PC: 영어 화면에 한글로 남음)
                "Trails: Korea Forest Service | Walking paths: Korea Tourism Organization (Durunubi) | Names · bike paths: © OpenStreetMap contributors | <a href=\"about-en.html\">Info</a>") }), "top-right");
        // 작은 화면에서는 출처를 ⓘ 로 접어 둡니다(누르면 펼쳐짐) - 지도를 가리지 않게
        // (MapLibre 는 처음에 펼쳐 두고 첫 끌기 때 접습니다 - 바로 접고, 지도가 다 뜬 뒤에도 한 번 더)
        function foldAttrib() {
            var a = document.querySelector(".maplibregl-ctrl-attrib");
            if (a) a.classList.remove("maplibregl-compact-show");
        }
        foldAttrib();
        map.once("styledata", foldAttrib);
        map.once("load", foldAttrib);
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
        // 이름표 겹침 - 지도가 움직이는 동안 0.15초마다 다시(정상 · 출발 · 도착 먼저, 그다음 지금 위치에 가까운 순)
        var declutterTimer = 0;
        map.on("rotate", function () {   // 나침반이 꺼져 있으면 바늘은 지도의 북쪽(두 손가락으로 돌렸을 때)
            if (compass.heading == null) setNeedle(-map.getBearing());
            if (hike.guideBr != null && compass.heading == null) turnGuideArrow();
        });
        map.on("render", function () {
            if (declutterTimer || !drawCourse.pois) return;
            declutterTimer = setTimeout(function () {
                declutterTimer = 0;
                RF.declutter(drawCourse.pois.map(function (q) { return { el: q.el, prio: q.top ? -2 : q.end ? -1 : Math.abs(q.d - (hike.d || 0)) }; }));
            }, 150);
        });
        ["dragstart", "zoomstart"].forEach(function (ev) {
            map.on(ev, function (e) { if (e.originalEvent) setFollow(false); });   // 손으로 움직이면 따라가기를 끕니다
        });
        mapReady = new Promise(function (resolve) {
            map.once("style.load", function () {
                var empty = { type: "FeatureCollection", features: [] };
                // 주변 다른 등산로 - 흐린 선(코스 밖으로 빠졌을 때 어느 길로 돌아갈지 보이게)
                map.addSource("trails", { type: "geojson", data: empty });
                map.addLayer({ id: "trails", type: "line", source: "trails", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#ffe8a3", "line-opacity": 0.55, "line-width": 2, "line-dasharray": [2, 1.5] } });
                map.addSource("route", { type: "geojson", lineMetrics: true, data: empty });
                map.addLayer({ id: "route-case", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#000", "line-opacity": 0.45, "line-width": 8 } });
                map.addLayer({ id: "route-all", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#ffffff", "line-width": 4.5 } });
                map.addLayer({ id: "route-done", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-width": 5, "line-gradient": progressGradient(0) } });
                // 자료가 끊긴 구간 - 붉은 점선(2026-10-30, 그 사이는 실제 길이 아님 - 현지 안내판)
                map.addSource("gaps", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
                map.addLayer({ id: "gaps", type: "line", source: "gaps", layout: { "line-cap": "round" },
                    paint: { "line-color": "#ff5a3c", "line-width": 5, "line-dasharray": [1, 1.6] } });
                // 갈림길 - 글자 없이 작은 점
                map.addSource("junctions", { type: "geojson", data: empty });
                map.addLayer({ id: "junctions", type: "circle", source: "junctions",
                    paint: { "circle-radius": 4.5, "circle-color": "#ffffff", "circle-stroke-color": "#1a73e8", "circle-stroke-width": 2 } });
                // 코스에서 벗어났을 때 가장 가까운 길까지 점선
                // 내 기록 하나를 지도에 볼 때 - 보라 선(코스 선과 헷갈리지 않게)
                map.addSource("recTrack", { type: "geojson", data: empty });
                map.addLayer({ id: "recTrack", type: "line", source: "recTrack", filter: ["!=", ["get", "gap"], true], layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": "#c77dff", "line-width": 4, "line-opacity": 0.9 } });
                // 위치가 끊긴 구간(크롬 화면 꺼짐 등)은 점선(2026-10-28 홍TV님 "지도도 점선으로")
                map.addLayer({ id: "recTrackGap", type: "line", source: "recTrack", filter: ["==", ["get", "gap"], true], layout: { "line-cap": "butt" },
                    paint: { "line-color": "#c77dff", "line-width": 3, "line-opacity": 0.75, "line-dasharray": [2, 2] } });
                map.addSource("guide", { type: "geojson", data: empty });
                map.addLayer({ id: "guide", type: "line", source: "guide",
                    paint: { "line-color": "#ff5d5d", "line-width": 3, "line-dasharray": [1.5, 1.2] } });
                if (cfg.vworldKey) setBasemap(basemap, true);
                resolve();
            });
        });
    }

    function marker(elm, lngLat, anchor) {
        return new maplibregl.Marker({ element: elm, anchor: anchor || "center" }).setLngLat(lngLat).addTo(map);
    }

    function drawCourse(keepView) {
        (drawCourse.markers || []).forEach(function (m) { m.remove(); });
        var ms = drawCourse.markers = [];
        npMarks();   // 🏅 국립공원 스탬프투어 인증지
        map.getSource("route").setData({ type: "Feature", properties: {},
            geometry: { type: "LineString", coordinates: c.lon.map(function (lon, i) { return [lon, c.lat[i]]; }) } });
        if (map.getSource("gaps")) map.getSource("gaps").setData(RF.gapLines(c));   // 끊긴 구간 붉은 점선
        // km 번호(동그라미)
        var step = RF.kmStep(c.total);
        for (var m = step; m < c.total - step * 0.3; m += step) {
            var p = RF.at(c, m), e = document.createElement("div");
            e.className = "km";
            e.textContent = String(Math.round(m / 1000));
            ms.push(marker(e, [p.lon, p.lat]));
        }
        // 지점 - 아이콘 + 이름. 출발 · 도착 자리에 이름표가 없으면 "출발" · "도착".
        var n = c.lon.length - 1;
        // 코스 이름의 끝 이름이 끝 300m 안에 있으면 그것이 도착(중산리 → 천왕봉 은 천왕봉 이름표가 선 끝 123m 앞 - "도착" 이 하나 더 붙었음)
        var ce = RF.routeEnds(c.course.name);
        var hasStart = c.pois.some(function (q) { return (+q.dist_m < 60 && +q.off_route_m < 60) || (ce.from && q.name === ce.from && +q.dist_m < 300); });
        var hasEnd = c.pois.some(function (q) { return (+q.dist_m > c.total - 60 && +q.off_route_m < 60) || (ce.to && q.name === ce.to && +q.dist_m > c.total - 300); });
        // 같은 자리(80m 안) 이름표는 하나로 - 대표 이름 + 아래에 다른 이름들
        // 순환 코스 끝 이름표는 그래프에만, 앞에 나온 같은 이름이 500m 안이면 지도에는 하나(탄금호 - 충주탄금대인증센터 이름표 둘이 354m · 화면 9px 차이)
        var shown = [];
        c.pois.forEach(function (q) {
            if (q.again || shown.some(function (o) { return o.name === q.name && RF.distM(+o.lat, +o.lon, +q.lat, +q.lon) < 500; })) return;
            shown.push(q);
        });
        var groups = RF.groupPois(shown, 80);
        var top = RF.summitIndex(groups.map(function (g) { return { name: g.lead.name, names: g.names, ele_m: g.lead.ele_m }; }), c.course.name);
        var list = groups.map(function (g, gi) {
            var more = g.names.slice(1, 3);
            if (g.names.length > 3) more[1] += T(" 외 ", " +") + (g.names.length - 3);
            return { name: g.lead.name, lon: +g.lead.lon, lat: +g.lead.lat, d: +g.lead.dist_m, more: more, top: gi === top };
        });
        if (!hasStart) list.unshift({ name: T("출발", "Start"), lon: c.lon[0], lat: c.lat[0], d: 0, more: [] });
        if (!hasEnd) list.push({ name: T("도착", "Finish"), lon: c.lon[n], lat: c.lat[n], d: c.total, more: [] });
        drawCourse.pois = [];
        list.forEach(function (q) {
            var e = document.createElement("div");
            e.className = "poi";
            e.innerHTML = '<div class="lb"></div><div class="ic"></div>';
            var lb = e.querySelector(".lb");
            RF.nameNodes(lb, q.name);   // 탐방지원센터는 작은 글씨
            q.more.forEach(function (nm) { var m = document.createElement("span"); m.className = "more"; m.textContent = NM(nm); lb.appendChild(m); });
            e.querySelector(".ic").textContent = RF.poiIcon(q.name);
            drawCourse.pois.push({ el: e, d: q.d, end: q.d < 60 || q.d > c.total - 60, top: !!q.top });
            ms.push(new maplibregl.Marker({ element: e, anchor: "bottom", offset: [0, 11] }).setLngLat([q.lon, q.lat]).addTo(map));
        });
        // 국립공원 위험지역 · 구급함 · 헬기장 · 공원지킴터 · 조망점 - 작은 아이콘(누르면 이름)
        (c.spots || []).forEach(function (sp) {
            var e = document.createElement("div");
            e.className = "spot " + sp.kind;
            e.textContent = RF.spotIcon(sp.kind);
            e.title = RF.spotText(sp);
            e.addEventListener("click", function (ev) { ev.stopPropagation(); toast(RF.spotIcon(sp.kind) + " " + RF.spotText(sp), 4000); });
            ms.push(marker(e, [+sp.lon, +sp.lat]));
        });
        map.getSource("junctions").setData({ type: "FeatureCollection", features: (c.junctions || []).map(function (jd) {
            var jp = RF.at(c, jd);
            return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [jp.lon, jp.lat] } };
        }) });
        if (!keepView) {   // 걷는 중에 코스를 바꿀 때는 지도를 그대로(내 위치를 따라감)
            var b = new maplibregl.LngLatBounds();
            for (var i = 0; i < c.lon.length; i++) b.extend([c.lon[i], c.lat[i]]);
            // 들머리 근처 주차장 · 버스 정류장도 처음 화면에 보이게
            c.pois.forEach(function (q) { if (RF.isAccess(q) && +q.dist_m < 300) b.extend([+q.lon, +q.lat]); });
            map.fitBounds(b, { padding: 40, duration: 0, maxZoom: 16 });
        }
        loadTrails();
    }

    /** 코스 범위(+약 1km)의 주변 등산로. 오프라인이면 저장해 둔 것(서비스 워커)을 씁니다. */
    function courseBbox(pad) {
        var w = Math.min.apply(null, c.lon) - pad, e = Math.max.apply(null, c.lon) + pad;
        var s = Math.min.apply(null, c.lat) - pad, n = Math.max.apply(null, c.lat) + pad;
        // API 는 0.2° 안만 받습니다 - 넓은 코스는 가운데 0.2° 만
        if (e - w > 0.2) { var cx = (w + e) / 2; w = cx - 0.099; e = cx + 0.099; }
        if (n - s > 0.2) { var cy = (s + n) / 2; s = cy - 0.099; n = cy + 0.099; }
        return [w, s, e, n].map(function (v) { return v.toFixed(5); }).join(",");
    }

    // 같은 범위(되돌아가기 · 같은 산 갈래 바꾸기)는 다시 묻지 않습니다 - 마지막 몇 개만 기억
    var trailsMemo = [];
    function trailsJson(url) {
        for (var i = 0; i < trailsMemo.length; i++) if (trailsMemo[i].url === url) return trailsMemo[i].p;
        var p = getJson(url);
        trailsMemo.unshift({ url: url, p: p });
        trailsMemo.length = Math.min(trailsMemo.length, 4);
        p.catch(function () { trailsMemo = trailsMemo.filter(function (m) { return m.p !== p; }); });
        return p;
    }

    function loadTrails() {
        trails = [];
        var id = c.id;
        trailsJson("api/trails?bbox=" + courseBbox(0.01)).then(function (j) {
            if (!c || c.id !== id) return;
            var mine = RF.parseJoinId(id) ? RF.parseJoinId(id).map(function (p) { return p.base; }) : [id];   // 이은 코스는 그 구간들도 빼고
            trails = (j.trails || []).filter(function (t) { return mine.indexOf(t.id) < 0 && t.coords.length > 1; }).map(function (t) {
                var tc = { id: t.id, name: t.name, lon: [], lat: [], dist: [0], ele: [] };
                t.coords.forEach(function (p, i) {
                    tc.lon.push(p[0]); tc.lat.push(p[1]); tc.ele.push(null);
                    if (i) tc.dist.push(tc.dist[i - 1] + RF.distM(tc.lat[i - 1], tc.lon[i - 1], p[1], p[0]));
                });
                tc.total = tc.dist[tc.dist.length - 1];
                return tc;
            });
            map.getSource("trails").setData({ type: "FeatureCollection", features: trails.map(function (t) {
                return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: t.lon.map(function (lon, i) { return [lon, t.lat[i]]; }) } };
            }) });
        }).catch(function () { /* 주변 길은 없어도 됩니다 */ });
    }

    /** 가장 가까운 등산로 자리 - 지금 코스와 주변 길 가운데. {lat, lon, off, name(다른 길이면)} */
    /** 길 안내 화살표: 나침반이 있으면 핸드폰 위쪽 기준(그쪽으로 몸을 돌려 걷게), 없으면 지도(북쪽 위) 기준. */
    function turnGuideArrow() {
        var rel = compass.heading != null ? hike.guideBr - compass.heading : hike.guideBr - map.getBearing();
        $("guideArrow").style.transform = "rotate(" + rel + "deg)";   // 화살표 그림은 위쪽을 가리킵니다
    }

    // 2026-10-09 점검: 화면은 1초마다 다시 그리는데 위치는 그대로일 때가 많습니다 - 같은 위치 · 코스 · 주변 길이면 지난 답을 씁니다
    // (코스에서 벗어나 있는 동안 1초마다 모든 주변 길에 맞춰 보던 계산)
    var ntMemo = null;
    function nearestTrail(lat, lon) {
        if (ntMemo && ntMemo.lat === lat && ntMemo.lon === lon && ntMemo.c === c && ntMemo.trails === trails) return ntMemo.best;
        var best = nearestTrailNow(lat, lon);
        ntMemo = { lat: lat, lon: lon, c: c, trails: trails, best: best };
        return best;
    }

    /** 칸 이름 + 고칠 수 있는 값(파란 글자) - 값이 바뀔 때만 다시 만듭니다(1초마다 innerHTML 로 새로 쓰던 것, 2026-10-09 점검). */
    function setLabel(id, word, val) {
        var el = $(id);
        if (el.dataset.v === val) return;
        el.dataset.v = val;
        el.textContent = word;
        var sp = document.createElement("span");
        sp.className = "set";
        sp.textContent = val;
        el.appendChild(sp);
    }

    function nearestTrailNow(lat, lon) {
        var s0 = RF.snap(c, lat, lon, null), p0 = RF.at(c, s0.d);
        var best = { lat: p0.lat, lon: p0.lon, off: s0.off, name: null, course: true };
        trails.forEach(function (t) {
            var st = RF.snap(t, lat, lon, null);
            // 같은 길을 쓰는 다른 코스가 1m 가깝다고 그 이름을 대면 헷갈립니다(송산: 52m 인데 '가장 가까운 길(송산 · … → 들머리 1)')
            if (st.off < best.off - 15) {
                var pt = RF.at(t, st.d);
                best = { lat: pt.lat, lon: pt.lon, off: st.off, name: t.name };
            }
        });
        return best;
    }

    function setMe(lat, lon, heading) {
        // 멈춰 있을 때(GPS 방향이 없을 때)는 나침반 방향을 씁니다
        if ((heading == null || !isFinite(heading) || (hike.speed != null && hike.speed < 0.5)) && compass.heading != null) heading = compass.heading;
        if (!meMarker) {
            var e = document.createElement("div");
            e.className = "me";
            e.innerHTML = '<div class="cone"><svg viewBox="0 0 18 18" width="18" height="18"><path d="M9 1 L16 16 L9 12 L2 16 Z" fill="#1a73e8" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div><div class="dot"></div>';
            meMarker = marker(e, [lon, lat]);
        }
        meMarker.setLngLat([lon, lat]);
        var cone = meMarker.getElement().querySelector(".cone");
        if (heading != null && isFinite(heading)) {
            cone.style.display = "block";
            cone.style.transform = "rotate(" + heading + "deg)";
        } else {
            cone.style.display = "none";
        }
    }

    function setFollow(on) {
        hike.follow = on;
        $("follow").classList.toggle("on", on);
    }

    // ------------------------------------------------------------------ 코스

    // ---- 2026-10-08 (홍TV님): GPX 열기 - 불러온 GPX 를 서버 코스와 같은 모양(RF.gpxToApi)으로 이 기기에 두고(최근 GPX_KEEP 개),
    //      코스 ID "gpx-<글자 지문>" 으로 엽니다. 새로 고침 · 이어서 산행도 서버 코스처럼 됩니다. 서버에는 올리지 않습니다.
    var isGpxId = RF.isGpxId, gpxId = RF.gpxId, storeGpx = RF.storeGpx, storedGpx = RF.storedGpx;   // course-kit(코스 미리보기와 같이 씀)
    $("gpxOpen").addEventListener("click", function () { $("gpxFile").value = ""; $("gpxFile").click(); });
    $("gpxFile").addEventListener("change", function () {
        var f = this.files && this.files[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast(T("GPX 가 너무 큽니다(5MB 까지).", "The GPX file is too big (5 MB max)."), 5000); return; }
        f.text().then(function (text) {
            var api = RF.gpxToApi(text, f.name), id = gpxId(text);
            storeGpx(id, api);
            toast(T("GPX 를 열었습니다 - ", "Opened GPX - ") + NM(api.course.name) + " · " + km(api.points[api.points.length - 1][3]) + "km"
                + (api.pois.length ? T(" · 지점 " + api.pois.length + "개", " · " + api.pois.length + " points") : ""), 5000);
            location.hash = "c=" + encodeURIComponent(id);
        }).catch(function (e) {
            toast(T("GPX 를 열지 못했습니다: ", "Could not open the GPX: ") + (e && e.message || e), 6000);
        });
    });

    // 걷는 중 입산 통제 · 하산 시각 알림(그 산 안내가 있을 때만) - 60 · 30 · 10분 앞과 지난 때, 화면 · 소리
    var rules = null, ruleSaid = {};
    setInterval(function () {
        if (!rules || !hike.running || hike.sim) return;
        RF.gateAlerts(rules, Date.now(), ruleSaid).forEach(function (a) {
            ruleSaid[a.key] = true;
            toast("⏰ " + a.text, 10000);
            say(a.text);
        });
    }, 30000);

    // 목록 이름에도 산 안내(park-notes)의 바로잡은 탐방로 이름 - 한 번 받아 둠(못 받으면 그대로)
    var listNotes = null, jsonP = {};
    /** 같은 자료(산 안내 · 100대 명산)는 한 번만 받아 나눠 씀(2026-10-21 점검 - 코스를 고를 때마다 다시 받았음). 실패하면 다음에 다시. */
    function jsonOnce(url) {
        return jsonP[url] || (jsonP[url] = fetch(url).then(function (x) { if (!x.ok) throw new Error(x.status); return x.json(); })
            .catch(function (e) { delete jsonP[url]; throw e; }));
    }
    jsonOnce("data/park-notes.json").then(function (d) { listNotes = d && d.parks; }).catch(function () { /* 그대로 */ });

    var loadSeq = 0;   // 2026-10-09 점검: A 를 누르고 바로 B 를 누르면 늦게 온 A 가 B 를 덮지 않게
    // ☆ 찜(2026-10-15 홍TV님) - 위 줄 코스 이름 옆. 찜한 코스는 따라가기 첫 화면(검색 전)에 모아 보임. 이 기기에만(rf-fav)
    var favBtn = RF.favButton(function () {
        if (!c || isGpxId(c.id)) return null;
        return { id: c.id, x: RF.parseJoinId(c.id) ? RF.favJoinExtra(location.hash, c.course.name) || undefined : undefined,   // 대표 코스 이름 · 들머리도(2026-10-30)
                 name: c.course.name, kind: c.course.kind, dist: Math.round(c.total),
                 asc: c.asc && c.asc.length ? Math.round(c.asc[c.asc.length - 1]) : null, steep: RF.steepest(c.dist, c.ele) };
    });
    $("name").parentNode.insertBefore(favBtn, $("name").nextSibling);

    /**
     * 난이도(목록 · 산 페이지와 같은 기준 - 가장 가파른 1km 포함, 2026-10-18 PC: 코스 화면에는 안 나왔음) - 아래 기록 칸 "다음 지점" 줄 오른쪽(📋 옆).
     * 위 제목 칸은 360px 폰에서 54px 뿐이라 칩을 넣으면 코스 이름이 통째로 가려졌음(2026-10-18 PC). 등산(hike · trek)만.
     */
    function nameLevel() {
        var old = $("nextRow").querySelector(".nmLv");
        if (old) old.remove();
        if (!c || !c.course || (c.course.kind !== "hike" && c.course.kind !== "trek")) return;
        var chip = RF.levelChip(c.total, c.asc && c.asc.length ? Math.round(c.asc[c.asc.length - 1]) : null, EN, RF.steepest(c.dist, c.ele));
        if (!chip) return;
        chip.classList.add("nmLv");
        $("nextRow").insertBefore(chip, $("boardOpen"));
    }

    function loadCourse(id) {
        var my = ++loadSeq;
        $("pick").style.display = "none";
        // 이 기기에만 있는 GPX 는 링크로 보낼 수 없습니다(이은 코스는 따라가기 주소로 보냄)
        var parts = RF.parseJoinId(id);
        $("share").style.display = isGpxId(id) ? "none" : "";
        var bases = parts ? RF.partBases(parts) : null;   // 같은 코스를 앞뒤로 쓰면 한 번만 받음
        var got = parts ? Promise.all(bases.map(function (b) { return getJson("api/course?id=" + encodeURIComponent(b)); })).then(function (rs) { return RF.partAnswers(parts, bases, rs); })
            : isGpxId(id) ? storedGpx(id) : getJson("api/course?id=" + encodeURIComponent(id));
        // 산 안내(park-notes)를 먼저 받아 이름을 바로잡은 탐방로는 그 이름으로(들머리 · 날머리 이름표 - 설악산 "대청봉코스(백담)" → 백담사 → 소청봉)
        var notesP = jsonOnce("data/park-notes.json").then(function (d) { return d && d.parks; }).catch(function () { return null; });
        return Promise.all([got, mapReady, notesP]).then(function (r) {
            if (my !== loadSeq) return;   // 그 사이 다른 코스를 골랐음
            // 산 안내로 이름 · 들머리 · 날머리 이름표 다듬기(바로잡은 탐방로 이름, 산마다 지명 - RF.fixPart, 3D 와 같게)
            var fix = function (cid, j) { return RF.fixPart(r[2], cid, j); };
            if (parts) r[0] = r[0].map(function (j, i) { return fix(parts[i].base, j); }); else if (!isGpxId(id)) fix(id, r[0]);
            // 여러 구간 이어 걷기(#c=구간,구간~,… - 2026-10-12 홍TV님): 구간마다 걷는 방향으로 돌려 하나로
            // 갈림길에서 자른 구간(코스ID@비율-비율:처음>끝 - 탐방 안내도)은 그 부분만
            var nc = !parts ? RF.fromApi(id, r[0]) : RF.joinedCourse(id, parts, r[0]);   // 갈림길에서 자른 구간(코스ID@비율-비율:처음>끝 - 탐방 안내도)은 그 부분만
            if (nc.lon.length < 2) throw new Error("경로 점이 없습니다.");   // 2026-10-11 점검: 확인한 뒤에 바꿈(깨진 코스로 공유 · SOS 가 돌지 않게)
            c = nc;
            var sv = loadSaved();
            // 되돌아가는 길로 바꿔 걷던 산행을 이어 갈 때, 노선 안내도에서 거꾸로 방향을 골랐을 때(#c=…&rev=1, 2026-10-12)
            if (sv ? sv.rev : /[#&]rev=1(&|$)/.test(location.hash)) c = RF.reverseCourse(c);
            // 탐방 안내도 대표 코스의 길 이름(#…&title=화엄사 → 노고단 → 천왕봉 → 대원사) - 이은 코스는 "N구간 이어 걷기" 가 됨
            var tm = /[#&]title=([^&]*)/.exec(location.hash), tt = tm ? RF.safeDecode(tm[1]) : "";
            if (tt && tt.length <= 60) c.course.name = (RF.nameParts(c.course.name).group.replace(/\s*\d+구간 이어 걷기$/, "") || "") + (RF.nameParts(c.course.name).group ? " · " : "") + tt;
            // 탐방 안내도 원점회귀 예시의 들머리 이름(#…&head=윗새재마을) - 구간 이름의 처음("새재")보다 정확
            var hm = /[#&]head=([^&]*)/.exec(location.hash), hn = hm ? RF.safeDecode(hm[1]) : "";
            // 들머리 이름(탐방 안내도 원점회귀 예시의 &head=) - 이름 · 이름표(RF.applyHead, 3D 와 같게)
            RF.applyHead(c, hn, tt);
            RF.showName($("name"), c.course.name, true);
            nameLevel();
            favBtn.refresh();
            // 산불조심기간 안내(하루 한 번 - 2026-10-15 홍TV님)
            var fire = RF.fireNote(Date.now()), today0 = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
            try { if (fire && localStorage.getItem("rf-fire") !== today0) { localStorage.setItem("rf-fire", today0); setTimeout(function () { toast(fire, 9000); }, 7000); } } catch (e) { /* 이번만 */ }
            // ⛑️ 오늘의 산행 안전(api/safety - 2026-10-18 홍TV님): 들머리 자리의 내 지역 특보 · 산불위험 높음 이상 · 자외선 8 이상일 때만, 그 지역(시도) 하루 한 번
            if (c.lat && c.lat.length) fetch("api/safety?lat=" + (+c.lat[0]).toFixed(4) + "&lon=" + (+c.lon[0]).toFixed(4)).then(function (x) { return x.json(); }).then(function (j) {
                var msg = my === loadSeq && RF.safetyAlert(j, Date.now(), EN), k = "rf-safe-" + today0 + "-" + ((j && j.sido) || "");
                if (!msg || lsGet("rf-safe") === k) return;
                try { localStorage.setItem("rf-safe", k); } catch (e) { /* 이번만 */ }
                setTimeout(function () { if (my === loadSeq) toast(msg + T(" - 별거 별거 › 산행 안전에서 자세히", " - details in Handy tools › Hiking safety"), 10000); }, 17000);
            }).catch(function () { /* 안전 정보 없이 */ });
            document.title = RF.nameText(c.course.name, true);   // 길만 - "- routefly" 를 붙이면 탭 · 최근 앱 목록에서 잘림(2026-10-12 홍TV님)
            if ((parts ? r[0] : [r[0]]).some(function (j) { return j && j.course && RF.isClosedTrail(j.course.name); })) toast(T("⚠ 비법정탐방로(통제구역)입니다. 국립공원 지정 탐방로가 아니라 출입이 금지된 길이니 따라가지 마세요.", "⚠ Closed trail (restricted area). This is not an official national park trail and entry is banned - do not follow it."), 12000);   // 링크로 바로 연 경우(목록에는 안 나옴)
            else {   // 정상 미포함 · 자료가 끊긴 구간 · 공단 기준 시간을 한 알림에(2026-10-30 점검: 앞 것이 뜨면 뒤 것이 가려졌음)
                var warns = [], gp = RF.shownGaps(c)[0], inf = RF.infoText(c.info, c.total);
                if (c.course && c.course.summit_miss) warns.push(T("⚠ 이 코스 선은 이름의 " + c.course.summit_miss + " 정상까지 가지 않습니다(정상 미포함 - 자료의 선 그대로). 정상은 현지 길 · 안내판을 따르세요.",
                    "⚠ This trail line does not reach the summit (" + NM(c.course.summit_miss) + ") in its name. Follow the local signs to the top."));
                if (gp) warns.push(T("⚠ 이 코스 자료에 " + gp.m + "m 끊긴 구간이 있습니다(" + km(gp.at) + "km 지점). 그 구간은 현지 안내판 · 길을 따르세요.",
                    "⚠ This trail's data has a " + gp.m + " m gap (at " + km(gp.at) + " km). Follow the local signs there."));
                if (inf) warns.push(inf);
                if (warns.length) toast(warns.join("\n"), warns.length > 1 || warns[0] !== inf ? 12000 : 6000);
            }
            // 그 산의 입산 · 통제 · 예약(data/park-notes.json - 2026-10-12 한라산: 오늘 계절 · 이 코스의 통제 지점 시각)
            // 코스 이름은 받은 그대로(자르거나 이은 코스도 원래 이름 - "성판악 탐방로")
            var rawNames = (parts ? r[0] : [r[0]]).map(function (j) { return j && j.course && j.course.name; });
            var noteOf = RF.parkOf(c.course.name) || RF.mountainOf(c.course.name, id) || RF.parkOf(rawNames[0] || "") || RF.mountainOf(rawNames[0] || "", id);
            rules = null;
            $("access").hidden = true;
            if (noteOf) jsonOnce("data/park-notes.json").then(function (d) {
                var n = d && d.parks && d.parks[noteOf];
                if (!n || my !== loadSeq) return;
                // 공단 교통편(park-notes access - 2026-10-14 홍TV님: 가야산1코스 치인대형주차장 → 토신골탐방지원센터). 이은 코스는 첫 코스 것
                var acc = RF.courseAccess(d.parks, String(id).split(",")[0].replace(/[~@].*$/, ""));
                if (acc) {
                    $("accessCar").textContent = acc.car ? "🚗 " + NM(acc.car) : "";
                    $("accessLink").hidden = !acc.url;
                    if (acc.url) $("accessLink").href = acc.url;
                    $("access").hidden = false;
                }
                if (n.names) {   // 산마다 다른 이름(지리산 중산리 → 중산리탐방지원센터) - 제목 · 끝 이름표
                    c.course.name = RF.aliasName(c.course.name, n.names);
                    // 이름표도(끝 이름표 · 지명 - 설악산 신흥사 → 소공원)
                    (c.pois || []).forEach(function (q) {
                        if (Object.prototype.hasOwnProperty.call(n.names, q.name) && !(+q.off_route_m > 300) && (+q.dist_m < 300 || +q.dist_m > c.total - 300)) q.name = n.names[q.name];
                    });
                    RF.showName($("name"), c.course.name, true);
                    nameLevel();
                    document.title = RF.nameText(c.course.name, true);
                }
                if (n.ele) (c.pois || []).forEach(function (q) { if (n.ele[q.name] != null) q.ele_m = n.ele[q.name]; });   // 바로잡은 높이(천왕봉 1,915m)
                if (!n.short) return;
                rules = RF.parkRules(n, rawNames.concat([c.course.name]), new Date());
                toast("⚠ " + NM(noteOf) + " " + (RF.rulesText(rules) || (EN ? "Check entry rules and closures on the park website." : n.short)), 12000);
            }).catch(function () { /* 안내 없이 */ });
            // 국립공원 코스면 공원 전체 보기(🏞) - 그 공원 공식 탐방로 전체 · 공식 안내도 바로가기
            var park = RF.parkOf(c.course.name) || RF.mountainOf(c.course.name, id)   // 국립공원, 아니면 도립 · 군립공원 · 산
                // 둘레길("[북한산둘레길] 21구간 우이령길")도 그 공원 탐방 안내도로(🏞 만 - 통제 안내 · 지명 바꿈은 둘레길에 쓰지 않음, 2026-10-13 PC)
                || RF.parkOf(String(c.course.name).replace(/^\[?([가-힣]+)둘레길.*$/, "$1"));
            // 목록 카드로 연 것과 같은 첫 화면(위 "← 목록" · 아래 "따라가기") - back=list 없이 열면 "‹ 코스" 가 코스 미리보기(3D)로 갔음(2026-10-13 홍TV님)
            parkHref = park ? "park.html?name=" + encodeURIComponent(park) + "&back=list" : null;
            // 탐방 안내도에서 들어온 코스(#…&via=park)만 - 검색 목록에서 바로 연 코스에는 안 보임(2026-10-13 홍TV님)
            if (!/[#&]via=park(&|$)/.test(location.hash)) parkHref = null;
            // 노선 안내도(지리산둘레길 · 자전거길 …)에서 들어왔으면 그 안내도로(#…&guide=route.html?…) - 이 사이트의 안내도 화면만
            var gm = /[#&]guide=([^&]*)/.exec(location.hash), guide = gm ? RF.safeDecode(gm[1]) : "";
            if (/^(route|park)\.html\?[^#<>"']*$/.test(guide)) parkHref = guide;
            // 지도 위 🏞 는 안내도를 거치지 않고 바로 들어온 코스에만(안내도에서 왔으면 아래 "← 안내도" 가 있음 - 2026-10-13 홍TV님)
            $("parkBtn").style.display = park && !parkHref && !/[#&]via=map(&|$)/.test(location.hash) ? "block" : "none";
            if (park) $("parkBtn").href = "park.html?name=" + encodeURIComponent(park) + "&from=" + encodeURIComponent(id);
            $("parkGo").style.display = parkHref && !hike.running ? "" : "none";
            barFit();
            setKindWords();
            drawCourse();
            prof = RF.profile($("profile"), c, { gaps: RF.shownGaps(c) });
            boardBtn();
            $("save").textContent = offlineIds().indexOf(id) >= 0 ? T("✅ 저장됨", "✅ Saved") : T("📥 저장", "📥 Save");
            // 이름 없이 저장된 예전 코스 - 열 때 이름을 채움(첫 화면 저장 목록)
            if (offlineIds().indexOf(id) >= 0 && !offlineNames()[id]) setOfflineName(id, { name: String(c.course.name || ""), dist: Math.round(c.total || 0) });
            // 이 기기에 남은 산행 기록(새로 고침 · 화면 꺼짐 뒤에도 이어서)
            var saved = loadSaved();
            hike.d = saved ? saved.d : 0;
            render();
            if (saved && saved.t && Date.now() - saved.t < RESUME_MS && safetyOk()) {
                // 길찾기 · 전화 등으로 나갔다가 화면이 다시 열림 - 기다리지 않고 바로 이어서 안내
                start(false);
                toast(T("진행 중이던 " + K().act + "을 이어서 안내합니다(" + km(saved.d) + "km).", "Resuming your " + K().act.toLowerCase() + " (" + km(saved.d) + " km)."), 5000);
            } else if (saved) {
                $("go").textContent = T("이어서 " + K().act, "Resume " + K().act.toLowerCase());
                toast(T("진행 중이던 기록이 있습니다(" + km(saved.d) + "km). \"이어서 " + K().act + "\" 버튼을 누르세요.", "You have an unfinished " + K().act.toLowerCase() + " (" + km(saved.d) + " km). Tap \"Resume\"."), 5000);
            }
        }).catch(function (e) {
            if (my !== loadSeq) return;
            // 배치를 다시 돌려 코스 번호가 바뀐 예전 링크 · 기록 - 같은 산 코스를 골라 보여 줍니다
            var similar = e.data && e.data.similar || [];
            showPick(similar.length > 0);   // 같은 산 목록을 보여 줄 때는 마지막 검색을 다시 하지 않습니다(늦게 온 검색이 덮어씀)
            if (similar.length) { pickSeq++; listCourses(similar, null, T("이 코스는 자료가 새로 바뀌어 번호가 달라졌습니다. 같은 산의 코스에서 골라 주세요.", "This trail's data was updated and its number changed. Pick it again from this mountain's trails.")); }
            else toast(T("코스를 불러오지 못했습니다: ", "Could not load the trail: ") + e.message, 6000);
        });
    }

    function saveKey() { return "rf-hike-" + c.id; }

    function loadSaved() {
        try {
            var s = JSON.parse(localStorage.getItem(saveKey()) || "null");
            return s && Date.now() - s.start < 24 * 3600 * 1000 ? s : null;   // 하루 지난 기록은 버립니다
        } catch (e) {
            return null;
        }
    }

    function save() {
        if (hike.sim) return;
        try { localStorage.setItem(saveKey(), JSON.stringify({ start: hike.start, d: hike.d, walked: hike.walked, d0: hike.d0, dMax: hike.dMax,
                                                        base: hike.base, rev: !!c.rev, segT0: hike.segT0, t: Date.now() }));
              localStorage.setItem(ACTIVE_KEY, c.id); } catch (e) { /* 저장 못 해도 산행은 계속 */ }
    }

    /**
     * 걷는 중인 코스 ID - 길찾기(카카오맵 등)로 나갔다가 이 화면이 닫혀도, 주소 없이 다시 열면 그 코스로 이어 가려고.
     * 산행을 끝내면 지웁니다.
     */
    var ACTIVE_KEY = "rf-hike-active";

    /** 2026-10-09 점검: 하루 지나 이어 할 수 없는 산행 저장분(rf-hike-<코스> · -track · -notes)을 처음에 지웁니다(쌓여 저장 공간을 채움). */
    (function purgeOldHikes() {
        try {
            var old = [];
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (!/^rf-hike-/.test(k) || k === ACTIVE_KEY || /-(track|notes)$/.test(k)) continue;
                var v = null;
                try { v = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { /* 깨진 값도 지움 */ }
                if (!v || !(Date.now() - v.start < 24 * 3600 * 1000)) old.push(k);
            }
            old.forEach(function (k) { localStorage.removeItem(k); localStorage.removeItem(k + "-track"); localStorage.removeItem(k + "-notes"); });
        } catch (e) { /* 다음에 */ }
    })();
    var RESUME_MS = 3 * 3600 * 1000;   // 마지막 위치 저장이 이보다 오래되면 저절로 이어 가지 않고 단추로

    function clearSaved() {
        try {
            localStorage.removeItem(saveKey());
            localStorage.removeItem(saveKey() + "-track");
            localStorage.removeItem(saveKey() + "-notes");
            if (localStorage.getItem(ACTIVE_KEY) === c.id) localStorage.removeItem(ACTIVE_KEY);
        } catch (e) { /* 무시 */ }
    }

    // ------------------------------------------------------------------ 기록(걸은 길) · GPX

    function loadTrack() {
        try { return JSON.parse(localStorage.getItem(saveKey() + "-track") || "[]"); } catch (e) { return []; }
    }

    /** 걸은 자리 하나 - 8m 넘게 움직였거나 1분 지났을 때만(배터리 · 저장 공간 아끼게). */
    function addTrack(lat, lon, t, alt) {
        var last = hike.track[hike.track.length - 1];
        if (last) {
            var d = RF.distM(last[0], last[1], lat, lon);
            if (d < 8 && t - last[2] < 60000) return;
            // GPS 튐(한 번에 300m 넘게)은 거리에 넣지 않습니다. 단 걸어서 갈 만한 빠르기면 넣음 - 2026-10-23 지리산: 크롬은 화면이 꺼지면
            // 위치가 끊겨 점 사이가 수 km 벌어졌고, 그것을 모두 빼 12km 산행이 2.02km 로 나왔음(튄 위치는 onFix 에서 먼저 버림)
            var dt = (t - last[2]) / 1000;
            if (d < 300 || (dt > 0 && d / dt <= (K() === RF.KINDS.bike ? 25 : 3))) hike.walked += d;
        }
        hike.track.push([Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6, Math.round(t), alt == null ? null : Math.round(alt)]);
        // 2026-10-09 점검: 점마다 기록 전체를 다시 쓰면 긴 산행에서 점점 무거워집니다(점 n 개면 n² 글자) -
        // 10점 또는 30초마다, 그리고 화면이 가려질 때(flushTrack) 씁니다. 잃어도 마지막 30초 남짓입니다.
        if (hike.track.length % 10 === 0 || t - (hike.trackSavedT || 0) > 30000) flushTrack();
    }

    function flushTrack() {
        if (hike.sim || !c || !hike.track.length) return;
        hike.trackSavedT = now();
        try {
            localStorage.setItem(saveKey() + "-track", JSON.stringify(hike.track));
        } catch (e) {   // 공간이 모자라도 산행은 계속 - 한 번만 알립니다
            if (!hike.trackFull) { hike.trackFull = true; toast(T("핸드폰 저장 공간이 모자라 걸은 길을 저장하지 못했습니다. 내 기록에서 지난 기록을 지워 주세요.", "Phone storage is full, so your track could not be saved. Delete old records in My records."), 7000); }
        }
    }

    /**
     * 내 기록 목록. 2026-10-09 점검: 걸은 길이 든 기록 20개를 localStorage(5MB 남짓)에 두면 긴 자전거 기록 몇 개로 차서
     * 예전 기록이 말없이 지워졌습니다 - IndexedDB("rf-records", 사진과 같은 방식)로 옮깁니다. 화면은 메모리 사본(recCache)을 읽고,
     * 바꿀 때 IndexedDB 에 씁니다. 예전 localStorage 기록은 처음 한 번 옮기고 지웁니다. IndexedDB 가 없으면 예전처럼.
     */
    var REC_LS = "rf-records", REC_MAX = 30, recCache = [];
    function recLs() { try { return JSON.parse(localStorage.getItem(REC_LS) || "[]"); } catch (e) { return []; } }
    function recTx(mode, fn) {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error("no indexedDB")); return; }
            var r = indexedDB.open("rf-records", 1);
            r.onupgradeneeded = function () { r.result.createObjectStore("r"); };
            r.onerror = function () { reject(r.error); };
            r.onsuccess = function () {
                // 2026-10-10 점검: transaction 이 던지면(저장소 없음 · 닫힘) 약속이 끝나지 않아 기록 화면이 멈췄습니다 - 실패로 돌려줌
                var db = r.result;
                try {
                    var tx = db.transaction("r", mode), out = fn(tx.objectStore("r"));
                    tx.oncomplete = function () { db.close(); resolve(out && out.result); };
                    tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error("기록 저장이 취소되었습니다.")); };
                } catch (e) { db.close(); reject(e); }
            };
        });
    }
    var recordsReady = recTx("readonly", function (st) { return st.get("list"); }).then(function (list) {
        if (Array.isArray(list)) { recCache = list; return; }
        recCache = recLs();   // 처음 - 예전 기록을 옮김
        if (!recCache.length) return;
        return recTx("readwrite", function (st) { st.put(recCache, "list"); }).then(function () {
            try { localStorage.removeItem(REC_LS); } catch (e) { /* 다음에 다시 */ }
        });
    }).catch(function () { recCache = recLs(); });

    function records() { return recCache.slice(); }

    /** 기록 목록을 바꿉니다. 저장에 실패하면 알립니다(예전에는 말없이 5개만 남겼음). */
    function writeRecords(list) {
        recCache = list.slice(0, REC_MAX);
        return recTx("readwrite", function (st) { st.put(recCache, "list"); }).catch(function () {
            try {
                localStorage.setItem(REC_LS, JSON.stringify(recCache));
            } catch (e) {
                toast(T("핸드폰 저장 공간이 모자라 기록을 저장하지 못했습니다. 지난 기록을 GPX 로 보내 두고 지워 주세요.", "Phone storage is full, so the record could not be saved. Export old records as GPX and delete them."), 8000);
            }
        });
    }

    // 내 기록 → 코스로 올리기(관리자만, 2026-10-31 홍TV님). 서버가 점만 다시 써 올림 폴더에 두면 배치(courseImport)가 매시 :07 에 코스로
    var upOwner = false, upOwnerP = null;
    /**
     * 올리기 전 앞 · 뒤 자르기(관리자만, 2026-10-31 홍TV님 "앱 안에서 자르는 기능 지금 만들어 줘") - 집 앞 · 주차장 가는 길 등을 뺌.
     * 선 그림(남는 길 파랑 · 자를 길 회색, 출발 초록 · 도착 빨강)과 밀대 둘. 남은 점 [위도, 경도, 시각, 높이] 로 resolve, 취소면 null.
     */
    function trimSheet(r) {
        return new Promise(function (done) {
            var t = r.track || [], full = RF.trimTrack(t, 0, 0), step = full.total > 5000 ? 50 : 10;
            var wrap = document.createElement("div");
            wrap.setAttribute("role", "dialog");
            wrap.setAttribute("aria-label", T("앞 · 뒤 자르기", "Trim start and end"));
            wrap.style.cssText = "position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:12px";
            var box = document.createElement("div");
            box.style.cssText = "background:#1b2430;color:#e9eef4;border-radius:14px;padding:14px;width:min(440px,100%);max-height:96vh;overflow:auto;font-size:15px";
            box.innerHTML = '<b style="font-size:17px">' + T("✂️ 앞 · 뒤 자르기", "✂️ Trim start and end") + '</b>'
                + '<p class="tip" style="margin:6px 0">' + T("집 앞 · 주차장 · 들머리 가는 길처럼 코스가 아닌 부분을 빼 주세요. 파란 선만 올라갑니다.", "Remove parts that aren't the course (home, parking, approach). Only the blue line is uploaded.") + '</p>'
                + (window.maplibregl && cfg ? '<div class="tmap" style="width:100%;height:min(52vh,360px);border-radius:10px;overflow:hidden"></div>' : "")
                + '<svg viewBox="-6 -6 112 112" style="width:100%;height:auto;background:#0f1720;border-radius:10px' + (window.maplibregl && cfg ? ";display:none" : "") + '"></svg>'
                + '<label style="display:block;margin-top:10px">' + T("앞에서 자르기", "Cut from start") + ' <b class="c0"></b><input type="range" class="r0" min="0" step="' + step + '" style="width:100%"></label>'
                + '<label style="display:block;margin-top:6px">' + T("뒤에서 자르기", "Cut from end") + ' <b class="c1"></b><input type="range" class="r1" min="0" step="' + step + '" style="width:100%"></label>'
                + '<p class="kept" style="margin:8px 0;font-weight:bold"></p>'
                + '<p style="display:flex;gap:8px;margin:0"><button type="button" class="no" style="flex:1">' + T("취소", "Cancel") + '</button><button type="button" class="go main" style="flex:1">' + T("다음", "Next") + '</button></p>';
            wrap.appendChild(box);
            document.body.appendChild(wrap);
            var svg = box.querySelector("svg"), r0 = box.querySelector(".r0"), r1 = box.querySelector(".r1");
            r0.max = r1.max = Math.max(0, Math.floor(full.total / step) * step);
            r0.value = r1.value = 0;
            var lat0 = t.reduce(function (a, p) { return a + p[0]; }, 0) / Math.max(1, t.length), kx = Math.cos(lat0 * Math.PI / 180);
            var xs = t.map(function (p) { return p[1] * kx; }), ys = t.map(function (p) { return -p[0]; });
            var minX = Math.min.apply(null, xs), minY = Math.min.apply(null, ys), w = Math.max(Math.max.apply(null, xs) - minX, 1e-6), h = Math.max(Math.max.apply(null, ys) - minY, 1e-6), S = 100 / Math.max(w, h);
            function X(i) { return ((xs[i] - minX) * S + (100 - w * S) / 2).toFixed(2); }
            function Y(i) { return ((ys[i] - minY) * S + (100 - h * S) / 2).toFixed(2); }
            function path(a, b) { var d = ""; for (var i = a; i <= b; i++) d += (i > a ? "L" : "M") + X(i) + " " + Y(i); return d; }
            var res = null, tm = null;
            // 배경 지도(2026-10-31 홍TV님 "지도 깔아줘") - 따라가기 지도와 같은 바탕, 끌기 · 확대 됨. 못 띄우면 선 그림(svg)
            function geo(a, b) { var c = []; for (var i = a; i <= b; i++) c.push([t[i][1], t[i][0]]); return { type: "Feature", geometry: { type: "LineString", coordinates: c } }; }
            function pt(i, k) { return { type: "Feature", properties: { k: k }, geometry: { type: "Point", coordinates: [t[i][1], t[i][0]] } }; }
            if (box.querySelector(".tmap")) {
                try {
                    var lo = t.map(function (p) { return p[1]; }), la = t.map(function (p) { return p[0]; });
                    tm = new maplibregl.Map({ container: box.querySelector(".tmap"), style: buildStyle(cfg), attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
                        bounds: [[Math.min.apply(null, lo), Math.min.apply(null, la)], [Math.max.apply(null, lo), Math.max.apply(null, la)]], fitBoundsOptions: { padding: 28 } });
                    tm.touchZoomRotate.disableRotation();
                    tm.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
                    var bb = [[Math.min.apply(null, lo), Math.min.apply(null, la)], [Math.max.apply(null, lo), Math.max.apply(null, la)]];
                    tm.on("load", function () {
                        // 처음 열 때 선 전체에 맞춤 - 창이 막 붙은 때라 크기가 덜 잡혀 출발점이 밖으로 벗어나 보였음(2026-10-31 PC)
                        tm.resize();
                        tm.fitBounds(bb, { padding: 28, duration: 0 });
                        tm.addSource("tAll", { type: "geojson", data: geo(0, t.length - 1) });
                        tm.addSource("tKeep", { type: "geojson", data: geo(0, t.length - 1) });
                        tm.addSource("tEnds", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
                        tm.addLayer({ id: "tAll", type: "line", source: "tAll", paint: { "line-color": "#8a95a5", "line-width": 4, "line-dasharray": [1.5, 1] } });
                        tm.addLayer({ id: "tKeep", type: "line", source: "tKeep", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#22b8cf", "line-width": 5 } });
                        tm.addLayer({ id: "tEnds", type: "circle", source: "tEnds", paint: { "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fff",
                            "circle-color": ["match", ["get", "k"], "s", "#2ecc71", "#ff4d4f"] } });
                        draw();
                    });
                } catch (e) {   // 지도를 못 띄우면 선 그림으로
                    tm = null;
                    box.querySelector(".tmap").remove();
                    svg.style.display = "";
                }
            }
            function draw() {
                if (+r0.value + +r1.value > full.total - step) { if (this === r0) r0.value = Math.max(0, full.total - step - r1.value); else r1.value = Math.max(0, full.total - step - r0.value); }
                res = RF.trimTrack(t, +r0.value, +r1.value);
                box.querySelector(".c0").textContent = km(+r0.value) + " km";
                box.querySelector(".c1").textContent = km(+r1.value) + " km";
                box.querySelector(".kept").textContent = T("올릴 길 ", "Kept ") + km(res.kept) + " / " + km(full.total) + " km";
                var html = '<path d="' + path(0, t.length - 1) + '" fill="none" stroke="#5b6675" stroke-width="1.6" stroke-linejoin="round"/>';
                if (res.track.length) {
                    html += '<path d="' + path(res.from, res.to) + '" fill="none" stroke="#22b8cf" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>'
                        + '<circle cx="' + X(res.from) + '" cy="' + Y(res.from) + '" r="3" fill="#2ecc71" stroke="#fff" stroke-width=".8"/>'
                        + '<circle cx="' + X(res.to) + '" cy="' + Y(res.to) + '" r="3" fill="#ff4d4f" stroke="#fff" stroke-width=".8"/>';
                }
                svg.innerHTML = html;
                if (tm && tm.getSource("tKeep")) {
                    tm.getSource("tKeep").setData(res.track.length ? geo(res.from, res.to) : { type: "FeatureCollection", features: [] });
                    tm.getSource("tEnds").setData({ type: "FeatureCollection", features: res.track.length ? [pt(res.from, "s"), pt(res.to, "e")] : [] });
                }
                box.querySelector(".go").disabled = res.track.length < 2;
            }
            function close(v) { if (tm) tm.remove(); wrap.remove(); done(v); }
            r0.addEventListener("input", draw);
            r1.addEventListener("input", draw);
            box.querySelector(".no").onclick = function () { close(null); };
            box.querySelector(".go").onclick = function () { close(res && res.track.length >= 2 ? res.track : null); };
            wrap.addEventListener("keydown", function (e) { if (e.key === "Escape") close(null); });
            draw();
            r0.focus();
        });
    }

    function uploadCourse(r0) {
        var r = r0;
        trimSheet(r0).then(function (kept) {
            if (!kept) return;
            r = { name: r0.name, kind: r0.kind, start: r0.start, track: kept };   // 자른 길만 · 사진 메모 없이
            return goUpload();
        });
        function goUpload() { return hAskText(T("코스로 올릴 이름(목록에 이대로 보임)\n예: 송산 · 송산리 마을회관 → 송산 정상", "Course name as shown in the list\ne.g. Songsan · village hall → summit"), NM(r.name), { ok: T("다음", "Next") }).then(function (name) {
            name = String(name || "").trim();
            if (!name) return;
            var kind = /^(hike|walk|bike)$/.test(r.kind) ? r.kind : "hike";
            return hAsk(T("\"" + name + "\" 을(를) routefly 코스로 올릴까요?\n\n누구나 보는 코스가 됩니다. 앞 단계에서 자른 부분은 올라가지 않습니다.\n시각 · 사진 메모는 올라가지 않고 선 모양만 올라갑니다. 1시간 안(매시 7분)에 코스 목록에 들어갑니다.",
                "Upload \"" + name + "\" as a routefly course?\n\nEveryone will see it. The parts you trimmed are not uploaded.\nOnly the line is uploaded - no times or photo notes. It appears in the list within an hour (at :07)."), { ok: T("올리기", "Upload") }).then(function (ok) {
                if (!ok) return;
                return fetch("api/course-upload", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ name: name, kind: kind, gpx: toGpx(r) }) })
                    .then(function (res) { return res.json().catch(function () { return { success: false, message: "HTTP " + res.status }; }); })
                    .then(function (j) {
                        if (!j || j.success === false) throw new Error(j && j.message || "?");
                        toast(T("⬆ 올렸습니다 - 1시간 안(매시 7분)에 코스 목록에 들어갑니다. 코스 ID " + j.id, "⬆ Uploaded - it appears within an hour (at :07). Course ID " + j.id), 8000);
                    });
            });
        }).catch(function (e) { toast(T("올리지 못했습니다: ", "Upload failed: ") + (e && e.message || e), 6000); }); }
    }

    /** 순수 함수 - 기록 → GPX 1.1 글. */
    function toGpx(rec) {
        var esc = function (x) { return String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
        var pts = rec.track.map(function (p) {
            return '<trkpt lat="' + p[0] + '" lon="' + p[1] + '">' + (p[3] != null ? "<ele>" + p[3] + "</ele>" : "")
                + "<time>" + new Date(p[2]).toISOString() + "</time></trkpt>";
        }).join("\n");
        // 2026-10-08: 사진 · 메모는 지점(wpt)으로 - 이름은 메모 앞 30자(없으면 "사진"), 사진 자체는 GPX 에 넣지 않습니다
        var wpts = (rec.notes || []).map(function (n) {
            var nm = n.text ? n.text.replace(/\s+/g, " ").slice(0, 30) : "사진";
            return '<wpt lat="' + n.lat + '" lon="' + n.lon + '">' + (n.ele != null ? "<ele>" + n.ele + "</ele>" : "")
                + "<time>" + new Date(n.t).toISOString() + "</time><name>" + esc(nm) + "</name>"
                + (n.text ? "<desc>" + esc(n.text) + "</desc>" : "") + (n.photo ? "<type>photo</type>" : "") + "</wpt>";
        }).join("\n");
        return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="routefly" xmlns="http://www.topografix.com/GPX/1/1">\n'
            + "<metadata><name>" + esc(rec.name) + "</name><time>" + new Date(rec.start).toISOString() + "</time></metadata>\n"
            + (wpts ? wpts + "\n" : "")
            + "<trk><name>" + esc(rec.name) + "</name><type>" + esc(rec.kind || "hike") + "</type><trkseg>\n" + pts + "\n</trkseg></trk>\n</gpx>\n";
    }

    /** 공유 창으로 파일을 보낼 수 있는가(앱 · 핸드폰 브라우저). 단추 이름에만 씁니다. */
    function canShareFiles() {
        if (FS && SHARE) return true;
        try { return !!(navigator.canShare && navigator.canShare({ files: [new File(["x"], "a.txt", { type: "text/plain" })] })); } catch (e) { return false; }
    }

    /** 파일 이름 조각 - 코스 이름에서 / \\ : * ? " < > | · 공백을 _ 로, 40자까지(앱 저장 경로 · 핸드폰 파일 이름 한도). */
    function gpxSlug(rec) {
        var n = String(NM(rec.name || "") || "").replace(/[\\/:*?"<>|.\s·~,]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
        return n || "track";
    }

    function downloadGpx(rec) {
        var d = new Date(rec.start);
        var name = "routefly-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0")
            + "-" + gpxSlug(rec) + ".gpx";
        // 2026-10-23 홍TV님 지리산: 이은 코스 ID(구간 5개)를 그대로 넣어 파일 이름이 250자를 넘어 앱 · 크롬에서 저장이 안 됐음
        if (FS && SHARE) {   // 앱 - 공유 창으로(파일 저장 · 다른 앱으로 보내기)
            nativeShareFile(name, btoa(unescape(encodeURIComponent(toGpx(rec)))), rec.name)
                .catch(function (e) { toast(T("GPX 를 보내지 못했습니다: ", "Could not send the GPX: ") + (e && e.message || e), 5000); });
            return;
        }
        // 핸드폰 브라우저 - 공유 창(카카오톡 · 메일 · 드라이브 · 다른 등산 앱 …). 브라우저마다 받는 파일 종류가 달라 되는 것으로
        var text = toGpx(rec), file = null;
        if (navigator.canShare) {
            ["application/gpx+xml", "application/xml", "text/xml", "text/plain"].some(function (type) {
                var f = new File([text], name, { type: type });
                try { if (navigator.canShare({ files: [f] })) { file = f; return true; } } catch (e) { /* 다음 종류 */ }
                return false;
            });
        }
        if (file) {
            navigator.share({ files: [file], title: NM(rec.name), text: NM(rec.name) + T(" - routefly 기록", " - routefly record") }).catch(function (e) {
                if (e && e.name === "AbortError") return;   // 사용자가 닫음
                saveFile(text, name);   // 공유가 막히면 내려받기로
            });
            return;
        }
        saveFile(text, name);
    }

    /**
     * 기록 공유 카드(2026-10-14 홍TV님) - 지나온 선 · 거리 · 시간 · 오른 높이 · 고도 그래프를 그림 한 장(1080×1350)으로.
     * 지도 그림은 넣지 않고(받아 오는 데 오래 걸리고 출처 표시가 필요) 선만 그립니다. 핸드폰 안에서 만들고 이용자가 고른 앱으로만 보냅니다.
     */
    /** 카드의 "가장 높은 곳" 을 정상 공식 높이로(100대 명산 자리 · 공식 높이 - 처음 한 번 받아 둠). */
    var cardPeaks = { peaks: null, elev: null };
    jsonOnce("data/mountains100.json").then(function (d) { cardPeaks.peaks = (d && d.peaks) || []; }, function () { /* 없으면 GPS 높이 */ });
    jsonOnce("data/peak-elev.json").then(function (d) { cardPeaks.elev = (d && d.elev) || null; }, function () { /* 없으면 GPS 높이 */ });
    function recordCard(rec) {
        var rc = RF.recordCourse(rec), W = 1080, H = 1350, P = 72;
        var cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        var g = cv.getContext("2d");
        var bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, "#16202b"); bg.addColorStop(1, "#0b1016");
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        g.textBaseline = "alphabetic"; g.textAlign = "left";
        g.font = "bold 44px sans-serif"; g.fillStyle = "#e9eef4"; g.fillText("route", P, P + 30);
        var rw = g.measureText("route").width;
        g.fillStyle = "#ffb703"; g.fillText("fly", P + rw, P + 30);
        var d = new Date(rec.start);
        g.font = "30px sans-serif"; g.fillStyle = "#9aa6b4"; g.textAlign = "right";
        g.fillText(d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate(), W - P, P + 30);
        g.textAlign = "left"; g.font = "bold 52px sans-serif"; g.fillStyle = "#ffffff";
        g.fillText(String(NM(rec.name) || ""), P, P + 120, W - P * 2);   // 산 이름까지(가야산 · 해인사 → 상왕봉)
        // 지나온 선
        var top = P + 160, boxH = 640;
        var pts = RF.fitPath(rc.lat, rc.lon, W - P * 2, boxH, 30);
        g.fillStyle = "rgba(255,255,255,0.04)"; g.fillRect(P, top, W - P * 2, boxH);
        if (pts.length > 1) {
            g.save(); g.translate(P, top);
            g.lineJoin = "round"; g.lineCap = "round";
            // 위치가 끊긴 구간(rc.gap - 크롬 화면 꺼짐 등)은 가는 점선, 나머지는 굵은 선(2026-10-28 PC)
            g.beginPath(); pts.forEach(function (q, i) { if (i && !rc.gap[i]) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
            g.strokeStyle = "rgba(56,217,234,0.25)"; g.lineWidth = 22; g.stroke();
            g.strokeStyle = "#38d9ea"; g.lineWidth = 9; g.stroke();
            g.beginPath(); pts.forEach(function (q, i) { if (i && rc.gap[i]) { g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(q[0], q[1]); } });
            g.setLineDash([14, 14]); g.strokeStyle = "rgba(56,217,234,0.55)"; g.lineWidth = 5; g.stroke(); g.setLineDash([]);
            [[pts[0], "#2fb344"], [pts[pts.length - 1], "#ff5c5c"]].forEach(function (e) {
                g.beginPath(); g.arc(e[0][0], e[0][1], 16, 0, Math.PI * 2); g.fillStyle = e[1]; g.fill();
                g.lineWidth = 5; g.strokeStyle = "#fff"; g.stroke();
            });
            g.restore();
        }
        // 숫자
        var eles = rc.ele.filter(function (e) { return e != null; }), high = RF.recordHighest(rc, cardPeaks.peaks, cardPeaks.elev);
        // 거리: 걸은 거리와 코스 진행 가운데 큰 값(2026-10-28 PC: 화면이 꺼져 위치가 끊긴 옛 기록은 걸은 거리가 짧게 남음 - 12km 산행이 5.45km)
        var stats = [[T("거리", "Distance"), km(RF.recDist(rec)) + " km"], [T("시간", "Time"), RF.hm(rec.end - rec.start, true)]]
            .concat(rec.up != null ? [[T("오른 높이", "Climb"), num(rec.up) + " m"]] : [])
            .concat(high != null ? [[T("가장 높은 곳", "Highest"), num(high) + " m"]] : []);
        var sy = top + boxH + 70, cw = (W - P * 2) / stats.length;
        stats.forEach(function (s, i) {
            var x = P + cw * i;
            g.font = "28px sans-serif"; g.fillStyle = "#9aa6b4"; g.fillText(s[0], x, sy);
            g.font = "bold 50px sans-serif"; g.fillStyle = "#ffffff"; g.fillText(s[1], x, sy + 62, cw - 16);
        });
        // 고도 그래프
        var gy = sy + 110, gh = H - gy - P - 50;
        if (eles.length > 1 && gh > 60 && rc.total > 0) {
            var lo = Math.min.apply(null, eles), hi = Math.max.apply(null, eles), span = Math.max(hi - lo, 50), gw = W - P * 2;
            g.beginPath(); g.moveTo(P, gy + gh);
            rc.ele.forEach(function (e, i) { if (e != null) g.lineTo(P + rc.dist[i] / rc.total * gw, gy + gh - (e - lo) / span * gh); });
            g.lineTo(P + gw, gy + gh); g.closePath();
            g.fillStyle = "rgba(56,217,234,0.18)"; g.fill();
        }
        g.font = "26px sans-serif"; g.fillStyle = "#6f7c8a";
        g.fillText(T("routefly - 등산 · 걷기 · 자전거 코스", "routefly - hiking · walking · cycling trails in Korea"), P, H - P + 20);
        return cv;
    }

    /** 카드를 공유 창으로(앱은 공유 창, 브라우저는 navigator.share - 안 되면 내려받기). */
    function shareCard(rec) {
        shareCanvas(recordCard(rec), "routefly-" + stamp(rec.start) + ".png", NM(rec.name) + " - routefly");
    }
    /** 그림을 공유 창으로(기록 카드 · 결산 카드). */
    function shareCanvas(cv, name, text) {
        cv.toBlob(function (blob) {
            if (!blob) { toast(T("카드를 만들지 못했습니다.", "Could not make the card."), 3000); return; }
            if (FS && SHARE) {
                blobToBase64(blob).then(function (b64) { return nativeShareFile(name, b64, text); })
                    .catch(function (e) { if (!/cancel/i.test(String(e && e.message || e))) toast(T("카드를 보내지 못했습니다.", "Could not send the card."), 4000); });
                return;
            }
            var file = new File([blob], name, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], text: text }).catch(function (e) {
                    if (e && e.name === "NotAllowedError") toast(T("카드가 준비됐습니다. 한 번 더 눌러 주세요.", "The card is ready. Tap once more."), 4000);
                });
                return;
            }
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
        }, "image/png");
    }

    /** 내려받기(공유 창이 없는 컴퓨터 브라우저 등). */
    function saveFile(text, name, type) {
        var blob = new Blob([text], { type: type || "application/gpx+xml" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    // ------------------------------------------------------------------ 인증센터 도장 · 완주(2026-10-11 홍TV님 - series.html 에서 모아 봄)
    // 기록(최근 30개)과 따로 이 핸드폰에 오래 남깁니다: rf-stamps {stampKey: {name, t, course}} · rf-done {코스ID: {name, t}} · rf-peaks {peakKey: {name, t, course}}
    var STAMPS = "rf-stamps", DONE = "rf-done", NPSTAMPS = "rf-npstamps";
    // 국립공원 스탬프투어 인증지(2026-10-28 홍TV님, data/np-stamps.json - 국립공원공단 공식 목록): 지도에 🏅, 가까이 가면 다녀감을 남기고 알림
    var NPS = [];
    jsonOnce("data/np-stamps.json").then(function (j) { NPS = (j && j.stamps) || []; if (c && map) npMarks(); }).catch(function () { /* 없음 */ });
    function npMarks() {
        (npMarks.ms || []).forEach(function (m) { m.remove(); });
        npMarks.ms = RF.npStampsOn(NPS, c, 300).map(function (x) {
            var e = document.createElement("div");
            e.textContent = "🏅";
            e.title = T("국립공원 스탬프투어 인증지 - ", "National park stamp tour - ") + x.s.name;
            e.style.cssText = "font-size:20px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6))";
            return marker(e, [x.s.lon, x.s.lat], "bottom");
        });
    }
    function loadMap(key) { try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (e) { return {}; } }
    function saveMap(key, m) { try { localStorage.setItem(key, JSON.stringify(m)); } catch (e) { /* 저장 공간 - 이번에는 못 남김 */ } }

    // 100대 명산 정상 도장(2026-10-11 홍TV님) - 코스와 상관없이 정상 150m 안. 자료(data/mountains100.json)는 처음 한 번만 받아 둠, 비면 아무것도 안 함
    var PEAKS = "rf-peaks", peakList = null;
    function peakCheck(lat, lon, acc) {
        if (peakList === null) {
            peakList = [];
            jsonOnce("data/mountains100.json")
                .then(function (d) { peakList = (d && d.peaks) || []; }, function () { peakList = null; });   // 못 받으면 다음 위치 때 다시
            return;
        }
        if (!peakList.length) return;
        var have = loadMap(PEAKS), due = RF.peaksDue(peakList, lat, lon, have, RF.stampRadius(acc, 150));   // GPS 가 좋으면 40m 까지 좁힘(2026-10-16)
        if (!due.length) return;
        due.forEach(function (p) { have[RF.peakKey(p)] = { name: p.id || p.name, t: Date.now(), course: c ? c.id : null }; });
        saveMap(PEAKS, have);
        var names = due.map(function (p) { return NM((p.id || p.name) + (p.summit && p.summit !== p.name ? " " + p.summit : "")); }).join(" · ");
        toast(EN ? "⛰️ Summit stamp: " + names + " (100 Famous Mountains: " + Object.keys(have).length + ")" : "⛰️ " + names + " 정상 도장을 찍었습니다 (100대 명산 " + Object.keys(have).length + "곳)", 7000);
        say(EN ? "Summit stamp collected, " + names + "." : names + " 정상 도장을 찍었습니다.");
        if (navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 200]);
        showSummitCard(due[0]);
    }

    /** 정상 도장 카드(재미로 보는 한마디 - RF.summitCard). 같은 날 같은 산은 같은 한마디. */
    var summitShareText = "";
    function showSummitCard(p) {
        var d = new Date(), day = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
        var card = RF.summitCard(p.id || p.name, p.summit, day);
        $("summitTitle").textContent = card.title;
        $("summitLine").textContent = card.line;
        summitShareText = card.share;
        $("summitSheet").style.display = "flex";
    }

    function stampCheck(lat, lon, acc) {
        peakCheck(lat, lon, acc);
        npCheck(lat, lon, acc);
        if (!c) return;
        var have = loadMap(STAMPS), due = RF.stampsDue(c, lat, lon, have, RF.stampRadius(acc, 100));
        if (!due.length) return;
        due.forEach(function (p) { have[RF.stampKey(p.name)] = { name: p.name, t: Date.now(), course: c.id }; });
        saveMap(STAMPS, have);
        var names = due.map(function (p) { return NM(p.name); }).join(" · ");
        toast(EN ? "📮 Stamp collected: " + names + " (" + Object.keys(have).length + " in total)" : "📮 " + names + " 도장을 찍었습니다 (모두 " + Object.keys(have).length + "곳)", 7000);
        say(EN ? "Stamp collected, " + names + "." : names + " 도장을 찍었습니다.");
        if (navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 200]);
    }

    /** 국립공원 스탬프투어 인증지 가까이(100m, GPS 오차만큼 넓힘) - 다녀감을 남기고 알림. 실제 스탬프는 현장 · 공단 앱. */
    function npCheck(lat, lon, acc) {
        if (!NPS.length) return;
        var have = loadMap(NPSTAMPS), due = RF.npStampsDue(NPS, lat, lon, have, RF.stampRadius(acc, 100));
        if (!due.length) return;
        due.forEach(function (s) { have[RF.npStampKey(s)] = { park: s.park, name: s.name, t: Date.now() }; });
        saveMap(NPSTAMPS, have);
        var names = due.map(function (s) { return s.name; }).join(" · ");
        toast(T("🏅 국립공원 스탬프투어 인증지 " + names + " - 다녀감을 남겼습니다. 실제 스탬프는 여기서 스탬프북 · 국립공원 앱으로 받으세요.", "🏅 National park stamp tour spot " + names + " - visit saved. Get the official stamp here (stamp book or the park app)."), 9000);
        say(T(names + ", 국립공원 스탬프투어 인증지입니다.", names + ", a national park stamp tour spot."));
        if (navigator.vibrate) navigator.vibrate([100, 60, 100, 60, 200]);
    }

    /** 산행을 끝낼 때 - 코스를 끝까지 갔으면(90%) 완주로 남김(시험 걷기는 아님). */
    function markDone() {
        if (hike.sim || !c || RF.isGpxId(c.id) || !RF.isComplete(Math.max(hike.dMax || 0, hike.d), c.total)) return;
        var done = loadMap(DONE);
        // 여러 구간을 이어 걸었으면 구간마다 완주(도장 · 완주 화면이 구간 ID 로 셈)
        // 자른 구간(일부만 걸음)은 그 코스 완주가 아님
        var ids = RF.parseJoinId(c.id) ? RF.parseJoinId(c.id).filter(function (p) { return p.r0 == null || (p.r0 <= 0.001 && p.r1 >= 0.999); })
            .map(function (p) { return p.base; }) : [c.id];
        ids.forEach(function (one) { if (!done[one]) done[one] = { name: one === c.id ? c.course.name : c.course.name + " 중", t: Date.now() }; });
        saveMap(DONE, done);
    }

    /** 산행을 끝낼 때 - 기록을 "내 기록" 에 남기고 요약을 보여 줍니다(최근 30개만). 아주 짧거나 코스와 먼 곳이면 남기지 않습니다. */
    /** sim - 시험 걷기: 기록 · 완주 · 결산에 남기지 않고 산행 기록 창만 보여 줌(2026-10-28 PC - "다음은?" 을 시험 걷기로도 확인). */
    function finishRecord(sim) {
        if (!sim) markDone();
        if (hike.track.length < 2) return;
        if (!sim && RF.recordSkip(hike.walked, hike.track, c)) return;   // 알림 없이(2026-10-09 홍TV님)
        var rec = { courseId: c.id, name: c.course.name, kind: c.course.kind, start: hike.start, end: now(),
                    walked: Math.round(hike.walked), done: Math.round(hike.d), track: hike.track };
        if (hike.notes.length) rec.notes = hike.notes.slice();
        var ef = effort();
        rec.kcal = ef.kcal;
        rec.steps = ef.steps;
        rec.up = Math.max(ef.up, RF.trackClimb(hike.track));   // 코스 밖(새 길 · 들머리 가는 길)도 GPS 높이로(2026-10-17 송산 0m)
        rec.track = RF.fillTrackEle(c, hike.track);   // GPX 보내기에 높이 - GPS 높이가 없는 점은 코스 지형 높이로(2026-10-31 홍TV님 gpx.studio 높이 0)
        var tip = document.querySelector("#doneSheet .tip");   // 시험 걷기는 "기록은 이 핸드폰에 남습니다" 안내를 숨김(2026-10-28 PC)
        if (tip) tip.hidden = !!sim;
        $("doneTitle").textContent = sim ? T("🧪 시험 걷기 끝 - 기록은 남기지 않습니다", "🧪 Test walk done - not saved") : T(K().act + " 기록", K().act + " record");
        if (!sim) {
            recordsReady.then(function () {
                var list = records();
                list.unshift(rec);
                return writeRecords(list);
            }).then(gcPhotos).then(keepStorage);
            addLog([RF.logEntry(rec)]);   // 30개 밖으로 밀려난 기록의 사진
        }
        var sum = $("doneSum");
        sum.innerHTML = "";
        [[T("코스", "Trail"), NM(rec.name)], [T("걸은 거리", "Walked"), km(rec.walked) + " km"], [T("코스 진행", "Trail progress"), km(rec.done) + " / " + km(c.total) + " km"],
         [T("걸린 시간", "Time"), hhmmss(rec.end - rec.start)], [T("오른 높이", "Climb"), num(rec.up) + " m"],
         [T("칼로리(추정)", "Calories (est.)"), num(rec.kcal) + " kcal · " + body.kg + T("kg 기준", " kg body weight")]]
            .concat(rec.steps != null ? [[T("걸음(추정)", "Steps (est.)"), num(rec.steps) + T(" 보", "")]] : [])
            .concat([[T("기록 점", "Track points"), rec.track.length + T("개", "")]])
            .concat(rec.notes ? [[T("사진 · 메모", "Photos · notes"), rec.notes.filter(function (n) { return n.photo; }).length + T("장 · ", " · ") + rec.notes.filter(function (n) { return n.text; }).length + T("개", "")]] : [])
            .forEach(function (r) {
            var row = document.createElement("div"), a = document.createElement("span"), b = document.createElement("b");
            a.textContent = r[0]; b.textContent = r[1];
            row.appendChild(a); row.appendChild(b); sum.appendChild(row);
        });
        $("doneGpx").onclick = function () { downloadGpx(rec); };
        $("doneCard").onclick = function () { shareCard(rec); };
        $("doneGpx").textContent = canShareFiles() ? T("📤 GPX 보내기", "📤 Send GPX") : T("GPX 저장", "Save GPX");
        $("doneSheet").style.display = "flex";
        $("doneNext").hidden = true;
        getJson("api/partners").then(function (p) {   // 후원 링크(설정에 있을 때만 - 2026-10-15)
            var dn = EN ? p && p.donateEn : p && p.donate;   // 영어 화면은 PayPal(donate.en.url)
            if (/^https:\/\//.test(dn || "")) { $("doneDonate").href = dn; $("doneDonate").hidden = false; }
            doneNext(p, rec);
        }).catch(function () { doneNext({}, rec); });
    }

    /** 산행을 마친 화면 "다음은?"(2026-10-28 홍TV님 추천) - 끝낸 자리(마지막 위치, 없으면 코스 끝) 근처 맛집 · 숙소 · 다음 산. */
    function doneNext(p, rec) {
        var last = rec.track && rec.track.length ? rec.track[rec.track.length - 1] : null;
        var cn = String(rec.name || ""), tail = (/→\s*([^→·]+?)\s*$/.exec(cn) || [])[1];
        var end = last ? { lat: last[0], lon: last[1] } : (c && c.lat && c.lat.length ? { lat: c.lat[c.lat.length - 1], lon: c.lon[c.lon.length - 1] } : {});
        end.name = [RF.parkOf(cn), tail].filter(Boolean).join(" ") || cn.split("→")[0].trim();
        end.up = rec.up;
        end.month = new Date(Date.now() + 9 * 3600000).getUTCMonth() + 1;   // 한국 달
        var r = RF.afterHikeLinks(p, end, EN), box = $("doneNext");
        box.textContent = "";
        var b = document.createElement("b"), nx = document.createElement("div");
        b.textContent = T("수고하셨습니다! 다음은?", "Well done! What's next?");
        nx.className = "nx";
        r.links.forEach(function (x) {
            var a = document.createElement("a");
            a.href = x.href;
            a.textContent = x.text;
            if (/^https:/.test(x.href)) { a.target = "_blank"; a.rel = x.sponsored ? "noopener sponsored" : "noopener"; }
            nx.appendChild(a);
        });
        box.appendChild(b); box.appendChild(nx);
        if (r.affiliate || r.coupang) {
            var sm = document.createElement("small");
            sm.textContent = (r.affiliate ? T("숙소는 제휴 링크 - 예약하면 routefly 가 수수료를 받습니다. ", "Stay links are affiliate links - routefly earns a commission if you book. ") : "") + (r.coupang ? RF.COUPANG_NOTE : "");
            box.appendChild(sm);
        }
        box.hidden = false;
    }

    /**
     * 기록 · 사진 · 도장은 이 핸드폰에만 있어, 저장 공간이 모자랄 때 브라우저가 지우지 않게 "오래 둠" 을 부탁합니다(2026-10-16 홍TV님 - 기록 보관).
     * 크롬은 묻지 않고 정하고(홈 화면 앱 · 자주 쓰는 곳이면 대개 허락), 파이어폭스는 한 번 묻습니다 - 그래서 첫 기록을 남길 때에만.
     */
    function keepStorage() {
        var st = navigator.storage;
        if (!st || !st.persist || !st.persisted) return;
        st.persisted().then(function (p) { return p || st.persist(); }).catch(function () { /* 그대로 */ });
    }

    function showRecords() {
        recordsReady.then(drawRecords);
    }

    // ------------------------------------------------------------------ 산행 결산(2026-10-15 홍TV님: 월별 · 분기별 · 올해 누적 · 연도별)
    // 기록은 최근 30개만 남아 결산용 요약을 따로 쌓음(rf-log, 끝낸 산행마다 한 줄 - 백업에도 들어감). 처음엔 남아 있는 기록으로 채움
    var LOG_KEY = "rf-log";
    function readLog() { try { var l = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
    function addLog(entries) {
        try { localStorage.setItem(LOG_KEY, JSON.stringify(RF.mergeLog(readLog(), entries))); } catch (e) { /* 저장 공간 */ }
    }
    recordsReady.then(function () { addLog(records().map(RF.logEntry)); });

    var sumKind = "month", sumYear = new Date(Date.now() + 9 * 3600000).getUTCFullYear(), peakPts = null;
    function drawSummary() {
        var log = readLog(), peaks = loadMap(PEAKS), nowMs = Date.now(), thisYear = new Date(nowMs + 9 * 3600000).getUTCFullYear();
        var years = {};
        years[thisYear] = 1;
        log.forEach(function (e) { years[new Date(e.start + 9 * 3600000).getUTCFullYear()] = 1; });
        var ysel = $("sumYear");
        ysel.textContent = "";
        Object.keys(years).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
            var o = document.createElement("option");
            o.value = y; o.textContent = y + T("년", ""); o.selected = y === sumYear;
            ysel.appendChild(o);
        });
        ysel.hidden = sumKind === "year";
        Array.prototype.forEach.call($("sumKinds").children, function (b) { b.classList.toggle("on", b.getAttribute("data-k") === sumKind); });
        var rows = RF.periodStats(log, peaks, sumKind, sumYear, nowMs), box = $("sumRows");
        box.textContent = "";
        if (sumKind === "month") rows = rows.filter(function (r) { return r.from <= nowMs; });   // 아직 안 온 달은 뺌
        rows.forEach(function (r) {
            var row = document.createElement("div"), info = document.createElement("div"), b = document.createElement("b"), sp = document.createElement("span");
            row.className = "rec";
            b.textContent = r.label.replace(/^\d+년 (?=\d)/, "");
            sp.textContent = EN ? (r.n ? r.n + (r.n > 1 ? " hikes · " : " hike · ") + km(r.walked) + " km · climb " + num(r.up) + " m · " + RF.hm(r.ms, true)
                + " · " + r.courses + " trails" + (r.peaks ? " · 100 Famous Mountains " + r.peaks : "") : (r.peaks ? "100 Famous Mountains " + r.peaks : "No hikes"))
                : r.n ? r.n + "번 · " + km(r.walked) + "km · 오른 높이 " + num(r.up) + "m · " + RF.hm(r.ms, true)
                + " · 코스 " + r.courses + "곳" + (r.peaks ? " · 100대 명산 " + r.peaks + "곳" : "") : (r.peaks ? "100대 명산 " + r.peaks + "곳" : "산행 없음");
            info.appendChild(b); info.appendChild(sp);
            row.appendChild(info);
            if (r.n || r.peaks) {
                var cb = document.createElement("button");
                cb.textContent = "🖼";
                cb.title = r.label + T(" 결산 카드 공유", " summary card - share");
                cb.onclick = function () { summaryCardShare(r); };
                row.appendChild(cb);
            }
            box.appendChild(row);
        });
        $("sumNote").textContent = T("기록은 끝낸 산행마다 이 기기에 쌓입니다(" + log.length + "번). 백업 파일에도 들어갑니다. 100대 명산은 그 기간에 처음 도장을 찍은 산 수입니다.",
            "Every finished hike is kept on this device (" + log.length + " so far) and included in backups. 100 Famous Mountains counts mountains first stamped in that period.");
    }

    /** 결산 카드 그림(1080 × 1350) - 숫자 + 100대 명산 점 지도(그 기간 끝까지 다녀온 곳 주황). */
    function summaryCard(r, pts) {
        var W = 1080, H = 1350, P = 72, cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        var g = cv.getContext("2d"), bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, "#16202b"); bg.addColorStop(1, "#0b1016");
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        g.textAlign = "left";
        g.font = "bold 44px sans-serif"; g.fillStyle = "#e9eef4"; g.fillText("route", P, P + 30);
        g.fillStyle = "#ffb703"; g.fillText("fly", P + g.measureText("route").width, P + 30);
        g.font = "bold 64px sans-serif"; g.fillStyle = "#ffffff"; g.fillText(r.label + T(" 산행 결산", " hiking summary"), P, P + 140, W - P * 2);
        var stats = [[T("산행", "Hikes"), r.n + T("번", "")], [T("거리", "Distance"), km(r.walked) + " km"], [T("오른 높이", "Climb"), num(r.up) + " m"], [T("걸은 시간", "Time"), RF.hm(r.ms, true)],
                     [T("코스", "Trails"), r.courses + T("곳", "")], [T("100대 명산", "100 Famous Mts"), "+" + r.peaks + T("곳", "")]];
        stats.forEach(function (s, i) {
            var x = P + (i % 3) * ((W - P * 2) / 3), y = P + 250 + Math.floor(i / 3) * 150;
            g.font = "30px sans-serif"; g.fillStyle = "#9aa6b4"; g.fillText(s[0], x, y);
            g.font = "bold 54px sans-serif"; g.fillStyle = "#ffffff"; g.fillText(s[1], x, y + 66, (W - P * 2) / 3 - 20);
        });
        if (pts && pts.length) {
            var top = P + 560, bh = H - top - P - 60, bw = W - P * 2, xy = RF.dotMap(pts, bw, bh, 24), got = 0;
            g.fillStyle = "rgba(255,255,255,0.04)"; g.fillRect(P, top, bw, bh);
            pts.map(function (p, i) { return { p: xy[i], on: p.t && p.t < r.to }; }).sort(function (a, b) { return a.on - b.on; }).forEach(function (d) {
                g.beginPath(); g.arc(P + d.p[0], top + d.p[1], d.on ? 12 : 7, 0, Math.PI * 2);
                g.fillStyle = d.on ? "#ffb703" : "#4a5562"; g.fill();
                if (d.on) { got++; g.lineWidth = 3; g.strokeStyle = "#fff"; g.stroke(); }
            });
            g.font = "28px sans-serif"; g.fillStyle = "#9aa6b4"; g.fillText(T("100대 명산 ", "100 Famous Mountains ") + got + " / " + pts.length + T("곳", ""), P + 20, top + 44);
        }
        g.font = "26px sans-serif"; g.fillStyle = "#6f7c8a";
        g.fillText(T("routefly - 등산 · 걷기 · 자전거 코스", "routefly - hiking · walking · cycling trails in Korea"), P, H - P + 20);
        return cv;
    }
    function summaryCardShare(r) {
        var go = function (pts) { shareCanvas(summaryCard(r, pts), "routefly-" + r.label.replace(/[^0-9a-zA-Z가-힣]+/g, "") + ".png", r.label + T(" 산행 결산 - routefly", " hiking summary - routefly")); };
        if (peakPts) { go(peakPts); return; }
        jsonOnce("data/mountains100.json").then(function (j) {
            var have = loadMap(PEAKS);
            peakPts = (j.peaks || []).map(function (k) { var st = have[RF.peakKey(k)]; return { lat: k.lat, lon: k.lon, t: st && st.t }; });
            go(peakPts);
        }).catch(function () { go(null); });
    }

    function drawRecords() {
        var box = $("recList"), list = records();
        if (upOwnerP == null) {   // 처음 열 때 한 번만 물음(관리자 기기인가) - 맞으면 단추를 넣어 다시 그림
            upOwnerP = getJson("api/course-upload").then(function (j) { upOwner = !!j.owner; if (upOwner) drawRecords(); }).catch(function () { /* 남으로 */ });
        }
        box.innerHTML = "";
        drawRecStats(list);
        if (!list.length) {
            box.innerHTML = T('<p class="tip">아직 기록이 없습니다. 시작했다가 "끝내기" 를 누르면 남습니다.</p>', '<p class="tip">No records yet. Start a hike and tap "Finish" to save one.</p>');
        }
        list.forEach(function (r, i) {
            var row = document.createElement("div");
            row.className = "rec";
            var info = document.createElement("div"), b = document.createElement("b"), sp = document.createElement("span");
            b.textContent = NM(r.name);
            var d = new Date(r.start);
            sp.textContent = d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + " · " + km(RF.recDist(r)) + "km · " + hhmmss(r.end - r.start)
                + (r.kcal != null ? " · " + num(r.kcal) + "kcal" : "") + (r.steps != null ? " · " + num(r.steps) + T("보", " steps") : "");
            info.appendChild(b); info.appendChild(sp);
            var g = document.createElement("button"); g.textContent = canShareFiles() ? "📤 GPX" : "GPX"; g.title = T("GPX 파일 보내기 · 저장", "Send or save GPX file"); g.onclick = function () { downloadGpx(r); };
            if (r.notes && r.notes.length) {
                var nb = document.createElement("button"); nb.textContent = "📝 " + r.notes.length; nb.title = T("사진 · 메모 보기", "View photos · notes");
                nb.onclick = function () { showNotes(r); };
                row.appendChild(info); info = null; row.appendChild(nb);
            }
            var v = document.createElement("button"); v.textContent = "📈"; v.title = T("고도 그래프 · 지도에 보기", "Elevation chart · show on map");
            v.onclick = function () { showRecord(r); };
            var x = document.createElement("button"); x.textContent = T("지우기", "Delete");
            x.onclick = function () {
                hAsk(T("이 기록을 지울까요?\n산행 결산에서도 빠집니다.", "Delete this record?\nIt is also removed from the hiking summary."), { ok: T("지우기", "Delete"), danger: true }).then(function (ok) {
                    if (!ok) return;
                    var l = records(), at = l.indexOf(r);   // 창이 떠 있는 사이 목록이 바뀌었을 수 있어 그 기록을 다시 찾음
                    if (at < 0) return;
                    l.splice(at, 1);
                    // 직접 지운 기록은 결산에서도 뺌(2026-10-28 홍TV님) - 30개가 넘어 저절로 밀려난 기록은 결산에 남음
                    try { localStorage.setItem(LOG_KEY, JSON.stringify(RF.dropLog(readLog(), r))); } catch (e) { /* 저장 공간 */ }
                    writeRecords(l).then(gcPhotos);
                    drawRecords();
                });
            };
            if (info) row.appendChild(info);
            row.appendChild(v); row.appendChild(g);
            if (upOwner) {   // 관리자(운영자) 기기만 - 이 기록을 코스로 올리기(2026-10-31 홍TV님 "일단 나만 보이게")
                var u = document.createElement("button"); u.textContent = T("⬆ 코스로", "⬆ Course"); u.title = T("이 기록을 routefly 코스로 올리기(관리자만)", "Upload this record as a routefly course (admin only)");
                u.onclick = function () { uploadCourse(r); };
                row.appendChild(u);
            }
            row.appendChild(x);
            box.appendChild(row);
        });
        $("recSheet").style.display = "flex";
    }

    /** 내 기록 통계(2026-10-15 홍TV님) - 올해 · 남아 있는 기록 전체(최근 30개). */
    function drawRecStats(list) {
        var box = $("recStats"), y = new Date(now() + 9 * 3600000).getUTCFullYear(), sy = RF.recordStats(list, y), sa = RF.recordStats(list);
        box.innerHTML = "";
        box.hidden = !list.length;
        var hrs = function (ms) { return RF.hm(ms); };
        (EN ? [["This year (" + y + ")", sy.n + " hikes · " + km(sy.walked) + " km · climb " + num(sy.up) + " m"],
         ["Time this year", hrs(sy.ms) + " · " + sy.courses + " trails"],
         ["All saved records", sa.n + " hikes · " + km(sa.walked) + " km · " + sa.courses + " trails"]]
        : [["올해(" + y + ")", sy.n + "번 · " + km(sy.walked) + " km · 오른 높이 " + num(sy.up) + " m"],
         ["올해 걸은 시간", hrs(sy.ms) + " · 코스 " + sy.courses + "곳"],
         ["남은 기록 전체", sa.n + "번 · " + km(sa.walked) + " km · 코스 " + sa.courses + "곳"]]).forEach(function (r) {
            var row = document.createElement("div"), a = document.createElement("span"), b = document.createElement("b");
            a.textContent = r[0]; b.textContent = r[1];
            row.appendChild(a); row.appendChild(b); box.appendChild(row);
        });
    }

    /**
     * 기록 백업(2026-10-15 홍TV님: 핸드폰을 바꾸거나 앱을 지우면 기록이 사라짐) - 기록 · 사진 · 도장 · 완주 · 정상 · 찜 · 몸무게를
     * JSON 파일 하나로(사진은 base64). 핸드폰 안에서 만들고 이용자가 고른 곳(드라이브 · 메일 · 내 파일)으로만 보냅니다.
     * 불러오기는 지금 기록에 합칩니다(같은 기록은 하나로, 최근 REC_MAX 개).
     */
    /** 백업 내용 만들기(파일 · QR 옮기기가 같이 씀). */
    function buildBackup() {
        return recordsReady.then(function () {
            var recs = records(), photos = {};
            return Promise.all(RF.photoIds(recs).map(function (id) {
                return photoGet(id).then(function (b) { return b ? blobToBase64(b).then(function (s) { photos[id] = s; }) : null; }, function () { /* 없는 사진 */ });
            })).then(function () {
                var ls = {};
                RF.BACKUP_KEYS.forEach(function (k) { try { var v = localStorage.getItem(k); if (v) ls[k] = JSON.parse(v); } catch (e) { /* 깨진 값은 뺌 */ } });
                return { app: "routefly", v: 1, at: now(), records: recs, photos: photos, ls: ls };
            });
        });
    }
    function backupSave() {
        buildBackup().then(function (o) {
            var d = new Date(), text = JSON.stringify(o);
            var name = "routefly-backup-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + ".json";
            toast(EN ? "Backup file: " + o.records.length + " records · " + Object.keys(o.photos).length + " photos - in the share window pick where to keep it (Drive, email, your files, a chat to yourself)."
                : "백업 파일: 기록 " + o.records.length + "개 · 사진 " + Object.keys(o.photos).length + "장 - 열리는 공유 창에서 드라이브 · 카톡 '나와의 채팅' · 메일 · 내 파일 중 둘 곳을 고르세요.", 8000);   // 2026-10-17 홍TV님: 백업 저장을 누르니 카톡이 열려 당황 - 공유 창으로 둘 곳을 고르는 것
            if (FS && SHARE) return nativeShareFile(name, btoa(unescape(encodeURIComponent(text))), T("routefly 백업", "routefly backup"));
            var f = null;
            try { f = new File([text], name, { type: "application/json" }); if (!(navigator.canShare && navigator.canShare({ files: [f] }))) f = null; } catch (e) { f = null; }
            if (f) return navigator.share({ files: [f], title: T("routefly 백업", "routefly backup") }).catch(function (e) {
                if (!(e && e.name === "AbortError")) saveFile(text, name, "application/json");
            });
            saveFile(text, name, "application/json");
        }).catch(function (e) { toast(T("백업을 만들지 못했습니다: ", "Could not make the backup: ") + (e && e.message || e), 6000); });
    }
    function b64Blob(s, type) {
        var bin = atob(s), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new Blob([u], { type: type });
    }
    function backupLoad(file) {
        var rd = new FileReader();
        rd.onerror = function () { toast(T("파일을 읽지 못했습니다.", "Could not read the file."), 5000); };
        rd.onload = function () {
            var o = null;
            try { o = JSON.parse(String(rd.result)); } catch (e) { /* 아래 */ }
            mergeBackup(o);
        };
        rd.readAsText(file);
    }
    /** 백업 합치기(파일 · QR 옮기기가 같이 씀) - 묻고 합침. */
    function mergeBackup(o) {
        {
            var bad = RF.backupCheck(o);
            if (bad) { toast(bad, 6000); return; }
            var photos = o.photos && typeof o.photos === "object" ? o.photos : {};
            hAsk(EN ? "Merge this backup (" + o.records.length + " records · " + Object.keys(photos).length + " photos) into this device?\nYour current records are kept (up to the latest " + REC_MAX + ")."
                : "백업(기록 " + o.records.length + "개 · 사진 " + Object.keys(photos).length + "장)을 이 기기에 합칠까요?\n지금 기록은 지우지 않습니다(기록은 최근 " + REC_MAX + "개까지).", { ok: T("합치기", "Merge") }).then(function (ok) {
            if (!ok) return;
            return recordsReady.then(function () {
                var merged = RF.mergeRecords(records(), o.records, REC_MAX);
                return Promise.all(RF.photoIds(merged).filter(function (id) { return typeof photos[id] === "string"; }).map(function (id) {
                    try { return photoPut(id, b64Blob(photos[id], "image/jpeg")).catch(function () { /* 그 사진만 */ }); } catch (e) { return null; }
                })).then(function () { return writeRecords(merged); });
            }).then(function () {
                var ls = o.ls && typeof o.ls === "object" ? o.ls : {};
                RF.BACKUP_KEYS.forEach(function (k) {
                    if (ls[k] == null) return;
                    var cur = null;
                    try { cur = JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { /* 새로 */ }
                    try { localStorage.setItem(k, JSON.stringify(k === LOG_KEY ? RF.mergeLog(cur, ls[k]) : RF.mergeStore(cur, ls[k]))); } catch (e) { /* 저장 공간 */ }
                });
                addLog(records().map(RF.logEntry));   // 백업의 기록도 결산에
                drawRecords();
                toast(T("백업을 불러왔습니다.", "Backup restored."), 4000);
            });
            }).catch(function (e) { toast(T("백업을 불러오지 못했습니다: ", "Could not restore the backup: ") + (e && e.message || e), 6000); });
        }
    }

    /**
     * 기기 사이 QR 옮기기(2026-10-28 홍TV님 "qr 로 옮겨줘" - 폰의 지리산 인증이 PC 에 없음).
     * 받는 기기: 코드(8글자)를 만들어 QR · 글로 보여 주고 3초마다 기다림. 보내는 기기: QR 을 찍거나(카메라 → 이 화면 #xfer=코드) 코드를 쳐서 보냄.
     * 백업을 코드에서 만든 열쇠로 기기 안에서 암호화(AES-GCM)해 조각으로 서버(XferServlet)에 10분 맡김 - 서버에는 코드의 해시와 암호문만(내용을 볼 수 없음).
     */
    var XFER_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", XFER_PART = 500000;
    function xferCode() {
        var b = new Uint8Array(8), s = "";
        crypto.getRandomValues(b);
        for (var i = 0; i < 8; i++) s += XFER_ABC[b[i] % 32];
        return s;
    }
    function xferClean(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
    function sha(text) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); }
    function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
    /**
     * 2026-10-28 보안 점검: 코드 8글자(40비트)만으로는 서버에 맡긴 암호문을 하나씩 쳐 볼 수 있었음.
     * QR 에는 코드 뒤에 기기 밖으로 나가지 않는 비밀 128비트(#xfer=코드.비밀)를 붙여 그것으로 열쇠를 만듦.
     * 코드만 쳐서 보낼 때는 열쇠 · 자리 이름을 PBKDF2(10만 번)로 만들어 쳐 보기를 아주 느리게.
     */
    var XFER_ITER = 100000;
    function slow(text, salt) {
        return crypto.subtle.importKey("raw", new TextEncoder().encode(text), "PBKDF2", false, ["deriveBits"]).then(function (k) {
            return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: XFER_ITER }, k, 256);
        });
    }
    function xferSecret() {
        var b = crypto.getRandomValues(new Uint8Array(16));
        return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    function xferId(code) { return slow(code, "rf-xfer-id").then(function (h) { return hex(h).slice(0, 32); }); }
    function xferKey(code, secret) {
        var raw = secret ? sha("rf-xfer-key|" + code + "|" + secret) : slow(code, "rf-xfer-key");
        return raw.then(function (h) { return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]); });
    }
    function b64(buf) {
        var u = new Uint8Array(buf), s = "";
        for (var i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
        return btoa(s);
    }
    function unb64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
    function xferPost(path, body) {
        return fetch("api/xfer/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || j.success === false) throw new Error(j.message || ("오류 " + r.status)); return j; }); });
    }
    var xferTimer = null;
    function xferHide() { clearInterval(xferTimer); $("xferBox").hidden = true; $("xferBox").style.display = "none"; }
    $("xferClose").addEventListener("click", xferHide);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("xferBox").hidden) xferHide(); });   // Esc 로 닫기(2026-10-28 접근성)
    /** 받기 - 이 기기에 QR · 코드를 띄우고 기다림. */
    function xferReceive() {
        if (!window.crypto || !crypto.subtle) { toast(T("이 브라우저는 옮기기를 못 합니다(https 주소에서 열어 주세요).", "This browser can't transfer (open the https address)."), 6000); return; }
        var code = xferCode(), secret = xferSecret(), url = location.origin + location.pathname + (EN ? "?lang=en" : "") + "#xfer=" + code + "." + secret;
        xferId(code).then(function (id) {
            return xferPost("open", { id: id }).then(function () {
                $("xferQr").innerHTML = "";
                if (window.qrcode) { var q = qrcode(0, "M"); q.addData(url); q.make(); $("xferQr").innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
                $("xferCode").textContent = code.slice(0, 4) + "-" + code.slice(4);
                $("xferState").textContent = T("기다리는 중… (10분)", "Waiting… (10 min)");
                $("xferBox").hidden = false;
                $("xferBox").style.display = "flex";
                var until = Date.now() + 10 * 60000;
                clearInterval(xferTimer);
                xferTimer = setInterval(function () {
                    if (document.hidden && Date.now() <= until) return;   // 화면을 안 볼 때는 쉼(2026-10-28 속도 점검: 3초마다 10분 = 200번)
                    if (Date.now() > until) { clearInterval(xferTimer); $("xferState").textContent = T("시간이 지났습니다. 다시 해 주세요.", "Timed out. Please try again."); return; }
                    xferPost("take", { id: id }).then(function (j) {
                        if (j.waiting) { if (j.n && $("xferState")) $("xferState").textContent = T("받는 중… ", "Receiving… ") + j.got + " / " + j.n; return; }
                        clearInterval(xferTimer);
                        var all = unb64(j.data);
                        function open(key) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, key, all.slice(12)); }
                        // QR 로 왔으면 비밀 열쇠, 코드를 쳐서 왔으면 코드 열쇠(어느 쪽인지 서버는 모름 - 맞는 열쇠만 풀림)
                        return xferKey(code, secret).then(open).catch(function () { return xferKey(code).then(open); }).then(function (plain) {
                            $("xferBox").hidden = true; $("xferBox").style.display = "none";
                            mergeBackup(JSON.parse(new TextDecoder().decode(plain)));
                        });
                    }).catch(function (e) { clearInterval(xferTimer); $("xferState").textContent = (e && e.message) || T("받지 못했습니다.", "Could not receive."); });
                }, 3000);
            });
        }).catch(function (e) { toast((e && e.message) || T("옮기기를 시작하지 못했습니다.", "Could not start the transfer."), 6000); });
    }
    /** 보내기 - 받는 기기의 코드로 이 기기 백업을 암호화해 올림. */
    function xferSend(code, secret) {
        code = xferClean(code);
        if (code.length !== 8) { toast(T("받는 기기 화면의 코드 8글자를 넣어 주세요.", "Enter the 8-letter code shown on the receiving device."), 5000); return; }
        if (!window.crypto || !crypto.subtle) { toast(T("이 브라우저는 옮기기를 못 합니다(https 주소에서 열어 주세요).", "This browser can't transfer (open the https address)."), 6000); return; }
        toast(T("📤 보내는 중…", "📤 Sending…"), 4000);
        Promise.all([buildBackup(), xferKey(code, secret), xferId(code)]).then(function (a) {
            var o = a[0], iv = crypto.getRandomValues(new Uint8Array(12));
            return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, a[1], new TextEncoder().encode(JSON.stringify(o))).then(function (ct) {
                var buf = new Uint8Array(12 + ct.byteLength);
                buf.set(iv, 0); buf.set(new Uint8Array(ct), 12);
                var text = b64(buf), n = Math.max(1, Math.ceil(text.length / XFER_PART)), i = 0;
                function next() {
                    if (i >= n) return null;
                    var k = i++;
                    return xferPost("put", { id: a[2], i: k, n: n, part: text.slice(k * XFER_PART, (k + 1) * XFER_PART) }).then(next);
                }
                return Promise.resolve().then(next);   // 조각을 하나씩 차례로
            }).then(function () {
                toast(T("📤 보냈습니다 - 기록 " + o.records.length + "개. 받는 기기 화면에서 \"합칠까요?\" 에 확인을 누르세요.", "📤 Sent - " + o.records.length + " records. Confirm \"merge\" on the receiving device."), 8000);
            });
        }).catch(function (e) { toast(T("보내지 못했습니다: ", "Could not send: ") + ((e && e.message) || e), 7000); });
    }

    /**
     * 기록 하나 보기(2026-10-09) - 요약, 고도 그래프(사진 · 메모 자리 표시), "지도에 보기" 는 지금 지도에 보라 선으로 그리고
     * 그 범위로 옮깁니다(코스는 그대로, 다시 누르면 선을 지움). 기록에 고도가 없으면 그래프 대신 안내 글.
     */
    function showRecord(rec) {
        var rc = RF.recordCourse(rec), sum = $("recViewSum");
        $("recViewTitle").textContent = "📈 " + NM(rec.name);
        sum.innerHTML = "";
        var d = new Date(rec.start);
        var eles = rc.ele.filter(function (e) { return e != null; });
        [[T("날짜", "Date"), d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + " " + clock(rec.start)],
         [T("거리", "Distance"), km(RF.recDist(rec)) + " km"], [T("걸린 시간", "Time"), hhmmss(rec.end - rec.start)]]   // 카드와 같은 규칙(2026-10-28 PC)
            .concat(rec.up != null ? [[T("오른 높이", "Climb"), num(rec.up) + " m"]] : [])
            .concat(eles.length ? [[T("가장 높은 곳", "Highest"), num(RF.recordHighest(rc, cardPeaks.peaks, cardPeaks.elev)) + " m"]] : [])
            .concat(rec.kcal != null ? [[T("칼로리(추정)", "Calories (est.)"), num(rec.kcal) + " kcal"]] : [])
            .forEach(function (r) {
                var row = document.createElement("div"), a = document.createElement("span"), b = document.createElement("b");
                a.textContent = r[0]; b.textContent = r[1];
                row.appendChild(a); row.appendChild(b); sum.appendChild(row);
            });
        $("recView").style.display = "flex";   // 그래프 이름표 자리를 재려면 먼저 보여야 합니다
        if (rc.lat.length > 1) RF.profile($("recViewProfile"), rc, {}).set(rc.total);   // 다 걸은 기록이라 끝까지 색칠
        else $("recViewProfile").textContent = "";
        $("recViewMap").disabled = rc.lat.length < 2;
        $("recViewCard").disabled = rc.lat.length < 2;
        $("recViewCard").onclick = function () { shareCard(rec); };
        $("recViewMap").onclick = function () {
            if (!mapReady) { toast(T("지도가 아직 준비되지 않았습니다.", "The map is not ready yet."), 2500); return; }
            mapReady.then(function () {
                map.getSource("recTrack").setData(RF.recordLines(rc));   // 이어 걸은 곳 실선 · 끊긴 구간 점선
                var nGap = rc.gap.filter(Boolean).length;
                if (nGap) toast(T("보라 점선 " + nGap + "곳은 위치가 끊긴 구간입니다(화면 꺼짐 · 신호 없음) - 그 사이는 기록이 없어 곧게 이었습니다.", "The " + nGap + " dashed purple part(s) are gaps where location stopped (screen off / no signal) - drawn straight."), 7000);
                var b = new maplibregl.LngLatBounds();
                for (var i = 0; i < rc.lon.length; i++) b.extend([rc.lon[i], rc.lat[i]]);
                setFollow(false);
                map.fitBounds(b, { padding: 50, duration: 0, maxZoom: 16 });
                $("recClear").style.display = "block";
            });
            $("recView").style.display = "none";
            $("recSheet").style.display = "none";
            $("pick").style.display = "none";   // 코스를 고르기 전(내 기록으로 바로 온 때)에도 지도가 보이게
        };
        $("recViewClose").onclick = function () { $("recView").style.display = "none"; };
    }

    // ------------------------------------------------------------------ 사진 · 메모 (2026-10-08 홍TV님 - 램블러처럼 기록에 사진 · 메모)

    /** 사진 저장소 - IndexedDB "rf-photos"(localStorage 는 5MB 남짓이라 사진이 안 들어감). 열쇠 → JPEG Blob. */
    function photoDb() {
        return new Promise(function (resolve, reject) {
            if (!window.indexedDB) { reject(new Error(T("이 브라우저는 사진을 저장할 수 없습니다.", "This browser cannot store photos."))); return; }
            var r = indexedDB.open("rf-photos", 1);
            r.onupgradeneeded = function () { r.result.createObjectStore("p"); };
            r.onsuccess = function () { resolve(r.result); };
            r.onerror = function () { reject(r.error); };
        });
    }
    function photoTx(mode, fn) {
        return photoDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                try {   // 2026-10-10 점검: 던지면 db 를 닫고 실패로(열린 채 남지 않게)
                    var tx = db.transaction("p", mode), st = tx.objectStore("p"), out = fn(st);
                    tx.oncomplete = function () { db.close(); resolve(out && out.result !== undefined ? out.result : out); };
                    tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error("사진 저장이 취소되었습니다.")); };
                } catch (e) { db.close(); reject(e); }
            });
        });
    }
    function photoPut(id, blob) { return photoTx("readwrite", function (st) { st.put(blob, id); }); }
    function photoGet(id) { return photoTx("readonly", function (st) { return st.get(id); }); }
    /** 어느 기록 · 지금 산행에도 없는 사진을 지웁니다(기록을 지우거나 30개 밖으로 밀려났을 때). */
    function gcPhotos() {
        var keep = {}, lists = records().concat([{ notes: hike.notes }]);
        // 2026-10-09 점검: 이어 하려고 남겨 둔 산행(rf-hike-<코스>-notes)의 사진도 남깁니다
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (/^rf-hike-.+-notes$/.test(k)) lists.push({ notes: JSON.parse(localStorage.getItem(k) || "[]") });
            }
        } catch (e) { return; }   // 못 읽으면 지우지 않습니다
        lists.forEach(function (r) { (r.notes || []).forEach(function (n) { if (n.photo) keep[n.photo] = 1; }); });
        photoTx("readwrite", function (st) {
            var q = st.getAllKeys();
            q.onsuccess = function () { q.result.forEach(function (k) { if (!keep[k]) st.delete(k); }); };
        }).catch(function () { /* 사진 저장소가 없으면 할 일 없음 */ });
    }
    /** 사진을 긴 변 PHOTO_MAX px JPEG 로 줄입니다(저장 공간). */
    var PHOTO_MAX = 1600;
    function shrinkPhoto(file) {
        return new Promise(function (resolve, reject) {
            var img = new Image(), url = URL.createObjectURL(file);
            img.onload = function () {
                var k = Math.min(1, PHOTO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
                var cv = document.createElement("canvas");
                cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
                cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
                URL.revokeObjectURL(url);
                cv.toBlob(function (b) { if (b) resolve(b); else reject(new Error("사진을 줄이지 못했습니다.")); }, "image/jpeg", 0.8);
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("사진을 읽지 못했습니다.")); };
            img.src = url;
        });
    }

    function loadNotes() {
        try { return JSON.parse(localStorage.getItem(saveKey() + "-notes") || "[]"); } catch (e) { return []; }
    }
    var noteMarkers = [];
    function drawNoteMarkers() {
        noteMarkers.forEach(function (m) { m.remove(); });
        noteMarkers = (hike.notes || []).map(function (n) {
            var el = document.createElement("div");
            el.className = "noteMark";
            el.textContent = n.photo ? "📷" : "📝";
            el.title = n.text || T("사진", "Photo");
            return marker(el, [n.lon, n.lat], "bottom");
        });
    }

    var noteFile = null;
    $("noteBtn").addEventListener("click", function () {
        var f = hike.fix;
        if (!f) { toast(T("아직 위치를 받지 못했습니다. GPS 를 잡은 뒤 다시 누르세요.", "No location yet. Try again once GPS has a fix."), 4000); return; }
        noteFile = null;
        $("noteText").value = "";
        $("notePreview").style.display = "none";
        $("noteWhere").textContent = T("지금 자리 · ", "Here · ") + clock(now()) + (c ? " · " + km(hike.d) + T("km 지점", " km along") : "") + (f.acc != null ? T(" · 오차 ±", " · ±") + Math.round(f.acc) + "m" : "");
        $("noteSheet").style.display = "flex";
    });
    $("notePhotoBtn").addEventListener("click", function () { $("notePhoto").value = ""; $("notePhoto").click(); });
    $("notePhoto").addEventListener("change", function () {
        var f = this.files && this.files[0];
        if (!f) return;
        noteFile = f;
        var pv = $("notePreview");
        if (pv.src) URL.revokeObjectURL(pv.src);
        pv.src = URL.createObjectURL(f);
        pv.style.display = "block";
    });
    $("noteCancel").addEventListener("click", function () { $("noteSheet").style.display = "none"; });
    $("noteSave").addEventListener("click", function () {
        var f = hike.fix, text = $("noteText").value.trim();
        if (!f) return;
        if (!text && !noteFile) { toast(T("메모를 쓰거나 사진을 고르세요.", "Write a note or pick a photo."), 3000); return; }
        // 해발: 코스 위면 코스 고도(GPS 고도는 흔들림 - README), 벗어나 있으면 GPS 고도
        var at = c && hike.off <= OFF_ROUTE_M ? RF.at(c, hike.d) : null;
        var ele = at && at.ele != null ? at.ele : f.alt;
        var note = { t: now(), lat: Math.round(f.lat * 1e6) / 1e6, lon: Math.round(f.lon * 1e6) / 1e6,
                     ele: ele != null ? Math.round(ele) : null, text: text || null, photo: null };
        var btn = $("noteSave");
        btn.disabled = true;
        (noteFile ? shrinkPhoto(noteFile).then(function (blob) {
            note.photo = "p" + note.t.toString(36) + Math.random().toString(36).slice(2, 6);
            return photoPut(note.photo, blob);
        }) : Promise.resolve()).then(function () {
            hike.notes.push(note);
            if (!hike.sim) try { localStorage.setItem(saveKey() + "-notes", JSON.stringify(hike.notes)); } catch (e) { /* 공간 부족 - 이번 산행 동안은 화면에 남음 */ }
            drawNoteMarkers();
            $("noteSheet").style.display = "none";
            toast(EN ? (note.photo ? "📷 Photo" : "📝 Note") + " saved (" + hike.notes.length + ")." : (note.photo ? "📷 사진" : "📝 메모") + "을 남겼습니다(" + hike.notes.length + "개).", 2500);
        }).catch(function (e) {
            toast(T("남기지 못했습니다: ", "Could not save: ") + (e && e.message || e), 5000);
        }).then(function () { btn.disabled = false; });
    });

    /** 기록 하나의 사진 · 메모 보기. 사진을 누르면 크게(새 창). */
    function showNotes(rec) {
        var box = $("notesList"), urls = [];
        box.innerHTML = "";
        $("notesTitle").textContent = "📝 " + NM(rec.name);
        rec.notes.forEach(function (n) {
            var row = document.createElement("div"), t = document.createElement("div"), sm = document.createElement("small");
            row.className = "noteRow";
            t.className = "nt";
            sm.textContent = clock(n.t) + (n.ele != null ? T(" · 해발 ", " · elev. ") + num(n.ele) + "m" : "");
            t.appendChild(sm);
            t.appendChild(document.createTextNode(n.text || ""));
            if (n.photo) {
                var img = document.createElement("img");
                img.alt = T("사진", "Photo");
                row.appendChild(img);
                photoGet(n.photo).then(function (blob) {
                    if (!blob) { img.alt = T("(사진 없음)", "(no photo)"); return; }
                    var u = URL.createObjectURL(blob);
                    urls.push(u);
                    img.src = u;
                    img.onclick = function () { window.open(u, "_blank"); };
                }).catch(function () { img.alt = T("(사진을 읽지 못함)", "(could not read photo)"); });
            }
            row.appendChild(t);
            box.appendChild(row);
        });
        $("notesClose").onclick = function () {
            $("notesSheet").style.display = "none";
            urls.forEach(function (u) { URL.revokeObjectURL(u); });
        };
        $("notesSheet").style.display = "flex";
    }

    // ------------------------------------------------------------------ 산행

    var SAFETY_KEY = "rf-safety-ok-v1";   // 안전 · 위치 안내를 읽었는지(내용을 크게 바꾸면 v2 로)

    function safetyOk() {
        try { return localStorage.getItem(SAFETY_KEY) === "1"; } catch (e) { return false; }
    }

    /** 실제 산행을 처음 시작할 때 안전 · 위치 안내를 보여 주고, 확인하면 시작합니다. */
    function askSafety(then) {
        var box = $("safety");
        box.style.display = "flex";
        $("safetyChk").checked = false;
        $("safetyGo").disabled = true;
        $("safetyGo").onclick = function () {
            try { localStorage.setItem(SAFETY_KEY, "1"); } catch (e) { /* 저장 못 하면 다음에 다시 물음 */ }
            box.style.display = "none";
            then();
        };
        $("safetyNo").onclick = function () { box.style.display = "none"; };
    }

    function start(sim) {
        if (!c) return;
        if (!sim && !safetyOk()) { askSafety(function () { start(false); }); return; }
        if (!sim && !BG && !navigator.geolocation) { toast(T("이 기기는 위치(GPS)를 쓸 수 없습니다.", "This device cannot use location (GPS).")); return; }
        if (!sim && !BG && !window.isSecureContext) {
            toast(T("GPS 는 https 주소에서만 켜집니다. 지금은 \"시험 걷기\" 로 화면을 시험해 보세요.", "GPS only works on an https address. Try \"Simulate\" for now."), 6000);
            return;
        }
        var saved = sim ? null : loadSaved();
        setCompact(false);   // 시작할 때는 기록 칸을 펼쳐서(아래로 밀면 접힘)
        hike.sim = sim;
        hike.running = true;
        hike.arrived = false;
        hike.hist = [];
        hike.speed = null;
        hike.simClock = Date.now();
        hike.start = saved ? saved.start : now();
        hike.d = saved ? saved.d : 0;
        hike.track = saved ? loadTrack() : [];
        hike.notes = saved ? loadNotes() : [];
        hike.walked = saved && saved.walked ? saved.walked : 0;
        hike.alerted = {};
        hike.sunWarned = false;
        hike.sun60 = false;
        // 귀가 확인 - 표준 시간의 1.5배(적어도 1시간 더)가 지나도록 못 끝내면 알림, 그 뒤 한 시간마다(2026-10-14 홍TV님). 위치는 보내지 않음
        hike.lateAt = sim ? 0 : RF.lateAt(hike.start, RF.standardMs(c.course.kind, c.total, RF.ascentLeft(c, 0)));
        hike.lateNext = hike.lateAt;
        hike.spotDone = {};
        hike.passed = {};
        hike.voiceD = null;   // 지난번 음성 확인 때의 거리 - 그 사이 지나친 지점도 말함(2026-10-16 PC)
        hike.offT = 0; hike.offShown = false;
        hike.wasOff = false;
        hike.d0 = saved && saved.d0 != null ? saved.d0 : null;   // 첫 위치가 코스 위일 때 정합니다(코스 중간에서 시작하면 그 자리)
        hike.dMax = saved && saved.dMax != null ? saved.dMax : hike.d;
        hike.base = saved && saved.base ? saved.base : null;
        hike.segT0 = saved && saved.segT0 ? saved.segT0 : hike.start;
        hike.branch = null;
        hike.kmSpoken = Math.floor(hike.d / (K() === RF.KINDS.bike ? 5000 : 1000));
        hike.paceFin = "";
        hike.headSaid = null;
        hike.pace = sim ? null : paceFor(c);   // 같은 코스 지난 기록(2026-10-16 홍TV님 추가 기능 2번)
        voice.last = {};
        // 시작 버튼을 누른 그 순간에 말해야 아이폰도 소리를 냅니다(사용자 동작 안에서 처음 말하기)
        if (EN) say(saved ? "Resuming guidance. " + skm(Math.max(0, c.total - hike.d)) + " kilometers to go."
            : "Starting guidance for " + spokenName(c.course.name) + ". " + skm(c.total) + " kilometers, about "
                + spokenTime(RF.standardMs(c.course.kind, c.total, RF.ascentLeft(c, 0))) + ".", { urgent: true });
        else say(saved ? "이어서 안내합니다. 남은 거리 " + skm(Math.max(0, c.total - hike.d)) + "킬로미터."
            : spokenName(c.course.name) + " 안내를 시작합니다. 전체 " + skm(c.total) + "킬로미터, 예상 "
                + spokenTime(RF.standardMs(c.course.kind, c.total, RF.ascentLeft(c, 0))) + ".", { urgent: true });
        $("save").style.display = "none";
        setFollow(true);
        $("go").textContent = sim ? T("시험 걷기 끝내기", "End simulation") : T(K().act + " 끝내기", "Finish " + K().act.toLowerCase());
        $("go").classList.add("stop");
        $("sim").style.display = "none";
        $("share").style.display = "none";
        $("parkGo").style.display = "none";
        barFit();
        $("arrived").style.display = "none";
        $("noteBtn").style.display = sim ? "none" : "block";   // 시험 걷기는 기록이 남지 않아 사진 · 메모도 받지 않습니다
        drawNoteMarkers();
        if (sim) {
            hike.simD = 0;
            hike.simLast = performance.now();
            SIM_SPEED = SIM_SPEEDS[0];
            simMul(SIM_SPEED);
            $("gps").textContent = T("시험 ", "Sim ") + SIM_SPEED + "×";
            $("gps").title = T("누르면 시험 걷기 빠르기 바꾸기", "Tap to change simulation speed");
            $("gps").style.cursor = "pointer";
            $("gps").className = "";
            hike.simTimer = setInterval(simStep, 200);   // 빨리 걸어도 지도가 덜 튀게
            simStep();
        } else if (BG) {
            // 앱 - 화면을 끄거나 다른 앱으로 가도 위치를 받습니다(알림창에 "따라가는 중"이 떠 있는 동안)
            $("gps").textContent = T("GPS 찾는 중…", "Finding GPS…");
            $("gps").className = "";
            // 2026-10-11 점검: 시작 → 끝 → 다시 시작이 첫 addWatcher 답보다 빠르면 첫 감시가 남아 위치가 두 번씩 · 알림이 안 사라졌음 - 이번 시작 번호로만
            var bgGen = hike.bgGen = (hike.bgGen || 0) + 1;
            // 2026-10-17 PC: Capacitor.Plugins 로 받은 BG 의 addWatcher(콜백 방식)는 Promise 가 아니라 감시 번호를 바로 돌려줌 -
            // .then 에서 TypeError 로 bgWatch 가 저장되지 않아 끝내도 "산행 중" 알림 · 감시가 남았음. 둘 다 받게 Promise.resolve 로 감쌈
            Promise.resolve(BG.addWatcher({ backgroundTitle: T("routefly - " + K().act + " 중", "routefly - " + K().act.toLowerCase() + " in progress"),
                            backgroundMessage: T("화면을 꺼도 위치를 기록하고 갈림길 · 코스 이탈을 알려 줍니다." + (window.RFParty && RFParty.get() ? " 산악회 인솔자에게도 위치를 제공합니다(목적: 산행 안전 확인)." : ""),
                                "Keeps recording and warns at junctions or off-trail even with the screen off." + (window.RFParty && RFParty.get() ? " Also shares your location with the club leader (purpose: hiking safety)." : "")),
                            requestPermissions: true, stale: false, distanceFilter: 0 },   // 0: 멈춰 있어도 위치가 와야 움직임 없음 알림이 화면이 꺼진 채로도 돎(2026-10-16 홍TV님 폰: 20분인데 30분째에 뜸) - 작은 움직임은 onFix 가 일찍 끝냄
                function (loc, err) {
                    if (err) {
                        if (err.code === "NOT_AUTHORIZED") hAsk(T("위치 권한이 꺼져 있습니다. 설정을 열어 routefly 의 위치를 '앱 사용 중에만 허용' 으로 바꿀까요?", "Location permission is off. Open settings and allow location for routefly (\"While using the app\")?"), { ok: T("설정 열기", "Open settings") })
                            .then(function (ok) { if (ok) BG.openSettings(); });
                        onGpsError({ code: err.code === "NOT_AUTHORIZED" ? 1 : 2 });
                        return;
                    }
                    if (loc) onFix({ timestamp: loc.time, coords: { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy,
                                                                altitude: loc.altitude, speed: loc.speed, heading: loc.bearing } });
                })).then(function (id) {
                    if (hike.running && !hike.sim && bgGen === hike.bgGen) hike.bgWatch = id;
                    else Promise.resolve(BG.removeWatcher({ id: id })).catch(function () { /* 이미 멈춤 */ });   // 그 사이 끝냈거나 다시 시작했으면
                }).catch(function () { onGpsError({ code: 2 }); });
            // 2026-10-08 (홍TV님 - 배터리): 앱은 화면을 꺼도 위치 · 음성 안내가 이어지므로 화면을 켜 두지 않습니다(Wake Lock 안 함).
            // 화면이 가장 큰 배터리 소비라, 주머니에 넣고 다니라고 한 번 알립니다. 브라우저는 화면이 꺼지면 멈추므로 아래처럼 켜 둡니다.
            batteryGuide();
            toast(EN ? "Recording and voice alerts (junctions, off-trail) keep going with the screen off - turn it off to save battery."
                + (batterySave ? " (Battery saver on)" : " Tap the GPS label at the top for battery saver.")
                : "화면을 꺼도 기록 · 갈림길 · 코스 이탈 음성 안내가 이어집니다. 배터리를 아끼려면 화면을 꺼 두세요."
                + (batterySave ? " (배터리 절약 켬)" : " 위쪽 GPS 글자를 누르면 배터리 절약 모드."), 7000);
        } else {
            $("gps").textContent = T("GPS 찾는 중…", "Finding GPS…");
            $("gps").className = "";
            hike.watch = navigator.geolocation.watchPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
            keepAwake();
        }
        hike.timer = setInterval(render, 1000);
        render();
    }

    /**
     * 앱 - 처음 한 번, 폰 절전이 화면 꺼진 동안 위치를 끊지 않게 배터리 "제한 없음" 을 안내(2026-10-17 PC: 배터리 최적화 대상이었음,
     * 홍TV님 송산에서 오르는 동안 기록이 끊긴 것으로 보임). 앱 설정 화면을 열어 줌(BG.openSettings).
     */
    function batteryGuide() {
        if (lsGet("rf-batt-asked") === "1") return;
        try { localStorage.setItem("rf-batt-asked", "1"); } catch (e) { /* 이번만 */ }
        hAsk(EN ? "So recording does not stop with the phone in your pocket, set routefly's battery use to \"Unrestricted\".\n\nOpen settings? (App info → Battery → Unrestricted)"
                : "화면을 끄고 주머니에 넣어도 위치 기록이 끊기지 않게, routefly 배터리 사용을 '제한 없음' 으로 바꿔 주세요.\n\n"
                + "설정을 열까요? (애플리케이션 정보 → 배터리 → 제한 없음)", { ok: T("설정 열기", "Open settings") }).then(function (ok) {
            if (ok) Promise.resolve(BG.openSettings()).catch(function () { /* 설정 못 엶 */ });
        });
    }

    /** 끝내기 확인 - 기록은 지우지 않고 "내 기록" 에 남깁니다(finishRecord). */
    function askStop() {
        if (!hike.running) return;
        if (hike.sim) { stopHike(); return; }
        if (hike.stillAsk) stillReset();   // 끝내기를 누른 것도 답 - 묻는 창 · 초 세기를 멈춤(2026-10-16 PC: endSheet 에서 망설이다 SOS 가 열릴 수 있었음)
        $("endTitle").textContent = T(K().act + "을 여기서 끝낼까요?", "Finish your " + K().act.toLowerCase() + " here?");
        $("endSheet").style.display = "flex";
    }

    function stopHike() {
        if (!hike.running) return;
        hike.running = false;
        stopTalking();
        if (hike.watch != null) navigator.geolocation.clearWatch(hike.watch);
        if (hike.bgWatch != null && BG) Promise.resolve(BG.removeWatcher({ id: hike.bgWatch })).catch(function () { /* 이미 멈춤 */ });
        hike.bgWatch = null;
        hike.watch = null;
        clearInterval(hike.timer);
        clearInterval(hike.simTimer);
        if (hike.wake) { try { hike.wake.release(); } catch (e) { /* 무시 */ } hike.wake = null; }
        var wasSim = hike.sim;
        if (!wasSim) {
            finishRecord();
            clearSaved();
        } else finishRecord(true);
        hike.sim = false;
        compassOff();   // 2026-10-10 점검: 다 걸은 뒤에도 센서를 계속 받던 것
        $("go").textContent = T(K().act + " 시작", "Start " + K().act.toLowerCase());
        $("go").classList.remove("stop");
        $("sim").style.display = "";
        $("save").style.display = "";
        $("share").style.display = isGpxId(c.id) ? "none" : "";
        $("parkGo").style.display = parkHref ? "" : "none";
        barFit();
        $("turn").style.display = "none";
        $("noteBtn").style.display = "none";
        hike.notes = [];
        drawNoteMarkers();
        map.getSource("guide").setData({ type: "FeatureCollection", features: [] });
        hike.guideShown = false;
        $("gps").textContent = T("GPS 꺼짐", "GPS off");
        $("gps").className = "";
        $("offroute").style.display = "none";
        stillReset();
        hike.pace = null;
        paceTick();   // 글 · 흐린 점 치움
    }

    /** 화면이 꺼지지 않게(지원하는 브라우저에서). 다른 앱에 갔다 오면 다시 겁니다. */
    function keepAwake() {
        if (!("wakeLock" in navigator)) return;
        navigator.wakeLock.request("screen").then(function (w) { hike.wake = w; }).catch(function () { /* 배터리 절약 모드 등 */ });
    }
    // 2026-10-09 (카카오톡 브라우저에 며칠 전 화면이 남아 'GPX 열기' 가 안 보였음) → 2026-10-10 새로 배포되면 '새 버전' 띠만 띄우고
    // 누를 때 새로 고침(저절로 고치지 않음). 걷는 중에는 띠도 띄우지 않고 끝낸 뒤에.
    RF.notifyDeploy(["hike.html", "js/hike.js", "js/course-kit.js", "css/course-kit.css"], function () { return !hike.running; });
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden" && hike.running) flushTrack();   // 앱이 닫히기 전에 걸은 길을 남김
        if (compass.on) compassListen(document.visibilityState === "visible");   // 안 보이는 동안 나침반 센서를 놓음
        if (document.visibilityState === "visible" && hike.running && !hike.sim && !BG) keepAwake();   // 앱은 화면을 켜 두지 않음(위 start)
    });

    // 배터리 적음 알림(2026-10-23 홍TV님 지리산 - 하산 끝에 배터리가 다 되어 핸드폰이 꺼짐). 20% 에 한 번 알리고 10% 에 기록을 바로 남김.
    // 걸은 길은 30초마다 이 핸드폰에 남으니 꺼져도 다시 열면 이어집니다. 크롬 · 앱(안드로이드)만 배터리를 알려 줌.
    if (navigator.getBattery) navigator.getBattery().then(function (b) {
        function check() {
            if (!hike.running || hike.sim || b.charging) return;
            var left = c ? km(Math.max(0, c.total - hike.d)) : "";
            if (b.level <= 0.2 && !hike.bat20) {
                hike.bat20 = true;
                toast(EN ? "🔋 Battery " + Math.round(b.level * 100) + "%" + (left ? ", " + left + " km to go" : "") + ". Dim the screen and close other apps. Your hike is saved, so it continues if you reopen this page."
                    : "🔋 배터리 " + Math.round(b.level * 100) + "%" + (left ? " · 남은 길 " + left + "km" : "") + ". 화면을 어둡게 하고 다른 앱을 닫으세요. 기록은 저장되고 있어 꺼져도 다시 열면 이어집니다.", 10000);
                say(T("배터리가 20퍼센트 남았습니다. 연락용 배터리를 남겨 두세요.", "Battery is at 20 percent. Keep some for calls."), { urgent: true });
            }
            if (b.level <= 0.1 && !hike.bat10) { hike.bat10 = true; flushTrack(); save(); }
        }
        b.addEventListener("levelchange", check);
        b.addEventListener("chargingchange", check);
        setInterval(check, 60000);
    }).catch(function () { /* 알려 주지 않는 브라우저 */ });

    function onGpsError(e) {
        $("gps").className = "bad";
        $("gps").textContent = e.code === 1 ? T("위치 권한 없음", "No location permission") : T("GPS 신호 없음", "No GPS signal");
        if (e.code === 1) toast(T("위치 권한이 꺼져 있습니다. 브라우저 설정에서 이 사이트의 위치 권한을 허용해 주세요.", "Location permission is off. Allow location for this site in your browser settings."), 7000);
        // 2026-10-23 홍TV님 지리산 칼바위 - 카카오톡 안 브라우저에서는 'GPS 신호 없음', 크롬으로 여니 바로 ±3m. 한 번만 알림.
        else if (/KAKAOTALK/i.test(navigator.userAgent) && !hike.kakaoGps) {
            hike.kakaoGps = true;
            toast(T("카카오톡 안 화면은 위치를 잘 받지 못합니다. 오른쪽 위 ⋮ → '다른 브라우저로 열기'로 크롬 · 삼성 인터넷에서 열어 주세요.", "KakaoTalk's built-in browser often can't get your location. Tap ⋮ (top right) → 'Open in another browser' to use Chrome."), 10000);
        }
    }

    /** 위치 한 번 - 코스에 맞추고 화면을 고칩니다. */
    function onFix(pos) {
        if (!c || !hike.running) return;
        var co = pos.coords, t = pos.timestamp || now();
        var acc = co.accuracy;
        if (DEBUG && (!hike.dbgT || Date.now() - hike.dbgT > 60000)) {
            hike.dbgT = Date.now();
            console.info("[rf] fix " + new Date().toTimeString().slice(0, 8) + " acc " + Math.round(acc || 0) + " still " + (hike.still ? Math.round((now() - hike.still.t) / 1000) + "s" : "-") + " ask " + !!hike.stillAsk);
        }
        if (!hike.sim) stillTick();   // 화면이 꺼지면 render 타이머가 멈춰도 위치가 올 때마다 움직임 없음을 셈(앱 - 백그라운드 위치)
        // 앞 위치에서 3m(배터리 절약 10m)도 안 움직였고 10초 안이면 나머지는 건너뜀(distanceFilter 0 이라 멈춰 있을 때도 1초마다 옴 - 배터리 · 계산)
        if (!hike.sim && hike.fix && t - hike.fix.t < 10000 && RF.distM(hike.fix.lat, hike.fix.lon, co.latitude, co.longitude) < (batterySave ? 10 : 3)) return;   // 배터리 절약은 10m
        if (!hike.sim) {
            $("gps").className = acc != null && acc <= 30 ? "ok" : "";
            $("gps").textContent = "GPS ±" + (acc == null ? "?" : Math.round(acc)) + "m";
            if (acc != null && acc > 100) return;   // 너무 부정확한 위치는 쓰지 않습니다(실내 · 계곡 첫 신호)
            // 2026-10-23 홍TV님 천왕봉 아래: 위치 하나가 멀리 튀어 "코스에서 벗어났습니다" → 곧바로 "돌아왔습니다", 속도 132.7km/h.
            // 걷거나 자전거로 갈 수 없는 빠르기로 뛴 위치는 버립니다. 3번 잇따르거나 20초 넘게 버렸으면(차를 탔음 등) 그대로 받습니다.
            var pf = hike.fix, lim = K() === RF.KINDS.bike ? 25 : 10;   // m/s(걷기 36km/h · 자전거 90km/h)
            if (pf && t > pf.t) {
                var jump = RF.distM(pf.lat, pf.lon, co.latitude, co.longitude);
                if (jump > 30 + (acc || 0) && jump / ((t - pf.t) / 1000) > lim && (hike.jumps || 0) < 3 && t - pf.t < 20000) { hike.jumps = (hike.jumps || 0) + 1; return; }
            }
            hike.jumps = 0;
        }
        hike.fix = { lat: co.latitude, lon: co.longitude, acc: acc, alt: co.altitude, t: t };
        if (!hike.sim && window.RFParty) RFParty.fix(co.latitude, co.longitude, acc);   // 산악회 방에 참가했을 때만 인솔자에게(party-kit.js, 30초마다)
        addTrack(co.latitude, co.longitude, t, co.altitude);
        if (!hike.sim) stampCheck(co.latitude, co.longitude, acc);   // 국토종주 인증센터 · 100대 명산 정상 도장(실제 GPS 만)
        var s = RF.snap(c, co.latitude, co.longitude, hike.lastFix ? hike.d : null);
        var dtFix = hike.lastFix ? Math.max(0, t - hike.lastFix) / 1000 : null;
        hike.lastFix = t;
        hike.off = s.off;
        // 2026-10-23 홍TV님 장터목 → 유암폭포: 코스 선이 실제 길과 50m 안팎으로 어긋난 곳에서 "벗어났습니다" · "돌아왔습니다" 가 되풀이됨.
        // 50m 밖이 20초 이어져야 벗어남, 35m 안으로 들어와야 돌아옴.
        if (s.off > OFF_ROUTE_M) { if (!hike.offT) hike.offT = t; if (hike.sim || t - hike.offT >= 20000) hike.offShown = true; }
        else if (s.off <= OFF_ROUTE_M * 0.7) { hike.offT = 0; hike.offShown = false; }
        if (s.off <= OFF_ROUTE_M * 2) {   // 코스에서 아주 멀면 진행 거리는 그대로 둡니다
            // 송산: 시작 버튼을 누른 뒤 코스 0.86km 지점으로 들어갔는데 0 부터 걸은 것으로 쳐서 3분 만에 81kcal · 1,353보
            if (hike.d0 == null) hike.d0 = s.d;
            // 2026-10-23 홍TV님 지리산 로터리대피소: 지그재그 길에서 위치가 위쪽 굽이로 잘못 붙어 앞으로 확 뛰었다 돌아오니
            // "되돌아감" 으로 보고 코스가 거꾸로 바뀜. 걸어서 갈 수 없는 만큼(30m + 초당 3m) 앞으로 뛴 것은 가장 멀리 간 자리로 치지 않습니다.
            var reach = dtFix == null ? s.d : Math.min(s.d, hike.d + 30 + 3 * dtFix);
            hike.d = s.d;
            if (reach > (hike.dMax || 0) || !hike.dMaxAt) hike.dMaxAt = { lat: co.latitude, lon: co.longitude };   // 가장 멀리 간 자리(실제 위치)
            hike.dMax = Math.max(hike.dMax || 0, reach);
        }
        // 빠르기 - GPS 가 주면 그것, 아니면 최근 1분 이동 거리로
        hike.hist.push({ t: t, lat: co.latitude, lon: co.longitude });
        while (hike.hist.length > 2 && t - hike.hist[0].t > 60000) hike.hist.shift();
        var v = co.speed;
        if (v != null && v > (K() === RF.KINDS.bike ? 25 : 10)) v = null;   // 튄 값(132.7km/h)은 최근 1분 이동으로
        if (v == null || !isFinite(v)) {
            var h0 = hike.hist[0], dt = (t - h0.t) / 1000;
            v = dt >= 10 ? distM(h0.lat, h0.lon, co.latitude, co.longitude) / dt : null;
        }
        if (v != null) hike.speed = hike.speed == null ? v : hike.speed * 0.7 + v * 0.3;
        setMe(co.latitude, co.longitude, co.heading);
        if (hike.follow) map.easeTo({ center: [co.longitude, co.latitude], zoom: Math.max(map.getZoom(), 15), duration: 600 });
        // 코스를 따라 되돌아가면(올라가다 내려옴) 거꾸로 된 코스로 - "벗어났다" 대신 내려가는 길 안내
        // 한 번 튄 위치로 바꾸지 않게 1분 동안 계속 되돌아간 상태일 때만(2026-10-23 지리산)
        // 2026-10-23 장터목 아래로 내려가는데 서너 번 거꾸로 바뀜 - 코스 위 거리만 줄고(대피소 앞 되돌이 길 · 위치 붙는 자리) 몸은
        // 그대로였음. 가장 멀리 간 자리에서 실제로 100m 넘게 떨어졌을 때만 되돌아간 것으로 봅니다.
        var turned = !hike.sim && s.off <= OFF_ROUTE_M && hike.dMax - hike.d >= TURN_BACK_M
            && hike.dMaxAt && RF.distM(hike.dMaxAt.lat, hike.dMaxAt.lon, co.latitude, co.longitude) >= 100;
        if (!turned) hike.backT = 0;
        else if (!hike.backT) hike.backT = t;
        if (turned && t - hike.backT >= 60000) {
            hike.backT = 0;
            adoptCourse(RF.reverseCourse(c), T("되돌아가는 길로 안내를 바꿨습니다.", "Switched guidance to the way back."));
            s = { d: hike.d, off: hike.off };
        }
        checkBranch(co.latitude, co.longitude, s);
        if (!hike.arrived && c.total - hike.d <= ARRIVE_M && s.off <= OFF_ROUTE_M) {
            hike.arrived = true;
            var endPoi = c.pois.filter(function (q) { return +q.dist_m > c.total - 60 && +q.off_route_m < 60; }).pop();
            var fin = hike.paceFin = paceFinal();   // 지난번과 견준 도착 시간(2026-10-16 PC: 도착하면 옆 글이 사라져 결과를 못 봄)
            $("arrived").textContent = "🎉 " + (endPoi ? NM(endPoi.name) + " " : "") + T("도착! ", "- you made it! ") + km(c.total) + "km · " + hhmmss(now() - hike.start) + (fin ? " · " + fin : "");
            $("arrived").style.display = "block";
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            if (EN) say("You have arrived" + (endPoi ? " at " + NM(endPoi.name) : "") + ". " + skm(c.total) + " kilometers, " + spokenTime(now() - hike.start)
                + ", about " + num(effort().kcal) + " kilocalories. " + (fin ? fin + ". " : "") + "Well done!", { urgent: true });
            else say((endPoi ? endPoi.name + " " : "") + "도착입니다. " + skm(c.total) + "킬로미터, " + spokenTime(now() - hike.start)
                + ", 약 " + num(effort().kcal) + "킬로칼로리. " + (fin ? fin.replace("빠름", "빨랐습니다. ").replace("늦음", "늦었습니다. ").replace("비슷", "비슷했습니다. ") : "") + "수고하셨습니다.",
                { urgent: true });
        }
        checkJunction();
        voiceProgress();
        save();
        render();
    }

    /**
     * 갈림길에서 코스가 아닌 다른 길(주변 코스)로 들어섰는지. 들어설 때 한 번 알리고(빨간 띠 · 음성 - render),
     * 그 길로 BRANCH_SWITCH_M 더 가면 그 길을 새 코스로 바꿉니다(가는 쪽으로 뒤집어서).
     */
    function checkBranch(lat, lon, s) {
        if (hike.sim || s.off <= 40 || s.off > FAR_M) { hike.branch = null; return; }
        var cur = hike.branch, pick = null;
        trails.forEach(function (t) {
            if (!t.id) return;
            var st = RF.snap(t, lat, lon, cur && cur.id === t.id ? cur.lastD : null);
            if (st.off > BRANCH_ON_M) return;
            // 같은 길을 쓰는 코스가 여럿이면 하던 것을 그대로(번갈아 바뀌면 거리를 못 셉니다)
            var keep = cur && cur.id === t.id;
            if (!pick || keep || (!pick.keep && st.off < pick.st.off - 3)) {
                if (!pick || !pick.keep) pick = { t: t, st: st, keep: keep };
            }
        });
        if (!pick) { hike.branch = null; return; }
        if (!cur || cur.id !== pick.t.id) {
            hike.branch = { id: pick.t.id, name: pick.t.name, d0: pick.st.d, lastD: pick.st.d, loading: false };
            return;
        }
        cur.lastD = pick.st.d;
        if (!cur.loading && Math.abs(pick.st.d - cur.d0) >= BRANCH_SWITCH_M) {
            cur.loading = true;
            var back = pick.st.d < cur.d0;   // 그 코스를 거꾸로 걷는 중
            getJson("api/course?id=" + encodeURIComponent(cur.id)).then(function (j) {
                if (!hike.running || hike.branch !== cur) return;
                var nc = RF.fromApi(cur.id, j);
                if (nc.lon.length < 2) throw new Error("경로 점 없음");
                adoptCourse(back ? RF.reverseCourse(nc) : nc, T("가시는 길로 코스를 바꿨습니다.", "Switched the trail to the path you are on."));
            }).catch(function () { cur.loading = false; });
        }
    }

    /** 걷는 중에 코스를 바꿉니다(거꾸로 · 다른 길). 걸은 길 · 시간은 그대로, 칼로리 등은 지금까지 한 것에 이어 셉니다. */
    function adoptCourse(nc, msg) {
        var sg = segEffort(), b = hike.base || { dist: 0, up: 0, down: 0 };
        hike.base = { dist: b.dist + sg.dist, up: b.up + sg.up, down: b.down + sg.down };
        var track = hike.track;
        clearSaved();   // 예전 코스 이름으로 남긴 것
        c = nc;
        hike.paceFin = "";
        hike.pace = null;   // 뒤집거나 다른 길로 바뀐 코스 - 지난 기록과 자리가 안 맞음
        var f = hike.fix, s = f ? RF.snap(c, f.lat, f.lon, null) : { d: 0, off: 0 };
        hike.d = s.d;
        hike.off = s.off;
        hike.d0 = s.d;
        hike.dMax = s.d;
        hike.dMaxAt = f ? { lat: f.lat, lon: f.lon } : null;
        hike.offT = 0;
        hike.offShown = s.off > OFF_ROUTE_M;
        hike.backT = 0;
        hike.segT0 = now();
        hike.passed = {};
        hike.voiceD = null;
        hike.alerted = {};
        hike.arrived = false;
        hike.branch = null;
        hike.wasOff = false;
        hike.guideBr = null;
        hike.kmSpoken = Math.floor(s.d / (K() === RF.KINDS.bike ? 5000 : 1000));
        voice.last = {};
        $("arrived").style.display = "none";
        $("offroute").style.display = "none";
        RF.showName($("name"), c.course.name, true);
        nameLevel();
        document.title = RF.nameText(c.course.name, true);
        // 새로 고침하면 이 코스로 이어서 - 들어온 화면 표시(&from=series · &m=산)는 남김(새로 고친 뒤에도 ‹ 가 그 화면으로)
        var keepHash = (location.hash.match(/&(from|m)=[^&]*/g) || []).join("");
        try { history.replaceState(null, "", "#c=" + encodeURIComponent(c.id) + keepHash); } catch (e) { /* 주소만 못 바꿈 */ }
        drawCourse(true);
        prof = RF.profile($("profile"), c, { gaps: RF.shownGaps(c) });
        boardBtn();
        try {
            localStorage.setItem(saveKey() + "-track", JSON.stringify(track));
            // 2026-10-09 점검: 사진 · 메모도 새 이름으로 다시 남깁니다(clearSaved 가 지워 다시 열면 메모가 사라졌음)
            if (hike.notes.length && !hike.sim) localStorage.setItem(saveKey() + "-notes", JSON.stringify(hike.notes));
        } catch (e) { /* 공간 부족 */ }
        save();
        var end = c.course.name.split(" → ").pop();
        toast("🔀 " + msg + "\n" + NM(c.course.name), 6000);
        if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
        say(EN ? msg + " " + skm(Math.max(0, c.total - hike.d)) + " kilometers to " + spokenName(end) + "." : msg + " " + spokenName(end) + "까지 " + skm(Math.max(0, c.total - hike.d)) + "킬로미터입니다.", { urgent: true });
        render();
    }

    /** 갈림길 80m 앞이면 한 번 알립니다(진동 + 파란 띠) - "40m 앞 갈림길 · 오른쪽 길". */
    function checkJunction() {
        var box = $("turn");
        if (hike.off > OFF_ROUTE_M) { box.style.display = "none"; return; }
        var next = null;
        (c.junctions || []).forEach(function (jd) { if (jd > hike.d - 15 && (next == null || jd < next)) next = jd; });
        if (next == null || next - hike.d > 80) { box.style.display = "none"; return; }
        var ahead = Math.max(0, Math.round(next - hike.d));
        box.textContent = "🔀 " + (ahead < 15 ? T("갈림길", "Junction") : EN ? "Junction in " + ahead + " m" : ahead + "m 앞 갈림길") + " · " + RF.turnWord(c, next);
        box.style.display = "block";
        if (!hike.alerted[next]) {
            hike.alerted[next] = true;
            if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
            var w = RF.turnWord(c, next);
            say(EN ? (ahead < 15 ? "Junction. " : "Junction in " + ahead + " meters, ") + w + "." : (ahead < 15 ? "갈림길입니다. " : ahead + "미터 앞 갈림길, ") + w + (/길$/.test(w) ? "입니다." : "하세요."), { urgent: true });
        }
    }

    /**
     * 시험 걷기 배수(SIM_X · SIM_CLOCK) - 미리보기 1× 비행 시간에 코스를 다 걷고(× 고른 빠르기),
     * 시계는 예상 시간(미리보기의 "약 5시간 10분")에 맞춥니다. 2026-10-10 PC: 시계를 평지 3.5km/h 로 셈해 3:12 로 끝났음.
     */
    function simMul(speed) {
        var fly = RF.flightMs(c.total);
        SIM_X = Math.max(1, c.total / (K().simKmh / 3.6) * 1000 / fly) * speed;
        SIM_CLOCK = Math.max(1, RF.standardMs(c.course.kind, c.total, RF.ascentLeft(c, 0)) / fly) * speed;
    }

    /** 모의 산행 - 코스를 따라 걷는 위치를 만들어 onFix 에 넣습니다(약간 흔들리게). */
    function simStep() {
        var nowP = performance.now(), dtReal = nowP - hike.simLast;
        hike.simLast = nowP;
        hike.simClock += dtReal * SIM_CLOCK;
        hike.simD = Math.min(c.total, hike.simD + K().simKmh / 3.6 * dtReal / 1000 * SIM_X);
        var p = RF.at(c, hike.simD), q = RF.at(c, Math.min(c.total, hike.simD + 20));
        var jitter = 4 / 111320;
        onFix({ timestamp: hike.simClock, coords: {
            latitude: p.lat + (Math.random() - 0.5) * jitter, longitude: p.lon + (Math.random() - 0.5) * jitter,
            accuracy: 6, speed: K().simKmh / 3.6 * SIM_X / SIM_CLOCK, heading: bearing(p.lat, p.lon, q.lat, q.lon) } });   // 시계 기준 빠르기(오르막 포함 평균)
        if (hike.simD >= c.total) clearInterval(hike.simTimer);
    }

    // ------------------------------------------------------------------ ② 산행 기록

    function setV(id, text, unit) {
        $(id).innerHTML = "";
        $(id).appendChild(document.createTextNode(text));
        if (unit) {
            var s = document.createElement("small");
            s.textContent = unit;
            $(id).appendChild(s);
        }
    }

    /**
     * 남은 시간(ms) - 표준 산행 시간(평지 4km/h + 오르막 600m/h, 네이스미스 규칙)에
     * 지금까지 걸은 빠르기 비율을 곱합니다(10분 넘게 걸은 뒤부터, 0.6~2.5배).
     */
    function remainingMs(elapsed) {
        var std = function (distM, ascM) { return RF.standardMs(c.course.kind, distM, ascM); };
        var left = std(c.total - hike.d, RF.ascentLeft(c, hike.d));
        var factor = 1;
        // 빠르기 비율은 지금 코스에서 걸은 만큼으로(코스를 바꾼 뒤에도 맞게)
        var d0 = hike.d0 == null ? hike.d : Math.min(hike.d0, hike.d);
        var doneStd = std(hike.d - d0, RF.ascentLeft(c, d0) - RF.ascentLeft(c, hike.d));
        var segEl = hike.running && hike.segT0 ? now() - hike.segT0 : elapsed;
        if (segEl > 600000 && doneStd > 300000) factor = Math.max(0.6, Math.min(2.5, segEl / doneStd));
        return left * factor;
    }

    /** 같은 코스의 가장 최근 기록(500m 넘게 진행)으로 비교 자료 {prof, start(그날)}. 없으면 null. */
    function paceFor(cc) {
        var r = records().filter(function (x) { return x.courseId === cc.id && x.track && x.track.length >= 10 && x.done >= 500; })[0];
        var prof = r ? RF.paceProfile(cc, r.track, r.start) : null;
        return prof ? { prof: prof, start: r.start } : null;
    }

    /** 지난번과 견준 차이(ms, 음수면 빠름) - 둘 다 비슷한 자리(300m 안)에서 출발했고 지난번이 지금 자리까지 갔을 때만. */
    function paceDiff() {
        var p = hike.pace;
        if (!p || !hike.running || hike.sim || hike.d0 == null || Math.abs(p.prof[0][0] - hike.d0) > 300) return null;
        var then = RF.paceAt(p.prof, hike.d);
        return then == null ? null : (now() - hike.start) - then;
    }

    /** 도착 때 지난번 도착과 견준 글("지난번보다 3분 빠름") - 지난번도 끝(100m 안)까지 갔을 때만, 아니면 "". */
    function paceFinal() {
        var p = hike.pace;
        if (!p || hike.sim || hike.d0 == null || Math.abs(p.prof[0][0] - hike.d0) > 300) return "";
        var last = p.prof[p.prof.length - 1];
        return c.total - last[0] > 100 ? "" : RF.paceText((now() - hike.start) - last[1]);
    }

    /** 경과 시간 옆 글 · 지도의 흐린 점(지난번 같은 시각의 자리). */
    function paceTick() {
        // 도착 뒤에는 늘 도착 결과(지난번 도착과 견줌)만 남기고 흐린 점은 치움 - 2026-10-16 PC: 도착 뒤 남기도 · 지워지기도 했음
        var done = hike.running && hike.arrived;
        var diff = done ? null : paceDiff(), el = $("paceTxt");
        var t = (done ? hike.paceFin || "" : RF.paceText(diff)).replace("지난번보다 ", "").replace(" than last time", "");   // 도착 순간 값(그 뒤 시계가 가도 그대로)
        if (el.textContent !== (t ? "· " + t : "")) {
            el.textContent = t ? "· " + t : "";
            el.className = /빠름|faster/.test(t) ? "fast" : /늦음|slower/.test(t) ? "slow" : "";
        }
        var gd = diff == null ? null : RF.paceDistAt(hike.pace.prof, now() - hike.start);
        if (gd == null) { if (hike.ghost) { hike.ghost.remove(); hike.ghost = null; } return; }
        var g = RF.at(c, gd);
        if (!hike.ghost) {
            var e = document.createElement("div");
            e.className = "ghost";
            e.title = T("지난번의 나(같은 경과 시간)", "You last time (same elapsed time)");
            hike.ghost = marker(e, [g.lon, g.lat]);
        } else hike.ghost.setLngLat([g.lon, g.lat]);
    }

    /**
     * 움직임 없음 알림(2026-10-16 홍TV님) - 걷는 중 STILL_MS 동안 STILL_M 안에 있으면 묻고, STILL_ANSWER_MS 안에 답이 없으면 SOS 화면을 엶.
     * 문자 · 전화는 저절로 보내지 않습니다(사람이 눌러야). 정상에서 쉬다가 "괜찮아요" 를 누르면 다시 20분.
     */
    function stillTick() {
        if (!hike.running || hike.sim || hike.arrived) return;
        var t = now(), f = hike.fix;
        if (hike.stillAsk) {
            var left = Math.ceil((hike.stillAsk + STILL_ANSWER_MS - t) / 1000);
            if (left > 0) { $("stillLeft").textContent = EN ? "If there is no answer in " + left + " s, the emergency screen opens." : left + "초 안에 답이 없으면 긴급 신고 화면을 엽니다."; return; }
            hike.stillAsk = 0;
            hike.still = null;
            $("stillSheet").style.display = "none";
            $("sos").click();
            hike.sosAuto = true;   // 저절로 연 SOS 화면 - "괜찮아요" 를 누르면 함께 닫음(2026-10-17 PC: SOS 위에 다시 물으면 괜찮아요 뒤에도 SOS 가 남았음)
            if (navigator.vibrate) navigator.vibrate([600, 200, 600, 200, 600]);
            say(T("답이 없어 긴급 신고 화면을 열었습니다. 도움이 필요하면 119 전화나 문자 신고를 누르세요.", "No answer, so the emergency screen is open. If you need help, tap call 119 or text 119."), { urgent: true, force: true });
            safetyNotify(T("🚨 긴급 신고 화면을 열었습니다", "🚨 Emergency screen opened"), T("도움이 필요하면 routefly 를 열어 119 전화 · 문자 신고를 누르세요.", "If you need help, open routefly and call or text 119."));
            return;
        }
        // 쓸 만한 위치(오차 100m 안)가 3분 넘게 없으면 묻지 않음 - 걷는 중인데 위치가 안 들어와(숲 · 주머니 · 폰 절전) "움직임 없음" 으로
        // 잘못 물었음(2026-10-17 홍TV님 송산: 큰길 → 덕기봉이 직선 하나, 오르는 내내 "괜찮으세요?"). 위치가 다시 오면 그 자리부터 셈
        if (!f || t - f.t > 180000) return;
        var st = RF.stillCheck(hike.still, { lat: f.lat, lon: f.lon, acc: f.acc, t: f.t }, t, STILL_M, STILL_MS);
        hike.still = st.anchor;
        if (!st.due) return;
        hike.stillAsk = t;
        $("endSheet").style.display = "none";   // 끝내기 창을 열어 둔 채 20분 - 겹치지 않게 묻는 창만(2026-10-16 PC)
        $("stillText").textContent = EN ? "No movement for " + Math.round((t - hike.still.t) / 60000) + " minutes. If you are OK, tap below." : Math.round((t - hike.still.t) / 60000) + "분째 움직임이 없습니다. 괜찮으면 아래를 눌러 주세요.";
        $("stillSheet").style.display = "flex";
        if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
        say(T("괜찮으세요? 오랫동안 움직임이 없습니다. 괜찮으면 화면의 괜찮아요를 눌러 주세요.", "Are you OK? You have not moved for a long time. If you are fine, tap I'm OK on the screen."), { urgent: true, force: true });   // 음성을 꺼 두었어도 안전 알림은 말함
        safetyNotify(EN ? "Are you OK? No movement for " + Math.round((t - hike.still.t) / 60000) + " min" : "괜찮으세요? " + Math.round((t - hike.still.t) / 60000) + "분째 움직임이 없습니다",
            T("routefly 를 열어 '괜찮아요' 를 눌러 주세요. 1분 안에 답이 없으면 긴급 신고 화면을 엽니다.", "Open routefly and tap \"I'm OK\". With no answer in 1 minute the emergency screen opens."));
    }

    function stillReset() {
        hike.stillAsk = 0;
        hike.still = null;   // 다음 위치부터 다시 20분
        $("stillSheet").style.display = "none";
        safetyNotify(null);
    }

    /**
     * 앱 - 폰 알림(알림창 + 진동 + 소리)으로도 알림. 화면이 꺼지면 웹뷰의 navigator.vibrate 가 막혀 진동이 없었음(2026-10-17).
     * text 가 null 이면 떠 있는 알림을 치움. 알림 권한은 백그라운드 위치("산행 중" 알림)와 같은 것.
     */
    var SAFETY_NOTE_ID = 7001, safetyChannel = null, safetyGen = 0;
    function safetyCancel() {
        var one = { notifications: [{ id: SAFETY_NOTE_ID }] };
        Promise.resolve(LN.cancel(one)).catch(function () { /* 없음 */ });
        if (LN.removeDeliveredNotifications) Promise.resolve(LN.removeDeliveredNotifications(one)).catch(function () { /* 없음 */ });   // 알림창에 떠 있는 것까지
    }
    function safetyNotify(title, body) {
        if (!LN) return;
        var g = ++safetyGen;   // 2026-10-17 PC: 띄우는 중(채널 만들기 기다림)에 "괜찮아요" 로 치우면 늦게 뜬 알림이 남았음 - 그 뒤 다시 치움
        if (!title) { safetyCancel(); return; }
        if (!safetyChannel) safetyChannel = LN.createChannel({ id: "rf-safety", name: T("routefly 안전 알림", "routefly safety alerts"), description: T("움직임 없음 · 긴급 신고 알림", "No-movement and emergency alerts"),
            importance: 5, visibility: 1, vibration: true }).catch(function () { /* 안드로이드 8 아래 · 이미 있음 */ });
        safetyChannel.then(function () {
            return LN.schedule({ notifications: [{ id: SAFETY_NOTE_ID, title: title, body: body || "", channelId: "rf-safety" }] });
        }).then(function () { if (g !== safetyGen) safetyCancel(); }).catch(function () { /* 알림 권한 없음 - 음성 · 화면으로만 */ });
    }

    function render() {
        if (!c) return;
        var d = hike.d, p = RF.at(c, d), g = RF.grade(c, d);
        setV("sDone", km(d), "km");
        setV("sLeft", km(Math.max(0, c.total - d)), "km");
        var oe = RF.officialEleAt(c, d);   // 정상 가까이(50m)면 공식 높이(2026-10-16 홍TV님: 대청봉 도착인데 해발 1,700m)
        setV("sEle", oe != null ? num(oe) : p.ele == null ? "-" : num(p.ele), "m");
        setV("sGrade", g == null ? "-" : (g > 0 ? "↗ " : g < 0 ? "↘ " : "") + num(Math.abs(g)), "%");
        setV("sSpeed", hike.speed == null || !hike.running ? "-" : num(hike.speed * 3.6, 1), "km/h");
        var elapsed = hike.running ? now() - hike.start : 0;
        setV("sTime", hhmmss(elapsed));
        stillTick();
        paceTick();
        setV("sAsc", num(RF.ascentLeft(c, d)), "m");
        var ef = effort(), bike = K() === RF.KINDS.bike;
        setV("sKcal", num(ef.kcal), "kcal");
        setV("sUp", num(ef.up), "m");
        $("stepsBox").style.display = bike ? "none" : "";
        if (!bike) setV("sSteps", num(ef.steps), T("보", ""));
        setLabel("kcalK", T("칼로리 ", "Calories "), body.kg + "kg ✎");
        setLabel("stepsK", T("걸음 ", "Steps "), body.cm + "cm ✎");
        var nowMs = hike.running ? now() : Date.now();
        var sun = RF.sunset(nowMs, c.lat[0], c.lon[0]);
        $("sunTxt").textContent = sun ? T("· 일몰 ", "· sunset ") + clock(sun) : "";
        $("etaBox").classList.remove("late");
        if (d >= c.total - ARRIVE_M) setV("sEta", T("도착", "Arrived"));
        else {
            var rem = remainingMs(elapsed), eta = nowMs + rem;
            // 🌇 해 지기 1시간 전이면 한 번 알림(도착 예상과 상관없이 - 산은 해가 지기 전부터 어두워짐. 2026-10-18 홍TV님)
            if (sun && hike.running && !hike.sun60 && nowMs >= sun - 3600000 && nowMs < sun) {
                hike.sun60 = true;
                toast(EN ? "🌇 Sunset in about 1 hour (" + clock(sun) + "). It gets dark early in the mountains - get your headlamp ready and head down."
                    : "🌇 해 지기 1시간 전입니다(일몰 " + clock(sun) + "). 산은 일찍 어두워지니 헤드랜턴을 준비하고 하산을 서두르세요.", 10000);
                say(T("해 지기 한 시간 전입니다. 헤드랜턴을 준비하고 하산을 서두르세요.", "Sunset is in about one hour. Get your headlamp ready and head down."), { urgent: true });
                if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
            }
            setV("sEta", clock(eta), " (" + RF.hm(rem, true) + ")");
            // 해 지기 30분 전까지 못 닿을 것 같으면 빨갛게 + 한 번 알림
            if (sun && eta > sun - 1800000) {
                $("etaBox").classList.add("late");
                if (hike.running && !hike.sunWarned) {
                    hike.sunWarned = true;
                    toast(EN ? "⚠ Your expected finish is later than 30 minutes before sunset (" + clock(sun - 1800000) + "). Consider turning back early."
                        : "⚠ 예상 도착이 해 지기 30분 전(" + clock(sun - 1800000) + ")보다 늦습니다. 일찍 돌아서는 것도 생각하세요.", 8000);
                    say(T("주의하세요. 예상 도착이 해 지기 30분 전보다 늦습니다. 일찍 돌아서는 것도 생각하세요.", "Caution. You are expected to finish less than 30 minutes before sunset. Consider turning back early."), { urgent: true });
                    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
                }
            }
            if (hike.running && hike.lateNext && nowMs > hike.lateNext) {
                hike.lateNext += 3600000;
                toast(EN ? "⏰ You are past your planned return time (" + clock(hike.lateAt) + "). If you are fine, let your family know - SOS at the top can text your location."
                    : "⏰ 귀가 예정(" + clock(hike.lateAt) + ")보다 늦어지고 있습니다. 괜찮다면 가족에게 알려 주세요 - 위쪽 SOS 에서 위치 문자를 보낼 수 있습니다.", 12000);
                say(T("귀가 예정 시각이 지났습니다. 괜찮다면 가족에게 알려 주세요.", "You are past your planned return time. If you are fine, let your family know."), { urgent: true });
                if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
            }
        }
        var nx = RF.nextPoi(c, d);
        if (nx) {
            var np = RF.at(c, +nx.dist_m);
            var dEle = np.ele != null && p.ele != null ? np.ele - p.ele : null;
            $("next").innerHTML = "";
            $("next").appendChild(document.createTextNode(T("다음 지점 ", "Next ")));
            var b = document.createElement("b");
            b.textContent = NM(nx.name);
            $("next").appendChild(b);
            $("next").appendChild(document.createTextNode(" · " + km(+nx.dist_m - d) + T("km 앞", " km")
                + (dEle == null ? "" : " · " + (dEle >= 0 ? T("오르막 +", "up +") : T("내리막 ", "down ")) + num(dEle) + "m")));
        } else {
            $("next").textContent = T("다음 지점 없음 - 도착까지 ", "No more points - finish in ") + km(Math.max(0, c.total - d)) + "km";
        }
        // 국립공원 위험지역 - 앞 120m 에서 한 번(소리 · 진동), 조망점은 지날 때 한 번
        if (hike.running) {
            // 알릴 위험지역을 한 번에 모아 한 알림으로(가까이 붙은 둘이 따로 뜨면 앞 알림이 곧바로 덮여 안 보임 - 2026-10-10 PC: 4곳 중 3번).
            // 한참(60m 넘게) 지난 것은 말없이 넘김
            var from = hike.d0 == null ? 0 : hike.d0, dz, due = [];
            while ((dz = RF.dangerAhead(c, d, 120, hike.spotDone, from))) {
                hike.spotDone[RF.spotKey(dz)] = true;
                if (+dz.dist_m >= d - 60) due.push(dz);
            }
            // 알릴 것 바로 뒤(50m 안)에 붙은 위험도 함께 - 따로 알리면 몇 초 만에 앞 알림을 덮음
            if (due.length) while ((dz = RF.dangerAhead(c, +due[due.length - 1].dist_m - 120 + 50, 120, hike.spotDone, from))) {
                hike.spotDone[RF.spotKey(dz)] = true;
                due.push(dz);
            }
            if (due.length) {
                var ahead = Math.max(0, Math.round((+due[0].dist_m - d) / 10) * 10);
                var what = due.map(function (z) { return RF.spotText(z); }).filter(function (t, k, a) { return a.indexOf(t) === k; });
                var words = due.map(function (z) { return z.info && z.info !== "기타" ? z.info : z.name; }).filter(function (t, k, a) { return a.indexOf(t) === k; });
                toast("⚠️ " + (ahead > 20 ? ahead + T("m 앞 ", " m ahead: ") : "") + what.join(" · ") + T(" - 조심하세요", " - take care"), 7000);
                say(EN ? (ahead > 20 ? "In " + ahead + " meters, " : "Here, ") + words.map(NM).join(", ") + ". Take care." : (ahead > 20 ? ahead + "미터 앞 " : "여기는 ") + words.join(", ") + " 구간입니다. 조심하세요.", { urgent: true });
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
            var vw;
            while ((vw = RF.viewAt(c, d, hike.spotDone, from)) && +vw.dist_m < d - 200) hike.spotDone[RF.spotKey(vw)] = true;
            if (vw && !due.length) {   // 위험 알림과 겹치면 다음 번에
                hike.spotDone[RF.spotKey(vw)] = true;
                toast("🔭 " + RF.spotText(vw), 6000);
                say(EN ? NM(vw.name) + (vw.view_az != null ? ", a good view to the " + RF.azWord(vw.view_az) + "." : ".") : vw.name + (vw.view_az != null ? ", " + RF.azWord(vw.view_az) + "쪽 경치가 좋습니다." : "입니다."));
            }
        }
        // 국립공원 위치표지판(지리10-05) - 지금 자리(산행 중 GPS, 아니면 코스 위 자리)에서 500m 안의 가장 가까운 것. 119 신고 때 말할 번호
        var here = hike.running && !hike.sim && hike.fix ? hike.fix : p, ns = RF.nearSign(c, here.lat, here.lon);
        $("sign").hidden = !ns;
        if (ns) $("sign").textContent = T("📍 위치표지 ", "📍 Location sign ") + RF.signText(ns);
        // 코스에서 벗어남 - 가장 가까운 등산로(지금 코스 · 주변 길)까지 거리 · 방향, 지도에 점선
        if (hike.running && hike.offShown && hike.fix) {
            var me = hike.fix, nt, br, far = hike.off > FAR_M;
            if (far !== hike.farMode) {   // 멀리 ↔ 코스 근처로 바뀌면 그 상황 안내를 바로 다시
                hike.farMode = far;
                hike.wasOff = false;
                voice.last.off = 0;
            }
            // 아직 코스에 닿기 전이고 멀면(먼 산 · 차로 가야 할 때) 출발점 길찾기 단추
            var notYet = hike.d0 == null || hike.d <= 60;
            hike.navTo = far || (notYet && hike.off > 100)   // 주차장 · 정류장(들머리 100m 밖)부터
                ? (notYet ? { lat: c.lat[0], lon: c.lon[0], name: startName() || T("코스 출발점", "trail start"), head: true }
                          : { lat: RF.at(c, hike.d).lat, lon: RF.at(c, hike.d).lon, name: T("코스 마지막 자리", "your last spot on the trail") })
                : null;
            $("navBtn").style.display = hike.navTo ? "inline-block" : "none";
            // 3km 안이면 걷기 길찾기(네이버 지도 앱은 실제 길을 따라 걷기 경로) - 주차장 · 정류장에서 들머리까지
            var nearNav = hike.navTo && !far && hike.fix && distM(hike.fix.lat, hike.fix.lon, hike.navTo.lat, hike.navTo.lon) <= 3000;
            $("navBtn").textContent = EN ? (hike.navTo && !notYet ? (nearNav ? "🚶 Walk back to the trail" : "🚗 Directions back to the trail")
                : nearNav ? "🚶 Walk to the trailhead" : "🚗 Directions to the start")
                : hike.navTo && !notYet ? (nearNav ? "🚶 코스로 돌아가는 걷기 길찾기" : "🚗 코스로 돌아가는 길찾기")
                : nearNav ? "🚶 들머리 걷기 길찾기" : "🚗 출발점 길찾기";
            if (far) {
                // 아주 멀리(집 · 차로 이동 중 등) - 주변 길 말고, 아직 출발 전이면 출발점, 가던 중이면 마지막으로 있던 코스 자리로
                var tp = RF.at(c, hike.d <= 60 ? 0 : hike.d), sp = hike.d <= 60 ? startName() : null;
                nt = { lat: tp.lat, lon: tp.lon, off: distM(me.lat, me.lon, tp.lat, tp.lon) };
                br = bearing(me.lat, me.lon, nt.lat, nt.lon);
                if (EN) {
                    $("offText").textContent = hike.d <= 60
                        ? distText(nt.off) + " " + dirWord(br) + " to the trail start" + (sp ? " (" + NM(sp) + ")" : "") + ". Guidance starts when you get there."
                        : distText(hike.off) + " from the trail · " + distText(nt.off) + " " + dirWord(br) + " to your last spot";
                    say(hike.d <= 60 ? distSpoken(nt.off) + " to the trail start. Guidance starts when you get there." : "You are " + distSpoken(hike.off) + " from the trail.", { key: "off", gap: 600000 });
                } else {
                $("offText").textContent = hike.d <= 60
                    ? "코스 출발점" + (sp ? "(" + sp + ")" : "") + "까지 " + distText(nt.off) + " · " + dirWord(br) + ". 출발점에 가면 안내가 시작됩니다."
                    : "코스에서 " + distText(hike.off) + " 떨어져 있습니다 · 마지막 자리까지 " + distText(nt.off) + " · " + dirWord(br);
                say(hike.d <= 60 ? "코스 출발점까지 " + distSpoken(nt.off) + " 남았습니다. 출발점에 가면 안내를 시작합니다."
                                 : "코스에서 " + distSpoken(hike.off) + " 떨어져 있습니다.", { key: "off", gap: 600000 });
                }
            } else {
                nt = nearestTrail(me.lat, me.lon);
                if (hike.branch) {   // 다른 길 위 - 코스 쪽을 가리키고, 계속 가면 바꾼다고 한 번 알림
                    var cs = RF.snap(c, me.lat, me.lon, null), cp = RF.at(c, cs.d);
                    nt = { lat: cp.lat, lon: cp.lon, off: cs.off, course: true };
                }
                // 아직 코스에 닿기 전 - 주차장 · 정류장에서 들머리까지 걷기 안내(코스 중간이 훨씬 가까우면 거기로)
                var toHead = false;
                if (notYet && !hike.branch) {
                    var h0 = RF.at(c, 0), dHead = distM(me.lat, me.lon, h0.lat, h0.lon);
                    if (!(nt.course && nt.off < dHead / 3)) { nt = { lat: h0.lat, lon: h0.lon, off: dHead, course: true }; toHead = true; }
                }
                br = bearing(me.lat, me.lon, nt.lat, nt.lon);
                if (toHead) {
                    var hn = startName();
                    $("offText").textContent = EN ? distText(nt.off) + " " + dirWord(br) + " to " + (hn ? "the trailhead (" + NM(hn) + ")" : "the trail start") + ". Guidance starts when you arrive."
                        : (hn ? "들머리(" + hn + ")" : "코스 출발점") + "까지 " + distText(nt.off) + " · " + dirWord(br) + ". 도착하면 안내가 시작됩니다.";
                    // 5분에 한 번(2026-10-17 홍TV님 폰: 8~15초마다 되풀이 - voice.last 가 지워져도 따로 셈), 300m 넘게 다가가면 그때도
                    var hs = hike.headSaid;
                    if (!hs || Date.now() - hs.t >= 300000 || hs.off - nt.off >= 300) {
                        hike.headSaid = { t: Date.now(), off: nt.off };
                        say(EN ? distSpoken(nt.off) + " " + dirWord(br) + " to " + (hn ? spokenName(hn) : "the trail start") + "." : (hn ? spokenName(hn) : "코스 출발점") + "까지 " + dirWord(br) + " " + distSpoken(nt.off) + "입니다.");   // urgent 아님 - 안전 알림을 끊지 않게
                    }
                } else if (hike.branch) {
                    $("offText").textContent = EN ? "You are on a different path · the trail is " + distText(nt.off) + " " + dirWord(br) + ". Keep going and the trail switches to this path."
                        : "코스가 아닌 다른 길로 들어섰습니다 · 코스는 " + dirWord(br) + " " + distText(nt.off) + ". 이 길로 계속 가면 이 길로 코스를 바꿉니다.";
                    say(EN ? "You are on a different path. The trail is " + distSpoken(nt.off) + " " + dirWord(br) + ". If you keep going, the trail switches to this path."
                        : "코스가 아닌 다른 길로 들어섰습니다. 코스는 " + dirWord(br) + " " + distSpoken(nt.off) + "입니다. 이 길로 계속 가시면 코스를 바꿉니다.",
                        { key: "branch", gap: 600000, urgent: true });
                } else if (notYet && nt.course) {   // 아직 코스에 닿기 전(벗어난 것이 아님)
                    $("offText").textContent = EN ? "Not on the trail yet · " + distText(nt.off) + " " + dirWord(br) : "아직 코스 밖입니다 · 코스까지 " + distText(nt.off) + " · " + dirWord(br);
                    say(EN ? "The trail is " + distSpoken(nt.off) + " " + dirWord(br) + "." : "코스까지 " + dirWord(br) + " " + distSpoken(nt.off) + "입니다.", { key: "off", gap: 300000 });
                } else {
                    $("offText").textContent = EN ? "Off trail by " + distText(hike.off) + " · " + (nt.course ? "back to the trail " : (nt.name ? "nearest path (" + NM(nt.name) + ") " : "nearest trail "))
                        + distText(nt.off) + " " + dirWord(br)
                        : "코스에서 " + distText(hike.off) + " 벗어남 · "
                        + (nt.course ? "코스로 돌아가는 길 " : (nt.name ? "가장 가까운 길(" + nt.name + ")" : "가장 가까운 등산로") + "까지 ")
                        + distText(nt.off) + " · " + dirWord(br);
                    // 벗어난 순간 한 번, 계속 벗어나 있으면 2분마다
                    say(EN ? "You are off the trail. " + (nt.course ? "The trail is " : "The nearest path is ") + distSpoken(nt.off) + " " + dirWord(br) + "."
                        : "코스에서 벗어났습니다. " + (nt.course ? "코스는 " : "가장 가까운 길은 ") + dirWord(br) + " " + distSpoken(nt.off) + "입니다.",
                        { key: "off", gap: hike.wasOff ? 120000 : 0, urgent: !hike.wasOff });
                }
            }
            // 화살표: 나침반이 있으면 핸드폰 위쪽 기준(그쪽으로 몸을 돌려 걷게), 없으면 지도(북쪽 위) 기준
            hike.guideBr = br;
            turnGuideArrow();
            $("offroute").style.display = "flex";
            hike.wasOff = true;
            hike.guideShown = true;
            map.getSource("guide").setData({ type: "Feature", properties: {},
                geometry: { type: "LineString", coordinates: [[me.lon, me.lat], [nt.lon, nt.lat]] } });
        } else {
            if (hike.running && hike.wasOff && !hike.offShown) {
                hike.wasOff = false;
                voice.last.off = 0;
                say(T("코스로 돌아왔습니다.", "Back on the trail."), { urgent: true });
            }
            $("offroute").style.display = "none";
            hike.guideBr = null;
            // 2026-10-10 점검: 매초 빈 자료를 다시 넣던 것 - 안내선을 그려 둔 때(guideShown)에만 지웁니다
            if (hike.guideShown && map.getSource("guide")) {
                map.getSource("guide").setData({ type: "FeatureCollection", features: [] });
                hike.guideShown = false;
            }
        }
        if (prof) prof.set(d);
        if (boardOpenNow && Date.now() - boardDrawn > 5000) drawBoard();   // 열려 있으면 5초마다 현위치를 다시
        if (map.getLayer("route-done")) map.setPaintProperty("route-done", "line-gradient", progressGradient(d / c.total));
    }

    // ------------------------------------------------------------------ 📋 안내판(2026-10-16 홍TV님) - 공단 탐방로 안내판처럼 구간 경사 + 🔴 현위치

    var board = null, boardOpenNow = false, boardDrawn = 0;
    /** "다음 지점" 줄 오른쪽 "📋 안내판" 단추 - 등산 · 걷기 코스만(자전거는 경사 단계가 맞지 않음). 그래프 안에 두니 "최고" 높이를 가렸음(2026-10-16). */
    function boardBtn() {
        board = null;
        $("boardOpen").hidden = !c || K() === RF.KINDS.bike || !c.ele || c.ele.filter(function (e) { return e != null; }).length < 2;
    }
    $("boardOpen").addEventListener("click", function (e) { e.stopPropagation(); openBoard(); });
    function drawBoard() {
        if (!board) {
            var pts = c.dist.map(function (d, i) { return [c.lon[i], c.lat[i], c.ele[i], d]; });
            var ends = (RF.nameEnds(c.course.name) || [T("출발", "Start"), T("도착", "Finish")]).map(NM);
            // 지점은 음성이 말하는 것과 같게(길에서 80m - 정상 160m 안) - 2026-10-16 PC: 안내판의 설악루(길에서 먼 지점)를 지나도 음성이 없었음
            board = RF.boardSegments(pts, (c.pois || []).filter(function (q) { return !q.end && !(+q.off_route_m > (RF.isTopName(q.name) ? 160 : 80)); }), ends[0], ends[1], true);   // 걷는 쪽 그대로(내려가는 코스도 왼쪽 → 오른쪽)
        }
        RF.boardProfile($("boardBox"), board, EN, hike.running || hike.d > 0 ? hike.d : null);
        boardDrawn = Date.now();
    }
    function openBoard() {
        $("boardSheet").style.display = "flex";
        boardOpenNow = true;
        drawBoard();   // 칸이 보인 뒤 그려야 폭을 앎
    }
    $("boardClose").addEventListener("click", function () { $("boardSheet").style.display = "none"; boardOpenNow = false; });

    // ------------------------------------------------------------------ 코스 고르기

    // 미리보기 화면에서 '← 뒤로' 로 돌아왔을 때 브라우저가 이 화면을 그대로 살리면(bfcache) 검색어를 다시 맞춥니다
    window.addEventListener("pageshow", function (e) {
        if (e.persisted && $("pick").style.display !== "none" && !hike.running) showPick();
    });

    function showPick(noRestore) {
        $("pick").style.display = "flex";
        document.title = T("routefly 따라가기", "routefly - Follow a trail");   // 코스에서 목록으로 와도 탭 제목이 코스 이름으로 남았음(2026-10-17 PC)
        // 목록이 비었거나(이 화면을 새로 열었을 때) 미리보기 화면에서 다른 말로 찾고 왔으면 마지막 검색을 다시
        if (!noRestore) {
            var last = null;
            try { last = JSON.parse(localStorage.getItem(SEARCH_KEY) || "null"); } catch (e) { /* 없음 */ }
            // 2026-10-10 점검: 검색어 없이 종류 탭만 바꾸고 왔을 때도 탭을 맞춥니다(app.js readSharedSearch 와 같음)
            var lastKind = last ? last.kind || "" : "";
            var kindChanged = last && lastKind !== (kindFilter || "");
            var changed = last && last.q && (last.q !== $("q").value.trim() || kindChanged);
            if (last && last.q && (changed || !$("pickList").querySelector(".it"))) {
                $("q").value = last.q;
                var tab = document.querySelector('#kindTabs button[data-kind="' + lastKind + '"]');
                if (tab) tab.click(); else { var ev = document.createEvent("Event"); ev.initEvent("input", true, true); $("q").dispatchEvent(ev); }
            } else if (kindChanged) {
                var kt = document.querySelector('#kindTabs button[data-kind="' + lastKind + '"]');
                if (kt) kt.click();
            }
            if (!$("q").value.trim() && !nearAt) pickHome();   // 코스 화면에서 찜을 넣고 빼고 왔을 때
        }
    }

    /**
     * 길찾기 - 지금 위치 → 출발점을 지도 앱으로(카카오맵 · 네이버 지도 앱 · 구글 지도). 3km 넘으면 차, 아니면 걷기.
     * 앱(안드로이드)에서는 바깥 주소를 그 앱 · 브라우저로 엽니다(Capacitor).
     */
    /** 들머리 가는 길 이름표(배치가 들머리 1km 안에서 넣은 주차장 하나 · 정류장 둘) - 출발 쪽 것만. */
    function accessOf() {
        var out = { parking: null, buses: [] };
        (c ? c.pois : []).forEach(function (p) {
            if (!RF.isAccess(p) || +p.dist_m > 300) return;   // 끝(내려오는 들머리) 쪽 것은 빼고
            if (/주차장/.test(p.name) && !out.parking) out.parking = p;
            else if (/(정류장|정류소)$/.test(p.name)) out.buses.push(p);
        });
        return out;
    }

    function openNav() {
        if (!hike.navTo) return;
        // 차로 가야 할 만큼 멀고 들머리 근처 주차장이 있으면 주차장이 먼저(차는 들머리까지 못 들어감)
        var acc = hike.navTo.head ? accessOf() : { parking: null, buses: [] }, me0 = hike.fix;
        var farHead = me0 ? distM(me0.lat, me0.lon, hike.navTo.lat, hike.navTo.lon) > 3000 : true;
        var targets = [hike.navTo];
        if (acc.parking) {
            var pk = { lat: +acc.parking.lat, lon: +acc.parking.lon, name: acc.parking.name, parking: true };
            targets = farHead ? [pk, hike.navTo] : [hike.navTo, pk];
        }
        var box = $("navTargets");
        box.textContent = "";
        targets.forEach(function (t, i) {
            var b = document.createElement("button");
            b.type = "button";
            b.textContent = (t.parking ? "🅿️ " : "⛰️ ") + NM(t.name);
            b.onclick = function () { navTo(t, acc, b); };
            box.appendChild(b);
            if (i === 0) navTo(t, acc, b);
        });
        box.style.display = targets.length > 1 ? "flex" : "none";
        save();
        $("navSheet").style.display = "flex";
    }

    /** 길찾기 창 - 고른 목적지로 세 지도 앱 주소를 만듭니다. */
    function navTo(to, acc, btn) {
        [].forEach.call($("navTargets").children, function (x) { x.classList.toggle("on", x === btn); });
        var me = hike.fix, far = me ? distM(me.lat, me.lon, to.lat, to.lon) > 3000 : true;
        var nm = String(to.name).replace(/[,/?#&]/g, " ").trim(), lat = to.lat.toFixed(6), lon = to.lon.toFixed(6);
        $("navTitle").textContent = EN ? "Directions to " + NM(nm) : nm + " 길찾기";
        $("navKakao").href = "https://map.kakao.com/link/to/" + encodeURIComponent(nm) + "," + lat + "," + lon;
        // 네이버 지도 앱은 출발지를 비워 두면 '출발지 입력' 으로 남습니다 - 지금 위치를 출발지로 넣습니다
        var from = me ? { lat: me.lat.toFixed(6), lon: me.lon.toFixed(6) } : null;
        $("navNaver").href = "nmap://route/" + (far ? "car" : "walk") + "?"
            + (from ? "slat=" + from.lat + "&slng=" + from.lon + "&sname=" + encodeURIComponent("내 위치") + "&" : "")
            + "dlat=" + lat + "&dlng=" + lon + "&dname=" + encodeURIComponent(nm) + "&appname=" + encodeURIComponent(location.origin);
        // 구글 지도는 우리나라에서 자동차 · 걷기 길찾기를 하지 않습니다('경로를 찾을 수 없음') - 대중교통으로
        $("navGoogle").href = "https://www.google.com/maps/dir/?api=1" + (from ? "&origin=" + from.lat + "," + from.lon : "")
            + "&destination=" + lat + "," + lon + "&travelmode=transit";
        // 카카오톡 안 브라우저는 지도 앱으로 넘어가면 이 화면을 닫기도 합니다 - 다시 열면 이어진다고 알려 둡니다
        var h0 = RF.at(c, 0), walk = to.parking ? distM(to.lat, to.lon, h0.lat, h0.lon) : 0;
        if (EN) {
            $("navTip").textContent = "Opens directions from here to " + NM(nm) + " in a map app."
                + (to.parking ? " From the parking lot it is about " + distText(walk) + " on foot to the trailhead - this screen guides you there." : "")
                + (acc.buses.length ? " Nearby bus stops: " + acc.buses.map(function (b) { return NM(b.name) + " (" + distText(distM(+b.lat, +b.lon, h0.lat, h0.lon)) + " from the trailhead)"; }).join(", ") + "." : "")
                + " Your hike is saved on this device, so it continues when you come back or reopen this screen.";
            return;
        }
        $("navTip").textContent = "지금 위치에서 " + nm + "까지 길을 지도 앱으로 엽니다."
            + (to.parking ? " 주차장에서 들머리까지는 약 " + distText(walk) + " 걸어서 - 이 화면이 들머리까지 안내합니다." : "")
            + (acc.buses.length ? " 가까운 버스 정류장: " + acc.buses.map(function (b) {
                return b.name + "(들머리에서 " + distText(distM(+b.lat, +b.lon, h0.lat, h0.lon)) + ")"; }).join(", ") + "." : "")
            + " 산행 기록은 이 기기에 저장되어 있어, "
            + (/KAKAOTALK/i.test(navigator.userAgent)
                ? "카카오톡 안에서 이 화면이 닫혀도 같은 링크를 다시 열면 그대로 이어집니다."
                : "길찾기 뒤 이 화면으로 돌아오거나 다시 열면 그대로 이어집니다.");
    }
    $("layerBtn").addEventListener("click", function () { setBasemap(basemap === "light" ? "sat" : "light"); });
    $("navBtn").addEventListener("click", openNav);
    $("navClose").addEventListener("click", function () { $("navSheet").style.display = "none"; });
    ["navKakao", "navNaver", "navGoogle"].forEach(function (id) {
        $(id).addEventListener("click", function () { $("navSheet").style.display = "none"; });
    });

    // 글자 크기 "가+"(2026-10-14 홍TV님: 핸드폰에서 글씨가 작음) - 코스 고르기 머리 · 아래 창 제목마다. 새 단추 줄은 만들지 않음
    (function () {
        var h1 = document.querySelector("#pick h1");
        if (h1) h1.appendChild(RF.textButton());
        Array.prototype.forEach.call(document.querySelectorAll(".sheet .sbox > h2, #safety .sbox > h2"), function (h) { h.appendChild(RF.textButton()); });
    })();
    // 🌐 한국어 · English(2026-10-17 홍TV님 - 따라가기 영어) - 첫 화면 아랫줄. 고른 말은 이 기기에 기억
    (function () {
        // 아래 "산악회 방" - 참가한 회원은 방 화면이 없어(인솔자만) 열자마자 이 화면으로 돌아왔음(2026-10-29 홍TV님 "회원이면?") → 위 산악회 띠로 안내
        $("pickFoot").addEventListener("click", function (e) {
            var l = e.target.closest && e.target.closest("a[href^='party.html']"), p = window.RFParty && RFParty.get();
            if (!l || !p || p.role === "lead") return;   // 방이 없으면 참가 · 만들기 화면, 인솔자는 인솔자 화면 그대로
            e.preventDefault();
            var bar = $("partyBar");
            if (bar && !bar.hidden) bar.scrollIntoView({ behavior: "smooth", block: "nearest" });
            toast(T("참가한 산악회 방은 이 화면 아래 산악회 띠에서 봅니다(하산 탑승 · 인솔자에게 · 탑승 카드).", "Your club room is the club bar on this screen (back on bus · message leader · boarding card)."), 6000);
        });
        var foot = $("pickFoot"), a = document.createElement("a");
        a.href = "#";
        a.textContent = EN ? "🌐 한국어" : "🌐 English";
        a.addEventListener("click", function (e) {
            e.preventDefault();
            var to = EN ? "ko" : "en";
            try { localStorage.setItem("rf-lang", to); } catch (err) { /* 주소로 */ }
            location.href = location.pathname + "?lang=" + to + location.hash;
        });
        foot.appendChild(document.createTextNode(" · "));
        foot.appendChild(a);
        if (EN) document.querySelector("#pick .pickNav").setAttribute("href", "en/m/");   // 영어 코스 모음
        // 한국어가 아닌 폰에서 처음 열면 한 번 알려 줌
        if (!EN && !lsGet("rf-lang") && !/^ko/i.test(navigator.language || "ko")) setTimeout(function () { toast("View in English? Tap 🌐 English at the bottom.", 7000); }, 1500);
    })();
    // 도장 · 완주 화면의 따라가기로 들어왔으면(#c=…&from=series) "‹ 도장 · 완주" 로 그 화면에 돌아감(2026-10-13 홍TV님)
    var fromSeries = /[#&]from=series(&|$)/.test(location.hash);
    if (fromSeries) {
        $("back").innerHTML = T("<b>‹</b>도장 · 완주", "<b>‹</b>Stamps");
        $("back").title = T("도장 · 완주 화면으로", "Back to stamps");
    }
    // 산 소개 페이지(/m/산)의 따라가기로 들어왔으면(#c=…&m=산) "‹ 산 이름" 으로 그 페이지에 돌아감(2026-10-14 홍TV님 - 못 돌아갔음)
    var fromMountain = RF.safeDecode((/[#&]m=([^&]+)/.exec(location.hash) || [])[1] || "");
    if (fromMountain) {
        $("back").innerHTML = "<b>‹</b>";
        $("back").appendChild(document.createTextNode(NM(fromMountain)));
        $("back").title = EN ? "Back to " + NM(fromMountain) + " trails" : fromMountain + " 등산코스 화면으로";
    }
    // ‹ - 코스 목록(검색 결과 그대로)으로. 산행 중이면 먼저 끝내도록.
    $("back").addEventListener("click", function (e) {
        e.preventDefault();
        if (hike.running) { toast(EN ? "You are on a " + (hike.sim ? "simulation" : K().act.toLowerCase()) + ". To go back, first tap \"" + $("go").textContent + "\" below."
            : (hike.sim ? "시험 걷기" : K().act) + " 중입니다. " + (fromSeries ? "도장 · 완주 화면" : "코스 목록") + "으로 가려면 먼저 아래 '" + $("go").textContent + "' 를 눌러 주세요.", 4000); return; }   // 단추 글 그대로(시험 걷기 끝내기)
        // 2026-10-17 홍TV님 폰: 목록에서 내 기록 → 기록 선 보기로 왔으면 주소에 코스가 없어(location.hash 이미 빔) ‹ 가 아무것도 안 했음 -
        // "기록 선 지우기" 를 눌러야 됐음. 기록 선을 치우고 목록으로
        if ($("recClear").style.display === "block") clearRecLine();
        if (!/[#&]c=/.test(location.hash)) { showPick(); return; }
        if (fromSeries) { location.href = "series.html"; return; }
        if (fromMountain) {
            var mBack = /\/m\//.test(document.referrer || "");
            try { mBack = mBack || sessionStorage.getItem("rf-fly-back") === "1"; } catch (err) { /* referrer 만 */ }   // 새로 고치면 referrer 가 없음 - 산 소개에서 누를 때 적어 둠
            if (history.length > 1 && mBack) history.back();   // 그 화면 그대로(스크롤 자리)
            else location.href = EN ? "en/m/" + RF.roman(fromMountain).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "m/" + encodeURIComponent(fromMountain);
            return;
        }
        if (fromList) {
            fromList = false;
            history.back();
            // 2026-10-17 홍TV님 폰: ‹ 목록이 안 눌림 - 기록 보기 등으로 같은 코스 주소가 한 번 더 쌓였거나(뒤로 가도 또 코스),
            // 앱을 새로 열어 뒤로 갈 곳이 없으면 그대로였음. 조금 뒤에도 코스 화면이면 목록으로
            setTimeout(function () { if (/[#&]c=/.test(location.hash)) location.hash = ""; }, 400);
        }
        else location.hash = "";
    });

    // 노선 이름 · 다른 이름(data/series.json) - 노선 안내도 카드가 다른 자료의 같은 노선도 잡게. 못 받으면 없이
    // 받기 전에 그린 목록은 받은 뒤 한 번 다시 그림(느린 망 - 2026-10-12 PC)
    var seriesFlat = [], lastList = null;
    jsonOnce("data/series.json").then(function (d) {
        (d.groups || []).forEach(function (g) { seriesFlat = seriesFlat.concat(g.series || []); });
        if (lastList && lastList.seq === pickSeq) listCourses.apply(null, lastList.args);
    }).catch(function () { /* 없이 */ });

    function listCourses(rows, from, note) {
        rows = (rows || []).filter(function (r) { return !RF.isClosedTrail(r.name) && !RF.isHiddenCourse(listNotes, r.course_id); });   // 지금은 없는 탐방로(park-notes hide - 가야산3코스)도   // 비법정탐방로(비매칭코스)는 목록에서 뺌(2026-10-13 홍TV님)
        lastList = seriesFlat.length ? null : { args: [rows, from, note], seq: pickSeq };
        var box = $("pickList");
        box.textContent = "";
        if (note) {
            var nd = document.createElement("div");
            nd.className = "msg";
            nd.textContent = note;
            box.appendChild(nd);
        }
        if (!rows.length) {
            var m = document.createElement("div");
            m.className = "msg";
            m.textContent = from ? T("주변 5km 안에 코스가 없습니다. 산 이름으로 찾아보세요.", "No trails within 5 km. Search by mountain name.") : T("찾은 코스가 없습니다.", "No trails found.");
            box.appendChild(m);
            return;
        }
        // 탐방 안내도 먼저 - 산에 가면 탐방 안내도부터 보고 갈 코스를 고르듯(2026-10-12 홍TV님). 안내도에서 탐방로를 누르면 미리보기 · 산행하기
        // 노선 안내도 - 국토종주 자전거길 · 국가숲길 구간 코스가 있으면 그 노선 전체 지도(2026-10-12 홍TV님)
        var routes = RF.routeGuides(rows, 2, seriesFlat, from ? "" : lastQ);
        routes.forEach(function (g) {
            var a = document.createElement("a");
            a.className = "it guide";
            a.href = "route.html?" + (g.trail ? "trail=" + encodeURIComponent(g.trail) : "prefix=" + encodeURIComponent(g.prefix)) + "&name=" + encodeURIComponent(g.name) + "&back=list";
            var gb = document.createElement("b");
            gb.textContent = (g.kind === "bike" ? "🚴 " : g.kind === "ridge" ? "⛰ " : g.trail ? "🥾 " : "🌲 ") + NM(g.name) + T(" 노선 안내도", " route map");
            var gs = document.createElement("span");
            gs.textContent = EN ? "See every " + (g.trail ? "trail" : "section") + (g.kind === "bike" ? " and checkpoint" : "") + " on the map · " + g.n + " in this list"
                : (g.kind === "bike" ? "인증센터 · " : "") + (g.trail ? "코스" : "구간") + " 전체를 지도로 보고 고르기 · 이 목록 " + g.n + (g.trail ? "코스" : "구간");
            a.appendChild(gb);
            a.appendChild(gs);
            box.appendChild(a);
        });
        RF.guideMaps(rows, 3 - routes.length, from ? "" : lastQ).forEach(function (g) {
            var a = document.createElement("a");
            a.className = "it guide";
            a.href = "park.html?name=" + encodeURIComponent(g.name) + "&from=" + encodeURIComponent(g.from) + "&back=list"
                + (g.label !== g.name ? "&label=" + encodeURIComponent(g.label) : "");   // 지역이 붙은 이름(광양 가야산)은 안내도 제목에도   // ‹ 코스 → 이 목록으로
            var gb = document.createElement("b");
            gb.textContent = "🏞 " + NM(g.label) + T(" 탐방 안내도", " trail map");
            var gs = document.createElement("span");
            gs.textContent = EN ? "See all trails on the map and pick one · " + g.n + " in this list" : "탐방로 전체를 지도로 보고 코스 고르기 · 이 목록 " + g.n + "코스";
            a.appendChild(gb);
            a.appendChild(gs);
            box.appendChild(a);
        });
        var regional = RF.regionNames(rows);
        // 쉬운 코스 거르기(2026-10-15 홍TV님) - 표준 소요 시간 2 · 4시간 이내. 코스가 넷 이상일 때만
        if (rows.length >= 4) {
            var chips = document.createElement("div");
            chips.className = "easy";
            RF.EASY.forEach(function (e) {
                var b = document.createElement("button");
                b.type = "button";
                b.textContent = EN ? ({ "": "All", "2h": "Under 2 h", "4h": "Under 4 h" }[e.key] || e.label) : e.label;
                b.className = e.key === easyKey ? "on" : "";
                b.setAttribute("aria-pressed", e.key === easyKey ? "true" : "false");
                b.onclick = function () { easyKey = e.key; listCourses(rows, from, note); };
                chips.appendChild(b);
            });
            box.appendChild(chips);
        }
        var shown = rows.filter(function (r) { return RF.easyOk(easyKey, r.kind, r.distance_m, r.ascent_m); });
        if (!shown.length) {
            var em = document.createElement("div");
            em.className = "msg";
            em.textContent = T("이 시간 안에 걸을 수 있는 코스가 없습니다. \"모두\" 를 눌러 보세요.", "No trails fit in this time. Tap \"All\".");
            box.appendChild(em);
        }
        var offSet = offlineIds();   // 저장한 코스는 검색 결과에도 ✅ 표시(2026-10-17 PC: 검색어가 남으면 첫 화면 저장 목록이 안 보임)
        shown.forEach(function (r) {
            var it = document.createElement("div");
            it.className = "it";
            var b = document.createElement("b");
            RF.showName(b, r.best ? r.name : RF.noteTrailName(listNotes, r.course_id, regional[r.course_id] || r.name));   // 대표 코스(이은 ID)는 이름 그대로 - 첫 조각 ID 로 공단 이름이 붙지 않게   // 지역 없는 무리에 지역(광양 가야산 자락 1코스)   // 이름을 바로잡은 탐방로(park-notes trails - 설악산 "백담사" → 용대리 → 백담사)
            var s = document.createElement("span");
            var ofn = r.best ? "" : RF.officialName(listNotes, r.course_id);   // 공단 공식 이름(가야산1코스) - 이름에 이미 들었으면 빼고(남산제일봉1코스)
            if (ofn && String(r.name).replace(/\s+/g, "").indexOf(ofn.replace(/\s+/g, "")) >= 0) ofn = "";
            s.textContent = EN ? (r.best ? "★ Featured · " : "") + (r.summit_miss ? "⚠ Does not reach the summit (" + NM(r.summit_miss) + ") · " : "") + (ofn ? "Park: " + NM(ofn) + " · " : "") + km(+r.distance_m) + " km" + (r.ascent_m != null ? " · climb " + num(+r.ascent_m) + " m" : "")
                + (r.steep_pct >= 28 ? " · steepest km " + Math.round(r.steep_pct) + "%" : "")
                + (r.ele_max_m != null ? " · top " + num(+r.ele_max_m) + " m" : "")
                + (r.away != null ? " · " + km(r.away) + " km to start" : "")
                + (offSet.indexOf(String(r.course_id)) >= 0 ? " · ✅ Saved" : "")
                : (r.best ? "★ 대표 코스 " + r.best + " · " : "") + (r.summit_miss ? "⚠ " + r.summit_miss + " 정상 미포함 · " : "") + (ofn ? "공단 " + ofn + " · " : "") + km(+r.distance_m) + "km" + (r.ascent_m != null ? " · 오르막 " + num(+r.ascent_m) + "m" : "")
                + (r.steep_pct >= 28 ? " · 가장 가파른 1km " + Math.round(r.steep_pct) + "%" : "")
                + (r.ele_max_m != null ? " · 최고 " + num(+r.ele_max_m) + "m" : "")
                + (r.away != null ? " · 출발점까지 " + km(r.away) + "km" : "")
                + (offSet.indexOf(String(r.course_id)) >= 0 ? " · ✅ 저장됨" : "");
            var chip = (r.kind === "hike" || r.kind === "trek") && RF.levelChip(+r.distance_m, r.ascent_m != null ? +r.ascent_m : null, EN, r.steep_pct);   // 난이도(2026-10-15 홍TV님 - 공단 안내판 5단계)
            if (chip) { b.appendChild(document.createTextNode(" ")); b.appendChild(chip); }
            it.appendChild(b);
            it.appendChild(s);
            // fly(3D) - 3D 지형 위로 날아 보기(2026-10-13 홍TV님: 실제 코스만, 탐방 안내도 카드는 뺌). 그 화면 ← 는 이 목록으로
            if (!isGpxId(r.course_id)) {   // 이은 코스(대표 코스)도 - 3D 화면이 조각을 받아 이어 그림(2026-10-30 홍TV님)
                var fly = document.createElement("a");
                fly.className = "fly";
                fly.textContent = "fly(3D)";
                fly.href = "index.html#c=" + encodeURIComponent(r.course_id) + (r.title ? "&title=" + encodeURIComponent(r.title) : "") + (r.head ? "&head=" + encodeURIComponent(r.head) : "") + "&from=hike";   // 그 화면 "← 뒤로" 가 새로 고쳐도 남게(2026-10-14)
                fly.title = T("3D 지형 위로 날아 보기", "Fly over the 3D terrain");
                fly.onclick = function (e) {
                    e.stopPropagation();
                    try { sessionStorage.setItem("rf-pick-scroll", String(box.scrollTop)); sessionStorage.setItem("rf-fly-back", "1"); } catch (err) { }   // 3D 에서 돌아오면 목록 그 자리로, rf-fly-back: 3D 의 "← 뒤로" 가 이 화면으로 back
                };
                it.classList.add("hasfly");
                it.appendChild(fly);
            }
            it.onclick = function () {
                fromList = true;   // 대표 코스는 길 이름 · 들머리 이름도(탐방 안내도 대표 코스와 같게 - "3구간 이어 걷기" 대신)
                location.hash = "#c=" + encodeURIComponent(r.course_id) + (r.title ? "&title=" + encodeURIComponent(r.title) : "") + (r.head ? "&head=" + encodeURIComponent(r.head) : "");
            };
            box.appendChild(it);
        });
        // fly(3D) 에서 "← 뒤로" 로 돌아왔으면 목록을 그 자리로(2026-10-13 PC: 맨 위로 갔음) - 한 번만
        try {
            var sc = sessionStorage.getItem("rf-pick-scroll");
            if (sc != null && rows.length) {
                box.scrollTop = +sc;
                // 노선 이름(series.json)을 받은 뒤 목록을 한 번 더 그릴 수 있어 잠깐 남겨 둠
                setTimeout(function () { try { sessionStorage.removeItem("rf-pick-scroll"); } catch (err) { } }, 3000);
            }
        } catch (err) { }
    }

    var searchTimer = 0, fromList = false, easyKey = "";
    var pickSeq = 0;   // 목록을 새로 그릴 때마다 +1 - 늦게 온 예전 검색 응답이 새 목록을 덮지 않게
    // 마지막 검색어 · 종류 - 코스에 들어갔다 돌아와도(새로 고침 · 앱 다시 열기 포함) 그대로.
    // 2026-10-09 홍TV님: 코스 미리보기(index.html · app.js)와 같은 열쇠 - 한쪽에서 '지리산' 을 넣고 넘어가면 다른 쪽에도.
    var SEARCH_KEY = "rf-search";
    // 처음 안내 글 - 검색어를 지워 비우면 다시(2026-10-11 홍TV님: 지운 뒤에도 지리산 목록이 남았음).
    // 빈 채로 종류 탭만 누를 때(내 주변 코스 목록)는 그대로 둡니다
    var PICK_HINT = $("pickList").innerHTML, lastQ = "";
    /** 검색 전 첫 화면 - 안내 글 + 찜한 코스(2026-10-15 홍TV님). */
    /** 첫 화면 칸 제목(크게) + 설명(작게) - 2026-10-18 홍TV님: "저장한 코스 1개" 글자가 작았음. */
    function secHead(el, title, note) {
        var b = document.createElement("b"), sm = document.createElement("small");
        b.textContent = title;
        sm.textContent = note;
        el.appendChild(b);
        el.appendChild(sm);
    }
    function pickHome() {
        var box = $("pickList"), favs = RF.favList();
        box.innerHTML = PICK_HINT;
        // 🔮 오늘의 산행 한마디(코스 모음 /m/ 과 같은 글 - 2026-10-18 홍TV님: 🏠 오늘의 안부는 코스 모음으로 옮기고 이 자리에)
        var td = new Date(), fn = document.createElement("div");
        fn.className = "msg sec fortune";
        secHead(fn, T("🔮 오늘의 산행 한마디", "🔮 Today's trail fortune"), RF.fortuneDay(td.getFullYear(), td.getMonth() + 1, td.getDate(), EN ? "en" : "ko"));
        box.appendChild(fn);
        // 📥 오프라인 저장한 코스 - 통신이 없어도 열면 저장한 범위의 지도가 보입니다
        var offIds = offlineIds(), names = offlineNames();
        if (offIds.length) {
            var oh = document.createElement("div");
            oh.className = "msg sec";
            secHead(oh, EN ? "📥 Saved trails " + offIds.length : "📥 저장한 코스 " + offIds.length + "개",
                EN ? "They open without signal. Remove one with the 📥 button on its screen." : "통신이 끊겨도 열립니다. 지우기는 코스 화면 📥 버튼에서.");
            box.appendChild(oh);
            offIds.forEach(function (oid) {
                var m = names[oid] || {}, it = document.createElement("div"), b = document.createElement("b"), sp = document.createElement("span");
                it.className = "it fav";
                RF.showName(b, String(m.name || (isGpxId(oid) ? T("내 GPX 코스", "My GPX trail") : T("코스 ", "Trail ") + oid)));
                sp.textContent = m.dist ? km(m.dist) + T("km · ✅ 저장됨", " km · ✅ Saved") : T("✅ 저장됨", "✅ Saved");
                it.appendChild(b);
                it.appendChild(sp);
                it.onclick = function () { fromList = true; location.hash = "#c=" + encodeURIComponent(oid); };
                box.appendChild(it);
            });
        }
        if (!favs.length) return;
        var h = document.createElement("div");
        h.className = "msg sec";
        secHead(h, EN ? "★ Favorites " + favs.length : "★ 찜한 코스 " + favs.length + "개", EN ? "Add or remove with ☆ next to the trail name." : "코스 화면 이름 옆 ☆ 로 넣고 뺍니다.");
        box.appendChild(h);
        var withPt = [];
        favs.forEach(function (f) {
            var it = document.createElement("div"), b = document.createElement("b"), sp = document.createElement("span");
            it.className = "it fav";
            RF.showName(b, String(f.name || ""));
            var fchip = (f.kind || "hike") === "hike" && f.dist && RF.levelChip(f.dist, f.asc, EN, f.steep);
            if (fchip) { b.appendChild(document.createTextNode(" ")); b.appendChild(fchip); }
            sp.textContent = (f.dist ? km(f.dist) + "km" : "") + (f.asc != null ? T(" · 오르막 ", " · climb ") + num(f.asc) + "m" : "");
            it.appendChild(b);
            it.appendChild(sp);
            it.onclick = function () {   // 대표 코스는 이름 · 들머리도(예전에 제목 없이 찜한 것은 찜 이름의 길로)
                fromList = true;
                var x = /^&[a-z]+=/.test(f.x || "") ? f.x : "";
                location.hash = "#c=" + encodeURIComponent(f.id) + (RF.parseJoinId(f.id) ? RF.favJoinExtra("#" + x, f.name) : x);
            };
            if (!isGpxId(f.id) && !RF.parseJoinId(f.id)) withPt.push([f, sp]);   // 이은 코스는 주말 날씨 묻기에서 뺌(서버가 한 코스 번호만 앎)
            box.appendChild(it);
        });
        // ☀️ 찜한 코스 주말 날씨(2026-10-16 홍TV님) - 그 코스 들머리의 중기 구역 날씨(api/weekend, 주말 추천과 같은 자료).
        // 코스 번호만 보냄(서버가 DB 에서 들머리를 찾음) - 이 기기의 위치는 보내지 않음(개인정보처리방침)
        if (withPt.length) getJson("api/weekend?ids=" + withPt.slice(0, 20).map(function (x) { return encodeURIComponent(x[0].id); }).join(",")).then(function (w) {
            if (w.unavailable || !w.at) return;
            withPt.slice(0, 20).forEach(function (x, i) {
                var t = RF.weekendText(w, w.at[i]);
                if (t) { var wk = document.createElement("small"); wk.className = "wk"; wk.textContent = t; x[1].parentNode.appendChild(wk); }
            });
        }).catch(function () { /* 날씨 없이 */ });
    }
    pickHome();
    // 내 주변 코스를 보인 자리 - 검색창이 빈 채로 종류 탭을 바꾸면 그 자리에서 그 종류로 다시(2026-10-11 홍TV님: 등산 탭을 눌러도 그대로였음)
    var nearAt = null;
    // 영어 화면 - 로마자로 산 이름을 찾으면 한글 이름으로 찾음("seoraksan" · "Bukhan" → 설악산 · 북한산). 100대 명산 목록에서(2026-10-17)
    var enPeaks = [];
    // 못 받으면(요청 제한 429 등) 다음 검색 때 다시 받고, 받으면 그 검색을 한 번 더(2026-10-17 PC: 처음 seoraksan 0개)
    var enPeaksLoading = null;
    function loadEnPeaks() {
        if (enPeaks.length) return Promise.resolve();
        if (!enPeaksLoading) enPeaksLoading = jsonOnce("data/mountains100.json").then(function (d) {
            enPeaks = ((d && d.peaks) || []).map(function (p) { var ko = String(p.id || p.name); return { ko: ko.replace(/\(.*\)$/, ""), key: RF.roman(ko).toLowerCase().replace(/[^a-z]/g, "") }; });
        }).catch(function () { /* 다음에 다시 */ }).then(function () { enPeaksLoading = null; });
        return enPeaksLoading;
    }
    if (EN) loadEnPeaks();
    function enSearch(q) {
        if (!EN || !/^[a-z][a-z\s'-]*$/i.test(q)) return q;
        if (!enPeaks.length) {   // 아직 못 받음 - 받은 뒤 같은 검색어면 다시
            loadEnPeaks().then(function () { if (enPeaks.length && $("q").value.trim() === q) $("q").dispatchEvent(new Event("input")); });
            return q;
        }
        var k = q.toLowerCase().replace(/[^a-z]/g, "");
        var hit = enPeaks.filter(function (p) { return p.key === k || p.key === k + "san"; })[0] || (k.length >= 4 && enPeaks.filter(function (p) { return p.key.indexOf(k) === 0; })[0]);
        return hit ? hit.ko : q;
    }
    $("q").addEventListener("input", function () {
        clearTimeout(searchTimer);
        var q = this.value.trim();
        try { localStorage.setItem(SEARCH_KEY, JSON.stringify({ q: q, kind: kindFilter })); } catch (e) { /* 무시 */ }
        // 2026-10-10 점검: 검색창을 비우면 순번을 올려, 비우기 전에 보낸 검색 응답(성공 · 실패)이 늦게 와도 버립니다
        var wasQ = lastQ;
        lastQ = q;
        if (!q) {
            pickSeq++;
            if (wasQ) { nearAt = null; pickHome(); }
            else if (nearAt) nearList(nearAt.lat, nearAt.lon);
            return;
        }
        nearAt = null;
        searchTimer = setTimeout(function () {
            var my = ++pickSeq;
            q = enSearch(q);
            // 산 안내(park-notes)에서 이름을 바꾼 코스는 새 이름으로도 찾음(2026-10-13 PC: "공룡능선" 이 0개 - DB 이름은 "큰새봉 1코스")
            var renamed = [];
            Object.keys(listNotes || {}).forEach(function (pk) {
                var tr = listNotes[pk].trails || {};
                Object.keys(tr).forEach(function (k) { if (/-\d+$/.test(k) && /^[a-z]+-\d+-\d+$/.test(k) && tr[k].indexOf(q) >= 0) renamed.push(k); });
            });
            // 공단 공식 이름(park-notes official)으로도 - "가야산1코스" 는 DB 이름이 "해인사 → 상왕봉(우두봉)"(2026-10-13 홍TV님)
            var offs = RF.officialMatches(listNotes, q), offParks = [];
            offs.forEach(function (m) { if (offParks.indexOf(m.park) < 0) offParks.push(m.park); });
            var offRows = Promise.all(offParks.map(function (pk) {
                return getJson("api/courses?q=" + encodeURIComponent(pk) + (kindFilter ? "&kind=" + kindFilter : "")).then(function (j) {
                    return (j.courses || []).filter(function (c) {
                        return offs.some(function (m) { return c.course_id === m.key || c.course_id.indexOf(m.key + "-") === 0; });
                    });
                }, function () { return []; });
            }));
            Promise.all([getJson("api/courses?q=" + encodeURIComponent(q) + (kindFilter ? "&kind=" + kindFilter : ""))].concat(renamed.map(function (id) {
                return getJson("api/course?id=" + encodeURIComponent(id)).then(function (j) { return j.course; }, function () { return null; });
            })).concat([offRows, jsonOnce("data/mountains100.json").catch(function () { return null; })]))
                .then(function (r) {
                    if (my !== pickSeq) return;
                    // 탐방 안내도 대표 코스 가운데 목록에도 둘 것(이은 코스 - 북한산 숨은벽 · 백운대(밤골), 2026-10-30 홍TV님) - 맨 앞에 넣고 정상 먼저로 다시 줄 세움
                    var m100 = r.pop(), rows = RF.summitFirst(RF.listBest(listNotes, q).concat((r[0].courses || []).slice()), q, m100 && m100.peaks,
                        function (x) { return x.best ? x.name : RF.noteTrailName(listNotes, x.course_id, x.name); });   // 명산이면 정상까지 가는 코스 먼저(2026-10-30 홍TV님 북한산 백운대)
                    r.pop().reduce(function (a, b) { return a.concat(b); }, []).reverse().forEach(function (c) {
                        if (!rows.some(function (x) { return x.course_id === c.course_id; })) rows.unshift(c);
                    });
                    r.slice(1).forEach(function (c) {
                        if (c && (!kindFilter || c.kind === kindFilter) && !rows.some(function (x) { return x.course_id === c.course_id; })) rows.unshift(c);
                    });
                    listCourses(rows, null);
                })
                .catch(function (e) { if (my === pickSeq) toast(T("검색 실패: ", "Search failed: ") + e.message); });
        }, 300);
    });

    $("nearMe").addEventListener("click", function () {
        if (!navigator.geolocation || !window.isSecureContext) { toast(T("위치는 https 주소에서만 쓸 수 있습니다. 산 이름으로 찾아보세요.", "Location only works on an https address. Search by mountain name."), 5000); return; }
        toast(T("현재 위치를 찾는 중…", "Finding your location…"));
        navigator.geolocation.getCurrentPosition(function (pos) {
            nearList(pos.coords.latitude, pos.coords.longitude);
        }, function (e) { onGpsError(e); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    });

    /** 내 주변(약 5km) 코스 - 지금 종류 탭(kindFilter)으로, 출발점이 가까운 순. */
    /** 내 주변 코스를 볼 반지름(m) - 출발점이 이 안인 코스, 가까운 순. */
    var NEAR_M = 5000;

    /**
     * 내 주변(약 5km) 코스 - 지금 종류 탭(kindFilter)으로, 출발점이 가까운 순.
     * 2026-10-11 위치기반서비스 비신고 요건 ②: 서버에는 내 위치를 담은 범위를 보내지 않고, 모든 사용자에게 같은 고정 격자 칸
     * (RF.gridCells, 약 10km)만 칸마다 묻습니다. 5km 안 고르기 · 거리 계산은 핸드폰이 정확한 위치로 합니다.
     */
    function nearList(lat, lon) {
        var r = 0.05, my = ++pickSeq;   // 5km 를 덮는 범위(위도 0.045° · 경도는 위도가 높을수록 넓게)
        nearAt = { lat: lat, lon: lon };
        var rl = r / Math.max(0.5, Math.cos(lat * Math.PI / 180));
        var cells = RF.gridCells([lon - rl, lat - r, lon + rl, lat + r]);
        Promise.all(cells.map(function (bb) {
            return getJson("api/courses?bbox=" + bb.map(function (v) { return v.toFixed(1); }).join(",")
                + (kindFilter ? "&kind=" + kindFilter : "")).then(function (j) { return j.courses || []; });
        })).then(function (lists) {
            var seen = {}, rows = [];
            lists.forEach(function (l) {
                l.forEach(function (x) {
                    if (seen[x.course_id]) return;
                    seen[x.course_id] = 1;
                    x.away = distM(lat, lon, +x.start_lat, +x.start_lon);
                    if (x.away <= NEAR_M) rows.push(x);
                });
            });
            rows.sort(function (a, b) { return a.away - b.away; });
            if (my === pickSeq) listCourses(rows, true);
        }).catch(function (e) { if (my === pickSeq) toast(T("코스를 찾지 못했습니다: ", "Could not find trails: ") + e.message); });
    }

    // ------------------------------------------------------------------ 시작

    $("safetyChk").addEventListener("change", function () { $("safetyGo").disabled = !this.checked; });
    [].forEach.call(document.querySelectorAll("#kindTabs button"), function (b) {
        b.addEventListener("click", function () {
            kindFilter = b.getAttribute("data-kind");
            $("q").placeholder = RF.searchPlaceholder(kindFilter);   // 종류마다 다른 안내 글
            setKindWords();
            [].forEach.call(document.querySelectorAll("#kindTabs button"), function (x) {
                x.classList.toggle("on", x === b);
                x.setAttribute("aria-pressed", x === b ? "true" : "false");   // 화면 읽기 프로그램에 지금 탭을 알림
            });
            var ev = document.createEvent("Event"); ev.initEvent("input", true, true); $("q").dispatchEvent(ev);
        });
    });
    $("myRecords").addEventListener("click", showRecords);
    $("recClose").addEventListener("click", function () { $("recSheet").style.display = "none"; });
    $("backupSave").addEventListener("click", backupSave);
    $("xferGet").addEventListener("click", xferReceive);
    $("xferSend").addEventListener("click", function () {
        hAskText(T("받는 기기(PC 등) 화면에 나온 코드 8글자를 넣으세요", "Enter the 8-letter code shown on the receiving device (PC etc.)"), "", { ok: T("보내기", "Send") })
            .then(function (c) { if (c != null) xferSend(c); });
    });
    (function () {   // QR 을 찍어 들어옴(#xfer=코드) - 이 기기 기록을 보낼지 묻고 보냄
        var m = /^#xfer=([A-Za-z0-9]{8})(?:\.([A-Za-z0-9_-]{22}))?$/.exec(location.hash || "");
        if (!m) return;
        try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* 그대로 */ }
        setTimeout(function () {
            recordsReady.then(function () {
                // 남이 보낸 링크로 기록을 빼 가는 것 막기(2026-10-28 보안 점검) - 내 기기 QR 을 내가 직접 찍었을 때만
                hAsk(T("이 기기의 기록 " + records().length + "개(사진 · 도장 · 완주 · 정상 · 걸은 위치 포함)를 QR 을 띄운 기기로 보낼까요?\n\n⚠ 내 PC · 내 폰에 띄운 QR 을 방금 직접 찍었을 때만 확인을 누르세요. 문자 · 카톡으로 받은 링크라면 취소하세요 - 기록이 그 사람에게 갑니다.\n(기기 안에서 암호화해 보냅니다)",
                        "Send this device's " + records().length + " records (with photos, stamps, peaks and where you walked) to the device showing the QR?\n\n⚠ Only confirm if you just scanned a QR on your own PC or phone. If this link came by message, cancel - your records would go to that person.\n(Encrypted on this device)"), { ok: T("보내기", "Send"), danger: true }).then(function (ok) { if (ok) xferSend(m[1], m[2]); });
            });
        }, 800);
    })();
    // 결산은 내 기록 창 대신 띄우고, 닫으면 내 기록으로 돌아감(두 창이 겹쳐 결산이 뒤에 가려졌음)
    $("sumOpen").addEventListener("click", function () { peakPts = null; drawSummary(); $("recSheet").style.display = "none"; $("sumSheet").style.display = "flex"; });
    $("sumClose").addEventListener("click", function () { $("sumSheet").style.display = "none"; $("recSheet").style.display = "flex"; });
    $("sumYear").addEventListener("change", function () { sumYear = +this.value; drawSummary(); });
    Array.prototype.forEach.call($("sumKinds").children, function (b) { b.addEventListener("click", function () { sumKind = b.getAttribute("data-k"); drawSummary(); }); });
    $("backupLoad").addEventListener("click", function () { $("backupFile").value = ""; $("backupFile").click(); });
    $("backupFile").addEventListener("change", function () { if (this.files && this.files[0]) backupLoad(this.files[0]); });
    function clearRecLine() {
        if (mapReady) mapReady.then(function () { map.getSource("recTrack").setData({ type: "FeatureCollection", features: [] }); });
        $("recClear").style.display = "none";
    }
    $("recClear").addEventListener("click", function () {
        clearRecLine();
        if (!c) showPick();   // 코스 없이 기록만 보던 때 - 코스 고르기로 돌아감
    });
    $("doneClose").addEventListener("click", function () { $("doneSheet").style.display = "none"; });

    // ------------------------------------------------------------------ 나침반

    // 2026-10-10 점검: 센서는 초당 60번 남짓 오는데 그때마다 화살표 · 지도 · 내 위치 표시를 다시 그려 배터리를 먹었습니다.
    // 받은 방위만 적어 두고 그리기는 화면 한 장(requestAnimationFrame)에 한 번.
    function onOrientation(e) {
        var h = null;
        if (e.webkitCompassHeading != null) h = e.webkitCompassHeading;                 // 아이폰
        else if (e.absolute && e.alpha != null) h = (360 - e.alpha) % 360;              // 안드로이드(절대 방위)
        if (h == null) return;
        var sa = screen.orientation && screen.orientation.angle ? screen.orientation.angle : (window.orientation || 0);
        compass.raw = (h + sa + 360) % 360;   // 가로 화면 보정
        if (!compass.raf) compass.raf = requestAnimationFrame(drawOrientation);
    }
    function drawOrientation() {
        compass.raf = 0;
        if (!compass.listening || compass.raw == null) return;
        var h = compass.raw;
        compass.heading = h;
        if (hike.guideBr != null) turnGuideArrow();   // 몸을 돌리면 화살표도 바로(GPS 를 기다리지 않고)
        setNeedle(-h);   // 빨간 끝 = 실제 북쪽(핸드폰 위쪽 기준)
        $("compassText").textContent = Math.round(h) + "°";
        var t = performance.now();
        if (compass.up && t - compass.lastTurn > 120) {   // 내 방향으로 지도 돌리기(초당 8번까지)
            compass.lastTurn = t;
            map.rotateTo(h, { duration: 100 });
        }
        if (meMarker && hike.fix) setMe(hike.fix.lat, hike.fix.lon, null);
    }

    /** 나침반 바늘 - 나침반이 켜져 있으면 실제 북쪽, 꺼져 있으면 지도의 북쪽. */
    function setNeedle(deg) {
        $("compass").querySelector(".needle").style.transform = "rotate(" + deg + "deg)";
    }

    /** 센서 받기 켜기 · 끄기 - 두 번 붙지 않게 compass.listening 으로 봅니다. */
    function compassListen(on) {
        if (on === !!compass.listening) return;
        compass.listening = on;
        var ev = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
        if (on) window.addEventListener(ev, onOrientation);
        else {
            window.removeEventListener(ev, onOrientation);
            if (compass.raf) { cancelAnimationFrame(compass.raf); compass.raf = 0; }
        }
    }

    /** 나침반 끄기(산행을 끝냈을 때) - 센서를 놓고 바늘은 다시 지도의 북쪽. */
    function compassOff() {
        if (!compass.on) return;
        compassListen(false);
        compass.on = false;
        compass.raw = compass.heading = null;
        if (compass.up) { compass.up = false; if (map) map.rotateTo(0, { duration: 300 }); }
        $("compass").classList.remove("on", "up");
        if (map) setNeedle(-map.getBearing());
    }

    function compassOn() {
        var go = function () {
            compass.on = true;
            compassListen(true);
            $("compass").classList.add("on");
            setTimeout(function () { if (compass.heading == null) toast(T("이 기기에서는 나침반 방향을 읽지 못했습니다(센서 없음 · 권한 거부).", "Could not read the compass on this device (no sensor or permission denied)."), 5000); }, 2500);
        };
        // 아이폰은 사용자가 누른 순간에 권한을 물어야 합니다
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
            DeviceOrientationEvent.requestPermission().then(function (r) { if (r === "granted") go(); else toast(T("나침반 권한이 거부되었습니다.", "Compass permission was denied.")); })
                .catch(function () { toast(T("나침반 권한을 받지 못했습니다.", "Could not get compass permission.")); });
        } else {
            go();
        }
    }

    // 배터리 절약(앱만, 2026-10-09): 위치를 3m 대신 10m 움직일 때마다 받습니다. 코스 이탈(수십 m) 판단에는 충분하고
    // 기록 선이 조금 거칠어집니다. 위쪽 GPS 글자를 눌러 바꾸고, 다음 "산행 시작" 부터 적용합니다. 브라우저는 바꿀 것이 없어 보이지 않습니다.
    if (BG) {
        $("gps").style.cursor = "pointer";   // className 은 GPS 상태가 바꿉니다
        $("gps").title = T("누르면 배터리 절약 모드 켜기 · 끄기", "Tap to turn battery saver on or off");
        $("gps").addEventListener("click", function () {
            if (hike.sim) return;   // 시험 걷기 중에는 빠르기 단추(아래)
            batterySave = !batterySave;
            try { localStorage.setItem(BATTERY_KEY, batterySave ? "1" : "0"); } catch (e) { /* 이번만 */ }
            toast(EN ? (batterySave ? "Battery saver on - location every 10 m." : "Battery saver off - location every 3 m.") + (hike.running && !hike.sim ? " Applies from your next start." : "")
                : (batterySave ? "배터리 절약 켬 - 위치를 10m 마다 받습니다." : "배터리 절약 끔 - 위치를 3m 마다 받습니다.")
                + (hike.running && !hike.sim ? " 다음 산행 시작부터 적용됩니다." : ""), 4000);
        });
    }

    // 시험 걷기 빠르기 - 1× → 5× → 10× → 40× → 1×
    $("gps").addEventListener("click", function () {
        if (!hike.running || !hike.sim) return;
        SIM_SPEED = SIM_SPEEDS[(SIM_SPEEDS.indexOf(SIM_SPEED) + 1) % SIM_SPEEDS.length];
        simMul(SIM_SPEED);
        this.textContent = T("시험 ", "Sim ") + SIM_SPEED + "×";
    });

    $("kcalBox").addEventListener("click", function () {
        var kg = askNumber(T("몸무게(kg)를 넣어 주세요. 칼로리 추정에만 쓰고 이 기기에만 저장합니다.", "Your weight (kg). Used only to estimate calories and kept on this device."), body.kg, 20, 200);
        if (kg == null) return;
        body.kg = kg;
        saveBody();
        if (c) render();
    });
    $("stepsBox").addEventListener("click", function () {
        var cm = askNumber(T("키(cm)를 넣어 주세요. 걸음 수(보폭) 추정에만 쓰고 이 핸드폰에만 저장합니다.", "Your height (cm). Used only to estimate steps and kept on this phone."), body.cm, 100, 230);
        if (cm == null) return;
        body.cm = cm;
        saveBody();
        if (c) render();
    });

    // 기록 칸 접기 · 펴기 - 아래로 밀면 접고(지도가 커짐) 위로 밀면 폅니다. 손잡이를 눌러도 됩니다. 이 기기에 기억.
    function setCompact(on) {
        document.body.classList.toggle("compact", on);
        try { localStorage.setItem("rf-compact", on ? "1" : "0"); } catch (e) { /* 무시 */ }
        if (map) setTimeout(function () { map.resize(); }, 0);
    }
    try { if (localStorage.getItem("rf-compact") === "1") document.body.classList.add("compact"); } catch (e) { /* 무시 */ }
    $("grip").addEventListener("click", function () { setCompact(!document.body.classList.contains("compact")); });
    var swipeY = null;
    $("stats").addEventListener("touchstart", function (e) { swipeY = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
    $("stats").addEventListener("touchend", function (e) {
        if (swipeY == null || !e.changedTouches.length) return;
        var dy = e.changedTouches[0].clientY - swipeY;
        swipeY = null;
        if (dy > 40) setCompact(true);
        else if (dy < -40) setCompact(false);
    }, { passive: true });

    $("voice").addEventListener("click", function () {
        setVoice(VOICE_LEVELS[(VOICE_LEVELS.indexOf(voice.level) + 1) % VOICE_LEVELS.length]);
        if (voice.level === "on") say(T("음성 안내를 자세히 합니다.", "Detailed voice guide."), { urgent: true });
        else if (voice.level === "short") say(T("음성 안내를 짧게 합니다.", "Short voice guide."), { urgent: true });
        else toast(T("음성 안내를 껐습니다.", "Voice guide off."), 2000);
    });
    setVoice(voice.level);
    if (!TTS && !("speechSynthesis" in window)) $("voice").style.display = "none";   // 읽어 주기가 없는 브라우저

    $("compass").addEventListener("click", function () {
        if (!compass.on) { compassOn(); return; }
        compass.up = !compass.up;   // 켜진 뒤 누르면: 내 방향으로 지도 돌리기 ↔ 북쪽 위로
        $("compass").classList.toggle("up", compass.up);
        if (!compass.up) map.rotateTo(0, { duration: 300 });
        toast(compass.up ? T("내가 보는 방향이 위로 오게 지도를 돌립니다.", "Map now turns with the way you face.") : T("북쪽이 위로 오게 되돌렸습니다.", "North is up again."), 2500);
    });

    // ------------------------------------------------------------------ SOS

    function fillSos(f) {
        $("sosGrid").textContent = f ? (RF.nationalPoint(f.lat, f.lon) || T("범위 밖", "out of range")) : T("위치를 찾는 중…", "Finding location…");
        $("sosLatLon").textContent = f ? f.lat.toFixed(5) + ", " + f.lon.toFixed(5) + (f.acc ? " (±" + Math.round(f.acc) + "m)" : "") : "-";
        // 해발: 산행 중 코스 위면 코스 고도(정상 가까이는 공식 높이), 아니면 GPS 고도.
        // 2026-10-23 홍TV님 천왕봉(1,915m)에서 GPS 고도 1,938m - 핸드폰 GPS 고도는 해수면보다 20~30m 높게 나옴(지오이드)
        var ele = null, eleNote = "";
        if (c && hike.running && hike.off <= OFF_ROUTE_M) { var oe = RF.officialEleAt(c, hike.d); ele = oe != null ? oe : RF.at(c, hike.d).ele; }
        if (ele == null && f && f.alt != null) ele = Math.round(f.alt);
        $("sosEle").textContent = ele == null ? "-" : num(ele) + "m" + (eleNote && EN ? " (trail data)" : eleNote);
        var where = c && hike.running ? km(hike.d) + "km 지점" + (hike.off > OFF_ROUTE_M ? " · 코스에서 " + num(hike.off) + "m 벗어남" : "") : "";
        var whereEn = c && hike.running ? km(hike.d) + " km along" + (hike.off > OFF_ROUTE_M ? " · " + num(hike.off) + " m off the trail" : "") : "";
        $("sosCourse").textContent = c ? (EN ? NM(c.course.name) + (whereEn ? " · " + whereEn : "") : c.course.name + (where ? " · " + where : "")) : "-";
        // 가까운 국립공원 위치표지판 - GPS 가 없으면 산행 중 코스 위 자리로
        var here = f || (c && hike.running && hike.off <= OFF_ROUTE_M ? RF.at(c, hike.d) : null);
        var ns = c && here ? RF.nearSign(c, here.lat, here.lon) : null;
        $("sosSignRow").hidden = !ns;
        $("sosSign").textContent = ns ? RF.signText(ns) : "-";
        // 가까운 구급함 · 헬기장(국립공원 위험지역 자료, 2km 안)
        var kit = c && here ? RF.nearSpot(c, "aid", here.lat, here.lon) : null, heli = c && here ? RF.nearSpot(c, "heli", here.lat, here.lon) : null;
        var helpTxt = [kit ? T("구급함 ", "First-aid box ") + Math.round(kit.m) + "m" : "", heli ? T("헬기장 ", "Helipad ") + Math.round(heli.m) + "m" : ""].filter(Boolean).join(" · ");
        $("sosHelpRow").hidden = !helpTxt;
        $("sosHelp").textContent = helpTxt || "-";

        // 보낼 글 - 화면에 보이는 내용 그대로(구조대가 읽기 쉽게 줄바꿈)
        // 119 문자는 영어 화면이어도 한국어 먼저(구조대가 읽음) + 아래에 영어(2026-10-17 - 외국인 산행객)
        var lines = ["[" + (EN ? "외국인(영어) " : "") + (K().ko || K()).sos + " 긴급 신고]"];
        if (f) {
            lines.push("국가지점번호: " + (RF.nationalPoint(f.lat, f.lon) || "-"));
            lines.push("위치: " + f.lat.toFixed(5) + ", " + f.lon.toFixed(5) + (f.acc ? " (오차 약 " + Math.round(f.acc) + "m)" : ""));
            if (f.acc && f.acc > 100) lines.push("※ GPS 오차가 큼 - 주변 위치표지판 번호를 함께 확인 바람");
        } else {
            lines.push("위치: 확인 못 함 - 위치표지판 번호로 연락 바람");
        }
        if (ns) lines.push("가까운 위치표지판: " + ns.sign.loc_no + " (약 " + Math.round(ns.m) + "m" + (ns.sign.place_name ? ", " + ns.sign.place_name : "") + ")");
        if (kit) lines.push("가까운 구급함: 약 " + Math.round(kit.m) + "m");
        if (heli) lines.push("가까운 헬기장: 약 " + Math.round(heli.m) + "m (" + heli.spot.lat + ", " + heli.spot.lon + ")");
        if (ele != null) lines.push("해발: " + Math.round(ele) + "m" + eleNote);
        if (c) lines.push("코스: " + c.course.name + (where ? " (" + where + ")" : ""));
        var nx = c && hike.running ? RF.nextPoi(c, hike.d) : null;
        if (nx) lines.push("다음 지점: " + nx.name + "까지 " + km(+nx.dist_m - hike.d) + "km");
        lines.push("시각: " + clock(Date.now()));
        var en = [];
        if (EN) {
            en.push("[Emergency - foreign " + K().sos + ", English speaker]");
            if (f) {
                en.push("Korea grid no.: " + (RF.nationalPoint(f.lat, f.lon) || "-"));
                en.push("Location: " + f.lat.toFixed(5) + ", " + f.lon.toFixed(5) + (f.acc ? " (±" + Math.round(f.acc) + " m)" : ""));
            } else en.push("Location: unknown - please use the location sign number");
            if (ns) en.push("Nearest location sign: " + ns.sign.loc_no + " (" + Math.round(ns.m) + " m)");
            if (ele != null) en.push("Elevation: " + Math.round(ele) + " m");
            if (c) en.push("Trail: " + NM(c.course.name) + (whereEn ? " (" + whereEn + ")" : ""));
            en.push("Time: " + clock(Date.now()));
        }
        var body = lines.join("\n") + (en.length ? "\n\n" + en.join("\n") : "");
        sosNow = { f: f, lines: lines, body: body };
        $("sosPhoto").disabled = !f;
        $("sosBody").textContent = body;
        $("sosSms").href = "sms:119" + (/iPhone|iPad/.test(navigator.userAgent) ? "&" : "?") + "body=" + encodeURIComponent(body);
        // 가족 · 지인에게 - 받는 사람은 문자 앱에서 고름(긴급 신고 머리말 대신 안부 머리말)
        var fam = EN ? ["[routefly location] My location while on a " + K().act.toLowerCase() + "."].concat(en.slice(1)).join("\n")
            : ["[routefly 위치 알림] " + K().act + " 중 지금 위치입니다."].concat(lines.slice(1)).join("\n");
        $("sosFamily").href = "sms:" + (/iPhone|iPad/.test(navigator.userAgent) ? "&" : "?") + "body=" + encodeURIComponent(fam);
        $("sosCopy").onclick = function () {
            (navigator.clipboard ? navigator.clipboard.writeText(body) : Promise.reject()).then(function () { toast(T("위치를 복사했습니다.", "Location copied.")); })
                .catch(function () { hAskText(T("복사가 안 됩니다. 아래 칸의 글을 길게 눌러 복사하세요.", "Copy didn't work. Long-press the text below to copy."), body, { ok: T("닫기", "Close") }); });
        };
    }

    // ---- 위치 사진: 지금 지도(내 위치 · 코스 · 주변 등산로) + 문자와 같은 위치 글을 한 장으로 만들어 공유 창으로 보냅니다
    //      (문자 앱이 링크로 글만 받으므로 사진은 공유 창 → 메시지 → 받는 사람 119 로 보냅니다)

    var sosNow = { f: null, lines: [], body: "" };

    function waitIdle(ms) {
        return new Promise(function (resolve) {
            var done = false, finish = function () { if (!done) { done = true; resolve(); } };
            map.once("idle", finish);
            setTimeout(finish, ms);
        });
    }

    /** 지도 그림을 2D 그림판으로 옮깁니다 - WebGL 은 그린 바로 그때(render 이벤트 안)에만 읽을 수 있습니다. */
    function grabMap() {
        return new Promise(function (resolve) {
            map.once("render", function () {
                var cv = map.getCanvas(), out = document.createElement("canvas");
                out.width = cv.width; out.height = cv.height;
                out.getContext("2d").drawImage(cv, 0, 0);
                resolve(out);
            });
            map.triggerRepaint();
        });
    }

    function scaleBar(mpp) {   // 화면 90px 안에 들어가는 깔끔한 거리
        var steps = [20, 50, 100, 200, 500, 1000, 2000, 5000], m = steps[0];
        steps.forEach(function (x) { if (x / mpp <= 110) m = x; });
        return { m: m, px: m / mpp, label: m >= 1000 ? (m / 1000) + "km" : m + "m" };
    }

    function drawLabel(g, text, x, y, size, color) {
        g.font = "bold " + size + "px sans-serif";
        g.lineWidth = size * 0.28; g.strokeStyle = "rgba(0,0,0,0.85)"; g.lineJoin = "round";
        g.strokeText(text, x, y);
        g.fillStyle = color; g.fillText(text, x, y);
    }

    function sosImage(f, lines) {
        var cam = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing() };
        var zoom = f.acc && f.acc > 300 ? 14 : 15;
        map.jumpTo({ center: [f.lon, f.lat], zoom: zoom, bearing: 0 });
        return waitIdle(8000).then(grabMap).then(function (shot) {
            var cssW = map.getContainer().clientWidth || shot.width;
            var px = shot.width / cssW;                        // 화면 1px 이 그림에서 몇 px
            var W = Math.max(720, shot.width), k = W / shot.width, u = px * k;   // u: 화면 1px → 결과 px
            var mapH = Math.round(shot.height * k);
            var fs = Math.round(W / 26), lh = Math.round(fs * 1.45), pad = Math.round(fs * 0.8);
            var H = mapH + pad * 2 + lh * lines.length + Math.round(fs * 1.2);
            var out = document.createElement("canvas");
            out.width = W; out.height = H;
            var g = out.getContext("2d");
            g.fillStyle = "#11161d"; g.fillRect(0, 0, W, H);
            g.drawImage(shot, 0, 0, W, mapH);

            function xy(lon, lat) { var p = map.project([lon, lat]); return { x: p.x * u, y: p.y * u }; }
            g.save();
            g.beginPath(); g.rect(0, 0, W, mapH); g.clip();
            // 코스 이름표(지도 위 DOM 표시는 사진에 안 찍히므로 직접 씁니다)
            g.textAlign = "left"; g.textBaseline = "middle";
            (c ? c.pois : []).forEach(function (q) {
                var p = xy(+q.lon, +q.lat);
                if (p.x < 0 || p.y < 0 || p.x > W || p.y > mapH) return;
                g.beginPath(); g.arc(p.x, p.y, 4 * u, 0, Math.PI * 2);
                g.fillStyle = "#ffd43b"; g.fill(); g.lineWidth = 1.5 * u; g.strokeStyle = "#000"; g.stroke();
                drawLabel(g, RF.poiIcon(q.name) + " " + q.name, p.x + 7 * u, p.y, Math.round(12 * u), "#fff");
            });
            // 내 위치 - 오차 원 + 빨간 점 + "내 위치"
            var me = xy(f.lon, f.lat);
            var mpp = 40075016.686 * Math.cos(f.lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom()));   // 화면 1px 당 m
            if (f.acc) {
                g.beginPath(); g.arc(me.x, me.y, Math.max(8 * u, f.acc / mpp * u), 0, Math.PI * 2);
                g.fillStyle = "rgba(255,59,48,0.18)"; g.fill();
                g.lineWidth = 2 * u; g.strokeStyle = "rgba(255,59,48,0.9)"; g.stroke();
            }
            g.beginPath(); g.arc(me.x, me.y, 9 * u, 0, Math.PI * 2);
            g.fillStyle = "#ff3b30"; g.fill(); g.lineWidth = 3 * u; g.strokeStyle = "#fff"; g.stroke();
            g.textAlign = "center";
            drawLabel(g, "내 위치", me.x, me.y - 22 * u, Math.round(15 * u), "#ff8787");
            g.restore();
            // 북쪽 · 축척
            g.textAlign = "left";
            drawLabel(g, "▲ 북", 10 * u, 18 * u, Math.round(13 * u), "#fff");
            var sb = scaleBar(mpp), y0 = mapH - 14 * u;
            g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(8 * u, y0 - 18 * u, sb.px * u + 16 * u, 26 * u);
            g.fillStyle = "#fff"; g.fillRect(16 * u, y0, sb.px * u, 3 * u);
            g.font = "bold " + Math.round(11 * u) + "px sans-serif"; g.textBaseline = "alphabetic";
            g.fillText(sb.label, 16 * u, y0 - 4 * u);
            // 위치 글(문자와 똑같은 내용)
            var y = mapH + pad + lh * 0.75;
            lines.forEach(function (t, i) {
                g.font = (i === 0 ? "bold " : "") + fs + "px sans-serif";
                g.fillStyle = i === 0 ? "#ff6b6b" : (/^국가지점번호/.test(t) ? "#ffd43b" : "#eef2f6");
                g.fillText(t, pad, y, W - pad * 2);
                y += lh;
            });
            g.font = Math.round(fs * 0.62) + "px sans-serif"; g.fillStyle = "#8a96a3";
            g.fillText("지도: " + (cfg.vworldKey ? "위성사진 국토교통부 V-World · " : "") + "지형 Terrain Tiles · 등산로 산림청 · routefly", pad, H - pad * 0.7, W - pad * 2);
            return out;
        }).finally(function () {
            map.jumpTo(cam);
        });
    }

    function stamp(ms) {
        var d = new Date(ms), p = function (n) { return (n < 10 ? "0" : "") + n; };
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
    }

    var SOS_TIP = T("공유 창에서 <b>메시지</b> → 받는 사람 <b>119</b> → 보내기. 공유 창이 닫혔으면 버튼을 다시 누르세요.",
        "In the share window pick <b>Messages</b> → recipient <b>119</b> → send. If it closed, tap the button again.");
    var PHOTO_LABEL = T("📷 위치 사진 보내기(지도 + 위치 글)", "📷 Send location photo (map + location text)");
    var photoReady = null;   // 만든 사진 {file, url, body} - 공유가 막히면(누른 지 오래됨) 한 번 더 누를 때 보냅니다

    function sharePhoto(p) {
        if (FS && SHARE) {   // 앱 - 공유 창(메시지 → 받는 사람 119)
            $("sosPhotoTip").innerHTML = SOS_TIP;
            return blobToBase64(p.file).then(function (b64) { return nativeShareFile(p.file.name, b64, p.body); })
                .catch(function (e) { if (!/cancel/i.test(String(e && e.message || e))) throw e; });
        }
        if (!(navigator.canShare && navigator.canShare({ files: [p.file] }))) {
            // 공유 창을 못 쓰는 브라우저 - 사진을 저장하게 합니다
            var a = document.createElement("a");
            a.href = p.url; a.download = p.file.name;
            document.body.appendChild(a); a.click(); a.remove();
            $("sosPhotoTip").innerHTML = T("이 브라우저는 바로 보내기를 못 합니다. 사진을 저장했습니다(안 되면 사진을 <b>길게 눌러 저장</b>).<br>" +
                "문자 앱에서 119 에게 사진을 붙여 보내세요.", "This browser cannot send it directly. The photo was saved (if not, <b>long-press the photo to save</b>).<br>Attach it in your messages app and send to 119.");
            return Promise.resolve();
        }
        $("sosPhotoTip").innerHTML = SOS_TIP;
        return navigator.share({ files: [p.file], text: p.body }).catch(function (e) {
            if (e && e.name === "NotAllowedError") {   // 사진 만드는 사이 '누름'이 만료됨 - 한 번 더 누르게
                $("sosPhoto").textContent = T("📤 사진 보내기(한 번 더 누르세요)", "📤 Send photo (tap once more)");
                toast(T("사진이 준비됐습니다. 📤 버튼을 한 번 더 누르세요.", "The photo is ready. Tap 📤 once more."), 5000);
                return "again";
            }
            if (e && e.name !== "AbortError") throw e;
        });
    }

    $("sosPhoto").addEventListener("click", function () {
        var now0 = sosNow, btn = $("sosPhoto");
        if (!now0.f) { toast(T("위치를 찾은 뒤에 만들 수 있습니다.", "Available once your location is found.")); return; }
        if (photoReady && photoReady.f === now0.f && photoReady.body === now0.body) {   // 이미 만든 사진 - 바로 보냅니다
            sharePhoto(photoReady).then(function (r) { if (r !== "again") btn.textContent = PHOTO_LABEL; })
                .catch(function (e) { toast(T("보내기 실패: ", "Send failed: ") + (e && e.message || e), 5000); });
            return;
        }
        btn.disabled = true;
        btn.textContent = T("📷 사진 만드는 중…", "📷 Making photo…");
        var label = PHOTO_LABEL;
        sosImage(now0.f, now0.lines).then(function (cv) {
            return new Promise(function (resolve, reject) {
                cv.toBlob(function (b) { b ? resolve(b) : reject(new Error("그림 저장 실패")); }, "image/jpeg", 0.88);
            });
        }).then(function (blob) {
            var name = "sos119-" + stamp(Date.now()) + ".jpg";
            var img = $("sosPhotoImg");
            if (photoReady) URL.revokeObjectURL(photoReady.url);
            photoReady = { f: now0.f, body: now0.body, url: URL.createObjectURL(blob), file: new File([blob], name, { type: "image/jpeg" }) };
            img.src = photoReady.url;
            $("sosPhotoBox").style.display = "block";
            return sharePhoto(photoReady);
        }).then(function (r) {
            if (r === "again") label = T("📤 사진 보내기(한 번 더 누르세요)", "📤 Send photo (tap once more)");
        }).catch(function (e) {
            toast(T("사진을 못 만들었습니다: ", "Could not make the photo: ") + (e && e.message || e) + T(" - 문자 신고를 쓰세요.", " - use the text message instead."), 5000);
        }).finally(function () { btn.disabled = false; btn.textContent = label; });
    });

    $("sos").addEventListener("click", function () {
        $("sosSheet").style.display = "flex";
        if (window.RFParty && RFParty.get()) {   // 산악회 방 - 인솔자 화면에 SOS(괜찮아요 · 닫기로 풂)
            RFParty.sos(true);
            if (hike.fix) RFParty.fix(hike.fix.lat, hike.fix.lon, hike.fix.acc, true);
        }
        $("sosPhotoBox").style.display = "none";
        $("sosPhoto").textContent = PHOTO_LABEL;
        var fresh = hike.fix && Date.now() - (hike.sim ? Date.now() : hike.fix.t) < 60000 ? hike.fix : null;
        fillSos(fresh);
        if (!fresh && navigator.geolocation && window.isSecureContext) {
            navigator.geolocation.getCurrentPosition(function (pos) {
                fillSos({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, alt: pos.coords.altitude, t: Date.now() });
            }, function () { $("sosGrid").textContent = T("위치를 못 찾음 - 표지판 번호를 불러 주세요", "No location - read out a location sign number"); },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
        } else if (!fresh) {
            $("sosGrid").textContent = T("위치를 못 씀(https 필요) - 표지판 번호를 불러 주세요", "Location unavailable (needs https) - read out a location sign number");
        }
    });
    $("summitClose").addEventListener("click", function () { $("summitSheet").style.display = "none"; });
    $("summitShare").addEventListener("click", function () {
        var text = summitShareText;
        if (SHARE) { Promise.resolve(SHARE.share({ text: text, dialogTitle: T("자랑하기", "Share") })).catch(function () { /* 닫음 */ }); return; }
        if (navigator.share) { navigator.share({ text: text }).catch(function () { /* 닫음 */ }); return; }
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(T("글을 복사했습니다. 카톡 등에 붙여 넣으세요.", "Text copied. Paste it into a chat."), 4000); });
    });
    $("sosClose").addEventListener("click", function () { $("sosSheet").style.display = "none"; hike.sosAuto = false; partySosOff(); });
    /** 산악회 방 SOS 풀기 - 닫기 · 괜찮아요. */
    function partySosOff() {
        if (!window.RFParty || !RFParty.get() || !RFParty.get().sos) return;
        RFParty.sos(false);
        if (hike.fix) RFParty.fix(hike.fix.lat, hike.fix.lon, hike.fix.acc, true);
    }
    if (window.RFParty) RFParty.onNotice = function (text) {   // 인솔자 공지 - 걷는 중에도 보이고 들리게
        toast("📢 " + text, 12000);
        say(text);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    };
    $("stillOk").addEventListener("click", function () {
        if (hike.sosAuto) { $("sosSheet").style.display = "none"; hike.sosAuto = false; partySosOff(); }   // 저절로 열린 SOS 도 닫음 - 괜찮다고 했으니
        stillReset(); toast(EN ? "👍 OK, still watching. If you stop for over " + STILL_MS / 60000 + " minutes I will ask again." : "👍 계속 지켜볼게요. " + STILL_MS / 60000 + "분 넘게 멈추면 다시 묻습니다.", 4000); });
    $("stillSos").addEventListener("click", function () { stillReset(); $("sos").click(); });

    // ------------------------------------------------------------------ 공유 · 오프라인 저장

    // 아래 줄 "탐방 안내도"(2026-10-13 홍TV님) - 늘 그 공원 탐방 안내도 첫 화면(전체 지도 · 대표 코스 칩)으로
    var parkHref = null;
    /** 아래 줄 단추가 다섯이면 #bar.many(글자 작게). 단추를 보이고 숨긴 뒤 부름. */
    function barFit() {
        var n = Array.prototype.filter.call($("bar").children, function (b) { return b.style.display !== "none"; }).length;
        $("bar").classList.toggle("many", n >= 5);
    }
    $("parkGo").addEventListener("click", function () {
        if (hike.running || !parkHref) return;
        location.href = parkHref;
    });

    // 공유 단추 → 고르기(코스 링크 · 가족에게 산행 계획 - 2026-10-15 홍TV님)
    $("share").addEventListener("click", function () {
        if (!c) return;
        var t0 = now(), ms = RF.standardMs(c.course.kind, c.total, RF.ascentLeft(c, 0));
        var link = RF.parseJoinId(c.id) ? "" : new URL(EN ? "hike.html?lang=en#c=" + encodeURIComponent(c.id) : "s/" + encodeURIComponent(c.id) + "?to=hike", location.href).href;
        var text = RF.planText(c.course.name, c.total, Math.round(c.asc && c.asc.length ? c.asc[c.asc.length - 1] : 0), t0, t0 + ms, link, clock,
            RF.sunset(t0, c.lat[0], c.lon[0]));
        $("sharePlanText").textContent = text;
        $("sharePlan").href = "sms:" + (/iPhone|iPad/.test(navigator.userAgent) ? "&" : "?") + "body=" + encodeURIComponent(text);
        $("shareSheet").style.display = "flex";
    });
    $("shareClose").addEventListener("click", function () { $("shareSheet").style.display = "none"; });
    $("shareLink").addEventListener("click", function () {
        $("shareSheet").style.display = "none";
        if (!c) return;
        // 이은 코스(★ 대표 코스 · 지도에서 고른 여러 구간)는 따라가기 주소 그대로(제목 · 들머리 이름 포함) - 짧은 링크(s/)는 코스 하나만 앎(2026-10-13 홍TV님)
        var url = RF.parseJoinId(c.id) || EN
            ? new URL("hike.html" + (EN ? "?lang=en" : "") + "#c=" + encodeURIComponent(c.id) + (location.hash.match(/&(title|head|rev)=[^&]*/g) || []).join(""), location.href).href
            : new URL("s/" + encodeURIComponent(c.id) + "?to=hike", location.href).href;
        var text = NM(c.course.name) + " · " + km(c.total) + "km";
        if (navigator.share) navigator.share({ title: NM(c.course.name), text: text, url: url }).catch(function () {});
        else (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast(T("링크를 복사했습니다: ", "Link copied: ") + url, 5000); })
            .catch(function () { hAskText(T("링크를 길게 눌러 복사하세요.", "Long-press to copy the link."), url, { ok: T("닫기", "Close") }); });
    });

    /** 지도 타일 주소들 - 코스 범위의 z(lo~hi). */
    function tileUrls(template, z0, z1, bbox) {
        var out = [];
        function tx(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
        function ty(lat, z) { var r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); }
        for (var z = z0; z <= z1; z++) {
            for (var x = tx(bbox[0], z); x <= tx(bbox[2], z); x++) {
                for (var y = ty(bbox[3], z); y <= ty(bbox[1], z); y++) {
                    out.push(template.replace("{z}", z).replace("{x}", x).replace("{y}", y));
                }
            }
        }
        return out;
    }

    /**
     * 오프라인 저장 - 코스 · 주변 길 자료와 지도 그림을 핸드폰에 받아 둡니다(서비스 워커가 통신이 끊기면 씀).
     * 2026-10-08 (홍TV님 - 오프라인 범위 넓히기): 범위를 고릅니다 - 코스 둘레 약 500m(전과 같음) · 넓게 약 3km · 지금 보이는 지도.
     * 타일은 OFFLINE_MAX 장 안으로 - 넘으면 가장 자세한 단계를 줄이고(최소 z12), z12 로도 넘으면 받지 않습니다.
     */
    var OFFLINE_MAX = 3000, OFFLINE_ZMIN = 10, OFFLINE_ZMAX = 16;
    var SAVE_RANGES = { near: { pad: 0.005, label: T("코스 둘레 약 500m", "About 500 m around the trail") }, wide: { pad: 0.03, label: T("넓게 - 코스 둘레 약 3km", "Wide - about 3 km around the trail") } };

    /** 그 범위([서경, 남위, 동경, 북위])에서 받을 타일 주소 - OFFLINE_MAX 안으로 가장 자세한 단계를 정합니다. 넘치면 null. */
    function offlinePlan(b) {
        var style = map.getStyle(), zMax = OFFLINE_ZMAX, list;
        do {
            list = [];
            Object.keys(style.sources).forEach(function (k) {
                var src = style.sources[k];
                if (!src.tiles || !src.tiles[0]) return;
                // 지금 보이는 바탕 지도만(위성 · 밝은 지도 둘 다 받으면 두 배)
                var used = style.layers.filter(function (l) { return l.source === k; });
                if (used.length && used.every(function (l) { return l.layout && l.layout.visibility === "none"; })) return;
                list = list.concat(tileUrls(src.tiles[0], OFFLINE_ZMIN, Math.min(zMax, src.maxzoom || OFFLINE_ZMAX), b));
            });
            zMax--;
        } while (list.length > OFFLINE_MAX && zMax >= 12);
        return list.length > OFFLINE_MAX ? null : { urls: list, zMax: zMax + 1 };
    }
    function rangeBbox(key) {
        if (key === "view") { var v = map.getBounds(); return [v.getWest(), v.getSouth(), v.getEast(), v.getNorth()]; }
        var pad = SAVE_RANGES[key].pad;
        return [Math.min.apply(null, c.lon) - pad, Math.min.apply(null, c.lat) - pad, Math.max.apply(null, c.lon) + pad, Math.max.apply(null, c.lat) + pad];
    }

    $("save").addEventListener("click", function () {
        if (!c) return;
        if (!("caches" in window) || !window.isSecureContext) { toast(T("오프라인 저장은 https 주소에서만 됩니다.", "Offline save only works on an https address."), 5000); return; }
        [["saveNear", "near", "📍 " + SAVE_RANGES.near.label], ["saveWide", "wide", "🏔 " + SAVE_RANGES.wide.label], ["saveView", "view", T("🗺 지금 보이는 지도 범위", "🗺 The map area on screen")]].forEach(function (x) {
            var plan = offlinePlan(rangeBbox(x[1])), btn = $(x[0]);
            btn.disabled = !plan;
            btn.textContent = x[2] + (plan ? " · " + num(plan.urls.length) + T("장(가장 자세히 z", " tiles (detail up to z") + plan.zMax + ")" : T(" · 너무 넓습니다(지도를 확대하세요)", " · too wide (zoom in)"));
            btn.onclick = function () { $("saveSheet").style.display = "none"; saveOffline(plan); };
        });
        $("saveDelete").style.display = offlineIds().indexOf(c.id) >= 0 ? "" : "none";   // 저장해 둔 코스면 지우기
        $("saveSheet").style.display = "flex";
    });
    $("saveClose").addEventListener("click", function () { $("saveSheet").style.display = "none"; });

    /*
     * 2026-10-10 점검: 저장한 코스를 지울 수 없어 rf-offline-v1 이 끝없이 커졌습니다.
     * 코스마다 받은 주소 목록을 같은 캐시의 "offline-index?c=<코스>" 에 JSON 으로 남기고(localStorage 는 3,000장 주소를 담기에 작음),
     * 지울 때는 다른 저장 코스가 함께 쓰는 주소(겹치는 타일 · map-config)는 남깁니다.
     */
    var OFFLINE_CACHE = "rf-offline-v1";   // sw.js 의 OFFLINE 과 같은 이름
    /** 오프라인 저장한 코스 번호들(localStorage "rf-offline") - 코스를 열 때(loadCourse)도 부릅니다. */
    function offlineIds() { try { return JSON.parse(localStorage.getItem("rf-offline") || "[]"); } catch (e) { return []; } }
    function setOfflineIds(ids) { try { localStorage.setItem("rf-offline", JSON.stringify(ids)); } catch (e) { /* 무시 */ } }
    // 저장한 코스 이름 {번호: {name, dist}} - 첫 화면 '📥 저장한 코스' 목록에 씀(2026-10-17 홍TV님: 저장한 코스를 어디서 보나)
    function offlineNames() { try { return JSON.parse(localStorage.getItem("rf-offline-names") || "{}") || {}; } catch (e) { return {}; } }
    function setOfflineName(id, v) {
        var m = offlineNames();
        if (v) m[id] = v; else delete m[id];
        try { localStorage.setItem("rf-offline-names", JSON.stringify(m)); } catch (e) { /* 무시 */ }
    }
    function offlineIndexKey(id) { return new URL("offline-index?c=" + encodeURIComponent(id), location.href).href; }
    /** 그 코스가 받은 주소 목록(절대 주소). 예전에 저장해 목록이 없으면 null. */
    function offlineIndex(cache, id) {
        return cache.match(offlineIndexKey(id)).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
    }
    function absUrl(u) { return new URL(u, location.href).href; }
    /** 코스 자료 주소 - 이은 코스는 구간마다, GPX 는 없음(이 기기에만). */
    function courseUrls(id) {
        if (isGpxId(id)) return [];
        var parts = RF.parseJoinId(id);
        var ids = parts ? parts.map(function (p) { return p.base; }).filter(function (x, i, a) { return a.indexOf(x) === i; }) : [id];
        return ids.map(function (x) { return "api/course?id=" + encodeURIComponent(x); });
    }

    /** 저장 지우기 - 이 코스의 주소 중 다른 저장 코스가 쓰지 않는 것만 지웁니다. */
    function deleteOffline(id) {
        var others = offlineIds().filter(function (x) { return x !== id; });
        return caches.open(OFFLINE_CACHE).then(function (cache) {
            return Promise.all([offlineIndex(cache, id)].concat(others.map(function (o) { return offlineIndex(cache, o); }))).then(function (idx) {
                var mine = idx[0], keep = {}, legacyOther = false;
                idx.slice(1).forEach(function (l) { if (l) l.forEach(function (u) { keep[u] = true; }); else legacyOther = true; });
                var drop;
                if (mine && !legacyOther) {
                    drop = Promise.resolve(mine.filter(function (u) { return !keep[u]; }));
                } else if (mine) {
                    // 목록 없는 예전 저장 코스가 남아 있으면 겹치는지 알 수 없어 코스 자료만 지움(타일은 그대로)
                    drop = Promise.resolve(mine.filter(function (u) { return u.indexOf("/api/course?") >= 0; }));
                } else if (!others.length) {
                    return caches.delete(OFFLINE_CACHE);   // 예전 저장 · 남은 저장 없음 - 통째로
                } else if (!legacyOther) {
                    // 이 코스만 예전 저장 - 다른 코스 목록에 없는 것(목록 자체는 빼고)을 모두 지움
                    drop = cache.keys().then(function (ks) {
                        return ks.map(function (k) { return k.url; }).filter(function (u) { return !keep[u] && u.indexOf("/offline-index?") < 0; });
                    });
                } else {
                    drop = Promise.resolve(courseUrls(id).map(absUrl));
                }
                return drop.then(function (urls) {
                    return Promise.all(urls.concat([offlineIndexKey(id)]).map(function (u) { return cache.delete(u); }));
                });
            });
        }).then(function () {
            setOfflineIds(others);
            setOfflineName(id, null);
        });
    }
    $("saveDelete").addEventListener("click", function () {
        if (!c || !("caches" in window)) return;
        var id = c.id;
        hAsk(T("이 코스의 오프라인 저장(지도 그림)을 지울까요? 다른 저장 코스와 겹치는 지도는 남깁니다.", "Delete this trail's offline map? Map areas shared with other saved trails are kept."), { ok: T("지우기", "Delete"), danger: true }).then(function (ok) {
            if (!ok) return;
            $("saveSheet").style.display = "none";
            deleteOffline(id).then(function () {
                if (c && c.id === id) $("save").textContent = T("📥 저장", "📥 Save");
                toast(T("오프라인 저장을 지웠습니다.", "Offline save deleted."), 3000);
            }).catch(function (e) { toast(T("지우지 못했습니다: ", "Could not delete: ") + (e && e.message || e), 5000); });
        });
    });

    function saveOffline(plan) {
        // 주변 길은 화면이 부르는 그 주소(loadTrails 의 courseBbox(0.01))로 받아야 오프라인에서 서비스 워커가 내줍니다.
        var head = courseUrls(c.id).concat(["api/trails?bbox=" + courseBbox(0.01), "api/map-config"]);
        var urls = head.concat(plan.urls), id = c.id, meta = { name: String(c.course.name || ""), dist: Math.round(c.total || 0) };
        var btn = $("save"), done = 0, failed = 0, i = 0;
        btn.disabled = true;
        caches.open(OFFLINE_CACHE).then(function (cache) {
            function next() {
                if (i >= urls.length) return Promise.resolve();
                var u = urls[i++];
                // 지도 타일은 no-store 로 - 서비스 워커가 이것을 보고 지나가며 본 타일 캐시에 두 번 넣지 않습니다(sw.js)
                return fetch(u, { mode: "cors", cache: /^https?:/.test(u) ? "no-store" : "default" }).then(function (r) {
                    if (r.ok) return cache.put(u, r);
                    failed++;
                }).catch(function () { failed++; }).then(function () {
                    done++;
                    btn.textContent = Math.round(done / urls.length * 100) + "%";
                    return next();
                });
            }
            return Promise.all([next(), next(), next(), next(), next(), next()]).then(function () {
                // 받은 주소 목록 - 다시 저장하면 예전 목록과 합칩니다(범위를 바꿔 다시 받아도 예전 타일까지 지울 수 있게)
                return offlineIndex(cache, id).then(function (old) {
                    var all = {};
                    (old || []).concat(urls.map(absUrl)).forEach(function (u) { all[u] = true; });
                    return cache.put(offlineIndexKey(id), new Response(JSON.stringify(Object.keys(all)), { headers: { "Content-Type": "application/json" } }));
                });
            });
        }).then(function () {
            btn.disabled = false;
            btn.textContent = T("✅ 저장됨", "✅ Saved");
            var saved = offlineIds();
            if (saved.indexOf(id) < 0) { saved.push(id); setOfflineIds(saved); }
            setOfflineName(id, meta);
            toast(EN ? "Offline save done - " + num(plan.urls.length) + " map tiles" + (failed ? " (" + failed + " failed)" : "") + ". This area shows even without signal."
                : "오프라인 저장 끝 - 지도 " + num(plan.urls.length) + "장" + (failed ? " (못 받은 " + failed + "장)" : "") + ". 통신이 끊겨도 이 범위는 보입니다.", 6000);
        }).catch(function (e) {
            btn.disabled = false;
            btn.textContent = T("📥 저장", "📥 Save");
            toast(T("저장하지 못했습니다: ", "Could not save: ") + e.message, 5000);
        });
    }

    $("go").addEventListener("click", function () { if (hike.running) askStop(); else start(false); });
    $("endNo").addEventListener("click", function () { $("endSheet").style.display = "none"; stillReset(); });   // 계속하기도 답 - 여기서부터 다시 20분
    $("endYes").addEventListener("click", function () { $("endSheet").style.display = "none"; stopHike(); });
    $("sim").addEventListener("click", function () { start(true); });
    $("follow").addEventListener("click", function () {
        setFollow(true);
        if (meMarker) map.easeTo({ center: meMarker.getLngLat(), zoom: Math.max(map.getZoom(), 15), duration: 500 });
    });

    function route() {
        var m = /[#&]c=([^&]+)/.exec(location.hash);
        var hid = m ? RF.safeDecode(m[1]) : null;   // 깨진 주소면 코스 없이(코스 고르기)
        if (m && hid == null) m = null;
        // 2026-10-09 점검: 핸드폰 뒤로 가기(단추 · 밀기)로 주소가 바뀌어도 걷는 중이면 묻지 않고 끝내지 않습니다 -
        // 주소를 이 코스로 되돌리고 "끝낼까요?" 를 묻습니다(화면의 ‹ 단추와 같음). 시험 걷기는 그냥 멈춥니다.
        if (hike.running && !hike.sim && c && !(m && hid === c.id)) {
            try { history.pushState(null, "", "#c=" + encodeURIComponent(c.id)); } catch (e) { /* 주소만 못 되돌림 */ }
            askStop();
            return;
        }
        if (hike.running && m && c && hid === c.id) return;   // 같은 코스(되돌린 주소) - 그대로
        if (hike.running) stopHike();
        if (m) loadCourse(hid);
        else {
            showPick();
            if (/^#rec\b/.test(location.hash)) showRecords();   // 코스 미리보기의 '📒 내 기록'
        }
    }
    window.addEventListener("hashchange", route);

    // 코스 없이 열면(첫 화면 · 코스 미리보기의 '‹ 목록') 코스 고르기를 바로 - 지도 설정을 받을 때까지 뒤의 코스 화면이
    // 잔상처럼 보였음(2026-10-11 홍TV님). 검색 다시 하기 · 내 기록은 지도가 준비된 뒤 route() 가 그대로 합니다
    if (!/[#&]c=/.test(location.hash)) $("pick").style.display = "flex";

    getJson("api/map-config").catch(function () {
        return { demUrl: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: null };
    }).then(function (j) {
        cfg = { demUrl: j.demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: j.vworldKey || null };
        startMap();
        if (cfg.vworldKey) $("layerBtn").style.display = "block";   // 키가 없으면 바탕은 지형 음영 하나뿐
        if (/[?&]debug\b/.test(location.search)) window.routeflyHike = { map: map, hike: hike, get c() { return c; },   // 시험용
            fix: function (lat, lon) { onFix({ timestamp: now(), coords: { latitude: lat, longitude: lon, accuracy: 5, speed: 1, heading: null } }); },
            heading: function (h) { onOrientation({ webkitCompassHeading: h }); } };
        // 주소에 코스가 없이 열렸는데 걷던 코스가 있으면 그 코스로(카카오톡 안 브라우저에서 길찾기 뒤 화면이 닫혔을 때 등)
        if (!/[#&]c=/.test(location.hash)) {
            try {
                var act = localStorage.getItem(ACTIVE_KEY);
                var sv = act && JSON.parse(localStorage.getItem("rf-hike-" + act) || "null");
                if (sv && sv.t && Date.now() - sv.t < RESUME_MS) history.replaceState(null, "", "#c=" + encodeURIComponent(act));
            } catch (e) { /* 그냥 목록 */ }
        }
        route();
    });
})();
