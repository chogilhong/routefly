/*
 * 🧰 별거 별거(tools.html - 2026-10-18 홍TV님): 생활 도구 모음.
 *   - 📮 우편번호 · 영문 주소: 카카오(다음) 우편번호 서비스(키 없음)를 누를 때만 불러 화면 안에 띄움. 찾은 주소는 저장하지 않음
 *   - 📏 단위 변환: RF.UNITS · RF.unitConv · RF.unitFmt(서버 없이). 고른 칸 · 단위만 이 기기에 기억(rf-tools)
 */
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    var LANG = RF.pageLang(location.search, lsGet("rf-lang"));
    if (/[?&]lang=(en|ko)\b/.test(location.search)) { try { localStorage.setItem("rf-lang", LANG); } catch (e) { /* 이번만 */ } }
    var EN = LANG === "en", T = RF.tr;
    RF.setLang(LANG);
    if (EN) { document.documentElement.lang = "en"; document.title = "routefly - Handy tools"; RF.applyEn(document); }
    $("top").appendChild(RF.textButton());
    var openFromLink = null;   // ?open=t-… 로 연 칸(아래에서 씀 - 맨 위에 두어야 값이 지워지지 않음)
    if (EN) $("backLink").setAttribute("href", "en/m/");

    function toast(t, ms) {
        var el = $("toast");
        el.textContent = t;
        el.style.display = "block";
        clearTimeout(toast.t);
        toast.t = setTimeout(function () { el.style.display = "none"; }, ms || 2500);
    }
    function copy(text) {
        function done() { toast(T("복사했습니다", "Copied")); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallback(); });
        } else fallback();
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed"; ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); done(); } catch (e) { toast(T("복사하지 못했습니다 - 길게 눌러 복사하세요", "Could not copy - long-press to copy")); }
            document.body.removeChild(ta);
        }
    }

    // ── 📮 우편번호 · 영문 주소 ──
    var PC_JS = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    function loadPostcode(cb) {
        if (window.daum && window.daum.Postcode) return cb();
        var s = document.createElement("script");
        s.src = PC_JS;
        s.onload = function () { if (window.daum && window.daum.Postcode) cb(); else failPc(); };
        s.onerror = failPc;
        document.head.appendChild(s);
    }
    function failPc() { toast(T("우편번호 서비스를 불러오지 못했습니다 - 인터넷을 확인해 주세요", "Could not load the postcode service - check your connection"), 4000); }
    function showAddr(d) {
        var road = d.roadAddress || d.autoRoadAddress || "";
        var extra = [];
        if (d.bname && /[동로가]$/.test(d.bname)) extra.push(d.bname);
        if (d.buildingName && d.apartment === "Y") extra.push(d.buildingName);
        if (road && extra.length) road += " (" + extra.join(", ") + ")";
        var rows = [[T("우편번호", "Postcode"), d.zonecode], [T("도로명", "Road"), road], [T("지번", "Lot"), d.jibunAddress || d.autoJibunAddress],
            [T("영문", "English"), d.roadAddressEnglish], [T("영문 지번", "English (lot)"), d.jibunAddressEnglish]];
        var out = $("pcOut");
        out.innerHTML = "";
        rows.forEach(function (r) {
            if (!r[1]) return;
            var row = document.createElement("div"), sp = document.createElement("span"), b = document.createElement("b"), bt = document.createElement("button");
            row.className = "ar";
            sp.textContent = r[0];
            b.textContent = r[1];
            bt.type = "button";
            bt.textContent = T("복사", "Copy");
            bt.addEventListener("click", function () { copy(r[1]); });
            row.appendChild(sp); row.appendChild(b); row.appendChild(bt);
            out.appendChild(row);
        });
        // 📋 모두 복사 - "우편번호 23310 / 도로명 … / 영문 …" 여러 줄을 한 번에(2026-10-18 홍TV님 "주소 카피할 수 있어?")
        var all = document.createElement("button"), text = rows.filter(function (r) { return r[1]; }).map(function (r) { return r[0] + " " + r[1]; }).join("\n");
        all.type = "button";
        all.className = "btn";
        all.style.marginTop = "10px";
        all.textContent = T("📋 모두 복사", "📋 Copy all");
        all.addEventListener("click", function () { copy(text); });
        out.appendChild(all);
        out.style.display = "block";
        $("pcBox").style.display = "none";
        $("pcBtn").textContent = T("🔍 다른 주소 찾기", "🔍 Find another address");
        out.scrollIntoView({ block: "nearest" });
    }
    /**
     * 카카오 창 배율(2026-10-18 PC): 창 안에 min-width 300px 이 있어 1.2배로 고정하면 좁은 폭에서 오른쪽이 잘림 →
     * 상자 폭 / 300 까지만(최대 1.2), 좁은 폰(480px 아래)은 상자를 화면 폭 가득. 상자 높이 = 450 × 배율.
     */
    function fitZoom() {
        var box = $("pcBox"), z = box.querySelector(".zoom");
        if (!z || box.style.display === "none") return;
        // 가+ · 가++(글자 120 · 140%)는 main 전체를 CSS zoom 으로 키움 - 그만큼 빼고 계산(2026-10-18 홍TV님: 가++ 에서 카카오 창이 화면 밖으로 잘림)
        var pz = document.documentElement.classList.contains("rfz") ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--rfz")) || 1) : 1;
        box.style.width = ""; box.style.marginLeft = "";   // 먼저 되돌리고 잼 - 넘친 상태의 폭을 읽지 않게(2026-10-18 PC)
        var vw = document.documentElement.clientWidth || innerWidth;
        var wide = vw < 480, parent = box.parentNode;
        if (wide) {   // 좁은 폰: 화면 폭 가득(zoom 안이라 화면 px ÷ pz)
            var w = vw / pz;
            box.style.width = w + "px";
            var ps = getComputedStyle(parent), inner = parent.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);   // 감싸는 칸의 안쪽 폭
            box.style.marginLeft = ((inner - w) / 2) + "px";
        }
        box.classList.toggle("wide", wide);
        // 보이는 배율 = pz × sc 가 1.2 를 넘지 않게, 카카오 창(최소 300px)이 상자 폭을 넘지 않게
        var sc = Math.min(1.2 / pz, box.clientWidth / 300);
        z.style.width = (100 / sc) + "%";
        z.style.transform = sc !== 1 ? "scale(" + sc + ")" : "";
        box.style.height = Math.round(450 * sc) + "px";
    }
    window.addEventListener("resize", fitZoom);
    window.addEventListener("rf-textscale", function () { setTimeout(fitZoom, 0); });   // 가 · 가+ · 가++ 바꿀 때도(course-kit applyTextScale 이 보냄)
    $("pcBtn").addEventListener("click", function () {
        loadPostcode(function () {
            var box = $("pcBox");
            box.innerHTML = "";
            box.style.display = "block";
            $("pcOut").style.display = "none";
            var z = document.createElement("div");
            z.className = "zoom";
            box.appendChild(z);
            fitZoom();
            // 영문 주소를 처음부터 함께(alwaysShowEngAddr), "영문보기" 단추는 숨김(hideEngBtn) - 2026-10-18 홍TV님
            new window.daum.Postcode({ oncomplete: showAddr, width: "100%", height: "100%", alwaysShowEngAddr: true, hideEngBtn: true }).embed(z, { autoClose: false });
        });
    });

    // ── 🚇 지하철 노선도(2026-10-18 홍TV님 - 별거 별거 안으로). 노선도 그림은 저작권이 있어 지도 서비스로 연결만(API 키 없음).
    //    PC 확인: 카카오맵 PC 웹 map.kakao.com/?target=subway&REGION=SES|PSS|DGS|KJS|DJS 는 그 지역 탭, 폰에서는 같은 주소가 지역을 잃어
    //    m.search.daum.net "<지역> 지하철노선도"(지역 탭 그대로). 네이버는 "<지역> 지하철노선도" 검색. 광주는 "광주광역시"(경기 광주로 읽혀 수도권이 나왔음)
    (function () {
        var MOBILE = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);
        var REGIONS = [["SES", "수도권", "Seoul area", "서울 · 인천 · 경기"], ["PSS", "부산", "Busan", "부산 · 김해"], ["DGS", "대구", "Daegu", ""], ["KJS", "광주", "Gwangju", "", "광주광역시"], ["DJS", "대전", "Daejeon", ""]];
        function link(href, text) { var a = document.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener"; a.textContent = text; return a; }
        REGIONS.forEach(function (r) {
            var sec = document.createElement("div"), h = document.createElement("h3"), links = document.createElement("div"), q = encodeURIComponent((r[4] || r[1]) + " 지하철노선도");
            sec.className = "reg";
            h.textContent = (EN ? r[2] : r[1]) + " ";
            if (r[3] && !EN) { var sm = document.createElement("small"); sm.textContent = r[3]; h.appendChild(sm); }
            links.className = "links";
            links.appendChild(link(MOBILE ? "https://m.search.daum.net/search?w=tot&q=" + q : "https://map.kakao.com/?target=subway&REGION=" + r[0], T("카카오맵 노선도 ›", "Kakao Map ›")));
            links.appendChild(link("https://" + (MOBILE ? "m." : "") + "search.naver.com/search.naver?query=" + q, T("네이버 노선도 ›", "Naver ›")));
            sec.appendChild(h); sec.appendChild(links);
            $("sbRegions").appendChild(sec);
        });
    })();

    // ── 🧮 큰 글씨 계산기(RF.calcEval - eval 없음) ──
    (function () {
        var expr = "", last = null;
        var KEYS = [["C", "c"], ["⌫", "c"], ["%", "op"], ["÷", "op"], ["7"], ["8"], ["9"], ["×", "op"], ["4"], ["5"], ["6"], ["−", "op"], ["1"], ["2"], ["3"], ["+", "op"], ["0"], ["00"], ["."], ["=", "eq"]];
        function show() {
            $("ccExpr").textContent = expr;
            var r = RF.calcEval(expr);
            var div0 = expr !== "" && r == null && /÷0(?![.\d])/.test(expr);
            $("ccVal").className = div0 ? "msg" : "";
            $("ccVal").textContent = expr === "" ? (last != null ? RF.unitFmt(last) : "0") : r == null ? (div0 ? T("0으로 나눌 수 없어요", "Can't divide by 0") : "…") : RF.unitFmt(r);
        }
        KEYS.forEach(function (k) {
            var b = document.createElement("button");
            b.type = "button"; b.textContent = k[0]; if (k[1]) b.className = k[1];
            b.addEventListener("click", function () {
                var key = k[0];
                if (key === "C") { expr = ""; last = null; }
                else if (key === "⌫") expr = expr.slice(0, -1);
                else if (key === "=") { var r = RF.calcEval(expr); if (r != null) { last = r; expr = String(r).replace("-", "−"); } }
                else if (/[+−×÷]/.test(key)) { if (expr === "" && last != null) expr = String(last).replace("-", "−"); expr = /[+−×÷]$/.test(expr) ? expr.slice(0, -1) + key : expr + key; }
                else expr += key;
                show();
            });
            $("ccGrid").appendChild(b);
        });
        show();
    })();

    // ── 🔍 돋보기(뒤 카메라 + 화면 확대, 지원하면 카메라 줌 · 불빛). 칸을 접으면 카메라를 끔 ──
    var mgStream = null, mgTrack = null, mgTorch = false;
    function mgStop() {
        if (mgStream) mgStream.getTracks().forEach(function (t) { t.stop(); });
        mgStream = null; mgTrack = null; mgTorch = false;
        $("mgVid").srcObject = null;
        $("mgWrap").style.display = "none"; $("mgCtl").style.display = "none";
        $("mgOn").style.display = "";
    }
    function mgZoom() {
        var z = +$("mgZoom").value, caps = mgTrack && mgTrack.getCapabilities ? mgTrack.getCapabilities() : {};
        if (caps.zoom) {   // 카메라 줌이 되면 그것으로(더 선명), 남는 배율만 화면 확대
            var cz = Math.min(caps.zoom.max, Math.max(caps.zoom.min, z));
            mgTrack.applyConstraints({ advanced: [{ zoom: cz }] }).catch(function () { /* 안 됨 */ });
            $("mgVid").style.transform = "scale(" + (z / cz) + ")";
        } else $("mgVid").style.transform = "scale(" + z + ")";
    }
    $("mgOn").addEventListener("click", function () {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast(T("이 기기는 카메라를 쓸 수 없습니다", "Camera is not available"));
        navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then(function (st) {
            mgStream = st; mgTrack = st.getVideoTracks()[0];
            $("mgVid").srcObject = st;
            $("mgVid").play().catch(function () { /* 다시 누르면 */ });
            $("mgWrap").style.display = ""; $("mgCtl").style.display = "";
            $("mgOn").style.display = "none";
            $("mgFreeze").textContent = T("⏸ 멈춤", "⏸ Hold");
            var caps = mgTrack.getCapabilities ? mgTrack.getCapabilities() : {};
            $("mgLight").style.display = caps.torch ? "" : "none";
            mgZoom();
        }).catch(function () { toast(T("카메라를 켜지 못했습니다 - 카메라 권한을 확인해 주세요", "Could not start the camera - check camera permission"), 4000); });
    });
    $("mgZoom").addEventListener("input", mgZoom);
    $("mgFreeze").addEventListener("click", function () {
        var v = $("mgVid");
        if (v.paused) { v.play(); this.textContent = T("⏸ 멈춤", "⏸ Hold"); } else { v.pause(); this.textContent = T("▶ 다시", "▶ Live"); }
    });
    $("mgLight").addEventListener("click", function () {
        if (!mgTrack) return;
        mgTorch = !mgTorch;
        mgTrack.applyConstraints({ advanced: [{ torch: mgTorch }] }).catch(function () { toast(T("이 폰은 불빛을 켤 수 없습니다", "This phone can't turn on the light")); });
    });
    $("t-mag").addEventListener("toggle", function () { if (!this.open) mgStop(); });
    window.addEventListener("pagehide", mgStop);

    // ── 💊 약 먹을 시간 알림(앱: Capacitor LocalNotifications 매일 반복, id 7300 ~ 7303 · 채널 rf-pill). 오늘 먹은 것은 이 핸드폰에(rf-pill) ──
    (function () {
        var CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
        var LN = NATIVE && (!CAP.isPluginAvailable || CAP.isPluginAvailable("LocalNotifications")) && CAP.Plugins && CAP.Plugins.LocalNotifications || null;
        var pl = { name: "", times: ["", "", "", ""], log: {} }, firstTime = true;
        try { var p0 = JSON.parse(lsGet("rf-pill") || "null"); if (p0 && p0.times) { pl = p0; firstTime = false; } } catch (e) { /* 처음 */ }
        function keep() { try { localStorage.setItem("rf-pill", JSON.stringify(pl)); } catch (e) { /* 이번만 */ } }
        function dk() { return RF.dayKey(Date.now()); }
        var sels = [];
        for (var i = 0; i < 4; i++) {
            var sel = document.createElement("select");
            sel.className = "f"; sel.style.flex = "1 1 40%";
            sel.add(new Option(T("없음", "None"), ""));
            for (var m = 5 * 60; m < 24 * 60; m += 30) {
                var hh = Math.floor(m / 60), mm = m % 60, v = String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
                sel.add(new Option(EN ? v : (hh < 12 ? "오전 " : "오후 ") + (hh % 12 || 12) + "시" + (mm ? " 30분" : ""), v));
            }
            sel.value = pl.times[i] || (firstTime && i === 0 ? "08:00" : "");   // 처음엔 고르기 쉽게 08:00 만 - 목록은 저장한 뒤에(2026-10-18 PC)
            sels.push(sel);
            $("plTimes").appendChild(sel);
        }
        $("plName").value = pl.name || "";
        function draw() {
            var ul = $("plToday"), log = pl.log[dk()] || {};
            ul.innerHTML = "";
            pl.times.forEach(function (t, i) {
                if (!t) return;
                var li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("button");
                sp.textContent = "💊 " + t + " " + (pl.name || T("약", "Medicine"));
                b.type = "button"; b.className = "btn2"; b.style.flex = "0 0 auto"; b.style.height = "40px";
                if (log[i]) { b.textContent = T("✅ 먹었어요 ", "✅ Taken ") + log[i]; b.disabled = true; }
                else b.textContent = T("먹었어요", "Taken");
                b.addEventListener("click", function () {
                    var d = new Date();
                    pl.log = {}; pl.log[dk()] = Object.assign({}, log); pl.log[dk()][i] = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");   // 오늘 것만 남김
                    keep(); draw();
                });
                li.appendChild(sp); li.appendChild(b);
                ul.appendChild(li);
            });
        }
        function schedule() {
            if (!LN) return Promise.resolve();
            var ids = [7300, 7301, 7302, 7303].map(function (id) { return { id: id }; });
            return Promise.resolve(LN.createChannel({ id: "rf-pill", name: T("routefly 약 알림", "routefly medicine"), importance: 5, visibility: 1, vibration: true })).catch(function () { /* 이미 */ })
                .then(function () { return Promise.resolve(LN.cancel({ notifications: ids })).catch(function () { /* 없음 */ }); })
                .then(function () {
                    var list = [];
                    pl.times.forEach(function (t, i) {
                        if (!t) return;
                        list.push({ id: 7300 + i, title: T("💊 약 먹을 시간이에요", "💊 Time for your medicine"), body: (pl.name || T("약", "Medicine")) + " · " + t,
                            schedule: { on: { hour: +t.slice(0, 2), minute: +t.slice(3, 5) }, allowWhileIdle: true }, channelId: "rf-pill", extra: { page: "pill" } });
                    });
                    if (!list.length) return null;
                    return Promise.resolve(LN.requestPermissions()).catch(function () { return null; }).then(function () { return LN.schedule({ notifications: list }); });
                });
        }
        $("plSave").addEventListener("click", function () {
            pl.name = $("plName").value.trim();
            pl.times = sels.map(function (s) { return s.value; });
            keep(); draw();
            schedule().then(function () {
                toast(LN ? T("저장했어요 - 정한 시각마다 매일 알림이 울립니다", "Saved - a reminder rings every day at these times") : T("저장했어요 - 알림은 routefly 앱에서만 울립니다", "Saved - reminders ring only in the routefly app"), 4000);
            }).catch(function () { toast(T("알림을 맞추지 못했습니다(알림 권한을 확인하세요)", "Could not set reminders (check notification permission)"), 5000); });
        });
        draw();
    })();

    // ── ✅ 산행 준비물 체크(RF.gearList + 늘 챙길 것). 계절은 이번 달로 고르고 바꿀 수 있음, 체크는 이 기기에(rf-gear) ──
    (function () {
        var mon = new Date().getMonth() + 1;
        $("gcSeason").value = mon >= 3 && mon <= 5 ? "spring" : mon >= 6 && mon <= 8 ? "summer" : mon >= 9 && mon <= 11 ? "fall" : "winter";
        var SEASON_MONTH = { spring: 4, summer: 7, fall: 10, winter: 1 };
        var EXTRA = [{ key: "phone", label: "휴대폰 충전 · 오프라인 지도 저장", en: "Charged phone · offline map saved", why: "신호가 없어도 길 확인", whyEn: "Find your way without signal" },
            { key: "id", label: "신분증 · 현금 조금", en: "ID · some cash", why: "산 아래 가게 · 버스", whyEn: "Shops and buses down below" },
            { key: "whistle", label: "호루라기", en: "Whistle", why: "길을 잃으면 소리로 위치 알리기", whyEn: "Signal your position if lost" },
            { key: "clothes", label: "여벌 옷(양말 포함)", en: "Spare clothes (socks too)", why: "땀 · 비에 젖으면 체온이 빨리 떨어짐", whyEn: "Wet clothes chill you fast" },
            { key: "trash", label: "쓰레기 봉투", en: "Trash bag", why: "가져간 것은 가지고 내려오기", whyEn: "Pack it in, pack it out" }];
        var EN_LABEL = { water: ["Water · snacks", "About 500 ml of water an hour"], rain: ["Rain jacket · windbreaker", "Mountain weather changes quickly"], headlamp: ["Headlamp", "It gets dark early in the mountains"],
            battery: ["Power bank", "For GPS and emergency calls"], firstaid: ["First-aid kit · bandages", "Blisters, scrapes, bites"], shoes: ["Hiking boots", "Grip and ankle support"],
            pack: ["Backpack", "Keep both hands free"], sun: ["Hat · sunscreen", "No shade on ridges and summits"], warm: ["Thermos · hand warmers", "You cool down fast when resting"],
            crampon: ["Crampons", "Shaded trails are icy in winter and early spring"], glove: ["Gloves", "Mornings and summits are chilly"] };
        var chk = {};
        try { chk = JSON.parse(lsGet("rf-gear") || "{}") || {}; } catch (e) { chk = {}; }
        function draw() {
            var items = RF.gearList(SEASON_MONTH[$("gcSeason").value], 0, "hike").concat(EXTRA), ul = $("gcList"), done = 0;
            ul.innerHTML = "";
            items.forEach(function (it) {
                var li = document.createElement("li"), lb = document.createElement("label"), cb = document.createElement("input"), sp = document.createElement("span"), sm = document.createElement("small");
                cb.type = "checkbox"; cb.checked = !!chk[it.key];
                if (cb.checked) { li.className = "done"; done++; }
                sp.textContent = EN ? (it.en || (EN_LABEL[it.key] || [it.label])[0]) : it.label;
                sm.textContent = EN ? (it.whyEn || (EN_LABEL[it.key] || [, it.why])[1]) : it.why;
                sp.appendChild(sm);
                cb.addEventListener("change", function () {
                    chk[it.key] = cb.checked;
                    try { localStorage.setItem("rf-gear", JSON.stringify(chk)); } catch (e) { /* 이번만 */ }
                    draw();
                });
                lb.appendChild(cb); lb.appendChild(sp); li.appendChild(lb); ul.appendChild(li);
            });
            $("gcCount").textContent = done === items.length ? T("✅ 모두 챙겼어요! 즐거운 산행 되세요.", "✅ All packed! Have a great hike.") : T(items.length + "개 가운데 " + done + "개 챙김", done + " of " + items.length + " packed");
        }
        $("gcSeason").addEventListener("change", draw);
        $("gcReset").addEventListener("click", function () { chk = {}; try { localStorage.removeItem("rf-gear"); } catch (e) { /* 이번만 */ } draw(); });
        draw();
    })();

    // 앱 알림을 누르면 그 칸을 펴서 열기(tools.html?open=t-pill - hike.js 가 알림 누름을 받아 넘김)
    (function () {
        var m = /[?&]open=(t-[a-z]+)/.exec(location.search), d = m && $(m[1]);
        if (d && d.tagName === "DETAILS") {   // 아래 접기 · 펼치기가 "마지막에 편 칸" 으로 열도록 - 직접 열면 그 칸과 둘이 열려 서로 접힘
            try { localStorage.setItem("rf-tools-open1", d.id); } catch (e) { d.open = true; }
            openFromLink = d;   // 스크롤은 아래 접기 · 펼치기(toolTop)가 - 따로 하면 서로 엇갈려 띠 밑에 가렸음(2026-10-18 PC)
        }
    })();

    /** 편 칸 제목을 위쪽 띠(#top, 화면에 붙어 있음) 바로 아래로. */
    function toolTop(d, smooth) {
        var bar = ($("top").getBoundingClientRect().bottom || 0) + 8, r = d.getBoundingClientRect();
        if (r.top < bar || r.top > innerHeight * 0.6) window.scrollTo({ top: Math.max(0, scrollY + r.top - bar), behavior: smooth ? "smooth" : "auto" });
    }
    // ── 📏 단위 변환 ──
    var st = { cat: "length", from: "cm", to: "in" };
    try { var s0 = JSON.parse(lsGet("rf-tools") || "null"); if (s0 && RF.UNITS[s0.cat]) st = s0; } catch (e) { /* 처음 */ }
    function keep() { try { localStorage.setItem("rf-tools", JSON.stringify(st)); } catch (e) { /* 이번만 */ } }
    function units() { return RF.UNITS[st.cat].u; }
    function label(u) { var n = EN ? u[2] : u[1]; return n.indexOf(u[0]) === 0 ? n : u[0] + " · " + n; }   // "평 · 평" 대신 "평"
    function has(sym) { return units().some(function (u) { return u[0] === sym; }); }
    function fill(sel, val) {
        sel.innerHTML = "";
        units().forEach(function (u) {
            var o = document.createElement("option");
            o.value = u[0];
            o.textContent = label(u);
            sel.appendChild(o);
        });
        sel.value = val;
    }
    function drawCats() {
        var box = $("uCats");
        box.innerHTML = "";
        Object.keys(RF.UNITS).forEach(function (k) {
            var b = document.createElement("button");
            b.type = "button";
            b.textContent = EN ? RF.UNITS[k].en : RF.UNITS[k].ko;
            b.className = k === st.cat ? "on" : "";
            b.setAttribute("aria-pressed", k === st.cat ? "true" : "false");
            b.addEventListener("click", function () {
                if (st.cat === k) return;
                st.cat = k;
                var u = units();
                st.from = u[0][0];
                st.to = (u[1] || u[0])[0];
                keep();
                drawCats(); setup();
            });
            box.appendChild(b);
        });
    }
    function num(v) { return String(v).replace(/,/g, "").trim(); }
    function calc() {
        var v = num($("uVal").value), r = RF.unitConv(st.cat, v, st.from, st.to);
        $("uRes").innerHTML = "";
        $("uOne").textContent = "";
        $("uAll").innerHTML = "";
        if (r == null) {
            if (v !== "") $("uRes").textContent = T("숫자를 넣어 주세요", "Enter a number");
            return;
        }
        $("uRes").textContent = RF.unitFmt(r) + " ";
        var sm = document.createElement("small");
        sm.textContent = st.to;
        $("uRes").appendChild(sm);
        if (st.cat !== "temp") $("uOne").textContent = "1 " + st.from + " = " + RF.unitFmt(RF.unitConv(st.cat, 1, st.from, st.to)) + " " + st.to;
        units().forEach(function (u) {
            if (u[0] === st.from) return;
            var li = document.createElement("li"), b = document.createElement("b"), sp = document.createElement("span");
            sp.textContent = EN ? u[2] : u[1];
            b.textContent = RF.unitFmt(RF.unitConv(st.cat, v, st.from, u[0])) + " " + u[0];
            li.appendChild(sp); li.appendChild(b);
            $("uAll").appendChild(li);
        });
    }
    function setup() {
        if (!has(st.from)) st.from = units()[0][0];
        if (!has(st.to)) st.to = (units()[1] || units()[0])[0];
        fill($("uFrom"), st.from);
        fill($("uTo"), st.to);
        calc();
    }
    $("uVal").addEventListener("input", calc);
    $("uFrom").addEventListener("change", function () { st.from = this.value; keep(); calc(); });
    $("uTo").addEventListener("change", function () { st.to = this.value; keep(); calc(); });
    $("uSwap").addEventListener("click", function () {
        var t = st.from; st.from = st.to; st.to = t;   // 숫자는 그대로, 단위만 맞바꿈(1cm → in 이 1in → cm 로)
        keep(); setup();
    });
    drawCats(); setup();

    // ── 접기 · 펼치기: 한 칸을 펴면 다른 칸은 접음(2026-10-18 홍TV님). 펼친 칸 하나만 이 기기에 기억 ──
    var TOOLS = Array.prototype.slice.call(document.querySelectorAll("details.tool")), lastOpen = lsGet("rf-tools-open1");
    TOOLS.forEach(function (d) {
        if (d.id === lastOpen) d.open = true;
        d.addEventListener("toggle", function () {
            if (d.open) {
                TOOLS.forEach(function (o) { if (o !== d && o.open) o.open = false; });
                try { localStorage.setItem("rf-tools-open1", d.id); } catch (e) { /* 이번만 */ }
                if (d === openFromLink) { openFromLink = null; setTimeout(function () { toolTop(d, false); }, 0); setTimeout(function () { toolTop(d, false); }, 400); }   // 알림 등 링크로 열 때(그림 · 글 그려진 뒤 한 번 더)
                else setTimeout(function () { toolTop(d, true); }, 0);   // 위가 접혀 올라가도 편 칸 제목이 띠 아래로 보이게
            } else if (lsGet("rf-tools-open1") === d.id) { try { localStorage.removeItem("rf-tools-open1"); } catch (e) { /* 이번만 */ } }
            if (!d.open && d.id === "t-sos") stopAll();
        });
    });

    var WD = EN ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["일", "월", "화", "수", "목", "금", "토"];
    function fmtNum(x, dp) { return x == null ? "" : RF.unitFmt(dp == null ? x : Number(x.toFixed(dp))); }
    function nowYmd() { var d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; }
    function ymdText(a) {
        if (!a) return "";
        var w = WD[new Date(Date.UTC(a[0], a[1] - 1, a[2])).getUTCDay()];
        return EN ? a[0] + "-" + String(a[1]).padStart(2, "0") + "-" + String(a[2]).padStart(2, "0") + " (" + w + ")" : a[0] + "년 " + a[1] + "월 " + a[2] + "일 (" + w + ")";
    }
    /** 년 · 월 · 일 선택 상자 셋(앱에서 input type=date 가 안 열릴 수 있어 - 안부의 시각 고르기와 같은 까닭). */
    function datePick(host, init, y0, y1, onChange) {
        var sy = document.createElement("select"), sm = document.createElement("select"), sd = document.createElement("select");
        [sy, sm, sd].forEach(function (x) { x.className = "f"; host.appendChild(x); });
        sy.setAttribute("aria-label", T("년", "Year")); sm.setAttribute("aria-label", T("월", "Month")); sd.setAttribute("aria-label", T("일", "Day"));
        sy.style.flex = "1.4 1 0";
        for (var y = y1; y >= y0; y--) sy.add(new Option(EN ? String(y) : y + "년", y));
        for (var m = 1; m <= 12; m++) sm.add(new Option(EN ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] : m + "월", m));
        function days() {
            var keep = +sd.value || init[2], n = new Date(Date.UTC(+sy.value, +sm.value, 0)).getUTCDate();
            sd.innerHTML = "";
            for (var d = 1; d <= n; d++) sd.add(new Option(EN ? String(d) : d + "일", d));
            sd.value = Math.min(keep, n);
        }
        sy.value = init[0]; sm.value = init[1]; days(); sd.value = init[2];
        sy.addEventListener("change", function () { days(); onChange(); });
        sm.addEventListener("change", function () { days(); onChange(); });
        sd.addEventListener("change", onChange);
        return function () { return [+sy.value, +sm.value, +sd.value]; };
    }
    var TODAY = nowYmd();

    // ── 💱 환율(유럽중앙은행 기준 - Frankfurter, 키 없음). 받은 값은 6시간 동안 이 기기에 두고 씀(인터넷이 없을 때도 마지막 값) ──
    var CUR = [["KRW", "원", "Korean won"], ["USD", "미국 달러", "US dollar"], ["JPY", "일본 엔", "Japanese yen"], ["EUR", "유로", "Euro"], ["CNY", "중국 위안", "Chinese yuan"],
        ["GBP", "영국 파운드", "British pound"], ["HKD", "홍콩 달러", "Hong Kong dollar"], ["SGD", "싱가포르 달러", "Singapore dollar"], ["THB", "태국 바트", "Thai baht"],
        ["PHP", "필리핀 페소", "Philippine peso"], ["IDR", "인도네시아 루피아", "Indonesian rupiah"], ["MYR", "말레이시아 링깃", "Malaysian ringgit"], ["INR", "인도 루피", "Indian rupee"],
        ["AUD", "호주 달러", "Australian dollar"], ["NZD", "뉴질랜드 달러", "New Zealand dollar"], ["CAD", "캐나다 달러", "Canadian dollar"], ["CHF", "스위스 프랑", "Swiss franc"]];
    var fx = null, fxSt = { from: "USD", to: "KRW" };
    try { var f0 = JSON.parse(lsGet("rf-fx") || "null"); if (f0 && f0.rates) fx = f0; var f1 = JSON.parse(lsGet("rf-fx-pick") || "null"); if (f1 && f1.from) fxSt = f1; } catch (e) { /* 처음 */ }
    CUR.forEach(function (c) {
        [$("fxFrom"), $("fxTo")].forEach(function (sel) { sel.add(new Option(c[0] + " · " + (EN ? c[2] : c[1]), c[0])); });
    });
    $("fxFrom").value = fxSt.from; $("fxTo").value = fxSt.to;
    function fxDraw(msg) {
        var out = $("fxOut");
        out.innerHTML = "";
        if (!fx) { out.textContent = msg || T("환율을 받는 중…", "Loading rates…"); return; }
        var v = String($("fxVal").value).replace(/,/g, "").trim(), r = RF.fxConv(v, fxSt.from, fxSt.to, fx.base, fx.rates);
        if (r == null) { out.textContent = v === "" ? "" : T("숫자를 넣어 주세요", "Enter a number"); return; }
        var big = r >= 100 ? 0 : r >= 1 ? 2 : 4;
        out.appendChild(document.createTextNode(fmtNum(r, big) + " " + fxSt.to));
        var one = RF.fxConv(fxSt.from === "JPY" || fxSt.from === "IDR" ? 100 : 1, fxSt.from, fxSt.to, fx.base, fx.rates);
        var sm = document.createElement("small");
        sm.textContent = (fxSt.from === "JPY" || fxSt.from === "IDR" ? "100 " : "1 ") + fxSt.from + " = " + fmtNum(one, one >= 100 ? 2 : 4) + " " + fxSt.to
            + " · " + T("기준일 ", "as of ") + fx.date + (msg ? " · " + msg : "");
        out.appendChild(sm);
    }
    function fxLoad() {
        if (fx && Date.now() - (fx.at || 0) < 6 * 3600000) return fxDraw();
        fxDraw();
        var urls = ["https://api.frankfurter.dev/v1/latest?base=USD", "https://api.frankfurter.app/latest?from=USD"];
        (function next(i) {
            if (i >= urls.length) return fxDraw(fx ? T("새 값을 받지 못해 마지막 값", "showing the last saved rates") : T("환율을 받지 못했습니다 - 인터넷을 확인해 주세요", "Could not load rates - check your connection"));
            fetch(urls[i]).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
                if (!j || !j.rates || !j.base) throw new Error("bad");
                fx = { base: j.base, date: j.date, rates: j.rates, at: Date.now() };
                try { localStorage.setItem("rf-fx", JSON.stringify(fx)); } catch (e) { /* 이번만 */ }
                fxDraw();
            }).catch(function () { next(i + 1); });
        })(0);
    }
    function fxKeep() { try { localStorage.setItem("rf-fx-pick", JSON.stringify(fxSt)); } catch (e) { /* 이번만 */ } }
    $("fxVal").addEventListener("input", function () { fxDraw(); });
    $("fxFrom").addEventListener("change", function () { fxSt.from = this.value; fxKeep(); fxDraw(); });
    $("fxTo").addEventListener("change", function () { fxSt.to = this.value; fxKeep(); fxDraw(); });
    $("fxSwap").addEventListener("click", function () {
        var t = fxSt.from; fxSt.from = fxSt.to; fxSt.to = t;
        $("fxFrom").value = fxSt.from; $("fxTo").value = fxSt.to; fxKeep(); fxDraw();
    });
    $("t-fx").addEventListener("toggle", function () { if (this.open) fxLoad(); });
    if ($("t-fx").open) fxLoad();

    // ── 🎂 만 나이 · 띠 ──
    var ageGet = datePick($("ageBirth"), [1960, 1, 1], 1910, TODAY[0], ageDraw);
    /** 윤달 칸: 그해 윤달이 몇 월인지 옆에 쓰고, 고른 달이 윤달이 아니면 막음(2026-10-18 홍TV님 "윤달은?"). */
    function leapNote(cb, note, y, m) {
        var lm = RF.leapMonth(y);
        note.textContent = lm == null ? "" : lm ? T("(" + y + "년은 윤" + lm + "월이 있음)", "(" + y + " had a leap month " + lm + ")") : T("(" + y + "년은 윤달 없음)", "(no leap month in " + y + ")");
        cb.disabled = lm !== null && lm !== m;
        if (cb.disabled) cb.checked = false;
    }
    function ageDraw() {   // 음력 생일도(2026-10-18 홍TV님 "생일은 양력? 음력?")
        var b = ageGet(), lunar = $("ageCal").value === "l", out = $("ageOut"), solarB = b, nb = null;
        $("ageLeapRow").style.display = lunar ? "flex" : "none";
        if (lunar) leapNote($("ageLeap"), $("ageLeapNote"), b[0], b[1]);
        out.innerHTML = "";
        if (lunar) {
            solarB = RF.fromLunar(b[0], b[1], b[2], $("ageLeap").checked);
            if (!solarB) { out.textContent = T("그 해에 없는 음력 날짜입니다(윤달 · 30일 확인)", "No such lunar date that year (check leap month / day 30)"); return; }
            nb = RF.nextLunarBirthday(b[1], b[2], TODAY);
        }
        var a = RF.ageInfo(solarB, TODAY);
        if (!a) { out.textContent = T("오늘 뒤의 날짜입니다", "That date is in the future"); return; }
        if (lunar) {
            a.ddi = RF.ageInfo([b[0], 1, 1], [b[0], 1, 1]).ddi;   // 음력 해 = 띠의 해
            if (nb) a.nextDays = RF.dateDiff(TODAY, nb);
        }
        out.appendChild(document.createTextNode(EN ? "Age " + a.man : "만 " + a.man + "세"));
        var sm = document.createElement("small");
        sm.textContent = EN ? "Korean year age " + a.year + " · Year of the " + a.ddi + " · " + (a.nextDays === 0 ? "Happy birthday today! 🎉" : a.nextDays + (a.nextDays === 1 ? " day" : " days") + " to your next birthday")
            : "연 나이 " + a.year + "세 · " + a.ddi + "띠 · " + (a.nextDays === 0 ? "오늘 생일이에요 🎉" : "다음 생일까지 " + a.nextDays + "일");
        out.appendChild(sm);
        if (lunar) {
            var sm2 = document.createElement("small");
            sm2.textContent = T("양력으로 태어난 날 ", "Solar birth date ") + ymdText(solarB) + (nb ? T(" · 다음 생일(양력) ", " · next birthday (solar) ") + ymdText(nb) : "");
            out.appendChild(sm2);
        }
    }
    $("ageCal").addEventListener("change", ageDraw);
    $("ageLeap").addEventListener("change", ageDraw);
    ageDraw();

    // ── 📅 날짜 계산 ──
    var ddGet = datePick($("ddTarget"), [TODAY[0], 12, 25], TODAY[0] - 50, TODAY[0] + 50, ddDraw);
    function ddDraw() {
        var g = ddGet(), out = $("ddOut");
        out.innerHTML = "";
        out.appendChild(document.createTextNode(RF.dDay(TODAY, g)));
        var sm = document.createElement("small"), n = RF.dateDiff(TODAY, g);
        sm.textContent = ymdText(g) + " · " + (n === 0 ? T("오늘", "today") : n > 0 ? T(n + "일 남음", n + " days to go") : T(-n + "일 지남", -n + " days ago"));
        out.appendChild(sm);
    }
    ddDraw();
    var daGet = datePick($("daStart"), TODAY, TODAY[0] - 100, TODAY[0] + 50, daDraw);
    function daDraw() {
        var n = String($("daN").value).replace(/,/g, "").trim(), r = n === "" ? null : RF.dateAdd(daGet(), n, $("daFirst").checked), out = $("daOut");
        out.innerHTML = "";
        if (!r) { if (n !== "") out.textContent = T("숫자를 넣어 주세요", "Enter a number"); return; }
        out.appendChild(document.createTextNode(ymdText(r)));
        var sm = document.createElement("small"), d = RF.dDay(TODAY, r);
        sm.textContent = (+n > 0 && $("daFirst").checked ? T("첫날 포함 " + Math.trunc(+n) + "일째", "Day " + Math.trunc(+n) + ", counting the first day") : T(Math.trunc(+n) + "일 뒤", Math.trunc(+n) + " days later")) + " · " + d;
        out.appendChild(sm);
    }
    $("daN").addEventListener("input", daDraw);
    $("daFirst").addEventListener("change", daDraw);
    daDraw();

    // ── 💰 퍼센트 · 할인 · 더치페이 ──
    var PL = { sale: [T("값(원)", "Price"), T("할인율(%)", "Discount (%)")], of: [T("몇 %", "Percent (%)"), T("어떤 수", "Number")],
        is: [T("A", "A"), T("B", "B")], change: [T("A(전)", "A (before)"), T("B(뒤)", "B (after)")] };
    function pLabels() { var k = $("pKind").value; $("pLa").textContent = PL[k][0]; $("pLb").textContent = PL[k][1]; }
    function pDraw() {
        var k = $("pKind").value, a = String($("pA").value).replace(/,/g, "").trim(), b = String($("pB").value).replace(/,/g, "").trim(), out = $("pOut");
        out.innerHTML = "";
        if (a === "" || b === "") return;
        var r = RF.pctCalc(k, a, b);
        if (r == null) { out.textContent = T("계산할 수 없습니다", "Cannot calculate"); return; }
        if (k === "sale") {
            out.appendChild(document.createTextNode(fmtNum(r, 2) + T("원", "")));
            var sm = document.createElement("small");
            sm.textContent = T(fmtNum(+a - r, 2) + "원 할인", fmtNum(+a - r, 2) + " off");
            out.appendChild(sm);
        } else if (k === "of") out.textContent = fmtNum(r, 4);
        else if (k === "is") out.textContent = fmtNum(r, 2) + "%";
        else out.textContent = (r > 0 ? "▲ " : r < 0 ? "▼ " : "") + fmtNum(Math.abs(r), 2) + "% " + (r > 0 ? T("올랐어요", "up") : r < 0 ? T("내렸어요", "down") : T("그대로", "no change"));
    }
    $("pKind").addEventListener("change", function () { pLabels(); pDraw(); });
    $("pA").addEventListener("input", pDraw);
    $("pB").addEventListener("input", pDraw);
    pLabels();
    function dDraw() {
        var t = String($("dTotal").value).replace(/,/g, "").trim(), out = $("dOut");
        out.innerHTML = "";
        if (t === "") return;
        var r = RF.dutchPay(t, $("dN").value, $("dUnit").value);
        if (!r) { out.textContent = T("금액과 사람 수를 넣어 주세요", "Enter the total and number of people"); return; }
        out.appendChild(document.createTextNode(T("한 사람 " + fmtNum(r.per) + "원", fmtNum(r.per) + " each")));
        if (r.n > 1 && r.last !== r.per) {
            var sm = document.createElement("small");
            sm.textContent = T((r.n - 1) + "명 " + fmtNum(r.per) + "원 · 1명(계산한 사람) " + fmtNum(r.last) + "원", (r.n - 1) + " pay " + fmtNum(r.per) + " · 1 (the payer) " + fmtNum(r.last));
            out.appendChild(sm);
        }
    }
    ["dTotal", "dN"].forEach(function (id) { $(id).addEventListener("input", dDraw); });
    $("dUnit").addEventListener("change", dDraw);

    // ── 🔢 글자 수 세기 ──
    function tcDraw() {
        var c = RF.textCount($("tcIn").value), k = RF.smsKind(c.bytes), out = $("tcOut");
        out.innerHTML = "";
        out.appendChild(document.createTextNode(T(fmtNum(c.chars) + "자", fmtNum(c.chars) + " characters")));
        var sm = document.createElement("small");
        sm.textContent = T("공백 빼고 " + fmtNum(c.noSpace) + "자 · " + fmtNum(c.bytes) + "바이트(" + (k === "SMS" ? "단문" : k === "LMS" ? "장문" : "장문 넘음") + ") · 낱말 " + fmtNum(c.words) + " · " + fmtNum(c.lines) + "줄",
            fmtNum(c.noSpace) + " without spaces · " + fmtNum(c.bytes) + " bytes (" + (k || "over LMS") + ") · " + fmtNum(c.words) + " words · " + fmtNum(c.lines) + " lines");
        out.appendChild(sm);
    }
    $("tcIn").addEventListener("input", tcDraw);
    tcDraw();

    // ── 🧭 나침반(폰 방향 센서) ──
    var cmpOn = false;
    function onOri(ev) {
        var ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
        var h = RF.compassHeading(ev.alpha, ev.absolute || ev.type === "deviceorientationabsolute", ev.webkitCompassHeading, ang);
        if (h == null) { $("cmpOut").textContent = T("이 기기는 방향 센서를 쓸 수 없습니다", "This device has no compass sensor"); return; }
        $("dial").style.transform = "rotate(" + (-h) + "deg)";
        $("cmpOut").textContent = h + "° " + RF.azWord(h);
    }
    $("cmpBtn").addEventListener("click", function () {
        if (cmpOn) return;
        function start() {
            cmpOn = true;
            $("cmpBtn").textContent = T("폰을 평평하게 들어 주세요", "Hold the phone flat");
            if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", onOri);
            else window.addEventListener("deviceorientation", onOri);
            setTimeout(function () { if (!$("cmpOut").textContent) $("cmpOut").textContent = T("방향을 읽지 못했습니다 - 핸드폰에서 열어 주세요", "No compass reading - open this on a phone"); }, 2500);
        }
        var D = window.DeviceOrientationEvent;
        if (D && typeof D.requestPermission === "function") {   // iOS 13+ - 누를 때 허락받기
            // 2026-10-18 PC: 크롬 152(PC)에도 requestPermission 이 있고 "denied" - 거절이어도 센서를 들어 보고, 못 읽으면 2.5초 뒤 안내
            D.requestPermission().then(function (p) { if (p !== "granted") toast(T("방향 센서 허락이 필요합니다", "Allow motion & orientation access")); start(); }).catch(start);
        } else if (D) start();
        else $("cmpOut").textContent = T("이 기기는 방향 센서를 쓸 수 없습니다", "This device has no compass sensor");
    });

    // ── 📯 호루라기(SOS 박자) · 🔦 화면 손전등 ──
    var ac = null, whTimer = null, osc = null, gain = null, wake = null;
    function beepLoop(i) {
        var p = RF.SOS_PATTERN[i % RF.SOS_PATTERN.length];
        gain.gain.setTargetAtTime(0.9, ac.currentTime, 0.005);
        whTimer = setTimeout(function () {
            gain.gain.setTargetAtTime(0, ac.currentTime, 0.005);
            whTimer = setTimeout(function () { beepLoop(i + 1); }, p[1]);
        }, p[0]);
    }
    function whStop() {
        clearTimeout(whTimer); whTimer = null;
        if (osc) { try { osc.stop(); } catch (e) { /* 이미 */ } osc = null; }
        $("whBtn").classList.remove("on");
        $("whBtn").textContent = T("📯 호루라기(SOS)", "📯 Whistle (SOS)");
    }
    $("whBtn").addEventListener("click", function () {
        if (osc) return whStop();
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return toast(T("이 브라우저는 소리를 낼 수 없습니다", "This browser cannot play sound"));
        ac = ac || new AC();
        if (ac.resume) ac.resume();
        osc = ac.createOscillator(); gain = ac.createGain();
        osc.type = "square"; osc.frequency.value = 3150;   // 호루라기 소리 높이(약 3kHz - 사람 귀에 가장 잘 들림)
        gain.gain.value = 0;
        osc.connect(gain); gain.connect(ac.destination);
        osc.start();
        beepLoop(0);
        this.classList.add("on");
        this.textContent = T("⏹ 호루라기 멈춤", "⏹ Stop whistle");
    });
    var ltTimer = null;
    function ltSos(i) {
        var p = RF.SOS_PATTERN[i % RF.SOS_PATTERN.length], L = $("light");
        L.classList.remove("dark");
        ltTimer = setTimeout(function () { L.classList.add("dark"); ltTimer = setTimeout(function () { ltSos(i + 1); }, p[1]); }, p[0]);
    }
    function ltStop() {
        clearTimeout(ltTimer); ltTimer = null;
        $("light").style.display = "none"; $("light").classList.remove("dark");
        $("ltSos").textContent = "SOS";
        if (wake) { try { wake.release(); } catch (e) { /* 이미 */ } wake = null; }
    }
    $("ltBtn").addEventListener("click", function () {
        $("light").style.display = "flex";
        if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request("screen").then(function (w) { wake = w; }).catch(function () { /* 꺼질 수 있음 */ });
        toast(T("화면 밝기를 가장 밝게 올리세요", "Turn screen brightness all the way up"));
    });
    $("ltSos").addEventListener("click", function () {
        if (ltTimer) { clearTimeout(ltTimer); ltTimer = null; $("light").classList.remove("dark"); this.textContent = "SOS"; }
        else { ltSos(0); this.textContent = T("깜박임 멈춤", "Stop blinking"); }
    });
    $("ltOff").addEventListener("click", ltStop);
    function stopAll() { whStop(); ltStop(); tgStop(); blStop(); }
    window.addEventListener("pagehide", stopAll);

    function val(id) { return String($(id).value).replace(/,/g, "").trim(); }
    function outSet(id, big, small) {
        var o = $(id);
        o.innerHTML = "";
        if (big == null) return;
        o.appendChild(document.createTextNode(big));
        if (small) { var sm = document.createElement("small"); sm.textContent = small; o.appendChild(sm); }
    }
    function won(x) { return T(fmtNum(x) + "원", fmtNum(x) + " won"); }
    function rand(n) {   // 0 ~ n-1 고르게(제비뽑기 · 주사위 - crypto 가 있으면 그것)
        if (window.crypto && crypto.getRandomValues) { var a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n; do crypto.getRandomValues(a); while (a[0] >= lim); return a[0] % n; }
        return Math.floor(Math.random() * n);
    }
    function shuffle(l) { l = l.slice(); for (var i = l.length - 1; i > 0; i--) { var j = rand(i + 1), t = l[i]; l[i] = l[j]; l[j] = t; } return l; }
    function audio() { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ac = ac || new AC(); if (ac.resume) ac.resume(); return ac; }

    // ── 🧾 부가세 ──
    function vDraw() {
        var a = val("vA");
        if (a === "") return outSet("vOut");
        var r = RF.vatCalc(a, $("vMode").value);
        if (!r) return outSet("vOut", T("숫자를 넣어 주세요", "Enter a number"));
        outSet("vOut", $("vMode").value === "total" ? T("공급가 ", "Before tax ") + won(r.supply) : T("합계 ", "Total ") + won(r.total),
            T("공급가 ", "Before tax ") + won(r.supply) + " · " + T("부가세 ", "VAT ") + won(r.vat) + " · " + T("합계 ", "Total ") + won(r.total));
    }
    $("vA").addEventListener("input", vDraw);
    $("vMode").addEventListener("change", vDraw);

    // ── 💵 이자 ──
    function iLabel() { var k = $("iKind").value; $("iLa").textContent = k === "saving" ? T("매달 넣는 돈(원)", "Monthly deposit (won)") : /^loan/.test(k) ? T("빌린 돈(원)", "Loan amount (won)") : T("맡기는 돈(원)", "Amount (won)"); }
    function iDraw() {
        var k = $("iKind").value, a = val("iA"), r0 = val("iR"), m = val("iM");
        if (a === "" || r0 === "" || m === "") return outSet("iOut");
        var r = RF.interestCalc(k === "depositC" ? "deposit" : k, a, r0, m, k === "depositC");
        if (!r) return outSet("iOut", T("금액 · 이자 · 기간을 넣어 주세요", "Enter amount, rate and months"));
        if (/^loan/.test(k)) {
            var pay = k === "loanBullet" ? T("매달 이자 ", "Monthly interest ") + won(r.first) : r.first === r.last ? T("매달 ", "Monthly ") + won(r.first) : T("첫 달 ", "First month ") + won(r.first);
            outSet("iOut", pay, (k === "loanPr" ? T("마지막 달 ", "last month ") + won(r.last) + " · " : k === "loanBullet" ? T("마지막 달 원금 포함 ", "last month with principal ") + won(r.last) + " · " : "")
                + T("총이자 ", "total interest ") + won(r.interest) + " · " + T("모두 갚을 돈 ", "total repaid ") + won(r.total));
        } else outSet("iOut", T("받을 돈 ", "You get ") + won(r.net), T("넣은 돈 ", "Paid in ") + won(r.paid) + " · " + T("이자 ", "interest ") + won(r.interest) + " · " + T("세금(15.4%) ", "tax (15.4%) ") + won(r.tax));
    }
    $("iKind").addEventListener("change", function () { iLabel(); iDraw(); });
    ["iA", "iR", "iM"].forEach(function (id) { $(id).addEventListener("input", iDraw); });
    iLabel();

    // ── 🔤 영문 이름 ──
    function nmDraw() {
        var v = $("nmIn").value.trim();
        if (!v) return outSet("nmOut");
        var r = RF.nameRoman(v, $("nmTwo").checked);
        if (!r) return outSet("nmOut", T("한글 이름을 두 글자 이상 넣어 주세요", "Enter a Korean name (2+ syllables)"));
        outSet("nmOut", r.sur + " " + r.given, T("이름을 나눠 쓰면 ", "With a hyphen: ") + r.sur + " " + r.alt + (r.sur !== r.surStd ? T(" · 성의 표준 로마자 ", " · standard romanization of the surname: ") + r.surStd : ""));
    }
    $("nmIn").addEventListener("input", nmDraw);
    $("nmTwo").addEventListener("change", nmDraw);

    // ── 🌙 음력 ↔ 양력 ──
    function lunarText(l) { return l ? T("음력 " + l.y + "년 " + (l.leap ? "윤" : "") + l.m + "월 " + l.d + "일", "Lunar " + l.y + "-" + (l.leap ? "leap " : "") + l.m + "-" + l.d) : ""; }
    var lt = RF.toLunar(TODAY);
    $("lnToday").textContent = lt ? T("오늘은 ", "Today is ") + lunarText(lt) + T(" 입니다", "") : T("이 브라우저는 음력 달력이 없습니다", "This browser has no lunar calendar");
    var lnGet = datePick($("lnPick"), TODAY, 1900, TODAY[0] + 50, lnDraw);
    function lnDraw() {
        var mode = $("lnMode").value, d = lnGet();
        $("lnLeapRow").style.display = mode === "l2s" ? "flex" : "none";
        if (mode === "l2s") leapNote($("lnLeap"), $("lnLeapNote"), d[0], d[1]);
        if (mode === "s2l") {
            var l = RF.toLunar(d);
            return outSet("lnOut", l ? lunarText(l) : T("바꿀 수 없습니다", "Cannot convert"), ymdText(d) + (l && l.cal !== "dangi" ? T(" · 중국 음력 기준(하루 다를 수 있음)", " · Chinese calendar (may be off by a day)") : ""));
        }
        var r = RF.fromLunar(d[0], d[1], d[2], $("lnLeap").checked);
        outSet("lnOut", r ? ymdText(r) : T("그 해에 없는 날입니다(윤달 · 30일 확인)", "No such lunar date that year (check leap month / day 30)"),
            r ? T("양력 · ", "Solar · ") + RF.dDay(TODAY, r) : "");
    }
    $("lnMode").addEventListener("change", lnDraw);
    $("lnLeap").addEventListener("change", lnDraw);
    lnDraw();

    // ── ⏱ 타이머 · 스톱워치(시각을 기준으로 - 화면이 잠깐 멈춰도 맞게) ──
    function mmss(ms, tenth) {
        var t = Math.max(0, ms), h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, sec = Math.floor(t / 1000) % 60;
        return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0") + (tenth ? "." + Math.floor(t / 100) % 10 : "");
    }
    var tm = { len: 180000, left: 180000, end: 0, run: false, iv: null }, tmWake = null;
    [[1, T("1분", "1 min")], [3, T("3분 라면", "3 min ramen")], [4, T("4분 컵라면", "4 min cup noodles")], [5, T("5분", "5 min")], [10, T("10분", "10 min")], [30, T("30분", "30 min")]].forEach(function (p) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = p[1];
        b.addEventListener("click", function () { tmStop(); tm.len = tm.left = p[0] * 60000; tmShow(); });
        $("tmPre").appendChild(b);
    });
    function tmShow() { $("tmShow").textContent = mmss(tm.run ? tm.end - Date.now() + 999 : tm.left); }
    function tmStop() {
        if (tm.run) tm.left = Math.max(0, tm.end - Date.now());
        tm.run = false; clearInterval(tm.iv);
        $("tmGo").textContent = T("▶ 시작", "▶ Start");
        if (tmWake) { try { tmWake.release(); } catch (e) { /* 이미 */ } tmWake = null; }
    }
    function ring() {
        var c = audio();
        if (c) [0, 0.5, 1, 1.5, 2, 2.5].forEach(function (t) {
            var o = c.createOscillator(), g = c.createGain();
            o.frequency.value = 880; g.gain.setValueAtTime(0, c.currentTime + t); g.gain.linearRampToValueAtTime(0.6, c.currentTime + t + 0.02); g.gain.linearRampToValueAtTime(0, c.currentTime + t + 0.3);
            o.connect(g); g.connect(c.destination); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.35);
        });
        if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
    }
    $("tmGo").addEventListener("click", function () {
        if (tm.run) { tmStop(); tmShow(); return; }
        if (tm.left <= 0) tm.left = tm.len;
        audio();   // 누를 때 소리를 깨워 둠(폰은 누른 뒤에만 소리 허락)
        tm.end = Date.now() + tm.left; tm.run = true;
        this.textContent = T("⏸ 멈춤", "⏸ Pause");
        if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request("screen").then(function (w) { tmWake = w; }).catch(function () { /* 꺼질 수 있음 */ });
        tm.iv = setInterval(function () {
            if (Date.now() >= tm.end) { tmStop(); tm.left = 0; tmShow(); ring(); toast(T("⏰ 시간이 됐습니다", "⏰ Time's up"), 5000); return; }
            tmShow();
        }, 250);
        tmShow();
    });
    $("tmReset").addEventListener("click", function () { tmStop(); tm.left = tm.len; tmShow(); });
    tmShow();
    var sw = { acc: 0, start: 0, run: false, iv: null, laps: [] };
    function swNow() { return sw.acc + (sw.run ? Date.now() - sw.start : 0); }
    function swShow() { $("swShow").textContent = mmss(swNow(), true); }
    $("swGo").addEventListener("click", function () {
        if (sw.run) { sw.acc = swNow(); sw.run = false; clearInterval(sw.iv); this.textContent = T("▶ 시작", "▶ Start"); swShow(); return; }
        sw.start = Date.now(); sw.run = true; this.textContent = T("⏸ 멈춤", "⏸ Pause");
        sw.iv = setInterval(swShow, 100);
    });
    $("swLap").addEventListener("click", function () {
        if (!sw.run && !swNow()) return;
        var t = swNow(), prev = sw.laps.length ? sw.laps[sw.laps.length - 1] : 0, li = document.createElement("li");
        sw.laps.push(t);
        li.textContent = mmss(t, true) + " (+" + mmss(t - prev, true) + ")";
        $("swLaps").appendChild(li);
    });
    $("swReset").addEventListener("click", function () {
        sw.run = false; clearInterval(sw.iv); sw.acc = 0; sw.laps = []; $("swLaps").innerHTML = ""; $("swGo").textContent = T("▶ 시작", "▶ Start"); swShow();
    });
    swShow();

    // ── 🕐 세계 시각(펼쳤을 때만 1초마다) ──
    var CITIES = [["서울", "Seoul", "Asia/Seoul"], ["도쿄", "Tokyo", "Asia/Tokyo"], ["베이징 · 상하이", "Beijing · Shanghai", "Asia/Shanghai"], ["타이베이", "Taipei", "Asia/Taipei"],
        ["하노이 · 호찌민", "Hanoi · Ho Chi Minh City", "Asia/Ho_Chi_Minh"], ["방콕", "Bangkok", "Asia/Bangkok"], ["마닐라", "Manila", "Asia/Manila"], ["싱가포르", "Singapore", "Asia/Singapore"],
        ["자카르타", "Jakarta", "Asia/Jakarta"], ["뉴델리", "New Delhi", "Asia/Kolkata"], ["두바이", "Dubai", "Asia/Dubai"], ["시드니", "Sydney", "Australia/Sydney"], ["오클랜드", "Auckland", "Pacific/Auckland"],
        ["모스크바", "Moscow", "Europe/Moscow"], ["런던", "London", "Europe/London"], ["파리 · 베를린", "Paris · Berlin", "Europe/Paris"], ["뉴욕 · 워싱턴", "New York · Washington", "America/New_York"],
        ["시카고", "Chicago", "America/Chicago"], ["로스앤젤레스 · 밴쿠버", "Los Angeles · Vancouver", "America/Los_Angeles"], ["토론토", "Toronto", "America/Toronto"], ["호놀룰루", "Honolulu", "Pacific/Honolulu"],
        ["상파울루", "São Paulo", "America/Sao_Paulo"]];
    var wcIv = null;
    function wcDraw() {
        var now = Date.now(), ko = RF.tzOffsetMin("Asia/Seoul", now), ul = $("wcList");
        ul.innerHTML = "";
        CITIES.forEach(function (c) {
            var off = RF.tzOffsetMin(c[2], now);
            if (off == null) return;
            var d = new Date(now + off * 60000), li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("b"), sm = document.createElement("small");
            var diff = (off - ko) / 60, wd = WD[d.getUTCDay()];
            sp.textContent = EN ? c[1] : c[0];
            sm.textContent = " " + (diff === 0 ? T("같음", "same") : (diff > 0 ? "+" : "") + diff + T("시간", "h"));
            sp.appendChild(sm);
            b.textContent = String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + " (" + wd + ")";
            li.appendChild(sp); li.appendChild(b);
            ul.appendChild(li);
        });
    }
    function wcToggle() { clearInterval(wcIv); if ($("t-world").open) { wcDraw(); wcIv = setInterval(wcDraw, 1000); } }
    $("t-world").addEventListener("toggle", wcToggle);
    wcToggle();

    // ── 위치(날씨 · 일출): 기본 서울 시청, "내 위치로" 를 누를 때만 GPS. 저장하지 않음 ──
    var SEOUL = { lat: 37.5663, lon: 126.9779, name: T("서울", "Seoul") }, loc = SEOUL;
    function here(cb) {
        if (!navigator.geolocation) return toast(T("이 기기는 위치를 쓸 수 없습니다", "Location is not available"));
        toast(T("위치를 찾는 중…", "Finding your location…"));
        navigator.geolocation.getCurrentPosition(function (p) {
            loc = { lat: p.coords.latitude, lon: p.coords.longitude, name: T("내 위치", "My location") };
            cb();
        }, function () { toast(T("위치를 못 찾았습니다 - 위치 권한을 확인해 주세요", "Could not get your location - check location permission"), 4000); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    }

    // ── 🌫 우리 동네 날씨 · 미세먼지(routefly api/weather · api/air - 산 페이지와 같은 것) ──
    var SKY_EN = { 1: "☀️ Sunny", 3: "⛅ Mostly cloudy", 4: "☁️ Cloudy" }, PTY_EN = { 1: "🌧 Rain", 2: "🌨 Rain/snow", 3: "❄️ Snow", 4: "🌦 Showers" };
    var AIR_EN = { "좋음": "Good", "보통": "Moderate", "나쁨": "Unhealthy", "매우나쁨": "Very unhealthy" };
    function sky(h) { return EN ? PTY_EN[+h.pty] || SKY_EN[+h.sky] || "-" : RF.weatherWord(h.sky, h.pty); }
    function wxLoad() {
        var q = "?lat=" + loc.lat.toFixed(4) + "&lon=" + loc.lon.toFixed(4);
        outSet("wxNow", T("날씨를 받는 중…", "Loading weather…"));
        $("wxHours").innerHTML = ""; $("wxAir").textContent = "";
        fetch("api/weather" + q).then(function (r) { return r.json(); }).then(function (w) {
            if (w.unavailable || !(w.hours || []).length) return outSet("wxNow", T("지금은 날씨를 받을 수 없습니다", "Weather is not available right now"));
            var h = w.hours[0], d = w.days && w.days[h.t.slice(0, 10)], feel = RF.windChill(h.tmp, h.wsd), di = h.tmp != null && h.reh != null && h.tmp >= 20 ? RF.discomfort(h.tmp, h.reh) : null;
            var extra = [];
            if (d && (d.tmn != null || d.tmx != null)) extra.push(T("최저 ", "low ") + (d.tmn != null ? d.tmn + "°" : "-") + T(" · 최고 ", " · high ") + (d.tmx != null ? d.tmx + "°" : "-"));
            if (h.reh != null) extra.push(T("습도 ", "humidity ") + h.reh + "%");
            if (h.wsd != null) extra.push(T("바람 ", "wind ") + h.wsd + "m/s");
            if (h.pop != null) extra.push(T("비 올 확률 ", "rain ") + h.pop + "%");
            if (feel != null) extra.push(T("체감 ", "feels like ") + feel + "°");
            if (di) extra.push(T("불쾌지수 ", "discomfort ") + di.di);
            outSet("wxNow", loc.name + " " + sky(h) + " " + (h.tmp != null ? h.tmp + T("℃", " °C") : ""), extra.join(" · ") + T(" · 기상청 ", " · KMA ") + w.base + T(" 발표", " KST"));
            w.hours.slice(1).filter(function (x) { return +x.t.slice(11, 13) % 3 === 0; }).slice(0, 8).forEach(function (x) {
                var li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("b");
                sp.textContent = (x.t.slice(0, 10) === h.t.slice(0, 10) ? "" : T("내일 ", "Tmrw ")) + (+x.t.slice(11, 13)) + T("시 ", ":00 ") + sky(x);
                b.textContent = (x.tmp != null ? x.tmp + "°" : "-") + (x.pop != null ? " · ☂" + x.pop + "%" : "");
                li.appendChild(sp); li.appendChild(b);
                $("wxHours").appendChild(li);
            });
        }).catch(function () { outSet("wxNow", T("날씨를 받지 못했습니다 - 인터넷을 확인해 주세요", "Could not load the weather - check your connection")); });
        fetch("api/air" + q).then(function (r) { return r.json(); }).then(function (a) {
            if (!a || a.unavailable || (a.pm10 == null && a.pm25 == null)) return;
            $("wxAir").textContent = EN ? [a.pm10 != null ? "PM10 " + (AIR_EN[a.pm10Word] || a.pm10Word) + " (" + a.pm10 + ")" : "", a.pm25 != null ? "PM2.5 " + (AIR_EN[a.pm25Word] || a.pm25Word) + " (" + a.pm25 + ")" : ""]
                .filter(Boolean).join(" · ") + " - AirKorea station" + (a.dist_km != null ? " " + a.dist_km + " km away" : "") : "😷 " + RF.airText(a);
        }).catch(function () { /* 없이 */ });
    }
    $("wxHere").addEventListener("click", function () { here(function () { wxLoad(); sunDraw(); }); });
    $("wxSeoul").addEventListener("click", function () { loc = SEOUL; wxLoad(); sunDraw(); });
    $("t-wx").addEventListener("toggle", function () { if (this.open && !$("wxNow").textContent) wxLoad(); });
    if ($("t-wx").open) wxLoad();

    // ── 🌅 일출 · 일몰 · 달 ──
    function hm(ms) {   // 한국 시각으로(폰 시간대가 달라도 - 해외에서 보는 영어 화면)
        if (ms == null) return "-";
        var d = new Date(ms + (RF.tzOffsetMin("Asia/Seoul", ms) || 540) * 60000);
        return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
    }
    function sunDraw() {
        var now = Date.now(), tom = now + 86400000;
        outSet("sunOut", "🌅 " + hm(RF.sunrise(now, loc.lat, loc.lon)) + "  🌇 " + hm(RF.sunset(now, loc.lat, loc.lon)),
            loc.name + T(" 오늘 · 내일 ", " today · tomorrow ") + hm(RF.sunrise(tom, loc.lat, loc.lon)) + " / " + hm(RF.sunset(tom, loc.lat, loc.lon)));
        var m = RF.moonPhase(now), nm = RF.MOON_NAMES[m.i], f = new Date(m.nextFull), nf = [f.getFullYear(), f.getMonth() + 1, f.getDate()];
        outSet("moonOut", nm[0] + " " + (EN ? nm[2] : nm[1]), T("밝은 부분 ", "lit ") + Math.round(m.illum * 100) + "% · " + T("다음 보름 ", "next full moon ") + ymdText(nf) + " " + RF.dDay(TODAY, nf));
    }
    $("sunHere").addEventListener("click", function () { here(function () { sunDraw(); if ($("wxNow").textContent) wxLoad(); }); });
    $("sunSeoul").addEventListener("click", function () { loc = SEOUL; sunDraw(); });
    sunDraw();

    // ── 🌡 체감온도 · 불쾌지수 ──
    function feDraw() {
        var t = val("feT"), h = val("feH"), w = val("feW");
        if (t === "") return outSet("feOut");
        var lines = [], big = null;
        if (w !== "") { var c = RF.windChill(+t, +w); big = c != null ? T("체감 " + c + "℃", "Feels like " + c + " °C") : null; if (c == null) lines.push(T("체감온도는 10℃ 이하 · 바람 1.3m/s 이상일 때만", "Wind chill only at 10 °C or below with wind 1.3 m/s+")); }
        if (h !== "" && +t >= 20) {   // 불쾌지수는 더울 때 말(20℃ 아래는 늘 낮음)
            var d = RF.discomfort(t, h);
            if (d) { var k = [T("낮음", "low"), T("보통", "moderate"), T("높음", "high"), T("매우 높음", "very high")][d.k]; if (big) lines.unshift(T("불쾌지수 ", "Discomfort ") + d.di + " (" + k + ")"); else big = T("불쾌지수 ", "Discomfort ") + d.di + " (" + k + ")"; }
        }
        if (!big) {   // 2026-10-18 홍TV님: 15℃ · 바람 5 에 "바람을 넣어 주세요" 가 나왔음 - 10 ~ 20℃ 는 둘 다 해당 없음
            if (+t > 10 && +t < 20) big = T("느끼는 온도 ≈ 기온 " + t + "℃", "Feels about the same as " + t + " °C"), lines = [T("10℃ 넘고 20℃ 아래는 체감온도(10℃ 이하) · 불쾌지수(20℃ 이상) 모두 해당하지 않습니다", "Between 10 and 20 °C neither wind chill (10 °C or below) nor the discomfort index (20 °C and above) applies")];
            else if (+t <= 10 && w === "") big = T("바람을 넣어 주세요", "Add wind");
            else if (+t <= 10) big = T("바람이 약해(1.3m/s 아래) 체감온도는 기온과 비슷합니다", "Wind under 1.3 m/s - feels about the same as the air"), lines = [];
            else if (h === "") big = T("습도를 넣어 주세요", "Add humidity");
        }
        outSet("feOut", big, lines.join(" · "));
    }
    ["feT", "feH", "feW"].forEach(function (id) { $(id).addEventListener("input", function () { $("feSrc").textContent = ""; feDraw(); }); });
    /** 지금 날씨로 채우기(api/weather - 기본 서울, "내 위치" 는 누를 때만 GPS). 2026-10-18 홍TV님: 직접 넣지 않게 */
    function feFill() {
        $("feSrc").textContent = T("지금 날씨를 받는 중…", "Loading current weather…");
        fetch("api/weather?lat=" + loc.lat.toFixed(4) + "&lon=" + loc.lon.toFixed(4)).then(function (r) { return r.json(); }).then(function (w) {
            var h = w && !w.unavailable && (w.hours || [])[0];
            if (!h) { $("feSrc").textContent = T("지금은 날씨를 받을 수 없습니다 - 직접 넣어 주세요", "Weather is not available - enter the values yourself"); return; }
            $("feT").value = h.tmp != null ? h.tmp : "";
            $("feH").value = h.reh != null ? h.reh : "";
            $("feW").value = h.wsd != null ? h.wsd : "";
            feDraw();
            $("feSrc").textContent = loc.name + T(" 지금 날씨를 넣었습니다(기상청 " + w.base + " 발표, " + String(h.t).slice(11, 16) + " 예보). 숫자를 고쳐 다른 날씨도 볼 수 있습니다.",
                " - current weather filled in (KMA " + w.base + " KST, forecast for " + String(h.t).slice(11, 16) + "). Edit the numbers to try other weather.");
        }).catch(function () { $("feSrc").textContent = T("날씨를 받지 못했습니다 - 직접 넣어 주세요", "Could not load the weather - enter the values yourself"); });
    }
    $("feHere").addEventListener("click", function () { here(feFill); });
    $("feSeoul").addEventListener("click", function () { loc = SEOUL; feFill(); });
    $("t-feel").addEventListener("toggle", function () { if (this.open && val("feT") === "") feFill(); });

    // ── ⚖ BMI ──
    function bmDraw() {
        var h = val("bmH"), w = val("bmW");
        if (h === "" || w === "") return outSet("bmOut");
        var r = RF.bmiInfo(h, w);
        if (!r) return outSet("bmOut", T("키(cm) · 몸무게(kg)를 확인해 주세요", "Check height (cm) and weight (kg)"));
        outSet("bmOut", "BMI " + r.bmi + " · " + r.word, T("이 키의 정상 체중 " + r.lo + " ~ " + r.hi + "kg", "Normal weight for this height: " + r.lo + "-" + r.hi + " kg"));
    }
    ["bmH", "bmW"].forEach(function (id) { $(id).addEventListener("input", bmDraw); });

    // ── 🎲 동전 · 주사위 · 제비뽑기 · 사다리 ──
    var DIE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    $("coinBtn").addEventListener("click", function () { var h = rand(2) === 0; outSet("cdOut", h ? T("🪙 앞면", "🪙 Heads") : T("🪙 뒷면", "🪙 Tails")); });
    $("diceBtn").addEventListener("click", function () {
        var n = +$("diceN").value, r = [];
        for (var i = 0; i < n; i++) r.push(rand(6) + 1);
        outSet("cdOut", r.map(function (x) { return DIE[x - 1]; }).join(" "), r.join(" + ") + (n > 1 ? " = " + r.reduce(function (a, b) { return a + b; }, 0) : ""));
    });
    function names(id) { return $(id).value.split(/[,\n、·]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
    $("lotOne").addEventListener("click", function () {
        var l = names("lotIn");
        if (l.length < 2) return outSet("lotOut", T("이름을 두 개 이상 넣어 주세요", "Enter at least two names"));
        outSet("lotOut", "🎉 " + l[rand(l.length)]);
    });
    $("lotAll").addEventListener("click", function () {
        var l = names("lotIn");
        if (l.length < 2) return outSet("lotOut", T("이름을 두 개 이상 넣어 주세요", "Enter at least two names"));
        outSet("lotOut", shuffle(l).map(function (x, i) { return (i + 1) + ". " + x; }).join("  "));
    });
    var ld = null, SVGNS = "http://www.w3.org/2000/svg";
    function svgEl(tag, at) { var e = document.createElementNS(SVGNS, tag); for (var k in at) e.setAttribute(k, at[k]); return e; }
    function ldDraw(sel) {
        var box = $("ldBox"), n = ld.names.length, R = ld.rungs.length, W = 320, top = 26, bot = 26, H = top + R * 24 + 16 + bot, gap = W / n, X = function (i) { return gap * (i + 0.5); }, Y = function (y) { return top + 8 + y * 24; };
        var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": T("사다리", "Ladder") });
        for (var i = 0; i < n; i++) svg.appendChild(svgEl("line", { x1: X(i), y1: Y(0), x2: X(i), y2: Y(R), stroke: "rgba(255,255,255,0.35)", "stroke-width": 3 }));
        ld.rungs.forEach(function (l, y) { l.forEach(function (b, c) { if (b) svg.appendChild(svgEl("line", { x1: X(c), y1: Y(y + 0.5), x2: X(c + 1), y2: Y(y + 0.5), stroke: "rgba(255,255,255,0.35)", "stroke-width": 3 })); }); });
        if (sel != null) {
            var tr = RF.ladderTrace(ld.rungs, sel);
            svg.appendChild(svgEl("polyline", { points: tr.path.map(function (p) { return X(p[0]) + "," + Y(p[1]); }).join(" "), fill: "none", stroke: "#38d9ea", "stroke-width": 5, "stroke-linejoin": "round" }));
            outSet("ldOut", ld.names[sel] + " → " + ld.res[tr.end]);
        }
        ld.names.forEach(function (nm, i) {   // 이름 칸 전체를 누를 수 있게(2026-10-18 PC: 글자만으로는 폰에서 빗나감)
            var hit = svgEl("rect", { x: X(i) - gap / 2 + 3, y: 0, width: gap - 6, height: 24, rx: 6, "class": "hit" });
            hit.addEventListener("click", function () { ldDraw(i); });
            svg.appendChild(hit);
            var t = svgEl("text", { x: X(i), y: 16 });
            t.textContent = nm.length > 6 ? nm.slice(0, 6) + "…" : nm;
            svg.appendChild(t);
        });
        ld.res.forEach(function (r, i) { var t = svgEl("text", { x: X(i), y: H - 8 }); t.textContent = sel != null || ld.all ? (r.length > 6 ? r.slice(0, 6) + "…" : r) : "?"; svg.appendChild(t); });
        box.innerHTML = "";
        box.appendChild(svg);
    }
    $("ldMake").addEventListener("click", function () {
        var nm = names("ldNames").slice(0, 8), res = names("ldRes");
        if (nm.length < 2) return outSet("ldOut", T("사람을 두 명 이상 넣어 주세요", "Enter at least two people"));
        if (!res.length) res = [T("당첨", "Win")];
        while (res.length < nm.length) res.push(T("꽝", "-"));
        res = shuffle(res.slice(0, nm.length));
        ld = { names: nm, res: res, all: false, rungs: RF.ladderMake(nm.length, 8, function () { return rand(1000) / 1000; }) };
        ldDraw(null);
        outSet("ldOut", T("위의 이름 칸을 누르면 사다리를 탑니다", "Tap a name box to follow the ladder"));
    });
    $("ldAll").addEventListener("click", function () {
        if (!ld) return;
        ld.all = true; ldDraw(null);
        outSet("ldOut", ld.names.map(function (nm, i) { return nm + " → " + ld.res[RF.ladderTrace(ld.rungs, i).end]; }).join("  ·  "));
    });

    // ── 🐯 호랑이 소리 - 녹음을 못 받을 때 쓰는 합성. 2026-10-18 홍TV님 "전혀 호랑이 같지 않아" → 다시: 목청 떨림(불규칙한 성대 박동 · 반 박자 어긋남 = 거친 소리),
    //    낮게 시작해 올랐다가 길게 내려앉는 높이, 입이 "아 → 우" 로 바뀌는 울림(포먼트), 거친 숨소리, 숲 울림(메아리) ──
    var tgIv = null, tgBuf = null;
    function roarBuffer(c) {
        var sr = c.sampleRate, dur = 2.6, n = Math.floor(sr * dur), d = new Float32Array(n);
        function f0(t) {   // 높이(Hz): 95 → 0.35초 160 → 0.9초 175 → 끝 62
            return t < 0.35 ? 95 + (160 - 95) * t / 0.35 : t < 0.9 ? 160 + 15 * (t - 0.35) / 0.55 : 175 - (175 - 62) * Math.pow((t - 0.9) / (dur - 0.9), 0.8);
        }
        function env(t) {   // 세기: 빠르게 치솟고 0.7초에 한 번 더 부풀었다가 길게 잦아듦
            var a = t < 0.12 ? t / 0.12 : 1;
            var swell = 1 + 0.35 * Math.exp(-Math.pow((t - 0.7) / 0.25, 2));
            var rel = t > 1.3 ? Math.exp(-(t - 1.3) * 2.2) : 1;
            return a * swell * rel;
        }
        var ph = 0, k = 0, jit = 0, amp = 1, t = 0;
        for (var i2 = 0; i2 < n; i2++) {
            t = i2 / sr;
            var f = f0(t) * (1 + jit);
            ph += f / sr;
            if (ph >= 1) {   // 성대 한 번 닫힘 - 다음 박동은 높이 · 세기가 조금씩 어긋남(지터 · 쉬머), 하나 걸러 약하게(아래 배음 - 으르렁)
                ph -= 1; k++;
                jit = Math.max(-0.12, Math.min(0.12, jit * 0.7 + (Math.random() - 0.5) * 0.09));
                var rough = 0.25 + 0.35 * Math.exp(-Math.pow((t - 0.8) / 0.5, 2));
                amp = (0.75 + Math.random() * 0.5) * (k % 2 ? 1 - rough : 1);
            }
            var g = ph < 0.55 ? Math.sin(Math.PI * ph / 0.55) : 0;   // 성대가 열린 동안만 소리(펄스)
            var pulse = (ph < 0.55 ? Math.cos(Math.PI * ph / 0.55) : 0) * amp;   // 흐름의 변화(밝은 버즈)
            var breath = (Math.random() * 2 - 1) * (0.35 + 0.5 * g);
            d[i2] = (pulse * 0.9 + breath * 0.45) * env(t);
        }
        var b = c.createBuffer(1, n, sr);
        b.copyToChannel ? b.copyToChannel(d, 0) : b.getChannelData(0).set(d);
        return b;
    }
    function forestVerb(c) {   // 숲 울림 - 잦아드는 잡음(1.2초)
        var n = Math.floor(c.sampleRate * 1.2), b = c.createBuffer(2, n, c.sampleRate);
        for (var ch = 0; ch < 2; ch++) { var x = b.getChannelData(ch); for (var i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
        var v = c.createConvolver(); v.buffer = b; return v;
    }
    // 실제 녹음(sounds/tiger-roar.mp3 - freesound 811790 eZZin 성난 암호랑이, CC0 · 종 표시 없음, sounds/README.md)이 있으면 그것을 먼저. 못 받으면 합성(2026-10-18)
    var tgRec = null, tgRecTried = false;
    function loadRec(c, cb) {
        if (tgRecTried) return cb();
        tgRecTried = true;
        fetch("sounds/tiger-roar.mp3").then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
            .then(function (ab) { return new Promise(function (ok, no) { c.decodeAudioData(ab, ok, no); }); })
            .then(function (b) { tgRec = b; cb(); }, function () { cb(); });
    }
    function roar() {
        var c = audio();
        if (!c) return toast(T("이 브라우저는 소리를 낼 수 없습니다", "This browser cannot play sound"));
        if (!tgRecTried) return loadRec(c, roar);
        if (tgRec) {
            var rs = c.createBufferSource(), rg = c.createGain();
            rs.buffer = tgRec; rg.gain.value = 1;
            rs.connect(rg); rg.connect(c.destination);
            rs.start(c.currentTime + 0.02);
            return;
        }
        tgBuf = tgBuf || roarBuffer(c);
        var t0 = c.currentTime + 0.05, src = c.createBufferSource(), mix = c.createGain(), comp = c.createDynamicsCompressor(), dry = c.createGain(), wet = c.createGain(), verb = forestVerb(c);
        src.buffer = tgBuf;
        src.playbackRate.value = 0.94 + Math.random() * 0.12;   // 울 때마다 조금 다르게
        // 입 울림(포먼트) 셋 - 입을 크게 벌렸다(아) 오므림(우): F1 350 → 700 → 380, F2 1100 → 1300 → 800
        [[350, 700, 380, 6, 1.0], [1100, 1300, 800, 7, 0.55], [2500, 2600, 2300, 9, 0.22]].forEach(function (fm) {
            var bp = c.createBiquadFilter(), g = c.createGain();
            bp.type = "bandpass"; bp.Q.value = fm[3];
            bp.frequency.setValueAtTime(fm[0], t0);
            bp.frequency.linearRampToValueAtTime(fm[1], t0 + 0.45);
            bp.frequency.linearRampToValueAtTime(fm[2], t0 + 2.4);
            g.gain.value = fm[4] * 3;
            src.connect(bp); bp.connect(g); g.connect(mix);
        });
        var body = c.createBiquadFilter(); body.type = "lowpass"; body.frequency.value = 260; body.Q.value = 1.2;   // 가슴 울림(낮은 소리)
        var bg = c.createGain(); bg.gain.value = 1.3;
        src.connect(body); body.connect(bg); bg.connect(mix);
        var shaper = c.createWaveShaper(), curve = new Float32Array(2048);
        for (var i = 0; i < 2048; i++) { var x = i / 1024 - 1; curve[i] = Math.tanh(2.2 * x); }
        shaper.curve = curve;
        mix.gain.value = 0.6;
        mix.connect(shaper);
        dry.gain.value = 1; wet.gain.value = 0.35;
        shaper.connect(dry); shaper.connect(verb); verb.connect(wet);
        dry.connect(comp); wet.connect(comp); comp.connect(c.destination);
        src.start(t0);
    }
    function tgStop() {
        clearInterval(tgIv); tgIv = null;
        $("tgLoop").classList.remove("on");
        $("tgLoop").textContent = T("🔁 계속", "🔁 Keep roaring");
    }
    $("tgOne").addEventListener("click", roar);
    $("tgLoop").addEventListener("click", function () {
        if (tgIv) return tgStop();
        // 녹음(0.9초)이면 2초마다, 합성(2.6초)이면 4초마다(2026-10-18 PC: 녹음은 짧아 3초쯤 조용했음).
        // 간격은 울릴 때마다 다시 봄 - 첫 클릭 때는 녹음을 받는 중이라(tgRec 없음) 첫 간격만 4초가 되던 것(2026-10-18 PC)
        var last = Date.now();
        roar();
        tgIv = setInterval(function () { if (Date.now() - last >= (tgRec ? 2000 : 4000)) { last = Date.now(); roar(); } }, 100);
        this.classList.add("on");
        this.textContent = T("⏹ 멈춤", "⏹ Stop");
    });
    // ── 🗓 공휴일 · 다음 연휴(api/holiday - 한국천문연구원) ──
    var holCache = {};
    [TODAY[0], TODAY[0] + 1].forEach(function (y) { $("holYear").add(new Option(EN ? String(y) : y + "년", y)); });
    function md(d) { var p = d.split("-"); return ymdText([+p[0], +p[1], +p[2]]); }
    var HOL_EN = { "1월1일": "New Year's Day", "신정": "New Year's Day", "설날": "Seollal (Lunar New Year)", "삼일절": "Independence Movement Day", "어린이날": "Children's Day",
        "부처님오신날": "Buddha's Birthday", "석가탄신일": "Buddha's Birthday", "현충일": "Memorial Day", "제헌절": "Constitution Day", "노동절": "Labor Day", "근로자의날": "Labor Day", "광복절": "Liberation Day", "추석": "Chuseok", "개천절": "National Foundation Day",
        "한글날": "Hangeul Day", "기독탄신일": "Christmas Day", "대체공휴일": "Substitute holiday", "임시공휴일": "Temporary holiday" };
    function holName(n) { return !EN ? n : HOL_EN[n] || (/^대체공휴일/.test(n) ? "Substitute holiday" : /선거/.test(n) ? "Election day" : n); }
    function holDraw(j) {
        $("holRuns").innerHTML = ""; $("holList").innerHTML = "";
        if (!j || j.unavailable || !(j.days || []).length) return outSet("holOut", T("지금은 공휴일을 받을 수 없습니다", "Holidays are not available right now"));
        var t = RF.dayNo(TODAY[0], TODAY[1], TODAY[2]), next = null;
        j.days.forEach(function (h) {
            var p = h.date.split("-"), n = RF.dayNo(+p[0], +p[1], +p[2]);
            if (!next && n >= t) next = h;
            var li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("b");
            sp.textContent = holName(h.name);
            b.textContent = md(h.date);
            if (n < t) li.style.opacity = "0.45";
            li.appendChild(sp); li.appendChild(b);
            $("holList").appendChild(li);
        });
        if (next) { var q = next.date.split("-"); outSet("holOut", T("다음 공휴일 ", "Next holiday: ") + holName(next.name) + " " + RF.dDay(TODAY, [+q[0], +q[1], +q[2]]), md(next.date)); }
        else outSet("holOut", T("올해 남은 공휴일이 없습니다", "No more holidays this year"));
        RF.holidayRuns(j.days.map(function (h) { return h.date; })).forEach(function (r) {
            if (r.to < TODAY.map(function (x, i) { return i ? String(x).padStart(2, "0") : x; }).join("-")) return;
            var li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("b");
            sp.textContent = "🏖 " + T(r.days + "일 연휴", r.days + "-day break");
            b.textContent = md(r.from) + " ~ " + md(r.to).replace(/^\d{4}년 |^\d{4}-/, "");
            li.appendChild(sp); li.appendChild(b);
            $("holRuns").appendChild(li);
        });
    }
    function holLoad() {
        var y = $("holYear").value;
        if (holCache[y]) return holDraw(holCache[y]);
        outSet("holOut", T("공휴일을 받는 중…", "Loading holidays…"));
        fetch("api/holiday?year=" + y).then(function (r) { return r.json(); }).then(function (j) { if (!j.unavailable) holCache[y] = j; holDraw(j); })
            .catch(function () { outSet("holOut", T("공휴일을 받지 못했습니다 - 인터넷을 확인해 주세요", "Could not load holidays - check your connection")); });
    }
    $("holYear").addEventListener("change", holLoad);
    $("t-hol").addEventListener("toggle", function () { if (this.open) holLoad(); });
    if ($("t-hol").open) holLoad();

    // ── ⛽ 기름값(api/fuel - 오피넷). 고른 종류 · 시도만 이 기기에 기억 ──
    var fuSt = { prod: "B027", sido: "" };
    try { var fu0 = JSON.parse(lsGet("rf-fuel") || "null"); if (fu0 && fu0.prod) fuSt = fu0; } catch (e) { /* 처음 */ }
    $("fuProd").value = fuSt.prod;
    function won1(x) { return x == null ? "-" : T(fmtNum(Math.round(x)) + "원", fmtNum(Math.round(x)) + " won"); }
    function fuLoad() {
        outSet("fuOut", T("기름값을 받는 중…", "Loading prices…"));
        $("fuLow").innerHTML = "";
        fetch("api/fuel?prod=" + fuSt.prod + (fuSt.sido ? "&sido=" + fuSt.sido : "")).then(function (r) { return r.json(); }).then(function (j) {
            if (!j || j.unavailable) return outSet("fuOut", T("지금은 기름값을 받을 수 없습니다", "Fuel prices are not available right now"));
            var sel = $("fuSido");
            if (sel.options.length < 2 && (j.sido || []).length) {
                j.sido.forEach(function (x) { if (x.code && x.code !== "00") sel.add(new Option(x.name, x.code)); });
                sel.value = fuSt.sido;
            }
            var nat = (j.national || []).filter(function (x) { return x.prod === fuSt.prod; })[0], sd = (j.sido || []).filter(function (x) { return x.code === fuSt.sido; })[0];
            var big = sd ? sd.name + " " + won1(sd.price) : T("전국 ", "Korea ") + won1(nat && nat.price);
            var small = (sd && nat ? T("전국 ", "Korea ") + won1(nat.price) + " · " : "") + (nat && nat.diff != null ? T("전날보다 ", "vs yesterday ") + (nat.diff > 0 ? "+" : "") + fmtNum(nat.diff, 2) + " · " : "")
                + T("리터당 · 오피넷 ", "per liter · Opinet ") + (j.date || "");
            outSet("fuOut", big, small);
            (j.low || []).forEach(function (x, i) {
                var li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("b"), a = document.createElement("a");
                a.href = "https://map.kakao.com/link/search/" + encodeURIComponent(x.addr || x.name || "");   // 주소로(2026-10-18 PC: 이름에 다른 지역이 든 곳 - "창원금천지점" 이 서울 금천구)
                a.target = "_blank"; a.rel = "noopener";
                a.textContent = (i + 1) + ". " + (x.name || "-");
                a.style.color = "var(--sky)";
                sp.appendChild(a);
                var sm = document.createElement("small");
                sm.textContent = " " + [x.brand, x.addr].filter(Boolean).join(" · ");
                sm.style.display = "block";
                sp.appendChild(sm);
                b.textContent = won1(x.price);
                li.appendChild(sp); li.appendChild(b);
                $("fuLow").appendChild(li);
            });
            if (fuSt.sido && !(j.low || []).length) $("fuLow").innerHTML = "";
        }).catch(function () { outSet("fuOut", T("기름값을 받지 못했습니다 - 인터넷을 확인해 주세요", "Could not load prices - check your connection")); });
    }
    function fuKeep() { try { localStorage.setItem("rf-fuel", JSON.stringify(fuSt)); } catch (e) { /* 이번만 */ } }
    $("fuProd").addEventListener("change", function () { fuSt.prod = this.value; fuKeep(); fuLoad(); });
    $("fuSido").addEventListener("change", function () { fuSt.sido = this.value; fuKeep(); fuLoad(); });
    $("t-fuel").addEventListener("toggle", function () { if (this.open) fuLoad(); });
    if ($("t-fuel").open) fuLoad();

    // ── 🌊 물때(api/tide - 국립해양조사원 조석예보 고 · 저조). 지점 목록은 data/tide-stations.json(TideStationProbe 가 실제 응답으로 만듦) ──
    var tdSt = { obs: "DT_0018" }, tdStations = null;
    try { var td0 = JSON.parse(lsGet("rf-tide") || "null"); if (td0 && td0.obs) tdSt = td0; } catch (e) { /* 처음 */ }
    for (var di = 0; di < 7; di++) {
        var dd = RF.dateAdd(TODAY, di), iso = dd[0] + "-" + String(dd[1]).padStart(2, "0") + "-" + String(dd[2]).padStart(2, "0"), lu = RF.toLunar(dd);
        $("tdDay").add(new Option((di === 0 ? T("오늘 ", "Today ") : di === 1 ? T("내일 ", "Tomorrow ") : "") + ymdText(dd) + (lu && !EN ? " · 음력 " + (lu.leap ? "윤" : "") + lu.m + "." + lu.d : ""), iso));
    }
    function tdKeep() { try { localStorage.setItem("rf-tide", JSON.stringify(tdSt)); } catch (e) { /* 이번만 */ } }
    function tdLoad() {
        if (!tdStations) return;
        outSet("tdOut", T("물때를 받는 중…", "Loading tides…"));
        $("tdList").innerHTML = "";
        fetch("api/tide?obs=" + encodeURIComponent(tdSt.obs) + "&date=" + $("tdDay").value).then(function (r) { return r.json(); }).then(function (j) {
            if (!j || j.unavailable) return outSet("tdOut", T("지금은 물때를 받을 수 없습니다", "Tides are not available right now"));
            if (!(j.tides || []).length) return outSet("tdOut", T("이 날은 자료가 없습니다", "No data for this day"));
            var now = Date.now(), nextShown = $("tdDay").selectedIndex !== 0;   // 다음 물때(하늘색)는 오늘을 볼 때만(2026-10-18 PC)
            j.tides.forEach(function (x) {
                var li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("b");
                var hhmm = String(x.t).slice(11, 16), at = Date.parse(String(x.t).replace(" ", "T") + ":00+09:00");
                sp.textContent = (x.high ? T("🌊 만조(고조)", "🌊 High tide") : T("🏖 간조(저조)", "🏖 Low tide"));
                b.textContent = hhmm + " · " + (x.cm != null ? Math.round(x.cm) + "cm" : "-");
                if (!nextShown && at > now) { li.style.color = "var(--sky)"; nextShown = true; }
                else if (at < now) li.style.opacity = "0.45";
                li.appendChild(sp); li.appendChild(b);
                $("tdList").appendChild(li);
            });
            var st = tdStations.filter(function (s) { return s.code === tdSt.obs; })[0];
            outSet("tdOut", (j.name || (st && st.name) || tdSt.obs) + T(" 물때", " tides"), $("tdDay").options[$("tdDay").selectedIndex].text);
        }).catch(function () { outSet("tdOut", T("물때를 받지 못했습니다 - 인터넷을 확인해 주세요", "Could not load tides - check your connection")); });
    }
    function tdInit(cb) {
        if (tdStations) return cb && cb();
        fetch("data/tide-stations.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (l) {
            tdStations = l.filter(function (s) { return s && s.code && s.name; });
            if (!tdStations.length) throw new Error("empty");
            tdStations.forEach(function (s) { $("tdObs").add(new Option(s.name, s.code)); });
            if (!tdStations.some(function (s) { return s.code === tdSt.obs; })) tdSt.obs = tdStations[0].code;
            $("tdObs").value = tdSt.obs;
            if (cb) cb(); else tdLoad();
        }).catch(function () { outSet("tdOut", T("물때 지점 목록을 준비 중입니다", "The station list is being prepared")); });
    }
    $("tdObs").addEventListener("change", function () { tdSt.obs = this.value; tdKeep(); tdLoad(); });
    $("tdDay").addEventListener("change", tdLoad);
    $("tdNear").addEventListener("click", function () {
        tdInit(function () {
            here(function () {
                var best = null, bd = Infinity;
                tdStations.forEach(function (s) { var d = RF.distM ? RF.distM(loc.lat, loc.lon, s.lat, s.lon) : Math.hypot(loc.lat - s.lat, (loc.lon - s.lon) * Math.cos(loc.lat * Math.PI / 180)); if (d < bd) { bd = d; best = s; } });
                if (!best) return;
                tdSt.obs = best.code; $("tdObs").value = best.code; tdKeep(); tdLoad();
                if (RF.distM) toast(best.name + T(" · 약 ", " · about ") + Math.round(bd / 1000) + "km");
            });
        });
    });
    $("t-tide").addEventListener("toggle", function () { if (this.open) { if (tdStations) tdLoad(); else tdInit(); } });
    if ($("t-tide").open) tdInit();

    $("t-tiger").addEventListener("toggle", function () { if (!this.open) tgStop(); });

    // ── 🔔 곰 방울(합성 - 녹음 아님): 놋쇠 방울을 흔드는 소리 - 서로 어긋난 높은 배음이 짧게 울리고 사라짐. "걸으며" 는 걸음 박자로 흔들림 ──
    var blTimer = null;
    function bellHit(c, t0, vol) {
        var f = 2050 * (0.96 + Math.random() * 0.08), out = c.createGain();
        out.gain.value = vol;
        out.connect(c.destination);
        [[1, 1, 0.9], [2.32, 0.55, 0.55], [4.25, 0.32, 0.32], [6.63, 0.16, 0.2]].forEach(function (h) {   // [배음 비, 세기, 사라지는 시간(초)] - 종 · 방울은 배음이 정수배가 아님
            var o = c.createOscillator(), g = c.createGain();
            o.type = "sine";
            o.frequency.value = f * h[0];
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(h[1], t0 + 0.004);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + h[2]);
            o.connect(g); g.connect(out);
            o.start(t0); o.stop(t0 + h[2] + 0.05);
        });
    }
    function bellShake(c, t0) {   // 한 번 흔들면 방울 속 구슬이 두세 번 부딪힘
        var n = 2 + rand(2), t = t0;
        for (var i = 0; i < n; i++) { bellHit(c, t, (i ? 0.35 : 0.55) * (0.8 + Math.random() * 0.4)); t += 0.045 + Math.random() * 0.06; }
    }
    function blStop() {
        clearTimeout(blTimer); blTimer = null;
        $("blWalk").classList.remove("on");
        $("blWalk").textContent = T("🚶 걸으며 계속", "🚶 Ring as I walk");
    }
    $("blOne").addEventListener("click", function () {
        var c = audio();
        if (!c) return toast(T("이 브라우저는 소리를 낼 수 없습니다", "This browser cannot play sound"));
        bellShake(c, c.currentTime + 0.02);
    });
    $("blWalk").addEventListener("click", function () {
        if (blTimer) return blStop();
        var c = audio();
        if (!c) return toast(T("이 브라우저는 소리를 낼 수 없습니다", "This browser cannot play sound"));
        (function step() {   // 걸음마다(0.45 ~ 0.75초) 한 번씩 흔들림
            bellShake(c, c.currentTime + 0.02);
            blTimer = setTimeout(step, 450 + rand(300));
        })();
        this.classList.add("on");
        this.textContent = T("⏹ 멈춤", "⏹ Stop");
    });
    $("t-bell").addEventListener("toggle", function () { if (!this.open) blStop(); });

    // ── 🏔 요들 외침 · 메아리(합성). 가슴 소리(낮음)와 가성(높음)을 빠르게 넘나듦 - 넘어갈 때 목소리가 살짝 꺾임. "아" 입 울림 ──
    var ydEcho = true, ydBufs = {};
    // 🌴 정글 외침(2026-10-18 홍TV님 "타잔 소리" - 영화 외침은 녹음 저작권 · 소리 상표라 그대로 흉내 내지 않고, 길게 "아~" 한 뒤 가슴 소리 · 가성을 빠르게 오가는 일반 요들 외침)
    var JUNGLE = [[196, 0.55], [392, 0.11], [262, 0.11], [415, 0.11], [262, 0.11], [415, 0.11], [262, 0.11], [440, 0.5], [294, 0.11], [466, 0.11], [294, 0.11], [494, 0.85]];
    var YODEL = [[220, 0.42], [440, 0.16], [330, 0.16], [440, 0.16], [330, 0.16], [440, 0.16], [330, 0.16], [554, 0.75], [440, 0.2], [330, 0.55]];   // [높이 Hz, 길이 초]
    function yodelBuffer(c, YODEL) {
        var sr = c.sampleRate, total = YODEL.reduce(function (a, b) { return a + b[1]; }, 0) + 0.15, n = Math.floor(sr * total), d = new Float32Array(n);
        var ph = 0, seg = 0, segT = 0, prevF = YODEL[0][0], vib = 0;
        for (var i = 0; i < n; i++) {
            var t = i / sr;
            while (seg < YODEL.length - 1 && t >= segT + YODEL[seg][1]) { prevF = YODEL[seg][0]; segT += YODEL[seg][1]; seg++; }
            var into = t - segT, target = YODEL[seg][0];
            var f = into < 0.035 ? prevF + (target - prevF) * (into / 0.035) : target;   // 35ms 안에 넘어감(꺾임)
            vib += 2 * Math.PI * 5.5 / sr;
            f *= 1 + (into > 0.2 ? 0.012 * Math.sin(vib) : 0);   // 긴 음에만 떨림(비브라토)
            ph += f / sr;
            if (ph >= 1) ph -= 1;
            var high = target > 300;
            var open = high ? 0.7 : 0.5;   // 가성은 성대가 오래 열려 부드럽고 숨이 섞임
            var pulse = ph < open ? Math.cos(Math.PI * ph / open) : 0;
            var breath = (Math.random() * 2 - 1) * (high ? 0.12 : 0.05);
            var crack = into < 0.035 ? 0.55 : 1;   // 넘어가는 순간 소리가 살짝 빠짐
            var env = Math.min(1, t / 0.05) * Math.min(1, (total - 0.15 - t) / 0.25 + 0.0001);
            d[i] = (pulse * (high ? 0.7 : 1) + breath) * crack * Math.max(0, env);
        }
        var b = c.createBuffer(1, n, sr);
        b.getChannelData(0).set(d);
        return b;
    }
    function yodelPlay(name) {
        var c = audio();
        if (!c) return toast(T("이 브라우저는 소리를 낼 수 없습니다", "This browser cannot play sound"));
        var ydBuf = ydBufs[name] = ydBufs[name] || yodelBuffer(c, name === "jungle" ? JUNGLE : YODEL);
        var t0 = c.currentTime + 0.03, src = c.createBufferSource(), mix = c.createGain(), out = c.createGain();
        src.buffer = ydBuf;
        [[800, 5, 1.0], [1200, 6, 0.6], [2600, 8, 0.3]].forEach(function (fm) {   // "아" 입 울림
            var bp = c.createBiquadFilter(), g = c.createGain();
            bp.type = "bandpass"; bp.frequency.value = fm[0]; bp.Q.value = fm[1];
            g.gain.value = fm[2] * 2.5;
            src.connect(bp); bp.connect(g); g.connect(mix);
        });
        var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600; var lg = c.createGain(); lg.gain.value = 0.5;
        src.connect(lp); lp.connect(lg); lg.connect(mix);
        mix.connect(out); out.gain.value = 0.8; out.connect(c.destination);
        if (ydEcho) {   // 건너편 산에서 되돌아오는 메아리 - 0.45초 뒤, 점점 작게
            var dl = c.createDelay(2), fb = c.createGain(), eg = c.createGain(), hp = c.createBiquadFilter();
            dl.delayTime.value = 0.45; fb.gain.value = 0.42; eg.gain.value = 0.5;
            hp.type = "lowpass"; hp.frequency.value = 1800;   // 멀리서 오면 높은 소리가 줄어듦
            mix.connect(dl); dl.connect(hp); hp.connect(fb); fb.connect(dl); hp.connect(eg); eg.connect(c.destination);
        }
        src.start(t0);
    }
    $("ydOne").addEventListener("click", function () { yodelPlay("yodel"); });
    $("ydJungle").addEventListener("click", function () { yodelPlay("jungle"); });
    $("ydEcho").addEventListener("change", function () { ydEcho = this.checked; });   // 체크 칸(2026-10-18 홍TV님: "켬 · 끔" 단추가 계속 울리는 것처럼 헷갈림)
})();
