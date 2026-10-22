/*
 * 산악회 방 화면(party.html - 2026-10-20 홍TV님). 서버는 PartyServlet · 위치 보내기는 party-kit.js(RFParty).
 * 흐름: 인솔자가 산행 전에 방을 만들고 참가 링크(카톡 · 문자) → 회원 참가(좌석 · 탑승지) → 출발 날 "버스 탔어요" → 인솔자 "출발"(안 탄 사람 취소)
 * → 산행 중 서로 위치 · SOS(인솔자 · 운전자는 배터리 · 머문 시간까지) → "하산 탑승" → 나가기(산 모음 /m/ 로). 인원이 모자라면 인솔자 "산행 취소".
 * 위치: 이 화면이 열린 동안 watchPosition → 30초마다(RFParty.fix, 서버는 출발 3시간 전부터 받음). 인솔자 · 운전자 화면은 15초마다 새로 받음.
 */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var q = new URLSearchParams(location.search);
    var OLD_S = 600;        // 10분 넘게 소식이 없으면 주황
    var LEAD_SEAT = 3;      // 인솔자 자리 - Party.LEAD_SEAT 와 같게(2026-10-22 홍TV님)
    // 영어 화면 - 주소에 ?lang=en 이 있을 때만(2026-10-22: 기억해 둔 rf-lang 으로 정하면 한국어 링크로 와도 영어로 열렸음).
    // 영어 산 페이지(/en/m/)에서 왔으면 돌아갈 곳도 영어로(2026-10-21 홍TV님 "en/m 에서 갔더니 한글이고 돌아와도 한글")
    var EN = /[?&]lang=en\b/.test(location.search);
    /** 지금 말로 고르기 - T("출발", "Depart"). */
    function T(ko, en) { return EN ? en : ko; }
    if (EN && window.RF && RF.setLang) RF.setLang("en");   // course-kit 글(지도 출처 "Terrain:" 등)도 영어
    var EXIT = EN ? "en/m/" : "m/";        // 나가기 · 방 끝 뒤 갈 곳(2026-10-20 홍TV님 - 산 모음)
    if (EN) {   // 다른 코드가 화면 글을 읽고 쓰기 전에 data-en 으로 바꿔 둠
        document.documentElement.lang = "en";
        document.title = "routefly Hiking club room";
        if (window.RF && RF.applyEn) RF.applyEn(document);
        $("back").href = EXIT;
        $("back").textContent = "← Mountains";
        if ($("fbLink")) { $("fbLink").href = "feedback.html?from=/party.html&lang=en"; $("fbLink").textContent = "📮 Feedback (English OK)"; }
    }
    /** 서버 · 오류 글(한국어)을 영어로 - 영어 화면만. 모르는 글은 한국어 그대로 + " (Korean message)". */
    var EN_MSG = [
        [/^이미 끝난 방입니다 - ([\s\S]*)$/, function (x, why) { return "This room has already ended - " + enMsg(why); }],
        [/방 코드를 찾지 못했습니다/, "Room code not found. Please check it with your leader."],
        [/(\d+)번은 인솔자 자리입니다/, "Seat $1 is the leader's seat. Please choose another seat."],
        [/방이 끝났거나 열쇠가 맞지 않습니다/, "This room has ended, or this phone's key no longer matches."],
        [/인원이 다 찼습니다\((\d+)명\)/, "This room is full ($1 people)."],
        [/(?:(\d+)호차 )?(\d+)번 자리는 이미 다른 분이 골랐습니다/, function (x, b, n) { return (b ? "Bus " + b + " seat " : "Seat ") + n + " is already taken. Please check your seat number."; }],
        [/(?:(\d+)호차 )?(\d+)번 자리는 이미 참가했습니다/, function (x, b, n) { return (b ? "Bus " + b + " seat " : "Seat ") + n + " already has a member."; }],
        [/(?:(\d+)호차 )?(\d+)번 자리에 참가한 사람이 없습니다/, function (x, b, n) { return "No one has joined " + (b ? "bus " + b + " seat " : "seat ") + n + "."; }],
        [/동의/, "You need to agree to share your location to join."],
        [/출발 1시간 전부터/, "\"I'm on the bus\" opens 1 hour before departure."],
        [/출발 때 탑승하지 않아/, "You weren't on the bus at departure, so you were dropped from this hike. Please contact your leader."],
        [/이미 출발한 방이라/, "This room has already departed, so you can't join. Please contact your leader."],
        [/인솔자 · 운전자만 지나온 길/, "Only the leader and drivers can see trails."],
        [/인솔자 · 운전자만 좌석표/, "Only the leader and drivers can edit the seat map."],
        [/인솔자 · 운전자만 차량번호/, "Only the leader and drivers can set the plate number."],
        [/인솔자 · 운전자만 버스 자리/, "Only the leader and drivers can set where the bus is."],
        [/다른 사람은 인솔자 · 운전자만/, "Only the leader and drivers can change other members."],
        [/인솔자만 공지/, "Only the leader can post notices."],
        [/인솔자만 내보낼/, "Only the leader can remove members."],
        [/인솔자만 방을 끝낼/, "Only the leader can end the room."],
        [/인솔자만 출발/, "Only the leader can depart."],
        [/인솔자만|인솔자 · 운전자만/, "Only the leader (or driver) can do this."],
        [/인솔자는 내보낼 수 없습니다/, "The leader can't be removed."],
        [/인솔자는 "방 끝내기"/, "The leader closes the room with \"End room\"."],
        [/하루에 만들 수 있는 방 수/, "You've reached today's limit for new rooms. Please try again tomorrow."],
        [/지금은 방을 더 만들 수 없습니다/, "Can't make more rooms right now. Please try again shortly."],
        [/방 코드를 너무 많이 틀렸습니다/, "Too many wrong room codes. Please try again in 10 minutes."],
        [/참가를 너무 많이/, "Too many joins from one place. Please try again in 1 hour."],
        [/산행 이름을 적어/, "Please enter a hike name."],
        [/별명을 적어/, "Please enter a nickname."],
        [/출발은 오늘부터 30일/, "Departure must be within 30 days from today."],
        [/하산 마감은 출발보다 뒤/, "The descent deadline must be after departure."],
        [/하산 마감은 지금부터 35일/, "The descent deadline must be within 35 days from now."],
        [/5일 안으로/, "The descent deadline must be within 5 days of departure (up to 4 days)."],
        [/좌석 번호는 1 ~ (\d+)/, "Seat number must be 1 to $1."],
        [/좌석 수는 0 ~ (\d+)/, "Seats must be 0 to $1."],
        [/차량은 1 ~ (\d+)/, "Buses must be 1 to $1."],
        [/호차는 1 ~ (\d+)/, "Bus number must be 1 to $1."],
        [/차량번호는/, "Write the plate number in numbers and Korean letters (e.g. 12가 3456)."],
        [/위치가 올바르지 않습니다/, "Invalid location."],
        [/시각이 올바르지 않습니다/, "Invalid time."],
        [/최소 인원이 올바르지 않습니다/, "Invalid minimum headcount."],
        [/인솔자가 이 방에서 내보냈습니다/, "The leader removed you from this room. If this is a mistake, contact your leader."],
        [/인솔자가 산행을 취소했습니다/, "The leader cancelled the hike."],
        [/인솔자가 방을 끝냈습니다/, "The leader ended the room. Thanks for hiking!"],
        [/산행 시간이 지나 방이 끝났습니다/, "The hike time is over, so the room has ended."],
        [/준비 중/, "Hiking club rooms are not open yet."],
        [/운전자는 인솔자에게 받은 운전자 코드로/, "Drivers join with the driver code from the leader."],
        [/운전자는 자기 호차\((\d+)호차\)만/, "Drivers can only see their own bus (bus $1)."],
        [/운전자의 호차는 인솔자가/, "The leader changes a driver's bus."],
        [/출발한 뒤에는 자리를 인솔자가/, "After departure, the leader moves seats on the seat map."],
        [/자리는 산행 회원만/, "Only hiking members pick seats."],
        [/산행 회원만/, "Only hiking members can use this."],
        [/이미 나간 사람입니다/, "That person has already left."],
        [/그 회원을 찾지 못했습니다/, "Member not found."],
        [/없는 좌석입니다/, "No such seat."],
        [/탑승지를 골라/, "Please choose a pickup point."],
        [/역할을 골라/, "Please choose a role."],
        [/요청을 읽지 못했습니다/, "Couldn't read the request."],
        [/모르는 표시입니다/, "Unknown mark."],
        [/없는 주소입니다/, "Unknown address."],
        [/방이 끝났습니다/, "The room has ended."],
        [/^오류 (\d+)$/, "Error $1"]
    ];
    function enMsg(m) {
        if (!EN || m == null) return m;
        var t = String(m);
        if (!/[가-힣]/.test(t)) return t;   // 이미 영어(브라우저 오류 글 등)
        for (var i = 0; i < EN_MSG.length; i++) {
            var mm = t.match(EN_MSG[i][0]), e = EN_MSG[i][1];
            if (mm) return typeof e === "function" ? e.apply(null, mm) : e.replace(/\$(\d)/g, function (x, k) { return mm[+k] || ""; });
        }
        return t + " (Korean message)";
    }
    var DAYS = T(["일", "월", "화", "수", "목", "금", "토"], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    var map = null, marks = {}, state = null, watch = null, pollTimer = null, aliveTimer = null, lastNoticeAt = null, lastPos = null;

    /** 지금 위치로 fn(lat, lon, acc) - 2분 안에 받은 위치가 있으면 바로, 없으면 새로 받음. */
    function here(fn) {
        if (lastPos && Date.now() - lastPos.t < 120000) { fn(lastPos.lat, lastPos.lon, lastPos.acc); return; }
        if (!navigator.geolocation) { roomMsg(T("이 기기는 위치를 쓸 수 없습니다.", "This device can't use location.")); return; }
        navigator.geolocation.getCurrentPosition(function (pos) { fn(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); },
            function () { roomMsg(T("위치를 받지 못했습니다. 위치 권한을 켜 주세요.", "Couldn't get your location. Please allow location access.")); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
    }

    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; });
    }
    function msg(t) { $("msg").textContent = t || ""; }
    function roomMsg(t) { $("roomMsg").textContent = t || ""; }
    function show(id) { ["closed", "start", "room"].forEach(function (x) { $(x).hidden = x !== id; }); }
    function agoText(s) {
        if (s == null) return T("아직 없음", "none yet");
        if (s < 60) return T("방금", "just now");
        if (s < 3600) return Math.floor(s / 60) + T("분 전", " min ago");
        return Math.floor(s / 3600) + T("시간 ", "h ") + Math.floor(s % 3600 / 60) + T("분 전", " min ago");
    }
    function two(n) { return ("0" + n).slice(-2); }
    function clock(ms) { var d = new Date(ms); return two(d.getHours()) + ":" + two(d.getMinutes()); }
    /** "10/23(금) 23:20" · 영어 "Fri 10/23 23:20" */
    function when(ms) { var d = new Date(ms); return EN ? DAYS[d.getDay()] + " " + (d.getMonth() + 1) + "/" + d.getDate() + " " + clock(ms) : (d.getMonth() + 1) + "/" + d.getDate() + "(" + DAYS[d.getDay()] + ") " + clock(ms); }
    function left(ms, now) {
        var m = Math.round((ms - now) / 60000), a = Math.abs(m);
        var t = (a >= 1440 ? Math.floor(a / 1440) + T("일 ", "d ") : "") + (a >= 60 ? Math.floor(a % 1440 / 60) + T("시간 ", "h ") : "") + (a % 60) + T("분", " min");
        return m >= 0 ? t + T(" 남음", " left") : "<span style=\"color:var(--red)\">" + t + T(" 지남", " overdue") + "</span>";
    }
    /** 하산 마감이 지난 방 - 언제 저절로 끝나는지. */
    function overText(s) {
        return "<span style=\"color:var(--red)\">" + T("하산 마감(" + when(s.endAt) + ")이 지났습니다", "Descent deadline (" + when(s.endAt) + ") has passed") + "</span>"
            + (s.closesAt ? " · " + T(when(s.closesAt) + "에 방이 저절로 끝나고 위치가 지워집니다", "the room closes and locations are deleted at " + when(s.closesAt)) : "")
            + ((s.members || []).some(function (m) { return m.sos && !m.aboard && !m.cancelled; }) ? T(" (🆘 SOS 가 켜져 있어 하산 마감 24시간 뒤까지 남김)", " (🆘 SOS is on, so it stays until 24 hours after the deadline)") : "");
    }
    /** 호차 - 차가 한 대면 빈 글(단풍철 여러 대 - 2026-10-20 홍TV님). */
    function busLabel(s, bus) { return s && s.buses > 1 ? T(bus + "호차 ", "Bus " + bus + " ") : ""; }
    /** "2호차 21번" · 영어 "Bus 2 seat 21" / "Seat 21". */
    function seatName(s, bus, seat) { return T(busLabel(s, bus) + seat + "번", (busLabel(s, bus) ? busLabel(s, bus) + "seat " : "Seat ") + seat); }
    function seatText(s, m) { return m.seat ? (s.buses > 1 ? m.bus + "-" : "") + m.seat : "-"; }
    /** 차량번호 - "2호차 경기71바5678" 들(없으면 빈 글). */
    function plateOf(s, bus) { return (s.plates || [])[bus - 1] || ""; }
    function platesText(s) {
        var out = [];
        for (var b = 1; b <= (s.buses || 1); b++) if (plateOf(s, b)) out.push(busLabel(s, b) + plateOf(s, b));
        return out.join(" · ");
    }
    function tel(phone) { return phone ? " <a class=\"tel\" href=\"tel:" + esc(phone.replace(/[^0-9+]/g, "")) + "\">☎ " + esc(phone) + "</a>" : ""; }
    /** 인원 - "참가 12 / 최소 18 ⏳ 미달" */
    function headcount(s) {
        var t = T("산행 <b>" + s.hikers + "</b>명", "Hikers <b>" + s.hikers + "</b>");
        if (s.minPeople > 0 && !s.departed) t += T(" / 최소 ", " / min ") + s.minPeople + (s.hikers >= s.minPeople ? " <span class=\"ok\">" + T("✅ 출발 확정", "✅ Trip confirmed") + "</span>" : " <span class=\"wait\">" + T("⏳ 미달", "⏳ Not enough yet") + "</span>");
        return t;
    }
    /** 방 소개 카드(참가 전 · 방 위 칸이 같이 씀). */
    function aboutHtml(s) {
        var lines = ["<b>" + esc(s.name) + "</b> · " + T("방 코드", "Room code") + " <b id=\"code\">" + esc(s.code) + "</b>"];
        if (s.departAt) lines.push("🚌 " + T("출발", "Departs") + " <b>" + when(s.departAt) + "</b>" + (s.endAt ? " · " + T("하산 마감", "Descent deadline") + " <b>" + when(s.endAt) + "</b>" : ""));
        if (s.leaderName || s.leaderPhone) lines.push("🧭 " + T("인솔자", "Leader") + " <b>" + esc(s.leaderName || "") + "</b>" + tel(s.leaderPhone));
        if (platesText(s)) lines.push("🚌 " + T("차량", "Bus") + " <b>" + esc(platesText(s)) + "</b>");
        lines.push(headcount(s) + (s.buses > 1 ? T(" · 차 " + s.buses + "대", " · " + s.buses + " buses") : "") + ((s.stops || []).length ? T(" · 탑승지 ", " · Pickup: ") + s.stops.map(esc).join(" · ") : ""));
        return lines.join("<br>");
    }

    // ------------------------------------------------------------------ 처음 화면

    /**
     * 안드로이드 브라우저(특히 카톡 · 네이버 · 밴드 안 브라우저 - 앱 링크가 안 걸림)로 참가 링크를 열었으면 "routefly 앱으로 열기" 단추.
     * intent: 주소 - 앱이 있으면 앱(MainActivity.openLink), 없으면 S.browser_fallback_url 로 이 화면에 그대로(&web=1 - 단추 숨김). 2026-10-20 PC 제안.
     */
    function canAppOpen() { return /Android/i.test(navigator.userAgent) && !window.Capacitor && q.get("web") !== "1" && location.hostname === "routefly.kr"; }
    /** intent: 주소 - token 이 있으면 앱에 넘겨(S.rf_token → MainActivity 가 #t= 로) 같은 사람으로 이어 감(다시 참가하면 명단에 두 번). */
    function appIntent(code, token) {
        var back = location.origin + location.pathname + "?c=" + encodeURIComponent(code) + "&web=1";
        return "intent://" + location.host + location.pathname + "?c=" + encodeURIComponent(code) + "#Intent;scheme=https;package=kr.routefly.app;"
            + (token ? "S.rf_token=" + encodeURIComponent(token) + ";" : "") + "S.browser_fallback_url=" + encodeURIComponent(back) + ";end";
    }
    // 앱으로 열기 · 옮기기를 누른 뒤 이 브라우저(카톡) 화면 안내(2026-10-20 홍TV님 - 카톡과 앱에 같은 화면이 둘 떠 헷갈림).
    // 앱이 없으면 S.browser_fallback_url(&web=1)로 이 화면이 다시 열리므로 그대로 쓰면 됨
    $("appOpenBtn").addEventListener("click", function () {
        $("appOpen").querySelector("p").textContent = T("📱 앱이 열렸으면 앱에서 참가하세요. 이 카톡 화면은 닫으셔도 됩니다. (앱이 없으면 아래에서 그대로 참가)", "📱 If the app opened, join there. You can close this KakaoTalk screen. (No app? Just join below.)");
    });
    $("appOpenRoomBtn").addEventListener("click", function () {
        // 이 브라우저는 위치 보내기를 멈춤 - 앱이 같은 사람으로 이어 보냄(앱이 없으면 &web=1 로 다시 열려 다시 보냄)
        if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; }
        $("appOpenRoom").querySelector("p").textContent = T("📱 앱으로 옮겼습니다. 이 카톡 화면은 닫으셔도 됩니다(여기서는 위치를 더 보내지 않습니다).", "📱 Moved to the app. You can close this KakaoTalk screen (it no longer sends your location).");
    });
    function appOpen() {
        if (!canAppOpen()) return;
        $("appOpenBtn").href = appIntent(q.get("c"), null);
        $("appOpen").hidden = false;
    }
    /** 방 화면 - 카톡 등 브라우저로 먼저 참가한 사람도 앱으로 넘어가 화면을 꺼도 위치가 가게(2026-10-20 PC 제안). */
    function appOpenRoom() {
        var p = RFParty.get();
        if (!p || !canAppOpen()) return;
        $("appOpenRoomBtn").href = appIntent(p.code, p.token);
        $("appOpenRoom").hidden = false;
    }
    /** 앱이 #t=열쇠 로 열렸으면 그 사람으로 이어 받음(MainActivity.openLink) - 주소에서 바로 지움. */
    function takeToken() {
        var m = /^#t=([A-Za-z0-9_-]{16,64})$/.exec(location.hash || "");
        if (!m) return null;
        try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* 그대로 */ }
        // 앱 안에서만 받고, 누구로 이어지는지 묻고 받음(2026-10-21 점검 - 남의 열쇠를 실은 링크로 내 위치가 엉뚱한 방에 가지 않게)
        if (!window.Capacitor) return null;
        return RFParty.post("view", { token: m[1] }).then(function (j) {
            var cur = RFParty.get();
            if (!confirm(T("카톡 등에서 참가한 산악회 방을 이 앱으로 이어 갈까요?\n방: ", "Continue in this app the hiking club room you joined in KakaoTalk etc.?\nRoom: ") + j.name + T("\n별명: ", "\nNickname: ") + j.nick
                + (cur && cur.code !== j.code ? T("\n(지금 이 앱의 다른 방 \"" + (cur.name || cur.code) + "\" 대신)", "\n(instead of the other room \"" + (cur.name || cur.code) + "\" in this app)") : ""))) throw new Error(T("앱으로 옮기기를 그만두었습니다.", "Stopped moving to the app."));
            RFParty.set({ code: j.code, token: m[1], role: j.role, name: j.name });
            return j;
        });
    }

    $("mkShow").addEventListener("click", function (e) {
        e.preventDefault();
        $("mkShowRow").hidden = true;
        $("mkSec").hidden = false;
        $("mkSec").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    function start() {
        fetch("api/party/status", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (s) {
            if (!s.enabled) { show("closed"); return; }
            var taken = takeToken();
            if (taken) { taken.then(function (j) { enterRoom(j); }).catch(function (e) { msg(enMsg(e.message)); if (RFParty.get()) enterRoom(); else show("start"); }); return; }
            var cur = RFParty.get(), want = (q.get("c") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
            if (cur && want.length === 6 && cur.code && want !== cur.code) {   // 다른 방 참가 링크(2026-10-21 PC: 예전 시험 방이 그대로 열렸음)
                if (cur.role === "lead") {
                    alert(T("인솔자로 있는 방(" + cur.code + ")이 있습니다. 링크의 방(" + want + ")에 참가하려면 지금 방에서 \"방 끝내기\"를 한 뒤 링크를 다시 누르세요.",
                        "You are the leader of room " + cur.code + ". To join room " + want + " from the link, tap \"End room\" in your current room first, then open the link again."));
                    enterRoom();
                    return;
                }
                if (confirm(T("다른 방(" + want + ") 참가 링크입니다.\n지금 방(" + (cur.name || cur.code) + ")에서 나가고 그 방으로 갈까요?\n(취소를 누르면 지금 방으로)",
                    "This link is for another room (" + want + ").\nLeave your current room (" + (cur.name || cur.code) + ") and go there?\n(Cancel keeps you in the current room)"))) {
                    RFParty.post("leave", { token: cur.token }).catch(function () { /* 이미 끝났어도 */ }).finally(function () { RFParty.clear(); start(); });
                    return;
                }
                enterRoom();
                return;
            }
            if (cur) { enterRoom(); return; }
            show("start");
            if (q.get("c")) { appOpen(); $("mkSec").hidden = true; $("mkShowRow").hidden = false; }
            if (q.get("c")) { $("joinBox").open = true; $("joinCode").value = q.get("c").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); loadInfo(); }
            try { $("joinNick").value = localStorage.getItem("rf-party-nick") || ""; } catch (e) { /* 없음 */ }
            var t = new Date(Date.now() + 86400000);   // 출발 날짜 - 내일로 두고 고치게
            $("mkDate").value = dayText(t);
        }).catch(function () {
            // 산속 · 약한 신호 - 이미 들어간 방이 있으면 그 방 화면으로(저절로 다시 받음). 2026-10-22 점검: "서비스 닫힘" 처럼 보였음
            if (RFParty.get()) { enterRoom(); netBad(); return; }
            show("closed"); $("closed").querySelector("p").textContent = T("서버에 닿지 않습니다. 인터넷 연결을 확인해 주세요.", "Can't reach the server. Please check your internet connection.");
        });
    }

    /** 방 코드 6글자를 적으면 방 소개 · 좌석 · 탑승지(이미 찬 자리는 고를 수 없게). */
    var infoFor = null;
    function loadInfo() {
        var code = $("joinCode").value.trim().toUpperCase();
        if (code.length !== 6 || code === infoFor) return;
        infoFor = code;
        RFParty.post("info", { code: code }).then(function (j) {
            if ($("joinCode").value.trim().toUpperCase() !== code) return;   // 그 사이 코드를 고침 - 늦게 온 옛 답은 버림
            joinErr("");
            $("joinCard").hidden = false;
            $("joinCard").innerHTML = aboutHtml(j);
            joinInfo = j;
            $("joinSeatBox").hidden = !(j.seats > 0 || (j.stops || []).length || j.buses > 1);
            busOptions($("joinBus"), j.buses, 1);
            $("joinBusBox").hidden = !(j.buses > 1);
            seatOptions($("joinSeat"), j.seats, j.taken, null, T("고르기", "Choose"), 1);
            var qs = new URLSearchParams(location.search).get("s");   // QR 에 실린 탑승지(인솔자가 그 자리에서 보여 준 것)
            stopOptions($("joinStop"), j.stops, qs && (j.stops || []).indexOf(qs) >= 0 ? qs : null, T("고르기", "Choose"));
            if (j.driverInvite) {   // 운전자 코드로 들어옴(인솔자가 기사님께만 준 것) - 운전으로 고정
                document.querySelector("input[name=role][value=driver]").checked = true;
                document.querySelector("input[name=role][value=hiker]").disabled = true;
            } else {   // 방 코드 - 산행만(운전자는 운전자 코드로, 2026-10-21 점검)
                document.querySelector("input[name=role][value=hiker]").disabled = false;
                document.querySelector("input[name=role][value=hiker]").checked = true;
                document.querySelector("input[name=role][value=driver]").disabled = true;
            }
            roleChanged();
            if (j.departed) joinErr(T("이미 출발한 방이라 산행 회원은 새로 참가할 수 없습니다. 인솔자에게 연락해 주세요. (운전자는 참가할 수 있습니다)", "This room has already departed, so new hikers can't join. Please contact your leader. (Drivers can still join.)"));
        }).catch(function (e) { if ($("joinCode").value.trim().toUpperCase() !== code) return; infoFor = null; $("joinCard").hidden = true; $("joinSeatBox").hidden = true; joinErr(enMsg(e.message), $("joinCode")); });
    }
    $("joinCode").addEventListener("input", loadInfo);
    var joinInfo = null;
    $("joinBus").addEventListener("change", function () { if (joinInfo) seatOptions($("joinSeat"), joinInfo.seats, joinInfo.taken, null, T("고르기", "Choose"), +$("joinBus").value); });
    /** 운전자는 호차만(좌석 · 탑승지 없음). */
    function roleChanged() {
        var drv = ((document.querySelector("input[name=role]:checked") || {}).value) === "driver";
        $("joinSeat").parentNode.hidden = drv || !(joinInfo && joinInfo.seats > 0);
        $("joinStop").parentNode.hidden = drv || !(joinInfo && (joinInfo.stops || []).length);
    }
    Array.prototype.forEach.call(document.querySelectorAll("input[name=role]"), function (r) { r.addEventListener("change", roleChanged); });

    /** 참가하기 안내 - 단추 바로 밑(아래 msg 는 방 만들기 밑이라 화면 밖이었음 - 2026-10-20 홍TV님 "코드 없이 누르면 안 움직임"). el - 빨간 테두리 · 그 칸으로. */
    function joinErr(t, el) {
        $("joinMsg").textContent = t || "";
        Array.prototype.forEach.call(document.querySelectorAll("#joinBox .bad"), function (x) { x.classList.remove("bad"); });
        if (el) { el.classList.add("bad"); el.focus(); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
    }
    $("joinBtn").addEventListener("click", function () {
        var code = $("joinCode").value.trim().toUpperCase(), nick = $("joinNick").value.trim();
        var role = (document.querySelector("input[name=role]:checked") || {}).value || "hiker";
        if (code.length !== 6) { joinErr(T("방 코드 6글자를 적어 주세요. 인솔자가 보낸 카톡 · 문자의 링크를 누르면 저절로 채워집니다.", "Please enter the 6-letter room code. Opening the link your leader sent (KakaoTalk · text) fills it in."), $("joinCode")); return; }
        if (!nick) { joinErr(T("별명을 적어 주세요.", "Please enter a nickname."), $("joinNick")); return; }
        if (!$("joinAgree").checked) { joinErr(T("위치 제공에 동의해야 참가할 수 있습니다(위 네모 칸 체크).", "You need to agree to share your location to join (tick the box above)."), $("joinAgree").parentNode); return; }
        joinErr("");
        var seatOn = !$("joinSeatBox").hidden && !$("joinSeat").parentNode.hidden, stopOn = !$("joinSeatBox").hidden && !$("joinStop").parentNode.hidden;
        var seat = seatOn && $("joinSeat").value ? +$("joinSeat").value : null, stop = stopOn && $("joinStop").value ? $("joinStop").value : null;
        if (role === "hiker" && seatOn && !seat && !confirm(T("좌석 번호를 고르지 않았습니다. 인솔자 좌석표에 안 나옵니다. 그래도 참가할까요?", "You didn't choose a seat, so you won't show on the leader's seat map. Join anyway?"))) return;
        $("joinBtn").disabled = true;
        var bus = !$("joinBusBox").hidden ? +$("joinBus").value : 1;
        RFParty.post("join", { code: code, nick: nick, role: role, bus: bus, seat: role === "hiker" ? seat : null, stop: role === "hiker" ? stop : null, agree: true }).then(function (j) {
            try { localStorage.setItem("rf-party-nick", nick); } catch (e) { /* 이번만 */ }
            RFParty.set({ code: j.code, token: j.token, role: j.role, name: j.name });
            enterRoom(j);
        }).catch(function (e) { joinErr(enMsg(e.message)); }).finally(function () { $("joinBtn").disabled = false; });
    });

    /** 차량 수만큼 차량번호 칸. */
    function plateInputs() {
        var n = Math.max(1, Math.min(8, +$("mkBuses").value || 1)), box = $("mkPlates"), old = box.querySelectorAll("input");
        var keep = Array.prototype.map.call(old, function (x) { return x.value; });
        var h = "";
        for (var b = 1; b <= n; b++) h += "<div><label for=\"mkPlate" + b + "\">" + (n > 1 ? T(b + "호차", "Bus " + b) : T("차량번호", "Plate number")) + "</label><input id=\"mkPlate" + b
            + "\" type=\"text\" maxlength=\"12\" placeholder=\"" + T("예: 12가3456", "e.g. 12가3456") + "\" value=\"" + esc(keep[b - 1] || "") + "\"></div>";
        box.innerHTML = h;
    }
    $("mkBuses").addEventListener("input", plateInputs);
    plateInputs();

    /** 날짜 · 시각 숫자 칸(폰 달력 · 시계 창 대신) - 칸을 떠나면 "10/22(목)" · "07:00" 으로 바꿔 보여 줌. */
    function dayText(d) { return (d.getMonth() + 1) + "/" + d.getDate() + T("", " ") + "(" + DAYS[d.getDay()] + ")"; }   // 영어 "10/22 (Thu)" - parseDay 가 ( ) 를 떼고 읽음
    function timeText(hm) { return two(hm[0]) + ":" + two(hm[1]); }
    /** 틀린 칸 바로 밑에 빨간 안내(2026-10-20 PC: 아래 msg 는 화면 밖이라 안 보였음). text 가 없으면 지움. */
    function fieldErr(input, text) {
        var row = input.closest(".two") || input, box = row.nextElementSibling;
        if (!box || !box.classList.contains("fieldMsg")) { box = document.createElement("div"); box.className = "fieldMsg"; row.parentNode.insertBefore(box, row.nextSibling); }
        var prev = input.getAttribute("data-err");
        if (!text && prev && $("msg").textContent === prev) msg("");
        input.classList.toggle("bad", !!text);
        input.setAttribute("data-err", text || "");
        var all = row.querySelectorAll ? Array.prototype.map.call(row.querySelectorAll("[data-err]"), function (x) { return x.getAttribute("data-err"); }).filter(Boolean) : [];
        box.textContent = all.length ? all.join(" ") : (text || "");
        if (text) msg(text);
        return false;
    }
    var DAY_ERR = T("출발 날짜를 숫자로 적어 주세요(예: 10월 22일 → 1022).", "Enter the departure date as numbers (e.g. Oct 22 → 1022)."),
        TIME_ERR = { mkTime: T("출발 시각을 숫자로 적어 주세요(예: 아침 7시 → 0700).", "Enter the departure time as numbers (e.g. 7 am → 0700)."),
            mkEnd: T("하산 마감 시각을 숫자로 적어 주세요(예: 오후 4시 → 1600).", "Enter the descent deadline as numbers (e.g. 4 pm → 1600).") };
    $("mkDate").addEventListener("blur", function () { restoreOnBlur(this); var d = RFParty.parseDay(this.value, Date.now()); if (d) this.value = dayText(d); fieldErr(this, d || !this.value.trim() ? "" : DAY_ERR); });
    // 누르면 칸을 비우고 이전 값은 흐린 글씨로(2026-10-20): 글자를 골라 두면 폰이 "잘라내기 · 복사 · 붙여넣기" 를 띄웠고,
    // 숫자만 남기면(1021) 새로 친 숫자가 뒤에 붙어 10211022 가 됐음. 아무것도 안 치고 나가면 이전 값으로 돌아감(blur)
    function digitsOnFocus() {
        if (!this.getAttribute("data-ph")) this.setAttribute("data-ph", this.placeholder);
        if (this.value.trim()) { this.setAttribute("data-prev", this.value); this.placeholder = this.value; this.value = ""; }
    }
    function restoreOnBlur(input) {
        if (!input.value.trim() && input.getAttribute("data-prev")) input.value = input.getAttribute("data-prev");
        input.removeAttribute("data-prev");
        if (input.getAttribute("data-ph")) input.placeholder = input.getAttribute("data-ph");
    }
    $("mkDate").addEventListener("focus", digitsOnFocus);
    $("mkPhone").addEventListener("blur", function () { this.value = RFParty.dashes(this.value); });   // 01000000000 → 010-0000-0000(2026-10-21 홍TV님)
    $("mkNights").addEventListener("change", function () { $("mkEndLabel").textContent = +this.value ? T("하산 마감(마지막 날)", "Descent deadline (last day)") : T("하산 마감", "Descent deadline"); });
    ["mkTime", "mkEnd"].forEach(function (id) {
        $(id).addEventListener("blur", function () { restoreOnBlur(this); var hm = RFParty.parseTime(this.value); if (hm) this.value = timeText(hm); fieldErr(this, hm || !this.value.trim() ? "" : TIME_ERR[id]); });
        $(id).addEventListener("focus", digitsOnFocus);
    });

    $("mkBtn").addEventListener("click", function () {
        var name = $("mkName").value.trim();
        if (!name) { msg(T("산행 이름을 적어 주세요.", "Please enter a hike name.")); return; }
        var day = RFParty.parseDay($("mkDate").value, Date.now()), tp = RFParty.parseTime($("mkTime").value);
        if (!day) { fieldErr($("mkDate"), DAY_ERR); $("mkDate").focus(); return; }
        if (!tp) { fieldErr($("mkTime"), TIME_ERR.mkTime); $("mkTime").focus(); return; }
        var dp = [day.getFullYear(), day.getMonth() + 1, day.getDate()];
        var depart = new Date(+dp[0], +dp[1] - 1, +dp[2], +tp[0], +tp[1]).getTime(), endAt = 0;
        var nights = +$("mkNights").value || 0;   // 1박 2일 · 2박 3일 · 3박 4일(2026-10-21 홍TV님 - 지리산 · 설악산 종주)
        if (nights && !$("mkEnd").value.trim()) { fieldErr($("mkEnd"), T("여러 날 산행은 마지막 날 하산 마감 시각을 적어 주세요(예: 1600).", "For a multi-day hike, enter the descent deadline on the last day (e.g. 1600).")); $("mkEnd").focus(); return; }
        if ($("mkEnd").value.trim()) {   // 하산 마감 - 당일은 출발 날 그 시각(출발보다 이르면 다음 날 - 무박), 여러 날은 출발 날 + n 일 그 시각
            var ep = RFParty.parseTime($("mkEnd").value);
            if (!ep) { fieldErr($("mkEnd"), TIME_ERR.mkEnd); $("mkEnd").focus(); return; }
            var e = new Date(+dp[0], +dp[1] - 1, +dp[2] + nights, +ep[0], +ep[1]);
            if (e.getTime() <= depart) e.setDate(e.getDate() + 1);
            endAt = e.getTime();
        }
        $("mkBtn").disabled = true;
        RFParty.post("create", { name: name, departAt: depart, endAt: endAt, minPeople: Math.max(0, Math.min(80, +$("mkMin").value || 0)),
            leaderName: $("mkLead").value.trim(), leaderPhone: RFParty.dashes($("mkPhone").value),
            plates: Array.prototype.map.call(document.querySelectorAll("#mkPlates input"), function (x) { return x.value.trim(); }),
            buses: Math.max(1, Math.min(8, +$("mkBuses").value || 1)), seats: Math.max(0, Math.min(60, +$("mkSeats").value || 0)), stops: $("mkStops").value }).then(function (j) {
            RFParty.set({ code: j.code, token: j.token, role: "lead", name: j.name });
            enterRoom(j);
            roomMsg(T("방을 만들었습니다. 아래 참가 링크를 예약한 회원에게 카톡 · 문자로 보내세요.", "Room created. Send the join link below to your members by KakaoTalk or text."));
        }).catch(function (e) { msg(enMsg(e.message)); }).finally(function () { $("mkBtn").disabled = false; });
    });

    // ------------------------------------------------------------------ 방 화면

    function isStaff() { var p = RFParty.get() || {}; return p.role === "lead" || p.role === "driver"; }

    function enterRoom(first) {
        show("room");
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // 자판 닫기
        window.scrollTo(0, 0);   // 방 만들기 · 참가 뒤 맨 위(방 소개 · 참가 링크)부터(2026-10-20 홍TV님)
        var p = RFParty.get(), staff = isStaff();
        $("title").textContent = "🧑‍🤝‍🧑 " + (p.name || T("산악회 방", "Hiking club room"));
        $("staffBox").hidden = !staff;
        $("hikerBox").hidden = staff;
        $("leadRow").hidden = p.role !== "lead";
        if (p.role === "lead") $("inviteUrl").value = inviteUrl();
        if (first && first.driverCode) $("driverCode").textContent = first.driverCode;
        $("noticeRow").hidden = p.role !== "lead";
        $("endBtn").hidden = p.role !== "lead";
        $("leaveBtn").hidden = p.role === "lead";
        startMap();
        appOpenRoom();
        if (first) render(first); else refresh();
        if (navigator.geolocation) {
            watch = navigator.geolocation.watchPosition(function (pos) {
                if (bgOn) return;   // 앱 - 화면 꺼도 도는 위치(BackgroundGeolocation)가 보냄, 두 번 보내지 않음(2026-10-22 점검)
                lastPos = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, t: Date.now() };
                var r = RFParty.fix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                if (r) r.then(render).catch(fail);
            }, function () { roomMsg(T("위치를 받지 못하고 있습니다 - 위치 권한을 켜 주세요.", "Not getting your location - please allow location access.")); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
        }
        clearInterval(pollTimer);
        pollTimer = setInterval(refresh, staff ? 15000 : 30000);
        // 위치가 45초 넘게 안 오면 "폰은 켜짐" 만이라도(2026-10-20 PC: 폰 위치를 끄면 앱 위치 콜백이 아예 안 불려 ping 도 안 갔음).
        // 화면이 꺼지면 웹뷰 타이머가 느려질 수 있으나(1분에 한 번쯤) 알림창 위치 서비스가 앱을 살려 두는 동안은 돎
        clearInterval(aliveTimer);
        aliveTimer = setInterval(function () {
            if (!state || state.cancelled || state.aboard) return;
            if (lastPos && Date.now() - lastPos.t < 45000) return;
            var pr = RFParty.ping();
            if (pr) pr.then(render).catch(fail);
        }, 60000);
    }

    function refresh() {
        var p = RFParty.get();
        if (!p) { location.href = EXIT; return; }
        if (Date.now() - lastOk < 10000) return;   // 방금 위치 · 켜짐의 답으로 받았음 - 같은 것을 또 받지 않음(2026-10-22 점검: 회원 1분에 4번)
        if (document.hidden && !isStaff()) return;   // 회원 - 화면을 안 볼 때는 방 새로 받기를 쉼(위치 · 켜짐을 보낼 때 답으로 공지가 옴). 인솔자 · 운전자는 SOS 를 놓치지 않게 그대로
        RFParty.post("view", { token: p.token }).then(render).catch(fail);
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden && state && !leaving) refresh(); });   // 다시 보면 바로 새로

    /** 나가기 - 위치를 멈추고 산 모음으로. */
    // ------------------------------------------------------------------ 앱 - 화면을 꺼도 위치(2026-10-20 홍TV님 "앱을 설치하면 문제 없는 거네")
    /**
     * routefly 안드로이드 앱(app/ - Capacitor)으로 열었을 때만. 출발 3시간 전부터 하산 탑승 · 취소 · 방 끝까지 BackgroundGeolocation 으로
     * 화면을 꺼도 30초마다 위치를 보냄(알림창에 "routefly - 산악회 방"). 브라우저는 그대로 watchPosition(화면이 켜져 있을 때만).
     */
    var CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
    var BG = NATIVE ? (CAP.registerPlugin ? CAP.registerPlugin("BackgroundGeolocation") : (CAP.Plugins && CAP.Plugins.BackgroundGeolocation) || null) : null;
    var bgOn = false, bgId = null, bgGen = 0;
    // 앱이 직접 1분마다 "폰은 켜짐"(app RfAlivePlugin - 화면이 꺼지면 이 화면의 타이머가 멈춰서, 2026-10-21 PC). 옛 설치본엔 없음(null)
    var ALIVE = NATIVE ? (CAP.Plugins && CAP.Plugins.RfAlive) || null : null;
    function aliveStart() {
        var p = RFParty.get();
        if (!ALIVE || !p) return;
        Promise.resolve(ALIVE.start({ url: new URL("api/party/ping", location.href).href, token: p.token })).catch(function () { /* 이번만 */ });
    }
    function aliveStop() { if (ALIVE) Promise.resolve(ALIVE.stop()).catch(function () { /* 이미 멈춤 */ }); }
    function bgWant(s) { return !!(BG && s && !s.cancelled && !s.aboard && (!s.locFrom || s.now >= s.locFrom)); }
    function bgStop() {
        aliveStop();
        bgOn = false; bgGen++;
        if (bgId != null) { Promise.resolve(BG.removeWatcher({ id: bgId })).catch(function () { /* 이미 멈춤 */ }); bgId = null; }
    }
    function bgSync(s) {
        var want = bgWant(s);
        if (!want) { if (bgOn) bgStop(); return; }
        if (bgOn) return;
        bgOn = true;
        aliveStart();
        var gen = ++bgGen;
        Promise.resolve(BG.addWatcher({ backgroundTitle: T("routefly - 산악회 방", "routefly - Hiking club room"),
            backgroundMessage: T("화면을 꺼도 인솔자 · 일행에게 위치를 보냅니다(하산 탑승하면 멈춤).", "Sends your location to the leader and group even with the screen off (stops once you're back on the bus)."),
            requestPermissions: true, stale: false, distanceFilter: 0 }, function (loc, err) {   // 0 - 멈춰 있어도 와야 쉼 · 부상 때 "소식 없음" 이 안 됨, 30초 거르기는 party-kit(2026-10-20 PC: 20 이면 멈춘 폰은 안 보냈음)
            if (err || !loc) { var pr = RFParty.ping(); if (pr) pr.then(render).catch(fail); return; }   // 권한 없음 · GPS 를 못 잡음 - 폰은 켜짐 · 배터리만(2026-10-20 PC)
            lastPos = { lat: loc.latitude, lon: loc.longitude, acc: loc.accuracy, t: Date.now() };
            var r = RFParty.fix(loc.latitude, loc.longitude, loc.accuracy);
            if (r) r.then(render).catch(fail);
        })).then(function (id) {
            if (bgOn && gen === bgGen) bgId = id;
            else Promise.resolve(BG.removeWatcher({ id: id })).catch(function () { /* 이미 멈춤 */ });   // 그 사이 멈췄으면
        }).catch(function () { bgOn = false; });
    }
    window.addEventListener("pagehide", function () { if (bgOn) bgStop(); });   // 따라가기 등 다른 화면으로 가면 그쪽이 맡음(알림이 남지 않게)

    function exit(text) {
        leaving = true;
        bgStop();
        clearInterval(pollTimer); clearInterval(aliveTimer);
        if (watch != null) navigator.geolocation.clearWatch(watch);
        RFParty.clear();
        if (text) alert(text);
        location.href = EXIT;
    }

    var leaving = false;   // 나가는 중 - 늦게 온 답(지운 열쇠)의 오류를 띄우지 않음(2026-10-20 PC)
    function fail(e) {
        if (leaving) return;
        if (e && e.ended) { exit((e.message ? enMsg(e.message) : T("방이 끝났습니다.", "The room has ended.")) + T(" 위치는 더 보내지 않습니다.", " Your location is no longer sent.")); return; }
        netBad();
    }
    /** 연결 줄(위쪽) - 마지막으로 받은 때와 함께, 다음에 받으면 저절로 사라짐(2026-10-22 점검: 맨 아래 roomMsg 에 "Failed to fetch" 가 나왔음). */
    var lastOk = 0;
    function netBad() {
        var ago = lastOk ? Math.max(0, Math.round((Date.now() - lastOk) / 60000)) : null;
        $("net").textContent = T("📶 연결이 약합니다", "📶 Weak connection") + (ago == null ? "" : ago < 1 ? T(" · 방금 받은 정보", " · info from just now") : T(" · " + ago + "분 전 정보", " · info from " + ago + " min ago"))
            + T(" - 저절로 다시 합니다.", " - retrying automatically.");
        $("net").hidden = false;
    }
    /** 누른 단추가 실패 - 방이 끝났으면 닫고, 아니면 까닭(저절로 다시 하지 않으니 다시 누르라고). */
    function actFail(e) {
        if (leaving) return;
        if (e && e.ended) { fail(e); return; }
        var t = e && e.message || String(e);
        roomMsg((/fetch|network|abort/i.test(t) ? T("연결이 안 됩니다", "No connection") : enMsg(t)) + T(" - 다시 눌러 주세요.", " - please tap again."));
    }
    /** 나가기 · 끝내기 · 취소 - 서버가 받았거나 방이 이미 끝났을 때만 화면을 닫음(연결이 안 되면 방에 남아 있으니 다시 누르게). */
    function quit(path, body, text) {
        RFParty.post(path, body).then(function () { exit(text); }).catch(function (e) { if (e && (e.ended || e.status === 410)) exit(text); else actFail(e); });
    }

    function render(s) {
        if (!s) return;
        state = s;
        lastOk = Date.now();
        $("net").hidden = true;
        var p = RFParty.get() || {}, staff = s.role === "lead" || s.role === "driver";
        var bar = [aboutHtml(s)];
        if (!staff && (s.seats > 0 || (s.stops || []).length || s.buses > 1))   // 내 자리 + 바로 고치기(출발 뒤에는 인솔자만 - 2026-10-20)
            bar.push(T("💺 내 자리", "💺 My seat") + " <b>" + busLabel(s, s.bus) + (s.seat ? T(s.seat + "번", "seat " + s.seat) : s.buses > 1 ? "" : T("없음", "none")) + "</b>" + (s.stop && !s.departed ? " · " + esc(s.stop) : "")
                + (s.buses > 1 && plateOf(s, s.bus) ? T(" · 내 차", " · My bus") + " <b>" + esc(plateOf(s, s.bus)) + "</b>" : "")
                + (s.departed ? "" : " <button type=\"button\" id=\"editSeat\" style=\"min-height:44px;padding:0 12px;font-size:15px\">" + T("✏️ 바꾸기", "✏️ Change") + "</button>"));
        $("bar").innerHTML = bar.join("<br>");
        if (s.notice) {
            $("notice").style.display = "block";
            $("notice").textContent = "📢 " + s.notice + " (" + clock(s.noticeAt) + ")";
            if (lastNoticeAt !== null && s.noticeAt !== lastNoticeAt && !staff) {   // 새 공지 - 소리 · 떨림
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                try { speechSynthesis.speak(new SpeechSynthesisUtterance(s.notice)); } catch (e) { /* 없음 */ }
            }
            lastNoticeAt = s.noticeAt;
            if (p.noticeAt !== s.noticeAt) { p.noticeAt = s.noticeAt; RFParty.set(p); }
        }
        var over = s.endAt && s.now > s.endAt;   // 하산 마감이 지남 - 방은 closesAt 에 저절로 끝남
        if (over) $("appOpenRoom").hidden = true;   // 끝나 가는 방은 앱으로 옮길 까닭이 없음
        if (staff) {
            $("departRow").hidden = s.role !== "lead" || s.departed || over;
            var nh = s.myHikers != null ? s.myHikers : s.hikers;   // 운전자 - 자기 호차 회원 수
            $("phase").innerHTML = over ? overText(s) + (s.departed ? T(" · 하산 탑승 <b>", " · Back on bus <b>") + (s.aboardCount || 0) + "</b> / " + nh : "") + (s.role === "lead" ? T(" - 산행이 끝났으면 아래 \"방 끝내기\"", " - if the hike is over, tap \"End room\" below") : "")
                : !s.departed && s.departAt && s.now > s.departAt ? "<span style=\"color:var(--red)\">" + T("출발 시각(" + clock(s.departAt) + ")이 지났습니다", "Departure time (" + clock(s.departAt) + ") has passed") + "</span>"
                    + (s.role === "lead" ? T(" - 출발했으면 아래 \"출발\"을 눌러 주세요", " - if you've left, tap \"Depart\" below") : "")
                    + T(" · 출발 탑승 ", " · Boarded ") + (s.members || []).filter(function (m) { return m.role === "hiker" && m.boarded; }).length + " / " + nh
                : s.departed ? T("🥾 산행 중 · 하산 탑승 <b>", "🥾 Hiking · Back on bus <b>") + (s.aboardCount || 0) + "</b> / " + nh + (s.endAt ? T(" · 하산 마감 ", " · Descent deadline: ") + left(s.endAt, s.now) : "")
                + (nh > 0 && s.aboardCount >= nh ? " <span class=\"ok\">" + T("모두 탔습니다", "Everyone is on the bus") + (s.role === "lead" ? T(" - 방을 끝내세요", " - you can end the room") : "") + "</span>" : notDown(s))
                : s.departAt ? T("출발까지 ", "Departure: ") + left(s.departAt, s.now) + T(" · 출발 탑승 ", " · Boarded ") + (s.members || []).filter(function (m) { return m.role === "hiker" && m.boarded; }).length + " / " + nh : "";
            if (s.role === "driver" && !seatMap.once) { curBus = s.bus; seatMap.once = true; }   // 운전자는 자기 호차부터
            list(s);
            seatMap(s);
            busTip();
        } else {
            hikerPhase(s, p);
        }
        drawMap(s);
        if (BG) bgSync(s);
        if (s.driverCode) { $("driverCode").textContent = s.driverCode; $("driverRow").hidden = false; }
    }

    /** 회원 단계 - 취소됨 / 출발 전(버스 탔어요) / 산행 중(SOS · 하산 탑승) / 하산 탑승함. */
    /** 인솔자 · 운전자 - 아직 하산 탑승 안 한 사람(2026-10-22 점검: 숫자만 있어 누가 남았는지 명단을 훑어야 했음). 8명까지 이름. */
    function notDown(s) {
        var rest = (s.members || []).filter(function (m) { return m.role === "hiker" && !m.cancelled && !m.aboard && m.id !== s.me; });
        if (!rest.length) return "";
        return "<br>" + T("🥾 아직 하산 안 함 <b>" + rest.length + "</b>명: ", "🥾 Not back yet <b>" + rest.length + "</b>: ")
            + rest.slice(0, 8).map(function (m) { return esc(m.nick) + (m.seat ? "(" + seatText(s, m) + ")" : ""); }).join(", ") + (rest.length > 8 ? T(" 외 " + (rest.length - 8) + "명", " and " + (rest.length - 8) + " more") : "");
    }

    function hikerPhase(s, p) {
        $("cancelBox").hidden = !s.cancelled;
        $("hikerBox").hidden = s.cancelled;
        if (s.cancelled) {
            $("phase").textContent = "";
            $("cancelTel").innerHTML = s.leaderPhone ? T("인솔자 ", "Leader ") + esc(s.leaderName || "") + tel(s.leaderPhone) : "";
            return;
        }
        $("mySeatBox").hidden = s.departed || !(s.seats > 0 || (s.stops || []).length || s.buses > 1);
        if (s.departed) $("mySeatBox").open = false;
        if (!$("mySeatBox").open) fillMySeat(s);
        var before = s.departAt && s.now < s.locFrom;
        var early = s.boardFrom && s.now < s.boardFrom && !s.boarded;   // 출발 1시간 전까지는 단추 대신 안내(2026-10-20 홍TV님)
        var over = s.endAt && s.now > s.endAt;
        $("boardBtn").hidden = s.departed || early || over;
        $("boardBtn").className = "main big" + (s.boarded ? " on" : "");
        $("boardBtn").textContent = s.boarded ? T("✅ 버스 탔어요 (누르면 취소)", "✅ I'm on the bus (tap to undo)") : T("🚌 버스 탔어요", "🚌 I'm on the bus");
        // SOS 는 출발 3시간 전(위치를 받기 시작할 때)부터 - 집결지 · 이동 중에도(2026-10-20 홍TV님 "출발 전엔 없다"). 하산 탑승은 출발 뒤만
        $("tripBtns").hidden = !(s.departed || !s.locFrom || s.now >= s.locFrom);
        $("aboardBtn").hidden = !s.departed;
        $("aboardBtn").className = "main big" + (s.aboard ? " on" : "");
        $("aboardBtn").textContent = s.aboard ? T("✅ 하산 탑승함", "✅ Back on the bus") : T("🚌 하산 탑승", "🚌 Back on the bus");
        $("callLead").hidden = !s.leaderPhone;   // 크게 - 인솔자 번호(2026-10-22 점검: 위 줄의 작은 글자뿐이었음)
        if (s.leaderPhone) $("callLead").href = "tel:" + s.leaderPhone.replace(/[^0-9+]/g, "");
        $("sosBtn").className = (p.sos ? "sos" : "danger") + " big";
        $("sosBtn").textContent = p.sos ? T("🆘 SOS 보냄 - 누르면 풀림", "🆘 SOS sent - tap to cancel") : "🆘 SOS";
        $("phase").innerHTML = over ? overText(s)
            : !s.departed && s.departAt && s.now > s.departAt ? T("출발 시각(" + clock(s.departAt) + ")이 지났습니다 · 인솔자가 아직 출발을 누르지 않았습니다", "Departure time (" + clock(s.departAt) + ") has passed · the leader hasn't tapped Depart yet")
                + (s.boarded ? T(" · ✅ 탑승 확인", " · ✅ Boarding confirmed") : "")
            : s.departed ? (s.aboard ? T("🚌 하산 탑승 - 수고하셨습니다.", "🚌 Back on the bus - well done!") : T("🥾 산행 중", "🥾 Hiking") + (s.endAt ? T(" · 하산 마감 ", " · Descent deadline: ") + left(s.endAt, s.now) : ""))
            : s.departAt ? T("출발까지 ", "Departure: ") + left(s.departAt, s.now) + (s.boarded ? T(" · ✅ 탑승 확인", " · ✅ Boarding confirmed") : "") : "";
        $("hikerTip").textContent = over ? T("산행이 끝났으면 \"방 나가기\"를 누르세요. 그대로 두어도 " + when(s.closesAt) + "에 방이 끝나고 위치가 모두 지워집니다.",
                "If the hike is over, tap \"Leave room\". Otherwise the room closes at " + when(s.closesAt) + " and all locations are deleted.")
            : s.departed ? T("이 화면이나 따라가기를 켜 둔 동안 30초마다 위치를 보냅니다. 같은 방 사람들이 서로의 위치를 봅니다.",
                "While this screen or hike tracking is open, your location is sent every 30 seconds. People in this room see each other's locations.")
            : early ? T("출발 1시간 전(" + when(s.boardFrom) + ")부터 \"🚌 버스 탔어요\" 단추가 나옵니다. 버스에 타면 그때 누르세요. 출발 때 안 누른 사람은 취소됩니다.",
                "The \"🚌 I'm on the bus\" button appears 1 hour before departure (" + when(s.boardFrom) + "). Tap it once you're on the bus. Anyone who hasn't tapped it at departure is cancelled.")
                + (before ? T(" 위치는 출발 3시간 전(" + when(s.locFrom) + ")부터 보냅니다.", " Your location is sent from 3 hours before departure (" + when(s.locFrom) + ").") : "")
            : before ? T("위치는 출발 3시간 전(" + when(s.locFrom) + ")부터 보냅니다. 출발 날 버스에 타면 \"버스 탔어요\"를 누르세요. 출발 때 안 탄 사람은 취소됩니다.",
                "Your location is sent from 3 hours before departure (" + when(s.locFrom) + "). On the day, tap \"I'm on the bus\" once you board. Anyone not on the bus at departure is cancelled.")
            : T("버스에 타면 \"버스 탔어요\"를 누르세요. 인솔자가 출발을 누를 때 안 탄 사람은 취소됩니다.", "Tap \"I'm on the bus\" once you board. Anyone not on the bus when the leader taps Depart is cancelled.");
    }

    // ------------------------------------------------------------------ 인솔자 · 운전자 목록

    var sosSeen = {};
    /** 새로 SOS 를 켠 사람이 있으면 떨고 읽어 줌. */
    function sosAlert(s) {
        var now = {}, bar = [];
        (s.members || []).forEach(function (m) {
            if (!m.sos || m.id === s.me) return;
            now[m.id] = 1;
            var who = m.nick + (m.seat ? "(" + seatName(s, m.bus, m.seat) + ")" : "");
            // 위쪽 빨간 줄 - SOS 가 켜진 동안 늘(2026-10-22 점검: 맨 아래 글로만 나와 안 보였음). 누르면 지도 · 지나온 길
            bar.push("🆘 " + esc(who) + " <button type=\"button\" data-sos=\"" + m.id + "\">" + T("🗺 지도 · 지나온 길", "🗺 Map · trail") + "</button>");
            if (sosSeen[m.id]) return;
            if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
            try { var u = new SpeechSynthesisUtterance(T(who + " 님이 에스오에스를 보냈습니다", who + " sent an SOS")); if (EN) u.lang = "en-US"; speechSynthesis.speak(u); } catch (e) { /* 없음 */ }
        });
        sosSeen = now;
        $("sosBar").innerHTML = bar.length ? "SOS " + bar.length + T("명", "") + "<br>" + bar.join("<br>") : "";
        $("sosBar").hidden = !bar.length;
    }
    $("sosBar").addEventListener("click", function (e) {
        var b = e.target.closest("[data-sos]");
        if (!b || !state) return;
        var m = (state.members || []).filter(function (x) { return String(x.id) === b.getAttribute("data-sos"); })[0];
        if (!m) return;
        if (m.lat != null && map) map.easeTo({ center: [m.lon, m.lat], zoom: Math.max(map.getZoom(), 15) });
        if (trailFor !== m.id) showTrail(m);
        window.scrollTo({ top: $("mapBox").offsetTop - 120, behavior: "smooth" });
    });

    /** SOS → 10분 넘게 소식 없음 → 오래 그 자리 → 나머지, 하산 탑승 · 취소는 아래. */
    /** 소식 칸 - 폰이 살아 있다고 알린 것(seen)이 위치보다 1분 넘게 새로우면 "폰 방금 · 위치 4분 전"(2026-10-20 PC: 화면 끈 실내는 GPS 를 못 잡음). */
    function newsText(m) {
        if (m.seen != null && (m.ago == null || m.ago - m.seen > 60)) return T("📵 폰 ", "📵 Phone ") + agoText(m.seen) + T(" · 위치 ", " · location ") + (m.ago == null ? T("없음", "none") : agoText(m.ago));
        return agoText(m.ago);
    }
    /** 소식 끊김 - 폰 소식(seen)이 있으면 그것으로(위치를 못 잡아도 폰이 살아 있으면 "소식 없음" 아님). */
    function silent(m) { var a = m.seen != null ? m.seen : m.ago; return a == null || a > OLD_S; }
    function list(s) {
        sosAlert(s);
        var rows = (s.members || []).filter(function (m) { return m.id !== s.me; });
        rows.sort(function (a, b) { var ka = rank(a), kb = rank(b); return ka !== kb ? ka - kb : (b.stillMin || 0) - (a.stillMin || 0); });
        $("listTitle").textContent = T("회원 ", "Members ") + rows.filter(function (m) { return !m.cancelled; }).length + T("명", "") + (rows.some(function (m) { return m.cancelled; }) ? T(" · 취소 ", " · cancelled ") + rows.filter(function (m) { return m.cancelled; }).length : "");
        $("list").innerHTML = rows.map(function (m) {
            var cls = m.cancelled ? "aboard" : m.sos ? "sos" : m.aboard ? "aboard" : (s.departed && silent(m)) ? "old" : "";
            var st = m.cancelled ? T("❌ 취소", "❌ Cancelled") : m.sos ? "🆘 SOS" : m.aboard ? T("🚌 하산 탑승", "🚌 Back on bus") : m.role === "driver" ? T("운전", "Driver")
                : s.departed ? T("🥾 산행 중", "🥾 Hiking") : m.boarded ? T("✅ 탐", "✅ On bus") : T("안 탐", "Not on bus");
            return "<tr class=\"" + cls + "\" data-id=\"" + m.id + "\"><td>" + (m.role === "driver" ? busLabel(s, m.bus) || "-" : seatText(s, m)) + "</td><td>" + esc(m.nick)
                + (m.cancelled && m.role === "hiker" ? " <button type=\"button\" class=\"undo\" data-undo=\"" + m.id + "\" title=\"" + T("늦게 온 회원 - 취소 되돌리기", "Late member - undo cancel") + "\">" + T("↩ 탔음", "↩ On bus") + "</button>" : "") + "</td><td>" + (m.aboard ? "-" : newsText(m)) + "</td><td>"
                + (m.stillMin != null && m.ago != null ? m.stillMin + T("분", " min") : "-") + "</td><td>" + (m.batt != null ? m.batt + "%" : "-") + "</td><td>" + st
                + (s.role === "lead" ? " <button type=\"button\" class=\"kick\" data-kick=\"" + m.id + "\" title=\"" + T("방에서 내보내기", "Remove from room") + "\" aria-label=\"" + T(esc(m.nick) + " 내보내기", "Remove " + esc(m.nick)) + "\">✕</button>" : "") + "</td></tr>";
        }).join("") || "<tr><td colspan=\"6\">" + T("아직 참가한 회원이 없습니다. 참가 안내를 보내 주세요.", "No members have joined yet. Send the invite.") + "</td></tr>";
        function rank(m) { return m.cancelled ? 6 : m.sos ? 0 : m.aboard ? 5 : (s.departed && silent(m)) ? 1 : (m.stillMin || 0) >= 15 ? 2 : 3; }
    }

    /** 인솔자 - 회원 내보내기(2026-10-20 홍TV님 - 모르는 사람이 들어왔을 때). */
    function kick(m) {
        if (!m || !confirm(T(m.nick + " 님을 방에서 내보낼까요?\n그 폰의 산악회 방이 닫히고 위치도 지워집니다.", "Remove " + m.nick + " from the room?\nThe room closes on their phone and their location is deleted."))) return;
        var p = RFParty.get();
        RFParty.post("kick", { token: p.token, id: m.id }).then(function (j) { pick(null); render(j); roomMsg(T(m.nick + " 님을 내보냈습니다.", "Removed " + m.nick + ".")); })
            .catch(function (er) { er.ended ? fail(er) : roomMsg(enMsg(er.message)); });
    }
    $("list").addEventListener("click", function (e) {   // 줄을 누르면 지도에서 그 사람
        var k = e.target.closest("[data-kick]");
        if (k && state) { kick((state.members || []).filter(function (x) { return String(x.id) === k.getAttribute("data-kick"); })[0]); return; }
        var u = e.target.closest("[data-undo]");
        if (u && state) {   // 취소된 회원(늦게 옴) - 자리가 다른 분에게 갔으면 자리 없이 되돌림(좌석표에서 다시 정함)
            RFParty.post("mark", { token: RFParty.get().token, id: +u.getAttribute("data-undo"), what: "boarded", on: true }).then(function (j) { render(j); roomMsg(T("취소를 되돌렸습니다. 자리가 비어 있으면 좌석표에서 정해 주세요.", "Cancel undone. If they have no seat, set one on the seat map.")); }).catch(actFail);
            return;
        }
        var tr = e.target.closest("tr[data-id]");
        if (!tr || !state) return;
        var m = (state.members || []).filter(function (x) { return String(x.id) === tr.getAttribute("data-id"); })[0];
        if (m && m.lat != null && map) { map.easeTo({ center: [m.lon, m.lat], zoom: Math.max(map.getZoom(), 15) }); window.scrollTo({ top: $("mapBox").offsetTop - (isStaff() ? 120 : 70), behavior: "smooth" }); }   // 인솔자 - 지도 위 안내 띠까지 보이게
        if (m && isStaff()) showTrail(m);
    });

    /** 인솔자 · 운전자 - 명단에서 누른 회원의 최근 2시간 지나온 길(조난 대비, 2026-10-21 홍TV님). 같은 줄을 다시 누르면 지움. */
    var trailFor = null, trailData = { type: "FeatureCollection", features: [] };
    /** 지도가 아직 안 떴으면(산속 · 느린 망) 받아 두었다가 뜬 뒤 그림(2026-10-21 PC: 소스가 없으면 아무 반응이 없었음). */
    function setTrail(fc) {
        trailData = fc;
        var src = map && map.getSource("trail");
        if (src) src.setData(fc);
    }
    function mapMsg(t) { $("mapMsg").textContent = t || ""; $("mapMsg").hidden = !t; }
    function showTrail(m) {
        if (trailFor === m.id) { trailFor = null; setTrail({ type: "FeatureCollection", features: [] }); mapMsg(""); return; }
        trailFor = m.id;
        RFParty.post("trail", { token: RFParty.get().token, id: m.id }).then(function (j) {
            if (trailFor !== m.id) return;
            var line = (j.path || []).map(function (q) { return [q[1], q[0]]; });
            if (m.lat != null) line.push([m.lon, m.lat]);
            setTrail({ type: "FeatureCollection", features: line.length > 1 ? [{ type: "Feature", geometry: { type: "LineString", coordinates: line }, properties: {} }] : [] });
            var wait = !(map && map.getSource("trail")) ? T(" 지도를 불러오는 중이라 뜨면 바로 그립니다.", " The map is still loading; the trail appears once it's ready.") : "";
            mapMsg(line.length > 1 ? "🧭 " + T(m.nick + " 님이 최근 2시간 지나온 길(주황 선) - 같은 줄 · 단추를 다시 누르면 지웁니다.", m.nick + "'s trail over the last 2 hours (orange line) - tap the same row or button again to clear.") + wait
                : "🧭 " + T(m.nick + " 님의 지나온 길이 아직 없습니다(출발 뒤 걸은 길부터 남김).", "No trail for " + m.nick + " yet (recorded from departure)."));
        }).catch(actFail);
    }

    // ------------------------------------------------------------------ 좌석 고르기 · 좌석표

    /** 좌석 고르기 - taken 은 호차 × 100 + 좌석(그 호차의 찬 자리만 막음). */
    function seatOptions(sel, seats, taken, cur, none, bus) {
        var t = {}, b = bus || 1;
        (taken || []).forEach(function (n) { t[n] = 1; });
        var o = ["<option value=\"\">" + (none || T("없음", "None")) + "</option>"];
        for (var i = 1; i <= seats; i++) {
            var x = t[b * 100 + i];
            var ld = i === LEAD_SEAT && seats >= LEAD_SEAT;   // 3번은 인솔자 자리(2026-10-22 홍TV님 - 출입문 쪽 맨 앞)
            o.push("<option value=\"" + i + "\"" + (x || ld ? " disabled" : "") + (i === cur ? " selected" : "") + ">" + i + (ld ? T(" (인솔자)", " (leader)") : x ? T(" (참가함)", " (taken)") : "") + "</option>");
        }
        sel.innerHTML = o.join("");
        sel.parentNode.hidden = !(seats > 0);
    }
    function busOptions(sel, buses, cur) {
        var o = [];
        for (var i = 1; i <= (buses || 1); i++) o.push("<option value=\"" + i + "\"" + (i === cur ? " selected" : "") + ">" + T(i + "호차", "Bus " + i) + "</option>");
        sel.innerHTML = o.join("");
    }
    function stopOptions(sel, stops, cur, none) {
        sel.innerHTML = "<option value=\"\">" + (none || T("없음", "None")) + "</option>" + (stops || []).map(function (x) { return "<option" + (x === cur ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("");
        sel.parentNode.hidden = !(stops || []).length;
    }
    function fillMySeat(s) {
        busOptions($("myBus"), s.buses, s.bus);
        $("myBusBox").hidden = !(s.buses > 1);
        seatOptions($("mySeat"), s.seats || 0, s.taken, s.seat, null, s.bus);
        stopOptions($("myStop"), s.stops, s.stop);
    }
    $("myBus").addEventListener("change", function () { if (state) seatOptions($("mySeat"), state.seats || 0, state.taken, null, null, +$("myBus").value); });
    $("bar").addEventListener("click", function (e) {   // "✏️ 바꾸기" → 바로 아래 칸
        if (!e.target.closest("#editSeat") || !state) return;
        if ($("mySeatBox").open) { $("mySeatBox").open = false; return; }
        $("mySeatBox").open = true;
        fillMySeat(state);
        $("mySeatBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    $("mySeatClose").addEventListener("click", function () { $("mySeatBox").open = false; });
    $("mySeatBtn").addEventListener("click", function () {
        var p = RFParty.get();
        RFParty.post("seat", { token: p.token, bus: $("myBusBox").hidden ? null : +$("myBus").value, seat: $("mySeat").value ? +$("mySeat").value : null, stop: $("myStop").value || null }).then(function (j) {
            $("mySeatBox").open = false;
            render(j);
            roomMsg(T("자리를 바꿨습니다.", "Seat updated."));
        }).catch(function (e) { roomMsg(enMsg(e.message)); });
    });

    /** 좌석 자리 - 앞(운전석)이 왼쪽, 위 줄 3 · 6 · 9 …, 통로, 아래 2 · 5 · 8 … / 1 · 4 · 7 …. 28석 우등처럼 3 으로 나눠 1 남으면 맨 뒤 4자리. */
    function seatPos(k, n) {
        var col = Math.floor((k - 1) / 3), p = (k - 1) % 3, row = p === 0 ? 4 : p === 1 ? 3 : 1;
        if (n % 3 === 1 && n > 3) {
            var last = Math.floor((n - 2) / 3);
            if (k === n) return { col: last, row: 1 };
            if (k === n - 1) return { col: last, row: 2 };
        }
        return { col: col, row: row };
    }

    var picked = null, moving = false, curBus = 1;   // curBus - 좌석표에서 보는 호차
    function seatMap(s) {
        $("seatSec").hidden = !(s.seats > 0);
        if (!(s.seats > 0)) return;
        if (curBus > (s.buses || 1)) curBus = 1;
        if (s.role === "driver") curBus = s.bus;   // 운전자 - 자기 호차만(2026-10-21 홍TV님)
        $("busTabs").hidden = !(s.buses > 1) || s.role === "driver";
        if (s.buses > 1) {
            var tabs = [];
            for (var b = 1; b <= s.buses; b++) {
                var on = (s.members || []).filter(function (m) { return m.bus === b && m.seat && !m.cancelled; });
                var sos = on.some(function (m) { return m.sos; });
                tabs.push("<button type=\"button\" data-bus=\"" + b + "\" class=\"" + (b === curBus ? "on" : "") + "\">" + (sos ? "🆘 " : "") + T(b + "호차 ", "Bus " + b + ": ") + on.length + "</button>");
            }
            $("busTabs").innerHTML = tabs.join("");
        }
        var by = {}, rsv = {}, cols = 0, cells = [];
        (s.members || []).forEach(function (m) { if (m.seat && m.bus === curBus && (!by[m.seat] || by[m.seat].cancelled)) by[m.seat] = m; });
        (s.reserved || []).forEach(function (n) { if (Math.floor(n / 100) === curBus) rsv[n % 100] = 1; });
        for (var k = 1; k <= s.seats; k++) {
            var at = seatPos(k, s.seats), m = by[k], cls = "s", label = "";
            cols = Math.max(cols, at.col + 1);
            if (m) {
                cls += m.cancelled ? " cxl" : m.sos ? " sos" : m.aboard ? " back" : m.boarded ? " board" : " join";
                if (s.departed && !m.cancelled && !m.sos && !m.aboard && silent(m)) cls += " old";
                label = "<small>" + esc(m.nick) + "</small>";
                if (m.id === picked) cls += " pick";
            } else if (k === LEAD_SEAT && s.seats >= LEAD_SEAT) { cls += " drv"; label = "<small>" + T("인솔", "Leader") + "</small>"; }   // 인솔자 자리(누를 수 없음)
            else if (rsv[k]) cls += " rsv";
            cells.push("<div class=\"" + cls + "\" data-seat=\"" + k + "\" style=\"grid-column:" + (at.col + 2) + ";grid-row:" + at.row + "\""
                + (m ? " title=\"" + esc(m.nick + (m.stop ? " · " + m.stop : "")) + "\"" : "") + ">" + k + label + "</div>");
        }
        cells.push("<div class=\"s drv\" style=\"grid-column:1;grid-row:4\" title=\"" + T("운전석", "Driver's seat") + "\"><small>" + T("운전", "Driver") + "</small></div>");   // 🛞 은 PC 글꼴에서 □ 로 보였음
        $("seatMap").style.gridTemplateColumns = "repeat(" + (cols + 1) + ", minmax(24px, 1fr))";   // 30px 이면 28석 · 412px 폰에서 옆으로 넘쳐 "운전"이 잘렸음(2026-10-20)
        $("seatMap").innerHTML = cells.join("");
        var seated = (s.members || []).filter(function (m) { return m.seat && !m.cancelled && m.bus === curBus; });
        $("seatSum").textContent = busLabel(s, curBus) + T("예약 · 미참가 ", "Reserved, not joined ") + Object.keys(rsv).length + T(" · 참가 ", " · Joined ") + seated.length + T(" · 출발 탑승 ", " · Boarded ")
            + seated.filter(function (m) { return m.boarded; }).length + T(" · 하산 탑승 ", " · Back on bus ") + seated.filter(function (m) { return m.aboard; }).length;
        $("stopSum").innerHTML = (s.stops || []).map(function (t) {
            var at = (s.members || []).filter(function (m) { return m.stop === t && !m.cancelled; });
            return "<b>" + esc(t) + "</b>" + T(" 탐 ", " on bus ") + at.filter(function (m) { return m.boarded; }).length + T(" / 참가 ", " / joined ") + at.length;
        }).join(" · ") + (s.buses > 1 && (s.stops || []).length ? T(" (모든 호차)", " (all buses)") : "");
    }

    $("busTabs").addEventListener("click", function (e) {
        var b = e.target.closest("[data-bus]");
        if (!b || !state) return;
        curBus = +b.getAttribute("data-bus");
        pick(null);
        seatMap(state);
        busTip();
    });
    function memberAt(k) {
        var all = state ? (state.members || []).filter(function (x) { return x.seat === k && x.bus === curBus; }) : [];
        return all.filter(function (x) { return !x.cancelled; })[0] || all[0];
    }
    function pickedMember() { return state && (state.members || []).filter(function (x) { return x.id === picked; })[0]; }
    function pick(m) {
        picked = m ? m.id : null;
        moving = false;
        $("seatMap").classList.remove("moving");
        $("seatAct").hidden = !m;
        if (!m) return;
        $("seatActName").innerHTML = "<b>" + seatName(state, m.bus, m.seat) + " " + esc(m.nick) + "</b>" + (m.stop ? " · " + esc(m.stop) : "") + " · " + (m.cancelled ? T("❌ 취소됨", "❌ Cancelled") : agoText(m.ago));
        $("actBoard").textContent = m.cancelled ? T("↩ 탔음(취소 되돌리기)", "↩ On bus (undo cancel)") : m.boarded ? T("출발 탑승 취소", "Undo boarding") : T("✅ 출발 탑승", "✅ Boarded");
        stopOptions($("actStop"), state.stops, m.stop);
        $("actStopBox").hidden = !(state.stops || []).length;
        $("actKick").hidden = state.role !== "lead";
    }
    $("seatMap").addEventListener("click", function (e) {
        var el = e.target.closest("[data-seat]");
        if (!el || !state) return;
        var k = +el.getAttribute("data-seat"), p = RFParty.get(), m = memberAt(k);
        if (k === LEAD_SEAT && state.seats >= LEAD_SEAT && !m) { if (moving) roomMsg(T(LEAD_SEAT + "번은 인솔자 자리입니다. 다른 빈자리를 누르세요.", "Seat " + LEAD_SEAT + " is the leader's seat. Tap another empty seat.")); return; }
        if (moving) {
            var who = pickedMember();
            if (!who || (m && m.id === who.id)) { pick(null); seatMap(state); roomMsg(""); return; }
            if (m && !m.cancelled) { roomMsg(T(busLabel(state, curBus) + k + "번 자리에는 " + m.nick + " 님이 있습니다. 빈자리를 누르세요.", seatName(state, curBus, k) + " is taken by " + m.nick + ". Tap an empty seat.")); return; }
            RFParty.post("seat", { token: p.token, id: who.id, bus: curBus, seat: k, stop: who.stop || null }).then(function (j) { pick(null); render(j); roomMsg(T(who.nick + " 님을 " + busLabel(state, curBus) + k + "번으로 옮겼습니다.", "Moved " + who.nick + " to " + seatName(state, curBus, k) + ".")); })
                .catch(function (er) { roomMsg(enMsg(er.message)); });
            return;
        }
        if (m) { pick(m); seatMap(state); return; }
        pick(null);
        RFParty.post("mark", { token: p.token, bus: curBus, seat: k, what: "reserved", on: (state.reserved || []).indexOf(curBus * 100 + k) < 0 }).then(render).catch(function (er) { roomMsg(enMsg(er.message)); });
    });
    $("actKick").addEventListener("click", function () { kick(pickedMember()); });
    $("actBoard").addEventListener("click", function () {
        var m = pickedMember(), p = RFParty.get();
        if (!m) return;
        RFParty.post("mark", m.cancelled ? { token: p.token, id: m.id, what: "boarded", on: true } : { token: p.token, bus: m.bus, seat: m.seat, what: "boarded", on: !m.boarded }).then(function (j) { render(j); pick(pickedMember()); }).catch(function (er) { roomMsg(enMsg(er.message)); });
    });
    $("actMove").addEventListener("click", function () {
        if (!pickedMember()) return;
        moving = true;
        $("seatMap").classList.add("moving");
        roomMsg(T("옮길 빈자리를 누르세요. (그만두려면 같은 자리를 다시 누르세요)", "Tap an empty seat to move to. (Tap the same seat again to stop)"));
    });
    $("actMap").addEventListener("click", function () {
        var m = pickedMember();
        if (m && m.lat != null && map) { map.easeTo({ center: [m.lon, m.lat], zoom: Math.max(map.getZoom(), 15) }); window.scrollTo({ top: $("mapBox").offsetTop - 70, behavior: "smooth" }); }
        else roomMsg(T("아직 위치가 없습니다.", "No location yet."));
    });
    $("actTrail").addEventListener("click", function () {   // 좌석표 메뉴에서도(2026-10-21 PC: 자리를 누르면 메뉴만 나와 헷갈렸음)
        var m = pickedMember();
        if (!m) return;
        if (m.lat != null && map) map.easeTo({ center: [m.lon, m.lat], zoom: Math.max(map.getZoom(), 14) });
        showTrail(m);
        window.scrollTo({ top: $("mapBox").offsetTop - 120, behavior: "smooth" });   // 지도 위 안내 띠(mapMsg)까지 보이게 - 숨어 있으면 offsetTop 이 0
    });
    $("actStop").addEventListener("change", function () {
        var m = pickedMember(), p = RFParty.get();
        if (!m) return;
        RFParty.post("seat", { token: p.token, id: m.id, bus: m.bus, seat: m.seat, stop: $("actStop").value || null }).then(function (j) { render(j); pick(pickedMember()); }).catch(function (er) { roomMsg(enMsg(er.message)); });
    });

    // ------------------------------------------------------------------ 지도

    function startMap() {
        if (map) return;
        fetch("api/map-config").then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (c) {
            var cfg = { demUrl: c.demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: c.vworldKey || null };
            map = new maplibregl.Map({ container: "map", style: RF.baseStyle(cfg), center: [127.8, 36.3], zoom: 6,
                attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false });
            map.touchZoomRotate.disableRotation();
            map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-right");
            map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
            map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
            map.once("load", function () {
                map.addSource("trail", { type: "geojson", data: trailData });   // 회원 지나온 길(인솔자)
                map.addLayer({ id: "trail", type: "line", source: "trail", paint: { "line-color": "#ff922b", "line-width": 4, "line-opacity": 0.85 }, layout: { "line-cap": "round", "line-join": "round" } });
                if (state) drawMap(state, true);
            });
        });
    }

    var fitted = false;
    function drawMap(s, force) {
        if (!map || !map.loaded()) return;
        var seen = {}, pts = [];
        function put(key, lon, lat, cls, label) {
            seen[key] = 1;
            pts.push([lon, lat]);
            var mk = marks[key];
            if (!mk) {
                var el = document.createElement("div");
                el.innerHTML = "<div class=\"d\"></div><div class=\"l\"></div>";
                mk = marks[key] = new maplibregl.Marker({ element: el, anchor: "top", offset: [0, -9] }).setLngLat([lon, lat]).addTo(map);
            }
            mk.setLngLat([lon, lat]);
            mk.getElement().className = "pm " + cls;
            mk.getElement().querySelector(".l").textContent = label;
            if (cls.indexOf("bus") >= 0) mk.getElement().querySelector(".d").textContent = "🚌";
        }
        (s.members || []).forEach(function (m) {
            if (m.lat == null || m.cancelled) return;
            var cls = m.sos ? "sos" : m.aboard ? "aboard" : m.role === "lead" ? "lead" : (m.ago > OLD_S ? "old" : "");
            put("m" + m.id, m.lon, m.lat, cls, (m.id === s.me ? T("나", "Me") : m.nick) + (m.ago > OLD_S ? " · " + agoText(m.ago) : ""));
        });
        var meShown = (s.members || []).some(function (m) { return m.id === s.me && m.lat != null; });
        if (!meShown && lastPos) put("me", lastPos.lon, lastPos.lat, "lead", T("나", "Me"));   // 출발 전(서버가 아직 안 받음)에도 내 위치는 보이게
        (s.busPins || []).forEach(function (b) { put("bus" + b.bus, b.lon, b.lat, "bus", s.buses > 1 ? T(b.bus + "호차", "Bus " + b.bus) : T("버스", "Bus")); });
        Object.keys(marks).forEach(function (k) { if (!seen[k]) { marks[k].remove(); delete marks[k]; } });
        if ((!fitted || force) && pts.length) {
            fitted = true;
            if (pts.length === 1) map.jumpTo({ center: pts[0], zoom: 14 });
            else {
                var b = new maplibregl.LngLatBounds(pts[0], pts[0]);
                pts.forEach(function (x) { b.extend(x); });
                map.fitBounds(b, { padding: 50, maxZoom: 15, duration: 0 });
            }
        }
    }

    // ------------------------------------------------------------------ 단추

    /** 참가 링크 · 안내 글(카톡 · 문자). */
    function inviteUrl() { var p = RFParty.get() || {}; return location.origin + location.pathname + "?c=" + p.code + (EN ? "&lang=en" : ""); }   // 영어 화면에서 보낸 링크는 영어로
    function inviteText() {
        var p = RFParty.get() || {}, s = state || {};
        return "[" + (s.name || p.name || T("산악회", "Hiking club")) + T("] routefly 산악회 방\n", "] routefly hiking club room\n")
            + (s.departAt ? T("출발 ", "Departs ") + when(s.departAt) + "\n" : "")
            + (platesText(s) ? T("차량 ", "Bus ") + platesText(s) + "\n" : "")
            + (s.leaderName || s.leaderPhone ? T("인솔자 ", "Leader ") + (s.leaderName || "") + (s.leaderPhone ? " " + s.leaderPhone : "") + "\n" : "")
            + T("방 코드 ", "Room code ") + p.code + T(" - 아래 링크로 들어와 좌석 · 탑승지를 남겨 주세요.\n", " - open the link below and choose your seat and pickup point.\n") + inviteUrl();
    }
    function inviteMsg(t) { $("inviteMsg").textContent = t; }
    /** 안내 글 복사 - 한 길로만(2026-10-20 홍TV님 "복사하면 문구가 두 번": 복사 + 확인 창이 겹칠 수 있던 것을 없앰). */
    function copyInvite() {
        var text = inviteText();
        function old() {   // 클립보드 API 가 없거나 막힌 브라우저 · 앱 - 숨은 칸에 넣고 복사
            var ta = document.createElement("textarea");
            ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
            document.body.appendChild(ta); ta.select();
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { /* 못 함 */ }
            document.body.removeChild(ta);
            inviteMsg(ok ? T("✅ 복사했습니다. 카톡 · 문자 창에 길게 눌러 붙여 넣으세요.", "✅ Copied. Long-press in a KakaoTalk or text message to paste.") : T("복사하지 못했습니다. 위 링크 칸을 길게 눌러 복사해 주세요.", "Couldn't copy. Long-press the link box above to copy it."));
        }
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { inviteMsg(T("✅ 복사했습니다. 카톡 · 문자 창에 길게 눌러 붙여 넣으세요.", "✅ Copied. Long-press in a KakaoTalk or text message to paste.")); }, old);
        else old();
    }
    /** 카톡으로 - 안드로이드는 카톡을 바로 열어 글을 넣음(친구 · 단톡방 고르기), 그 밖(아이폰 등)은 공유 창(카톡 고르기). 2026-10-20 홍TV님. */
    $("shareBtn").addEventListener("click", function () {
        var text = inviteText();
        var cap = window.Capacitor, share = NATIVE && cap ? (cap.registerPlugin ? cap.registerPlugin("Share") : cap.Plugins && cap.Plugins.Share) : null;
        if (share) {   // 앱(웹뷰)은 navigator.share 가 없어 아무 일도 없었음(2026-10-21 홍TV님 "카톡이 안 열려") - 앱 공유 창에서 카카오톡
            Promise.resolve(share.share({ text: text, dialogTitle: T("카카오톡으로 보내기", "Send via KakaoTalk") })).catch(function (e) { if (!/cancel/i.test(String(e && e.message))) copyInvite(); });
            return;
        }
        if (/Android/i.test(navigator.userAgent) && !NATIVE) {
            location.href = "intent:#Intent;action=android.intent.action.SEND;type=text/plain;S.android.intent.extra.TEXT=" + encodeURIComponent(text) + ";package=com.kakao.talk;end";
            // 카톡이 안 열렸으면(카톡이 없음 · 다른 앱 안 브라우저가 막음) 1.5초 뒤 공유 창 · 복사로
            setTimeout(function () { if (!document.hidden) { if (navigator.share) navigator.share({ text: text }).catch(function () { /* 닫음 */ }); else copyInvite(); } }, 1500);
            return;
        }
        if (navigator.share) navigator.share({ text: text }).catch(function () { /* 닫음 */ });
        else copyInvite();
    });
    /** 현장 참가 QR - 참가 링크를 크게(화면 밝기 그대로 비추면 됨). qrcode-generator(MIT) 가 없으면 코드만. */
    /** QR 주소 - 고른 탑승지를 실음(?s=) - 그 QR 로 들어오면 탑승지가 채워짐(2026-10-20 홍TV님). */
    function qrDraw() {
        var stop = $("qrStop").value, url = inviteUrl() + (stop ? "&s=" + encodeURIComponent(stop) : "");
        $("qrImg").innerHTML = "";
        if (window.qrcode) {
            var q = qrcode(0, "M");   // 0 - 크기 저절로, M - 15% 가려져도 읽힘
            q.addData(url);   // 한글 탑승지는 %인코딩이라 ASCII
            q.make();
            $("qrImg").innerHTML = q.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
        }
        try { localStorage.setItem("rf-party-qrstop", stop); } catch (e) { /* 이번만 */ }
    }
    $("qrStop").addEventListener("change", qrDraw);
    $("qrBtn").addEventListener("click", function () {
        var p = RFParty.get() || {}, stops = (state && state.stops) || [], last = "";
        try { last = localStorage.getItem("rf-party-qrstop") || ""; } catch (e) { /* 없음 */ }
        stopOptions($("qrStop"), stops, stops.indexOf(last) >= 0 ? last : null, T("정하지 않음", "Not set"));
        $("qrStopBox").hidden = !stops.length;
        qrDraw();
        $("qrCode").textContent = p.code || "";
        $("qrBox").hidden = false;
    });
    $("qrClose").addEventListener("click", function () { $("qrBox").hidden = true; });
    $("qrBox").addEventListener("click", function (e) { if (e.target === this) this.hidden = true; });

    /**
     * NFC 스티커에 참가 링크 쓰기(2026-10-20 홍TV님 - 쓰고 안 쓰고는 인솔자가 고름). Web NFC 라 안드로이드 크롬에서만(단추도 그때만 보임).
     * 스티커(NTAG213/215 등)를 버스 문 · 명찰에 붙여 두면 회원은 폰을 대기만 하면 참가 화면이 열림(안드로이드 · 아이폰 XS 이후 읽기). 산행마다 다시 씀.
     */
    var nfcStop = null;
    if ("NDEFReader" in window) $("nfcRow").hidden = false;
    $("nfcBtn").addEventListener("click", function () {
        if (nfcStop) { nfcStop.abort(); return; }
        var url = inviteUrl(), btn = this, ctl = new AbortController(), timer;
        nfcStop = ctl;
        btn.textContent = T("📶 스티커에 폰 뒷면을 대세요… (누르면 그만)", "📶 Hold the back of your phone to the sticker… (tap to stop)");
        inviteMsg(T("NFC 를 켜 두고, 스티커에 폰 뒷면(카메라 아래쯤)을 1~2초 대세요.", "Turn NFC on and hold the back of your phone (below the camera) to the sticker for 1-2 seconds."));
        function done(t) { clearTimeout(timer); nfcStop = null; btn.textContent = T("📶 NFC 스티커에 쓰기 (대기만 하면 참가)", "📶 Write to NFC sticker (tap a phone to join)"); inviteMsg(t); }
        timer = setTimeout(function () { ctl.abort(); }, 30000);
        new NDEFReader().write({ records: [{ recordType: "url", data: url }] }, { signal: ctl.signal, overwrite: true })
            .then(function () { done(T("✅ 스티커에 썼습니다. 회원이 폰을 대면 이 방 참가 화면이 열립니다.", "✅ Written. When members tap their phone on it, this room's join page opens.")); },
                function (e) {
                    done(e && e.name === "AbortError" ? T("NFC 쓰기를 그만두었습니다.", "Stopped writing NFC.")
                        : e && e.name === "NotAllowedError" ? T("NFC 권한이 없습니다. 폰 설정에서 NFC 를 켜고, 크롬의 NFC 허용을 눌러 주세요.", "No NFC permission. Turn on NFC in phone settings and allow NFC in Chrome.")
                        : e && e.name === "NotSupportedError" ? T("이 폰은 NFC 쓰기가 안 됩니다.", "This phone can't write NFC.")
                        : T("쓰지 못했습니다. 스티커를 떼었다가 다시 대 보세요(잠긴 스티커는 안 됨).", "Couldn't write. Move the phone away and try again (locked stickers won't work)."));
                });
    });

    $("smsBtn").addEventListener("click", function () { location.href = "sms:?&body=" + encodeURIComponent(inviteText()); });   // 안드로이드 · 아이폰 둘 다 되는 꼴
    $("copyBtn").addEventListener("click", copyInvite);
    $("inviteUrl").addEventListener("focus", function () { this.select(); });

    $("boardBtn").addEventListener("click", function () {
        var p = RFParty.get();
        // 탄 뒤 "확인하려고" 또 누르면 취소되던 것 막기(2026-10-22 점검 - 출발 때 안 탄 사람으로 빠질 수 있음)
        if (state && state.boarded && !confirm(T("\"버스 탔어요\" 를 취소할까요?\n취소하면 출발 때 안 탄 사람으로 빠질 수 있습니다.", "Undo \"I'm on the bus\"?\nIf you undo it, you may be dropped as not on the bus at departure."))) return;
        RFParty.post("board", { token: p.token, on: !(state && state.boarded) }).then(function (j) {
            render(j);
            if (j.boarded) roomMsg(T("✅ 탑승을 인솔자에게 알렸습니다.", "✅ Your leader knows you're on the bus."));
        }).catch(function (e) { e.ended ? fail(e) : roomMsg(enMsg(e.message)); });
    });

    // 하산 탑승 = 산행 끝(2026-10-20 홍TV님). 서버에는 "하산 탑승" 으로 남겨 인솔자가 명단 · 좌석표에서 보고(위치는 지움),
    // 이 폰은 위치 보내기를 멈추고 화면을 닫음 - 예전엔 나가기(leave)로 회원이 지워져 인솔자에게 "하산 탑승 0 / 0" 이었음(PC)
    $("aboardBtn").addEventListener("click", function () {
        var p = RFParty.get();
        if (!confirm(T("하산 탑승을 인솔자에게 알릴까요?\n알리면 위치 보내기를 멈추고 이 화면을 닫습니다.", "Tell your leader you're back on the bus?\nThis stops sending your location and closes this screen."))) return;
        if (p.sos) RFParty.sos(false);   // 하산 탑승하면 SOS 도 풂
        bgStop();
        RFParty.post("aboard", { token: p.token, on: true }).then(function () {
            exit(T("하산 탑승을 인솔자에게 알렸습니다. 수고하셨습니다!", "Your leader knows you're back on the bus. Well done!"));
        }).catch(function (e) { actFail(e); if (state) render(state); });   // 실패 - 위치 보내기를 다시 켬
    });

    $("sosBtn").addEventListener("click", function () {
        var p = RFParty.get();
        if (!p.sos && !confirm(T("인솔자 · 일행에게 SOS 를 보낼까요?\n\n위급하면 119 에도 바로 전화하세요(확인 뒤 전화 단추가 나옵니다).", "Send an SOS to your leader and group?\n\nIn an emergency, also call 119 right away (you'll be asked next)."))) return;
        if (p.sos && !confirm(T("SOS 를 풀까요? 빨간 SOS 표시가 사라집니다. 다시 필요하면 또 누르면 됩니다.", "Cancel the SOS? The red SOS mark goes away. Tap again if you need it."))) return;
        var on = !p.sos;
        RFParty.sos(on);
        if (on) setTimeout(function () { if (confirm(T("119 에 전화할까요?\n(산 이름 · 가까운 이정표 번호를 알려 주세요)", "Call 119 (Korean emergency)?\n(Tell them the mountain name and the nearest signpost number)"))) location.href = "tel:119"; }, 300);
        var pr = RFParty.ping(true);   // 위치를 못 잡아도 SOS 는 바로(2026-10-20 - 위치가 없으면 SOS 가 안 갔음)
        if (pr) pr.then(render).catch(fail);
        here(function (lat, lon, acc) {
            var r = RFParty.fix(lat, lon, acc, true);
            if (r) r.then(render).catch(fail);
        });
        if (state) render(state);
    });

    /** 버스 단추 설명 - 인솔자는 좌석표에서 고른 호차, 운전자는 자기 호차. */
    /** 차량번호를 고칠 호차 - 운전자는 자기 호차, 인솔자는 좌석표 탭. */
    function plateBus() { return state.role === "driver" ? state.bus : state.buses > 1 ? curBus : 1; }
    function busTip() {
        if (!state) return;
        var pb = plateBus();
        $("plateLabel").textContent = T((state.buses > 1 ? pb + "호차 " : "") + "차량번호 (회원 화면에 나감)", (state.buses > 1 ? "Bus " + pb + " plate" : "Plate") + " number (shown to members)");
        if (document.activeElement !== $("plateText") && $("plateText").getAttribute("data-bus") !== pb + ":" + plateOf(state, pb)) {
            $("plateText").value = plateOf(state, pb);
            $("plateText").setAttribute("data-bus", pb + ":" + plateOf(state, pb));
        }
        if (!(state.buses > 1)) { $("busTip").textContent = ""; return; }
        $("busTip").textContent = state.role === "driver" ? T("내 차(" + state.bus + "호차) 자리로 정합니다.", "Sets the location of my bus (bus " + state.bus + ").") : T("좌석표에서 고른 " + curBus + "호차의 자리로 정합니다.", "Sets the location of bus " + curBus + " (chosen on the seat map).");
    }
    $("plateBtn").addEventListener("click", function () {
        var p = RFParty.get(), pb = plateBus();
        RFParty.post("plate", { token: p.token, bus: pb, plate: $("plateText").value.trim() }).then(function (j) {
            render(j);
            roomMsg(plateOf(j, pb) ? T(busLabel(j, pb) + "차량번호를 " + plateOf(j, pb) + "(으)로 정했습니다. 회원 화면에 바로 나갑니다.", "Plate number set: " + busLabel(j, pb) + plateOf(j, pb) + ". Members see it right away.")
                : T(busLabel(j, pb) + "차량번호를 지웠습니다.", "Plate number cleared" + (busLabel(j, pb) ? " (" + busLabel(j, pb).trim() + ")" : "") + "."));
        }).catch(function (e) { e.ended ? fail(e) : roomMsg(enMsg(e.message)); });
    });

    $("busBtn").addEventListener("click", function () {
        var p = RFParty.get();
        here(function (lat, lon) { RFParty.post("bus", { token: p.token, bus: curBus, lat: +lat.toFixed(6), lon: +lon.toFixed(6) }).then(render).catch(actFail); });
    });

    $("noticeBtn").addEventListener("click", function () {
        var p = RFParty.get(), t = $("noticeText").value.trim();
        if (!t) return;
        RFParty.post("notice", { token: p.token, text: t }).then(function (j) { $("noticeText").value = ""; render(j); }).catch(actFail);
    });

    $("departBtn").addEventListener("click", function () {
        var p = RFParty.get(), not = (state.members || []).filter(function (m) { return m.role === "hiker" && !m.boarded && !m.cancelled; });
        var names = not.map(function (m) { return (m.seat ? seatName(state, m.bus, m.seat) + " " : "") + m.nick; }).join(", ");
        if (!confirm(T("출발할까요?", "Depart now?") + (not.length ? T("\n안 탄 " + not.length + "명은 취소됩니다: " + names + "\n(늦게 오면 좌석표에서 되돌릴 수 있습니다)",
            "\n" + not.length + " not on the bus will be cancelled: " + names + "\n(If they come late, you can undo it on the seat map)") : T("\n모두 탔습니다.", "\nEveryone is on the bus.")))) return;
        RFParty.post("depart", { token: p.token }).then(function (j) { render(j); roomMsg(T("🚌 출발! ", "🚌 Departed! ") + (j.cancelledNow ? T(j.cancelledNow + "명 취소.", j.cancelledNow + " cancelled.") : "")); }).catch(actFail);
    });

    $("cancelTripBtn").addEventListener("click", function () {
        var p = RFParty.get();
        if (!confirm(T("산행을 취소할까요? 모든 회원 화면에 \"산행이 취소되었습니다\"가 뜨고 방이 닫힙니다. 되돌릴 수 없습니다.", "Cancel the hike? Every member sees \"The hike was cancelled\" and the room closes. This can't be undone."))) return;
        quit("end", { token: p.token, cancel: true });
    });

    $("leaveBtn").addEventListener("click", function () {
        if (!confirm(T("방을 나갈까요? 내 위치 보내기를 멈추고, 방에서 내 정보가 지워집니다.", "Leave the room? Your location stops being sent and your info is removed from the room."))) return;
        var p = RFParty.get();
        quit("leave", { token: p.token });
    });

    $("endBtn").addEventListener("click", function () {
        if (!confirm(T("방을 끝낼까요? 산행이 끝난 것으로 모두의 위치가 지워지고 다시 열 수 없습니다.", "End the room? The hike is treated as finished, everyone's location is deleted, and it can't be reopened."))) return;
        var p = RFParty.get();
        quit("end", { token: p.token });
    });

    start();
    if (window.RF && RF.notifyDeploy) RF.notifyDeploy(["party.html", "js/party.js", "js/party-kit.js", "js/course-kit.js"], function () { return true; });   // 새 버전 띠(2026-10-20)
})();

// 글자 크기 "가+" - 위 줄 오른쪽(다른 화면과 같은 설정) · 그 옆 한/EN 단추(2026-10-22 - 같은 주소에 lang=en · lang=ko)
(function () {
    var top = document.getElementById("top");
    if (!top) return;
    if (window.RF && RF.textButton) top.appendChild(RF.textButton());
    var en = /[?&]lang=en\b/.test(location.search), b = document.createElement("button");
    b.type = "button";
    b.id = "langBtn";
    b.textContent = en ? "한" : "EN";
    b.title = en ? "한국어로 보기" : "View in English";
    b.setAttribute("aria-label", b.title);
    b.setAttribute("lang", en ? "ko" : "en");
    // .rfTextBtn 모양(그 클래스는 글자 크기 단추가 글을 바꿔 쓰므로 안 씀)
    b.style.cssText = "flex:0 0 auto;min-width:44px;height:34px;padding:0 8px;border-radius:17px;border:1px solid rgba(255,255,255,0.18);"
        + "background:rgba(255,255,255,0.06);color:#e9eef4;font:bold 13px Arial,'Malgun Gothic',sans-serif;cursor:pointer;white-space:nowrap";
    b.addEventListener("click", function () {
        var u = new URLSearchParams(location.search);   // c= · s= 등은 그대로
        u.set("lang", en ? "ko" : "en");
        location.href = location.pathname + "?" + u.toString() + location.hash;
    });
    top.appendChild(b);
})();
