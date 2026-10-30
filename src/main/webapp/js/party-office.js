/*
 * 회사 사무실 화면(2026-10-28 홍TV님) - 한 회사의 산악회 방을 한눈에. party-office.html 이 씀.
 * 사무실 링크 = party-office.html#k=비밀열쇠 (# 뒤라 서버로 가지 않음 - 카톡에서 크롬으로 넘길 때만 잠깐 ?rfh=, no-kakao.js · 서버 기록은 ? 뒤 없음). 이 기기 localStorage "rf-office-keys"(여러 사무실, 2026-10-29) · 이 탭은 sessionStorage "rf-office-key".
 * 목록은 숫자만(이름 · 위치 없음). "열기" = 그 방에 사무실 자리를 만들어 인솔자 화면(party.html)으로 - 위치는 거기서만 봄.
 */
(function () {
    var KEY = "rf-office-key", EVERY_MS = 30000, lastLoad = 0;
    var $ = function (id) { return document.getElementById(id); };
    var key = null, timer = null;
    // 영어(2026-10-29 홍TV님 "영어로는 회사 사무실이 없네") - ?lang=en. 화면 글은 data-en, 스크립트 글은 T(한국어, 영어)
    var EN = /[?&]lang=en\b/.test(location.search);
    function T(ko, en) { return EN ? en : ko; }
    if (EN) {
        document.documentElement.lang = "en";
        document.title = "routefly Company office";
        Array.prototype.forEach.call(document.querySelectorAll("[data-en]"), function (el) { el.innerHTML = el.getAttribute("data-en"); });
        ["placeholder", "aria-label"].forEach(function (a) {
            Array.prototype.forEach.call(document.querySelectorAll("[data-en-" + a + "]"), function (el) { el.setAttribute(a, el.getAttribute("data-en-" + a)); });
        });
        $("backTop").href = "party.html?lang=en";
    }
    /** 서버 글(한국어)을 영어로 - 사무실에서 나오는 것만, 모르는 글은 그대로. */
    var EN_MSG = [
        [/회사 이름을 적어 주세요/, "Please enter the company name."],
        [/회사 이름이 맞지 않습니다/, "The company name doesn't match. To delete, type the company name exactly."],
        [/하루에 만들 수 있는 사무실 수를 넘었습니다/, "You've reached today's limit for creating offices. Please try again tomorrow."],
        [/지금은 사무실을 더 만들 수 없습니다/, "No more offices can be created right now."],
        [/이 회사의 방이 아니거나 이미 끝난 방입니다/, "This room isn't your company's, or it has already ended."],
        [/승인 기다리는 방입니다/, "This room is waiting for approval. If it's your club's room, tap \"Approve\" first."],
        [/이름을 너무 자주 바꿨습니다/, "The name was changed too often. Please try again in an hour."],
        [/너무 많이|잠시 뒤/, "Too many requests. Please try again in a moment."]
    ];
    function em(e) {
        var t = e && e.message ? e.message : T("서버에 닿지 않습니다.", "Can't reach the server.");
        if (!EN) return t;
        for (var i = 0; i < EN_MSG.length; i++) if (EN_MSG[i][0].test(t)) return EN_MSG[i][1];
        return /[가-힣]/.test(t) ? t + " (Korean message)" : t;
    }
    function officeOf(n) { return EN ? n + " office" : n + " 사무실"; }

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; }); }
    var netErr = false;   // 서버 오류 글만 새로 받기에서 지움(복사 · 새 코드 안내는 남김, 10-28 PC)
    function msg(t, err) { $("msg").textContent = t || ""; netErr = !!err; }
    /** 단추 바로 아래에 잠깐(ms, 기본 3초) 알림 - 복사했다는 말처럼 그 자리에서 보이고 사라지는 것(2026-10-30 홍TV님 "아래에 나오게 하고 3초 쯤 지나면 사라지게"). */
    function noteBelow(btn, t, ms) {
        var row = btn.closest("p") || btn, n = row.nextElementSibling && row.nextElementSibling.classList.contains("btnNote") ? row.nextElementSibling : null;
        if (!n) {
            n = document.createElement("p");
            n.className = "btnNote";
            n.setAttribute("role", "status");
            n.setAttribute("aria-live", "polite");
            row.parentNode.insertBefore(n, row.nextSibling);
        }
        n.textContent = t;
        clearTimeout(n.rfTimer);
        n.rfTimer = setTimeout(function () { n.remove(); }, ms || 10000);   // 2026-10-30 홍TV님 "3초는 너무 빠르네, 10초"
    }
    // 내 사무실 여럿(2026-10-29 홍TV님 - 회사 2곳 · 방 5개): 이 기기가 연 사무실 [{k, n}] 을 LIST 에, 이 탭이 보는 사무실은 sessionStorage KEY(탭마다 다른 사무실),
    // 마지막으로 본 사무실은 localStorage KEY(새 탭 · 다음에 열 때). 예전 한 개짜리 KEY 는 처음 읽을 때 목록으로 옮김.
    var LIST = "rf-office-keys", drawn = null;
    function mine() {
        var a = [];
        try { a = JSON.parse(localStorage.getItem(LIST) || "[]") || []; } catch (e) { a = []; }
        a = a.filter(function (x) { return x && /^[A-Za-z0-9_-]{20,64}$/.test(x.k); });
        var old = null;
        try { old = localStorage.getItem(KEY); } catch (e) { /* 없음 */ }
        if (old && !a.some(function (x) { return x.k === old; })) a.push({ k: old, n: "" });
        return a;
    }
    function saveMine(a) { try { localStorage.setItem(LIST, JSON.stringify(a)); } catch (e) { /* 이번만 */ } }
    /** 이 탭 · 이 기기가 k 사무실을 봄(목록에 없으면 넣음, name 이 있으면 이름도). k 가 null 이면 이 탭 사무실을 목록에서 뺌.
     *  onlyName - 새로 받기(30초)에서 이름만: 목록에 없으면 넣지 않음(다른 탭에서 로그아웃한 사무실이 되살아나지 않게, 2026-10-29 점검). */
    function store(k, name, onlyName) {
        var a = mine();
        try {
            if (k) {
                var x = a.filter(function (y) { return y.k === k; })[0];
                if (!x && onlyName) return;
                if (!x) a.push(x = { k: k, n: "" });
                if (name) x.n = name;
                sessionStorage.setItem(KEY, k);
                localStorage.setItem(KEY, k);
            } else {
                var cur = stored();
                a = a.filter(function (y) { return y.k !== cur; });
                sessionStorage.removeItem(KEY);
                localStorage.removeItem(KEY);
            }
        } catch (e) { /* 이번만 */ }
        saveMine(a);
    }
    /** 이 탭 사무실 → 마지막으로 본 사무실 → 목록 첫 사무실. */
    function stored() {
        var k = null;
        try { k = sessionStorage.getItem(KEY) || localStorage.getItem(KEY); } catch (e) { /* 없음 */ }
        if (k) return k;
        var a = mine();
        return a.length ? a[0].k : null;
    }
    /** 열쇠 바꾸기 - 목록에서 옛 열쇠 자리를 새 열쇠로. */
    function swapKey(oldK, newK) {
        saveMine(mine().map(function (y) { return y.k === oldK ? { k: newK, n: y.n } : y; }));
        store(newK);
    }
    /** 위 "내 사무실" 줄 - 둘 이상이면 고르는 칸, "＋ 하나 더 만들기"(만드는 중에는 "‹ 보던 사무실로"). */
    function drawMine() {
        var a = mine(), sel = $("mineSel");
        $("mineBar").hidden = !a.length;
        $("allRow").hidden = $("allTip").hidden = a.length < 2 || !!bundle() || !OWNER;   // 사무실이 둘 이상이면 "모두 복사"(묶음이 있으면 묶음 링크로)
        $("qrMine").textContent = bundle() ? T("🔳 묶음 QR", "🔳 Bundle QR") : OWNER && a.length > 1 ? T("🔳 사무실 " + Math.min(a.length, ALL_MAX) + "개 모두 QR", "🔳 QR for all " + Math.min(a.length, ALL_MAX) + " offices") : T("🔳 사무실 링크 QR", "🔳 Office link QR");
        drawBundle();
        sel.hidden = a.length < 2;
        var html = a.map(function (y, i) { return "<option value=\"" + i + "\"" + (y.k === key ? " selected" : "") + ">🏢 " + esc(y.n || T("사무실 ", "Office ") + (i + 1)) + "</option>"; }).join("");
        if (html !== drawn) { sel.innerHTML = html; drawn = html; }   // 30초마다 그대로면 손대지 않음(펼친 목록이 닫히지 않게)
        var making = !$("newSec").hidden || !$("madeSec").hidden;
        $("mineAdd").hidden = making || !OWNER;   // 사무실이 있는 일반 사용자는 하나 더 만들기 없음(처음은 "사무실 만들기")
        $("mineBack").hidden = !making || !key;   // 만들기 화면에서 보던 사무실로
    }
    /** KST 날짜 · 시각 "10/28 13:05". */
    function when(ms) {
        if (!ms) return "-";
        var d = new Date(ms + 9 * 3600000);
        return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2);
    }
    function ago(sec) {
        if (sec == null) return "-";
        return sec < 60 ? T("방금", "just now") : sec < 3600 ? Math.floor(sec / 60) + T("분 전", " min ago") : Math.floor(sec / 3600) + T("시간 전", " h ago");
    }
    // 큰 글씨 확인 창(rf-dialog.js, 2026-10-28 접근성 - 인솔자 화면과 같게). 없으면 브라우저 창
    var D = window.RFDialog;
    function say(t) { if (D) return D.alert(t); alert(t); return Promise.resolve(); }
    function ask(t, o) { return D ? D.confirm(t, o) : Promise.resolve(confirm(t)); }
    function askText(t, v, o) { return D ? D.prompt(t, v, o) : Promise.resolve(prompt(t, v)); }
    var HERE = location.pathname + (EN ? "?lang=en" : "");   // 주소를 정리해도 영어는 남김(2026-10-29 점검)
    function linkOf(k) { return location.origin + HERE + "#k=" + k; }
    /** 이 기기의 사무실 모두를 링크 하나로(#ks=열쇠.열쇠… - 2026-10-30 홍TV님 "pc 의 두 개를 폰에서도 두 개로"). 많아야 ALL_MAX 개. */
    var ALL_MAX = 10;
    function linkAll() { return location.origin + HERE + "#ks=" + mine().slice(0, ALL_MAX).map(function (y) { return y.k; }).join("."); }
    /** 지금 QR · 모두 복사가 쓸 링크 - 사무실이 둘 이상이면 모두, 아니면 이 사무실. */
    function shareLink() { return bundle() ? linkBundle() : OWNER && mine().length > 1 ? linkAll() : linkOf(key); }
    // ---- 내 사무실 묶음(2026-10-30 홍TV님 "② 내 사무실 묶음 링크로 해줘"): 묶음 열쇠 하나를 기기마다 두고, 사무실 목록은 서버 묶음을 따름
    var BKEY = "rf-office-bundle", bundleSync = 0, bundleN = 0;
    // 관리자(운영자) 기기만 묶음 · 사무실 여럿(2026-10-30 홍TV님 "나만 묶음 관련, 그 외에는 안 보이게").
    // 운영자 = /stats 를 연 기기(서버 쿠키 - /office/me). "일반 사용자로 보기"(rf-office-guest)를 켜면 운영자 기기도 남처럼 보임(홍TV님 "양쪽을 검토해보게")
    var GKEY = "rf-office-guest", REAL_OWNER = false, OWNER = false;
    function guest() { try { return localStorage.getItem(GKEY) === "1"; } catch (e) { return false; } }
    var ownerP = RFParty.post("office/me", {}).then(function (j) { REAL_OWNER = !!(j && j.owner); }).catch(function () { /* 남으로 */ }).then(function () { OWNER = REAL_OWNER && !guest(); drawOwner(); });
    function drawOwner() {
        $("ownerRow").hidden = !REAL_OWNER;
        if (!REAL_OWNER) return;
        $("asWho").textContent = OWNER ? T("👤 일반 사용자로 보기", "👤 View as a regular user") : T("👑 관리자로 보기", "👑 View as admin");
        $("asTip").textContent = OWNER ? T("지금: 관리자 화면(묶음 · 사무실 여럿 보임)", "Now: admin view (bundle, several offices)") : T("지금: 일반 사용자 화면(다른 회사가 보는 그대로)", "Now: regular user view (as other companies see it)");
    }
    function bundle() { if (!OWNER) return null; var b = null; try { b = localStorage.getItem(BKEY); } catch (e) { /* 없음 */ } return /^[A-Za-z0-9_-]{20,64}$/.test(b || "") ? b : null; }
    function setBundle(b) { try { if (b) localStorage.setItem(BKEY, b); else localStorage.removeItem(BKEY); } catch (e) { /* 이번만 */ } }
    function linkBundle() { return location.origin + HERE + "#b=" + bundle(); }
    /** 서버 묶음 목록을 이 기기 목록으로(보던 사무실이 빠졌으면 첫 사무실). */
    function applyBundle(list) {
        saveMine(list.map(function (x) { return { k: x.key, n: x.name || "" }; }));
        var cur = null;
        try { cur = sessionStorage.getItem(KEY) || localStorage.getItem(KEY); } catch (e) { /* 없음 */ }
        if (!list.some(function (x) { return x.key === cur; })) {
            try {
                if (list.length) { sessionStorage.setItem(KEY, list[0].key); localStorage.setItem(KEY, list[0].key); }
                else { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); }
            } catch (e) { /* 이번만 */ }
        }
        bundleN = list.length;
    }
    /** 묶음 맞추기 - force 가 아니면 1분에 한 번. 묶음이 없어졌으면(403) 연결만 끊고 목록은 그대로. */
    function syncBundle(force) {
        var b = bundle();
        if (!b || (!force && Date.now() - bundleSync < 60000)) return Promise.resolve();
        bundleSync = Date.now();
        return RFParty.post("office/bundle", { bundle: b }).then(function (j) { if (bundle() === b) applyBundle(j.offices || []); }).catch(function (e) {
            if (e && e.status === 403 && bundle() === b) {
                setBundle(null);
                msg(T("묶음 링크가 바뀌었거나 없어져 이 기기의 묶음 연결을 끊었습니다(사무실 목록은 그대로). 새 묶음 링크로 다시 연결하세요.", "The bundle link changed or is gone, so this device was disconnected (office list kept). Reconnect with the new bundle link."));
            }
        });
    }
    /** 이 기기에만 있는 사무실을 묶음에 넣음(차례로, 실패는 건너뜀). */
    function pushLocal(b, have) {
        return mine().filter(function (y) { return have.indexOf(y.k) < 0; }).reduce(function (p, y) {
            return p.then(function () { return RFParty.post("office/bundle/add", { bundle: b, key: y.k }).catch(function () { /* 틀린 사무실 */ }); });
        }, Promise.resolve());
    }
    /** 묶음 링크(#b=…)로 들어옴 - 묶음의 사무실 이름을 보여 주고 연결할지 묻고, 이 기기에만 있던 사무실도 묶음에 넣음. */
    function joinBundle(b) {
        RFParty.post("office/bundle", { bundle: b }).then(function (j) {
            var list = j.offices || [];
            if (bundle() === b) { syncBundle(true).then(startNow); return; }
            var lines = list.map(function (x) { return "🏢 " + x.name; }).join("\n") || T("(아직 사무실 없음)", "(no offices yet)");
            return ask(T("묶음 링크로 들어왔습니다.\n\n" + lines + "\n\n이 기기를 이 묶음에 연결할까요? 이 기기에만 있던 사무실도 묶음에 들어가고, 앞으로 사무실 목록이 묶음과 같아집니다. 우리 회사 묶음이 맞을 때만 연결하세요.",
                "You opened a bundle link.\n\n" + lines + "\n\nConnect this device to the bundle? Offices only on this device join the bundle too, and the office list follows the bundle from now on. Only connect if it's your company's bundle."), { ok: T("연결", "Connect") }).then(function (ok) {
                if (!ok) { msg(T("연결하지 않았습니다.", "Not connected.")); startNow(); return; }
                return pushLocal(b, list.map(function (x) { return x.key; })).then(function () {
                    setBundle(b);
                    return syncBundle(true);
                }).then(function () { msg(T("묶음에 연결했습니다. 이 기기 사무실 " + mine().length + "곳.", "Connected to the bundle. " + mine().length + " offices on this device.")); startNow(); });
            });
        }).catch(function (e) {
            msg(e && e.status === 403 ? T("묶음 링크가 맞지 않습니다. 링크를 다시 확인해 주세요.", "The bundle link is not valid. Please check the link.") : em(e));
            startNow();
        });
    }
    function drawBundle() {
        var b = bundle();
        $("bundleOff").hidden = !!b || !OWNER;
        $("bundleOn").hidden = !b;
        $("forget").textContent = b ? T("이 사무실을 묶음에서 빼기 (사무실은 그대로)", "Remove this office from the bundle (office stays)") : T("이 기기에서 로그아웃 (사무실은 그대로)", "Log out on this device (office stays)");
        // 묶음이면 "🔳 묶음 QR" 을 "📋 묶음 링크 복사" 바로 옆으로(QR 도 그 아래) - 2026-10-30 홍TV님 "떨어져 있는데 옆에 같이"
        var qb = $("qrMine"), box = $("qrBox"), home = $("qrHome");
        if (b && qb.parentNode !== $("bundleCopy").parentNode) {
            $("bundleCopy").after(" ", qb);
            $("bundleCopy").parentNode.after(box);
        } else if (!b && qb.parentNode !== home) {
            home.appendChild(qb);
            home.after(box);
        }
        if (!$("qrTip").dataset.office) $("qrTip").dataset.office = $("qrTip").textContent;
        $("qrTip").textContent = b ? T("폰 카메라로 비추면 묶음 연결 화면이 열립니다. QR 을 가진 사람은 묶음의 모든 사무실을 열 수 있으니 우리 직원에게만 보여 주세요.",
            "Scan with a phone camera to connect to the bundle. Anyone with the QR can open every office in the bundle - show it only to your staff.") : $("qrTip").dataset.office;
        if (b) $("bundleState").textContent = T("🔗 이 기기는 내 사무실 묶음에 연결됨 - 사무실 " + mine().length + "곳(다른 기기와 같음)", "🔗 This device is connected to the office bundle - " + mine().length + " offices (same as other devices)");
    }

    function showOnly(id) {
        ["newSec", "madeSec", "officeSec"].forEach(function (x) { $(x).hidden = x !== id; });
    }

    // SOS 알림(2026-10-29 점검 - 사무실 PC 는 탭이 많아 다른 탭을 보는 동안 SOS 를 늦게 봄): 탭 제목 "🆘(n)", 삑 소리, PC 알림(허락했을 때)
    var seenSos = null, seenPend = null, audio = null, baseTitle = document.title;
    function beep() {
        try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            if (audio.state === "suspended") audio.resume();
            [0, 0.35, 0.7].forEach(function (t) {
                var o = audio.createOscillator(), gn = audio.createGain();
                o.frequency.value = 880; gn.gain.value = 0.25;
                o.connect(gn); gn.connect(audio.destination);
                o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
            });
        } catch (e) { /* 소리 없음 */ }
    }
    function warn(rooms, pend) {
        var sos = {}, total = 0, fresh = [];
        rooms.forEach(function (r) { if (r.sos > 0) { sos[r.code] = r.sos; total += r.sos; if (seenSos && !(seenSos[r.code] >= r.sos)) fresh.push(r.name); } });
        var newPend = seenPend != null && pend.length > seenPend;
        document.title = (total ? "🆘(" + total + ") " : "") + (pend.length ? "🕓(" + pend.length + ") " : "") + baseTitle;
        if (fresh.length || newPend) {
            beep();
            var text = fresh.length ? T("🆘 SOS - ", "🆘 SOS - ") + fresh.join(", ") : T("🕓 승인 기다리는 방이 새로 올라왔습니다.", "🕓 A new room is waiting for approval.");
            if (document.hidden && window.Notification && Notification.permission === "granted") {
                try { new Notification(T("routefly 회사 사무실", "routefly Company office"), { body: text, tag: "rf-office-" + Date.now() }); } catch (e) { /* 소리 · 제목으로 갈음 */ }
            }
        }
        seenSos = sos; seenPend = pend.length;
    }

    var last = null;   // 마지막으로 받은 사무실 - 엑셀 내려받기에 씀(서버에 다시 묻지 않음)
    function render(j) {
        last = j;
        store(key, j.name, true);   // 내 사무실 목록의 이름(바꾸기 · 처음 들어온 링크)
        drawMine();
        $("offTitle").textContent = "🏢 " + officeOf(j.name);
        $("title").textContent = "🏢 " + officeOf(j.name);
        baseTitle = "🏢 " + officeOf(j.name);
        $("offCode").textContent = j.code;
        $("updated").textContent = when(j.now) + T(" 기준", "");
        var rooms = (j.rooms || []).slice();
        // SOS → 소식 없음 → 나머지(출발 빠른 순)
        rooms.sort(function (a, b) {
            var ka = a.sos > 0 ? 0 : a.silent > 0 ? 1 : 2, kb = b.sos > 0 ? 0 : b.silent > 0 ? 1 : 2;
            return ka !== kb ? ka - kb : (a.departAt || 0) - (b.departAt || 0);
        });
        $("liveCount").textContent = rooms.length + T("곳", "");
        var pend = j.pending || [];   // 승인 기다리는 방(2026-10-28)
        warn(rooms, pend);
        $("pendSec").hidden = !pend.length;
        $("pendCount").textContent = pend.length + T("곳", "");
        $("pend").innerHTML = pend.map(function (r) {
            return "<tr><td class=\"name\"><b>" + esc(r.name) + "</b></td><td>" + when(r.departAt) + "</td><td class=\"name\">" + esc(r.chief || "-")
                + (r.leaderPhone ? "<br><a href=\"tel:" + esc(r.leaderPhone.replace(/[^0-9+]/g, "")) + "\" style=\"color:var(--sky)\">📞 " + esc(r.leaderPhone) + "</a>" : "") + "</td>"
                + "<td>" + r.hikers + T("명", "") + "</td><td><button class=\"main\" data-approve=\"" + esc(r.code) + "\" data-name=\"" + esc(r.name) + "\">" + T("승인", "Approve") + "</button> "
                + "<button class=\"danger\" data-detach=\"" + esc(r.code) + "\" data-name=\"" + esc(r.name) + "\">" + T("빼기", "Remove") + "</button></td></tr>";
        }).join("");
        $("live").innerHTML = rooms.map(function (r) {
            var cls = r.sos > 0 ? "sos" : r.silent > 0 ? "warn" : "";
            var state = r.departed ? (r.notDown === 0 && r.hikers > 0 ? "<span class=\"ok\">" + T("모두 하산", "All down") + "</span>" : T("🥾 산행 중", "🥾 Hiking")) : T("출발 전 · ", "Before departure · ") + when(r.departAt);
            // 호차마다 "1호차 34나2222 (45석)", 탑승지 "사당 23:20 · 양재 23:30"(2026-10-28 홍TV님 "더 해")
            var buses = [];
            for (var i = 0; i < (r.buses || 1); i++) {
                var pl = (r.plates || [])[i], st = (r.busSeats || [])[i];
                buses.push((r.buses > 1 ? T((i + 1) + "호차 ", "Bus " + (i + 1) + " ") : "🚌 ") + (pl ? esc(pl) : T("번호 없음", "no plate")) + (st ? T(" (" + st + "석)", " (" + st + " seats)") : ""));
            }
            var dk = Object.keys(r.drops || {}), drops = dk.length > 1 || (dk.length === 1 && dk[0] !== "미정") ? dk.map(function (k) { return esc(k) + " " + r.drops[k]; }).join(" · ") : "";   // 하차 지점마다 몇 명
            // "열기" 는 산행 이름 옆(2026-10-29 PC - 폰에서 맨 끝 칸은 표를 밀어야 보였음), "빼기" 는 실수로 누르지 않게 맨 끝 그대로
            var stops = (r.stops || []).map(function (x, k) { var t = (r.stopTimes || [])[k]; return esc(x) + (t ? " " + esc(t) : ""); }).join(" · ");
            return "<tr class=\"" + cls + "\"><td class=\"name\"><b>" + esc(r.name) + "</b> <button data-open=\"" + esc(r.code) + "\" data-name=\"" + esc(r.name) + "\">" + T("열기", "Open") + "</button><br><small>" + when(r.departAt) + "<br>" + buses.join("<br>") + (stops ? "<br>🚏 " + stops : "") + (drops ? "<br>⬇ " + drops : "")
                + ((r.pickups || []).length ? "<br>🚌 " + r.pickups.map(function (q) { return esc(q.name) + " " + (q.at ? when(q.at).split(" ")[1] : "") + (r.departed ? " " + q.on + "/" + q.all : " " + q.all + T("명", "")); }).join(" · ") : "")
                + (r.homeAt ? T("<br>🏠 출발지 도착 예정 ", "<br>🏠 Back at start around ") + when(r.homeAt).split(" ")[1] : "") + "</small></td>"
                + "<td>" + state + "</td>"
                + "<td>" + r.boarded + " / " + r.hikers + (r.notBoarded ? " <small>(" + T("안 탐 ", "not on ") + r.notBoarded + ")</small>" : "") + "</td>"
                + "<td>" + (r.departed ? r.aboard + " / " + r.hikers + (r.apart ? " <small>(" + T("따로 ", "separately ") + r.apart + ")</small>" : "") : "-") + "</td>"
                + "<td>" + (r.sos > 0 ? "<span class=\"red\">🆘 " + r.sos + "</span>" : "0") + "</td>"
                + "<td>" + (r.silent > 0 ? "<span class=\"yel\">" + r.silent + T("명", "") + "</span>" : "0") + "</td>"
                + "<td>" + ago(r.lastAgo) + "</td>"
                + "<td class=\"name\">" + esc(r.chief || "-") + (r.chiefDrop ? " <small>(" + (r.chiefDrop === "버스 대기" ? T("🚌 버스 대기", "🚌 Waiting on bus") : "⬇ " + esc(r.chiefDrop) + T(" 하차", " drop-off")) + ")</small>" : "") + (r.leaderPhone ? "<br><a href=\"tel:" + esc(r.leaderPhone.replace(/[^0-9+]/g, "")) + "\" style=\"color:var(--sky)\">📞 " + esc(r.leaderPhone) + "</a>" : "")
                    + ((r.assistantNames || []).length ? "<br><small>" + T("보조 ", "Assistants ") + r.assistantNames.map(esc).join(" · ") + "</small>" : "") + "</td>"
                + "<td><button class=\"danger\" data-detach=\"" + esc(r.code) + "\" data-name=\"" + esc(r.name) + "\" title=\"" + T("잘못 올라온 방을 이 화면에서 뺌", "Remove a wrongly linked room from this screen") + "\">" + T("빼기", "Remove") + "</button></td></tr>";
        }).join("") || "<tr><td colspan=\"9\">" + T("지금 이 회사에 올라온 방이 없습니다. 인솔자에게 회사 코드 <b>" + esc(j.code) + "</b> 를 알려 주세요.", "No rooms are linked to this company now. Give your leaders the company code <b>" + esc(j.code) + "</b>.") + "</td></tr>";
        $("ended").innerHTML = (j.ended || []).slice(0, 100).map(function (r) {
            var nd = r.notDown > 0 && !r.cancelled;
            return "<tr" + (nd ? " class=\"warn\"" : "") + "><td>" + when(r.endedAt) + "</td><td class=\"name\">" + esc(r.name) + (r.cancelled ? " <span class=\"red\">" + T("취소", "Cancelled") + "</span>" + (r.why ? " <small>(" + esc(r.why) + ")</small>" : "") : "") + "</td>"
                + "<td>" + esc(RFOfficeCsv.byText(r.by, EN)) + "</td><td>" + r.boarded + " / " + r.hikers + "</td><td>" + (r.departed ? r.aboard + " / " + r.hikers : "-") + "</td>"
                + "<td>" + (nd ? "<span class=\"yel\">⚠ " + r.notDown + T("명", "") + "</span>" : "0") + "</td><td>" + (r.sosEver ? "<span class=\"red\">" + T("있었음", "Yes") + "</span>" : "-") + "</td></tr>";
        }).join("") || "<tr><td colspan=\"7\">" + T("아직 끝난 산행이 없습니다.", "No finished hikes yet.") + "</td></tr>";
    }

    function load() {
        var k = key;   // 보낸 사무실 - 답이 오기 전에 사무실 · 링크를 바꿨으면 그 답은 버림(2026-10-29 점검: 다른 사무실 이름으로 덮거나 새 링크를 지웠음)
        // 끝난 산행은 바뀌었을 때만 받음 - 같으면 서버가 빼고 보내고, 가진 것을 그대로 씀(2026-10-29 점검)
        var have = last && last.endedSig && last.key === k ? last : null;
        return RFParty.post("office/rooms", have ? { key: k, endedSig: have.endedSig } : { key: k }).then(function (j) {
            if (k !== key) return;
            if (!j.ended && have) j.ended = have.ended;
            j.key = k;
            if (netErr) msg(""); showOnly("officeSec"); render(j);
        }).catch(function (e) {
            if (k !== key) return;
            if (e && e.status === 403) {   // 없앤 · 링크를 바꾼 사무실 - 목록에서 빼고 남은 사무실로
                store(null); key = null;
                if (stored()) { start(); msg(T("맞지 않는 사무실 링크를 이 기기 목록에서 뺐습니다.", "Removed an invalid office link from this device's list.")); return; }
                showOnly("newSec"); drawMine(); msg(T("사무실 링크가 맞지 않습니다. 링크를 다시 확인해 주세요.", "The office link is not valid. Please check the link.")); return;
            }
            msg(em(e), true);
        });
    }

    /** 묶음이 있으면 먼저 맞추고(1분에 한 번) 시작. */
    function start() { ownerP.then(start1); }
    function start1() {
        var mb = /^#b=([A-Za-z0-9_-]{20,64})$/.exec(location.hash || "");
        if (mb) {   // 묶음 링크 - 주소에서 지우고 묻고 연결
            try { history.replaceState(null, "", HERE); } catch (e) { /* 그대로 */ }
            if (!OWNER) { msg(T("묶음 링크는 관리자 기기에서만 열 수 있습니다.", "Bundle links open only on the admin device.")); startNow(); return; }
            joinBundle(mb[1]);
            return;
        }
        syncBundle().then(startNow, startNow);
    }

    function startNow() {
        if ($("qrBox")) $("qrBox").hidden = true;   // 다른 사무실 QR 이 남지 않게
        var ms = /^#ks=([A-Za-z0-9_.-]{20,700})$/.exec(location.hash || "");
        if (ms) {   // 여러 사무실 링크 - 이 기기에 없는 것만 묻고 넣음
            try { history.replaceState(null, "", HERE); } catch (e) { /* 그대로 */ }
            var have = mine().map(function (y) { return y.k; }), ks = [];
            ms[1].split(".").forEach(function (k) { if (/^[A-Za-z0-9_-]{20,64}$/.test(k) && ks.indexOf(k) < 0 && have.indexOf(k) < 0 && ks.length < ALL_MAX) ks.push(k); });
            if (ks.length && !OWNER) msg(T("여러 사무실 링크는 관리자 기기에서만 열 수 있습니다. 사무실 링크를 하나만 받아 열어 주세요.", "Links with several offices open only on the admin device. Please open a single office link."));
            else if (ks.length) { confirmMany(ks); return; }
            else msg(T("이 사무실들은 이미 이 기기에 있습니다.", "These offices are already on this device."));
        }
        var m = /^#k=([A-Za-z0-9_-]{20,64})$/.exec(location.hash || "");
        if (m) {
            try { history.replaceState(null, "", HERE); } catch (e) { /* 그대로 */ }   // 주소창 · 화면 캡처에 열쇠가 남지 않게
            // 처음 보는 사무실 링크는 이름을 보여 주고 묻고 넣음(2026-10-29 보안 점검: 남이 보낸 링크 하나로 내 사무실 화면이 다른 회사 사무실로 바뀌었음 - 같은 이름으로 꾸며 회사 코드를 받아 갈 수 있었음)
            if (!mine().some(function (y) { return y.k === m[1]; })) { confirmNew(m[1]); return; }
            store(m[1]);
        }
        key = (m && m[1]) || stored();
        if (!key) { showOnly("newSec"); drawMine(); return; }
        store(key);
        load();
        clearInterval(timer);
        lastLoad = Date.now();
        timer = setInterval(function () { if (!document.hidden || Date.now() - lastLoad >= 59000) { lastLoad = Date.now(); load(); } }, EVERY_MS);   // 숨은 탭도 1분마다(SOS 알림, 2026-10-29)
    }

    function confirmNew(k) {
        var swap = !OWNER && mine().some(function (y) { return y.k !== k; });   // 일반 사용자는 기기에 사무실 하나 - 바꾸기
        RFParty.post("office/rooms", { key: k }).then(function (j) {
            if (swap) return ask(T("사무실 링크로 들어왔습니다.\n\n🏢 " + j.name + " 사무실 (회사 코드 " + j.code + ")\n\n이 기기에는 사무실을 하나만 둘 수 있습니다. 이 사무실로 바꿀까요? 지금 사무실은 이 기기 목록에서 빠집니다(사무실은 그대로, 링크로 다시 들어올 수 있음).",
                "You opened an office link.\n\n🏢 " + j.name + " office (company code " + j.code + ")\n\nThis device can keep one office. Switch to this office? The current one leaves this device's list (the office stays; open its link to come back)."), { ok: T("바꾸기", "Switch") }).then(function (ok) {
                if (ok) { store(k, j.name); saveMine([{ k: k, n: j.name || "" }]); key = k;   // store 가 먼저 마지막 사무실(KEY)을 k 로 - 옛 사무실이 이름 없이 되살아나지 않게
                    msg(T("이 사무실로 바꿨습니다.", "Switched to this office.")); }
                else msg(T("바꾸지 않았습니다.", "Not switched."));
                start();
            });
            return ask(T("사무실 링크로 들어왔습니다.\n\n🏢 " + j.name + " 사무실 (회사 코드 " + j.code + ")\n\n이 사무실을 이 기기에 추가할까요? 우리 회사 사무실이 맞을 때만 추가하세요.",
                "You opened an office link.\n\n🏢 " + j.name + " office (company code " + j.code + ")\n\nAdd this office to this device? Only add it if it's your company's office."), { ok: T("추가", "Add") }).then(function (ok) {
                if (ok) {
                    store(k, j.name);
                    key = k;
                    var n = mine().length;
                    if (n > 1) msg(T("추가했습니다. 이 기기 사무실 " + n + "개 - 위 칸에서 골라 봅니다.", "Added. " + n + " offices on this device - pick one in the box at the top."));
                } else msg(T("추가하지 않았습니다.", "Not added."));
                start();
            });
        }).catch(function (e) {
            msg(e && e.status === 403 ? T("사무실 링크가 맞지 않습니다. 링크를 다시 확인해 주세요.", "The office link is not valid. Please check the link.") : em(e));
            start();
        });
    }

    // 끝난 산행 엑셀(CSV) 내려받기(2026-10-28 홍TV님 추천 1) - 이 화면이 이미 받은 숫자만
    $("csvBtn").addEventListener("click", function () {
        if (!last) { msg(T("아직 받지 못했습니다. 잠시 뒤 다시 눌러 주세요.", "Not loaded yet. Please try again in a moment.")); return; }
        if (!(last.ended || []).length) { msg(T("아직 끝난 산행이 없습니다.", "No finished hikes yet.")); return; }
        var d = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, "");
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([RFOfficeCsv.officeCsv(last.ended, EN)], { type: "text/csv;charset=utf-8" }));
        a.download = T("routefly-끝난산행-", "routefly-finished-hikes-") + d + ".csv";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        msg(T("📥 " + last.ended.length + "건을 내려받았습니다(엑셀에서 열림).", "📥 Downloaded " + last.ended.length + " hikes (opens in Excel)."));
    });

    $("offCreate").addEventListener("click", function () {
        var n = $("offName").value.trim();
        if (!n) { msg(T("회사 이름을 적어 주세요.", "Please enter the company name.")); $("offName").focus(); return; }
        RFParty.post("office/create", { name: n }).then(function (j) {
            store(j.key, j.name);
            drawMine();
            key = j.key;
            if (bundle()) RFParty.post("office/bundle/add", { bundle: bundle(), key: j.key }).catch(function () { /* 다음 맞추기 때 */ });   // 묶음에도 - 다른 기기 목록에 저절로
            $("madeTitle").textContent = T("✅ 사무실을 만들었습니다", "✅ Office created");   // 링크 바꾸기 뒤 남은 제목 지움
            $("linkBox").textContent = linkOf(j.key);
            showOnly("madeSec");
            drawMine();
            msg("");
        }).catch(function (e) { msg(em(e)); });
    });
    $("copyLink").addEventListener("click", function () {
        var t = $("linkBox").textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { noteBelow($("copyLink"), T("사무실 링크를 복사했습니다. 즐겨찾기에도 남겨 두세요.", "Office link copied. Bookmark it too.")); })
            .catch(function () { msg(T("복사가 안 되면 위 링크를 길게 눌러 복사하세요.", "If copying fails, press and hold the link above to copy it.")); });
    });
    $("goOffice").addEventListener("click", start);
    $("forget").addEventListener("click", function () {
        var bk = bundle();
        ask(bk ? T("이 사무실을 내 사무실 묶음에서 뺄까요? 묶음에 연결된 모든 기기 목록에서 빠집니다(사무실은 그대로, 다시 넣으려면 사무실 링크가 있어야 함).", "Remove this office from the office bundle? It leaves the list on every connected device (the office stays; you need its link to add it back).")
            : T("이 기기에서 로그아웃할까요? 사무실은 그대로이고, 다시 들어오려면 사무실 링크가 있어야 합니다.", "Log out on this device? The office stays; you need the office link to come back."), { ok: bk ? T("묶음에서 빼기", "Remove") : T("로그아웃", "Log out") }).then(function (ok) {
            if (!ok) return;
            // 묶음이면 서버에서 먼저 빼고 다시 읽음(기다리지 않으면 다시 읽을 때 묶음 맞추기로 되살아남 - 2026-10-30 PC)
            (bk ? RFParty.post("office/bundle/remove", { bundle: bk, key: key }) : Promise.resolve()).then(function () {
                store(null);   // 이 사무실만 이 기기 목록에서 빠짐 - 다른 사무실이 있으면 그리로
                key = null;
                location.reload();
            }).catch(function (e) { msg(em(e)); });
        });
    });
    // 사무실 링크 바꾸기 · 사무실 없애기(2026-10-28 홍TV님 "만들어")
    $("newKey").addEventListener("click", function () {
        ask(T("사무실 링크를 바꿀까요? 옛 링크는 바로 안 되고, 다른 직원에게 새 링크를 다시 알려 줘야 합니다.", "Change the office link? The old link stops working at once, and you'll need to send the new link to other staff."), { ok: T("링크 바꾸기", "Change link"), danger: true }).then(function (ok) {
        if (!ok) return;
        RFParty.post("office/newkey", { key: key }).then(function (j) {
            swapKey(key, j.key);
            key = j.key;
            $("qrBox").hidden = true;   // 옛 링크 QR 을 닫음
            clearInterval(timer);
            $("madeTitle").textContent = T("🔄 사무실 링크를 바꿨습니다", "🔄 Office link changed");
            $("linkBox").textContent = linkOf(j.key);
            showOnly("madeSec");
            drawMine();
            msg("");
        }).catch(function (e) { msg(em(e)); });
        });
    });
    $("copyMine").addEventListener("click", function () {   // 이 기기에 저장된 사무실 링크(2026-10-28 홍TV님 - 만든 뒤 링크를 놓쳤음)
        var t = linkOf(key);
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { noteBelow($("copyMine"), T("사무실 링크를 복사했습니다. 즐겨찾기 · 메모에 남겨 두세요(다른 사람에게 보이지 않게).", "Office link copied. Keep it in a bookmark or note (out of others' sight).")); })
            .catch(function () { askText(T("복사가 안 됩니다. 아래 칸의 링크를 길게 눌러 복사하세요.", "Copying failed. Press and hold the link below to copy it."), t, { ok: T("닫기", "Close") }); });
    });
    $("newCode").addEventListener("click", function () {
        ask(T("회사 코드를 바꿀까요? 옛 코드로는 새 방을 올릴 수 없습니다(이미 올라온 방은 그대로). 인솔자들에게 새 코드를 다시 알려 줘야 합니다.", "Change the company code? New rooms can't be linked with the old code (linked rooms stay). You'll need to send the new code to your leaders."), { ok: T("코드 바꾸기", "Change code"), danger: true }).then(function (ok) {
            if (!ok) return;
            RFParty.post("office/newcode", { key: key }).then(function (j) { msg(T("새 회사 코드: " + j.code + " - 인솔자들에게 알려 주세요.", "New company code: " + j.code + " - give it to your leaders.")); load(); }).catch(function (e) { msg(em(e)); });
        });
    });
    // ‹ 뒤로(2026-10-29 홍TV님 - 들어온 문으로): 우리 화면에서 왔으면 그 화면으로, 카톡 링크 등 처음 연 탭이면 산악회 방 화면으로
    $("backTop").addEventListener("click", function (e) {
        if (document.referrer && document.referrer.indexOf(location.origin + "/") === 0 && history.length > 1) { e.preventDefault(); history.back(); }
    });
    (function () {   // 글자 크기 단추(about.js · course-kit 과 같은 rf-text: 1 → 1.2 → 1.4)
        var STEPS = [1, 1.2, 1.4], b = document.createElement("button");
        function cur() { try { var v = +localStorage.getItem("rf-text"); return STEPS.indexOf(v) >= 0 ? v : 1; } catch (e) { return 1; } }
        function apply(v) {
            document.documentElement.style.setProperty("--rfz", String(v));
            document.documentElement.classList.toggle("rfz", v !== 1);
            var g = EN ? "A" : "가";
            b.textContent = v >= 1.4 ? g + "++" : v >= 1.2 ? g + "+" : g;
            b.setAttribute("aria-label", T("글자 크기 ", "Text size ") + Math.round(v * 100) + "%");
        }
        b.type = "button"; b.className = "rfTextBtn";
        b.addEventListener("click", function () {
            var n = STEPS[(STEPS.indexOf(cur()) + 1) % STEPS.length];
            try { localStorage.setItem("rf-text", String(n)); } catch (e) { /* 이번만 */ }
            apply(n);
        });
        $("top").insertBefore(b, $("updated"));
        apply(cur());
    })();
    document.addEventListener("visibilitychange", function () {   // 탭으로 돌아오면 바로 새로 받기
        if (!document.hidden && key && !$("officeSec").hidden && Date.now() - lastLoad > 5000) { lastLoad = Date.now(); load(); }
    });
    function alertBtn() {
        var b = $("alertOn");
        b.hidden = !window.Notification || Notification.permission === "granted" || Notification.permission === "denied";
    }
    $("alertOn").addEventListener("click", function () {
        beep();   // 누른 김에 소리도 허락(브라우저는 한 번 누른 뒤에만 소리를 냄)
        Promise.resolve(Notification.requestPermission()).then(function (r) {
            msg(r === "granted" ? T("🔔 알림을 켰습니다. 다른 탭을 보고 있어도 SOS 를 알려 드립니다.", "🔔 Alerts on. You'll be alerted to SOS even while viewing other tabs.") : T("알림이 꺼져 있습니다. 탭 제목의 🆘 와 소리로 알려 드립니다.", "Alerts are off. You'll still see 🆘 in the tab title and hear a beep."));
            alertBtn();
        }).catch(function () { alertBtn(); });
    });
    document.addEventListener("click", function () { if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 없음 */ } } }, { once: true });   // 첫 누름에 소리 준비
    alertBtn();
    // 내 사무실 고르기 · 하나 더 만들기(2026-10-29)
    $("mineSel").addEventListener("change", function () {
        var y = mine()[+this.value];
        if (!y || y.k === key) return;
        clearInterval(timer);
        store(y.k);
        last = null; seenSos = null; seenPend = null;
        msg("");
        start();
    });
    function addOne() {
        clearInterval(timer);
        $("offName").value = "";
        $("title").textContent = T("🏢 회사 사무실", "🏢 Company office");
        $("updated").textContent = "";
        showOnly("newSec");
        drawMine();
        $("offName").focus();
    }
    $("mineAdd").addEventListener("click", addOne);
    $("asWho").addEventListener("click", function () {
        try { if (OWNER) localStorage.setItem(GKEY, "1"); else localStorage.removeItem(GKEY); } catch (e) { /* 이번만 */ }
        location.reload();
    });
    $("mineBack").addEventListener("click", function () { msg(""); start(); });
    $("rename").addEventListener("click", function () {   // 2026-10-29 홍TV님 "만들어줘"
        var name = last ? last.name : "";
        askText(T("새 회사 이름(30자까지). 회사 코드 · 사무실 링크는 그대로입니다.", "New company name (up to 30 characters). The company code and office link stay."), name, { ok: T("이름 바꾸기", "Rename") }).then(function (typed) {
            if (typed == null || !typed.trim() || typed.trim() === name) return;
            RFParty.post("office/rename", { key: key, name: typed.trim() }).then(function (j) { msg(T("회사 이름을 \"" + j.name + "\" 로 바꿨습니다.", "Renamed the company to \"" + j.name + "\".")); load(); }).catch(function (e) { msg(em(e)); });
        });
    });
    $("delOffice").addEventListener("click", function () {
        var name = last ? last.name : "";
        askText(T("사무실을 없애면 되돌릴 수 없습니다. 회사 코드 · 사무실 링크가 안 되고 끝난 산행 요약이 모두 지워집니다(진행 중인 방은 그대로, 회사 연결만 끊음).\n\n없애려면 회사 이름을 그대로 적어 주세요: ", "Deleting the office cannot be undone. The company code and office link stop working and all finished hike summaries are deleted (rooms in progress stay; only the company link is cut).\n\nTo delete, type the company name exactly: ") + name, "", { ok: T("사무실 없애기", "Delete office"), danger: true }).then(function (typed) {
            if (typed == null) return;
            RFParty.post("office/delete", { key: key, name: typed.trim() }).then(function () {
                store(null);
                return say(T("사무실을 없앴습니다.", "The office has been deleted."));
            }).then(function () { location.reload(); }).catch(function (e) { msg(em(e)); });
        });
    });

    document.addEventListener("click", function (e) {
        var ap = e.target.closest && e.target.closest("button[data-approve]");
        if (ap) {   // 승인 기다리는 방 - 우리 방이 맞음(2026-10-28)
            ask(T("\"" + ap.getAttribute("data-name") + "\" 방을 승인할까요? 우리 산악회 방이 맞을 때만 - 승인하면 사무실이 회원 위치를 함께 봅니다.", "Approve the room \"" + ap.getAttribute("data-name") + "\"? Only if it's your club's room - once approved, the office also sees member locations."), { ok: T("승인", "Approve") }).then(function (ok) {
                if (ok) RFParty.post("office/approve", { key: key, code: ap.getAttribute("data-approve") }).then(function () { msg(T("승인했습니다.", "Approved.")); return load(); }).catch(function (e2) { msg(em(e2)); });
            });
            return;
        }
        var b = e.target.closest && e.target.closest("button[data-open], button[data-detach]");
        if (!b) return;
        var code = b.getAttribute("data-open") || b.getAttribute("data-detach"), name = b.getAttribute("data-name");
        if (b.hasAttribute("data-open")) {
            // 사무실이 연 방은 이 탭에만 둠(party-kit set) - 이 기기에 참가한 내 방은 그대로라 묻지 않음(2026-10-29)
            RFParty.post("office/enter", { key: key, code: code }).then(function (j) {
                RFParty.set({ code: j.code, token: j.token, role: j.role, name: j.name, office: true });
                location.href = EN ? "party.html?lang=en" : "party.html";
            }).catch(function (e2) { msg(em(e2)); });
        } else {
            ask(T("\"" + name + "\" 방을 이 회사 화면에서 뺄까요? (방은 그대로, 사무실만 빠짐)", "Remove the room \"" + name + "\" from this company screen? (The room stays; only the office is removed.)"), { ok: T("빼기", "Remove"), danger: true }).then(function (ok) {
                if (ok) RFParty.post("office/detach", { key: key, code: code }).then(load).catch(function (e2) { msg(em(e2)); });
            });
        }
    });

    // 🔳 사무실 링크 QR(2026-10-30 홍TV님 "QR 을 만들어서 카피하게 해줘") - qrcode-generator(MIT). 그림 복사(되는 브라우저) · 저장
    function qrOf(text) { var q = qrcode(0, "M"); q.addData(text); q.make(); return q; }
    function qrPng(q, cb) {   // 흰 바탕 PNG(복사 · 저장용) - 칸 8px, 둘레 4칸
        var n = q.getModuleCount(), cell = 8, pad = 4, size = (n + pad * 2) * cell, cv = document.createElement("canvas");
        cv.width = cv.height = size;
        var g = cv.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, size, size); g.fillStyle = "#000";
        for (var r = 0; r < n; r++) for (var c2 = 0; c2 < n; c2++) if (q.isDark(r, c2)) g.fillRect((c2 + pad) * cell, (r + pad) * cell, cell, cell);
        cv.toBlob(cb, "image/png");
    }
    $("qrMine").addEventListener("click", function () {
        if (!window.qrcode || !key) { noteBelow($("qrMine"), T("QR 을 만들지 못했습니다. 링크 복사를 쓰세요.", "Could not make the QR. Use Copy link.")); return; }
        var box = $("qrBox");
        if (!box.hidden && box.rfKey === shareLink()) { box.hidden = true; return; }   // 다시 누르면 닫음
        $("qrImg").innerHTML = qrOf(shareLink()).createSvgTag({ cellSize: 6, margin: 2, scalable: true });
        $("qrImg").setAttribute("role", "img");
        $("qrImg").setAttribute("aria-label", T("사무실 링크 QR", "Office link QR"));
        box.rfKey = shareLink();
        box.hidden = false;
    });
    $("qrCopy").addEventListener("click", function () {
        var btn = this;
        qrPng(qrOf(shareLink()), function (blob) {
            var can = blob && navigator.clipboard && window.ClipboardItem;
            (can ? navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]) : Promise.reject()).then(function () {
                noteBelow(btn, T("QR 그림을 복사했습니다. 카톡 · 문자 창에 붙여 넣으세요(우리 직원에게만).", "QR image copied. Paste it into a chat (your staff only)."));
            }).catch(function () { noteBelow(btn, T("이 브라우저는 그림 복사가 안 됩니다 - 💾 QR 그림 저장을 쓰세요.", "This browser can't copy images - use Save QR image."), 10000); });
        });
    });
    $("qrSave").addEventListener("click", function () {
        var btn = this;
        qrPng(qrOf(shareLink()), function (blob) {
            if (!blob) { noteBelow(btn, T("그림을 만들지 못했습니다.", "Could not make the image.")); return; }
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = T("routefly-사무실-QR.png", "routefly-office-QR.png");
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
            noteBelow(btn, T("QR 그림을 저장했습니다.", "QR image saved."));
        });
    });
    $("copyAll").addEventListener("click", function () {
        var t = linkAll(), btn = this;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
            noteBelow(btn, T("사무실 " + Math.min(mine().length, ALL_MAX) + "개 링크를 복사했습니다. 폰 카톡 · 메모로 보내 폰에서 여세요(다른 사람에게 보이지 않게).", "Copied a link for " + Math.min(mine().length, ALL_MAX) + " offices. Send it to your phone and open it there (out of others' sight)."));
        }).catch(function () { askText(T("복사가 안 됩니다. 아래 칸의 링크를 길게 눌러 복사하세요.", "Copying failed. Press and hold the link below to copy it."), t, { ok: T("닫기", "Close") }); });
    });
    // 여러 사무실 링크(#ks=…)로 들어옴 - 이 기기에 없는 사무실만 이름을 보여 주고 한 번에 묻고 넣음(2026-10-30)
    function confirmMany(ks) {
        var got = [];
        ks.reduce(function (p, k) {
            return p.then(function () {
                return RFParty.post("office/rooms", { key: k }).then(function (j) { got.push({ k: k, n: j.name, c: j.code }); }).catch(function () { /* 맞지 않는 링크는 뺌 */ });
            });
        }, Promise.resolve()).then(function () {
            if (!got.length) { msg(T("사무실 링크가 맞지 않습니다. 링크를 다시 확인해 주세요.", "The office links are not valid. Please check the link.")); start(); return; }
            var lines = got.map(function (g) { return "🏢 " + g.n + " (" + T("회사 코드 ", "code ") + g.c + ")"; }).join("\n");
            return ask(T("사무실 링크로 들어왔습니다.\n\n" + lines + "\n\n이 사무실 " + got.length + "개를 이 기기에 추가할까요? 우리 회사 사무실이 맞을 때만 추가하세요.",
                "You opened office links.\n\n" + lines + "\n\nAdd these " + got.length + " offices to this device? Only add them if they're your company's offices."), { ok: T("모두 추가", "Add all") }).then(function (ok) {
                if (ok) {
                    got.forEach(function (g) { store(g.k, g.n); });   // PC 와 같은 차례
                    store(got[0].k);   // 첫 사무실을 봄
                    key = got[0].k;
                    msg(T("추가했습니다. 이 기기 사무실 " + mine().length + "개 - 위 칸에서 골라 봅니다.", "Added. " + mine().length + " offices on this device - pick one in the box at the top."));
                } else msg(T("추가하지 않았습니다.", "Not added."));
                start();
            });
        });
    }
    $("bundleMake").addEventListener("click", function () {
        var btn = this, ks = mine().map(function (y) { return y.k; });
        if (!ks.length) { noteBelow(btn, T("먼저 사무실을 만들거나 사무실 링크로 들어오세요.", "Create or open an office first.")); return; }
        RFParty.post("office/bundle/new", { keys: ks }).then(function (j) {
            setBundle(j.bundle);
            return syncBundle(true);
        }).then(function () { drawMine(); noteBelow($("bundleCopy"), T("묶음을 만들었습니다. 📋 묶음 링크 복사 · 🔳 묶음 QR 로 다른 기기를 연결하세요.", "Bundle made. Connect other devices with Copy bundle link or Bundle QR."), 10000); })
            .catch(function (e) { noteBelow(btn, em(e), 10000); });
    });
    $("bundleCopy").addEventListener("click", function () {
        var t = linkBundle(), btn = this;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
            noteBelow(btn, T("묶음 링크를 복사했습니다. 다른 기기에서 한 번 열면 연결됩니다(우리 직원에게만).", "Bundle link copied. Open it once on another device to connect (your staff only)."));
        }).catch(function () { askText(T("복사가 안 됩니다. 아래 칸의 링크를 길게 눌러 복사하세요.", "Copying failed. Press and hold the link below to copy it."), t, { ok: T("닫기", "Close") }); });
    });
    $("bundleNewKey").addEventListener("click", function () {
        var btn = this;
        ask(T("묶음 링크를 바꿀까요? 옛 묶음 링크는 바로 안 되고, 다른 기기는 연결이 끊겨 새 묶음 링크로 다시 연결해야 합니다(사무실은 그대로).", "Change the bundle link? The old one stops working at once and other devices must reconnect with the new link (offices stay)."), { ok: T("링크 바꾸기", "Change link"), danger: true }).then(function (ok) {
            if (!ok) return;
            RFParty.post("office/bundle/newkey", { bundle: bundle() }).then(function (j) { setBundle(j.bundle); $("qrBox").hidden = true; drawMine(); noteBelow(btn, T("묶음 링크를 바꿨습니다. 다른 기기에 새 링크를 보내 다시 연결하세요.", "Bundle link changed. Send the new link to other devices to reconnect."), 10000); })
                .catch(function (e) { noteBelow(btn, em(e), 10000); });
        });
    });
    $("bundleLeave").addEventListener("click", function () {
        ask(T("이 기기의 묶음 연결을 끊을까요? 지금 사무실 목록은 이 기기에 그대로 남고, 앞으로 다른 기기와 맞춰지지 않습니다.", "Disconnect this device from the bundle? The current office list stays on this device but will no longer follow other devices."), { ok: T("끊기", "Disconnect") }).then(function (ok) {
            if (!ok) return;
            setBundle(null);
            $("qrBox").hidden = true;
            drawMine();
        });
    });

    // PC 에서 넓은 표 옆으로 밀기(2026-10-30 홍TV님 "좌우 스크롤이 안 돼" - 날씨 표와 같은 방식): 마우스 휠 → 옆으로(끝에 닿으면 화면 스크롤),
    // 마우스로 끌기(6px 넘게 움직였을 때만 - "열기" 단추 누르기는 그대로), 키보드 ← →
    Array.prototype.forEach.call(document.querySelectorAll(".wrap"), function (wrap) {
        wrap.addEventListener("wheel", function (e) {
            if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
            var max = wrap.scrollWidth - wrap.clientWidth;
            if (max <= 0 || (e.deltaY < 0 && wrap.scrollLeft <= 0) || (e.deltaY > 0 && wrap.scrollLeft >= max - 1)) return;
            wrap.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
            e.preventDefault();
        }, { passive: false });
        var drag = null, moved = false;
        wrap.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button === 0) { drag = { x: e.clientX, l: wrap.scrollLeft }; moved = false; } });
        wrap.addEventListener("pointermove", function (e) {
            if (!drag) return;
            if (!moved && Math.abs(e.clientX - drag.x) < 6) return;
            moved = true;
            wrap.classList.add("drag");
            wrap.scrollLeft = drag.l - (e.clientX - drag.x);
            e.preventDefault();
        });
        var stop = function () { drag = null; wrap.classList.remove("drag"); };
        wrap.addEventListener("pointerup", stop);
        wrap.addEventListener("pointerleave", stop);
        wrap.addEventListener("click", function (e) { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);   // 끌기 끝의 클릭은 단추로 보내지 않음
        wrap.addEventListener("keydown", function (e) {
            if (e.target !== wrap) return;   // 표 안 단추에 초점이 있을 때는 그대로
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") { wrap.scrollLeft += (e.key === "ArrowRight" ? 1 : -1) * 80; e.preventDefault(); }
        });
    });
    // 이미 이 화면을 연 탭에서 다른 사무실 링크(#k=…)를 열면 주소의 # 뒤만 바뀌어 페이지가 다시 읽히지 않음 - 그때도 받아 넣음
    // (2026-10-30 홍TV님: PC 에서 만든 두 번째 사무실 링크를 폰에서 추가했는데 하나뿐이었음)
    window.addEventListener("hashchange", function () { if (/^#(ks?|b)=/.test(location.hash || "")) start(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && bundle()) syncBundle().then(drawMine); });   // 다른 기기에서 만들거나 없앤 것

    start();
})();
