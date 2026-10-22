/* 🧭 안내산악회 화면(2026-10-22 홍TV님) - 관리 링크(club.html#k=…)로 들어옴(아이디 · 비밀번호 없음) · 신청 · 일정 올리기(하나 · 여러 개) · 산악회 방 만들기 · (운영자) 확인 · 링크 · 광고.
 * 시각은 늘 한국 시각(기기 시간대와 관계없이 - 2026-10-22 점검). */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var me = null;
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
    function two(n) { return (n < 10 ? "0" : "") + n; }
    /** 한국 시각 {date:"2026-10-25", time:"07:00"}. */
    function kst(ms) {
        var t = new Date(ms + 9 * 3600000);   // UTC 에 9시간 - getUTC* 로 읽음
        return { date: t.getUTCFullYear() + "-" + two(t.getUTCMonth() + 1) + "-" + two(t.getUTCDate()), time: two(t.getUTCHours()) + ":" + two(t.getUTCMinutes()) };
    }
    function kstMs(date, time) { return Date.parse(date + "T" + (time || "07:00") + ":00+09:00"); }
    function msg(id, t, ok) { $(id).textContent = t || ""; $(id).className = "msg" + (ok ? " ok" : ""); }
    function post(path, body) {
        return fetch("api/club/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", credentials: "same-origin", body: JSON.stringify(body || {}) })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (j) {
                    if (!r.ok) { var e = new Error(j.message || (navigator.onLine === false ? "인터넷에 연결되지 않았습니다." : "잠시 뒤 다시 해 주세요(" + r.status + ").")); e.status = r.status; throw e; }
                    return j;
                });
            });
    }

    // ---------------------------------------------------------------- 들어오기
    function show(j) {
        me = j;
        $("out").hidden = true; $("in").hidden = false;
        var c = j.club;
        $("myName").textContent = c.name;
        $("myState").innerHTML = "<span class=\"st ok\">✅ 확인된 산악회</span> - 일정이 산 페이지 · 일정 모음에 공개됩니다."
            + (c.featuredUntil ? " <span class=\"st\">📣 광고 " + kst(c.featuredUntil).date + "까지</span>" : "");
        $("edName").value = c.name; $("edPhone").value = c.phone; $("edPub").value = c.publicPhone || ""; $("edUrl").value = c.url || "";
        $("edStops").value = c.defStops || ""; $("edBuses").value = c.defBuses || 1; $("edSeats").value = c.defSeats != null ? c.defSeats : 28;
        $("trStops").placeholder = c.defStops ? "비우면 " + c.defStops : "예: 사당 06:50, 양재 07:10";
        var t = j.trips || [];
        $("myTrips").innerHTML = t.length ? t.map(function (x) {
            return "<div class=\"trip\"><b>" + esc(x.when) + "</b> [" + esc(x.mountain) + "] " + esc(x.title)
                + "<br><span class=\"dim\">" + (x.stops ? esc(x.stops) : "탑승지 없음") + (x.price ? " · " + Number(x.price).toLocaleString("ko-KR") + "원" : "") + (x.bookUrl ? " · 예약 주소 있음" : "") + "</span>"
                + "<div class=\"row\"><a class=\"btn\" href=\"" + esc(roomUrl(x, c)) + "\">🧭 산악회 방</a><button type=\"button\" data-copy=\"" + x.id + "\">📄 복사</button>"
                + "<button type=\"button\" data-edit=\"" + x.id + "\">✏️ 고치기</button><button type=\"button\" class=\"danger\" data-del=\"" + x.id + "\">지우기</button></div></div>";
        }).join("") : "<p class=\"dim\">아직 올린 일정이 없습니다.</p>";
    }
    /** 산악회 방 만들기 화면 - 이 일정 · 기본 차량 수 · 좌석으로 채움(인솔자 이름은 비움 - 그날 인솔자가 적음). */
    function roomUrl(x, c) {
        var k = kst(x.departAt);
        var q = new URLSearchParams({ mk: "1", n: x.title, d: k.date.slice(5, 7) + k.date.slice(8, 10), t: k.time.replace(":", ""),
            st: (x.stops || "").replace(/\s*\d{1,2}:\d{2}/g, ""), b: String(c.defBuses || 1), s: String(c.defSeats != null ? c.defSeats : 28) });
        if (c.publicPhone) q.set("ph", c.publicPhone);
        return "party.html?" + q.toString();
    }
    function out(text) { me = null; $("in").hidden = true; $("out").hidden = false; if (text) msg("enterMsg", text); }

    function load() {
        var key = /[#&]k=([A-Za-z0-9_-]{20,64})/.exec(location.hash);
        if (key && history.replaceState) history.replaceState(null, "", location.pathname);   // 링크 열쇠를 주소창 · 방문 기록에 남기지 않게
        var go = key ? post("enter", { key: key[1] }) : post("me");
        go.then(show).catch(function (e) {
            if (e.status === 404) { $("closed").hidden = false; return; }
            out(key ? e.message : "");
        }).finally(admin);
    }

    // ---------------------------------------------------------------- 신청
    $("apBtn").addEventListener("click", function () {
        if (!$("apName").value.trim()) { msg("apMsg", "산악회 이름을 적어 주세요."); return; }
        if (!$("apPhone").value.trim()) { msg("apMsg", "운영자 연락처를 적어 주세요."); return; }
        if (!$("apAgree").checked) { msg("apMsg", "개인정보 수집 · 이용에 동의해 주세요."); return; }
        msg("apMsg", "보내는 중…", true);
        post("apply", { name: $("apName").value.trim(), phone: $("apPhone").value.trim(), publicPhone: $("apPub").value.trim() || null, url: $("apUrl").value.trim() || null, agree: true })
            .then(function () { msg("apMsg", "신청했습니다. 운영자가 확인 전화를 드린 뒤 관리 링크를 보내 드립니다.", true); $("apBtn").disabled = true; })
            .catch(function (e) { msg("apMsg", e.message); });
    });
    $("loBtn").addEventListener("click", function () { post("logout").finally(function () { out("이 기기에서 나갔습니다. 다시 들어오려면 관리 링크를 여세요."); }); });

    // ---------------------------------------------------------------- 일정 하나
    function resetTrip() {
        $("trId").value = ""; $("trTitle").value = ""; $("trStops").value = ""; $("trPrice").value = ""; $("trUrl").value = ""; $("trRepeat").value = "0";
        $("tripTitle").textContent = "📅 일정 올리기"; $("trBtn").textContent = "일정 올리기"; $("trCancel").hidden = true; $("trRepeat").disabled = false;
    }
    $("trCancel").addEventListener("click", resetTrip);
    $("trBtn").addEventListener("click", function () {
        if (!$("trDate").value) { msg("trMsg", "출발 날짜를 골라 주세요."); return; }
        var at = kstMs($("trDate").value, $("trTime").value);
        if (!isFinite(at)) { msg("trMsg", "날짜 · 시각을 확인해 주세요."); return; }
        var body = { departAt: at, mountain: $("trMt").value, title: $("trTitle").value.trim(), stops: $("trStops").value.trim() || null,
            price: Math.max(0, Math.round(+$("trPrice").value || 0)), bookUrl: $("trUrl").value.trim() || null, repeat: +$("trRepeat").value || 0 };
        if ($("trId").value) body.id = +$("trId").value;
        post("trip", body).then(function (j) { show(j); msg("trMsg", body.id ? "고쳤습니다." : body.repeat ? (body.repeat + 1) + "개 올렸습니다." : "올렸습니다.", true); resetTrip(); })
            .catch(function (e) { msg("trMsg", e.message); });
    });
    function fillTrip(x, plusDays) {
        var k = kst(x.departAt + (plusDays || 0) * 86400000);
        $("trDate").value = k.date; $("trTime").value = k.time;
        $("trMt").value = x.mountain; $("trTitle").value = x.title; $("trStops").value = x.stops || ""; $("trPrice").value = x.price || ""; $("trUrl").value = x.bookUrl || "";
    }
    $("myTrips").addEventListener("click", function (e) {
        var ed = e.target.closest("[data-edit]"), cp = e.target.closest("[data-copy]"), del = e.target.closest("[data-del]");
        var find = function (el, a) { return (me.trips || []).filter(function (t) { return String(t.id) === el.getAttribute(a); })[0]; };
        if (ed && me) {
            var x = find(ed, "data-edit");
            if (!x) return;
            fillTrip(x, 0);
            $("trId").value = x.id; $("trRepeat").value = "0"; $("trRepeat").disabled = true;
            $("tripTitle").textContent = "✏️ 일정 고치기"; $("trBtn").textContent = "고친 것 저장"; $("trCancel").hidden = false;
            $("tripTitle").scrollIntoView({ behavior: "smooth" });
        }
        if (cp && me) {   // 일주일 뒤 같은 산행(2026-10-22 점검 - 매주 같은 산행을 다시 적지 않게)
            var y = find(cp, "data-copy");
            if (!y) return;
            resetTrip();
            fillTrip(y, 7);
            msg("trMsg", "일주일 뒤로 채웠습니다. 확인하고 \"일정 올리기\" 를 누르세요.", true);
            $("tripTitle").scrollIntoView({ behavior: "smooth" });
        }
        if (del && confirm("이 일정을 지울까요?")) post("trip-delete", { id: +del.getAttribute("data-del") }).then(show).catch(function (er) { msg("trMsg", er.message); });
    });

    // ---------------------------------------------------------------- 여러 일정 한꺼번에
    function bulk(save) {
        var t = $("bkText").value.trim();
        if (!t) { $("bkOut").textContent = "붙여넣을 일정을 적어 주세요."; return; }
        post("bulk", { text: t, save: save }).then(function (j) {
            if (save) show(j);
            var b = j.bulk || {}, ok = b.trips || [], bad = b.bad || [];
            $("bkOut").innerHTML = (save ? "<b class=\"st ok\">" + (b.saved || []).length + "개 올렸습니다.</b>" : "<b>읽은 일정 " + ok.length + "개</b> (아직 안 올림):")
                + (save ? "" : "<br>" + ok.map(function (x) { return "· " + esc(new Date(x.departAt + 9 * 3600000).toISOString().slice(5, 16).replace("T", " ").replace("-", "/")) + " [" + esc(x.mountain) + "] " + esc(x.title) + (x.price ? " · " + Number(x.price).toLocaleString("ko-KR") + "원" : ""); }).join("<br>"))
                + (bad.length ? "<br><span style=\"color:#ff8787\">못 읽은 줄 " + bad.length + "개:<br>" + bad.map(esc).join("<br>") + "</span>" : "");
            if (save && !bad.length) $("bkText").value = "";
        }).catch(function (e) { $("bkOut").textContent = e.message; });
    }
    $("bkPreview").addEventListener("click", function () { bulk(false); });
    $("bkSave").addEventListener("click", function () { if (confirm("붙여넣은 일정을 모두 올릴까요?")) bulk(true); });

    // ---------------------------------------------------------------- 정보 · 그만두기
    $("edBtn").addEventListener("click", function () {
        post("edit", { name: $("edName").value.trim(), phone: $("edPhone").value.trim(), publicPhone: $("edPub").value.trim() || null, url: $("edUrl").value.trim() || null,
            defStops: $("edStops").value.trim() || null, defBuses: +$("edBuses").value || 1, defSeats: +$("edSeats").value })
            .then(function (j) {
                if (j.recheck) { alert("누리집 주소가 바뀌어 운영자가 다시 확인합니다. 확인되면 새 관리 링크를 보내 드립니다(그때까지 일정이 안 보임)."); out(); return; }
                show(j); msg("edMsg", "저장했습니다.", true);
            }).catch(function (e) { msg("edMsg", e.message); });
    });
    $("quitBtn").addEventListener("click", function () {
        if (!confirm("정말 그만둘까요? 산악회 정보와 일정이 모두 지워집니다.")) return;
        post("quit").then(function () { alert("모두 지웠습니다. 그동안 고맙습니다."); out(); }).catch(function (e) { msg("quitMsg", e.message); });
    });

    // ---------------------------------------------------------------- 운영자(통계 화면을 연 기기만 - 아니면 404 라 안 보임)
    function admin() {
        post("admin/list").then(drawAdmin).catch(function () { $("admin").hidden = true; });
    }
    function drawAdmin(j) {
        $("admin").hidden = false;
        $("adBroken").textContent = j.broken || "";
        var cs = j.clubs || [];
        $("adminList").innerHTML = cs.length ? cs.map(function (c) {
            var days = c.featuredUntil ? Math.ceil((c.featuredUntil - Date.now()) / 86400000) : 0;
            return "<div class=\"adc\"><b>" + esc(c.name) + "</b> " + (c.approved ? "<span class=\"st ok\">✅ 확인</span>" : "<span class=\"st wait\">⏳ 확인 기다림</span>")
                + "<br><span class=\"dim\">운영자 ☎ <a href=\"tel:" + esc(String(c.phone).replace(/[^0-9+]/g, "")) + "\">" + esc(c.phone) + "</a>" + (c.publicPhone ? " · 공개 ☎ " + esc(c.publicPhone) : "")
                + " · 일정 " + c.trips + " · 신청 " + esc(c.created) + (c.lastSeen ? " · 최근 " + esc(c.lastSeen) : "") + (c.hasLink ? " · 링크 있음" : "") + "</span>"
                + (c.url ? "<br><a href=\"" + esc(c.url) + "\" target=\"_blank\" rel=\"noopener nofollow\">" + esc(c.url) + "</a>" : "")
                + "<div class=\"row\"><button type=\"button\" data-ap=\"" + c.id + "\" data-on=\"" + (!c.approved) + "\">" + (c.approved ? "확인 풀기" : "✅ 확인") + "</button>"
                + (c.approved ? "<button type=\"button\" data-link=\"" + c.id + "\">🔗 관리 링크 " + (c.hasLink ? "새로" : "만들기") + "</button>" : "")
                + "<span class=\"dim\" style=\"align-self:center\">광고</span><input type=\"number\" min=\"0\" max=\"400\" id=\"fd" + c.id + "\" value=\"" + days + "\" aria-label=\"광고 일 수\"><button type=\"button\" data-ft=\"" + c.id + "\">저장</button>"
                + "<button type=\"button\" class=\"danger\" data-rm=\"" + c.id + "\">지우기</button></div></div>";
        }).join("") : "<p class=\"dim\">아직 신청한 산악회가 없습니다.</p>";
    }
    $("adminList").addEventListener("click", function (e) {
        var ap = e.target.closest("[data-ap]"), ln = e.target.closest("[data-link]"), ft = e.target.closest("[data-ft]"), rm = e.target.closest("[data-rm]");
        var fail = function (er) { msg("adMsg", er.message); };
        if (ap) post("admin/approve", { id: +ap.getAttribute("data-ap"), on: ap.getAttribute("data-on") === "true" }).then(drawAdmin).catch(fail);
        if (ln && confirm("관리 링크를 만들까요? 예전 링크가 있으면 못 쓰게 되고 그 산악회의 로그인도 끊깁니다."))
            post("admin/link", { id: +ln.getAttribute("data-link") }).then(function (j) {
                drawAdmin(j);
                var url = new URL("club.html#k=" + j.key, location.href).href;
                $("adMsg").innerHTML = "관리 링크(지금 한 번만 보임 - 운영자 연락처로 문자 · 카톡 보내기):<br><b>" + esc(url) + "</b><br><button type=\"button\" id=\"adCopy\">📋 복사</button>";
                $("adMsg").className = "msg ok";
                $("adCopy").addEventListener("click", function () { (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { $("adCopy").textContent = "복사했습니다"; }).catch(function () { prompt("복사하세요", url); }); });
            }).catch(fail);
        if (ft) post("admin/feature", { id: +ft.getAttribute("data-ft"), days: Math.max(0, Math.round(+$("fd" + ft.getAttribute("data-ft")).value || 0)) })
            .then(function (j) { drawAdmin(j); msg("adMsg", "광고 기간을 저장했습니다.", true); }).catch(fail);
        if (rm && confirm("이 산악회와 일정을 모두 지울까요?")) post("admin/delete", { id: +rm.getAttribute("data-rm") }).then(drawAdmin).catch(fail);
    });

    // ---------------------------------------------------------------- 처음
    var rep = "<option value=\"0\">한 번</option>";
    for (var w = 1; w <= 12; w++) rep += "<option value=\"" + w + "\">" + w + "주 더(매주)</option>";
    $("trRepeat").innerHTML = rep;
    fetch("data/mountains100.json").then(function (r) { return r.json(); }).then(function (j) {   // 산 고르기(100대 명산 + 기타) - 산 페이지와 이름이 맞게
        var ids = (j.peaks || []).map(function (p) { return p.id; }).sort(function (a, b) { return a.localeCompare(b, "ko"); });
        $("trMt").innerHTML = "<option value=\"\">산 고르기</option>" + ids.map(function (id) { return "<option>" + esc(id) + "</option>"; }).join("") + "<option value=\"기타\">기타 (100대 명산 아님 - 제목에 산 이름)</option>";
    }).catch(function () { $("trMt").innerHTML = "<option value=\"기타\">기타</option>"; });
    var k7 = kst(Date.now() + 7 * 86400000);
    $("trDate").value = k7.date;
    load();
})();
