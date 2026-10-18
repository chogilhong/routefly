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

    // ── 접기 · 펼치기: 한 칸을 펴면 다른 칸은 접음(2026-10-18 홍TV님). 펼친 칸 하나만 이 기기에 기억 ──
    var TOOLS = Array.prototype.slice.call(document.querySelectorAll("details.tool")), lastOpen = lsGet("rf-tools-open1");
    TOOLS.forEach(function (d) {
        if (d.id === lastOpen) d.open = true;
        d.addEventListener("toggle", function () {
            if (d.open) {
                TOOLS.forEach(function (o) { if (o !== d && o.open) o.open = false; });
                try { localStorage.setItem("rf-tools-open1", d.id); } catch (e) { /* 이번만 */ }
                setTimeout(function () { var r = d.getBoundingClientRect(); if (r.top < 60 || r.top > innerHeight * 0.6) window.scrollTo({ top: scrollY + r.top - 64, behavior: "smooth" }); }, 0);   // 위가 접혀 올라가도 편 칸 제목이 보이게
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
    function stopAll() { whStop(); ltStop(); tgStop(); }
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
            outSet("wxNow", loc.name + " " + sky(h) + " " + (h.tmp != null ? h.tmp + "°C" : ""), extra.join(" · ") + T(" · 기상청 ", " · KMA ") + w.base + T(" 발표", " KST"));
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
        if (w !== "") { var c = RF.windChill(+t, +w); big = c != null ? T("체감 ", "Feels like ") + c + "°C" : null; if (c == null) lines.push(T("체감온도는 10℃ 이하 · 바람 1.3m/s 이상일 때만", "Wind chill only at 10 °C or below with wind 1.3 m/s+")); }
        if (h !== "" && +t >= 20) {   // 불쾌지수는 더울 때 말(20℃ 아래는 늘 낮음)
            var d = RF.discomfort(t, h);
            if (d) { var k = [T("낮음", "low"), T("보통", "moderate"), T("높음", "high"), T("매우 높음", "very high")][d.k]; if (big) lines.unshift(T("불쾌지수 ", "Discomfort ") + d.di + " (" + k + ")"); else big = T("불쾌지수 ", "Discomfort ") + d.di + " (" + k + ")"; }
        }
        outSet("feOut", big || (+t >= 20 ? T("습도를 넣어 주세요", "Add humidity") : T("바람을 넣어 주세요(불쾌지수는 20℃ 넘을 때)", "Add wind (discomfort index is for 20 °C and above)")), lines.join(" · "));
    }
    ["feT", "feH", "feW"].forEach(function (id) { $(id).addEventListener("input", feDraw); });

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
        ld.names.forEach(function (nm, i) {
            var t = svgEl("text", { x: X(i), y: 16 });
            t.textContent = nm.length > 6 ? nm.slice(0, 6) + "…" : nm;
            t.addEventListener("click", function () { ldDraw(i); });
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
        outSet("ldOut", T("위의 이름을 누르면 사다리를 탑니다", "Tap a name to follow the ladder"));
    });
    $("ldAll").addEventListener("click", function () {
        if (!ld) return;
        ld.all = true; ldDraw(null);
        outSet("ldOut", ld.names.map(function (nm, i) { return nm + " → " + ld.res[RF.ladderTrace(ld.rungs, i).end]; }).join("  ·  "));
    });

    // ── 🐯 호랑이 소리(합성 - 녹음 아님): 낮은 톱니파가 오르내리며 떨리고(으르렁), 거친 소음을 섞음 ──
    var tgIv = null;
    function roar() {
        var c = audio();
        if (!c) return toast(T("이 브라우저는 소리를 낼 수 없습니다", "This browser cannot play sound"));
        var t0 = c.currentTime + 0.05, dur = 2.6;
        var out = c.createGain(), comp = c.createDynamicsCompressor();
        out.gain.setValueAtTime(0.0001, t0);
        out.gain.exponentialRampToValueAtTime(1, t0 + 0.35);
        out.gain.setValueAtTime(1, t0 + 1.4);
        out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        out.connect(comp); comp.connect(c.destination);
        var shaper = c.createWaveShaper(), curve = new Float32Array(1024);
        for (var i = 0; i < 1024; i++) { var x = i / 512 - 1; curve[i] = Math.tanh(3 * x); }
        shaper.curve = curve;
        var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(500, t0); lp.frequency.linearRampToValueAtTime(1100, t0 + 0.6); lp.frequency.linearRampToValueAtTime(350, t0 + dur); lp.Q.value = 4;
        shaper.connect(lp); lp.connect(out);
        [[1, 0.6], [1.5, 0.3], [2.02, 0.25]].forEach(function (h) {   // 낮은 소리 + 배음
            var o = c.createOscillator(), g = c.createGain();
            o.type = "sawtooth";
            o.frequency.setValueAtTime(70 * h[0], t0); o.frequency.linearRampToValueAtTime(125 * h[0], t0 + 0.7); o.frequency.linearRampToValueAtTime(60 * h[0], t0 + dur);
            g.gain.value = h[1];
            o.connect(g); g.connect(shaper);
            o.start(t0); o.stop(t0 + dur + 0.1);
        });
        var trem = c.createOscillator(), tg = c.createGain();   // 으르렁 떨림(초당 약 28번)
        trem.frequency.setValueAtTime(22, t0); trem.frequency.linearRampToValueAtTime(32, t0 + dur);
        tg.gain.value = 0.45;
        trem.connect(tg); tg.connect(out.gain);
        trem.start(t0); trem.stop(t0 + dur + 0.1);
        var nb = c.createBuffer(1, Math.floor(c.sampleRate * (dur + 0.1)), c.sampleRate), nd = nb.getChannelData(0), last = 0;
        for (var k = 0; k < nd.length; k++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; nd[k] = last * 3.5; }   // 거친(갈색) 소음 - 숨소리
        var ns = c.createBufferSource(), ng = c.createGain();
        ns.buffer = nb; ng.gain.value = 0.9;
        ns.connect(ng); ng.connect(shaper);
        ns.start(t0);
    }
    function tgStop() {
        clearInterval(tgIv); tgIv = null;
        $("tgLoop").classList.remove("on");
        $("tgLoop").textContent = T("🔁 계속(4초마다)", "🔁 Keep roaring");
    }
    $("tgOne").addEventListener("click", roar);
    $("tgLoop").addEventListener("click", function () {
        if (tgIv) return tgStop();
        roar();
        tgIv = setInterval(roar, 4000);
        this.classList.add("on");
        this.textContent = T("⏹ 멈춤", "⏹ Stop");
    });
    $("t-tiger").addEventListener("toggle", function () { if (!this.open) tgStop(); });
})();
