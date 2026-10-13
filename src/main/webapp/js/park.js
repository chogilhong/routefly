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
    var BEST_KEY = "rf-park-best";   // 마지막으로 고른 대표 코스 {park, k} · 직접 고른 구간 {park, ids}
    var sel = [], lines = {}, flips = {}, byId = {}, segs = [], emptySheet = "", poiNames = {}, noteNames = null, notePass = null, noteEle = null, noteTrails = null, noteHeads = null, noteBest = null, noteAll = null;
    var chosen = [], startMk = null, endMk = null, apartNote = false;   // apartNote - 이어지지 않는 탐방로를 눌러 새로 골랐음(한 번 알림)

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
    // 이어져 있지만 끝이 셋 이상으로 갈라진 묶음 - 그 끝 이름을(2026-10-13 PC: 설악산 소공원 → 비선대 → 마등령 → 무너미고개 + 갈림길 → 양폭대피소,
    // 양폭대피소 → 무너미고개가 빠졌는데 "아직 이어지지 않은 구간"이라고만 나왔음)
    function looseText(pts) {
        var names = [];
        (pts || []).forEach(function (p) {
            var nm = null;
            chosen.forEach(function (id) {
                var l = lines[id], t = byId[id];
                if (nm || !l || !t) return;
                var e = RF.routeEnds(t.name), a = flips[id] ? e.to : e.from, b = flips[id] ? e.from : e.to;
                if (RF.distM(p[1], p[0], l[0][1], l[0][0]) < 150) nm = a;
                else if (RF.distM(p[1], p[0], l[l.length - 1][1], l[l.length - 1][0]) < 150) nm = b;
            });
            if (nm && noteNames && Object.prototype.hasOwnProperty.call(noteNames, nm.replace(/\s+/g, ""))) nm = noteNames[nm.replace(/\s+/g, "")];
            if (nm && names.indexOf(nm) < 0) names.push(nm);
        });
        if (names.length < 3) return "아직 이어지지 않은 구간이 있습니다";
        var many = ["", "", "", "세", "네", "다섯", "여섯"][names.length] || String(names.length);
        return "끝이 " + names.join(" · ") + " " + many + " 곳으로 갈라져 있습니다";
    }

    /**
     * 출발 · 도착 깃발 - 이름표를 노선이 뻗는 쪽의 반대로 펼침(2026-10-13 홍TV님: 북한산 위문 "출발 · 도착 북한산성입구" 가 동쪽으로 가는 노선을 가렸음).
     * 깃발 둘레 700m 안 노선 점들의 방향을 더해, 노선이 동쪽이면 이름표는 서쪽(왼쪽), 북쪽이면 아래로.
     */
    function flagAnchor(p, coords) {
        var sx = 0, sy = 0, k = Math.cos(p[1] * Math.PI / 180);
        (coords || []).forEach(function (q) {
            var d = RF.distM(p[1], p[0], q[1], q[0]);
            if (d < 20 || d > 700) return;
            sx += (q[0] - p[0]) * k * 111320 / d;
            sy += (q[1] - p[1]) * 111320 / d;
        });
        return (sy > 0 ? "top" : "bottom") + "-" + (sx > 0 ? "right" : "left");
    }

    function flagMarker(txt, at, coords, keepIn) {
        var e = document.createElement("div"), a = flagAnchor(at, coords);
        e.className = "flag " + a;   // 꼬리(뾰족한 모서리)는 깃발 자리 쪽
        RF.nameNodes(e, txt);   // 탐방지원센터는 작은 글씨
        var m = new maplibregl.Marker({ element: e, anchor: a }).setLngLat(at).addTo(map);
        m._keepIn = !!keepIn;
        if (keepIn) requestAnimationFrame(keepFlagsIn);
        return m;
    }

    /**
     * 지도를 다시 맞추지 않는 깃발(지도에서 구간을 직접 고름 · 예시 · 되살리기)이 화면 밖으로 나가면 안쪽으로 뒤집음
     * (2026-10-13 PC: 곰배령 "도착 강선리" 가 오른쪽 끝에서 잘림, 되살린 예시 깃발이 x 398 까지). 지도가 멈출 때마다 다시 잼.
     */
    function keepFlagsIn() {
        var W = map.getContainer().clientWidth;
        var fix = function (m) {
            if (!m || !m._keepIn) return m;
            var e = m.getElement(), a = (e.className.match(/(top|bottom)-(left|right)/) || [])[0], w = e.offsetWidth;
            if (!a || !w) return m;
            var px = map.project(m.getLngLat()), right = /-left$/.test(a);
            var out = right ? px.x + w > W - 8 : px.x - w < 8, room = right ? px.x - w >= 8 : px.x + w <= W - 8;
            if (!out || !room) return m;   // 반대쪽도 모자라면 그대로
            var b = a.replace(/-(left|right)$/, right ? "-right" : "-left"), ll = m.getLngLat();
            e.className = e.className.replace(a, b);
            m.remove();   // maplibre Marker 는 anchor 를 바꾸는 함수가 없어 새로
            var n = new maplibregl.Marker({ element: el2(e), anchor: b }).setLngLat(ll).addTo(map);
            n._keepIn = true;
            return n;
        };
        startMk = fix(startMk);
        endMk = fix(endMk);
    }
    /** Marker 가 붙였던 maplibregl-marker 꼴을 떼고 flag 꼴만 남김(새 Marker 가 다시 붙임). */
    function el2(e) {
        e.className = e.className.split(" ").filter(function (c) { return c && !/^maplibregl-/.test(c); }).join(" ");
        e.removeAttribute("style");
        return e;
    }

    /** 지도 맞춤 여백 - 깃발 이름표가 펼쳐지는 쪽(왼쪽 · 오른쪽)은 깃발 너비만큼 더. */
    function flagPad() {
        var pad = { top: 40, bottom: 40, left: 40, right: 40 };
        [startMk, endMk].forEach(function (m) {
            if (!m) return;
            var e = m.getElement(), c = e.classList, wd = e.offsetWidth ? e.offsetWidth + 16 : 130;   // 깃발 너비만큼("출발 · 도착 북한산성입구" 160px · "출발 화엄사" 90px - 130 으로 묶으면 화대종주가 작게 그려졌음)
            if (c.contains("bottom-left") || c.contains("top-left")) pad.right = Math.max(pad.right, wd); else pad.left = Math.max(pad.left, wd);
        });
        return pad;
    }

    /**
     * 지금 고른 노선(한 줄로 걷는 편도 · 같은 구간 두 번 없음)의 중간 갈림길에 t 가 붙으면 [처음 ~ 그 갈림길 구간들, t] - 아니면 null.
     * 출발 · 도착에 붙거나 어디에도 안 붙으면 null(전처럼 더함).
     */
    function chainCut(t) {
        if (!chosen.length || !lines[t.id]) return null;
        var p = planOf(chosen);
        if (!p.ok || p.loop || !p.walk || p.walk.length < 2) return null;
        var w = p.walk, seen = {};
        if (w.some(function (s) { var dup = seen[s.id]; seen[s.id] = true; return dup; })) return null;   // 올랐다 내려오는 갈래가 있는 묶음은 그대로
        var endOf = function (s) { var l = lines[s.id]; return s.rev ? l[0] : l[l.length - 1]; };
        var startOf = function (s) { var l = lines[s.id]; return s.rev ? l[l.length - 1] : l[0]; };
        var L = lines[t.id], ends = [L[0], L[L.length - 1]];
        var touches = function (q) { return ends.some(function (e) { return RF.distM(e[1], e[0], q[1], q[0]) < 150; }); };
        if (touches(startOf(w[0])) || touches(endOf(w[w.length - 1]))) return null;
        for (var k = 0; k < w.length - 1; k++) {
            if (touches(endOf(w[k]))) return w.slice(0, k + 1).map(function (s) { return s.id; }).concat([t.id]);
        }
        return null;
    }

    function pick(t) {
        if (t) {
            exStart = null;
            exRound = null;
            exPeak = null;
            var k = chosen.indexOf(t.id);
            if (k >= 0) {
                chosen.splice(k, 1);
                if (chosen.length && !planOf(chosen).ok) chosen = groupOf(chosen, chosen[0]);
                if (chosen.length && !planOf(chosen).ok) chosen = [];
            } else {
                // 노선은 출발 · 도착에서만 이어 감 - 중간 갈림길에 붙는 탐방로를 누르면 그 갈림길부터 원래 도착까지는 빼고
                // 누른 탐방로가 새 도착(2026-10-13 홍TV님: 중간에서 갈래가 붙어 올랐다 내려오는 4구간이 됐음)
                var cut = chainCut(t);
                if (cut) chosen = cut;
                else chosen.push(t.id);
                // 아직 이어지지 않은 탐방로는 기다렸다 이어 주는 탐방로를 누르면 합침(2026-10-13 PC: 누르는 차례에 따라 새로 골라졌음),
                // 걸을 수 없는 모양일 때만 그 탐방로로 새로
                if (planOf(chosen).reason === "shape") chosen = [t.id];
                // 사이에 이어 줄 탐방로가 아예 없으면(태안해안 - 서로 이을 수 없는 구간, 2026-10-13 홍TV님) 그 탐방로로 새로
                else if (chosen.length > 1 && !RF.canJoin(chosen, lines)) { chosen = [t.id]; apartNote = true; }
            }
        }
        // 지도에서 직접 고른 구간도 따라가기에서 돌아오면 그대로(2026-10-13 PC) - 예시(exStart …)로 고른 것은 다시 짜지 않고 구간만
        if (t) try {
            if (chosen.length) sessionStorage.setItem(BEST_KEY, JSON.stringify({ park: park, ids: chosen }));
            else sessionStorage.removeItem(BEST_KEY);
        } catch (err) { }
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
            w.textContent = chosen.length + "구간을 골랐습니다. " + looseText(plan.loose) + " - 사이 탐방로를 더 누르세요(다시 누르면 뺍니다).";
            $("sheet").appendChild(w);
            return;
        }
        if (!sel.length) { $("sheet").innerHTML = emptySheet; return; }
        // 출발(들머리) · 도착을 지도에(2026-10-12 홍TV님: 중산리탐방지원센터가 들머리인데 지도에 표시)
        var walkLine = [];
        chosen.forEach(function (id) { if (lines[id]) walkLine = walkLine.concat(lines[id]); });
        var flag = function (txt, at) { return flagMarker(txt, at, walkLine, true); };
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
        // 출발 · 도착이 들머리면 지도의 들머리 이름(300m - 2026-10-13 PC: 3구간이 되면 "한계령탐방지원센터" 가 "한계령" 으로 짧아졌음)
        var headAt = function (p) {
            var best = null, bd = 300;
            (planHeads || []).forEach(function (h) { var x = RF.distM(p[1], p[0], +h.lat, +h.lon); if (x < bd) { bd = x; best = h.name; } });
            return best;
        };
        // 원점회귀 예시는 그 들머리 이름(북한산 구기탐방지원센터 자리 구간 끝 이름이 "비봉능선")
        var from = (exStart && exHead) || headAt(plan.start) || ends(sel[0])[0] || nearName(plan.start),
            to = round ? from : (exStart && exPeak) || headAt(plan.end) || ends(sel[sel.length - 1])[1] || nearName(plan.end);
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
        // 예시로 고른 탐방로 하나는 걷는 방향 이름(한려해상 "가라산정상 → 다대저수지상부" 는 거꾸로 그린 선 - 대성사 → 가라산)
        RF.nameNodes(nm, one && exStart && !round && from && to ? RF.nameParts(one.name).group + " · " + RF.endsText(from, to)
            : one ? one.name : round ? (from || "") + " 원점회귀 · " + chosen.length + "구간"
            : chosen.length + "구간 이어 걷기" + (from || to ? " · " + RF.endsText(from, to) : ""));
        var st = document.createElement("div");
        st.className = "st";
        st.textContent = RF.km(meters) + "km" + (one && one.ascent_m != null ? " · 오르막 " + RF.num(one.ascent_m) + "m" : " · 오르막은 따라가기 화면에서")
            + (full.some(function (s) { return byId[s.id].extra; }) ? " · 옅은 선은 산림청 · 등산트레킹 자료" : "");
        var row = document.createElement("div");
        row.className = "row";
        var link = function (list) {
            list = RF.flattenSel(list);   // 이은 구간(무등산)은 코스 조각으로 풀어서
            // 원점회귀 예시는 들머리 이름도(따라가기 제목 - 2026-10-13 홍TV님: "새재 원점회귀" 가 아니라 윗새재마을)
            return "hike.html#c=" + (list.length === 1 ? encodeURIComponent(list[0].id) + (list[0].rev ? "&rev=1" : "") : encodeURIComponent(RF.joinId(list)))
                + (exHead || from ? "&head=" + encodeURIComponent(exHead || from) : "")   // 지도의 출발 이름을 따라가기 출발 이름표로(권금성 · 신흥사가 섞였음)
                + viaTag();   // 탐방 안내도에서 들어감 - 따라가기 아래 "← 안내도" 단추는 이때만(2026-10-13 홍TV님)
        };
        // 원점회귀는 어느 쪽으로 먼저 도는지 - 두 방향이 처음 갈라지는 곳의 이름(들머리에서 같은 길로 오르는 부분은 건너뜀)
        var fwdN = full.map(function (s) { return ends(s)[1]; }), bwdN = RF.reverseSel(full).map(function (s) { return ends(s)[1]; }), dv = 0;
        while (dv < fwdN.length - 1 && fwdN[dv] === bwdN[dv]) dv++;
        // "갈림길" 은 어느 쪽인지 모름 - 그 뒤 처음 이름 있는 곳(2026-10-13: 지리산 예시가 "갈림길 쪽으로 먼저")
        var known = function (list) {
            // 행정 경계 · 코스 이름 · 정자도 길 방향 이름으로는 모름(2026-10-13 PC: "강북·도봉구 경계" · "신선봉코스" · "관음봉 정자")
            for (var i = dv; i < list.length; i++) if (list[i] && !/(^갈림길|탐방로 끝|경계|코스\s*\d*|정자|쪽 끝|부근)$/.test(list[i])) return list[i];
            return null;
        };
        // 두 단추가 같은 이름이면(계룡산 갑사 - 둘 다 "삼불봉") 반대쪽은 그다음 다른 이름
        var known2 = function (list, not) {
            for (var i = dv; i < list.length; i++) if (list[i] && list[i] !== not && !/(^갈림길|탐방로 끝|경계|코스\s*\d*|정자|쪽 끝|부근)$/.test(list[i])) return list[i];
            return null;
        };
        var k1 = known(fwdN), k2 = known2(bwdN, k1);
        // 반대쪽에 다른 이름이 없으면 "삼불봉 나중에"(2026-10-13 PC: 계룡산 갑사 - "반대 방향 쪽으로 먼저")
        var labels = round ? [(k1 || "이 방향") + " 쪽으로 먼저", k2 ? k2 + " 쪽으로 먼저" : k1 ? k1 + " 나중에" : "반대 방향으로"]
            : from && to ? [from + " → " + to, to + " → " + from] : ["따라가기", "거꾸로 따라가기"];
        var second = RF.reverseSel(full);
        // 들머리에서 정상 같은 막다른 곳까지면 "왕복"(올랐다 같은 길로 들머리) - 한라산 성판악 ↔ 백록담처럼 고리가 없는 산의 원점회귀(2026-10-13 홍TV님)
        var headNear = function (p) { return (planHeads || data.heads || []).some(function (h) { return RF.distM(p[1], p[0], +h.lat, +h.lon) < 500; }); };
        // 들머리 자료가 적은 산(한라산은 어리목탐방안내소 하나)은 끝 이름이 정상 · 봉 · 오름 · 대피소 · 분기점이면
        // 왕복 예시를 눌렀으면 늘(2026-10-13 PC: 범왕교 ↔ 반야봉 왕복이 편도 단추만)
        if (!round && (exRound === false || (!headNear(plan.end) && (headNear(plan.start) || /(정상|봉|산|대|오름|분기점|대피소)$/.test(to || ""))))) {
            labels = [(from || "") + " → " + (to || "") + " 편도", (to || "정상") + " 왕복"];
            second = full.concat(RF.reverseSel(full));
        }
        [[labels[0], full], [labels[1], second]].forEach(function (d, k) {
            var a = document.createElement("a");
            if (k === 0) a.className = "main";
            a.href = link(d[1]);
            // 단추는 좁아 "탐방지원센터" 를 "탐방" 으로(2026-10-13 홍TV님: "한계령탐" 처럼 잘렸음)
            RF.nameNodes(a, d[0].replace(/탐방지원센터/g, "탐방"));
            row.appendChild(a);
        });
        var tip = document.createElement("div");
        tip.className = "tip";
        tip.textContent = apartNote ? "앞서 고른 구간과 이어지는 탐방로가 없어 이 구간으로 새로 골랐습니다."
            : round ? "출발한 들머리로 돌아오는 코스입니다(정상 같은 갈래는 올랐다 같은 길로). 어느 쪽으로 먼저 돌지 고르세요."
            : "이어진 탐방로를 더 누르면 함께 고르고, 다시 누르면 뺍니다. 따라갈 방향을 고르세요.";
        apartNote = false;
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
        // 지나갈 수 없는 곳(park-notes noPass - 한라산 남벽분기점 → 백록담은 길이 없음)
        var block = [];
        (notePass || []).forEach(function (n) {
            (data.places || []).forEach(function (q) { if (String(q.name).replace(/\s+/g, "") === n) block.push([+q.lon, +q.lat]); });
        });
        examples = RF.loopExamples(segs, hs, peaks, { planHeads: planHeads, block: block });
        // 대표 코스와 같은 왕복(들머리 · 봉우리 이름이 대표 코스 이름에 다 있음)은 빼고 - 다른 길로 도는 원점회귀는 남김
        var key = function (n) { return String(n || "").replace(/\s+/g, "").replace(/(탐방지원센터|탐방안내소|분소)$/, "").replace(/^\S+산\s*(?=\S)/, ""); };
        examples = examples.filter(function (x) {
            return x.loop || !(noteBest || []).some(function (b) {
                var bn = String(b.name || "").replace(/\s+/g, ""), hk = key(x.head);
                // 들머리는 앞부분이 같아도("관음사지구탐방지원센터" · "관음사")
                var headIn = bn.split("→").some(function (w) { return w && (hk.indexOf(w) === 0 || w.indexOf(hk) === 0); });
                return headIn && (bn.indexOf(key(x.peak)) >= 0 || /정상$/.test(x.peak) && /정상/.test(bn));
            });
        });
        if (!examples.length && !(noteBest || []).length) return;
        var box = document.createElement("div");
        box.className = "ex";
        var h = document.createElement("div");
        h.className = "exh";
        box.appendChild(h);
        var row = document.createElement("div");
        row.className = "exr";
        box.appendChild(row);
        // 대표 코스(park-notes best - 2026-10-13 홍TV님: 설악산 공룡능선) - 맨 앞, 누르면 그 코스 선을 지도에
        (noteBest || []).forEach(function (b, k) {
            var a = document.createElement("a");
            a.href = "#";
            a.setAttribute("data-best", String(k));
            var l1 = document.createElement("span"), l2 = document.createElement("span");
            l1.className = "l1";
            l2.className = "l2";
            l1.textContent = "★ " + b.label;
            l2.textContent = "대표 코스";
            a.appendChild(l1);
            a.appendChild(l2);
            row.appendChild(a);
        });
        examples.forEach(function (x, k) {
            var a = document.createElement("a");
            a.href = "#";
            a.setAttribute("data-ex", String(k));
            // 두 줄 - 들머리 / 봉우리 · 거리(2026-10-13 홍TV님: "남설악탐방지원센터" 처럼 길면 한 줄에 다 안 보였음)
            var l1 = document.createElement("span"), l2 = document.createElement("span");
            l1.className = "l1";
            l2.className = "l2";
            RF.nameNodes(l1, (x.loop ? "↻ " : "⇄ ") + x.head);
            l2.textContent = "↔ " + x.peak + (x.loop ? " 원점회귀" : " 왕복") + " · " + RF.km(x.m) + "km";
            a.appendChild(l1);
            a.appendChild(l2);
            row.appendChild(a);
        });
        // 아래 칸 높이는 그대로(탐방로를 골랐을 때와 같게) - 안내 글은 예시 제목에 넣음
        h.textContent = ((noteBest || []).length ? "대표 코스" + (examples.length ? " · 원점회귀 예시" : "") : "원점회귀 예시") + "(옆으로 넘김) · 탐방로를 눌러 직접 고를 수도 있습니다";
        var tip = $("sheet").querySelector(".tip");
        if (tip) tip.parentNode.removeChild(tip);   // 목록에서 온 화면도(두 줄 단추로 높이가 165px 이 됐음)
        $("sheet").insertBefore(box, $("sheet").firstChild);
        emptySheet = $("sheet").innerHTML;
        restoreBest();
    }

    /** 고른 구간이 보이게 지도를 맞춤(ms 0 이면 바로 - 그 뒤 깃발이 화면 안인지 재려고). */
    function fitIds(ids, ms) {
        var w = 180, so = 90, e2 = -180, n = -90;
        ids.forEach(function (id) { (lines[id] || []).forEach(function (q) { w = Math.min(w, q[0]); e2 = Math.max(e2, q[0]); so = Math.min(so, q[1]); n = Math.max(n, q[1]); }); });
        if (w < e2) map.fitBounds([[w, so], [e2, n]], { padding: ms ? flagPad() : 60, duration: ms, maxZoom: 15 });
    }

    /** 원점회귀 예시 칩 k 를 고름 - 돌아오면 다시 고르게 남김(2026-10-13 PC: 칩으로 다녀오면 그 전에 직접 고른 구간이 나왔음). */
    function useExample(k, ms) {
        var x = examples[k];
        if (!x) return;
        chosen = x.ids.slice();
        exStart = x.start;
        exHead = x.head;
        exRound = x.loop;
        exPeak = x.loop ? null : x.peak;
        try { sessionStorage.setItem(BEST_KEY, JSON.stringify({ park: park, ex: k })); } catch (err) { }
        if (!ms) fitIds(x.ids, 0);
        pick();
        if (ms) fitIds(x.ids, ms);   // 고른 예시가 보이게 확대
    }

    // 따라가기의 "탐방 안내도" 로 뒤로 돌아오면 고른 대표 코스를 다시 보임(2026-10-13 홍TV님) - 이 탭 동안만, 한 번
    var bestRestored = false;
    function restoreBest() {
        if (bestRestored) return;
        bestRestored = true;
        var nav = window.performance && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
        if (!nav || nav.type !== "back_forward") return;
        var v = null;
        try { v = JSON.parse(sessionStorage.getItem(BEST_KEY) || "null"); } catch (err) { v = null; }
        if (!v || v.park !== park) return;
        if (v.ex != null && examples[v.ex]) { useExample(v.ex, 0); return; }
        // 지도를 그 구간에 먼저 맞춘 뒤 고름 - 깃발이 화면 안인지를 맞춘 화면으로 재야 처음과 같은 방향(2026-10-13 PC)
        if (v.ids && v.ids.length && v.ids.every(function (id) { return lines[id]; })) { fitIds(v.ids, 0); chosen = v.ids.slice(); pick(); return; }
        var b = v.k != null && (noteBest || [])[v.k];
        if (b) showBest(b);
    }

    /**
     * 대표 코스(park-notes best)를 지도에 - 그 코스 선 · 출발 깃발, 아래 칸에 이름 · 거리 · 오르막과 따라가기.
     * course 는 코스 ID 하나, 또는 이은 코스 ID("가,가~" 왕복 · "가,나@0.35-0.42:코재>무넹기보,다~" 종주 - 따라가기와 같은 꼴), name 은 보일 길 이름.
     */
    /**
     * 따라가기 주소에 붙일 "탐방 안내도에서 왔음"(&via=park) - 따라가기의 🏞 로 연 탐방 안내도(&from=, 목록 카드 아님)에서 다시 따라가기로 가면
     * 붙이지 않음(2026-10-13 홍TV님: 코스가 산의 어디인지 보러 왔다 돌아간 것이라 "← 안내도" 가 필요 없음).
     */
    // 🏞 로 연 곳에서 가면 "&via=map" - 따라가기는 "← 안내도" 도, 지도 위 🏞 도 안 보임(2026-10-13 홍TV님: 🏞 가 다시 생겼음)
    function viaTag() { return from && backTo !== "list" ? "&via=map" : "&via=park"; }

    function showBest(b, keepView) {
        var parts = RF.parseJoinId(b.course) || [{ id: b.course, base: b.course, rev: false, r0: null, r1: null }];
        var bases = parts.map(function (p) { return p.base; }).filter(function (x, k, arr) { return arr.indexOf(x) === k; });
        Promise.all(bases.map(function (id) { return getJson("api/course?id=" + encodeURIComponent(id)); })).then(function (rs) {
            var got = {};
            bases.forEach(function (id, k) { got[id] = rs[k]; });
            var pts = [], meters = 0;
            parts.forEach(function (p) {
                var j = got[p.base], P = (j && j.points) || [];
                if (P.length < 2) return;
                var T = +P[P.length - 1][3], d0 = p.r0 == null ? 0 : p.r0 * T, d1 = p.r1 == null ? T : p.r1 * T;
                var seg = P.filter(function (q) { return +q[3] >= d0 - 1 && +q[3] <= d1 + 1; }).map(function (q) { return [+q[0], +q[1]]; });
                if (p.rev) seg.reverse();
                pts = pts.concat(seg);
                meters += d1 - d0;
            });
            if (pts.length < 2) return;
            if (b.rev) pts.reverse();   // 선 방향과 반대로 걷는 대표 코스(태안해변길 4코스 몽산포 → 드르니항)
            var one = parts.length === 1 ? got[parts[0].base] : null;
            chosen = [];
            exStart = exHead = exRound = exPeak = null;
            map.getSource("sel").setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } }] });
            if (startMk) { startMk.remove(); startMk = null; }
            if (endMk) { endMk.remove(); endMk = null; }
            var name = RF.aliasName(b.name ? park + " · " + b.name : RF.noteTrailName(noteAll, b.course, one ? one.course.name : park), noteNames), e = RF.routeEnds(name);
            var loop = !!(e.from && e.from === e.to);
            // 산 전체 지도(🏞 로 옴)는 코스에 맞추지 않으니 깃발이 화면 밖이면 안쪽으로(2026-10-13 PC: ★ 위문 깃발이 x -74 로 잘림)
            var mk = function (txt, at) { return flagMarker(txt, at, pts, !!keepView); };
            if (e.from) startMk = mk((loop ? "🚩 출발 · 도착 " : "🚩 출발 ") + e.from, pts[0]);
            if (e.to && !loop) endMk = mk("🏁 도착 " + e.to, pts[pts.length - 1]);
            var w = 180, so = 90, e2 = -180, n = -90;
            pts.forEach(function (q) { w = Math.min(w, q[0]); e2 = Math.max(e2, q[0]); so = Math.min(so, q[1]); n = Math.max(n, q[1]); });
            // 깃발 글자가 펼쳐지는 쪽은 그만큼 더 띄움(공룡능선 "출발 · 도착 비선대" 가 화면 끝에서 잘렸음)
            if (keepView) overview(0);   // 🏞 로 온 코스 - 산 전체에서 어디인지
            else map.fitBounds([[w, so], [e2, n]], { padding: flagPad(), duration: 600, maxZoom: 15 });
            $("sheet").innerHTML = "";
            var nm = document.createElement("div");
            nm.className = "nm";
            RF.nameNodes(nm, b.label ? "★ " + b.label + " · " + RF.nameText(name, true) : RF.nameText(name, true));   // 탐방로가 아닌 코스(🏞 로 온 우이령길)는 이름만
            var st = document.createElement("div");
            st.className = "st";
            st.textContent = RF.km(meters) + "km" + (one && one.course.ascent_m != null ? " · 오르막 " + RF.num(+one.course.ascent_m) + "m" : "") + (b.label ? " · 대표 코스" : "");
            var row = document.createElement("div");
            row.className = "row";
            // 길 이름을 따라가기 제목으로(&title= - 이은 코스는 "N구간 이어 걷기" 가 됨)
            var href = "hike.html#c=" + encodeURIComponent(b.course) + (b.rev && parts.length === 1 ? "&rev=1" : "") + (b.name ? "&title=" + encodeURIComponent(b.name) : "")
                + (b.name && e.from ? "&head=" + encodeURIComponent(e.from) : "")   // 들머리 이름표(설악산 공룡능선 - 산림청 선 처음 이름 "권금성" 대신 소공원)
                + viaTag();
            // 둘째 단추는 처음 탐방 안내도 아래 칸으로(2026-10-13 홍TV님: "예시로" → 탐방 안내도)
            [["따라가기", href, true], ["탐방 안내도", "#", false]].forEach(function (d) {
                var a = document.createElement("a");
                a.textContent = d[0];
                a.href = d[1];
                if (d[2]) a.className = "main";
                else a.addEventListener("click", function (ev) {
                    ev.preventDefault();
                    map.getSource("sel").setData({ type: "FeatureCollection", features: [] });
                    if (startMk) { startMk.remove(); startMk = null; }
                    if (endMk) { endMk.remove(); endMk = null; }
                    $("sheet").innerHTML = emptySheet;
                    try { sessionStorage.removeItem(BEST_KEY); } catch (err) { }
                    overview(600);
                });
                row.appendChild(a);
            });
            $("sheet").appendChild(nm);
            $("sheet").appendChild(st);
            $("sheet").appendChild(row);
        }).catch(function () { /* 코스를 못 받음 - 그대로 */ });
    }

    // 원점회귀 예시를 눌렀을 때 그 들머리 자리 · 이름 · 고리인지 · 왕복의 봉우리(탐방로를 직접 누르면 지움) - 봉우리는 예시 이름으로
    // (한려해상 가라산 - 거꾸로 그린 선이라 끝 이름이 "다대저수지상부" 였음)
    var exStart = null, exHead = null, exRound = null, exPeak = null;
    var planHeads = null;
    function planOf(ids) { return RF.planWalk(ids, lines, { heads: planHeads || data.heads, first: ids[0], start: exStart }); }

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
            // 공단 자료 이름이 틀린 탐방로(park-notes trails - 설악산 knps-4014 "소공원 → 희운각대피소" 는 양폭대피소 → 무너미고개)
            x.name = noteTrails ? RF.noteTrailName({ p: { trails: noteTrails } }, t.id, t.name) : t.name;
            // 산마다 다른 이름은 고친 이름에도(2026-10-13 PC: 설악산 knps-40111 "설악동탐방지원센터 → 비룡폭포쉼터" 로 들머리 🏠 가 설악동탐방지원센터로 남았음)
            x.name = RF.aliasName(x.name, noteNames);
            // 번호뿐인 공단 이름("계룡산 · 계룡산 탐방로 1")은 이름 없는 조각처럼 - 갈림길 사이로 잇고 둘레 지명으로 이름(mergeBare, 2026-10-13 PC:
            // 지도에서 고르면 출발이 "계룡산 탐방로 1")
            if (/(^|\s)탐방로\s*\d+$/.test(RF.nameParts(x.name).route)) x.name = RF.nameParts(x.name).group || park;
            return x;
        });
        // 지명 이름표 · 서버 heads 도 산마다 다른 이름으로(설악산 신흥사 · 설악동탐방지원센터 → 소공원 - 2026-10-13 홍TV님: 메운 길 끝 · 지도 이름표 · 들머리 모두)
        if (noteNames) data.places.concat(data.heads || []).forEach(function (q) {
            var n = String(q.name || "").replace(/\s+/g, "");
            if (Object.prototype.hasOwnProperty.call(noteNames, n)) q.name = noteNames[n];
        });
        // 들머리 이름(다른 자료 코스의 탐방지원센터 · 탐방안내소) - "중산리" 끝이 중산리탐방지원센터 500m 안이면 그 이름으로
        data.trails = RF.headAlias(data.trails, data.heads);
        // 이름의 거쳐 가는 곳에서 시작 · 끝나는 선은 이름을 거기까지(지리산 "쟁기소 → 반야봉 → 삼도봉삼거리" 선은 반야봉부터)
        data.trails = RF.viaTrim(data.trails, data.places);
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
        map.on("moveend", keepFlagsIn);   // 지도를 맞추거나 옮긴 뒤 깃발이 화면 밖이면 안쪽으로
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
        // 탐방지원센터 · 탐방안내소. 같은 이름 이름표가 그 자리에 있으면 그 이름표를 들머리로
        data.places = RF.dedupePlaceNames(data.places);   // "설악산 울산바위" · "울산바위" 같은 자리 둘
        data.places.forEach(function (p) { if (noteEle && noteEle[p.name] != null) p.ele_m = noteEle[p.name]; });
        // 서버 heads(탐방지원센터 · 탐방안내소)도 trailHeads 가 합침 - "백무동" · "백무동탐방지원센터" 처럼 같은 곳은 하나(2026-10-13 PC)
        var hs = RF.trailHeads(segs, data.heads, flips, data.others, data.places, noteHeads);
        // 출발 · 도착을 고르는 들머리 - 지도의 들머리 · 날머리 모두(한계령 · 송추처럼 탐방지원센터 자료에 없는 곳도)
        planHeads = (data.heads || []).concat(hs);
        showExamples(hs);
        // 이미 지명 이름표가 있으면(성삼재 960m · 어승생악) 그 이름표를 들머리 표시로 - 예전에는 건너뛰어 🥾 가 없었음(2026-10-13 PC)
        hs.forEach(function (h) {
            var k = String(h.name).replace(/\s+/g, "");
            // 같은 이름 이름표가 들머리 300m 안일 때만 그 이름표를 들머리로(북한산 청봉사 이름표는 탐방로 끝에서 370m - 따로 그림)
            var same = data.places.filter(function (p) { return String(p.name).replace(/\s+/g, "") === k && RF.distM(+p.lat, +p.lon, h.lat, h.lon) < 300; });
            if (!same.length) { data.places.push({ name: h.name, lat: h.lat, lon: h.lon, ele_m: null, head: true }); return; }
            same.forEach(function (p) { p.head = true; });
        });
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

        overview(0);
        // 목록 카드에서 왔으면 from 은 그 산을 찾는 데만 쓰고 고르지 않음(아무 코스나 골라져 있어 헷갈렸음)
        if (from && !listMode) {
            // 따라가기의 🏞 로 왔으면 지도는 산 전체(코스가 산의 어디인지 - 2026-10-13 홍TV님: 코스만 크게 보였음). 첫 화면 맞춤(overview)을 그대로 두고 고르기만
            // 이어 걷기(구간,구간~ - 지도에서 직접 고른 것)는 그 구간들을 다시 고름(2026-10-13 PC: 🏞 로 오면 첫 화면이었음)
            var fp = RF.parseJoinId(from);
            if (fp) {
                var ids = fp.map(function (p) { return p.id; }).filter(function (id, i, a) { return lines[id] && a.indexOf(id) === i; });
                var bestOf = (noteBest || []).filter(function (b) { return b.course === from; })[0];
                if (bestOf) showBest(bestOf, true);   // ★ 대표 코스(북한산 위문 - 통째 탐방로는 갈림길에서 잘려 구간 id 와 다름)
                else if (ids.length && fp.every(function (p) { return lines[p.id]; })) { chosen = ids; pick(); }
            // 이미 골라져 있으면(뒤로 와서 되살림) 다시 누르지 않음 - pick 은 누를 때마다 넣고 빼서, 3D 에서 돌아오면 풀렸었음(2026-10-13 PC)
            } else if (segs.some(function (t) { return t.id === from; })) segs.forEach(function (t) { if (t.id === from && chosen.indexOf(t.id) < 0) pick(t); });
            // 탐방로가 아닌 코스(🏞 로 온 "강북구 우이동 → 장흥면 교현리(우이령길)" 같은 산림청 · 두루누비 코스)는 그 선을 그대로 그림(2026-10-13 홍TV님: 안 그려졌음)
            else {
                // 갈림길에서 잘린 탐방로(🏞 로 온 북한산 "강북구 우이동 → 장흥면 교현리(우이령길)" knps-150195)는 그 조각을 모두 고름(2026-10-13 홍TV님: 안 그려졌음),
                // 탐방로가 아닌 코스(산림청 · 두루누비)는 그 선을 그대로 그림
                var pieces = segs.filter(function (t) { return t.id.indexOf(from + "@") === 0; }).map(function (t) { return t.id; });
                if (pieces.length) { chosen = pieces; pick(); }
                else showBest({ course: from }, true);
            }
        }
        $("msg").style.display = "none";
    }

    /** 처음 화면처럼 공원 전체가 보이게(대표 코스에서 [탐방 안내도] 로 돌아올 때도 - 2026-10-13 홍TV님). */
    function overview(ms) {
        // 2026-10-12 홍TV님 "조금 키워야": 여백 30 → 옆 20(이름표가 끝에 걸쳐 잘리지 않게) · 위아래 24, 한도 14 → 14.6(막대 200m 쯤).
        // 작은 산은 둘레 마을 · 길까지 보이게 확대 한도 14(MapLibre 512px 줌 - 폭 375px 폰에서 축척 막대 300m, 15 는 100m 였음 2026-10-12 터널로 확인) - 2026-10-12 홍TV님: 공주향교뒷산(코스 0.3km)이 막대 50m 로 너무 크게 보였음
        var b = data.bbox;
        map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { top: 24, bottom: 24, left: 20, right: 20 }, duration: ms, maxZoom: OVERVIEW_MAX_ZOOM });
    }

    /** 전체 보기 첫 화면의 최대 확대(손으로는 더 확대할 수 있음). */
    var OVERVIEW_MAX_ZOOM = 14.6;

    /** 따라가기 첫 화면 목록의 탐방 안내도 카드에서 왔는가 - ‹ 코스 단추 없이, 아래는 "따라가기" 하나. */
    var listMode = backTo === "list";

    /** 그 산의 입산 · 통제 · 예약 안내(data/park-notes.json, 2026-10-12 홍TV님: 한라산) - 한 줄, 누르면 다 보임. 없으면 안 보임. */
    function showNote(name) {
        return fetch("data/park-notes.json").then(function (r) { return r.json(); }).then(function (d) {
            noteAll = d && d.parks;
            var n = d && d.parks && d.parks[name];
            if (!n) return;
            noteNames = n.names || null;   // 산마다 다른 이름(지리산 중산리 → 중산리탐방지원센터) - 그리기 전에 받음
            notePass = n.noPass || null;   // 지나갈 수 없는 곳(한라산 남벽분기점) - 원점회귀 예시에서 뺌
            noteEle = n.ele || null;   // 바로잡은 높이(지리산 천왕봉 1,915m - OSM 은 1,918m)
            noteTrails = n.trails || null;   // 이름을 바로잡은 탐방로(설악산 knps-4014)
            noteHeads = n.heads || null;   // 이름표 가운데 들머리로 넣을 곳(북한산 도선사)
            noteBest = n.best || null;   // 대표 코스(설악산 공룡능선)
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
        // 위 단추 - 기본은 "← 목록"(따라가기 첫 화면)
        if (listMode) {   // 목록 카드에서 왔으면: 위 "← 목록" 은 따라가기 화면(검색 목록 - 검색어는 rf-search 로 남아 있음), 아래 "따라가기" 는 고른 탐방로로
            $("back").textContent = "← 목록";   // 2026-10-13 홍TV님: "← 뒤로" → "← 목록"
            $("back").href = "hike.html";
            $("sheet").classList.add("listmode");
            $("sheet").innerHTML = '<div class="tip">탐방로를 누르면 그 코스를 따라갈 수 있습니다.</div><div class="row"><a class="main" id="followNone" href="hike.html">따라가기</a></div>';
        }
        // 따라가기의 🏞 로 왔어도 위 단추는 park.html 의 기본 "← 목록"(따라가기 첫 화면 - 2026-10-13 홍TV님: "‹ 따라가기" → 목록)
        // 고른 탐방로가 없을 때 아래 칸(모두 빼면 다시 이것으로). 따라가기는 아래 칸에 맡겨 받음(다시 그려도 됨)
        emptySheet = $("sheet").innerHTML;
        $("sheet").addEventListener("click", function (e) {
            var bt = e.target && e.target.closest ? e.target.closest("[data-best]") : null;
            if (bt) {
                e.preventDefault();
                var b = (noteBest || [])[+bt.getAttribute("data-best")];
                try { sessionStorage.setItem(BEST_KEY, JSON.stringify({ park: park, k: +bt.getAttribute("data-best") })); } catch (err) { }
                if (b) showBest(b);
                return;
            }
            var ex = e.target && e.target.closest ? e.target.closest("[data-ex]") : null;
            if (ex) {
                e.preventDefault();
                useExample(+ex.getAttribute("data-ex"), 600);
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
            RF.spotsByZoom(map);   // 위험 · 조망 아이콘은 확대했을 때만
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
