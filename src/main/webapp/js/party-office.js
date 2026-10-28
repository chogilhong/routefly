/*
 * 회사 사무실 화면(2026-10-28 홍TV님) - 한 회사의 산악회 방을 한눈에. party-office.html 이 씀.
 * 사무실 링크 = party-office.html#k=비밀열쇠 (# 뒤라 서버 접속 기록에 남지 않음). 이 기기 localStorage "rf-office-key" 에 둠.
 * 목록은 숫자만(이름 · 위치 없음). "열기" = 그 방에 사무실 자리를 만들어 인솔자 화면(party.html)으로 - 위치는 거기서만 봄.
 */
(function () {
    var KEY = "rf-office-key", EVERY_MS = 30000;
    var $ = function (id) { return document.getElementById(id); };
    var key = null, timer = null;

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
    var netErr = false;   // 서버 오류 글만 새로 받기에서 지움(복사 · 새 코드 안내는 남김, 10-28 PC)
    function msg(t, err) { $("msg").textContent = t || ""; netErr = !!err; }
    function store(k) { try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch (e) { /* 이번만 */ } }
    function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    /** KST 날짜 · 시각 "10/28 13:05". */
    function when(ms) {
        if (!ms) return "-";
        var d = new Date(ms + 9 * 3600000);
        return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2);
    }
    function ago(sec) {
        if (sec == null) return "-";
        return sec < 60 ? "방금" : sec < 3600 ? Math.floor(sec / 60) + "분 전" : Math.floor(sec / 3600) + "시간 전";
    }
    function linkOf(k) { return location.origin + location.pathname + "#k=" + k; }

    function showOnly(id) {
        ["newSec", "madeSec", "officeSec"].forEach(function (x) { $(x).hidden = x !== id; });
    }

    var last = null;   // 마지막으로 받은 사무실 - 엑셀 내려받기에 씀(서버에 다시 묻지 않음)
    function render(j) {
        last = j;
        $("offTitle").textContent = "🏢 " + j.name + " 사무실";
        $("title").textContent = "🏢 " + j.name + " 사무실";
        $("offCode").textContent = j.code;
        $("updated").textContent = when(j.now) + " 기준";
        var rooms = (j.rooms || []).slice();
        // SOS → 소식 없음 → 나머지(출발 빠른 순)
        rooms.sort(function (a, b) {
            var ka = a.sos > 0 ? 0 : a.silent > 0 ? 1 : 2, kb = b.sos > 0 ? 0 : b.silent > 0 ? 1 : 2;
            return ka !== kb ? ka - kb : (a.departAt || 0) - (b.departAt || 0);
        });
        $("liveCount").textContent = rooms.length + "곳";
        $("live").innerHTML = rooms.map(function (r) {
            var cls = r.sos > 0 ? "sos" : r.silent > 0 ? "warn" : "";
            var state = r.departed ? (r.notDown === 0 && r.hikers > 0 ? "<span class=\"ok\">모두 하산</span>" : "🥾 산행 중") : "출발 전 · " + when(r.departAt);
            // 호차마다 "1호차 34나2222 (45석)", 탑승지 "사당 23:20 · 양재 23:30"(2026-10-28 홍TV님 "더 해")
            var buses = [];
            for (var i = 0; i < (r.buses || 1); i++) {
                var pl = (r.plates || [])[i], st = (r.busSeats || [])[i];
                buses.push((r.buses > 1 ? (i + 1) + "호차 " : "🚌 ") + (pl ? esc(pl) : "번호 없음") + (st ? " (" + st + "석)" : ""));
            }
            var dk = Object.keys(r.drops || {}), drops = dk.length > 1 || (dk.length === 1 && dk[0] !== "미정") ? dk.map(function (k) { return esc(k) + " " + r.drops[k]; }).join(" · ") : "";   // 하차 지점마다 몇 명
            var stops = (r.stops || []).map(function (x, k) { var t = (r.stopTimes || [])[k]; return esc(x) + (t ? " " + esc(t) : ""); }).join(" · ");
            return "<tr class=\"" + cls + "\"><td class=\"name\"><b>" + esc(r.name) + "</b><br><small>" + when(r.departAt) + "<br>" + buses.join("<br>") + (stops ? "<br>🚏 " + stops : "") + (drops ? "<br>⬇ " + drops : "")
                + ((r.pickups || []).length ? "<br>🚌 " + r.pickups.map(function (q) { return esc(q.name) + " " + (q.at ? when(q.at).split(" ")[1] : "") + (r.departed ? " " + q.on + "/" + q.all : " " + q.all + "명"); }).join(" · ") : "")
                + (r.homeAt ? "<br>🏠 출발지 도착 예정 " + when(r.homeAt).split(" ")[1] : "") + "</small></td>"
                + "<td>" + state + "</td>"
                + "<td>" + r.boarded + " / " + r.hikers + (r.notBoarded ? " <small>(안 탐 " + r.notBoarded + ")</small>" : "") + "</td>"
                + "<td>" + (r.departed ? r.aboard + " / " + r.hikers + (r.apart ? " <small>(따로 " + r.apart + ")</small>" : "") : "-") + "</td>"
                + "<td>" + (r.sos > 0 ? "<span class=\"red\">🆘 " + r.sos + "</span>" : "0") + "</td>"
                + "<td>" + (r.silent > 0 ? "<span class=\"yel\">" + r.silent + "명</span>" : "0") + "</td>"
                + "<td>" + ago(r.lastAgo) + "</td>"
                + "<td class=\"name\">" + esc(r.chief || "-") + (r.chiefDrop ? " <small>(" + (r.chiefDrop === "버스 대기" ? "🚌 버스 대기" : "⬇ " + esc(r.chiefDrop) + " 하차") + ")</small>" : "") + (r.leaderPhone ? "<br><a href=\"tel:" + esc(r.leaderPhone.replace(/[^0-9+]/g, "")) + "\" style=\"color:var(--sky)\">📞 " + esc(r.leaderPhone) + "</a>" : "")
                    + ((r.assistantNames || []).length ? "<br><small>보조 " + r.assistantNames.map(esc).join(" · ") + "</small>" : "") + "</td>"
                + "<td><button data-open=\"" + esc(r.code) + "\" data-name=\"" + esc(r.name) + "\">열기</button> <button class=\"danger\" data-detach=\"" + esc(r.code) + "\" data-name=\"" + esc(r.name) + "\" title=\"잘못 올라온 방을 이 화면에서 뺌\">빼기</button></td></tr>";
        }).join("") || "<tr><td colspan=\"9\">지금 이 회사에 올라온 방이 없습니다. 인솔자에게 회사 코드 <b>" + esc(j.code) + "</b> 를 알려 주세요.</td></tr>";
        $("ended").innerHTML = (j.ended || []).slice(0, 100).map(function (r) {
            var nd = r.notDown > 0 && !r.cancelled;
            return "<tr" + (nd ? " class=\"warn\"" : "") + "><td>" + when(r.endedAt) + "</td><td class=\"name\">" + esc(r.name) + (r.cancelled ? " <span class=\"red\">취소</span>" + (r.why ? " <small>(" + esc(r.why) + ")</small>" : "") : "") + "</td>"
                + "<td>" + esc(r.by) + "</td><td>" + r.boarded + " / " + r.hikers + "</td><td>" + (r.departed ? r.aboard + " / " + r.hikers : "-") + "</td>"
                + "<td>" + (nd ? "<span class=\"yel\">⚠ " + r.notDown + "명</span>" : "0") + "</td><td>" + (r.sosEver ? "<span class=\"red\">있었음</span>" : "-") + "</td></tr>";
        }).join("") || "<tr><td colspan=\"7\">아직 끝난 산행이 없습니다.</td></tr>";
    }

    function load() {
        return RFParty.post("office/rooms", { key: key }).then(function (j) { if (netErr) msg(""); showOnly("officeSec"); render(j); }).catch(function (e) {
            if (e && e.status === 403) { store(null); key = null; showOnly("newSec"); msg("사무실 링크가 맞지 않습니다. 링크를 다시 확인해 주세요."); return; }
            msg(e && e.message ? e.message : "서버에 닿지 않습니다.", true);
        });
    }

    function start() {
        var m = /^#k=([A-Za-z0-9_-]{20,64})$/.exec(location.hash || "");
        if (m) {
            store(m[1]);
            try { history.replaceState(null, "", location.pathname); } catch (e) { /* 그대로 */ }   // 주소창 · 화면 캡처에 열쇠가 남지 않게
        }
        key = (m && m[1]) || stored();
        if (!key) { showOnly("newSec"); return; }
        load();
        clearInterval(timer);
        timer = setInterval(function () { if (!document.hidden) load(); }, EVERY_MS);
    }

    // 끝난 산행 엑셀(CSV) 내려받기(2026-10-28 홍TV님 추천 1) - 이 화면이 이미 받은 숫자만
    $("csvBtn").addEventListener("click", function () {
        if (!last) { msg("아직 받지 못했습니다. 잠시 뒤 다시 눌러 주세요."); return; }
        if (!(last.ended || []).length) { msg("아직 끝난 산행이 없습니다."); return; }
        var d = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, "");
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([RFOfficeCsv.officeCsv(last.ended)], { type: "text/csv;charset=utf-8" }));
        a.download = "routefly-끝난산행-" + d + ".csv";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        msg("📥 " + last.ended.length + "건을 내려받았습니다(엑셀에서 열림).");
    });

    $("offCreate").addEventListener("click", function () {
        var n = $("offName").value.trim();
        if (!n) { msg("회사 이름을 적어 주세요."); $("offName").focus(); return; }
        RFParty.post("office/create", { name: n }).then(function (j) {
            store(j.key);
            key = j.key;
            $("linkBox").textContent = linkOf(j.key);
            showOnly("madeSec");
            msg("");
        }).catch(function (e) { msg(e.message); });
    });
    $("copyLink").addEventListener("click", function () {
        var t = $("linkBox").textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { msg("사무실 링크를 복사했습니다. 즐겨찾기에도 남겨 두세요."); })
            .catch(function () { msg("복사가 안 되면 위 링크를 길게 눌러 복사하세요."); });
    });
    $("goOffice").addEventListener("click", start);
    $("forget").addEventListener("click", function () {
        if (!confirm("이 기기에서 로그아웃할까요? 사무실은 그대로이고, 다시 들어오려면 사무실 링크가 있어야 합니다.")) return;
        store(null);
        location.reload();
    });
    // 사무실 링크 바꾸기 · 사무실 없애기(2026-10-28 홍TV님 "만들어")
    $("newKey").addEventListener("click", function () {
        if (!confirm("사무실 링크를 바꿀까요? 옛 링크는 바로 안 되고, 다른 직원에게 새 링크를 다시 알려 줘야 합니다.")) return;
        RFParty.post("office/newkey", { key: key }).then(function (j) {
            store(j.key);
            key = j.key;
            clearInterval(timer);
            $("madeTitle").textContent = "🔄 사무실 링크를 바꿨습니다";
            $("linkBox").textContent = linkOf(j.key);
            showOnly("madeSec");
            msg("");
        }).catch(function (e) { msg(e.message); });
    });
    $("copyMine").addEventListener("click", function () {   // 이 기기에 저장된 사무실 링크(2026-10-28 홍TV님 - 만든 뒤 링크를 놓쳤음)
        var t = linkOf(key);
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { msg("사무실 링크를 복사했습니다. 즐겨찾기 · 메모에 남겨 두세요(다른 사람에게 보이지 않게)."); })
            .catch(function () { prompt("아래 링크를 길게 눌러 복사하세요", t); });
    });
    $("newCode").addEventListener("click", function () {
        if (!confirm("회사 코드를 바꿀까요? 옛 코드로는 새 방을 올릴 수 없습니다(이미 올라온 방은 그대로). 인솔자들에게 새 코드를 다시 알려 줘야 합니다.")) return;
        RFParty.post("office/newcode", { key: key }).then(function (j) { msg("새 회사 코드: " + j.code + " - 인솔자들에게 알려 주세요."); load(); }).catch(function (e) { msg(e.message); });
    });
    $("delOffice").addEventListener("click", function () {
        var name = $("offTitle").textContent.replace(/^🏢 /, "").replace(/ 사무실$/, "");
        var typed = prompt("사무실을 없애면 되돌릴 수 없습니다. 회사 코드 · 사무실 링크가 안 되고 끝난 산행 요약이 모두 지워집니다(진행 중인 방은 그대로, 회사 연결만 끊음).\n\n없애려면 회사 이름을 그대로 적어 주세요: " + name, "");
        if (typed == null) return;
        RFParty.post("office/delete", { key: key, name: typed.trim() }).then(function () {
            store(null);
            alert("사무실을 없앴습니다.");
            location.reload();
        }).catch(function (e) { msg(e.message); });
    });

    document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("button[data-open], button[data-detach]");
        if (!b) return;
        var code = b.getAttribute("data-open") || b.getAttribute("data-detach"), name = b.getAttribute("data-name");
        if (b.hasAttribute("data-open")) {
            var cur = RFParty.get();
            if (cur && !cur.office && !confirm("이 기기에 참가한 다른 산악회 방(" + (cur.name || cur.code) + ")이 있습니다. 사무실로 이 방을 열면 그 방 화면은 이 기기에서 닫힙니다(방은 그대로). 열까요?")) return;
            RFParty.post("office/enter", { key: key, code: code }).then(function (j) {
                RFParty.set({ code: j.code, token: j.token, role: j.role, name: j.name, office: true });
                location.href = "party.html";
            }).catch(function (e2) { msg(e2.message); });
        } else {
            if (!confirm("\"" + name + "\" 방을 이 회사 화면에서 뺄까요? (방은 그대로, 사무실만 빠짐)")) return;
            RFParty.post("office/detach", { key: key, code: code }).then(load).catch(function (e2) { msg(e2.message); });
        }
    });

    start();
})();
