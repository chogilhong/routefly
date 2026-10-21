/*
 * 🎮 심심풀이 게임(2026-10-21 홍TV님 "테트리스 · 갤러그 등 재미로 가볍게 여러 개") - 테트리스 · 갤러그(비행기 쏘기) · 뱀 · 2048 · 벽돌깨기.
 * 서버 없이 캔버스 하나로. 폰은 아래 단추(누르고 있으면 계속) · 밀기(뱀 · 2048) · 끌기(벽돌깨기), PC 는 화살표 · 빈칸 · P.
 * 최고 점수만 이 기기 localStorage(rf-game-best)에. 화면을 안 보면 저절로 멈춤.
 */
(function () {
    "use strict";
    var EN = new URLSearchParams(location.search).get("lang") === "en";
    function T(ko, en) { return EN ? en : ko; }
    var $ = function (id) { return document.getElementById(id); };
    var cv = $("cv"), cx = cv.getContext("2d");
    var W = 300, H = 480;   // 그리는 좌표(css 크기는 화면 폭에 맞춤)

    // ------------------------------------------------------------------ 글 · 크기
    if (EN) {
        document.documentElement.lang = "en";
        document.title = "routefly mini games";
        $("back").textContent = "‹ Mountains";
        $("back").href = "en/m/";
        $("ttl").textContent = "🎮 Mini games";
        $("lblScore").textContent = "Score";
        $("lblBest").textContent = "Best";
        $("note").textContent = "Runs only on this screen - no install, no login. Best scores stay on this device. Save your battery on the trail 🙂";
        var names = { tetris: "🧱 Tetris", shooter: "🚀 Galaga", snake: "🐍 Snake", g2048: "🔢 2048", breakout: "🏓 Breakout",
            mines: "💣 Minesweeper", runner: "🏔️ Mountain run", mole: "🐹 Whack-a-mole", memory: "🃏 Memory", flappy: "🐦 Flappy bird" };
        Array.prototype.forEach.call(document.querySelectorAll("#pick button"), function (b) { b.querySelector(".n").textContent = names[b.getAttribute("data-g")].replace(/^\S+\s/, ""); });
        $("pickChg").textContent = "Change ▾";
        $("grpA").textContent = "🕹️ Arcade";
        $("grpB").textContent = "👆 Tap games";
    }
    function fit() {
        var r = Math.min(window.devicePixelRatio || 1, 2), maxW = Math.min(document.querySelector("main").clientWidth - 2, 380);
        var cw = Math.max(240, maxW), chh = Math.round(cw * H / W), room = window.innerHeight - 330;
        if (chh > room && room > 300) { chh = room; cw = Math.round(chh * W / H); }
        cv.style.width = cw + "px";
        cv.style.height = chh + "px";
        cv.width = Math.round(W * r);
        cv.height = Math.round(H * r);
        cx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
        if (game && !running) game.draw();
    }

    // ------------------------------------------------------------------ 입력
    var held = {}, presses = [];
    function press(k) { presses.push(k); }
    var KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", " ": "act", Enter: "act", a: "left", d: "right", w: "up", s: "down" };
    document.addEventListener("keydown", function (e) {
        if (e.key === "p" || e.key === "P" || e.key === "Escape") { togglePause(); return; }
        var k = KEYS[e.key];
        if (!k) return;
        e.preventDefault();
        if (!held[k]) press(k);
        held[k] = true;
    });
    document.addEventListener("keyup", function (e) { var k = KEYS[e.key]; if (k) held[k] = false; });
    Array.prototype.forEach.call(document.querySelectorAll("#pad button"), function (b) {
        var k = b.getAttribute("data-k"), rep = null;
        function up() { held[k] = false; clearInterval(rep); rep = null; }
        b.addEventListener("pointerdown", function (e) {
            e.preventDefault();
            try { b.setPointerCapture(e.pointerId); } catch (x) { /* 옛 브라우저 */ }
            held[k] = true;
            press(k);
            clearInterval(rep);
            if (game && game.repeat && game.repeat[k]) rep = setInterval(function () { if (held[k]) press(k); }, game.repeat[k]);
        });
        b.addEventListener("pointerup", up);
        b.addEventListener("pointercancel", up);
        b.addEventListener("lostpointercapture", up);
        b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });
    // 밀기(뱀 · 2048) · 끌기(벽돌깨기 · 갤러그)
    var sx = 0, sy = 0, swiping = false;
    cv.addEventListener("pointerdown", function (e) {
        sx = e.clientX; sy = e.clientY; swiping = true;
        if (game && game.drag) game.drag(toX(e.clientX), true);
        if (game && game.onDown) presses.push({ x: toX(e.clientX), y: toY(e.clientY) });   // 누른 자리(지뢰 · 두더지 · 짝 맞추기 · 점프 - 2026-10-21)
    });
    cv.addEventListener("pointermove", function (e) { if (swiping && game && game.drag) game.drag(toX(e.clientX), false); });
    cv.addEventListener("pointerup", function (e) {
        if (!swiping) return;
        swiping = false;
        if (game && game.drag) { game.drag(null); return; }
        if (game && game.onDown) return;
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { press("tap"); return; }
        press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    });
    function toX(clientX) { var r = cv.getBoundingClientRect(); return (clientX - r.left) * W / r.width; }
    function toY(clientY) { var r = cv.getBoundingClientRect(); return (clientY - r.top) * H / r.height; }

    // ------------------------------------------------------------------ 소리(2026-10-21 홍TV님 "소리는 안 들려?") - 파일 없이 웹 오디오로 짧은 삐 소리. 🔊 단추로 끄고 켬(이 기기에 기억)
    var SND_KEY = "rf-game-sound", soundOn = true, ac = null;
    try { soundOn = localStorage.getItem(SND_KEY) !== "0"; } catch (e) { /* 켬 */ }
    function soundBtn() { $("sound").textContent = soundOn ? "🔊" : "🔇"; $("sound").setAttribute("aria-label", soundOn ? T("소리 끄기", "Sound off") : T("소리 켜기", "Sound on")); }
    function audio() {   // 폰은 누른 뒤에만 소리를 낼 수 있어 시작 · 단추를 누를 때 만듦
        if (!ac) { var A = window.AudioContext || window.webkitAudioContext; if (!A) return null; try { ac = new A(); } catch (e) { return null; } }
        if (ac.state === "suspended") ac.resume().catch(function () { /* 다음에 */ });
        return ac;
    }
    /** 짧은 소리: [주파수, 길이(초), 파형, 끝 주파수, 크기] 를 차례로. */
    function tone(seq) {
        if (!soundOn || !ac || ac.state !== "running") return;
        var t = ac.currentTime;
        seq.forEach(function (n) {
            var o = ac.createOscillator(), g = ac.createGain(), d = n[1], v = n[4] || 0.08;
            o.type = n[2] || "square";
            o.frequency.setValueAtTime(n[0], t);
            if (n[3]) o.frequency.exponentialRampToValueAtTime(n[3], t + d);
            g.gain.setValueAtTime(v, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            o.connect(g); g.connect(ac.destination);
            o.start(t); o.stop(t + d + 0.02);
            t += d * 0.9;
        });
    }
    var SFX = {
        move: [[220, 0.03, "square", 0, 0.03]],
        rotate: [[440, 0.05, "square", 660, 0.04]],
        drop: [[180, 0.08, "triangle", 90, 0.1]],
        line: [[523, 0.07], [659, 0.07], [784, 0.12]],
        shot: [[880, 0.05, "square", 440, 0.025]],
        boom: [[160, 0.18, "sawtooth", 40, 0.07]],
        hurt: [[300, 0.12, "sawtooth", 80, 0.1], [150, 0.2, "sawtooth", 50, 0.1]],
        eat: [[600, 0.05, "square", 900, 0.06]],
        merge: [[392, 0.06, "triangle", 0, 0.1], [523, 0.08, "triangle", 0, 0.1]],
        slide: [[260, 0.04, "triangle", 200, 0.05]],
        bounce: [[330, 0.04, "square", 0, 0.05]],
        brick: [[660, 0.05, "square", 880, 0.05]],
        level: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.16]],
        over: [[392, 0.15, "triangle"], [330, 0.15, "triangle"], [262, 0.3, "triangle"]]
    };
    function sfx(name) { if (SFX[name]) tone(SFX[name]); }
    soundBtn();
    $("sound").addEventListener("click", function () {
        soundOn = !soundOn;
        try { localStorage.setItem(SND_KEY, soundOn ? "1" : "0"); } catch (e) { /* 이번만 */ }
        soundBtn();
        if (soundOn) { audio(); setTimeout(function () { sfx("eat"); }, 30); }
    });
    document.addEventListener("pointerdown", function () { if (soundOn) audio(); }, { capture: true });

    // ------------------------------------------------------------------ 점수
    var BEST_KEY = "rf-game-best", bests = {};
    try { bests = JSON.parse(localStorage.getItem(BEST_KEY) || "{}") || {}; } catch (e) { bests = {}; }
    var score = 0;
    function setScore(v) {
        score = v;
        $("score").textContent = v;
        if (v > (bests[gameId] || 0)) {
            bests[gameId] = v;
            $("best").textContent = v;
            try { localStorage.setItem(BEST_KEY, JSON.stringify(bests)); } catch (e) { /* 이번만 */ }
        }
    }

    // ------------------------------------------------------------------ 돌리기
    var game = null, gameId = null, running = false, paused = false, last = 0, raf = 0;
    function loop(t) {
        raf = requestAnimationFrame(loop);
        var dt = Math.min(0.05, (t - (last || t)) / 1000);
        last = t;
        if (!running || paused) { presses.length = 0; return; }
        var ps = presses.splice(0);
        game.update(dt, ps);
        game.draw();
    }
    function over(text, btn) {
        $("overText").innerHTML = text;
        $("startBtn").textContent = btn;
        $("over").hidden = false;
    }
    function start() {
        $("over").hidden = true;
        paused = false;
        $("pause").textContent = "⏸";
        setScore(0);
        game.reset();
        running = true;
        last = 0;
    }
    function end(msg) {
        running = false;
        sfx("over");
        game.draw();
        over((msg || T("끝!", "Game over!")) + "<br>" + T("점수 ", "Score ") + "<b>" + score + "</b>" + (score > 0 && score >= (bests[gameId] || 0) ? "<br>🏆 " + T("최고 점수!", "New best!") : ""), T("다시 하기", "Play again"));
    }
    function togglePause() {
        if (!running) return;
        paused = !paused;
        $("pause").textContent = paused ? "▶" : "⏸";
        if (paused) over(T("잠깐 멈춤", "Paused"), T("이어 하기", "Resume")); else $("over").hidden = true;
    }
    $("pause").addEventListener("click", togglePause);
    $("startBtn").addEventListener("click", function () {
        if (running && paused) togglePause(); else start();
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && running && !paused) togglePause(); });

    function pick(id) {
        if (!GAMES[id]) id = "tetris";
        gameId = id;
        game = GAMES[id];
        running = false;
        held = {};
        Array.prototype.forEach.call(document.querySelectorAll("#pick button"), function (b) { b.classList.toggle("on", b.getAttribute("data-g") === id); });
        var pad = game.pad;   // [왼, 아래, 위, 오른, 행동 글]
        ["left", "down", "up", "right"].forEach(function (k, i) { document.querySelector("#pad [data-k=" + k + "]").hidden = !pad[i]; });
        $("pad").style.display = pad.some(Boolean) ? "" : "none";   // 화면만 누르는 게임은 단추 줄을 숨김
        $("actBtn").hidden = !pad[4];
        $("actBtn").textContent = pad[4] || "";
        $("help").textContent = game.help;
        $("best").textContent = bests[id] || 0;
        $("score").textContent = 0;
        game.reset();
        game.draw();
        var nm = document.querySelector("#pick [data-g=" + id + "]"), label = nm.querySelector(".e").textContent + " " + nm.querySelector(".n").textContent;
        $("pickNow").textContent = label;
        $("pick").open = false;
        over("<b>" + label + "</b><br><small style=\"color:var(--dim)\">" + game.help + "</small>", T("시작", "Start"));
        try { history.replaceState(null, "", "?g=" + id + (EN ? "&lang=en" : "")); } catch (e) { /* 그대로 */ }
    }
    Array.prototype.forEach.call(document.querySelectorAll("#pick button"), function (b) { b.addEventListener("click", function () { pick(b.getAttribute("data-g")); }); });

    // ------------------------------------------------------------------ 그리기 도움
    function clear(c) { cx.fillStyle = c || "#0b0f14"; cx.fillRect(0, 0, W, H); }
    function rect(x, y, w, h, c) { cx.fillStyle = c; cx.fillRect(x, y, w, h); }
    function text(s, x, y, size, c, al) { cx.fillStyle = c || "#eef2f7"; cx.font = "bold " + (size || 16) + "px Arial, 'Malgun Gothic', sans-serif"; cx.textAlign = al || "center"; cx.fillText(s, x, y); }
    function rnd(n) { return Math.floor(Math.random() * n); }

    var GAMES = {};

    // ================================================================== 🧱 테트리스
    GAMES.tetris = (function () {
        var C = 10, R = 20, S = 24, OX = (W - C * S) / 2, OY = 0;
        var SHAPES = [
            [[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[0, 1, 1], [1, 1, 0]], [[1, 1, 0], [0, 1, 1]]];
        var COLORS = ["#38d9ea", "#ffd43b", "#b197fc", "#4dabf7", "#ffa94d", "#69db7c", "#ff6b6b"];
        var grid, cur, nextT, t, lines, level, bag = [];
        function newBag() { bag = [0, 1, 2, 3, 4, 5, 6]; for (var i = 6; i > 0; i--) { var j = rnd(i + 1), x = bag[i]; bag[i] = bag[j]; bag[j] = x; } }
        function take() { if (!bag.length) newBag(); return bag.pop(); }
        function piece(k) { return { k: k, m: SHAPES[k].map(function (r) { return r.slice(); }), x: 0, y: 0 }; }
        function rot(m) { var h = m.length, w = m[0].length, o = []; for (var x = 0; x < w; x++) { o.push([]); for (var y = h - 1; y >= 0; y--) o[x].push(m[y][x]); } return o; }
        function hit(p, dx, dy, m) {
            m = m || p.m;
            for (var y = 0; y < m.length; y++) for (var x = 0; x < m[y].length; x++) {
                if (!m[y][x]) continue;
                var gx = p.x + x + dx, gy = p.y + y + dy;
                if (gx < 0 || gx >= C || gy >= R || (gy >= 0 && grid[gy][gx] >= 0)) return true;
            }
            return false;
        }
        function spawn() {
            cur = piece(nextT); nextT = take();
            cur.x = Math.floor((C - cur.m[0].length) / 2); cur.y = -1;
            if (hit(cur, 0, 1)) { end(); return false; }
            return true;
        }
        function lock() {
            cur.m.forEach(function (r, y) { r.forEach(function (v, x) { if (v && cur.y + y >= 0) grid[cur.y + y][cur.x + x] = cur.k; }); });
            var n = 0;
            for (var y = R - 1; y >= 0; y--) if (grid[y].every(function (v) { return v >= 0; })) { grid.splice(y, 1); grid.unshift(new Array(C).fill(-1)); n++; y++; }
            if (n) { sfx(n >= 4 ? "level" : "line"); lines += n; setScore(score + [0, 100, 300, 500, 800][n] * level); level = 1 + Math.floor(lines / 10); }
            spawn();
        }
        function speed() { return Math.max(0.08, 0.8 - (level - 1) * 0.07); }
        return {
            pad: [1, 1, 1, 1, T("떨구기", "Drop")],
            repeat: { left: 110, right: 110, down: 60 },
            help: T("◀ ▶ 옮기기 · ▲ 돌리기 · ▼ 빨리 · 떨구기 = 바로 아래로. 줄을 채우면 사라집니다.", "◀ ▶ move · ▲ rotate · ▼ faster · Drop = straight down. Fill a row to clear it."),
            reset: function () { grid = []; for (var y = 0; y < R; y++) grid.push(new Array(C).fill(-1)); newBag(); nextT = take(); t = 0; lines = 0; level = 1; spawn(); },
            update: function (dt, ps) {
                ps.forEach(function (k) {
                    if (!cur) return;
                    if (k === "left" && !hit(cur, -1, 0)) cur.x--;
                    else if (k === "right" && !hit(cur, 1, 0)) cur.x++;
                    else if (k === "down") { if (!hit(cur, 0, 1)) { cur.y++; setScore(score + 1); } }
                    else if (k === "up" || k === "tap") {
                        var m = rot(cur.m);
                        for (var kick = 0; kick < 4; kick++) { var d = [0, -1, 1, -2][kick]; if (!hit(cur, d, 0, m)) { cur.m = m; cur.x += d; sfx("rotate"); break; } }
                    } else if (k === "act") { var n = 0; while (!hit(cur, 0, 1)) { cur.y++; n++; } setScore(score + n * 2); sfx("drop"); lock(); t = 0; }
                });
                if (!running) return;
                t += dt;
                if (t >= speed()) { t = 0; if (hit(cur, 0, 1)) lock(); else cur.y++; }
            },
            draw: function () {
                clear();
                rect(OX, OY, C * S, R * S, "#0f141b");
                for (var y = 0; y < R; y++) for (var x = 0; x < C; x++) {
                    var v = grid[y][x];
                    if (v >= 0) rect(OX + x * S + 1, OY + y * S + 1, S - 2, S - 2, COLORS[v]);
                    else rect(OX + x * S + S / 2 - 1, OY + y * S + S / 2 - 1, 2, 2, "#1f2733");
                }
                if (cur) {
                    var gy = 0; while (!hit(cur, 0, gy + 1)) gy++;   // 떨어질 자리
                    cur.m.forEach(function (r, yy) { r.forEach(function (v, xx) {
                        if (!v) return;
                        if (cur.y + yy + gy >= 0) { cx.strokeStyle = COLORS[cur.k]; cx.globalAlpha = 0.35; cx.strokeRect(OX + (cur.x + xx) * S + 2, OY + (cur.y + yy + gy) * S + 2, S - 4, S - 4); cx.globalAlpha = 1; }
                        if (cur.y + yy >= 0) rect(OX + (cur.x + xx) * S + 1, OY + (cur.y + yy) * S + 1, S - 2, S - 2, COLORS[cur.k]);
                    }); });
                }
                text(T("다음", "Next"), OX + C * S - 30, 20, 12, "#9aa6b4");
                SHAPES[nextT].forEach(function (r, yy) { r.forEach(function (v, xx) { if (v) rect(OX + C * S - 52 + xx * 10, 28 + yy * 10, 9, 9, COLORS[nextT]); }); });
                text(T("단계 ", "Lv ") + level, OX + 6, 20, 12, "#9aa6b4", "left");
            }
        };
    })();

    // ================================================================== 🚀 갤러그(비행기 쏘기)
    GAMES.shooter = (function () {
        var ship, shots, foes, bombs, booms, wave, lives, dirX, sway, cool, inv, dragX;
        function newWave() {
            foes = [];
            var rows = Math.min(5, 3 + Math.floor(wave / 2));
            for (var r = 0; r < rows; r++) for (var c = 0; c < 8; c++) foes.push({ hx: 30 + c * 32, hy: 50 + r * 30, x: 30 + c * 32, y: -20 - r * 20, kind: r === 0 ? 2 : r < 2 ? 1 : 0, dive: 0, t: 0, hp: r === 0 ? 2 : 1 });
            sway = 0; dirX = 1;
        }
        function boom(x, y, c) { for (var i = 0; i < 10; i++) booms.push({ x: x, y: y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.5, c: c }); }
        var FC = ["#69db7c", "#ffa94d", "#ff6b6b"];
        return {
            pad: [1, 0, 0, 1, T("쏘기", "Fire")],
            help: T("◀ ▶ 또는 화면을 끌어 움직이기 · 총알은 저절로 나가요(쏘기 = 더 빨리). 적 비행기를 모두 맞히면 다음 판.", "◀ ▶ or drag to move · auto fire (Fire = faster). Clear every ship for the next wave."),
            reset: function () { ship = { x: W / 2, y: H - 40 }; shots = []; bombs = []; booms = []; wave = 1; lives = 3; cool = 0; inv = 0; dragX = null; newWave(); },
            drag: function (x) { dragX = x; },
            update: function (dt, ps) {
                var sp = 220;
                if (held.left) ship.x -= sp * dt;
                if (held.right) ship.x += sp * dt;
                if (dragX != null) ship.x += Math.max(-sp * 1.6 * dt, Math.min(sp * 1.6 * dt, dragX - ship.x));
                ship.x = Math.max(14, Math.min(W - 14, ship.x));
                cool -= dt;
                if (cool <= 0) { shots.push({ x: ship.x, y: ship.y - 14 }); cool = held.act ? 0.16 : 0.32; sfx("shot"); }
                ps.forEach(function (k) { if (k === "act" && cool > 0.12) { shots.push({ x: ship.x, y: ship.y - 14 }); cool = 0.16; } });
                shots.forEach(function (s) { s.y -= 420 * dt; });
                shots = shots.filter(function (s) { return s.y > -10; });
                sway += dirX * 30 * dt;
                if (Math.abs(sway) > 26) dirX = -dirX;
                var diveRate = 0.25 + wave * 0.08;
                foes.forEach(function (f) {
                    f.t += dt;
                    if (f.dive) {
                        f.y += (120 + wave * 10) * dt;
                        f.x += Math.sin(f.t * 3) * 110 * dt + (ship.x - f.x) * 0.6 * dt;
                        if (f.y > H + 20) { f.dive = 0; f.y = -20; }
                        if (Math.random() < 0.9 * dt) bombs.push({ x: f.x, y: f.y + 8 });
                    } else {
                        f.x += (f.hx + sway - f.x) * Math.min(1, 3 * dt);
                        f.y += (f.hy - f.y) * Math.min(1, 3 * dt);
                        if (Math.random() < diveRate * dt / foes.length * 3) f.dive = 1;
                        if (Math.random() < 0.05 * wave * dt / Math.max(1, foes.length / 8)) bombs.push({ x: f.x, y: f.y + 8 });
                    }
                });
                shots.forEach(function (s) {
                    foes.forEach(function (f) {
                        if (s.y > -5 && f.hp > 0 && Math.abs(s.x - f.x) < 13 && Math.abs(s.y - f.y) < 12) {
                            s.y = -99; f.hp--;
                            if (f.hp <= 0) { boom(f.x, f.y, FC[f.kind]); sfx("boom"); setScore(score + (f.dive ? 2 : 1) * [50, 80, 150][f.kind]); }
                        }
                    });
                });
                foes = foes.filter(function (f) { return f.hp > 0; });
                bombs.forEach(function (b) { b.y += (170 + wave * 8) * dt; });
                bombs = bombs.filter(function (b) { return b.y < H + 10; });
                inv -= dt;
                if (inv <= 0) {
                    var hitMe = bombs.some(function (b) { return Math.abs(b.x - ship.x) < 11 && Math.abs(b.y - ship.y) < 12; })
                        || foes.some(function (f) { return Math.abs(f.x - ship.x) < 16 && Math.abs(f.y - ship.y) < 14; });
                    if (hitMe) {
                        boom(ship.x, ship.y, "#38d9ea");
                        lives--; inv = 2; bombs = []; sfx("hurt");
                        foes.forEach(function (f) { if (f.dive) { f.dive = 0; f.y = -20; } });
                        if (lives <= 0) { end(); return; }
                    }
                }
                booms.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
                booms = booms.filter(function (p) { return p.life > 0; });
                if (!foes.length) { wave++; setScore(score + 500); sfx("level"); newWave(); }
            },
            draw: function () {
                clear("#05070b");
                for (var i = 0; i < 40; i++) rect((i * 73) % W, (i * 131 + (Date.now() / 30) * (1 + i % 3)) % H, 1.5, 1.5, "#2c3a4d");
                foes.forEach(function (f) {
                    var c = FC[f.kind];
                    cx.fillStyle = c;
                    cx.beginPath(); cx.moveTo(f.x, f.y + 9); cx.lineTo(f.x - 11, f.y - 6); cx.lineTo(f.x - 4, f.y - 2); cx.lineTo(f.x, f.y - 9); cx.lineTo(f.x + 4, f.y - 2); cx.lineTo(f.x + 11, f.y - 6); cx.closePath(); cx.fill();
                    if (f.hp > 1) rect(f.x - 2, f.y - 3, 4, 4, "#fff");
                });
                if (inv <= 0 || Math.floor(inv * 10) % 2) {
                    cx.fillStyle = "#38d9ea";
                    cx.beginPath(); cx.moveTo(ship.x, ship.y - 14); cx.lineTo(ship.x - 12, ship.y + 10); cx.lineTo(ship.x, ship.y + 5); cx.lineTo(ship.x + 12, ship.y + 10); cx.closePath(); cx.fill();
                }
                shots.forEach(function (s) { rect(s.x - 1.5, s.y - 6, 3, 10, "#fff3bf"); });
                bombs.forEach(function (b) { rect(b.x - 2, b.y - 4, 4, 8, "#ff8787"); });
                booms.forEach(function (p) { cx.globalAlpha = Math.max(0, p.life * 2); rect(p.x, p.y, 3, 3, p.c); cx.globalAlpha = 1; });
                text(T("판 ", "Wave ") + wave, 8, 20, 13, "#9aa6b4", "left");
                text("♥".repeat(Math.max(0, lives)), W - 8, 20, 14, "#ff6b6b", "right");
            }
        };
    })();

    // ================================================================== 🐍 뱀
    GAMES.snake = (function () {
        var N = 15, S = W / N, ROWS = Math.floor(H / S), body, dir, nextDir, food, t, step;
        function place() { do { food = { x: rnd(N), y: rnd(ROWS) }; } while (body.some(function (b) { return b.x === food.x && b.y === food.y; })); }
        var D = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
        return {
            pad: [1, 1, 1, 1, 0],
            help: T("화면을 밀거나 ◀ ▲ ▼ ▶ 로 방향 바꾸기. 먹이를 먹으면 길어지고 빨라집니다. 벽 · 내 몸에 닿으면 끝.", "Swipe or ◀ ▲ ▼ ▶ to turn. Eat to grow and speed up. Don't hit the wall or yourself."),
            reset: function () { body = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }]; dir = [1, 0]; nextDir = dir; t = 0; step = 0.16; place(); },
            update: function (dt, ps) {
                ps.forEach(function (k) { var d = D[k]; if (d && (d[0] !== -dir[0] || d[1] !== -dir[1])) nextDir = d; });
                t += dt;
                if (t < step) return;
                t = 0;
                dir = nextDir;
                var h = { x: body[0].x + dir[0], y: body[0].y + dir[1] };
                if (h.x < 0 || h.y < 0 || h.x >= N || h.y >= ROWS || body.some(function (b, i) { return i < body.length - 1 && b.x === h.x && b.y === h.y; })) { end(); return; }
                body.unshift(h);
                if (h.x === food.x && h.y === food.y) { setScore(score + 10); sfx("eat"); step = Math.max(0.07, step - 0.004); place(); } else body.pop();
            },
            draw: function () {
                clear();
                for (var y = 0; y < ROWS; y++) for (var x = 0; x < N; x++) if ((x + y) % 2) rect(x * S, y * S, S, S, "#0f141b");
                text("🍎", food.x * S + S / 2, food.y * S + S * 0.78, S * 0.8);
                body.forEach(function (b, i) { rect(b.x * S + 1, b.y * S + 1, S - 2, S - 2, i ? "#4ade80" : "#b2f2bb"); });
            }
        };
    })();

    // ================================================================== 🔢 2048
    GAMES.g2048 = (function () {
        var g, won, P = 12, CS = (W - P * 5) / 4, OY = 90, anim;
        var COL = { 2: "#3b4656", 4: "#4a5568", 8: "#f08c00", 16: "#e8590c", 32: "#e03131", 64: "#c2255c", 128: "#ffd43b", 256: "#fcc419", 512: "#fab005", 1024: "#82c91e", 2048: "#38d9ea" };
        function add() { var e = []; for (var i = 0; i < 16; i++) if (!g[i]) e.push(i); if (e.length) g[e[rnd(e.length)]] = Math.random() < 0.9 ? 2 : 4; }
        function line(a) {   // 왼쪽으로 밀기 - [새 줄, 얻은 점수]
            var v = a.filter(Boolean), out = [], s = 0;
            for (var i = 0; i < v.length; i++) { if (v[i] === v[i + 1]) { out.push(v[i] * 2); s += v[i] * 2; i++; } else out.push(v[i]); }
            while (out.length < 4) out.push(0);
            return [out, s];
        }
        function move(k) {
            var moved = false, gain = 0;
            for (var r = 0; r < 4; r++) {
                var idx = [];
                for (var c = 0; c < 4; c++) idx.push(k === "left" ? r * 4 + c : k === "right" ? r * 4 + 3 - c : k === "up" ? c * 4 + r : (3 - c) * 4 + r);
                var res = line(idx.map(function (i) { return g[i]; }));
                idx.forEach(function (i, j) { if (g[i] !== res[0][j]) moved = true; g[i] = res[0][j]; });
                gain += res[1];
            }
            if (!moved) return;
            setScore(score + gain);
            sfx(gain ? "merge" : "slide");
            add();
            anim = 0.12;
            if (!won && g.indexOf(2048) >= 0) { won = true; }
            var can = g.indexOf(0) >= 0;
            for (var i = 0; i < 16 && !can; i++) { if (i % 4 < 3 && g[i] === g[i + 1]) can = true; if (i < 12 && g[i] === g[i + 4]) can = true; }
            if (!can) end(T("더 움직일 수 없어요", "No more moves"));
        }
        return {
            pad: [1, 1, 1, 1, 0],
            help: T("화면을 밀거나 ◀ ▲ ▼ ▶ 로 모두 한쪽으로. 같은 숫자가 만나면 합쳐집니다. 2048 을 만들어 보세요!", "Swipe or ◀ ▲ ▼ ▶ to slide every tile. Equal numbers merge. Reach 2048!"),
            reset: function () { g = new Array(16).fill(0); won = false; anim = 0; add(); add(); },
            update: function (dt, ps) { ps.forEach(function (k) { if (k === "left" || k === "right" || k === "up" || k === "down") move(k); }); anim = Math.max(0, anim - dt); },
            draw: function () {
                clear();
                if (won) text("🎉 2048!", W / 2, 50, 26, "#38d9ea");
                rect(P / 2, OY - P / 2, W - P, W - P, "#1f2733");
                for (var i = 0; i < 16; i++) {
                    var x = P + (i % 4) * (CS + P) - P / 2, y = OY + Math.floor(i / 4) * (CS + P), v = g[i];
                    rect(x, y, CS, CS, v ? (COL[v] || "#9775fa") : "#2a3340");
                    if (v) text(String(v), x + CS / 2, y + CS / 2 + (v > 512 ? 9 : 11), v > 512 ? 24 : 30, v === 2 || v === 4 ? "#eef2f7" : "#11161d");
                }
            }
        };
    })();

    // ================================================================== 🏓 벽돌깨기
    GAMES.breakout = (function () {
        var pad, ball, bricks, lives, stage, stuck, dragX, BW = 34, BH = 14, COLS = 8;
        var BC = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7", "#b197fc"];
        function build() {
            bricks = [];
            var rows = Math.min(6, 3 + stage);
            for (var r = 0; r < rows; r++) for (var c = 0; c < COLS; c++) bricks.push({ x: 8 + c * (BW + 2), y: 50 + r * (BH + 3), hp: r === 0 && stage > 1 ? 2 : 1, c: BC[r % BC.length] });
        }
        function serve() { stuck = true; ball = { x: pad.x, y: pad.y - 9, vx: 0, vy: 0, r: 6 }; }
        return {
            pad: [1, 0, 0, 1, T("발사", "Launch")],
            help: T("◀ ▶ 또는 화면을 끌어 받침대 움직이기 · 발사(또는 화면 누르기)로 공 쏘기. 벽돌을 모두 깨면 다음 판.", "◀ ▶ or drag to move · Launch (or tap) to serve. Break every brick for the next stage."),
            reset: function () { pad = { x: W / 2, y: H - 28, w: 64 }; lives = 3; stage = 1; dragX = null; build(); serve(); },
            drag: function (x, down) { dragX = x; if (down === true && stuck) launch(); },
            update: function (dt, ps) {
                var sp = 300;
                if (held.left) pad.x -= sp * dt;
                if (held.right) pad.x += sp * dt;
                if (dragX != null) pad.x = dragX;
                pad.x = Math.max(pad.w / 2, Math.min(W - pad.w / 2, pad.x));
                ps.forEach(function (k) { if ((k === "act" || k === "tap" || k === "up") && stuck) launch(); });
                if (stuck) { ball.x = pad.x; ball.y = pad.y - 9; return; }
                var steps = 3;
                for (var i = 0; i < steps; i++) {
                    ball.x += ball.vx * dt / steps; ball.y += ball.vy * dt / steps;
                    if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
                    if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }
                    if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }
                    if (ball.vy > 0 && ball.y + ball.r >= pad.y - 4 && ball.y < pad.y + 6 && Math.abs(ball.x - pad.x) < pad.w / 2 + ball.r) {
                        var off = (ball.x - pad.x) / (pad.w / 2), spd = Math.hypot(ball.vx, ball.vy);
                        ball.vx = spd * off * 0.85; ball.vy = -Math.sqrt(Math.max(spd * spd - ball.vx * ball.vx, spd * spd * 0.2)); sfx("bounce");
                    }
                    for (var j = 0; j < bricks.length; j++) {
                        var b = bricks[j];
                        if (b.hp > 0 && ball.x + ball.r > b.x && ball.x - ball.r < b.x + BW && ball.y + ball.r > b.y && ball.y - ball.r < b.y + BH) {
                            var ox = Math.min(ball.x + ball.r - b.x, b.x + BW - (ball.x - ball.r)), oy = Math.min(ball.y + ball.r - b.y, b.y + BH - (ball.y - ball.r));
                            if (ox < oy) ball.vx = -ball.vx; else ball.vy = -ball.vy;
                            b.hp--;
                            sfx("brick");
                            setScore(score + (b.hp > 0 ? 5 : 20));
                            break;
                        }
                    }
                }
                bricks = bricks.filter(function (b) { return b.hp > 0; });
                if (ball.y > H + 20) { lives--; if (lives <= 0) { end(); return; } sfx("hurt"); serve(); }
                if (!bricks.length) { stage++; setScore(score + 200); sfx("level"); build(); serve(); }
            },
            draw: function () {
                clear();
                bricks.forEach(function (b) { rect(b.x, b.y, BW, BH, b.c); if (b.hp > 1) rect(b.x + 3, b.y + 3, BW - 6, BH - 6, "#fff3bf"); });
                rect(pad.x - pad.w / 2, pad.y - 4, pad.w, 8, "#38d9ea");
                cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); cx.fill();
                text(T("판 ", "Stage ") + stage, 8, 24, 13, "#9aa6b4", "left");
                text("♥".repeat(Math.max(0, lives)), W - 8, 24, 14, "#ff6b6b", "right");
                if (stuck && running) text(T("발사 또는 화면을 누르세요", "Tap or Launch"), W / 2, H / 2 + 40, 15, "#9aa6b4");
            }
        };
        function launch() { stuck = false; var s = 260 + stage * 20; ball.vx = (Math.random() - 0.5) * s * 0.6; ball.vy = -Math.sqrt(s * s - ball.vx * ball.vx); }
    })();

    // ================================================================== 💣 지뢰찾기(2026-10-21 - 아래 다섯은 두 번째 묶음)
    GAMES.mines = (function () {
        var C = 9, R = 12, S = 33, OX = (W - C * S) / 2, OY = 40, M = 15, cells, first, flagMode, opened, t0, done;
        function at(x, y) { return x >= 0 && y >= 0 && x < C && y < R ? cells[y * C + x] : null; }
        function around(x, y, f) { for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (dx || dy) { var c = at(x + dx, y + dy); if (c) f(c, x + dx, y + dy); } }
        function lay(sx, sy) {   // 처음 누른 칸과 그 둘레엔 지뢰를 두지 않음
            var n = 0;
            while (n < M) { var x = rnd(C), y = rnd(R), c = at(x, y); if (c.mine || (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1)) continue; c.mine = true; n++; }
            for (var y2 = 0; y2 < R; y2++) for (var x2 = 0; x2 < C; x2++) { var k = 0; around(x2, y2, function (c2) { if (c2.mine) k++; }); at(x2, y2).n = k; }
        }
        function open(x, y) {
            var c = at(x, y);
            if (!c || c.open || c.flag) return;
            c.open = true; opened++;
            if (c.mine) { cells.forEach(function (d) { if (d.mine) d.open = true; }); done = true; end(T("펑! 지뢰를 밟았어요", "Boom! You hit a mine")); return; }
            if (!c.n) around(x, y, function (d, ax, ay) { open(ax, ay); });
        }
        return {
            pad: [0, 0, 0, 0, T("🚩 깃발", "🚩 Flag")],
            onDown: true,
            help: T("칸을 눌러 열기. 숫자는 둘레 지뢰 수. 🚩 깃발 단추를 켜고 누르면 깃발 꽂기. 지뢰 아닌 칸을 다 열면 이김(빠를수록 점수).", "Tap to open. Numbers count nearby mines. Turn on 🚩 Flag to mark. Open every safe cell to win (faster = more points)."),
            reset: function () { cells = []; for (var i = 0; i < C * R; i++) cells.push({ mine: false, n: 0, open: false, flag: false }); first = true; flagMode = false; opened = 0; t0 = 0; done = false; },
            update: function (dt, ps) {
                if (!done) t0 += dt;
                ps.forEach(function (p) {
                    if (p === "act") { flagMode = !flagMode; $("actBtn").textContent = flagMode ? T("🚩 깃발 켬", "🚩 Flag ON") : T("🚩 깃발", "🚩 Flag"); return; }
                    if (!p || p.x === undefined || done) return;
                    var x = Math.floor((p.x - OX) / S), y = Math.floor((p.y - OY) / S), c = at(x, y);
                    if (!c) return;
                    if (flagMode && !c.open) { c.flag = !c.flag; sfx("move"); return; }
                    if (first) { first = false; lay(x, y); }
                    var before = opened;
                    open(x, y);
                    if (done) return;
                    if (opened > before) { sfx("eat"); setScore(opened * 5); }
                    if (opened === C * R - M) { done = true; setScore(score + Math.max(100, 1500 - Math.round(t0) * 5)); sfx("level"); end(T("🎉 모두 찾았어요!", "🎉 Cleared!")); }
                });
            },
            draw: function () {
                clear();
                text("💣 " + M + "   ⏱ " + Math.floor(t0) + T("초", "s") + (flagMode ? "   🚩" : ""), W / 2, 26, 15, "#9aa6b4");
                var NC = ["", "#4dabf7", "#69db7c", "#ff6b6b", "#b197fc", "#ffa94d", "#38d9ea", "#eef2f7", "#9aa6b4"];
                for (var y = 0; y < R; y++) for (var x = 0; x < C; x++) {
                    var c = at(x, y), px = OX + x * S, py = OY + y * S;
                    rect(px + 1, py + 1, S - 2, S - 2, c.open ? (c.mine ? "#c92a2a" : "#1f2733") : "#3b4656");
                    if (c.open && c.mine) text("💣", px + S / 2, py + S * 0.72, 18);
                    else if (c.open && c.n) text(String(c.n), px + S / 2, py + S * 0.7, 18, NC[c.n]);
                    else if (!c.open && c.flag) text("🚩", px + S / 2, py + S * 0.72, 17);
                }
            }
        };
    })();

    // ================================================================== 🏔️ 산 뛰어넘기(달리기)
    GAMES.runner = (function () {
        var GY = H - 80, p, obs, spd, dist, nextIn, clouds;
        function jump() { if (p.y >= GY - 0.5) { p.vy = -560; sfx("rotate"); } }
        return {
            pad: [0, 0, 0, 0, T("점프", "Jump")],
            onDown: true,
            repeat: {},
            help: T("화면을 누르거나 점프로 바위 · 나무를 뛰어넘기. 갈수록 빨라집니다.", "Tap or Jump over rocks and trees. It gets faster."),
            reset: function () { p = { y: GY, vy: 0 }; obs = []; spd = 200; dist = 0; nextIn = 1; clouds = [{ x: 60, y: 80 }, { x: 220, y: 130 }]; },
            update: function (dt, ps) {
                ps.forEach(function (k) { if (k === "act" || k === "up" || (k && k.x !== undefined)) jump(); });
                p.vy += 1500 * dt; p.y = Math.min(GY, p.y + p.vy * dt);
                if (p.y >= GY) p.vy = 0;
                spd += 6 * dt; dist += spd * dt;
                nextIn -= dt;
                if (nextIn <= 0) { var tree = Math.random() < 0.4; obs.push({ x: W + 20, w: tree ? 18 : 26, h: tree ? 46 : 26, tree: tree }); nextIn = 0.9 + Math.random() * 1.1 - Math.min(0.5, spd / 1200); }
                obs.forEach(function (o) { o.x -= spd * dt; });
                obs = obs.filter(function (o) { return o.x > -40; });
                clouds.forEach(function (c) { c.x -= spd * 0.2 * dt; if (c.x < -60) c.x = W + 40; });
                var px = 60;
                if (obs.some(function (o) { return px + 14 > o.x && px - 14 < o.x + o.w && p.y > GY - o.h + 4; })) { sfx("hurt"); end(); return; }
                var sc = Math.floor(dist / 10);
                if (sc !== score) { if (Math.floor(sc / 100) > Math.floor(score / 100)) sfx("level"); setScore(sc); }
            },
            draw: function () {
                clear("#0e1a26");
                cx.fillStyle = "#1f3a4d"; cx.beginPath(); cx.moveTo(0, GY); for (var x = 0; x <= W; x += 50) cx.lineTo(x, GY - 60 - 50 * Math.abs(Math.sin((x + dist * 0.15) / 70))); cx.lineTo(W, GY); cx.fill();
                clouds.forEach(function (c) { text("☁️", c.x, c.y, 30); });
                rect(0, GY, W, H - GY, "#2b2f1f"); rect(0, GY, W, 3, "#69db7c");
                obs.forEach(function (o) { if (o.tree) text("🌲", o.x + o.w / 2, GY + 2, 44); else text("🪨", o.x + o.w / 2, GY + 4, 30); });
                cx.save(); cx.translate(60, p.y); cx.scale(-1, 1); text("🥾", 0, 0, 30); cx.restore();
                text(Math.floor(dist / 10) + " m", W - 10, 28, 15, "#9aa6b4", "right");
            }
        };
    })();

    // ================================================================== 🐹 두더지 잡기
    GAMES.mole = (function () {
        var holes, left, spawnIn, OY = 110, S = 92, pop;
        return {
            pad: [0, 0, 0, 0, 0],
            onDown: true,
            help: T("30초 동안 튀어나온 🐹 를 누르기. 💣 은 누르면 점수가 깎여요.", "Tap the 🐹 for 30 seconds. Avoid the 💣."),
            reset: function () { holes = []; for (var i = 0; i < 9; i++) holes.push({ t: 0, bomb: false, hit: 0 }); left = 30; spawnIn = 0.5; pop = 0; },
            update: function (dt, ps) {
                left -= dt;
                if (left <= 0) { left = 0; sfx("level"); end(T("시간 끝!", "Time's up!")); return; }
                holes.forEach(function (h) { if (h.t > 0) h.t -= dt; if (h.hit > 0) h.hit -= dt; });
                spawnIn -= dt;
                if (spawnIn <= 0) {
                    var free = holes.filter(function (h) { return h.t <= 0; });
                    if (free.length) { var h = free[rnd(free.length)]; h.t = Math.max(0.55, 1.2 - (30 - left) * 0.02); h.bomb = Math.random() < 0.15; }
                    spawnIn = Math.max(0.3, 0.8 - (30 - left) * 0.015);
                }
                ps.forEach(function (p) {
                    if (!p || p.x === undefined) return;
                    var c = Math.floor((p.x - (W - 3 * S) / 2) / S), r = Math.floor((p.y - OY) / S);
                    if (c < 0 || c > 2 || r < 0 || r > 2) return;
                    var h = holes[r * 3 + c];
                    if (h.t > 0) {
                        if (h.bomb) { setScore(Math.max(0, score - 30)); sfx("hurt"); } else { setScore(score + 10); sfx("brick"); }
                        h.t = 0; h.hit = 0.25;
                    }
                });
            },
            draw: function () {
                clear("#13261a");
                text("⏱ " + Math.ceil(left) + T("초", "s"), W / 2, 50, 22, left < 6 ? "#ff6b6b" : "#eef2f7");
                var ox = (W - 3 * S) / 2;
                holes.forEach(function (h, i) {
                    var x = ox + (i % 3) * S + S / 2, y = OY + Math.floor(i / 3) * S + S / 2;
                    cx.fillStyle = "#3b2a1a"; cx.beginPath(); cx.ellipse(x, y + 22, 34, 12, 0, 0, Math.PI * 2); cx.fill();
                    if (h.t > 0) text(h.bomb ? "💣" : "🐹", x, y + 18, 46);
                    if (h.hit > 0) text("💥", x, y, 36);
                });
            }
        };
    })();

    // ================================================================== 🃏 짝 맞추기
    GAMES.memory = (function () {
        var EM = ["⛰️", "🌲", "🦌", "🐿️", "🌸", "🍁", "🏕️", "🥾", "☀️", "🌙"], CO = 4, RO = 5, CW = 66, CH = 80, OX = (W - CO * CW) / 2, OY = 50;
        var cards, openIdx, wait, moves, pairs, t0;
        return {
            pad: [0, 0, 0, 0, 0],
            onDown: true,
            help: T("카드 두 장을 뒤집어 같은 그림 짝을 찾기. 적게 뒤집고 빨리 끝낼수록 점수가 높아요.", "Flip two cards to find matching pairs. Fewer moves and less time = more points."),
            reset: function () {
                var d = EM.concat(EM);
                for (var i = d.length - 1; i > 0; i--) { var j = rnd(i + 1), x = d[i]; d[i] = d[j]; d[j] = x; }
                cards = d.map(function (e) { return { e: e, up: false, done: false }; });
                openIdx = []; wait = 0; moves = 0; pairs = 0; t0 = 0;
            },
            update: function (dt, ps) {
                t0 += dt;
                if (wait > 0) { wait -= dt; if (wait <= 0) { openIdx.forEach(function (i) { cards[i].up = false; }); openIdx = []; } return; }
                ps.forEach(function (p) {
                    if (!p || p.x === undefined || openIdx.length >= 2) return;
                    var c = Math.floor((p.x - OX) / CW), r = Math.floor((p.y - OY) / CH);
                    if (c < 0 || c >= CO || r < 0 || r >= RO) return;
                    var i = r * CO + c, cd = cards[i];
                    if (cd.up || cd.done) return;
                    cd.up = true; openIdx.push(i); sfx("move");
                    if (openIdx.length === 2) {
                        moves++;
                        var a = cards[openIdx[0]], b = cards[openIdx[1]];
                        if (a.e === b.e) {
                            a.done = b.done = true; openIdx = []; pairs++; sfx("merge");
                            setScore(Math.max(0, pairs * 100 - moves * 5));
                            if (pairs === EM.length) { setScore(score + Math.max(0, 600 - Math.round(t0) * 5)); sfx("level"); end(T("🎉 다 맞췄어요! ", "🎉 All matched! ") + moves + T("번 만에", " moves")); }
                        } else wait = 0.7;
                    }
                });
            },
            draw: function () {
                clear();
                text(T("뒤집은 수 ", "Moves ") + moves + "   ⏱ " + Math.floor(t0) + T("초", "s"), W / 2, 30, 15, "#9aa6b4");
                cards.forEach(function (cd, i) {
                    var x = OX + (i % CO) * CW + 3, y = OY + Math.floor(i / CO) * CH + 3;
                    rect(x, y, CW - 6, CH - 6, cd.done ? "#1f3a2a" : cd.up ? "#eef2f7" : "#3b4656");
                    if (cd.up || cd.done) text(cd.e, x + (CW - 6) / 2, y + (CH - 6) / 2 + 13, 36);
                    else text("?", x + (CW - 6) / 2, y + (CH - 6) / 2 + 9, 26, "#9aa6b4");
                });
            }
        };
    })();

    // ================================================================== 🐦 날아라 새
    GAMES.flappy = (function () {
        var b, pipes, nextIn, GAP = 150, PW = 52;
        function flap() { b.vy = -330; sfx("rotate"); }
        return {
            pad: [0, 0, 0, 0, T("날기", "Flap")],
            onDown: true,
            help: T("화면을 누르거나 날기로 날갯짓. 봉우리 사이 틈을 지나가세요.", "Tap or Flap to fly. Pass through the gaps between the peaks."),
            reset: function () { b = { y: H / 2, vy: 0 }; pipes = []; nextIn = 0.6; },
            update: function (dt, ps) {
                ps.forEach(function (k) { if (k === "act" || k === "up" || (k && k.x !== undefined)) flap(); });
                b.vy += 900 * dt; b.y += b.vy * dt;
                nextIn -= dt;
                if (nextIn <= 0) { pipes.push({ x: W + 10, gy: 110 + rnd(H - 260), passed: false }); nextIn = 1.5; }
                pipes.forEach(function (p) { p.x -= 140 * dt; if (!p.passed && p.x + PW < 70) { p.passed = true; setScore(score + 1); sfx("eat"); } });
                pipes = pipes.filter(function (p) { return p.x > -PW; });
                var hit = b.y < 0 || b.y > H - 20 || pipes.some(function (p) { return 70 + 12 > p.x && 70 - 12 < p.x + PW && (b.y - 10 < p.gy || b.y + 10 > p.gy + GAP); });
                if (hit) { sfx("hurt"); end(); }
            },
            draw: function () {
                clear("#0e1a26");
                pipes.forEach(function (p) {
                    cx.fillStyle = "#3b5b46";
                    cx.beginPath(); cx.moveTo(p.x, 0); cx.lineTo(p.x + PW, 0); cx.lineTo(p.x + PW, p.gy - 14); cx.lineTo(p.x + PW / 2, p.gy); cx.lineTo(p.x, p.gy - 14); cx.fill();   // 거꾸로 봉우리
                    cx.beginPath(); cx.moveTo(p.x, H); cx.lineTo(p.x, p.gy + GAP + 14); cx.lineTo(p.x + PW / 2, p.gy + GAP); cx.lineTo(p.x + PW, p.gy + GAP + 14); cx.lineTo(p.x + PW, H); cx.fill();
                    rect(p.x + PW / 2 - 8, p.gy + GAP, 16, 4, "#eef2f7");   // 눈 덮인 꼭대기
                });
                cx.save(); cx.translate(70, b.y); cx.rotate(Math.max(-0.5, Math.min(0.8, b.vy / 600))); cx.scale(-1, 1); text("🐦", 0, 10, 28); cx.restore();
                text(String(score), W / 2, 50, 32, "#eef2f7");
            }
        };
    })();

    // ------------------------------------------------------------------ 시작
    window.addEventListener("resize", fit);
    var first = new URLSearchParams(location.search).get("g");
    pick(first || "tetris");
    if (!first) $("pick").open = true;   // 처음 오면 펼쳐서 고르게
    fit();
    raf = requestAnimationFrame(loop);
})();
