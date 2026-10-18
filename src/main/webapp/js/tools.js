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
})();
