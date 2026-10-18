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
        out.style.display = "block";
        $("pcBox").style.display = "none";
        $("pcBtn").textContent = T("🔍 다른 주소 찾기", "🔍 Find another address");
        out.scrollIntoView({ block: "nearest" });
    }
    $("pcBtn").addEventListener("click", function () {
        loadPostcode(function () {
            var box = $("pcBox");
            box.innerHTML = "";
            box.style.display = "block";
            $("pcOut").style.display = "none";
            new window.daum.Postcode({ oncomplete: showAddr, width: "100%", height: "100%" }).embed(box, { autoClose: false });
        });
    });

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

    // ── 접기 · 펼치기: 펼친 칸만 이 기기에 기억 ──
    var opened = {};
    try { opened = JSON.parse(lsGet("rf-tools-open") || "{}") || {}; } catch (e) { opened = {}; }
    Array.prototype.forEach.call(document.querySelectorAll("details.tool"), function (d) {
        if (opened[d.id]) d.open = true;
        d.addEventListener("toggle", function () {
            opened[d.id] = d.open;
            try { localStorage.setItem("rf-tools-open", JSON.stringify(opened)); } catch (e) { /* 이번만 */ }
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
    function ageDraw() {
        var a = RF.ageInfo(ageGet(), TODAY), out = $("ageOut");
        out.innerHTML = "";
        if (!a) { out.textContent = T("오늘 뒤의 날짜입니다", "That date is in the future"); return; }
        out.appendChild(document.createTextNode(EN ? "Age " + a.man : "만 " + a.man + "세"));
        var sm = document.createElement("small");
        sm.textContent = EN ? "Korean year age " + a.year + " · Year of the " + a.ddi + " · " + (a.nextDays === 0 ? "Happy birthday today! 🎉" : a.nextDays + (a.nextDays === 1 ? " day" : " days") + " to your next birthday")
            : "연 나이 " + a.year + "세 · " + a.ddi + "띠 · " + (a.nextDays === 0 ? "오늘 생일이에요 🎉" : "다음 생일까지 " + a.nextDays + "일");
        out.appendChild(sm);
    }
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
            D.requestPermission().then(function (p) { if (p === "granted") start(); else toast(T("방향 센서 허락이 필요합니다", "Allow motion & orientation access")); }).catch(function () { toast(T("방향 센서를 켜지 못했습니다", "Could not start the compass")); });
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
    function stopAll() { whStop(); ltStop(); }
    window.addEventListener("pagehide", stopAll);
})();
