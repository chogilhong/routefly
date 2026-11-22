/*
 * 기록 보기(trip.html, 2026-11-22 홍TV님 "램블러 화면 같은 것을 만들어줘 - gpx 저장한 것을 열어볼 수 있게, 사진 등 클릭하면 옆에 보이게, 확대하면 사진만").
 * 코스 모음 "📂 GPX 열기" 로 들어와 📂 GPX 열기(RF.gpxRecord - 💾 GPX 파일 저장의 사진 · 메모 · 요약까지).
 * 왼쪽 지도: 지나온 선 · 출발(초록) · 도착(빨강) · 사진(보라 📷) · 메모(파랑 📝) 표시, 아래 고도 · 속도 그래프(RF.profile).
 * 오른쪽(폰은 아래): 사진 · 메모 카드 - 표시를 누르면 그 카드가 주황 테두리로 보이게 넘어가고, 카드를 누르면 지도가 그 자리로. 🔍 는 사진만 크게(‹ › · 화살표 키).
 * 모두 이 기기 안에서만(서버로 보내지 않음). 지도는 V-World 지도 + 지형 음영(위성 아님), 출처 표시 그대로.
 */
(function () {
    "use strict";
    var RF = window.RF;
    function $(id) { return document.getElementById(id); }
    var LANG = RF.pageLang(location.search, (function () { try { return localStorage.getItem("rf-lang"); } catch (e) { return null; } })());
    var EN = LANG === "en", T = RF.tr, NM = RF.nameIn;
    RF.setLang(LANG);
    if (EN) { document.documentElement.lang = "en"; document.title = "routefly - View record"; RF.applyEn(document); }

    var map = null, cfgP = null, marks = [], cards = [], urls = [], items = [], pick = -1, prof = null, rc = null;
    var vector = false, peakKeys = [], PEAK_NEAR_M = 150;
    // 공단 대피소 · 100대 명산 정상(늘 보임, RF.famousMarks)과 겹치는 OSM 것(300m 안)은 숨김 - 두 번 그리지 않게
    var fam = null, famGj = null, famSet = false, dropPeaks = [], dropHuts = [], SAME_M = 300;
    var SEG_NEAR_M = 200, SEG_GAP_M = 300, PICK_NEAR_M = 300, popup = null;   // 구간 끊는 곳(선에서 200m 안 · 300m 넘게 떨어진 것만) · 누른 곳 찾기   // 우리 지도일 때 기록이 지나간 봉우리(150m 안)
    // 표시별 보이기 · 숨기기(2026-11-22 홍TV님 "마커 별로 숨기고 보이고") - 이 화면 동안만(저장하지 않음)
    var KINDS = [["photo", "📷", "사진", "Photos"], ["memo", "📝", "메모", "Notes"], ["rf-hut", "🏠", "대피소 · 산장", "Shelters · huts"],
        ["rf-temple", "卍", "절", "Temples"], ["rf-view", "👁", "전망대", "Viewpoints"], ["rf-water", "💧", "약수터", "Drinking water"]];
    var hidden = {};
    var CONTOUR_KEY = "rf-contour", contourOn = false, demContour = null, contourCfg = null;   // 등고선 - 따라가기와 같은 기억(rf-contour) · 간격 · 색
    try { contourOn = localStorage.getItem(CONTOUR_KEY) === "1"; } catch (e) { /* 기본 끔 */ }

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) { return r.ok ? r.json() : {}; });
    }
    function two(n) { return (n < 10 ? "0" : "") + n; }
    /** 한국 시각 "2026. 11. 20. 11:33". */
    function when(t) { var d = new Date(t + 9 * 3600000); return d.getUTCFullYear() + ". " + (d.getUTCMonth() + 1) + ". " + d.getUTCDate() + ". " + two(d.getUTCHours()) + ":" + two(d.getUTCMinutes()); }
    function hm(ms) { var m = Math.round(ms / 60000); return Math.floor(m / 60) + T("시간 ", "h ") + (m % 60) + T("분", "m"); }

    function clear() {
        marks.forEach(function (m) { m.remove(); });
        urls.forEach(function (u) { URL.revokeObjectURL(u); });
        marks = []; cards = []; urls = []; items = []; pick = -1;
        if (popup) { popup.remove(); popup = null; }
        $("side").innerHTML = "";
    }

    /** 기록 하나 그리기. photoUrl(id) → 약속(그림 주소 | null). */
    function show(rec, photoUrl) {
        clear();
        rc = RF.recordCourse(rec);
        if (rc.lat.length < 2) { $("side").innerHTML = "<p class=\"empty\">" + T("점이 모자라 그릴 수 없습니다.", "Not enough points to draw.") + "</p>"; return; }
        $("title").textContent = NM(rec.name) || T("기록 보기", "View record");
        document.title = (NM(rec.name) || "") + T(" - routefly 기록 보기", " - routefly record");
        $("stat").textContent = (rec.start != null ? when(rec.start) + " · " : "") + RF.km(rc.total) + " km" + (rec.start != null && rec.end != null && rec.end > rec.start ? " · " + hm(rec.end - rec.start) : "")
            + (rec.up != null ? T(" · 오른 높이 ", " · climb ") + RF.num(rec.up) + " m" : rc.asc && rc.asc.length ? T(" · 오르막 ", " · ascent ") + RF.num(rc.asc[rc.asc.length - 1]) + " m" : "");
        prof = RF.profile($("prof"), rc, { speed: RF.speedProfile(rc), labels: false });
        var narrow = window.matchMedia && window.matchMedia("(max-width: 760px)").matches;   // 폰 세로는 그래프가 지도를 많이 가려 접어 두고 📈 단추로
        $("graph").hidden = narrow; $("graphBtn").hidden = !narrow;
        placeKit();
        items = (rec.notes || []).map(function (n, i) { return { n: n, d: rc.pois[i] ? rc.pois[i].dist_m : null, url: null }; });
        if (!items.length) $("side").innerHTML = "<p class=\"empty\">" + T("이 기록에는 사진 · 메모가 없습니다.", "This record has no photos or notes.") + "</p>";
        items.forEach(function (it, i) {
            var card = document.createElement("div"), ph = document.createElement("div"), tx = document.createElement("div"), tm = document.createElement("div");
            card.className = "card";
            tm.className = "tm";
            tm.textContent = [it.n.t != null ? when(it.n.t) : "", it.d != null ? T("출발부터 ", "from start ") + RF.km(it.d) + " km" : "", it.n.ele != null ? T("해발 ", "elev. ") + RF.num(it.n.ele) + " m" : ""]
                .filter(Boolean).join(" · ");
            tx.className = "tx";
            tx.appendChild(tm);
            if (it.n.text) tx.appendChild(document.createTextNode(it.n.text));
            if (it.n.photo) {
                ph.className = "ph";
                card.appendChild(ph);
                photoUrl(it.n.photo).then(function (u) {
                    if (!u) return;
                    it.url = u; urls.push(u);
                    var im = new Image(), z = document.createElement("button");
                    im.src = u; im.alt = it.n.text || T("사진", "Photo"); im.loading = "lazy";
                    z.type = "button"; z.className = "zoom"; z.textContent = "🔍"; z.title = T("사진만 크게", "Photo only, full screen"); z.setAttribute("aria-label", z.title);
                    z.onclick = function (e) { e.stopPropagation(); big(i); };
                    ph.appendChild(im); ph.appendChild(z);
                });
            }
            card.appendChild(tx);
            card.onclick = function () { select(i, true, false); };
            // 카드에 마우스를 올리면 지도 위 그 표시도 주황으로 크게(2026-11-22 홍TV님 "사진에 마우스가 가면 거꾸로 지도상의 카메라가 활성화")
            card.addEventListener("mouseenter", function () { if (it.mark) it.mark.getElement().classList.add("hover"); });
            card.addEventListener("mouseleave", function () { if (it.mark) it.mark.getElement().classList.remove("hover"); });
            $("side").appendChild(card);
            cards.push(card);
        });
        cfgP.then(function () {
            var line = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: rc.lon.map(function (x, k) { return [x, rc.lat[k]]; }) } };
            var draw = function () {
                if (map.getSource("trk")) map.getSource("trk").setData(segData());
                else {
                    map.addSource("trk", { type: "geojson", data: segData() });
                    // 우리 지도는 글자(봉우리 · 마을 이름) 층 아래에 그어 선이 이름을 덮지 않게(2026-11-22 홍TV님 - 세석 · 촛대봉 이름이 선 밑에 깔렸음). V-World 그림 바탕에는 글자 층이 없음
                    var under = firstSymbol();
                    map.addLayer({ id: "trk-halo", type: "line", source: "trk", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#fff", "line-width": 8, "line-opacity": 0.8 } }, under);
                    map.addLayer({ id: "trk", type: "line", source: "trk", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["coalesce", ["get", "color"], "#5b45ff"], "line-width": 4.5 } }, under);   // 구간 색(segData)
                }
                peakKeys = [];
                markPeaks();
                var b = new maplibregl.LngLatBounds();
                line.geometry.coordinates.forEach(function (q) { b.extend(q); });
                map.fitBounds(b, { padding: 50, duration: 0, maxZoom: 15 });
            };
            if (map.loaded()) draw(); else map.once("load", draw);
            [[0, "#2fb344"], [rc.lat.length - 1, "#ff5c5c"]].forEach(function (e) {
                var d = document.createElement("div");
                d.className = "end"; d.style.background = e[1];
                marks.push(new maplibregl.Marker({ element: d }).setLngLat([rc.lon[e[0]], rc.lat[e[0]]]).addTo(map));
            });
            items.forEach(function (it, i) {
                var d = document.createElement("div");
                d.className = "pin" + (it.n.photo ? "" : " memo");
                d.textContent = it.n.photo ? "📷" : "📝";
                d.title = (it.n.t != null ? when(it.n.t) : "") + (it.n.text ? " · " + it.n.text : "");
                d.addEventListener("click", function (e) { e.stopPropagation(); select(i, false, true); });
                it.mark = new maplibregl.Marker({ element: d, anchor: "bottom" }).setLngLat([it.n.lon, it.n.lat]).addTo(map);
                marks.push(it.mark);
            });
            kindBar();
            placeKit();
            if (map.loaded()) applyKinds(); else map.once("load", applyKinds);
        });
    }

    /** 우리 지도 아이콘(RF.MAP_ICONS) 하나를 캔버스로 그려 넣음 - 흰 테 동그라미 + 흰 글자. 모르는 이름이면 그냥 둠. */
    function iconImage(id) {
        var ic = RF.MAP_ICONS[id];
        if (!ic || map.hasImage(id)) return;
        var r = window.devicePixelRatio > 1 ? 2 : 1, n = 22 * r, cv = document.createElement("canvas"), g = cv.getContext("2d");
        cv.width = cv.height = n;
        g.beginPath(); g.arc(n / 2, n / 2, n / 2 - r, 0, Math.PI * 2);
        g.fillStyle = ic[0]; g.fill(); g.lineWidth = 1.5 * r; g.strokeStyle = "#fff"; g.stroke();
        g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineWidth = 1.6 * r;
        var c = n / 2, u = r;   // 가운데 · 1단위(22칸 기준)
        g.beginPath();
        if (ic[1] === "house") {   // 지붕 세모 + 몸통 네모
            g.moveTo(c, c - 6 * u); g.lineTo(c + 6 * u, c); g.lineTo(c + 4 * u, c); g.lineTo(c + 4 * u, c + 5 * u); g.lineTo(c - 4 * u, c + 5 * u); g.lineTo(c - 4 * u, c); g.lineTo(c - 6 * u, c); g.closePath(); g.fill();
        } else if (ic[1] === "drop") {   // 물방울
            g.moveTo(c, c - 6 * u); g.bezierCurveTo(c + 5 * u, c, c + 5 * u, c + 5 * u, c, c + 5 * u); g.bezierCurveTo(c - 5 * u, c + 5 * u, c - 5 * u, c, c, c - 6 * u); g.fill();
        } else if (ic[1] === "eye") {   // 눈(전망)
            g.ellipse(c, c, 6.5 * u, 3.8 * u, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(c, c, 2 * u, 0, Math.PI * 2); g.fill();
        } else {
            g.font = "bold " + (13 * r) + "px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ic[1], c, c + u);
        }
        map.addImage(id, g.getImageData(0, 0, n, n), { pixelRatio: r });
    }

    /** 이 기록 · 이 지도에 있는 표시 종류만 단추로(사진 · 메모는 있을 때, 대피소 등은 우리 지도일 때) + 모두 숨기기 · 보이기. */
    function kindBar() {
        var bar = $("kinds"), has = { photo: items.some(function (it) { return it.n.photo; }), memo: items.some(function (it) { return !it.n.photo; }) };
        bar.innerHTML = "";
        var list = KINDS.filter(function (k) { return k[0] === "photo" || k[0] === "memo" ? has[k[0]] : vector; });
        bar.hidden = !list.length;
        list.forEach(function (k) {
            var b = document.createElement("button"), on = !hidden[k[0]], name = T(k[2], k[3]);
            b.type = "button"; b.className = "kind" + (on ? "" : " off"); b.textContent = k[1];
            b.title = (on ? T("숨기기: ", "Hide: ") : T("보이기: ", "Show: ")) + name;
            b.setAttribute("aria-label", name); b.setAttribute("aria-pressed", on ? "true" : "false");
            b.onclick = function () { hidden[k[0]] = on; applyKinds(); kindBar(); };
            bar.appendChild(b);
        });
        if (!list.length) return;
        var any = list.some(function (k) { return !hidden[k[0]]; }), all = document.createElement("button");
        all.type = "button"; all.className = "all";
        all.textContent = any ? T("모두 숨기기", "Hide all") : T("모두 보이기", "Show all");
        all.onclick = function () { list.forEach(function (k) { hidden[k[0]] = any; }); applyKinds(); kindBar(); };
        bar.appendChild(all);
    }

    /** 숨긴 종류를 지도에 반영 - 사진 · 메모 표시는 감추고, 대피소 등은 poi-hike 층 거름으로. */
    function applyKinds() {
        items.forEach(function (it) { if (it.mark) it.mark.getElement().style.display = hidden[it.n.photo ? "photo" : "memo"] ? "none" : ""; });
        if (map && map.getLayer("poi-hike")) {
            map.setFilter("poi-hike", RF.poiShowFilter(map.getLayoutProperty("poi-hike", "icon-image"), Object.keys(hidden).filter(function (k) { return hidden[k] && /^rf-/.test(k); }), dropHuts));
        }
        if (map && map.getLayer("rf-hut")) map.setLayoutProperty("rf-hut", "visibility", hidden["rf-hut"] ? "none" : "visible");   // 🏠 단추는 공단 대피소도
    }

    /** 첫 글자 층 id(없으면 undefined - 맨 위에 그음). */
    function firstSymbol() {
        var ls = (map.getStyle() && map.getStyle().layers) || [];
        for (var i = 0; i < ls.length; i++) if (ls[i].type === "symbol") return ls[i].id;
        return undefined;
    }

    /** 지금 받아 둔 지도 조각에서 기록이 지나간 봉우리를 찾아 "peak-on"(크게)으로 - 새 조각이 올 때마다(idle) 더함. */
    function markPeaks() {
        if (!vector || !map.getLayer("peak-on")) return;
        putMarks();
        var pts = function (layer) {
            return map.querySourceFeatures("omt", { sourceLayer: layer }).map(function (f) {
                var g = f.geometry && f.geometry.coordinates;
                return g ? { name: f.properties.name, ele: f.properties.ele, cls: f.properties["class"], sub: f.properties.subclass, lon: g[0], lat: g[1] } : null;
            }).filter(Boolean);
        };
        var feats = pts("mountain_peak"), more = function (have, add) { return add.filter(function (k) { return have.indexOf(k) < 0; }); };
        var addOn = rc ? more(peakKeys, RF.peaksNear(feats, rc.lat, rc.lon, PEAK_NEAR_M)) : [], addDrop = [], addHut = [];
        if (fam) {
            fam.peaks.forEach(function (p) {   // 같은 이름의 OSM 봉우리만(옆 봉우리는 그대로)
                addDrop = addDrop.concat(more(dropPeaks.concat(addDrop), RF.peaksNear(feats.filter(function (f) { return f.name === p.name; }), [p.lat], [p.lon], SAME_M)));
            });
            var huts = pts("poi").filter(function (f) { return (f.cls === "lodging" && f.sub === "alpine_hut") || f.cls === "shelter"; });   // 이름이 달라도(로타리 · 로터리) 자리로
            addHut = more(dropHuts, RF.peaksNear(huts, fam.huts.map(function (h) { return h.lat; }), fam.huts.map(function (h) { return h.lon; }), SAME_M)
                .map(function (k) { return k.slice(0, k.lastIndexOf("|")); }));
        }
        if (addOn.length || addDrop.length) {
            peakKeys = peakKeys.concat(addOn); dropPeaks = dropPeaks.concat(addDrop);
            map.setFilter("peak-on", RF.peakOnFilter(peakKeys, true, dropPeaks));
            map.setFilter("peak", RF.peakOnFilter(peakKeys, false, dropPeaks));
        }
        if (addHut.length) { dropHuts = dropHuts.concat(addHut); applyKinds(); }
    }

    /** 기록 선 - 우리 지도에서 공단 대피소 · 100대 명산 정상 자료가 있으면 그곳(선에서 200m 안)에서 끊어 구간마다 다른 색, 없으면 한 색. */
    function segData() {
        if (!rc) return { type: "FeatureCollection", features: [] };
        if (fam) return RF.trackSegments(rc, fam.huts.concat(fam.peaks), SEG_NEAR_M, SEG_GAP_M);
        return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: rc.lon.map(function (x, k) { return [x, rc.lat[k]]; }) } };
    }

    /**
     * 봉우리 · 대피소 · 절 등을 누르면(2026-11-23 홍TV님 "봉들 대피소를 클릭하면 카메라처럼 그래프에 위치 표시") 기록 위 가장 가까운 자리를 그래프에 표시하고
     * 이름 · 출발부터 거리 · 해발을 작은 창으로. 선에서 멀면(PICK_NEAR_M 넘음) 이름과 "이 기록에서 떨어짐" 만.
     */
    function pickPlace(e) {
        var f = e.features && e.features[0];
        if (!f || !rc) return;
        var g = f.geometry.coordinates, nm = String(f.properties.name || f.properties.label || "").replace(/^▲ /, "").split("\n")[0];
        var q = RF.snap(rc, g[1], g[0]), box = document.createElement("div"), b = document.createElement("b"), t = document.createElement("div");
        b.textContent = nm;
        box.appendChild(b); box.appendChild(t);
        if (q && q.off <= PICK_NEAR_M) {
            var p = RF.at(rc, q.d);
            t.textContent = T("출발부터 ", "from start ") + RF.km(q.d) + " km" + (p.ele != null ? T(" · 기록 해발 ", " · recorded elev. ") + RF.num(Math.round(p.ele)) + " m" : "");
            if (prof) prof.set(q.d);
        } else t.textContent = T("이 기록에서 떨어진 곳", "Away from this record");
        if (popup) popup.remove();
        popup = new maplibregl.Popup({ closeButton: false, offset: 12, className: "placePop" }).setLngLat(g).setDOMContent(box).addTo(map);
    }

    /** 받아 둔 표시를 지도 marks 에 한 번(지도 모양이 준비된 뒤 - 자료가 먼저 오면 다음 idle 에). */
    function putMarks() {
        if (famSet || !famGj || !map.getSource("marks")) return;
        famSet = true;
        map.getSource("marks").setData(famGj);
        if (map.getSource("trk")) map.getSource("trk").setData(segData());   // 자료가 늦게 오면 그때 구간 색으로
    }

    /**
     * 공단 대피소 · 100대 명산 정상 자료를 지도를 만들 때 바로 받음(우리 지도일 때 한 번). 못 받으면 그냥 OSM 것만.
     * 지도 "load" 는 모든 조각(지형 등)을 받은 뒤라 늦어 쓰지 않음(2026-11-22: 늦게 받으면 멀리 본 첫 화면에 안 나왔음).
     */
    function loadMarks() {
        var j = function (u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }); };
        Promise.all([j("data/mountains100.json"), j("data/peak-elev.json"), j("data/knps-shelters.json")]).then(function (d) {
            var gj = RF.famousMarks(d[0] && d[0].peaks, d[1] && d[1].elev, d[2] && d[2].shelters);
            fam = { peaks: [], huts: [] };
            gj.features.forEach(function (f) { var c = f.geometry.coordinates; fam[f.properties.kind === "hut" ? "huts" : "peaks"].push({ name: f.properties.name, lon: c[0], lat: c[1] }); });
            famGj = gj;
            if (map.isStyleLoaded()) markPeaks();
        }).catch(function () { /* 자료가 없으면 OSM 것만 */ });
    }

    /**
     * 등고선 켜기 · 끄기(2026-11-22 홍TV님 "등고선을 보이고 안 보이고") - 따라가기(hike.js setContour)와 같은 지형 타일 · 간격(RF.CONTOUR_STEPS) · 색(RF.contourPaint),
     * 켠 것은 같은 기억(rf-contour). 기록 선 · 글자 아래에 그음.
     */
    function setContour(on) {
        contourOn = !!on;
        try { localStorage.setItem(CONTOUR_KEY, contourOn ? "1" : "0"); } catch (e) { /* 기억 못 해도 됨 */ }
        if (contourOn && !map.getSource("contours") && window.mlcontour) {
            if (!demContour) {
                demContour = new mlcontour.DemSource({ url: contourCfg.demUrl, encoding: "terrarium", maxzoom: contourCfg.vworldKey && !vector ? 12 : 15, worker: true });
                demContour.setupMaplibre(maplibregl);
            }
            map.addSource("contours", { type: "vector", maxzoom: 15, tiles: [demContour.contourProtocolUrl({
                thresholds: RF.CONTOUR_STEPS, overzoom: 1, contourLayer: "contours", elevationKey: "ele", levelKey: "level" })] });
            var cp = RF.contourPaint(true);   // 기록 보기 바탕은 둘 다 밝음(우리 지도 · V-World 일반 지도)
            map.addLayer({ id: "contours", type: "line", source: "contours", "source-layer": "contours", minzoom: 11,
                paint: { "line-color": cp.color, "line-opacity": cp.opacity, "line-width": ["match", ["get", "level"], 1, 1.4, 0.7] } },
                map.getLayer("trk-halo") ? "trk-halo" : firstSymbol());
        }
        if (map.getLayer("contours")) map.setLayoutProperty("contours", "visibility", contourOn ? "visible" : "none");
        var b = $("contourBtn");
        if (!b) return;
        b.classList.toggle("on", contourOn);
        b.setAttribute("aria-pressed", contourOn ? "true" : "false");
        b.title = contourOn ? T("등고선 끄기", "Hide contour lines") : T("등고선 켜기(가까이 보면 20m 간격)", "Show contour lines (20 m apart when zoomed in)");
        b.setAttribute("aria-label", b.title);
    }

    /** 지도 오른쪽 위 단추 묶음에 〰️ 등고선 단추(MapLibre 단추 모양). */
    function contourControl() {
        return {
            onAdd: function () {
                var g = document.createElement("div"), b = document.createElement("button");
                g.className = "maplibregl-ctrl maplibregl-ctrl-group";
                b.type = "button"; b.id = "contourBtn"; b.textContent = "〰️";
                b.addEventListener("click", function () { setContour(!contourOn); });
                g.appendChild(b);
                return g;
            },
            onRemove: function () { /* 이 화면에서는 떼지 않음 */ }
        };
    }

    /** 사진 · 메모 하나를 고름 - 지도 표시 주황 · 카드 주황 테두리, fly(카드를 누름)면 지도를 그리로, scroll(표시를 누름)이면 카드를 보이게. */
    function select(i, fly, scroll) {
        if (pick >= 0 && items[pick]) { cards[pick].classList.remove("on"); if (items[pick].mark) items[pick].mark.getElement().classList.remove("on"); }
        pick = i;
        var it = items[i];
        cards[i].classList.add("on");
        if (it.mark) it.mark.getElement().classList.add("on");
        if (scroll) cards[i].scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (fly && map) map.easeTo({ center: [it.n.lon, it.n.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
        if (prof && it.d != null) prof.set(it.d);
    }

    /** 사진만 크게(사진 있는 것끼리 ‹ › 로 넘김). */
    function big(i) {
        var it = items[i];
        if (!it || !it.url) return;
        select(i, false, false);
        $("bigImg").src = it.url;
        $("bigCap").textContent = (it.n.t != null ? when(it.n.t) : "") + (it.n.text ? " · " + it.n.text : "");
        $("big").style.display = "flex";
    }
    function step(k) {
        for (var j = pick + k; j >= 0 && j < items.length; j += k) if (items[j].url) { big(j); return; }
    }
    function bigClose() { $("big").style.display = "none"; $("bigImg").removeAttribute("src"); }
    $("bigClose").onclick = bigClose;
    $("bigPrev").onclick = function () { step(-1); };
    $("bigNext").onclick = function () { step(1); };
    $("bigImg").onclick = bigClose;
    document.addEventListener("keydown", function (e) {
        if ($("big").style.display !== "flex") return;
        if (e.key === "Escape") bigClose(); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
    });
    $("graphClose").onclick = function () { $("graph").hidden = true; $("graphBtn").hidden = false; placeKit(); };
    $("graphBtn").onclick = function () { $("graph").hidden = false; $("graphBtn").hidden = true; placeKit(); };
    /** 표시 단추 줄 · 로고(mapKit)를 열린 그래프와 겹치지 않게 - 좌우로 겹치면 그래프 위로, 아니면 CSS 자리(왼쪽 아래). */
    function placeKit() {
        var k = $("mapKit"), g = $("graph");
        k.style.bottom = "";
        if (g.hidden) return;
        var kr = k.getBoundingClientRect(), gr = g.getBoundingClientRect();
        if (kr.right > gr.left && kr.left < gr.right && kr.bottom > gr.top) k.style.bottom = (g.parentNode.getBoundingClientRect().bottom - gr.top + 8) + "px";
    }
    window.addEventListener("resize", placeKit);

    // 지도(V-World 지도 + 지형 음영 - 위성은 쓰지 않음). 우리 바탕 지도 파일(map.basemap.url)이 설정되면 그것(2026-11-22 바탕 지도 2단계 - 기록 보기만 먼저)
    // 파일이 아직 서버에 없거나(404) 못 읽으면 V-World 바탕으로(2026-11-22 PC: 설정이 파일보다 먼저 들어가 운영 기록 보기가 바탕 없이 지형 음영만 보였음)
    cfgP = getJson("api/map-config").catch(function () { return {}; }).then(function (c) {
        var cfg = { demUrl: c.demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: c.vworldKey || null };
        if (!c.basemapUrl || !window.pmtiles) return { cfg: cfg, style: null };
        var url = new URL(c.basemapUrl, location.href).href, file = new pmtiles.PMTiles(url), proto = new pmtiles.Protocol();
        return file.getHeader().then(function () {
            proto.add(file);   // 머리를 읽은 그 파일을 지도도 씀(머리를 두 번 받지 않음)
            maplibregl.addProtocol("pmtiles", proto.tile);   // 파일 하나에서 필요한 조각만 Range 로 받음
            return { cfg: cfg, style: RF.vectorStyle({ basemapUrl: url, demUrl: cfg.demUrl }, new URL("vendor/fonts/", location.href).href) };
        }, function () { return { cfg: cfg, style: null }; });
    }).then(function (o) {
        var cfg = o.cfg, style = o.style;
        vector = !!style; contourCfg = cfg;
        map = new maplibregl.Map({ container: "map", style: style || RF.baseStyle(cfg), center: [127.8, 36.3], zoom: 6.5, locale: RF.mapLocale(), attributionControl: false,
            localIdeographFontFamily: "'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" });   // 한글 지명은 폰 글꼴로
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        if (window.mlcontour) map.addControl(contourControl(), "top-right");
        // 우리 지도는 바탕 출처에 "© OpenStreetMap contributors" 가 이미 있어 한 번만(2026-11-22 PC: 두 번 보였음). V-World 바탕일 때는 여기서 붙임
        map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: (style ? "" : "© OpenStreetMap contributors | ") + "<a href=\"" + T("about.html", "about-en.html") + "\">" + T("안내", "About") + "</a>" }), "top-right");
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
        // 출처는 ⓘ 로 접어 둠(노선 · 탐방 안내도와 같게 - 폰에서 펼친 출처가 사진 표시를 가렸음), ⓘ 를 누르면 보임
        var fold = function () { var at = document.querySelector(".maplibregl-ctrl-attrib"); if (at) at.classList.remove("maplibregl-compact-show"); };
        fold();
        map.once("load", function () { fold(); setContour(contourOn); });
        if (vector) loadMarks();
        map.on("idle", markPeaks);
        map.on("styleimagemissing", function (e) { iconImage(e.id); });
        if (vector) {
            var PLACES = ["rf-peak", "rf-hut", "peak-on", "peak", "poi-hike"];
            PLACES.forEach(function (id) {
                map.on("click", id, pickPlace);
                map.on("mouseenter", id, function () { map.getCanvas().style.cursor = "pointer"; });
                map.on("mouseleave", id, function () { map.getCanvas().style.cursor = ""; });
            });
        }   // 대피소 · 절 등 아이콘(우리 지도 poi-hike)   // 지도 조각이 더 오면 지나간 봉우리를 더 찾음
        return map;
    });

    /** 이 기기의 IndexedDB 에서 하나 읽기(따라가기와 같은 저장소 · 이름) - 없거나 못 읽으면 null. */
    function idbGet(name, store, key) {
        return new Promise(function (resolve) {
            if (!window.indexedDB) { resolve(null); return; }
            var r = indexedDB.open(name, 1);
            r.onupgradeneeded = function () { r.result.createObjectStore(store); };   // 따라가기와 같은 모양(처음이면 빈 저장소)
            r.onerror = function () { resolve(null); };
            r.onsuccess = function () {
                var db = r.result;
                try {
                    var q = db.transaction(store, "readonly").objectStore(store).get(key);
                    q.onsuccess = function () { db.close(); resolve(q.result == null ? null : q.result); };
                    q.onerror = function () { db.close(); resolve(null); };
                } catch (e) { db.close(); resolve(null); }
            };
        });
    }

    // 📒 내 기록의 🗺 지도로 들어옴(?rec=시작 시각|코스 - 따라가기 recKey, 2026-11-22 홍TV님): 이 기기의 기록 · 사진으로 그림, 뒤로는 따라가기 내 기록
    var recParam = new URLSearchParams(location.search).get("rec");
    if (recParam) {
        $("back").href = EN ? "hike.html?lang=en" : "hike.html";
        $("back").textContent = T("‹ 내 기록", "‹ My records");
        idbGet("rf-records", "r", "list").then(function (list) {
            if (!Array.isArray(list)) { try { list = JSON.parse(localStorage.getItem("rf-records") || "[]"); } catch (e) { list = []; } }   // 따라가기가 IndexedDB 를 못 쓸 때 남기는 곳
            var rec = list.filter(function (r) { return r && r.start + "|" + (r.courseId || "") === recParam; })[0];
            if (!rec) { $("side").innerHTML = "<p class=\"empty\">" + T("이 기기에서 그 기록을 찾지 못했습니다.", "That record is not on this device.") + "</p>"; return; }
            show(rec, function (id) {
                return idbGet("rf-photos", "p", id).then(function (blob) { return blob ? URL.createObjectURL(blob) : null; });
            });
        });
    }

    // 📂 GPX 열기 - 이 기기 안에서만 읽음
    $("openBtn").onclick = function () { $("gpxFile").value = ""; $("gpxFile").click(); };
    $("gpxFile").addEventListener("change", function () {
        var f = this.files && this.files[0];
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) { alert(T("파일이 너무 큽니다(8MB 까지).", "The file is too big (8 MB max).")); return; }
        f.text().then(function (text) {
            var got = RF.gpxRecord(text, true, f.name);   // 시각 없는 코스 GPX 도(선 · 지점 · 고도만, 속도 · 시간 없이)
            if (!got) { alert(T("GPX 에 길(점)이 없습니다.", "The GPX has no track points.")); return; }
            show(got.rec, function (id) {
                try {
                    var bin = atob(got.photos[id]), u8 = new Uint8Array(bin.length);
                    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
                    return Promise.resolve(URL.createObjectURL(new Blob([u8], { type: "image/jpeg" })));
                } catch (e) { return Promise.resolve(null); }
            });
        }).catch(function () { alert(T("파일을 읽지 못했습니다.", "Could not read the file.")); });
    });
})();
