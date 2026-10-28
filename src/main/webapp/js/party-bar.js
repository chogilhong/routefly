/*
 * 따라가기(hike.html) 위 산악회 한 줄(2026-10-24 홍TV님 - 인솔자 위주, 회원은 산악회 방 화면 없이 따라가기만).
 * 회원은 링크 · 버스 QR · NFC 로 한 번 들어와 이름만 넣고 여기로 옴. 버스 안 QR · NFC 를 찍으면 출발 탑승(2026-10-27 홍TV님 - "버스 탔어요" 단추는 없앰).
 * 출발한 뒤 이 화면이 켜져 있는 동안 30초마다 인솔자에게 위치(party-kit.js).
 * 단추: 하산 탑승 · 따로 귀가(버스 안 탐, 2026-10-27) · 인솔자 전화 · 우리 버스(카카오맵) · 그만 보내기. SOS 는 따라가기 SOS 단추가 인솔자에게도 보냄(hike.js).
 * 인솔자(공동 인솔자 포함)는 "산악회 방 열기" 만.
 */
(function () {
    if (!window.RFParty) return;
    var T = window.RF && RF.tr ? RF.tr : function (ko) { return ko; };
    var EN = T("ko", "en") === "en";
    var POLL_MS = 60000;
    var state = null, watch = null, timer = null;
    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
    function clock(ms) { var d = new Date(ms); return d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2); }

    function hide() { $("partyBar").hidden = true; document.documentElement.classList.remove("partyOn"); stopWatch(); clearInterval(timer); timer = null; }

    /** 위치 보내기 - 출발할 때부터(2026-10-27 홍TV님), 하산 탑승 · 취소 전까지, 화면이 보이는 동안만. 따라가기를 시작했으면 hike.js 도 보내지만 30초에 한 번으로 묶임. */
    function wantWatch(s) { return !!(s && !s.cancelled && !s.aboard && s.locOn !== false && document.visibilityState === "visible"); }
    function startWatch() {
        if (watch != null || !navigator.geolocation) return;
        watch = navigator.geolocation.watchPosition(function (pos) {
            var r = RFParty.fix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
            if (r) r.then(render).catch(fail);
        }, function () { /* 권한 없음 - 따라가기의 GPS 안내가 알려 줌 */ }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    }
    function stopWatch() { if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; } }

    function fail(e) {
        if (e && e.ended) {   // 방이 끝남 · 내보내짐 - party-kit 이 이 기기의 방 정보를 지움
            alert(T("산악회 방이 끝났습니다. 인솔자에게 위치를 더 보내지 않습니다.", "The hiking club room has ended. Your location is no longer sent.") + (e.message ? "\n" + e.message : ""));
            hide();
        }
    }

    function refresh() {
        var p = RFParty.get();
        if (!p) { hide(); return; }
        RFParty.post("view", { token: p.token }).then(render).catch(fail);
    }

    /** 위치를 받는 사람 - "인솔자 홍길동 · 보조 김철수 · 이영희". */
    function leadsText(s, ko) {
        var ls = (s.members || []).filter(function (m) { return m.role === "lead"; });
        var main = ls.filter(function (m) { return m.chief; }).map(function (m) { return esc(m.nick); });
        if (!main.length && s.leaderName) main = [esc(s.leaderName)];
        var sub = ls.filter(function (m) { return !m.chief && !m.office; }).map(function (m) { return esc(m.nick); });   // 사무실 자리는 아래 회사 이름으로
        var off = s.office ? esc(s.office) : "";   // 회사 사무실(2026-10-28)
        if (ko) return "인솔자" + (main.length ? " " + main.join(" · ") : "") + (sub.length ? " · 보조 " + sub.join(" · ") : "") + (off ? " · " + off + " 사무실" : "");
        return "the leader" + (main.length ? " " + main.join(", ") : "") + (sub.length ? ", assistant" + (sub.length > 1 ? "s " : " ") + sub.join(", ") : "") + (off ? " and the " + off + " office" : "");
    }

    function render(s) {
        if (!s || !s.role) return;
        state = s;
        var p = RFParty.get() || {}, bar = $("partyBar"), staff = s.role === "lead";
        bar.hidden = false;
        document.documentElement.classList.add("partyOn");
        // 새 공지 - 따라가기에서 띄우고 읽어 줌(hike.js 의 RFParty.onNotice)
        if (s.notice && s.noticeAt && s.noticeAt !== p.noticeAt) {
            p.noticeAt = s.noticeAt;
            RFParty.set(p);
            if (RFParty.onNotice) RFParty.onNotice(s.notice);
        }
        if (staff) {
            $("pbText").innerHTML = "🧭 " + esc(s.name) + (s.chief ? T(" · 주 인솔자", " · Leader") : T(" · 보조 인솔자", " · Assistant leader"));
            $("pbBtns").innerHTML = "<a class=\"pb\" href=\"party.html" + (EN ? "?lang=en" : "") + "\">" + T("산악회 방 열기", "Open club room") + "</a>";
            return;
        }
        var line = "📡 " + esc(s.name) + " · ";
        if (s.cancelled) line += T("❌ 출발 때 타지 않아 빠졌습니다. 인솔자에게 연락하세요.", "❌ You weren't on the bus at departure, so you were dropped. Contact your leader.");
        else if (s.aboard && s.apart) line += T("🚶 따로 귀가 - 조심히 가세요. 위치는 더 보내지 않습니다.", "🚶 Going home separately - take care. Your location is no longer sent.");
        else if (s.aboard) line += T("🚌 하산 탑승 - 수고하셨습니다.", "🚌 Back on the bus - well done!");
        else if (s.locOn === false) line += T((s.locFrom ? "내 탑승지 출발(" + clock(s.locFrom) + ")" : "출발" + (s.departAt ? "(" + clock(s.departAt) + ")" : "")) + "부터 · 버스에 타면 바로 인솔자에게 위치를 보냅니다.",
            "Your location goes to the leader from " + (s.locFrom ? "your stop's departure (" + clock(s.locFrom) + ")" : "departure" + (s.departAt ? " (" + clock(s.departAt) + ")" : "")) + ", or as soon as you board.");
        // 제3자 제공 매회 즉시 통보(위치정보법 제19조 제3항, 2026-10-27 위치정보지원센터 답 · 홍TV님 (가)): 받는 자 · 목적 · 마지막 제공 때
        // 받는 자는 인솔자 모두(주 · 보조, 2026-10-28 홍TV님 - 몰래 들어온 인솔자가 없게 회원이 다 봄)
        else line += T(leadsText(s, true) + "에게 위치 제공 중 · 목적: 산행 안전 확인" + (s.providedAt ? " · 마지막 제공 " + clock(s.providedAt) : " · 아직 제공 전"),
            "Sharing your location with " + leadsText(s, false) + " · purpose: hiking safety" + (s.providedAt ? " · last shared " + clock(s.providedAt) : " · not shared yet"));
        // 내 탑승지 출발 시각 - 정각에 떠남(2026-10-27 홍TV님 "기다려 주지 않아")
        var si = (s.stops || []).indexOf(s.stop), stt = si >= 0 && s.stopTimes ? s.stopTimes[si] : "";
        if (stt && !s.departed && !s.boarded && !s.cancelled) line += T(" · 🚏 " + esc(s.stop) + " " + stt + " 정각 출발 - 미리 와 계세요", " · 🚏 " + esc(s.stop) + " leaves at " + stt + " sharp - be there early");
        // 내가 탈 차 - 호차 · 차량번호(방 만들 때 넣은 것, 2026-10-27 홍TV님 "이미 있는데 그걸 이용해서 회원에게 보여주면 되지") - 탈 때까지
        var plate = (s.plates || [])[(s.bus || 1) - 1];
        if (plate && !s.boarded && !s.departed && !s.cancelled) line += T(" · 🚌 " + (s.buses > 1 ? s.bus + "호차 " : "") + esc(plate), " · 🚌 " + (s.buses > 1 ? "bus " + s.bus + " " : "") + esc(plate));
        if (s.seat && !s.cancelled) line += T(" · 💺 " + (s.buses > 1 ? s.bus + "호차 " : "") + s.seat + "번", " · 💺 " + (s.buses > 1 ? "bus " + s.bus + " " : "") + "seat " + s.seat);
        if (s.boarded && !s.departed && !s.cancelled) line += T(" · ✅ 탑승", " · ✅ On bus");
        $("pbText").innerHTML = line;
        var b = [];
        if (s.departed && !s.cancelled && !s.aboard) {
            b.push("<button type=\"button\" class=\"pb main\" data-act=\"aboard\">" + T("🚌 하산 탑승", "🚌 Back on the bus") + "</button>");
            b.push("<button type=\"button\" class=\"pb\" data-act=\"apart\">" + T("🚶 따로 귀가", "🚶 Going home separately") + "</button>");
        }
        b.push("<button type=\"button\" class=\"pb\" data-act=\"say\">" + T("💬 인솔자에게", "💬 To leader") + "</button>");   // 한 줄(2026-10-27)
        if (s.leaderPhone) b.push("<a class=\"pb\" href=\"tel:" + esc(String(s.leaderPhone).replace(/[^0-9+]/g, "")) + "\">" + T("☎ 인솔자", "☎ Leader") + "</a>");
        var my = (s.busPins || []).filter(function (x) { return x.bus === s.bus; })[0];
        if (my && !s.cancelled) b.push("<a class=\"pb\" target=\"_blank\" rel=\"noopener\" href=\"https://map.kakao.com/link/map/" + encodeURIComponent(T("우리 버스", "Our bus") + (plate ? " " + plate : "")) + "," + my.lat + "," + my.lon + "\">" + T("🚌 우리 버스", "🚌 Our bus") + "</a>");
        b.push("<button type=\"button\" class=\"pb\" data-act=\"leave\">" + (s.aboard || s.cancelled ? T("닫기", "Close") : T("그만 보내기", "Stop sending")) + "</button>");
        $("pbBtns").innerHTML = b.join("");
        if (wantWatch(s)) startWatch(); else stopWatch();
    }

    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("#pbBtns [data-act]");
        if (!a || !state) return;
        var p = RFParty.get(), act = a.getAttribute("data-act");
        if (!p) { hide(); return; }
        if (act === "say") {   // 인솔자에게 한 줄 - 인솔자 화면에 뜨고 읽어 줌(80자, 1분에 한 번)
            var t = prompt(T("인솔자에게 보낼 한 줄(80자까지)\n예: 화장실 들렀다 10분 늦어요", "One line to your leader (up to 80 characters)\ne.g. Running 10 minutes late"), "");
            if (t == null || !t.trim()) return;
            RFParty.post("say", { token: p.token, text: t.trim().slice(0, 80) }).then(function (j) { render(j); alert(T("인솔자에게 보냈습니다.", "Sent to your leader.")); })
                .catch(function (er) { fail(er); if (!er.ended) alert(er.message); });
            return;
        }
        if (act === "aboard") {
            if (!confirm(T("하산 탑승을 인솔자에게 알릴까요?\n알리면 위치 보내기를 멈춥니다.", "Tell your leader you're back on the bus?\nThis stops sending your location."))) return;
            if (p.sos) RFParty.sos(false);
            RFParty.post("aboard", { token: p.token, on: true }).then(render).catch(function (er) { fail(er); if (!er.ended) alert(er.message); });
        } else if (act === "apart") {   // 하산 뒤 버스를 안 타고 따로 감(2026-10-27 홍TV님 - 설악산에서 더 여행하다 오는 회원)
            if (!confirm(T("버스를 타지 않고 따로 귀가한다고 인솔자에게 알릴까요?\n알리면 위치 보내기를 멈춥니다.", "Tell your leader you're going home separately (not on the bus)?\nThis stops sending your location."))) return;
            if (p.sos) RFParty.sos(false);
            RFParty.post("aboard", { token: p.token, on: true, apart: true }).then(render).catch(function (er) { fail(er); if (!er.ended) alert(er.message); });
        } else if (act === "leave") {
            var done = state.aboard || state.cancelled;
            if (!done && !confirm(T("인솔자에게 위치 보내기를 그만둘까요?\n인솔자 명단에는 이름이 남고, 위치만 더 가지 않습니다.", "Stop sending your location to the leader?\nYour name stays on the leader's list; only your location stops."))) return;
            RFParty.post("leave", { token: p.token }).catch(function () { /* 이미 끝났어도 */ }).finally(function () { RFParty.clear(); hide(); });
        }
    });
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") refresh();
        else stopWatch();
    });

    if (RFParty.get()) {
        refresh();
        timer = setInterval(function () { if (document.visibilityState === "visible") refresh(); }, POLL_MS);
    }
})();
