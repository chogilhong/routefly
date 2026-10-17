/*
 * 국토종주 자전거길 · 국가숲길 · 코리아둘레길 · 100대 명산 모아 보기(series.html) - data/series.json 의 노선 · 길마다 진행(인증센터 도장 · 코스 완주)과 코스 목록.
 * 도장 · 완주는 따라가기(hike.js)가 이 핸드폰의 localStorage 에 남긴 것(rf-stamps · rf-done · rf-peaks)을 읽기만 합니다. 2026-10-11 홍TV님.
 */
(function () {
    "use strict";
    var RF = window.RF;
    function $(id) { return document.getElementById(id); }
    // 화면 말(2026-10-17 홍TV님 - 영어): ?lang=en · 따라가기에서 고른 말(rf-lang, 이 기기에 기억)
    var stored = null;
    try { stored = localStorage.getItem("rf-lang"); } catch (e) { /* 없음 */ }
    var LANG = RF.pageLang(location.search, stored);
    if (/[?&]lang=(en|ko)\b/.test(location.search)) { try { localStorage.setItem("rf-lang", LANG); } catch (e) { /* 이번만 */ } }
    var EN = LANG === "en", T = RF.tr;
    RF.setLang(LANG);
    if (EN) { document.documentElement.lang = "en"; document.title = "routefly - Stamps"; RF.applyEn(document); }
    /** 이름 영어로 - 길 이름의 자전거길 · 둘레길 · 숲길 · 정맥은 영어 말로, 나머지 한글은 로마자. 한국어 화면은 그대로. */
    function NM(s) {
        if (!EN || s == null) return s;
        s = String(s).replace(/산림청 100대 명산/g, "100 Famous Mountains (Korea Forest Service)").replace(/100대 명산/g, "100 Famous Mountains")
            .replace(/자전거길/g, " bike path").replace(/둘레길/g, " Dulle-gil").replace(/숲길/g, " forest trail").replace(/트레일/g, " trail")
            .replace(/백두대간/g, "Baekdudaegan").replace(/정맥/g, "-jeongmaek").replace(/평화의 길/g, "Peace Trail");
        return RF.enName(s).replace(/\s+/g, " ").trim();
    }
    var GROUP_EN = { "국토종주 자전거길": "Cross-country bike paths", "국가숲길": "National forest trails", "코리아둘레길": "Korea Dulle-gil",
                     "100대 명산": "100 Famous Mountains", "백두대간 · 정맥": "Baekdudaegan · Jeongmaek ridges" };
    var UNIT_EN = { "인증센터": "checkpoints", "코스": "trails", "정상": "summits", "구간": "sections" };
    function gTitle(g) { return EN ? GROUP_EN[g.title] || NM(g.title) : g.title; }
    function gUnit(g) { return EN ? UNIT_EN[g.unit] || g.unit : g.unit; }
    /** 배지 이름 - "10곳" · "완등" → 영어 "10" · "All". */
    function msLabel(m) { return EN ? (m.label === "완등" ? "All" : String(m.n)) : m.label; }
    function load(key) { try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (e) { return {}; } }
    var stamps = load("rf-stamps"), done = load("rf-done"), peakStamps = load("rf-peaks");
    // 산 안내(park-notes) - 따라가기 검색 목록과 같게: 바로잡은 탐방로 이름 · "공단 가야산1코스" · 지금은 없는 탐방로 빼기(2026-10-14 홍TV님)
    var notes = null, notesP = fetch("data/park-notes.json").then(function (r) { return r.json(); })
        .then(function (d) { notes = d && d.parks; }, function () { /* 안내 없이 */ });

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
            return r.json().then(function (j) {
                if (!r.ok || !j || j.success === false) throw new Error((j && j.message) || ("HTTP " + r.status));
                return j;
            });
        });
    }

    function day(t) {
        var d = new Date(t);
        return d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate();
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    /** "fly" - 그 코스를 3D 지형 위로 날아 보는 화면(index.html), 따라가기 왼쪽(2026-10-13 홍TV님: 지웠던 미리보기 자리). 그 화면의 ← 는 이 화면으로. */
    function flyBtn(row, id) {
        var a = el("a", null, "fly(3D)");
        a.href = "index.html#c=" + encodeURIComponent(id) + "&from=series";   // 그 화면 "← 뒤로" 가 새로 고쳐도 남게(2026-10-14)
        a.title = T("3D 지형 위로 날아 보기", "Fly over the 3D terrain");
        a.addEventListener("click", function () { try { sessionStorage.setItem("rf-fly-back", "1"); } catch (e) { } });   // 3D 의 "← 뒤로" 가 이 화면으로 back
        row.appendChild(a);
    }

    /** 코스 한 줄 - 이름 · 거리 · (완주) · fly · 따라가기. */
    function courseRow(c, note) {
        var row = el("div", "row"), t = el("div", "t");
        var d = done[c.course_id];
        var name = RF.noteTrailName(notes, c.course_id, c.name), ofn = RF.officialName(notes, c.course_id);
        if (ofn && String(name).replace(/\s+/g, "").indexOf(ofn.replace(/\s+/g, "")) >= 0) ofn = "";   // 이름에 이미 든 공식 이름은 빼고(남산제일봉1코스)
        t.appendChild(document.createTextNode((d ? "✅ " : "") + RF.nameText(name)));
        t.appendChild(el("span", null, EN ? (ofn ? "Park: " + NM(ofn) + " · " : "") + RF.km(c.distance_m) + " km · climb " + RF.num(c.ascent_m) + " m"
            + (d ? " · done " + day(d.t) : "") + (note ? " · " + note : "")
            : (ofn ? "공단 " + ofn + " · " : "") + RF.km(c.distance_m) + "km · 오르막 " + RF.num(c.ascent_m) + "m"
            + (d ? " · 완주 " + day(d.t) : "") + (note ? " · " + note : "")));
        row.appendChild(t);
        flyBtn(row, c.course_id);
        var b = el("a", "main", T("따라가기", "Follow"));
        b.href = "hike.html#c=" + encodeURIComponent(c.course_id) + "&from=series";   // 따라가기의 ‹ 가 이 화면으로
        row.appendChild(b);
        return row;
    }

    /** 인증 받는 곳 한 줄 - routefly 도장 · 완주는 내 기록용이라 운영 기관 인증으로 보냄(2026-10-11 홍TV님). 묶음(g.cert) · 길(s.cert)마다. */
    function certLine(cert) {
        var line = el("div", "cert", T("공식 인증: ", "Official certificate (Korean site): ")), link = el("a", null, cert.by + " ›");
        link.href = cert.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        line.appendChild(link);
        if (cert.how && !EN) line.appendChild(el("span", null, " - " + cert.how));   // 영어 화면은 받는 법(한국어 긴 글)은 빼고 링크만
        return line;
    }

    /**
     * 점 지도(2026-10-15 홍TV님) - 100대 명산 정상 · 국토종주 인증센터를 점으로(다녀온 곳 주황 · 아직 회색). 지도 그림 없이 위치만이라 핸드폰 안에서 바로 그림.
     * items: [{lat, lon, on, label}], what: "다녀온 산" · "도장 찍은 인증센터". 점을 누르면 이름.
     */
    function dotsMap(items, what) {
        var W = 300, H = 380, NS = "http://www.w3.org/2000/svg", pts = RF.dotMap(items, W, H, 12);
        var wrap = el("div", "pmap"), svg = document.createElementNS(NS, "svg"), got = 0, cap = el("div", "tip");
        svg.setAttribute("viewBox", "0 0 " + W + " " + H);
        svg.setAttribute("role", "img");
        // 회색 먼저, 주황은 위에
        items.map(function (d, i) { return { d: d, p: pts[i] }; }).sort(function (a, b) { return a.d.on - b.d.on; }).forEach(function (x) {
            var c = document.createElementNS(NS, "circle"), t = document.createElementNS(NS, "title");
            c.setAttribute("cx", x.p[0].toFixed(1));
            c.setAttribute("cy", x.p[1].toFixed(1));
            c.setAttribute("r", x.d.on ? 5 : 3.2);
            c.setAttribute("class", x.d.on ? "on" : "");
            t.textContent = x.d.label + (x.d.on ? T(" - 도장", " - stamped") : "");
            c.appendChild(t);
            c.addEventListener("click", function () { cap.textContent = t.textContent; });
            svg.appendChild(c);
            if (x.d.on) got++;
        });
        svg.setAttribute("aria-label", EN ? what + " map: " + got : what + " " + got + "곳 지도");
        cap.textContent = EN ? what + " " + got + " / " + items.length + " (orange) · tap a dot for its name" : what + " " + got + " / " + items.length + "곳(주황) · 점을 누르면 이름";
        wrap.appendChild(svg);
        wrap.appendChild(cap);
        return wrap;
    }

    function peakMap(peaks) {
        return dotsMap(peaks.map(function (k) { return { lat: k.lat, lon: k.lon, on: !!peakStamps[RF.peakKey(k)], label: "⛰️ " + NM(k.id || k.name) }; }), T("다녀온 산", "Mountains climbed"));
    }

    /**
     * 국토종주 인증센터 지도(2026-10-15 홍TV님) - 노선마다 api/group 의 centers(이름 · 자리)를 모아 한 지도에. 묶음을 처음 펼칠 때 받음.
     * 같은 센터가 두 구간 끝에 있으면 하나로(이름).
     */
    function centerMap(g, box) {
        var wait = el("div", "tip", T("인증센터 지도를 불러오는 중…", "Loading the checkpoint map…"));
        box.insertBefore(wait, box.firstChild);
        Promise.all(g.series.filter(function (s) { return s.prefix && s.centers; }).map(function (s) {
            return getJson("api/group?prefix=" + encodeURIComponent(s.prefix)).then(function (j) { return { s: s, cs: j.centers || [] }; }, function () { return { s: s, cs: [] }; });
        })).then(function (all) {
            // series.json 의 공식 센터(카드의 수와 같게)만, 자리는 api/group 이름표에서
            var items = [], total = 0;
            all.forEach(function (r) {
                total += r.s.centers.length;
                RF.centerPoints(r.s.centers, r.s.aka, r.cs).forEach(function (p) {
                    items.push({ lat: p.lat, lon: p.lon, on: !!RF.stampOf(stamps, p.name, r.s.aka && r.s.aka[p.name]), label: EN ? "📮 " + NM(p.name) + " checkpoint · " + NM(r.s.name) : "📮 " + p.name + " 인증센터 · " + r.s.name });
                });
            });
            if (!items.length) { wait.textContent = T("인증센터 자리를 받지 못했습니다.", "Could not load checkpoint locations."); return; }
            var m = dotsMap(items, T("도장 찍은 인증센터", "Stamped checkpoints"));
            if (items.length < total) m.lastChild.textContent += EN ? " · " + (total - items.length) + " without a location are left off" : " · 자리를 못 찾은 " + (total - items.length) + "곳은 지도에서 뺌";
            box.replaceChild(m, wait);
        });
    }

    // ------------------------------------------------------------------ 🏅 100대 명산 배지 · 증서(2026-10-15 홍TV님)
    var CAP = window.Capacitor, NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
    function plugin(name) {   // 원격 주소로 띄운 앱은 registerPlugin 이 없고 Capacitor.Plugins 에 있음(2026-10-17, hike.js 와 같음)
        if (!NATIVE) return null;
        if (CAP.registerPlugin) return CAP.registerPlugin(name);
        if (CAP.isPluginAvailable && !CAP.isPluginAvailable(name)) return null;
        return CAP.Plugins && CAP.Plugins[name] || null;
    }
    var FS = plugin("Filesystem"), SHARE = plugin("Share"), CERT_NAME = "rf-cert-name";

    /** 배지 줄(10 · 30 · 50 · 70곳 · 완등) + 닿은 것 가운데 가장 높은 단계의 증서 단추. */
    function badgeBox(s) {
        var ms = RF.peakMilestones(s.peaks, peakStamps), box = el("div", "badges"), row = el("div", "brow"), got = ms.filter(function (m) { return m.t; });
        ms.forEach(function (m) {
            var b = el("div", "badge" + (m.t ? " on" : ""));
            b.appendChild(el("b", null, m.t ? "🏅" : "⚪"));
            b.appendChild(el("span", null, msLabel(m)));
            if (m.t) b.appendChild(el("small", null, day(m.t)));
            row.appendChild(b);
        });
        box.appendChild(row);
        if (!got.length) {
            box.appendChild(el("p", "dim", T("정상 10곳에 도장을 찍으면 첫 배지와 증서를 받습니다.", "Stamp 10 summits to get your first badge and certificate.")));
            return box;
        }
        var top = got[got.length - 1], form = el("div", "certForm"), name = el("input"), btn = el("button", null, EN ? "🏅 Make " + (top.label === "완등" ? "all-summits" : top.n + "-summit") + " certificate" : "🏅 " + (top.label === "완등" ? "완등 증서" : top.label + " 달성 증서") + " 만들기");
        name.type = "text";
        name.maxLength = 20;
        name.placeholder = T("증서에 넣을 이름(빈칸이면 빼고)", "Name on the certificate (optional)");
        try { name.value = localStorage.getItem(CERT_NAME) || ""; } catch (e) { /* 빈칸 */ }
        btn.type = "button";
        btn.addEventListener("click", function () {
            var who = name.value.trim();
            try { localStorage.setItem(CERT_NAME, who); } catch (e) { /* 이번만 */ }
            var n = Object.keys(peakStamps).filter(function (k) { return s.peaks.some(function (p) { return RF.peakKey(p) === k; }); }).length;
            share(certificate(top, who, n, s.peaks.length), EN ? "routefly-100-famous-mountains-" + (top.label === "완등" ? "all" : top.n) + ".png" : "routefly-100대명산-" + (top.label === "완등" ? "완등" : top.n + "곳") + ".png",
                EN ? "100 Famous Mountains - " + (top.label === "완등" ? "all summits" : top.n + " summits") + " - routefly" : "100대 명산 " + (top.label === "완등" ? "완등" : top.n + "곳 달성") + " - routefly");
        });
        form.appendChild(name);
        form.appendChild(btn);
        box.appendChild(form);
        return box;
    }

    /** 증서 그림(1080×1350). m - 배지 단계, who - 이름(빈칸 가능), n - 지금 도장 수, of - 정상 자료가 있는 산 수. */
    function certificate(m, who, n, of) {
        var W = 1080, H = 1350, cv = document.createElement("canvas");
        cv.width = W; cv.height = H;
        var g = cv.getContext("2d"), bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, "#fbf7ec"); bg.addColorStop(1, "#efe6cf");
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        g.strokeStyle = "#b08a3c"; g.lineWidth = 10; g.strokeRect(40, 40, W - 80, H - 80);
        g.lineWidth = 2; g.strokeRect(62, 62, W - 124, H - 124);
        g.fillStyle = "#3d8f4f";   // 산줄기
        g.beginPath(); g.moveTo(64, 1120);
        [[200, 1020], [330, 1080], [470, 960], [610, 1060], [760, 990], [900, 1070], [1016, 1010], [1016, 1286], [64, 1286]].forEach(function (p) { g.lineTo(p[0], p[1]); });
        g.closePath(); g.fill();
        g.textAlign = "center";
        g.font = "120px sans-serif"; g.fillText("🏅", W / 2, 250);
        g.fillStyle = "#5b4a1f"; g.font = "bold 50px sans-serif"; g.fillText(T("산림청 100대 명산", "Korea's 100 Famous Mountains"), W / 2, 360);
        g.fillStyle = "#2b2416"; g.font = "bold 96px sans-serif"; g.fillText(EN ? (m.label === "완등" ? "All summits" : m.n + " summits") : m.label === "완등" ? "완등 증서" : m.n + "곳 달성", W / 2, 490);
        g.font = "38px sans-serif"; g.fillStyle = "#4a3f28";
        var lines = EN ? ["This certifies that " + (who || "this hiker"), m.label === "완등" ? "has stood on all " + of + " summits routefly knows" : "has stood on " + m.n + " summits of the 100 Famous Mountains."]
            : [(who ? who + " 님은" : "이 산행인은"), m.label === "완등" ? "routefly 가 정상 자리를 아는 " + of + "곳의 정상을 모두 밟았기에" : "100대 명산 정상 " + m.n + "곳을 밟았기에",
            "이 증서를 드립니다."];
        lines.forEach(function (t, i) { g.fillText(t, W / 2, 620 + i * 64, W - 200); });
        g.font = "bold 44px sans-serif"; g.fillStyle = "#2b2416";
        g.fillText(EN ? "Reached " + day(m.t) + " · now " + n + " / " + of : day(m.t) + (m.label === "완등" ? " 완등" : " 달성") + " · 지금 " + n + " / " + of + "곳", W / 2, 860, W - 200);
        g.font = "28px sans-serif"; g.fillStyle = "#7a6a45";
        g.fillText(T("정상 가까이(GPS 오차에 따라 40 ~ 150m)에서 찍힌 도장(이 핸드폰 기록)", "Stamped near each summit (40 - 150 m by GPS accuracy, records on this phone)"), W / 2, 920, W - 160);
        g.font = "bold 44px sans-serif"; g.fillStyle = "#ffffff";
        g.fillText("routefly", W / 2, 1220);
        return cv;
    }

    /** 그림 보내기 - 앱은 공유 창, 브라우저는 공유(되면) 아니면 내려받기. */
    function share(cv, name, text) {
        cv.toBlob(function (blob) {
            if (!blob) return;
            if (FS && SHARE) {
                var fr = new FileReader();
                fr.onload = function () {
                    FS.writeFile({ path: name, data: String(fr.result).split(",")[1], directory: "CACHE" })
                        .then(function (r) { return SHARE.share({ title: name, text: text, files: [r.uri], dialogTitle: T("보내기", "Send") }); }).catch(function () { /* 닫음 */ });
                };
                fr.readAsDataURL(blob);
                return;
            }
            var file = new File([blob], name, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], text: text }).catch(function () { /* 닫음 */ }); return; }
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
        }, "image/png");
    }

    /** 100대 명산 - 산 목록(정상 도장)만, 코스 목록은 없음. */
    function peakCard(g, s) {
        var p = RF.seriesProgress(s, stamps, done, peakStamps);
        var box = el("div", "card"), head = el("button"), nm = el("div", "nm", NM(s.name)), pg = el("div", "pg");
        box.setAttribute("data-card", g.key + "|" + s.name);   // 따라가기에서 돌아올 때 다시 펼칠 카드(view)
        head.type = "button";
        // 정상 자료가 없는 산(천성산 · 대암산 - GPX 가 정상 쪽을 안 지남)은 빠져 있음
        nm.appendChild(el("small", null, EN ? s.peaks.length + " mountains" + (s.official > s.peaks.length ? " (of " + s.official + ", those with summit data)" : "") + " · stamped near the summit"
            : s.peaks.length + "산" + (s.official > s.peaks.length ? "(" + s.official + "곳 중 정상 자료가 있는 곳)" : "") + " · 정상 가까이 가면 도장"));
        pg.innerHTML = "<b>" + p.got + "</b> / " + p.of + " " + gUnit(g);
        head.appendChild(nm);
        head.appendChild(pg);
        var bar = el("div", "bar"), fill = el("i"), body = el("div", "body");
        fill.style.width = (p.of ? Math.round(p.got * 100 / p.of) : 0) + "%";
        bar.appendChild(fill);
        box.appendChild(head);
        box.appendChild(bar);
        box.appendChild(body);
        var loaded = false;
        head.addEventListener("click", function () {
            if (!box.classList.contains("open")) closeSiblings(box, "card");   // 노선 카드도 하나만 펼침
            box.classList.toggle("open");
            if (box.classList.contains("open")) lastCard = box;
            saveView();
            if (loaded) return;
            loaded = true;
            body.appendChild(badgeBox(s));   // 🏅 배지 · 증서(2026-10-15 홍TV님)
            body.appendChild(peakMap(s.peaks));
            s.peaks.forEach(function (k) {
                var st = peakStamps[RF.peakKey(k)], row = el("div", "row"), t = el("div", "t", (st ? "⛰️ " : "⬜ ") + NM(k.id || k.name));
                // 높이는 안 보임 - GPX 의 GPS 높이라 알려진 높이보다 20~35m 높음(2026-10-12 PC 견줌)
                var info = [k.summit && k.summit !== k.name ? NM(k.summit) : "", st ? T("도장 ", "stamped ") + day(st.t) : "",
                    s.notes && s.notes[k.id] && !EN ? s.notes[k.id] : ""].filter(Boolean).join(" · ");   // notes: 정상 대신 다른 곳에서 찍는 까닭(점봉산 - 2026-10-12)
                if (info) t.appendChild(el("span", null, info));
                row.appendChild(t);
                // 코스 - 산 이름으로 찾아 정상 2km 안에서 끝나는(시작하는) 코스만, 누르면 펼침(따라가기)
                // state: 0 안 부름 · 1 부르는 중 · 2 받음 · 3 실패(다음 누름에 바로 다시 부름 - 2026-10-12 PC: 오류 뒤 첫 누름이 닫기만 했음)
                var more = el("button", "more", T("코스 ▾", "Trails ▾")), list = el("div", "sublist"), state = 0;
                more.setAttribute("data-peak", k.id || k.name);
                list.setAttribute("data-of", k.id || k.name);
                more.type = "button";
                var setOpen = function (open) {
                    // 산마다 코스 목록도 하나만 펼침
                    if (open) Array.prototype.forEach.call(body.querySelectorAll(".sublist.open"), function (o) { if (o !== list && o._close) o._close(); });
                    list.classList.toggle("open", open);
                    more.textContent = open ? T("코스 ▴", "Trails ▴") : T("코스 ▾", "Trails ▾");
                    if (open) lastSub = list;
                    saveView();
                };
                list._close = function () { setOpen(false); };
                more.addEventListener("click", function () {
                    if (state === 1) return;
                    if (state === 2) { setOpen(!list.classList.contains("open")); return; }
                    setOpen(true);
                    state = 1;
                    list.textContent = "";
                    var wait = el("div", "tip", T("코스를 찾는 중…", "Finding trails…"));
                    list.appendChild(wait);
                    Promise.all([getJson("api/courses?q=" + encodeURIComponent(k.name)), notesP]).then(function (r) {
                        var j = r[0];
                        if (!j || !Array.isArray(j.courses)) throw new Error("코스를 읽지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
                        j.courses = j.courses.filter(function (c) { return !RF.isHiddenCourse(notes, c.course_id); });   // 가야산3코스처럼 지금은 없는 탐방로
                        wait.remove();
                        state = 2;
                        var cs = RF.peakCourses(j.courses, k, 2000).slice(0, 8);
                        if (!cs.length) list.appendChild(el("div", "tip", T("정상까지 가는 코스를 찾지 못했습니다.", "No trail to the summit found.")));
                        // 정상에 닿지 않는 코스(끝이 정상 300m 밖 - 가야산 "백운동 → 서성재")는 얼마 더 가야 하는지 적음(2026-10-14 홍TV님 검토)
                        cs.forEach(function (c) {
                            var gap = Math.min(c.end_lat != null ? RF.peakGapM(k, +c.end_lat, +c.end_lon) : Infinity,
                                               c.start_lat != null ? RF.peakGapM(k, +c.start_lat, +c.start_lon) : Infinity);
                            list.appendChild(courseRow(c, gap > 300 && isFinite(gap) ? (EN ? RF.km(gap) + " km more to the summit (off this trail)" : "정상까지 " + RF.km(gap) + "km 더(코스 밖)") : null));
                        });
                        restoreScroll();   // 받은 코스 목록이 늘어난 뒤 돌아온 자리로
                    }).catch(function (e) {
                        state = 3;
                        wait.textContent = EN ? "Could not read the trails (tap Trails ▴ again to retry)." : (e.message || "코스를 읽지 못했습니다.") + " (코스 ▴ 를 다시 누르면 다시 찾습니다)";
                    });
                });
                row.appendChild(more);
                body.appendChild(row);
                body.appendChild(list);
            });
        });
        return box;
    }

    function card(g, s) {
        if (s.peaks) return peakCard(g, s);
        var p = RF.seriesProgress(s, stamps, done);
        var box = el("div", "card"), head = el("button"), nm = el("div", "nm", NM(s.name)), pg = el("div", "pg");
        box.setAttribute("data-card", g.key + "|" + s.name);   // 따라가기에서 돌아올 때 다시 펼칠 카드(view)
        head.type = "button";
        // 코리아둘레길: 두루누비 API 가 일부 코스만 줌 - 공식 코스 수(official)를 함께 보여 "다 걸었다" 로 오해하지 않게(2026-10-12 PC)
        nm.appendChild(el("small", null, EN ? (s.ids ? s.ids.length + " " + gUnit(g) + " · " + Math.round(s.meters / 1000) + " km" + (s.official ? " (in the app, of " + s.official + " official)" : "")
            : s.km + " km" + (s.centers ? " · " + s.centers.length + " checkpoints" : " · " + s.courses + " trails"))
            : s.ids ? s.ids.length + g.unit + " · " + Math.round(s.meters / 1000) + "km" + (s.official ? " (공식 " + s.official + "코스 중 앱에 있는 것)" : "")
            : s.km + "km" + (s.centers ? " · 인증센터 " + s.centers.length + "곳" : " · " + s.courses + "코스")));
        pg.innerHTML = "<b>" + p.got + "</b> / " + p.of + " " + gUnit(g);
        head.appendChild(nm);
        head.appendChild(pg);
        var bar = el("div", "bar"), fill = el("i");
        fill.style.width = (p.of ? Math.round(p.got * 100 / p.of) : 0) + "%";
        bar.appendChild(fill);
        var body = el("div", "body");
        box.appendChild(head);
        box.appendChild(bar);
        box.appendChild(body);
        var loaded = false;
        head.addEventListener("click", function () {
            if (!box.classList.contains("open")) closeSiblings(box, "card");   // 노선 카드도 하나만 펼침
            box.classList.toggle("open");
            if (box.classList.contains("open")) lastCard = box;
            saveView();
            if (loaded) return;
            loaded = true;
            var centerRows = [];
            if (s.centers) {
                body.appendChild(el("div", "sub", T("인증센터(차례대로)", "Checkpoints (in order)")));
                s.centers.forEach(function (n) {
                    var st = RF.stampOf(stamps, n, s.aka && s.aka[n]), row = el("div", "row"), t = el("div", "t", (st ? "📮 " : "⬜ ") + (EN ? NM(n) + " checkpoint" : n + " 인증센터"));
                    if (st) t.appendChild(el("span", null, T("도장 ", "stamped ") + day(st.t)));
                    row.appendChild(t);
                    body.appendChild(row);
                    centerRows.push(row);
                });
            }
            if (s.prefix || s.q) {   // 노선 안내도 - 구간 · 코스 전체 지도(2026-10-12 홍TV님), 코리아둘레길은 이름으로(trail)
                var rl = el("a", "routemap", "🗺 " + NM(s.name) + T(" 노선 안내도 ›", " route map ›"));
                rl.href = "route.html?" + (s.prefix ? "prefix=" + encodeURIComponent(s.prefix) : "trail=" + encodeURIComponent(s.match || s.name)) + "&back=series";
                body.insertBefore(rl, body.firstChild);
            }
            if (s.cert) body.appendChild(certLine(s.cert));
            body.appendChild(el("div", "sub", T("코스", "Trails")));
            var wait = el("div", "tip", T("코스를 불러오는 중…", "Loading trails…"));
            body.appendChild(wait);
            (s.list ? Promise.resolve({ courses: s.list }) : getJson("api/group?prefix=" + encodeURIComponent(s.prefix))).then(function (j) {
                wait.remove();
                if (!j.courses.length) body.appendChild(el("div", "tip", T("아직 코스가 없습니다.", "No trails yet.")));
                // 지리산둘레길: 주천-운봉부터 걷는 차례로. 자전거길: 구간 끝 → 다음 시작으로 땅 위 차례(끊긴 묶음의 뒷번호 구간도 제자리)
                var list = s.chainFrom ? RF.chainOrder(j.courses, s.chainFrom) : s.centers ? RF.geoOrder(j.courses) : j.courses;
                list.forEach(function (c) { body.appendChild(courseRow(c)); });
                restoreScroll();
                // 인증센터마다 그 센터를 지나는 구간의 따라가기(2026-10-12 홍TV님)
                if (centerRows.length) RF.centerCourses(list, s.centers, j.centers, s.aka).forEach(function (c, i) {
                    if (!c) return;
                    flyBtn(centerRows[i], c.course_id);
                    var b = el("a", "main", T("따라가기", "Follow"));
                    b.href = "hike.html#c=" + encodeURIComponent(c.course_id) + "&from=series";   // 따라가기의 ‹ 가 이 화면으로
                    b.title = RF.nameText(c.name);
                    centerRows[i].appendChild(b);
                });
            }).catch(function (e) { wait.textContent = EN ? "Could not read the trails." : e.message || "코스를 읽지 못했습니다."; });
        });
        return box;
    }

    /** 이름으로 찾는 길(q - 코리아둘레길) · 구간 수가 없는 노선(백두대간 · 정맥)은 그리기 전에 코스 목록을 받아 수 · 길이 · 완주를 셈. 못 받으면 0 으로. */
    function loadNamed(d) {
        var named = [], files = [];
        d.groups.forEach(function (g) {
            g.series.forEach(function (s) {
                // 백두대간 · 정맥: 공식 구간 수가 없어 앱에 있는 구간(api/group)으로 셈
                if (s.q || (s.prefix && s.courses == null && !s.centers)) named.push(s);
                if (s.summits) files.push(s);
            });
        });
        // 100대 명산: 정상 목록 파일(summits)을 받아 둠. 못 받거나 비면 그 묶음을 안 보임
        var peaksReady = files.map(function (s) {
            return fetch(s.summits).then(function (r) { return r.json(); }).then(function (j) { s.peaks = (j && j.peaks) || []; }, function () { s.peaks = []; });
        });
        return Promise.all(peaksReady.concat(named.map(function (s) {
            var url = s.q ? "api/courses?q=" + encodeURIComponent(s.q) : "api/group?prefix=" + encodeURIComponent(s.prefix);
            return getJson(url).then(function (j) { return j.courses; }, function () { return []; }).then(function (all) {
                s.list = s.q ? RF.trailCourses(all, s.match || s.name) : all;
                s.ids = s.list.map(function (c) { return c.course_id; });
                s.meters = s.list.reduce(function (m, c) { return m + (+c.distance_m || 0); }, 0);
            });
        }))).then(function () { return d; });
    }

    // 등산 · 걷기 · 자전거 → 묶음(국토종주 자전거길 …) → 노선 · 길 차례로 접었다 펼침, 처음엔 모두 접힘(2026-10-13 홍TV님: 전부 펼쳐 보이지 말고)
    var KINDS = [{ key: "hike", title: T("⛰️ 등산", "⛰️ Hiking") }, { key: "walk", title: T("🥾 걷기", "🥾 Walking") }, { key: "bike", title: T("🚴 자전거", "🚴 Cycling") }];
    var OPEN_KEY = "rf-series-open";
    var opened = load(OPEN_KEY);   // 이 핸드폰에서 펼쳐 둔 칸 - 다시 들어와도 그대로(못 읽으면 모두 접힘)
    /** 같은 부모 안 같은 단계(cls)의 펼친 칸을 접음 - 칸마다 _close 가 있으면 그것으로(기억도 지움). */
    function closeSiblings(box, cls) {
        var p = box.parentNode;
        if (!p) return;
        Array.prototype.forEach.call(p.children, function (o) {
            if (o === box || !o.classList.contains(cls) || !o.classList.contains("open")) return;
            if (o._close) o._close(); else o.classList.remove("open");
        });
    }

    function fold(cls, key, title, sum) {
        var box = el("section", "fold " + cls), head = el("button", "fh"), body = el("div", "fb");
        head.type = "button";
        head.appendChild(el("span", "ft", title));
        if (sum) head.appendChild(el("span", "fs", sum));
        head.appendChild(el("span", "fa", "▾"));
        head.setAttribute("aria-expanded", "false");
        var set = function (on) {
            box.classList.toggle("open", on);
            head.setAttribute("aria-expanded", on ? "true" : "false");
        };
        set(!!opened[key]);
        box._close = function () { set(false); delete opened[key]; };
        head.addEventListener("click", function () {
            var on = !box.classList.contains("open");
            // 하나를 펼치면 같은 단계의 다른 칸은 접음(2026-10-13 홍TV님: 100대 명산을 펼친 채 백두대간 · 정맥을 누르면 100대 명산은 접힘)
            if (on) closeSiblings(box, "fold");
            set(on);
            if (on) opened[key] = 1; else delete opened[key];
            try { localStorage.setItem(OPEN_KEY, JSON.stringify(opened)); } catch (e) { }
        });
        box.appendChild(head);
        box.appendChild(body);
        return { box: box, body: body };
    }

    // 따라가기로 갔다가 "‹ 도장 · 완주" 로 돌아오면 그 상태 그대로 - 펼친 카드 · 산의 코스 목록 · 스크롤(2026-10-13 홍TV님).
    // 이 탭 동안만(sessionStorage). 단계 칸(등산 · 걷기 …)은 위 opened 가 기억
    var VIEW_KEY = "rf-series-view", view = null, restoring = false, lastCard = null, lastSub = null;
    try { view = JSON.parse(sessionStorage.getItem(VIEW_KEY) || "null"); } catch (e) { view = null; }
    function saveView() {
        if (restoring) return;
        // 마지막으로 펼친 카드 · 목록(문서의 첫 번째가 아님 - 접힌 등산 칸 안에 열린 100대 명산 카드가 잡혔음, 2026-10-13 PC)
        var cardEl = lastCard && lastCard.classList.contains("open") ? lastCard : null,
            subEl = lastSub && lastSub.classList.contains("open") && cardEl && cardEl.contains(lastSub) ? lastSub : null;
        var v = { card: cardEl && cardEl.getAttribute("data-card"), y: window.scrollY || 0,
                  peak: subEl && subEl.getAttribute("data-of") };
        try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch (e) { }
    }
    var scrollT = null;
    window.addEventListener("scroll", function () { clearTimeout(scrollT); scrollT = setTimeout(saveView, 200); });
    // 떠날 때(pagehide)는 스크롤이 이미 0 으로 읽혀 - 따라가기를 누르는 순간에 남김
    document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("a")) saveView(); }, true);
    function restoreScroll() {
        if (view && view.y && !userScrolled) window.scrollTo(0, view.y);
    }
    var userScrolled = false;
    ["touchstart", "wheel", "keydown"].forEach(function (ev) { window.addEventListener(ev, function () { userScrolled = true; }, { passive: true }); });
    function restoreView() {
        if (!view) return;
        restoring = true;
        var cardEl = view.card && Array.prototype.filter.call(document.querySelectorAll(".card"), function (e) { return e.getAttribute("data-card") === view.card; })[0];
        if (cardEl && !cardEl.classList.contains("open")) cardEl.querySelector("button").click();
        if (cardEl && view.peak) {
            var b = Array.prototype.filter.call(cardEl.querySelectorAll("[data-peak]"), function (e) { return e.getAttribute("data-peak") === view.peak; })[0];
            if (b) b.click();
        }
        restoring = false;
        restoreScroll();
    }

    getJson("data/series.json").catch(function () {
        return fetch("data/series.json").then(function (r) { return r.json(); });
    }).then(loadNamed).then(function (d) {
        var list = $("list");
        list.textContent = "";
        KINDS.forEach(function (k) {
            var gs = d.groups.filter(function (g) {
                g.series = g.series.filter(function (s) { return !s.summits || s.peaks.length; });
                return (g.kind || "walk") === k.key && g.series.length;
            });
            if (!gs.length) return;
            var kf = fold("kind", "k:" + k.key, k.title, gs.map(gTitle).join(" · "));
            list.appendChild(kf.box);
            gs.forEach(function (g) {
                var got = 0, of = 0;
                g.series.forEach(function (s) { var p = RF.seriesProgress(s, stamps, done, peakStamps); got += p.got; of += p.of; });
                var gf = fold("group", "g:" + g.key, g.icon + " " + gTitle(g), EN ? g.series.length + " · " + gUnit(g) + " " + got + " / " + of : g.series.length + "개 · " + g.unit + " " + got + " / " + of);
                kf.body.appendChild(gf.box);
                if (g.cert) gf.body.appendChild(certLine(g.cert));
                g.series.forEach(function (s) { gf.body.appendChild(card(g, s)); });
                if (g.series.some(function (s) { return s.centers; })) {   // 국토종주 - 묶음을 처음 펼칠 때 인증센터 지도
                    var drawn = false, go = function () { if (!drawn && gf.box.classList.contains("open")) { drawn = true; centerMap(g, gf.body); } };
                    gf.box.querySelector(".fh").addEventListener("click", function () { setTimeout(go, 0); });
                    go();
                }
            });
        });
        restoreView();
    }).catch(function () { $("list").textContent = T("목록을 읽지 못했습니다.", "Could not load the list."); });
})();

// 글자 크기 "가+" - 위 줄 오른쪽(2026-10-14 홍TV님, 같은 설정이 모든 화면에)
(function () { var top = document.getElementById("top"); if (top && window.RF && RF.textButton) top.appendChild(RF.textButton()); })();
