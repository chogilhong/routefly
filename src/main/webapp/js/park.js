/*
 * 공원 · 산 전체 보기(park.html?name=지리산[&from=코스ID]) - /api/park 의 탐방로 전체 선 · 이름표 · 위험지역 · 조망점.
 * 국립공원은 공단 공식 탐방로, 도립 · 군립공원과 다른 산은 from 코스 둘레의 같은 산 코스(2026-10-11 홍TV님).
 * 2026-10-10 홍TV님: 공원 안내도처럼 산 전체를 한눈에. 바탕 지도는 따라가기 화면과 같은 V-World(키가 없으면 지형 음영만).
 */
(function () {
    "use strict";
    var RF = window.RF;
    function $(id) { return document.getElementById(id); }
    var q = new URLSearchParams(location.search), park = q.get("name") || "", from = q.get("from"), backTo = q.get("back");
    var map, light = true, cfg = null, data = null, places = [];

    function getJson(url) {
        return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
            return r.json().catch(function () { return { success: false, message: "응답을 읽지 못했습니다 (HTTP " + r.status + ")" }; })
                .then(function (j) {
                    if (!r.ok || !j || j.success === false) throw new Error((j && j.message) || ("HTTP " + r.status));
                    return j;
                });
        });
    }

    function setLight(on) {
        light = on;
        if (map.getLayer("sat")) map.setLayoutProperty("sat", "visibility", on ? "none" : "visible");
        if (map.getLayer("base")) map.setLayoutProperty("base", "visibility", on ? "visible" : "none");
        map.setPaintProperty("trails", "line-color", on ? "#e8590c" : "#ffffff");
        map.setPaintProperty("trails-case", "line-color", on ? "#ffffff" : "#000000");
        $("layerBtn").textContent = on ? "🛰️" : "🗺️";
    }

    /**
     * 탐방로 고르기 - 누르면 고르고 다시 누르면 뺌, 고른 것 앞 · 뒤로 이어지는 탐방로는 함께(2026-10-12 홍TV님: 등산도 노선 안내도처럼
     * 이어진 구간으로). 아래 칸에 처음 → 끝 두 방향 단추(따라가기), 하나만 골랐으면 미리보기도.
     */
    var sel = [], lines = {}, flips = {}, byId = {}, segs = [], emptySheet = "", poiNames = {}, noteNames = null;
    var chosen = [], startMk = null, endMk = null;

    /** 고른 탐방로가 이어진 묶음별로(끝 150m 안이면 이어짐) - 빼서 끊어지면 처음 고른 것이 든 묶음만 남김. */
    function groupOf(ids, keep) {
        var d = function (p, q) { return RF.distM(p[1], p[0], q[1], q[0]); };
        var touch = function (x, y) {
            var a = lines[x], b = lines[y], ea = [a[0], a[a.length - 1]], eb = [b[0], b[b.length - 1]];
            return ea.some(function (p) { return eb.some(function (q) { return d(p, q) < 150; }); });
        };
        var got = [keep], todo = ids.filter(function (x) { return x !== keep; }), grew = true;
        while (grew) {
            grew = false;
            todo = todo.filter(function (x) {
                if (got.some(function (y) { return touch(x, y); })) { got.push(x); grew = true; return false; }
                return true;
            });
        }
        return ids.filter(function (x) { return got.indexOf(x) >= 0; });
    }

    /**
     * 탐방로 고르기 - 누르면 고르고 다시 누르면 뺌. 고른 묶음을 실제로 걷는 순서로(RF.planWalk - 들머리에서 출발, 정상 같은 막다른 갈래는 올랐다 내려옴,
     * 갈림길에서 끝나면 들머리로 돌아옴). 이어지지 않는 탐방로를 누르면 그 탐방로로 새로(알림 없이 - 2026-10-12 홍TV님).
     */
    function pick(t) {
        if (t) {
            exStart = null;
            var k = chosen.indexOf(t.id);
            if (k >= 0) {
                chosen.splice(k, 1);
                if (chosen.length && !planOf(chosen).ok) chosen = groupOf(chosen, chosen[0]);
                if (chosen.length && !planOf(chosen).ok) chosen = [];
            } else {
                chosen.push(t.id);
                // 아직 이어지지 않은 탐방로는 기다렸다 이어 주는 탐방로를 누르면 합침(2026-10-13 PC: 누르는 차례에 따라 새로 골라졌음),
                // 걸을 수 없는 모양일 때만 그 탐방로로 새로
                if (planOf(chosen).reason === "shape") chosen = [t.id];
            }
        }
        var plan = chosen.length ? planOf(chosen) : { ok: false };
        sel = plan.ok ? plan.walk : [];
        map.getSource("sel").setData({ type: "FeatureCollection", features: chosen.map(function (id) {
            return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: lines[id] } };
        }) });
        if (startMk) { startMk.remove(); startMk = null; }
        if (endMk) { endMk.remove(); endMk = null; }
        if (!sel.length && chosen.length) {   // 고른 것이 아직 이어지지 않음
            $("sheet").innerHTML = "";
            var w = document.createElement("div");
            w.className = "tip";
            w.textContent = chosen.length + "구간을 골랐습니다. 아직 이어지지 않은 구간이 있습니다 - 사이 탐방로를 더 누르세요(다시 누르면 뺍니다).";
            $("sheet").appendChild(w);
            return;
        }
        if (!sel.length) { $("sheet").innerHTML = emptySheet; return; }
        // 출발(들머리) · 도착을 지도에(2026-10-12 홍TV님: 중산리탐방지원센터가 들머리인데 지도에 표시)
        var flag = function (txt, at) {
            var e = document.createElement("div");
            e.className = "flag";
            RF.nameNodes(e, txt);   // 탐방지원센터는 작은 글씨
            return new maplibregl.Marker({ element: e, anchor: "bottom-left" }).setLngLat(at).addTo(map);
        };
        var ends = function (s) {
            var e = RF.routeEnds(byId[s.id].name), a = flips[s.id] ? e.to : e.from, b = flips[s.id] ? e.from : e.to;
            return s.rev ? [b, a] : [a, b];
        };
        var round = plan.loop, full = sel;
        // 이름에 출발 · 도착이 없는 탐방로("설악산 · 대청봉코스")는 그 자리 지명(300m, 봉우리는 120m)으로
        var nearName = function (p) {
            var best = null, bd = 300;
            (data.places || []).forEach(function (q) {
                var x = RF.distM(p[1], p[0], +q.lat, +q.lon), nm = RF.placeName(q.name);
                if (nm && x < bd) { bd = x; best = x > RF.peakNearM(nm) ? null : nm; }
            });
            return best;
        };
        // 원점회귀 예시는 그 들머리 이름(북한산 구기탐방지원센터 자리 구간 끝 이름이 "비봉능선")
        var from = (exStart && exHead) || ends(sel[0])[0] || nearName(plan.start), to = round ? from : ends(sel[sel.length - 1])[1] || nearName(plan.end);
        var one = full.length === 1 ? byId[full[0].id] : null;
        // 깃발에 들머리 이름(서버 heads 가 없어도 - 2026-10-12 홍TV님: 탐방 안내도에 중산리탐방지원센터가 안 보였음)
        // 깃발은 그 이름의 지명 자리(200m 안)에 - 공단 자료 중산리 → 천왕봉 선은 정상을 지나 117m 더 그려져 있음(2026-10-13 홍TV님)
        var at = function (name, p) {
            var best = p, bd = 200;
            (data.places || []).forEach(function (q) {
                if (!name || RF.placeName(q.name) !== RF.placeName(name)) return;
                var x = RF.distM(p[1], p[0], +q.lat, +q.lon);
                if (x < bd) { bd = x; best = [+q.lon, +q.lat]; }
            });
            return best;
        };
        startMk = flag((round ? "🚩 출발 · 도착 " : "🚩 출발 ") + (from || ""), at(from, plan.start));
        if (!round) endMk = flag("🏁 도착 " + (to || ""), at(to, plan.end));
        var meters = full.reduce(function (m, s) { return m + (+byId[s.id].distance_m || 0); }, 0);
        $("sheet").innerHTML = "";
        var nm = document.createElement("div");
        nm.className = "nm";
        RF.nameNodes(nm, one ? one.name : round ? (from || "") + " 원점회귀 · " + chosen.length + "구간"
            : chosen.length + "구간 이어 걷기" + (from || to ? " · " + RF.endsText(from, to) : ""));
        var st = document.createElement("div");
        st.className = "st";
        st.textContent = RF.km(meters) + "km" + (one && one.ascent_m != null ? " · 오르막 " + RF.num(one.ascent_m) + "m" : " · 오르막은 따라가기 화면에서")
            + (full.some(function (s) { return byId[s.id].extra; }) ? " · 옅은 선은 산림청 · 등산트레킹 자료" : "");
        if (one && !listMode && !one.base && one.id.indexOf("@") < 0 && one.id.indexOf(",") < 0) {   // 하나만 골랐으면 코스 미리보기(3D)도 - 이은 코스는 미리보기가 받지 못함
            var pv = document.createElement("a");
            pv.href = "index.html#c=" + encodeURIComponent(one.id);
            pv.textContent = " · 미리보기 ›";
            pv.className = "pv";
            st.appendChild(pv);
        }
        var row = document.createElement("div");
        row.className = "row";
        var link = function (list) {
            list = RF.flattenSel(list);   // 이은 구간(무등산)은 코스 조각으로 풀어서
            return "hike.html#c=" + (list.length === 1 ? encodeURIComponent(list[0].id) + (list[0].rev ? "&rev=1" : "") : encodeURIComponent(RF.joinId(list)));
        };
        // 원점회귀는 어느 쪽으로 먼저 도는지 - 두 방향이 처음 갈라지는 곳의 이름(들머리에서 같은 길로 오르는 부분은 건너뜀)
        var fwdN = full.map(function (s) { return ends(s)[1]; }), bwdN = RF.reverseSel(full).map(function (s) { return ends(s)[1]; }), dv = 0;
        while (dv < fwdN.length - 1 && fwdN[dv] === bwdN[dv]) dv++;
        // "갈림길" 은 어느 쪽인지 모름 - 그 뒤 처음 이름 있는 곳(2026-10-13: 지리산 예시가 "갈림길 쪽으로 먼저")
        var known = function (list) {
            for (var i = dv; i < list.length; i++) if (list[i] && !/^(갈림길|탐방로 끝)$/.test(list[i])) return list[i];
            return null;
        };
        var labels = round ? [(known(fwdN) || "이 방향") + " 쪽으로 먼저", (known(bwdN) || "반대 방향") + " 쪽으로 먼저"]
            : from && to ? [from + " → " + to, to + " → " + from] : ["따라가기", "거꾸로 따라가기"];
        var second = RF.reverseSel(full);
        // 들머리에서 정상 같은 막다른 곳까지면 "왕복"(올랐다 같은 길로 들머리) - 한라산 성판악 ↔ 백록담처럼 고리가 없는 산의 원점회귀(2026-10-13 홍TV님)
        var headNear = function (p) { return (data.heads || []).some(function (h) { return RF.distM(p[1], p[0], +h.lat, +h.lon) < 500; }); };
        // 들머리 자료가 적은 산(한라산은 어리목탐방안내소 하나)은 끝 이름이 정상 · 봉 · 오름 · 대피소 · 분기점이면
        if (!round && !headNear(plan.end) && (headNear(plan.start) || /(정상|봉|산|대|오름|분기점|대피소)$/.test(to || ""))) {
            labels = [(from || "") + " → " + (to || "") + " 편도", (to || "정상") + " 왕복"];
            second = full.concat(RF.reverseSel(full));
        }
        [[labels[0], full], [labels[1], second]].forEach(function (d, k) {
            var a = document.createElement("a");
            if (k === 0) a.className = "main";
            a.href = link(d[1]);
            RF.nameNodes(a, d[0]);
            row.appendChild(a);
        });
        var tip = document.createElement("div");
        tip.className = "tip";
        tip.textContent = round ? "출발한 들머리로 돌아오는 코스입니다(정상 같은 갈래는 올랐다 같은 길로). 어느 쪽으로 먼저 돌지 고르세요."
            : "이어진 탐방로를 더 누르면 함께 고르고, 다시 누르면 뺍니다. 따라갈 방향을 고르세요.";
        $("sheet").appendChild(nm);
        $("sheet").appendChild(st);
        $("sheet").appendChild(tip);
        $("sheet").appendChild(row);
    }

    /**
     * 누른 자리에 선이 여럿이면(겹친 탐방로) - 고른 것에 이어지는 것, 그다음 짧은 것(구체적인 것)을. 2026-10-12 PC: 겹친 선을 누르면 다른 것이 잡혔음.
     */
    /**
     * 원점회귀 예시(2026-10-13 홍TV님: 모든 산에 원점회귀 코스 예시) - 고른 탐방로가 없을 때 아래 칸에 높은 봉우리부터 셋.
     * 누르면 그 구간들을 고른 것과 같음(고리가 없는 산은 정상 왕복 - 아래 칸의 "왕복" 단추).
     */
    var examples = [];
    function showExamples(hs) {
        var peaks = (data.places || []).filter(function (p) { return p.ele_m != null && /(봉|산|정상|오름|대)(\s*\(.*\))?$/.test(p.name) && !/(대피소|전망대)$/.test(p.name); });
        examples = RF.loopExamples(segs, hs, peaks, { planHeads: data.heads });
        if (!examples.length) return;
        var box = document.createElement("div");
        box.className = "ex";
        var h = document.createElement("div");
        h.className = "exh";
        box.appendChild(h);
        examples.forEach(function (x, k) {
            var a = document.createElement("a");
            a.href = "#";
            a.setAttribute("data-ex", String(k));
            RF.nameNodes(a, (x.loop ? "↻ " : "⇄ ") + x.head + " ↔ " + x.peak + (x.loop ? "" : " 왕복") + " · " + RF.km(x.m) + "km");
            box.appendChild(a);
        });
        // 아래 칸 높이는 그대로(탐방로를 골랐을 때와 같게) - 안내 글은 예시 제목에 넣음
        h.textContent = "원점회귀 예시(누르면 지도에) · 탐방로를 눌러 직접 고를 수도 있습니다";
        var tip = $("sheet").querySelector(".tip");
        if (tip && !listMode) tip.parentNode.removeChild(tip);
        $("sheet").insertBefore(box, $("sheet").firstChild);
        emptySheet = $("sheet").innerHTML;
    }

    var exStart = null, exHead = null;   // 원점회귀 예시를 눌렀을 때 그 들머리 자리 · 이름(탐방로를 직접 누르면 지움)
    function planOf(ids) { return RF.planWalk(ids, lines, { heads: data.heads, first: ids[0], start: exStart }); }

    function bestHit(fs) {
        var ids = fs.map(function (f) { return f.properties.i; }).filter(function (i, k, a) { return a.indexOf(i) === k; });
        var score = function (i) {
            var s = segs[i], inSel = chosen.indexOf(s.id) >= 0;
            var joins = !inSel && chosen.length && planOf(chosen.concat([s.id])).ok;
            return (inSel ? 0 : joins ? 1 : 2) * 1e7 + (+s.distance_m || 0);
        };
        return ids.sort(function (a, b) { return score(a) - score(b); })[0];
    }

    function draw() {
        // 자연관찰로는 등산 코스가 아님(2026-10-12 홍TV님: 중산리탐방지원센터 앞 고리) - 빼고, 산마다 다른 이름(중산리 → 중산리탐방지원센터)
        data.trails = data.trails.filter(function (t) { return !/자연관찰로/.test(t.name); }).map(function (t) {
            var x = {};
            for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) x[k] = t[k];
            x.name = RF.aliasName(t.name, noteNames);
            return x;
        });
        // 들머리 이름(다른 자료 코스의 탐방지원센터 · 탐방안내소) - "중산리" 끝이 중산리탐방지원센터 500m 안이면 그 이름으로
        data.trails = RF.headAlias(data.trails, data.heads);
        data.trails.forEach(function (t) { lines[t.id] = t.coords; });
        // 선이 이름과 거꾸로 그려진 탐방로(이웃 탐방로 끝이 모이는 점으로 앎) - 단추 · 이름을 걸어 나가는 차례로
        flips = RF.routeFlips(data.trails.map(function (t) { return { course_id: t.id, name: t.name }; }), lines);
        // 갈림길에서 자른 작은 구간(주능선 노고단고개 → 천왕봉을 장터목 · 세석 · 벽소령 … 에서) - 고르기 · 그리기는 이것으로
        // 이름 없는 탐방로 조각(무등산)은 갈림길 사이로 이어 이름을 붙인 뒤 자름
        // 공단 자료에 빠진 길(설악산 소공원 → 비선대 → 천불동 …)은 다른 자료 등산 코스로 메움(옅은 색) - 공단 탐방로를 자르는 데도 씀
        var extras = RF.gapFill(data.trails, data.others, data.places, data.heads, park);
        extras.forEach(function (t) { lines[t.id] = t.coords; });
        segs = RF.splitTrails(RF.mergeBare(data.trails, data.places).concat(extras), flips, null, poiNames);
        lines = {};
        segs.forEach(function (t) { lines[t.id] = t.coords; byId[t.id] = t; });
        var feats = segs.map(function (t, i) {
            return { type: "Feature", id: i, properties: { i: i, extra: !!t.extra }, geometry: { type: "LineString", coordinates: t.coords } };
        });
        map.addSource("trails", { type: "geojson", data: { type: "FeatureCollection", features: feats } });
        map.addLayer({ id: "trails-case", type: "line", source: "trails", layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 } });
        map.addLayer({ id: "trails", type: "line", source: "trails", layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": ["case", ["get", "extra"], "#ffa94d", "#e8590c"], "line-width": ["case", ["get", "extra"], 2.5, 3] } });
        map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "sel", type: "line", source: "sel", layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": RF.LINE_COLOR, "line-width": 6 } });
        // 손가락으로 누르기 쉽게 - 보이지 않는 굵은 선으로 고름
        map.addLayer({ id: "trails-hit", type: "line", source: "trails", paint: { "line-color": "#000", "line-opacity": 0, "line-width": 22 } });
        map.on("click", "trails-hit", function (e) {
            var f = e.features && e.features[0];
            if (f) pick(segs[bestHit(e.features)]);
        });
        map.on("mouseenter", "trails-hit", function () { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "trails-hit", function () { map.getCanvas().style.cursor = ""; });

        // 위험 · 조망 아이콘을 먼저 붙여 이름표 아래로(2026-10-11 PC: 천왕봉 · 피아골 둘레에서 아이콘이 이름 글자를 가렸음)
        // 아이콘도 겹침 거르기에 넣되 이름표보다 뒤(넓게 볼 때 이름표와 겹치면 숨기고, 확대하면 다시 보임 - 2026-10-12 홍TV님 "글자 겹치는 건?")
        var spotEls = [];
        (data.spots || []).forEach(function (sp) {
            var e = document.createElement("div");
            e.className = "spot";
            e.textContent = RF.spotIcon(sp.kind);
            e.title = RF.spotText(sp);
            // 점 아래쪽에 붙임 - 이름표는 점 위쪽(anchor bottom)이라 같은 자리(반야봉 · 헬기장)여도 늘 숨지 않게(2026-10-12 PC)
            new maplibregl.Marker({ element: e, anchor: "top" }).setLngLat([+sp.lon, +sp.lat]).addTo(map);
            spotEls.push(e);
        });
        // 이름표 - 높은 봉우리 먼저 보이게(겹치면 낮은 것을 숨김)
        // 들머리 · 날머리를 지도에(2026-10-13 홍TV님: 모든 산) - 탐방로망의 막다른 끝(봉우리 · 폭포 빼고, 탐방지원센터 이름 먼저) + 다른 자료의
        // 탐방지원센터 · 탐방안내소. 같은 이름 이름표가 이미 있으면 빼고
        var have = {};
        data.places.forEach(function (p) { have[String(p.name).replace(/\s+/g, "")] = true; });
        var hs = RF.trailHeads(segs, data.heads, flips);
        (data.heads || []).forEach(function (h) {
            if (!hs.some(function (x) { return x.name === h.name || RF.distM(x.lat, x.lon, +h.lat, +h.lon) < 300; })) hs.push(h);
        });
        showExamples(hs);
        hs.forEach(function (h) { if (!have[h.name]) data.places.push({ name: h.name, lat: h.lat, lon: h.lon, ele_m: null, head: true }); });
        data.places.forEach(function (p) {
            var e = document.createElement("div");
            e.className = "place" + (p.head ? " head" : "");
            e.innerHTML = '<span class="ic"></span><span class="lb"></span>';
            e.querySelector(".ic").textContent = p.head ? (/(탐방지원센터|탐방안내소|분소|매표소)$/.test(p.name) ? "🏠" : "🥾") : RF.poiIcon(p.name);
            RF.nameNodes(e.querySelector(".lb"), RF.cleanName(p.name) + (p.ele_m != null && RF.isTopName(p.name) ? " " + RF.num(p.ele_m) + "m" : ""));
            new maplibregl.Marker({ element: e, anchor: "bottom" }).setLngLat([+p.lon, +p.lat]).addTo(map);
            // 들머리는 봉우리 다음으로 남김(겹치면)
            places.push({ el: e, prio: -(p.ele_m == null ? 0 : +p.ele_m) - (RF.isTopName(p.name) ? 5000 : 0) - (p.head ? 3000 : 0) });
        });
        // 이름표끼리 · 아이콘끼리 따로 겹침 거르기, 이름표에 걸린 아이콘은 그 이름표 바로 아래로 비킴(숨기지 않음) -
        // 2026-10-12 PC: 반야봉 이름표와 같은 자리 헬기장이 어느 축척에서도 숨었음(점이 정상보다 북쪽이라 아래에 붙여도 이름표 칸 안)
        var spots = spotEls.map(function (e) { return { el: e, prio: 0 }; });
        function placeSpots() {
            spotEls.forEach(function (e) { e.style.marginTop = "0px"; });
            RF.declutter(spots);
            var boxes = places.filter(function (it) { return !it.el.classList.contains("hid"); }).map(function (it) { return it.el.getBoundingClientRect(); });
            spotEls.forEach(function (e) {
                if (e.classList.contains("hid")) return;
                var r = e.getBoundingClientRect(), push = 0;
                boxes.forEach(function (l) {
                    if (r.left < l.right && r.right > l.left && r.top + push < l.bottom && r.bottom + push > l.top) push = l.bottom + 2 - r.top;
                });
                if (push > 0) e.style.marginTop = push + "px";
            });
        }
        var timer = 0;
        map.on("render", function () {
            if (timer) return;
            timer = setTimeout(function () { timer = 0; RF.declutter(places); placeSpots(); }, 150);
        });

        var b = data.bbox;
        // 2026-10-12 홍TV님 "조금 키워야": 여백 30 → 옆 20(이름표가 끝에 걸쳐 잘리지 않게) · 위아래 24, 한도 14 → 14.6(막대 200m 쯤).
        // 작은 산은 둘레 마을 · 길까지 보이게 확대 한도 14(MapLibre 512px 줌 - 폭 375px 폰에서 축척 막대 300m, 15 는 100m 였음 2026-10-12 터널로 확인) - 2026-10-12 홍TV님: 공주향교뒷산(코스 0.3km)이 막대 50m 로 너무 크게 보였음
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { top: 24, bottom: 24, left: 20, right: 20 }, duration: 0, maxZoom: OVERVIEW_MAX_ZOOM });
        // 목록 카드에서 왔으면 from 은 그 산을 찾는 데만 쓰고 고르지 않음(아무 코스나 골라져 있어 헷갈렸음)
        if (from && !listMode) segs.forEach(function (t) { if (t.id === from) pick(t); });   // 잘린 탐방로면 고르지 않음
        $("msg").style.display = "none";
    }

    /** 전체 보기 첫 화면의 최대 확대(손으로는 더 확대할 수 있음). */
    var OVERVIEW_MAX_ZOOM = 14.6;

    /** 따라가기 첫 화면 목록의 탐방 안내도 카드에서 왔는가 - ‹ 코스 단추 없이, 아래는 "따라가기" 하나. */
    var listMode = backTo === "list";

    /** 그 산의 입산 · 통제 · 예약 안내(data/park-notes.json, 2026-10-12 홍TV님: 한라산) - 한 줄, 누르면 다 보임. 없으면 안 보임. */
    function showNote(name) {
        return fetch("data/park-notes.json").then(function (r) { return r.json(); }).then(function (d) {
            var n = d && d.parks && d.parks[name];
            if (!n) return;
            noteNames = n.names || null;   // 산마다 다른 이름(지리산 중산리 → 중산리탐방지원센터) - 그리기 전에 받음
            if (!n.short) return;
            var el = $("note"), today = RF.parkRules(n, [], new Date());
            // 오늘 계절(한라산 하절기 4~9월 · 동절기 10~3월)을 앞에 - 좁아 뒤는 말줄임, 누르면 코스마다 통제 시각
            var shortLine = function () { el.textContent = "⚠ " + (today && today.season ? "오늘 " + today.season + " · " : "") + n.short + " ›"; };
            shortLine();
            el.style.display = "block";
            el.addEventListener("click", function () {
                var open = !el.classList.contains("open");
                el.classList.toggle("open", open);
                el.setAttribute("aria-expanded", open ? "true" : "false");
                setTimeout(function () { if (map) map.resize(); }, 0);   // 펼치면 지도 칸이 줄어듦
                if (!open) { shortLine(); return; }
                el.textContent = "";
                var line = function (t) { el.appendChild(document.createTextNode("· " + t)); el.appendChild(document.createElement("br")); };
                n.lines.forEach(line);
                // 코스마다 오늘 계절의 입산 통제 · 하산 시각
                (n.courses || []).forEach(function (cc) {
                    var r = RF.parkRules(n, [cc.label.split(" · ")[0]], new Date());
                    if (r && r.course) line(RF.rulesText({ season: r.season, course: r.course }));
                });
                var by = document.createElement("small");
                by.textContent = "출처: " + n.by + " - 바뀔 수 있으니 가기 전에 확인하세요 ";
                el.appendChild(by);
                if (n.url && /^https:\/\//.test(n.url)) {   // 공고 원문(https 만)
                    var a = document.createElement("a");
                    a.href = n.url;
                    a.target = "_blank";
                    a.rel = "noopener";
                    a.textContent = "공고 보기 ›";
                    a.style.color = "#ffd8a8";
                    a.addEventListener("click", function (e) { e.stopPropagation(); });
                    by.appendChild(a);
                }
            });
            if (map) map.resize();
        }).catch(function () { /* 안내 없이 */ });
    }

    function start() {
        $("title").textContent = park ? park + " 탐방 안내도" : "탐방 안내도";   // 2026-10-12 홍TV님: "전체 보기" → "탐방 안내도"
        // ‹ 코스 - 코스 미리보기에서 왔으면(back=preview) 따라가기의 "🗺 코스 미리보기" 와 같은 첫 화면(검색 · 목록, 2026-10-11 홍TV님),
        // 따라가기에서 왔으면 그 코스의 따라가기
        if (backTo === "preview") $("back").href = "./";
        else if (listMode) {   // 목록 카드에서 왔으면: 위 "← 뒤로" 는 따라가기 화면(검색 목록 - 검색어는 rf-search 로 남아 있음), 아래 "따라가기" 는 고른 탐방로로
            $("back").textContent = "← 뒤로";
            $("back").href = "hike.html";
            $("sheet").classList.add("listmode");
            $("sheet").innerHTML = '<div class="tip">탐방로를 누르면 그 코스를 따라갈 수 있습니다.</div><div class="row"><a class="main" id="followNone" href="hike.html">따라가기</a></div>';
        }
        else if (from) $("back").href = "hike.html#c=" + encodeURIComponent(from);
        // 고른 탐방로가 없을 때 아래 칸(모두 빼면 다시 이것으로). 따라가기는 아래 칸에 맡겨 받음(다시 그려도 됨)
        emptySheet = $("sheet").innerHTML;
        $("sheet").addEventListener("click", function (e) {
            var ex = e.target && e.target.closest ? e.target.closest("[data-ex]") : null;
            if (ex) {
                e.preventDefault();
                var x = examples[+ex.getAttribute("data-ex")];
                if (x) {
                    chosen = x.ids.slice();
                    exStart = x.start;
                    exHead = x.head;
                    pick();
                    // 고른 예시가 보이게 확대
                    var w = 180, so = 90, e2 = -180, n = -90;
                    x.ids.forEach(function (id) { (lines[id] || []).forEach(function (q) { w = Math.min(w, q[0]); e2 = Math.max(e2, q[0]); so = Math.min(so, q[1]); n = Math.max(n, q[1]); }); });
                    if (w < e2) map.fitBounds([[w, so], [e2, n]], { padding: 40, duration: 600, maxZoom: 15 });
                }
                return;
            }
            if (!e.target || e.target.id !== "followNone") return;
            e.preventDefault();
            alert("탐방로를 선택하세요.");   // 탐방로를 고르기 전(2026-10-12 홍TV님)
        });
        var notesReady = showNote(park);
        Promise.all([
            getJson("api/map-config").catch(function () { return {}; }),
            getJson("api/park?name=" + encodeURIComponent(park) + (from ? "&from=" + encodeURIComponent(from) : ""))
        ]).then(function (r) {
            cfg = { demUrl: r[0].demUrl || "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", vworldKey: r[0].vworldKey || null };
            data = r[1];
            // 이름에 출발 · 도착이 없는 탐방로("덕유산 · 종주코스" · "한라산 · 성판악 탐방로")는 코스 이름표를 받아 갈림길 이름으로(splitTrails).
            // 그런 탐방로만, 20개까지, 4초 안에 못 받으면 받은 것만으로 그림
            var bare = data.trails.filter(function (t) { var e = RF.routeEnds(t.name); return !e.from && !e.to; }).slice(0, 20);
            var poiReady = Promise.all(bare.map(function (t) {
                return getJson("api/course?id=" + encodeURIComponent(t.id)).then(function (j) {
                    var pts = j.points || [];
                    poiNames[t.id] = { total: pts.length ? +pts[pts.length - 1][3] : 0, pois: j.pois || [] };
                }, function () { /* 이름표 없이 */ });
            }));
            var poiWait = Promise.race([Promise.all([poiReady, notesReady]), new Promise(function (ok) { setTimeout(ok, 4000); })]);
            // 국립공원도 "지리산 탐방 안내도" - "국립공원" 을 붙이면 375px 에서 공식 지도 단추에 잘림(2026-10-12)
            if (data.map && /^https:\/\//.test(data.map)) {   // https 주소만(javascript: 등은 넣지 않음 - 2026-10-11 점검)
                $("official").href = data.map;
                $("official").style.display = "inline-block";
                $("credit").style.display = "block";
            }
            map = new maplibregl.Map({ container: "map", style: RF.baseStyle(cfg), center: [127.8, 36.3], zoom: 7,
                attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false });
            map.touchZoomRotate.disableRotation();
            map.addControl(new maplibregl.AttributionControl({ compact: true,
                customAttribution: (data.national ? "탐방로: 국립공원공단 탐방로 공간데이터" : "등산로: 산림청 · 한국등산트레킹지원센터 · OpenStreetMap")
                    + " | 지명: © OpenStreetMap contributors | <a href=\"about.html\">안내</a>" }), "top-right");
            // 출처는 ⓘ 로 접어 둠(따라가기 화면과 같게 - 지도를 가리지 않게)
            var fold = function () { var a = document.querySelector(".maplibregl-ctrl-attrib"); if (a) a.classList.remove("maplibregl-compact-show"); };
            fold();
            map.once("load", fold);
            map.addControl(new maplibregl.ScaleControl({ maxWidth: 90 }), "bottom-left");
            map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), "bottom-right");
            map.once("load", function () {
                poiWait.then(function () {
                    draw();
                    if (cfg.vworldKey) {   // 바탕 바꾸기는 탐방로 층이 생긴 뒤에
                        $("layerBtn").style.display = "block";
                        $("layerBtn").addEventListener("click", function () { setLight(!light); });
                    }
                });
            });
        }).catch(function (e) {
            $("msg").textContent = e.message || "공원 탐방로를 읽지 못했습니다.";
        });
    }

    start();
})();
