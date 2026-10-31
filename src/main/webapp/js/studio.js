/*
 * GPX 편집(studio.html, 2026-10-31 홍TV님 "/routefly/studio.html · GPX 편집 - PC 가 주 무대, 폰에서도. 작업해줘") - 관리자 기기만.
 * 길(track)은 [위도, 경도, 시각ms|null, 높이|null] 점 배열. 읽기 · 요약 · 나누기 · 잇기 · 쓰기는 course-kit(RF.gpxTracks 등 - node 시험).
 * 파일은 이 기기 안에서만 다루고, 서버로는 "⬆ 코스로" 때 선 모양 · 이름만(/api/course-upload - 운영자 기기만 받음).
 */
(function () {
    "use strict";
    var RF = window.RF, D = window.RFDialog;
    function $(id) { return document.getElementById(id); }
    function ask(t, o) { return D ? D.confirm(t, o) : Promise.resolve(confirm(t)); }
    function askText(t, v, o) { return D ? D.prompt(t, v, o) : Promise.resolve(prompt(t, v)); }
    var msgTimer = 0;
    function msg(t, ms) { var m = $("msg"); m.textContent = t; m.style.display = "block"; clearTimeout(msgTimer); msgTimer = setTimeout(function () { m.style.display = "none"; }, ms || 4000); }
    var COLORS = ["#ff922b", "#a9e34b", "#f783ac", "#ffd43b", "#9775fa", "#63e6be", "#ff8787"];
    var tracks = [], sel = -1, undo = [], map = null, mapOk = false, preview = null, hoverAt = null, basemap = "sat", hasSat = false;

    function km(m) { return RF.km(m); }
    function hms(ms) {
        var s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
        return h + ":" + (m < 10 ? "0" : "") + m;
    }
    function cur() { return tracks[sel] || null; }
    /** 되돌리기 - 고치기 전 목록 전체(나누기 · 잇기로 늘거나 준 길도 함께, 점 배열은 고칠 때 새로 만들어 그대로 둬도 됨). */
    function push() { undo.push({ sel: sel, list: tracks.map(function (x) { return { name: x.name, track: x.track, color: x.color }; }) }); if (undo.length > 30) undo.shift(); $("undoBtn").disabled = false; }

    // ---- 관리자 기기인가(/api/course-upload GET - 운영자 쿠키)
    fetch("api/course-upload", { headers: { Accept: "application/json" }, cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.owner) throw new Error("not owner");
        $("gate").hidden = true;
        $("app").hidden = false;
        startMap();
    }).catch(function () {
        $("gate").innerHTML = "<p>GPX 편집은 지금 관리자 기기에서만 쓸 수 있습니다.</p><p class=\"tip\">관리자는 안내 화면 제목을 7번 눌러 통계를 한 번 열면 이 기기가 관리자 기기가 됩니다.</p>";
    });

    // ---- 지도(따라가기와 같은 바탕: V-World 위성 · 밝은 지도 + 지형 음영, 키가 없으면 지형 음영만)
    function style(cfg) {
        var dem = { type: "raster-dem", tiles: [cfg.demUrl], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: "지형: Terrain Tiles (AWS Open Data)" };
        var sources = { hillshade: dem }, layers = [{ id: "bg", type: "background", paint: { "background-color": cfg.vworldKey ? "#1b2430" : "#dcd6c6" } }];
        if (cfg.vworldKey) {
            var key = encodeURIComponent(cfg.vworldKey);
            sources.sat = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Satellite/{z}/{y}/{x}.jpeg"], attribution: "위성사진: 국토교통부 V-World" };
            sources.base = { type: "raster", tileSize: 256, minzoom: 6, maxzoom: 19, tiles: ["https://api.vworld.kr/req/wmts/1.0.0/" + key + "/Base/{z}/{y}/{x}.png"], attribution: "지도: 국토교통부 V-World" };
            layers.push({ id: "sat", type: "raster", source: "sat" });
            layers.push({ id: "base", type: "raster", source: "base", layout: { visibility: "none" } });
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", paint: { "hillshade-exaggeration": 0.2 } });
        } else {
            layers.push({ id: "hillshade", type: "hillshade", source: "hillshade", paint: { "hillshade-exaggeration": 0.65, "hillshade-shadow-color": "#3d4a3a", "hillshade-highlight-color": "#fbf7ea" } });
        }
        return { version: 8, sources: sources, layers: layers };
    }
    var EMPTY = { type: "FeatureCollection", features: [] };
    function startMap() {
        if (!window.maplibregl) { msg("지도를 띄우지 못했습니다(그래프 · 도구는 됩니다).", 6000); return; }
        fetch("api/map-config", { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (j) {
            var cfg = { demUrl: j.demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: j.vworldKey || null };
            hasSat = !!cfg.vworldKey;
            map = new maplibregl.Map({ container: "map", style: style(cfg), center: [127.8, 36.3], zoom: 6.2, attributionControl: false, dragRotate: false, pitchWithRotate: false });
            map.touchZoomRotate.disableRotation();
            map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© OpenStreetMap contributors" }), "bottom-right");
            map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
            map.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), "bottom-left");
            // 바탕 타일을 다 받기 전에(지형 타일이 늦거나 막혀도) 선부터 - "load" 는 타일까지 기다려 몇 초 늦었음
            var init = function () {
                if (mapOk) return;
                try { map.addSource("others", { type: "geojson", data: EMPTY }); } catch (e) { return; }   // 바탕 글을 아직 못 읽음 - 다음 신호에
                map.addSource("sel", { type: "geojson", data: EMPTY });
                map.addSource("cut", { type: "geojson", data: EMPTY });
                map.addSource("pts", { type: "geojson", data: EMPTY });
                map.addLayer({ id: "others", type: "line", source: "others", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "c"], "line-width": 3, "line-opacity": 0.85 } });
                map.addLayer({ id: "sel-case", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#000", "line-width": 8, "line-opacity": 0.45 } });
                map.addLayer({ id: "sel", type: "line", source: "sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#38d9ea", "line-width": 5 } });
                map.addLayer({ id: "cut", type: "line", source: "cut", paint: { "line-color": "#ffffff", "line-width": 5, "line-dasharray": [1.2, 1] } });
                map.addLayer({ id: "pts", type: "circle", source: "pts", paint: { "circle-radius": 7, "circle-stroke-width": 2, "circle-stroke-color": "#fff",
                    "circle-color": ["match", ["get", "k"], "s", "#2ecc71", "e", "#ff4d4f", "h", "#ffd43b", "#ffffff"] } });
                map.on("click", "others", function (e) { var i = e.features[0] && e.features[0].properties.i; if (i != null) pick(+i, true); });
                map.on("mouseenter", "others", function () { map.getCanvas().style.cursor = "pointer"; });
                map.on("mouseleave", "others", function () { map.getCanvas().style.cursor = ""; });
                mapOk = true;
                draw(true);
            };
            map.on("style.load", init);
            map.on("styledata", init);
            map.on("load", init);
            init();   // 바탕을 글로 넣어 이미 준비됐을 수 있음
            if (hasSat) {
                $("layer").hidden = false;
                $("layer").onclick = function () {
                    basemap = basemap === "sat" ? "light" : "sat";
                    map.setLayoutProperty("sat", "visibility", basemap === "sat" ? "visible" : "none");
                    map.setLayoutProperty("base", "visibility", basemap === "light" ? "visible" : "none");
                    $("layer").textContent = basemap === "sat" ? "🗺️ 밝은 지도" : "🛰️ 위성사진";
                };
            }
        });
    }
    function line(t, props) { return { type: "Feature", properties: props || {}, geometry: { type: "LineString", coordinates: t.map(function (p) { return [p[1], p[0]]; }) } }; }
    function point(p, k) { return { type: "Feature", properties: { k: k }, geometry: { type: "Point", coordinates: [p[1], p[0]] } }; }
    function fit(t) {
        if (!mapOk || !t || t.length < 2) return;
        var lo = t.map(function (p) { return p[1]; }), la = t.map(function (p) { return p[0]; });
        map.fitBounds([[Math.min.apply(null, lo), Math.min.apply(null, la)], [Math.max.apply(null, lo), Math.max.apply(null, la)]],
            { padding: { top: 50, bottom: 40, left: 40, right: 50 }, duration: 400, maxZoom: 16 });
    }

    // ---- 그리기(목록 · 지도 · 요약 · 그래프)
    function draw(refit) {
        var box = $("list");
        box.textContent = "";
        tracks.forEach(function (x, i) {
            var it = document.createElement("div"), dot = document.createElement("i"), b = document.createElement("b"), sp = document.createElement("span");
            it.className = "it" + (i === sel ? " on" : "");
            it.tabIndex = 0;
            dot.style.background = i === sel ? "#38d9ea" : x.color;
            b.textContent = x.name;
            sp.textContent = km(RF.trackStats(x.track).dist) + " km";
            it.appendChild(dot); it.appendChild(b); it.appendChild(sp);
            it.onclick = function () { pick(i, true); };
            it.onkeydown = function (e) { if (e.key === "Enter") pick(i, true); };
            box.appendChild(it);
        });
        var c = cur();
        $("selSec").hidden = $("toolSec").hidden = $("saveSec").hidden = !c;
        if (c) {
            if (document.activeElement !== $("name")) $("name").value = c.name;
            var st = RF.trackStats(c.track);
            $("stats").innerHTML = "";
            [["거리", km(st.dist) + " km"], ["오르막 · 내리막", st.hasEle ? st.up + " m · " + st.down + " m" : "높이 없음"], ["걸린 시간", st.ms ? hms(st.ms) : "시각 없음"], ["점", RF.num(st.n) + "개"]].forEach(function (r) {
                var tr = document.createElement("tr"), a = document.createElement("td"), b = document.createElement("td");
                a.textContent = r[0]; b.textContent = r[1]; tr.appendChild(a); tr.appendChild(b);
                $("stats").appendChild(tr);
            });
            profile();
        }
        if (mapOk) {
            map.getSource("others").setData({ type: "FeatureCollection", features: tracks.map(function (x, i) { return i === sel ? null : line(x.track, { c: x.color, i: i }); }).filter(Boolean) });
            var keep = c ? (preview ? preview.keep : c.track) : null;
            map.getSource("sel").setData(keep && keep.length > 1 ? line(keep) : EMPTY);
            map.getSource("cut").setData(preview && preview.cut ? { type: "FeatureCollection", features: preview.cut.filter(function (t) { return t.length > 1; }).map(function (t) { return line(t); }) } : EMPTY);
            var fs = [];
            if (keep && keep.length) { fs.push(point(keep[0], "s")); fs.push(point(keep[keep.length - 1], "e")); }
            if (preview && preview.mark) fs.push(point(preview.mark, "m"));
            if (hoverAt) fs.push(point(hoverAt, "h"));
            map.getSource("pts").setData({ type: "FeatureCollection", features: fs });
            if (refit && c) fit(c.track);
        }
    }

    // 높이 그래프 - 거리(가로) · 높이(세로), 자르기 · 나누기 미리보기는 자를 쪽을 어둡게
    var profPts = null;
    function profile() {
        var cv = $("prof"), c = cur(), dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 360, H = cv.clientHeight || 130;
        cv.width = W * dpr; cv.height = H * dpr;
        var g = cv.getContext("2d");
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, W, H);
        if (!c) return;
        var t = c.track, cum = [0];
        for (var i = 1; i < t.length; i++) cum.push(cum[i - 1] + RF.distM(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]));
        var total = cum[cum.length - 1] || 1, es = t.map(function (p) { return p[3]; }).filter(function (e) { return e != null; });
        profPts = { cum: cum, total: total };
        var L = 34, R = 6, T = 8, B = 18;
        g.font = "11px Arial";
        g.fillStyle = "#9aa6b4";
        if (!es.length) { g.fillText("이 길에는 높이가 없습니다(코스로 올리면 지형 높이로 매김)", L, H / 2); }
        else {
            var lo = Math.min.apply(null, es), hi = Math.max.apply(null, es);
            if (hi - lo < 20) { hi += 10; lo -= 10; }
            var X = function (d) { return L + (W - L - R) * d / total; }, Y = function (e) { return T + (H - T - B) * (1 - (e - lo) / (hi - lo)); };
            g.beginPath();
            var started = false;
            t.forEach(function (p, k) { if (p[3] == null) return; if (!started) { g.moveTo(X(cum[k]), Y(p[3])); started = true; } else g.lineTo(X(cum[k]), Y(p[3])); });
            g.strokeStyle = "#38d9ea"; g.lineWidth = 2; g.stroke();
            g.lineTo(X(total), H - B); g.lineTo(X(0), H - B); g.closePath();
            g.fillStyle = "rgba(56,217,234,0.15)"; g.fill();
            g.fillStyle = "#9aa6b4";
            g.fillText(Math.round(hi) + "m", 2, T + 9);
            g.fillText(Math.round(lo) + "m", 2, H - B);
        }
        g.fillStyle = "#9aa6b4";
        g.fillText("0", L, H - 4);
        g.fillText(km(total) + " km", W - R - 46, H - 4);
        if (preview && preview.dim) {   // 자를 쪽 어둡게
            var Xd = function (d) { return L + (W - L - R) * d / total; };
            g.fillStyle = "rgba(0,0,0,0.55)";
            preview.dim.forEach(function (r) { g.fillRect(Xd(r[0]), 0, Xd(r[1]) - Xd(r[0]), H - B); });
        }
        if (preview && preview.markD != null) { var xm = L + (W - L - R) * preview.markD / total; g.fillStyle = "#fff"; g.fillRect(xm - 1, 0, 2, H - B); }
    }
    function profHover(e) {
        var c = cur(), cv = $("prof");
        if (!c || !profPts) return;
        var r = cv.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left, L = 34, R = 6;
        var d = Math.max(0, Math.min(1, (x - L) / (r.width - L - R))) * profPts.total, k = 0;
        while (k < profPts.cum.length - 1 && profPts.cum[k] < d) k++;
        hoverAt = c.track[k];
        draw(false);
        var p = c.track[k];
        $("profTip").textContent = km(profPts.cum[k]) + " km" + (p[3] != null ? " · 높이 " + Math.round(p[3]) + " m" : "") + (p[2] != null ? " · " + new Date(p[2]).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "");
    }
    $("prof").addEventListener("mousemove", profHover);
    $("prof").addEventListener("touchmove", function (e) { profHover(e); e.preventDefault(); }, { passive: false });
    $("prof").addEventListener("mouseleave", function () { hoverAt = null; draw(false); });

    function pick(i, refit) {
        if (preview) closeTool();
        sel = i;
        hoverAt = null;
        draw(refit);
    }
    function add(name, track) {
        tracks.push({ name: String(name || "GPX").slice(0, 60), track: track, color: COLORS[tracks.length % COLORS.length] });
        sel = tracks.length - 1;
    }

    // ---- 열기: 파일 · 끌어다 놓기 · 내 기록(IndexedDB rf-records - 따라가기와 같은 저장소)
    function readFiles(files) {
        var list = Array.prototype.slice.call(files || []).filter(function (f) { return /\.gpx$/i.test(f.name) || /xml|gpx/.test(f.type); });
        if (!list.length) { msg("GPX 파일을 골라 주세요."); return; }
        var n0 = tracks.length;
        Promise.all(list.map(function (f) { return f.text().then(function (txt) { return { f: f, txt: txt }; }); })).then(function (rs) {
            rs.forEach(function (r) {   // 고른 차례대로(먼저 읽힌 차례 아님)
                try { RF.gpxTracks(r.txt).forEach(function (x) { add(x.name || r.f.name.replace(/\.gpx$/i, ""), x.track); }); }
                catch (e) { msg(r.f.name + ": " + e.message, 6000); }
            });
            if (tracks.length > n0) { msg("길 " + (tracks.length - n0) + "개를 열었습니다."); draw(true); }
        });
    }
    $("openBtn").onclick = function () { $("file").value = ""; $("file").click(); };
    $("file").onchange = function () { readFiles(this.files); };
    var mw = $("mapWrap"), depth = 0;
    mw.addEventListener("dragenter", function (e) { e.preventDefault(); depth++; mw.classList.add("over"); });
    mw.addEventListener("dragover", function (e) { e.preventDefault(); });
    mw.addEventListener("dragleave", function () { if (--depth <= 0) { depth = 0; mw.classList.remove("over"); } });
    mw.addEventListener("drop", function (e) { e.preventDefault(); depth = 0; mw.classList.remove("over"); readFiles(e.dataTransfer && e.dataTransfer.files); });

    function myRecords() {
        return new Promise(function (resolve) {
            if (!window.indexedDB) { resolve([]); return; }
            var r = indexedDB.open("rf-records", 1);
            r.onupgradeneeded = function () { r.result.createObjectStore("r"); };
            r.onerror = function () { resolve([]); };
            r.onsuccess = function () {
                var db = r.result;
                try {
                    var q = db.transaction("r", "readonly").objectStore("r").get("list");
                    q.onsuccess = function () { db.close(); resolve(Array.isArray(q.result) ? q.result : []); };
                    q.onerror = function () { db.close(); resolve([]); };
                } catch (e) { db.close(); resolve([]); }
            };
        });
    }
    $("recBtn").onclick = function () {
        myRecords().then(function (recs) {
            recs = recs.filter(function (r) { return r && Array.isArray(r.track) && r.track.length > 1; });
            if (!recs.length) { msg("이 기기(브라우저)에 내 기록이 없습니다. 기록이 있는 폰이면 그 폰에서 여세요.", 6000); return; }
            var wrap = document.createElement("div");
            wrap.setAttribute("role", "dialog");
            wrap.style.cssText = "position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:12px";
            var box = document.createElement("div");
            box.style.cssText = "background:#1a212b;border-radius:14px;padding:14px;width:min(460px,100%);max-height:85vh;overflow:auto";
            box.innerHTML = "<b>📒 내 기록에서 열기</b>";
            recs.forEach(function (r) {
                var b = document.createElement("button"), d = new Date(r.start);
                b.className = "b";
                b.style.cssText = "display:block;width:100%;text-align:left;margin-top:8px;padding:8px 10px";
                b.textContent = d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate() + " · " + String(r.name || "기록").replace(/^.* · (?=.* · )/, "") + " · " + km(RF.trackStats(r.track).dist) + " km";
                b.onclick = function () {
                    add(r.name || "기록", r.track.map(function (p) { return [p[0], p[1], p[2] != null ? p[2] : null, p[3] != null ? p[3] : null]; }));
                    wrap.remove();
                    draw(true);
                };
                box.appendChild(b);
            });
            var x = document.createElement("button");
            x.className = "b"; x.style.cssText = "display:block;width:100%;margin-top:12px"; x.textContent = "닫기";
            x.onclick = function () { wrap.remove(); };
            box.appendChild(x);
            wrap.appendChild(box);
            wrap.addEventListener("click", function (e) { if (e.target === wrap) wrap.remove(); });
            document.body.appendChild(wrap);
        });
    };

    // ---- 고치기
    $("name").addEventListener("input", function () { var c = cur(); if (c) { c.name = this.value.slice(0, 60); var it = $("list").children[sel]; if (it) it.querySelector("b").textContent = c.name; } });
    $("name").addEventListener("change", function () { draw(false); });

    function closeTool() { preview = null; $("toolBox").textContent = ""; draw(false); }
    function slider(label, max, step, cls) {
        return '<label class="sl">' + label + ' <b class="' + cls + 'v"></b><input type="range" class="' + cls + '" min="0" max="' + max + '" step="' + step + '" value="0"></label>';
    }
    function toolButtons(okText) {
        return '<div class="row" style="margin-top:8px"><button class="b tno" type="button">취소</button><button class="b main tok" type="button">' + okText + '</button></div>';
    }
    function openTool(kind) {
        var c = cur();
        if (!c) return;
        var box = $("toolBox"), st = RF.trackStats(c.track), total = st.dist, step = total > 5000 ? 50 : 10, max = Math.max(0, Math.floor(total / step) * step);
        preview = null;
        if (kind === "trim") {
            box.innerHTML = '<p class="tip">파란 선만 남습니다. 흰 점선 · 그래프의 어두운 쪽이 잘려 나갑니다.</p>' + slider("앞에서", max, step, "t0") + slider("뒤에서", max, step, "t1") + '<p class="tkept tip" style="font-weight:bold;color:#eef2f7"></p>' + toolButtons("자르기");
            var t0 = box.querySelector(".t0"), t1 = box.querySelector(".t1");
            var upd = function (e) {
                if (+t0.value + +t1.value > total - step) { if (e && e.target === t0) t0.value = Math.max(0, total - step - t1.value); else t1.value = Math.max(0, total - step - t0.value); }
                var r = RF.trimTrack(c.track, +t0.value, +t1.value);
                box.querySelector(".t0v").textContent = km(+t0.value) + " km";
                box.querySelector(".t1v").textContent = km(+t1.value) + " km";
                box.querySelector(".tkept").textContent = "남는 길 " + km(r.kept) + " / " + km(total) + " km";
                preview = { keep: r.track, cut: r.track.length ? [c.track.slice(0, r.from + 1), c.track.slice(r.to)] : [c.track], dim: [[0, +t0.value], [total - +t1.value, total]], res: r };
                box.querySelector(".tok").disabled = r.track.length < 2;
                draw(false);
            };
            t0.oninput = t1.oninput = upd;
            upd();
            box.querySelector(".tok").onclick = function () { if (!preview || preview.res.track.length < 2) return; push(); c.track = preview.res.track; closeTool(); msg("잘랐습니다. ↶ 되돌리기로 되돌릴 수 있습니다."); draw(true); };
        } else if (kind === "split") {
            box.innerHTML = '<p class="tip">흰 점(그래프의 흰 줄)에서 둘로 나눕니다. 뒤쪽은 목록에 새 길로 들어갑니다.</p>' + slider("나눌 자리", max, step, "sp") + toolButtons("나누기");
            var sp = box.querySelector(".sp");
            sp.value = Math.round(max / 2 / step) * step;
            var upd2 = function () {
                var r = RF.splitTrack(c.track, +sp.value);
                box.querySelector(".spv").textContent = km(+sp.value) + " km";
                preview = r ? { keep: r[0], cut: [r[1]], mark: r[1][0], markD: +sp.value, res: r } : { res: null };
                box.querySelector(".tok").disabled = !r;
                draw(false);
            };
            sp.oninput = upd2;
            upd2();
            box.querySelector(".tok").onclick = function () {
                if (!preview || !preview.res) return;
                push();
                var r = preview.res, at = sel;
                c.track = r[0];
                tracks.splice(at + 1, 0, { name: (c.name + " (뒤)").slice(0, 60), track: r[1], color: COLORS[(tracks.length) % COLORS.length] });
                sel = at;
                closeTool();
                msg("둘로 나눴습니다(뒤쪽은 목록 바로 아래).");
                draw(true);
            };
        } else if (kind === "join") {
            var others = tracks.map(function (x, i) { return i === sel ? null : '<option value="' + i + '">' + x.name.replace(/[<&]/g, "") + "</option>"; }).filter(Boolean);
            if (!others.length) { box.innerHTML = '<p class="tip">이을 다른 길이 없습니다. GPX 를 하나 더 열어 주세요.</p>'; return; }
            box.innerHTML = '<p class="tip">고른 길 뒤에 다른 길을 이어 붙입니다(이은 길은 목록에서 빠짐). 끝이 서로 멀면 곧은 선으로 이어집니다.</p>'
                + '<label class="sl">뒤에 붙일 길 <select class="jw b" style="width:100%">' + others.join("") + '</select></label>'
                + '<label class="sl"><input type="checkbox" class="jr"> 붙일 길을 뒤집어서(끝 → 처음)</label><p class="jgap tip"></p>' + toolButtons("잇기");
            var jw = box.querySelector(".jw"), jr = box.querySelector(".jr");
            var upd3 = function () {
                var o = tracks[+jw.value], b = jr.checked ? o.track.slice().reverse() : o.track, a = c.track;
                var gap = RF.distM(a[a.length - 1][0], a[a.length - 1][1], b[0][0], b[0][1]);
                box.querySelector(".jgap").textContent = "두 끝 사이 " + (gap < 1000 ? Math.round(gap) + " m" : km(gap) + " km") + (gap > 200 ? " - 멀어서 곧은 선으로 이어집니다. 뒤집기를 바꿔 보세요." : "");
                preview = { keep: RF.joinTracks(a, b), res: b };
                draw(false);
            };
            jw.onchange = jr.onchange = upd3;
            upd3();
            box.querySelector(".tok").onclick = function () {
                if (!preview) return;
                push();
                var oi = +jw.value;
                c.track = preview.keep;
                tracks.splice(oi, 1);
                if (oi < sel) sel--;
                closeTool();
                msg("이었습니다.");
                draw(true);
            };
        }
        box.querySelector(".tno").onclick = closeTool;
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-tool]"), function (b) { b.onclick = function () { openTool(b.getAttribute("data-tool")); }; });
    $("revBtn").onclick = function () { var c = cur(); if (!c) return; push(); c.track = c.track.slice().reverse(); closeTool(); msg("뒤집었습니다(출발 ↔ 도착)."); draw(false); };
    $("undoBtn").onclick = function () {
        var u = undo.pop();
        if (!u) { $("undoBtn").disabled = true; return; }
        tracks = u.list;
        sel = u.sel;
        $("undoBtn").disabled = !undo.length;
        closeTool();
        draw(true);
    };
    $("delBtn").onclick = function () {
        var c = cur();
        if (!c) return;
        ask("\"" + c.name + "\" 을(를) 목록에서 뺄까요? 파일 · 내 기록은 그대로입니다(↶ 되돌리기로 되살림).", { ok: "빼기" }).then(function (ok) {
            if (!ok) return;
            push();
            var at = sel;
            tracks.splice(at, 1);
            sel = tracks.length ? Math.min(at, tracks.length - 1) : -1;
            closeTool();
            draw(true);
        });
    };

    // ---- 저장 · 올리기
    function slug(s) { return String(s || "").replace(/[\\/:*?"<>|.\s·~,]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "track"; }
    $("saveBtn").onclick = function () {
        var c = cur();
        if (!c) return;
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([RF.trackGpx(c.name, $("kind").value, c.track)], { type: "application/gpx+xml" }));
        a.download = "routefly-" + slug(c.name) + ".gpx";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    $("upBtn").onclick = function () {
        var c = cur();
        if (!c) return;
        askText("코스로 올릴 이름(목록에 이대로 보임)\n예: 송산 · 송산리 마을회관 → 송산 정상", c.name, { ok: "다음" }).then(function (name) {
            name = String(name || "").trim();
            if (!name) return;
            var st = RF.trackStats(c.track);
            return ask("\"" + name + "\" (" + km(st.dist) + " km) 을(를) routefly 코스로 올릴까요?\n\n누구나 보는 코스가 됩니다. 선 모양 · 이름만 올라가고 시각은 올라가지 않습니다. 1시간 안(매시 7분)에 코스 목록에 들어갑니다.", { ok: "올리기" }).then(function (ok) {
                if (!ok) return;
                return fetch("api/course-upload", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ name: name, kind: $("kind").value, gpx: RF.trackGpx(name, $("kind").value, c.track) }) })
                    .then(function (res) { return res.json().catch(function () { return { success: false, message: "HTTP " + res.status }; }); })
                    .then(function (j) {
                        if (!j || j.success === false) throw new Error(j && j.message || "?");
                        msg("⬆ 올렸습니다 - 1시간 안(매시 7분)에 코스 목록에 들어갑니다. 코스 ID " + j.id, 9000);
                    });
            });
        }).catch(function (e) { msg("올리지 못했습니다: " + (e && e.message || e), 7000); });
    };
    window.addEventListener("resize", function () { if (cur()) profile(); });
    if (/[?&]debug\b/.test(location.search)) window.routeflyStudio = { get mapOk() { return mapOk; }, get map() { return map; }, get tracks() { return tracks; } };   // 시험용
})();
