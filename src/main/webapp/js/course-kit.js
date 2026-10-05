/*
 * routefly 공통 도구 - 비행 화면(app.js)과 산행 화면(hike.js)이 같이 씁니다.
 *   - 코스 위치 계산: at(진행 거리 → 위치 · 고도), grade(경사), snap(GPS 위치 → 코스 위 진행 거리 · 벗어난 거리)
 *   - 고도 그래프: 지점 이름(비스듬히) · km 눈금 · 지금 위치 점
 *   - 작은 평면 지도: 북쪽이 위, km 번호 · 지점 · 지금 위치
 * 코스 c = {lon[], lat[], ele[], dist[], total, pois[], course}
 */
(function (global) {
    "use strict";

    var LINE_COLOR = "#38d9ea";
    var NS = "http://www.w3.org/2000/svg";

    function num(n, digits) {
        if (n == null || !isFinite(n)) return "-";
        return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });
    }
    function km(m) { return num(m / 1000, 2); }

    /** 코스 자료(api/course 응답) → 계산하기 쉬운 모양. */
    function fromApi(id, j) {
        var c = { id: id, course: j.course, lon: [], lat: [], ele: [], dist: [], pois: j.pois || [], markers: [] };
        (j.points || []).forEach(function (p) {
            c.lon.push(+p[0]); c.lat.push(+p[1]); c.ele.push(p[2] == null ? null : +p[2]); c.dist.push(+p[3]);
        });
        c.total = c.dist.length ? c.dist[c.dist.length - 1] : 0;
        // 남은 오르막을 빨리 구하려고 누적 오르막(m)을 미리 셉니다
        c.asc = [0];
        for (var i = 1; i < c.ele.length; i++) {
            var de = c.ele[i] != null && c.ele[i - 1] != null ? c.ele[i] - c.ele[i - 1] : 0;
            c.asc.push(c.asc[i - 1] + Math.max(0, de));
        }
        return c;
    }

    function indexAt(c, d) {
        var dist = c.dist, lo = 0, hi = dist.length - 1;
        if (d <= 0) return 0;
        if (d >= c.total) return hi;
        while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            if (dist[mid] <= d) lo = mid; else hi = mid;
        }
        return lo;
    }

    /** 진행 거리 d(m)의 위치 · 고도. 누적 거리 배열에서 이분 탐색 후 선형 보간. */
    function at(c, d) {
        var n = c.dist.length;
        if (d <= 0) return { lon: c.lon[0], lat: c.lat[0], ele: c.ele[0] };
        if (d >= c.total) return { lon: c.lon[n - 1], lat: c.lat[n - 1], ele: c.ele[n - 1] };
        var lo = indexAt(c, d), hi = lo + 1;
        var span = c.dist[hi] - c.dist[lo], t = span > 0 ? (d - c.dist[lo]) / span : 0;
        var e0 = c.ele[lo], e1 = c.ele[hi];
        return {
            lon: c.lon[lo] + (c.lon[hi] - c.lon[lo]) * t,
            lat: c.lat[lo] + (c.lat[hi] - c.lat[lo]) * t,
            ele: e0 == null || e1 == null ? null : e0 + (e1 - e0) * t
        };
    }

    /** 경사(%) - d 앞뒤 50m 고도 차. 고도를 모르면 null. */
    function grade(c, d) {
        var a = at(c, Math.max(0, d - 50)), b = at(c, Math.min(c.total, d + 50));
        var run = Math.min(c.total, d + 50) - Math.max(0, d - 50);
        if (a.ele == null || b.ele == null || run < 20) return null;
        return (b.ele - a.ele) / run * 100;
    }

    /** d 부터 끝까지 남은 오르막(m). */
    function ascentLeft(c, d) {
        var i = indexAt(c, d);
        return Math.max(0, c.asc[c.asc.length - 1] - c.asc[i]);
    }

    /** d 다음의 이름표(출발 자리 것은 빼고). 없으면 null. */
    function nextPoi(c, d) {
        var best = null;
        c.pois.forEach(function (p) {
            var pd = +p.dist_m;
            if (pd > d + 15 && (best == null || pd < +best.dist_m)) best = p;
        });
        return best;
    }

    /**
     * GPS 위치 → 코스 위 진행 거리 d 와 코스에서 벗어난 거리 off(m).
     * 같은 길을 오가거나 도는 코스에서 엉뚱한 쪽에 붙지 않게, 지난 자리(prevD) 앞뒤 800m 를 먼저 보고
     * 거기서 멀면(80m 넘게) 전체에서 다시 찾습니다.
     */
    function snap(c, lat, lon, prevD) {
        var kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540;
        function search(i0, i1) {
            var best = { d: 0, off: Infinity };
            for (var i = Math.max(0, i0); i < Math.min(c.lon.length - 1, i1); i++) {
                var ax = (c.lon[i] - lon) * kx, ay = (c.lat[i] - lat) * ky;
                var bx = (c.lon[i + 1] - lon) * kx, by = (c.lat[i + 1] - lat) * ky;
                var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
                var t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
                var px = ax + dx * t, py = ay + dy * t, off = Math.sqrt(px * px + py * py);
                if (off < best.off) best = { d: c.dist[i] + (c.dist[i + 1] - c.dist[i]) * t, off: off };
            }
            return best;
        }
        if (prevD != null && isFinite(prevD)) {
            var near = search(indexAt(c, prevD - 800), indexAt(c, prevD + 800) + 1);
            if (near.off <= 80) return near;
            var all = search(0, c.lon.length);
            return all.off + 30 < near.off ? all : near;
        }
        return search(0, c.lon.length);
    }

    /** 코스 길이에 맞는 km 표시 간격(1 · 2 · 5 · 10 · 20 · 50km) - 표시가 20개 안쪽이 되게. */
    function kmStep(total) {
        var steps = [1000, 2000, 5000, 10000, 20000, 50000];
        for (var i = 0; i < steps.length; i++) if (total / steps[i] <= 20) return steps[i];
        return 100000;
    }

    /** 순수 함수 - 지점 이름으로 아이콘(이름표 종류는 표에 없어 이름 끝말로 봅니다). */
    function poiIcon(name) {
        var n = (name || "").replace(/\(.*\)$/, "").trim();
        if (/(지원센터|안내소|안내센터|분소|매표소|사무소)/.test(name)) return "ℹ️";
        if (/주차장/.test(n)) return "🅿️";
        if (/케이블카/.test(n)) return "🚡";
        if (/(대피소|산장|쉼터|휴게소)/.test(n)) return "🛖";
        if (/폭포/.test(n)) return "💧";
        if (/(굴|동굴)$/.test(n)) return "🕳️";
        if (/(사|암)$/.test(n)) return "🛕";
        if (/(령|재|고개|치|목)$/.test(n)) return "🚩";
        if (/(봉|산|정상|峰)$/.test(n) || /정상/.test(n)) return "⛰️";
        if (/(대|바위|전망대)$/.test(n)) return "🪨";
        return "📍";
    }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    // ------------------------------------------------------------------ ① 고도 그래프

    var PW = 1000, PH = 100;

    /**
     * box 안에 고도 그래프를 그립니다. 지나온 부분은 하늘색, 지점은 빨간 점 + 비스듬한 이름, 아래에 km 눈금.
     * 돌려주는 값: {set(d)} - 지금 위치를 옮깁니다. opts.onSeek(d) 가 있으면 누른 자리로.
     */
    function profile(box, c, opts) {
        opts = opts || {};
        box.textContent = "";
        box.classList.add("rf-profile");
        var eles = c.ele.filter(function (e) { return e != null; });
        if (eles.length < 2) {
            box.appendChild(el("div", "rf-cap rf-empty", "고도 자료가 없는 코스입니다 - 거리만 표시합니다."));
            return { set: function () {} };
        }
        var min = Math.min.apply(null, eles), max = Math.max.apply(null, eles);
        var pad = Math.max((max - min) * 0.12, 5);
        var lo = min - pad, hi = max + pad * (opts.labels === false ? 1 : 3.2);   // 위쪽은 지점 이름 자리
        function y(e) { return (1 - (e - lo) / (hi - lo)) * PH; }
        var pts = [];
        for (var i = 0; i < c.dist.length; i++) {
            if (c.ele[i] == null) continue;
            pts.push((c.dist[i] / c.total * PW).toFixed(1) + "," + y(c.ele[i]).toFixed(1));
        }
        var uid = "rf" + Math.random().toString(36).slice(2, 8);
        var svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 " + PW + " " + PH);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.innerHTML =
            '<defs><linearGradient id="' + uid + 'g" x1="0" y1="0" x2="0" y2="1">'
            + '<stop offset="0" stop-color="' + LINE_COLOR + '" stop-opacity="0.55"/>'
            + '<stop offset="1" stop-color="' + LINE_COLOR + '" stop-opacity="0.06"/></linearGradient>'
            + '<clipPath id="' + uid + 'c"><rect class="done" x="0" y="0" width="0" height="' + PH + '"/></clipPath></defs>'
            + '<polygon points="0,' + PH + ' ' + pts.join(" ") + ' ' + PW + ',' + PH + '" fill="rgba(255,255,255,0.10)"/>'
            + '<polyline points="' + pts.join(" ") + '" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
            + '<g clip-path="url(#' + uid + 'c)"><polygon points="0,' + PH + ' ' + pts.join(" ") + ' ' + PW + ',' + PH + '" fill="url(#' + uid + 'g)"/>'
            + '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + LINE_COLOR + '" stroke-width="2.5" vector-effect="non-scaling-stroke"/></g>'
            + '<line class="cursor" x1="0" x2="0" y1="0" y2="' + PH + '" stroke="rgba(255,255,255,0.8)" stroke-width="1" vector-effect="non-scaling-stroke"/>';
        box.appendChild(svg);

        // km 눈금(아래)
        var step = kmStep(c.total);
        for (var m = step; m < c.total - Math.max(step * 0.3, c.total * 0.07); m += step) {   // 끝의 총 거리와 겹치지 않게
            var t = el("div", "rf-tick", String(Math.round(m / 1000)));
            t.style.left = (m / c.total * 100) + "%";
            box.appendChild(t);
        }
        // 지점 - 빨간 점 + 비스듬한 이름(영상처럼). 너무 붙은 이름은 건너뜁니다.
        if (opts.labels !== false) {
            var lastX = -1;
            c.pois.slice().sort(function (a, b) { return +a.dist_m - +b.dist_m; }).forEach(function (p) {
                var pd = Math.max(0, Math.min(c.total, +p.dist_m)), pa = at(c, pd);
                if (pa.ele == null) return;
                var xp = pd / c.total * 100;
                var dot = el("div", "rf-pdot");
                dot.style.left = xp + "%";
                dot.style.top = (y(pa.ele) / PH * 100) + "%";
                box.appendChild(dot);
                if (lastX >= 0 && xp - lastX < 6) return;
                lastX = xp;
                var lb = el("div", "rf-plabel", p.name.replace(/\(.*\)$/, "").trim() || p.name);
                if (xp > 72) {   // 오른쪽 끝 이름은 왼쪽 위로 기울여 잘리지 않게
                    lb.classList.add("end");
                    lb.style.right = (100 - xp) + "%";
                } else {
                    lb.style.left = xp + "%";
                }
                lb.style.top = (y(pa.ele) / PH * 100) + "%";
                box.appendChild(lb);
            });
        }
        var capMax = el("div", "rf-cap", "최고 " + num(max) + "m"); capMax.style.cssText = "left:3px;top:0"; box.appendChild(capMax);
        var capTot = el("div", "rf-cap", km(c.total) + "km"); capTot.style.cssText = "right:3px;bottom:1px"; box.appendChild(capTot);
        var me = el("div", "rf-me");
        box.appendChild(me);

        var cursor = svg.querySelector(".cursor"), done = svg.querySelector(".done");
        if (opts.onSeek) {
            box.style.cursor = "pointer";
            box.onclick = function (ev) {
                var r = box.getBoundingClientRect();
                opts.onSeek(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * c.total);
            };
        }
        return {
            set: function (d) {
                var x = d / c.total * PW;
                cursor.setAttribute("x1", x.toFixed(1));
                cursor.setAttribute("x2", x.toFixed(1));
                done.setAttribute("width", x.toFixed(1));
                var p = at(c, d);
                me.style.left = (d / c.total * 100) + "%";
                me.style.top = p.ele == null ? "50%" : (y(p.ele) / PH * 100) + "%";
            }
        };
    }

    // ------------------------------------------------------------------ ③ 작은 평면 지도

    /**
     * box 안에 북쪽이 위인 평면 지도(SVG). 코스 선 · km 번호(동그라미) · 지점(빨간 점) · 출/도 · 지금 위치.
     * 돌려주는 값: {set(d)}.
     */
    function miniMap(box, c) {
        box.textContent = "";
        box.classList.add("rf-mini");
        var lat0 = c.lat.reduce(function (a, b) { return a + b; }, 0) / c.lat.length;
        var kx = Math.cos(lat0 * Math.PI / 180);
        var xs = c.lon.map(function (v) { return v * kx; }), ys = c.lat.map(function (v) { return -v; });
        var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
        var w = Math.max(maxX - minX, 1e-6), h = Math.max(maxY - minY, 1e-6), S = 100 / Math.max(w, h);
        function X(lon) { return (lon * kx - minX) * S + (100 - w * S) / 2; }
        function Y(lat) { return (-lat - minY) * S + (100 - h * S) / 2; }
        var d = c.lon.map(function (lon, i) { return (i ? "L" : "M") + X(lon).toFixed(2) + " " + Y(c.lat[i]).toFixed(2); }).join("");
        var svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "-12 -12 124 124");
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        var html = '<path d="' + d + '" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="4.2" stroke-linejoin="round" stroke-linecap="round"/>'
            + '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
            + '<path class="done" d="' + d + '" pathLength="1000" fill="none" stroke="' + LINE_COLOR + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="0 1000"/>';
        var step = kmStep(c.total);
        for (var m = step; m < c.total - step * 0.3; m += step) {
            var p = at(c, m);
            html += '<g transform="translate(' + X(p.lon).toFixed(2) + ' ' + Y(p.lat).toFixed(2) + ')"><circle r="4.6" fill="rgba(0,0,0,0.6)" stroke="#fff" stroke-width="0.9"/>'
                + '<text y="1.9" text-anchor="middle" font-size="5.4" font-weight="bold" fill="#fff">' + Math.round(m / 1000) + '</text></g>';
        }
        c.pois.forEach(function (q) {
            html += '<circle cx="' + X(+q.lon).toFixed(2) + '" cy="' + Y(+q.lat).toFixed(2) + '" r="1.8" fill="#ff4d4f" stroke="#fff" stroke-width="0.6"/>';
        });
        var n = c.lon.length - 1;
        html += '<text x="' + X(c.lon[0]).toFixed(2) + '" y="' + (Y(c.lat[0]) + 9).toFixed(2) + '" text-anchor="middle" font-size="6" font-weight="bold" fill="#fff" stroke="#000" stroke-width="0.4" paint-order="stroke">출</text>'
            + '<text x="' + X(c.lon[n]).toFixed(2) + '" y="' + (Y(c.lat[n]) - 5).toFixed(2) + '" text-anchor="middle" font-size="6" font-weight="bold" fill="#fff" stroke="#000" stroke-width="0.4" paint-order="stroke">도</text>'
            + '<g transform="translate(106 -4)"><path d="M0 -6 L3 2 L0 0.5 L-3 2 Z" fill="#ff4d4f" stroke="#fff" stroke-width="0.5"/>'
            + '<text y="9" text-anchor="middle" font-size="5.5" font-weight="bold" fill="#fff">N</text></g>'
            + '<circle class="me" r="3.4" cx="-50" cy="-50" fill="' + LINE_COLOR + '" stroke="#fff" stroke-width="1.2"/>';
        svg.innerHTML = html;
        box.appendChild(svg);
        var done = svg.querySelector(".done"), me = svg.querySelector(".me");
        return {
            set: function (dd) {
                var f = Math.max(0, Math.min(1, dd / c.total)) * 1000;
                done.setAttribute("stroke-dasharray", f.toFixed(1) + " 1000");
                var p = at(c, dd);
                me.setAttribute("cx", X(p.lon).toFixed(2));
                me.setAttribute("cy", Y(p.lat).toFixed(2));
            }
        };
    }

    global.RF = {
        LINE_COLOR: LINE_COLOR, num: num, km: km, fromApi: fromApi, at: at, grade: grade, ascentLeft: ascentLeft,
        nextPoi: nextPoi, snap: snap, kmStep: kmStep, poiIcon: poiIcon, profile: profile, miniMap: miniMap
    };
})(window);
