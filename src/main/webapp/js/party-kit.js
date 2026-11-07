/*
 * 산악회 방 - 위치 보내기(2026-10-20 홍TV님). party.html(방 화면)과 hike.html(따라가기)이 같이 씀.
 * 참가한 방이 있을 때만(이 기기 localStorage "rf-party" 에 열쇠) 보냅니다 - 참가할 때 위치 제공에 동의함.
 * 서버(PartyServlet)는 사람마다 마지막 위치 하나만 두고(재시작 대비로 방 정보 파일에도 - 2026-11-02) 그 방 인솔자에게 보여 주며(회원에게는 자기 것만), 방이 끝나면 지웁니다.
 * 출발 전 위치는 서버가 버림(위치는 출발할 때부터, 2026-10-27 홍TV님).
 * 보내는 간격: 30초(SOS 를 켜고 끌 때는 바로), 50m 안에 15분 넘게 머물면 90초(움직이면 바로 30초로 - 2026-11-03 홍TV님 점검 P5). 방이 끝났다고 오면 이 기기의 방 정보도 지움.
 * SOS(2026-11-02 홍TV님 점검): 못 보냈으면 10초 뒤 다시(전에는 보낸 것으로 쳐 다시 안 보냈음), 켜져 있는 동안 위치가 없어도 20초마다 살펴 30초 넘게 안 갔으면 ping.
 */
(function (g) {
    var KEY = "rf-party", EVERY_MS = 30000;
    // 오래 쉴 때(정상 · 쉼터 · 버스) 간격 늘림(P5 - 배터리 · 서버): STILL_NEAR_M 안에 STILL_AFTER_MS 넘게 머물면 STILL_EVERY_MS. SOS 중에는 늘 EVERY_MS
    var STILL_EVERY_MS = 90000, STILL_AFTER_MS = 15 * 60000, STILL_NEAR_M = 50, anchor = null;   // anchor - 머문 자리 {lat, lon, t}
    var last = 0, busy = false, busyAt = 0, lastSos = null, again = null, seq = 0;   // seq - 25초 넘어 풀린 옛 보내기가 늦게 끝나도 새 보내기의 busy 를 풀지 않게
    // 2026-10-20 PC: 앱 화면을 끈 직후(Doze) 4분 동안 위치가 안 갔음 - 보내기(fetch) · 배터리 읽기가 끝나지 않아 busy 가 풀리지 않은 것으로 봄.
    // 보내기는 20초, 배터리는 2초에 끊고, 25초 넘게 busy 면 풀어 다음 위치를 보냄
    var POST_MS = 20000, BATT_MS = 2000, STUCK_MS = 25000;
    var RETRY_MS = 10000, SOS_TICK_MS = 20000, retryAt = 0, sosTimer = null, offPending = false;   // offPending - 못 보낸 SOS 끄기(2026-11-03)   // SOS 를 못 보냈을 때 다시 보낼 때 · 켜진 동안 살피는 간격
    function stuck() { if (busy && Date.now() - busyAt > STUCK_MS) { busy = false; again = null; } return busy; }   // again - 보내는 중에 꼭 보낼 것(SOS)이 오면 끝난 뒤 한 번 더

    /** 앱(Capacitor)에서 보내나 - 서버가 "10분 소식 없음" 경고를 앱 회원에게만(웹은 화면을 끄면 멈춤, 2026-10-28). */
    function isApp() { return !!(g.Capacitor && (!g.Capacitor.isNativePlatform || g.Capacitor.isNativePlatform())); }

    // 회사 사무실이 "열기" 로 연 방(office:true)은 이 탭에만(sessionStorage, 2026-10-29 홍TV님 - 회사 2곳 · 방 5개를 PC 탭마다 따로 봄).
    // 내가 참가한 방(localStorage)을 덮지 않고, 탭끼리도 섞이지 않음. 탭을 닫으면 잊음(사무실에서 다시 "열기").
    // 사무실 방은 인솔자 화면(party.html)에서만 - 같은 탭으로 따라가기 · 내 참가 링크(?c=)를 열면 내 방으로(2026-10-29 점검: 사무실 자리가 내 위치 · SOS 를 가로채 서버가 버렸음)
    function tab() {
        try {
            if (!/\/party\.html$/.test(location.pathname) || /[?&]c=/.test(location.search)) return null;
            return sessionStorage.getItem(KEY);
        } catch (e) { return null; }
    }
    function get() {
        try {
            var p = JSON.parse(tab() || localStorage.getItem(KEY) || "null");
            return p && p.token && p.code ? p : null;
        } catch (e) { return null; }
    }
    function set(p) {
        try {
            if (p && p.office) sessionStorage.setItem(KEY, JSON.stringify(p));
            else { sessionStorage.removeItem(KEY); localStorage.setItem(KEY, JSON.stringify(p)); }
        } catch (e) { /* 이번만 */ }
    }
    function clear() { try { if (tab()) sessionStorage.removeItem(KEY); else localStorage.removeItem(KEY); } catch (e) { /* 없음 */ } }

    /**
     * 알림(2026-10-28 홍TV님 - 인솔자도 혼자 산행해 화면을 못 봄): 무엇을 울릴지는 RF.partyAlerts(course-kit, 시험 있음).
     * 화면이 보이면 진동 · 소리(따라가기는 onNotice - 알림 띠 · 읽어 주기), 화면이 꺼졌거나 앱이면 폰 알림(앱 LocalNotifications · 브라우저 Notification).
     * 이미 울린 것은 이 기기 "rf-party-al" 에(방이 바뀌면 처음부터).
     */
    var AL_KEY = "rf-party-al", alId = 7400;
    function alerts(s) {
        if (!g.RF || !g.RF.partyAlerts) return;
        var st = null;
        try { st = JSON.parse(localStorage.getItem(AL_KEY) || "null"); } catch (e) { /* 처음 */ }
        if (!st || st.code !== s.code) st = { code: s.code, fired: {} };
        var r = g.RF.partyAlerts(s, st.fired);
        try { localStorage.setItem(AL_KEY, JSON.stringify({ code: s.code, fired: r.fired })); } catch (e) { /* 이번만 */ }
        var msgs = r.msgs.filter(function (m) { return !(g.RFParty.ownSos && !document.hidden && m.indexOf("🆘") === 0); });   // 인솔자 방 화면은 SOS 를 따로 읽음(두 번 읽지 않게, 10-28 PC)
        if (msgs.length) notify(msgs.join("\n"));
    }
    function notify(text) {
        if (g.RFParty && g.RFParty.onNotice && !document.hidden) { g.RFParty.onNotice(text); return; }   // 따라가기 - 띠 · 읽어 주기 · 진동(그쪽이 울림 - 두 번 울리지 않게, 10-28 PC)
        try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) { /* 없음 */ }
        if (!document.hidden && g.speechSynthesis && g.SpeechSynthesisUtterance) {
            try { var u = new SpeechSynthesisUtterance(text.replace(/[^\uAC00-\uD7A3\w\s:·,.-]/g, " ")); u.lang = "ko-KR"; speechSynthesis.speak(u); } catch (e) { /* 없음 */ }
        }
        var CAP = g.Capacitor, LN = CAP && CAP.isNativePlatform && CAP.isNativePlatform() && CAP.Plugins && CAP.Plugins.LocalNotifications;
        if (LN) {   // 앱 - 화면이 꺼져 있어도
            Promise.resolve(LN.schedule({ notifications: [{ id: alId++, title: "routefly 산악회 방", body: text }] })).catch(function () { /* 권한 없음 */ });
        } else if (document.hidden && g.Notification && Notification.permission === "granted") {
            try { new Notification("routefly 산악회 방", { body: text, tag: "rf-party-" + (alId++) }); } catch (e) { /* 안드로이드 크롬은 서비스워커로만 - 진동 · 소리로 갈음 */ }
        }
    }
    /** 알림 켜기(인솔자 화면 단추 - 사용자가 눌러야 권한 창을 띄울 수 있음). */
    function alertsOn() {
        var CAP = g.Capacitor, LN = CAP && CAP.isNativePlatform && CAP.isNativePlatform() && CAP.Plugins && CAP.Plugins.LocalNotifications;
        if (LN) return Promise.resolve(LN.requestPermissions()).then(function (r) { return r && r.display === "granted"; }).catch(function () { return false; });
        if (g.Notification && Notification.requestPermission) return Promise.resolve(Notification.requestPermission()).then(function (p) { return p === "granted"; }).catch(function () { return false; });
        return Promise.resolve(false);
    }

    /** 서버에 보내기 - 실패하면 서버 글을 담은 Error. 방이 끝났으면(열쇠가 안 맞음) 이 기기 방 정보를 지움. */
    function post(path, body) {
        var ctl = typeof AbortController === "function" ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, POST_MS) : 0;
        return fetch("api/party/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
            cache: "no-store", keepalive: true, signal: ctl ? ctl.signal : undefined }).finally(function () { clearTimeout(timer); }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
                if (!r.ok || j.success === false) {
                    var ended = r.status === 410 || (r.status === 400 && /끝났거나 열쇠/.test(j.message || ""));   // 410 - 방이 끝남(까닭이 글로 옴)
                    var mine = get();   // 지금 이 기기 방의 열쇠일 때만 지움(다른 열쇠 - 예전 방 · 들어오기 전 답 - 로 지우지 않게)
                    var own = ended && mine && body && mine.token === body.token;
                    if (own) clear();
                    var e = new Error(j.message || ("오류 " + r.status));
                    e.status = r.status;
                    e.ended = ended;
                    if (own && mine.name) e.room = mine.name;   // 끝난 방 이름 - 따라가기를 열자마자 뜨면 어느 방인지 몰랐음(2026-11-07 홍TV님 폰: 예전 시험 방)
                    throw e;
                }
                if (j && j.role && j.members && !j.officeMe) { alerts(j); g.RFParty.lastView = { at: Date.now(), token: body && body.token, j: j }; }   // 따라가기 아래 줄이 방금 받은 것을 다시 묻지 않게(2026-10-29 점검)   // 사무실 자리는 알림 기억("rf-party-al")을 덮지 않게 - 같은 PC 인솔자 탭 알림이 다시 울렸음(2026-10-29 점검)   // 방 화면이 올 때마다(위치 · 켜짐 · 새로 받기 답) - 화면을 꺼도 앱이 보내는 답으로
                return j;
            });
        });
    }

    function battery() {
        if (!navigator.getBattery) return Promise.resolve(null);
        return Promise.race([navigator.getBattery().then(function (b) { return Math.round(b.level * 100); }).catch(function () { return null; }),
            new Promise(function (r) { setTimeout(function () { r(null); }, BATT_MS); })]);
    }

    /**
     * 위치가 생길 때마다 부름(따라가기 onFix · 방 화면 watchPosition). 30초에 한 번만 보냄, SOS 가 바뀌면 바로.
     * 돌려줌: 보냈으면 서버 답(Promise), 안 보냈으면 null.
     */
    function fix(lat, lon, acc, force) {
        var p = get();
        if (!p || lat == null || lon == null) return null;
        var now = Date.now(), sos = !!p.sos;
        anchor = stay(anchor, lat, lon, now);
        if (stuck()) {   // 보내는 중 - SOS 를 켜고 끈 것 · 꼭 보낼 것은 끝난 뒤 다시(2026-10-20 시험: 위치 보내는 사이 누른 SOS 가 빠졌음)
            if (force || sos !== lastSos) again = [lat, lon, acc];
            return null;
        }
        if (!due(sos, force, now, everyMs(sos, now - anchor.t))) return null;
        var changed = lastSos !== null && sos !== lastSos;   // 보낸 적 있는 것에서 바뀜(처음 보내기는 아님)
        busy = true;
        busyAt = now;
        last = now;
        lastSos = sos;
        var my = ++seq;
        return battery().then(function (b) {
            return post("loc", { token: p.token, lat: +(+lat).toFixed(6), lon: +(+lon).toFixed(6), acc: acc == null ? null : Math.round(acc), batt: b, sos: sos, app: isApp() });
        }).then(function (j) {
            if (!sos) offPending = false;
            var q = get();
            if (q && j.notice && j.noticeAt && j.noticeAt !== q.noticeAt) {   // 새 공지 - 따라가기 화면에서도 알림
                q.noticeAt = j.noticeAt;
                set(q);
                if (g.RFParty.onNotice) g.RFParty.onNotice(j.notice);
            }
            return j;
        }, function (e) { failed(sos, changed); throw e; }).finally(function () { done(my); });
    }

    /** 지금 보낼까 - force · SOS 를 켜고 끔 · 간격(every, 없으면 30초) 지남. 못 보낸 SOS 는 RETRY_MS 뒤에 다시(위치마다 몰아 보내지 않게). */
    function due(sos, force, now, every) {
        if (force) return true;
        if (sos !== lastSos) return !(lastSos === null && now < retryAt);
        return now - last >= (every || EVERY_MS);
    }
    /** 순수 함수 - 위치 보내는 간격: SOS 가 아니고 한자리에 STILL_AFTER_MS 넘게 머물렀으면(stillMs) 90초, 아니면 30초. */
    function everyMs(sos, stillMs) {
        return !sos && stillMs > STILL_AFTER_MS ? STILL_EVERY_MS : EVERY_MS;
    }
    /** 순수 함수 - 머문 자리: 처음이거나 STILL_NEAR_M 넘게 움직였으면 지금 자리 · 시각으로 새로, 아니면 그대로(그 자리에 온 시각이 남음). */
    function stay(a, lat, lon, now) {
        if (a) {
            var dy = (lat - a.lat) * 111320, dx = (lon - a.lon) * 111320 * Math.cos(lat * Math.PI / 180);
            if (Math.sqrt(dx * dx + dy * dy) <= STILL_NEAR_M) return a;
        }
        return { lat: +lat, lon: +lon, t: now };
    }
    /**
     * 보내기 실패 - SOS 였거나 SOS 를 끈 것이었으면 보내지 않은 것으로 되돌림(다음 위치 · ping · 살핌이 다시 보냄, 2026-11-02 점검: 한 번 실패하면 다시 안 갔음).
     * SOS 끄기도(2026-11-03 홍TV님 점검: 못 보낸 끄기는 30초 뒤 · 위치가 없으면 영영 안 가 인솔자에게 SOS 가 남았음) - 갈 때까지 살핌 타이머도 둠.
     */
    function failed(sos, changed) {
        if (!sos && !changed) return;
        lastSos = null;
        retryAt = Date.now() + RETRY_MS;
        if (!sos) { offPending = true; sosKeep(); }
    }

    /**
     * 위치를 못 잡을 때(화면 끈 실내 · 골짜기 - 앱 BackgroundGeolocation 이 "Location not available") "폰은 켜짐" · 배터리 · SOS 를 보냄(2026-10-20 PC).
     * 위치와 같은 30초 간격을 씀(force - SOS 를 켜고 끌 때 바로). 돌려줌: 보냈으면 서버 답(Promise), 안 보냈으면 null.
     */
    function ping(force) {
        var p = get();
        if (!p) return null;
        var now = Date.now(), sos = !!p.sos;
        if (stuck()) {   // 보내는 중 - SOS 를 켜고 끈 것은 끝난 뒤 다시(2026-11-01 점검: 위치 없을 때 누른 SOS 가 빠질 수 있었음). 위치가 이미 기다리면 그것에 실림
            if ((force || sos !== lastSos) && !again) again = [];
            return null;
        }
        if (!due(sos, force, now)) return null;
        var changed = lastSos !== null && sos !== lastSos;   // 보낸 적 있는 것에서 바뀜(처음 보내기는 아님)
        busy = true;
        busyAt = now;
        last = now;
        lastSos = sos;
        var my = ++seq;
        return battery().then(function (b) { return post("ping", { token: p.token, batt: b, sos: sos, app: isApp() }); })
            .then(function (j) { if (!sos) offPending = false; return j; }, function (e) { failed(sos, changed); throw e; })
            .finally(function () { done(my); });
    }
    /** 보내기가 끝남 - 가장 최근 보내기일 때만 busy 를 풀고, 그 사이 온 꼭 보낼 것(SOS)을 바로 보냄. */
    function done(my) {
        if (my !== seq) return;
        busy = false;
        if (again) { var a = again; again = null; if (a.length) fix(a[0], a[1], a[2], true); else ping(true); }   // 빈 것 - 위치 없이(ping)
    }

    /** SOS 켜기 · 끄기 - 다음 위치에 실어 바로 보냄. */
    function sos(on) {
        var p = get();
        if (!p) return;
        p.sos = !!on;
        set(p);
        sosKeep();
    }
    /**
     * SOS 가 켜진 동안 SOS_TICK_MS 마다 살펴, 30초 넘게 아무것도 못 보냈거나 못 보낸 SOS 가 있으면 위치 없이 ping(2026-11-02 홍TV님 점검:
     * 위치가 없을 때 누른 SOS 는 한 번만 갔고, 그것이 실패하면 끝이었음). 위치가 30초마다 가면 ping 은 건너뜀. SOS 를 끄거나 방이 없으면 멈춤.
     */
    function sosKeep() {
        var p = get();
        if (!p || !p.sos && !offPending) { if (sosTimer) { clearInterval(sosTimer); sosTimer = null; } return; }
        if (sosTimer) return;
        sosTimer = setInterval(function () {
            var q = get();
            if (!q || !q.sos && !offPending) { sosKeep(); return; }
            var r = ping();
            if (r) r.catch(function () { /* 다음 살핌에 */ });
        }, SOS_TICK_MS);
    }
    sosKeep();   // 다시 연 화면 - 켜 둔 SOS 가 있으면 이어서

    /**
     * 순수 함수 - 날짜를 숫자로(2026-10-20 홍TV님: 폰 달력 창 대신 숫자 칸). "1022" · "10-22" · "10/22" · "10.22" · "10월 22일" · "922"(9/22) → Date(그 날 0시).
     * 해는 now 의 해 - 어제보다 앞이면 다음 해. 틀리면 null.
     */
    function parseDay(s, now) {
        var t = String(s == null ? "" : s).replace(/\(.*\)/, "").trim().replace(/^\d{4}\D+/, ""), m = t.match(/^(\d{1,2})\D+(\d{1,2})\D*$/), mo, d;
        if (m) { mo = +m[1]; d = +m[2]; }
        else if (/^\d{3,4}$/.test(t)) { mo = +t.slice(0, t.length - 2); d = +t.slice(-2); }
        else return null;
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        var n = new Date(now), x = new Date(n.getFullYear(), mo - 1, d);
        if (x.getMonth() !== mo - 1) return null;   // 2/30 등
        if (x.getTime() < new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1).getTime()) x = new Date(n.getFullYear() + 1, mo - 1, d);
        return x;
    }
    /** 순수 함수 - 시각을 숫자로: "0700" · "700" · "7:00" · "7" · "15" · "15시 30분" · "7시" · "15시" → [시, 분](24시간). 틀리면 null. */
    function parseTime(s) {
        var t = String(s == null ? "" : s).trim(), m = t.match(/^(\d{1,2})(?:\D+(\d{1,2}))?\D*$/), h, mi;
        if (m && !(m[2] === undefined && /^\d{3,}$/.test(t))) { h = +m[1]; mi = m[2] === undefined ? 0 : +m[2]; }
        else if (/^\d{3,4}$/.test(t)) { h = +t.slice(0, t.length - 2); mi = +t.slice(-2); }
        else return null;
        return h < 24 && mi < 60 ? [h, mi] : null;
    }

    /** 순수 함수 - 숫자만 친 우리나라 번호에 - (서버 Party.dashes 와 같음, 2026-10-21 홍TV님 "01000000000 → 010-0000-0000"). 모르는 꼴이면 그대로. */
    function dashes(s) {
        var t = String(s == null ? "" : s).trim(), d = t.replace(/[\s-]/g, "");
        if (!/^\d{8,12}$/.test(d)) return t;
        if (/^1[5-9]\d{6}$/.test(d)) return d.slice(0, 4) + "-" + d.slice(4);
        if (/^02/.test(d) && (d.length === 9 || d.length === 10)) return "02-" + d.slice(2, d.length - 4) + "-" + d.slice(-4);
        if (/^050\d{9}$/.test(d)) return d.slice(0, 4) + "-" + d.slice(4, 8) + "-" + d.slice(8);
        if (/^0\d{9,10}$/.test(d)) return d.slice(0, 3) + "-" + d.slice(3, d.length - 4) + "-" + d.slice(-4);
        return t;
    }

    /**
     * 순수 함수 - 사무실 · 방 사이 "뒤로" 를 어떻게 갈지(2026-11-02 홍TV님: 사무실 → 방 → ‹ 사무실 → ‹ 뒤로 → 방 … 이 끝없이 돌았음).
     * from "room"(방의 ‹ 사무실): 바로 앞이 사무실 화면이면 "back"(방 기록을 빼고 그 사무실로), 아니면 "replace"(방 기록을 사무실로 바꿈 - 쌓지 않음).
     * from "office"(사무실의 ‹ 뒤로): 바로 앞이 산악회 방 화면(party.html)이면 그 방으로 되돌아가므로 "href"(코스 모음 m/), 다른 우리 화면이면 "back".
     */
    function officeNav(from, ref, origin, histLen) {
        var same = !!ref && ref.indexOf(origin + "/") === 0, path = same ? ref.slice(origin.length).split(/[?#]/)[0] : "";
        if (from === "room") return same && /\/party-office\.html$/.test(path) && histLen > 1 ? "back" : "replace";
        return same && !/\/party\.html$/.test(path) && histLen > 1 ? "back" : "href";
    }

    /**
     * 순수 함수 - 방 위 "‹" 단추가 돌아갈 화면(2026-11-03 홍TV님: 따라가기 → "산악회 방 열기" → "‹ 코스 모음" 이 나왔음).
     * ref(앞 화면)가 우리 화면이면 그 주소, 방 화면 자신(말 바꾸기 등으로 다시 연 것)이면 saved(처음 적어 둔 주소), 사무실 · 남의 사이트 · 없음은 "".
     */
    function roomFrom(ref, origin, saved) {
        var mine = function (u) { return !!u && u.indexOf(origin + "/") === 0; };
        if (!mine(ref)) return "";
        var path = ref.slice(origin.length).split(/[?#]/)[0];
        if (/\/party\.html$/.test(path)) return mine(saved) ? saved : "";
        return /\/party-office\.html$/.test(path) ? "" : ref;
    }

    /**
     * 순수 함수 - 방 위 "‹ 뒤로" 가 브라우저 뒤로(기록을 쌓지 않음)로 갈 수 있나 = 바로 앞 기록이 연 화면인가.
     * 처음 열 때는 ref 로, 말 바꾸기(location.replace - 기록 자리 그대로)로 다시 연 뒤에는 앞서 적어 둔 것(saved · prevBack "1")으로(2026-11-03 PC: 한/EN 뒤 ‹ Back 이 기록을 쌓았음).
     */
    function roomBackOk(ref, from, saved, prevBack) {
        return !!from && (ref === from || (from === saved && prevBack === "1"));
    }

    /**
     * QR 그리는 스크립트(qrcode-generator, 57KB)는 처음 QR 을 그릴 때 받음(2026-11-02 홍TV님 속도 점검: 따라가기 · 산악회 방 · 사무실이 열 때마다 받았음).
     * 서비스 워커가 같은 주소를 담아 두어(sw.js SHELL_FILES) 신호 없을 때도 됨. 돌려줌: qrcode 함수를 주는 약속(못 받으면 null).
     */
    var qrWait = null;
    function qrLib() {
        if (g.qrcode) return Promise.resolve(g.qrcode);
        if (!qrWait) qrWait = new Promise(function (ok) {
            var s = document.createElement("script");
            s.src = "vendor/qrcode-generator-1.4.4/qrcode.js";
            s.onload = function () { ok(g.qrcode || null); };
            s.onerror = function () { qrWait = null; ok(null); };   // 다음에 다시
            document.head.appendChild(s);
        });
        return qrWait;
    }

    g.RFParty = { qrLib: qrLib, officeNav: officeNav, roomFrom: roomFrom, roomBackOk: roomBackOk, alertsOn: alertsOn, isApp: isApp, dashes: dashes, KEY: KEY, get: get, set: set, clear: clear, post: post, fix: fix, ping: ping, sos: sos, onNotice: null, parseDay: parseDay, parseTime: parseTime };
})(window);
