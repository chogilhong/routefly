/*
 * routefly 서비스 워커 - 산속에서 통신이 끊겨도 산행 화면이 열리고, 저장해 둔 코스 · 지도가 보이게.
 *
 *   - 화면 파일(html · js · css): 인터넷이 되면 늘 새로 받고(배포하면 바로 반영), 안 되면 받아 둔 것
 *   - API(코스 · 주변 길 · 지도 설정): 위와 같음(새로 받으면 받아 둔 것도 고침)
 *   - 지도 타일(V-World 위성사진 · 지형): 받아 둔 것이 있으면 그것(오프라인 저장 · 본 적 있는 곳), 없으면 받아서 조금 남겨 둠
 *   - MapLibre(vendor): 바뀌지 않으므로 받아 둔 것 먼저
 *   - 판 붙은 js · css(js/x.js?v=내용 해시 - war 만들 때 tools/minify/version.js 가 붙임, 2026-11-01): 내용이 바뀌면 주소가 바뀌므로 받아 둔 것 먼저
 */
var SHELL = "rf-shell-v228", API = "rf-api-v1", TILES = "rf-tiles-rt-v1", OFFLINE = "rf-offline-v1";
var TILE_KEEP = 1500;   // 지나가며 본 타일은 이만큼만 남깁니다(저장 공간)
// 2026-10-09 점검: API 캐시도 한도 - 지도를 움직일 때마다 목록 주소(bbox)가 하나씩 늘어 끝없이 커졌습니다.
// 오프라인 저장한 코스는 OFFLINE 캐시에 따로 있어 지워지지 않습니다.
var API_KEEP = 300;

// 회사 사무실(PC · 인터넷 있을 때 씀) 파일은 미리 담지 않음 - 앱을 고칠 때마다 모든 손님이 다시 받던 것(2026-10-29 점검). 처음 열 때 그대로 담김
// 2026-11-02 홍TV님 속도 점검: 첫 주소("./")는 이제 작은 넘김 화면(root.html)이라, 예전 공유 링크(…/routefly/#c=)가 신호 없을 때도 3D 화면으로 열리게 index.html 도 담음
var SHELL_FILES = ["hike.html", "about.html", "about-en.html", "park.html", "js/kit-park.js", "js/park.js", "route.html", "js/kit-route.js", "js/route.js", "series.html", "js/kit-series.js", "js/series.js", "data/series.json", "data/mountains100.json", "data/park-notes.json", "data/knps-close.json", "data/np-stamps.json", "./", "index.html", "css/course-kit.css", "js/kit-hike.js", "js/kit-app.js", "js/seen.js", "js/hike.js", "js/party-kit.js", "party.html", "js/kit-party.js", "js/party.js", "js/no-kakao.js", "js/party-bar.js", "vendor/qrcode-generator-1.4.4/qrcode.js", "js/app.js", "js/early.js", "js/sw-reg.js", "js/about.js", "js/onboard.js", "js/app-perm.js", "js/app-store.js", "js/root-go.js", "privacy.html",
    "vendor/maplibre-gl-5.24.0/maplibre-gl.js", "vendor/maplibre-gl-5.24.0/maplibre-gl.css", "favicon.svg", "manifest.json",
    "img/icon-192.png", "img/kakaomap.png", "data/peak-elev.json", "js/rf-dialog.js"];   // icon-512(홈 화면 설치 그림)는 빼고 - 산속에서 쓰지 않음(2026-11-03 P3)
// war 를 만들 때 tools/minify/version.js 가 위 js · css 에 ?v=<내용 해시> 를 붙임(2026-11-03 홍TV님 점검 P2) - 화면이 방금 받은 같은 판 주소라 브라우저 캐시(1년)에서 바로 오고,
// 이미 담아 둔 판은 다시 받지 않음. ?없는 주소로도 담음(산 페이지 "신호 없을 때 보기" 와 오프라인 versioned() 가 ?없는 주소를 찾음)

/** 미리 담기 하나 - 이미 있으면 건너뜀, 판 붙은 주소는 ?없는 주소로도 담고 같은 파일의 예전 판은 지움(versioned 와 같게). 못 받으면 이 파일만 다음에. */
function shellPut(c, f) {
    var plain = f.split("?")[0];
    return c.match(f).then(function (hit) {
        if (hit) return null;
        // X-RF-Prefetch - 미리 받기라 서버 통계에서 화면 수로 세지 않게(2026-10-20 - 한 사람이 화면 9~10개 본 것으로 잡혔음, Stats.isPageView)
        return fetch(new Request(f, { headers: { "X-RF-Prefetch": "1" } })).then(function (res) {
            if (!res || !res.ok) return null;
            if (f === plain) return c.put(f, res);
            var abs = new URL(plain, self.location).href, absF = new URL(f, self.location).href;
            return c.keys().then(function (keys) {
                return Promise.all(keys.filter(function (k) { return k.url !== absF && k.url.split("?")[0] === abs && k.url.indexOf("?v=") > 0; })
                    .map(function (k) { return c.delete(k); }));
            }).then(function () { return Promise.all([c.put(f, res.clone()), c.put(plain, res)]); });
        });
    }).catch(function () { /* 이 파일만 다음에 */ });
}

self.addEventListener("install", function (e) {
    // 하나씩 - addAll 은 하나만 못 받아도 모두 버려 오프라인 화면이 통째로 비었음(2026-10-11 오픈 전 점검)
    e.waitUntil(caches.open(SHELL).then(function (c) {
        return Promise.all(SHELL_FILES.map(function (f) { return shellPut(c, f); }));
    }));
    self.skipWaiting();
});

self.addEventListener("activate", function (e) {
    var keep = [SHELL, API, TILES, OFFLINE];
    e.waitUntil(caches.keys().then(function (names) {
        return Promise.all(names.filter(function (n) { return n.indexOf("rf-") === 0 && keep.indexOf(n) < 0; })
            .map(function (n) { return caches.delete(n); }));
    }).then(function () { return self.clients.claim(); }));
});

function isTile(url) {
    return url.indexOf("api.vworld.kr/req/wmts") >= 0 || url.indexOf("elevation-tiles-prod") >= 0;
}

var puts = 0, apiPuts = 0;
/** 오래 넣은 것부터 지워 keep 개만 남깁니다(캐시 키는 넣은 차례). */
function trim(name, keep) {
    return caches.open(name).then(function (c) {
        return c.keys().then(function (keys) {
            var extra = keys.length - keep;
            return Promise.all(keys.slice(0, Math.max(0, extra)).map(function (k) { return c.delete(k); }));
        });
    });
}

/**
 * 인터넷 먼저, 안 되면 받아 둔 것(어느 캐시든). 받은 것은 cacheName 에 고쳐 둡니다.
 * 브라우저 캐시를 거치지 않고 서버에 바뀌었는지 묻습니다(no-cache) - 서버가 캐시 시간을 안 정하면 브라우저가 예전 app.js 를
 * 몇 시간씩 "새것" 으로 써서, 배포해도 화면이 안 바뀌던 문제. 그대로면 서버가 304 로 짧게 답합니다.
 * 2026-10-10 점검: 산속처럼 신호가 약해 답이 끝없이 늦으면 화면이 하얗게 멈췄습니다 - NET_WAIT 안에 답이 없으면 받아 둔 것을
 * 먼저 내주고(없으면 계속 기다림), 늦게 온 답은 뒤에서 캐시만 고칩니다(waitUntil).
 */
var NET_WAIT = 4000;
/** 화면 주소가 아닌 js · css · 자료는 받아 둔 것이 있으면 1.5초만 기다림(2026-10-28 점검: 산속에서 파일마다 4초씩 기다려 첫 화면이 10초 걸렸음). */
var SUB_WAIT = 1500;
/**
 * 2026-11-01 점검: API 도 1.5초 만에 받아 둔 답을 내줘, 늦은 안전 경보 · 날씨 · 대기 · 물때 · 기름값 답 대신 며칠 지난 답이 지금 것처럼 보였음.
 * API 는 NET_WAIT 를 기다리고, 지금 값이 중요한 API(LIVE_API)는 답이 없을 때(LIVE_WAIT - 사실상 끊김)만 받아 둔 것.
 */
var LIVE_API = /\/api\/(?:safety|weather|air|tide|fuel|wx|mid)(?:[/?#]|$)/, LIVE_WAIT = 15000;
/**
 * 받아 둔 것 찾기 - 이 종류의 캐시(cacheName)를 먼저, 없으면 다른 캐시. 2026-10-18 홍TV님: 그냥 caches.match 는 먼저 만든 캐시부터 보므로
 * 산 페이지 "신호 없을 때 보기"(rf-offline-v1)에 예전에 담은 화면 파일이 새 화면 파일(rf-shell)보다 먼저 나와, 지운 문구가 계속 보였을 수 있음.
 */
function cached(key, cacheName) {
    return caches.open(cacheName).then(function (c) { return c.match(key, { ignoreVary: true }); })
        .then(function (hit) { return hit || caches.match(key, { ignoreVary: true }); });
}
/** 받아 둔 것(a)과 새 답(b)이 다른 파일인가 - ETag, 없으면 Last-Modified · 크기. 표시가 하나도 없으면 다르다고 보지 않음. */
function differs(a, b) {
    function sig(r) { return [r.headers.get("ETag"), r.headers.get("Last-Modified"), r.headers.get("Content-Length")].join("|"); }
    var x = sig(a), y = sig(b);
    return !!x.replace(/\|/g, "") && !!y.replace(/\|/g, "") && x !== y;
}
var toldAt = 0;
/** 열린 화면 모두에 "새 버전" 알림(30초에 한 번). 막 여는 화면은 아직 없을 수 있어 3초 뒤 한 번 더. */
function tellUpdated() {
    if (Date.now() - toldAt < 30000) return;
    toldAt = Date.now();
    function send() {
        return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (cs) {
            cs.forEach(function (c) { c.postMessage({ type: "rf-updated" }); });
        });
    }
    return send().then(function () { return new Promise(function (r) { setTimeout(r, 3000); }); }).then(send);
}
function networkFirst(e, cacheName) {
    var req = e.request;
    // 화면 파일은 ?뒤를 뺀 주소 하나로 - park.html?name=… · ?debug 마다 한 벌씩 쌓여 끝없이 커졌음(2026-10-11 오픈 전 점검).
    // 화면은 주소의 ?뒤를 스스로 읽으므로 받아 둔 것 하나로 됩니다
    var key = cacheName === SHELL ? req.url.split("#")[0].split("?")[0] : req;
    var fresh = req.mode === "navigate" ? fetch(req, { cache: "no-cache" }).catch(function () { return fetch(req); })
        // API 는 서버가 정한 5분(max-age=300) 동안 브라우저가 받아 둔 것을 씀 - 예전엔 늘 no-cache 로 물어 코스를 누를 때마다
        // 톰캣 · DB 까지 갔음(2026-10-11 오픈 전 점검). 자료는 배치가 돌 때만 바뀝니다. 화면 파일은 배포가 바로 보이게 그대로 no-cache
        : cacheName === API ? fetch(req) : fetch(new Request(req, { cache: "no-cache" }));
    var net = fresh.then(function (res) {
        if (res && res.ok) {
            var copy = res.clone();
            e.waitUntil(caches.open(cacheName).then(function (c) {
                return c.put(key, copy);
            }).then(function () { if (cacheName === API && ++apiPuts % 20 === 0) return trim(API, API_KEEP); })
              .catch(function () { /* 저장 공간 - 이번만 */ }));
        }
        return res;
    });
    var netOrOffline = net.catch(function () {
        return cached(key, cacheName).then(function (hit) {
            if (hit) return hit;
            if (req.mode === "navigate") {   // 화면 주소면 JSON 글자 대신 안내 화면
                return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                    + '<title>오프라인 - routefly</title><body style="font-family:sans-serif;background:#121821;color:#e8edf3;padding:24px;line-height:1.6">'
                    + '<h2>오프라인입니다</h2><p>인터넷이 연결되지 않았고, 이 화면은 핸드폰에 저장되어 있지 않습니다.</p>'
                    + '<p><a href="hike.html" style="color:#38d9ea">산행 화면 열기</a> (저장해 둔 코스는 그곳에서 보입니다)</p></body>',
                    { status: 503, headers: { "Content-Type": "text/html; charset=UTF-8" } });
            }
            return new Response(JSON.stringify({ success: false, message: "오프라인 - 저장해 둔 자료가 없습니다." }),
                { status: 503, headers: { "Content-Type": "application/json; charset=UTF-8" } });
        });
    });
    // 2026-10-20 홍TV님 "폰에서 예전 버전이 계속 나옴": 늦어서 받아 둔 화면 파일을 먼저 내줬는데, 늦게 온 새 답이 그것과 다르면
    // 열린 화면에 "새 버전이 있습니다" 띠를 띄우게 알림(course-kit.js notifyDeploy). 산속(신호 약함)에서 화면이 멈추지 않는 것은 그대로.
    var servedHit = null;
    e.waitUntil(net.then(function (res) {
        if (servedHit && cacheName === SHELL && res && res.ok && differs(servedHit, res)) return tellUpdated();
    }, function () { /* 위에서 처리 */ }));   // 먼저 캐시를 내준 뒤에도 늦은 답으로 캐시를 고칠 때까지
    var wait = cacheName === API ? (LIVE_API.test(req.url) ? LIVE_WAIT : NET_WAIT) : req.mode === "navigate" ? NET_WAIT : SUB_WAIT;
    var slow = new Promise(function (resolve) { setTimeout(resolve, wait); }).then(function () {
        return cached(key, cacheName).then(function (hit) {
            servedHit = hit || null;
            if (hit) return hit;
            // 받아 둔 화면이 없는 주소는 답을 끝까지 기다렸는데, 2026-11-01 홍TV님 PC 크롬에서 서버는 멀쩡한데 통계 화면이 하얗게 계속 돌았음
            // (Ctrl+Shift+R - 서비스 워커를 건너뛰면 바로 열림). STUCK_WAIT 안에 답이 없으면 "다시 열기" 안내 - 누르면 서비스 워커를 내려놓고 다시 엶
            return req.mode === "navigate" ? Promise.race([netOrOffline, stuckPage()]) : netOrOffline;
        });
    });
    return Promise.race([netOrOffline, slow]);
}

/** 화면 주소인데 받아 둔 것도 없고 답도 없을 때(NET_WAIT + STUCK_WAIT 뒤) 보여 줄 안내. "다시 열기"는 서비스 워커를 내려놓고 새로 엶(다음 화면에서 sw-reg.js 가 다시 올림). */
var STUCK_WAIT = 16000;
function stuckPage() {
    return new Promise(function (r) { setTimeout(r, STUCK_WAIT); }).then(function () {
        return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<title>응답이 늦습니다 - routefly</title><body style="font-family:sans-serif;background:#121821;color:#e8edf3;padding:24px;line-height:1.6">'
            + '<h2>응답이 늦습니다</h2><p>서버 답을 20초 넘게 기다렸습니다. 아래를 누르면 새로 엽니다.</p>'
            + '<p><button id="again" style="font-size:16px;padding:10px 18px;border-radius:10px;border:1px solid #38d9ea;background:none;color:#38d9ea">다시 열기</button></p>'
            + '<p><a href="hike.html" style="color:#38d9ea">산행 화면 열기</a></p>'
            + '<script>document.getElementById("again").onclick=function(){var go=function(){location.reload();};'
            + 'if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){navigator.serviceWorker.getRegistrations()'
            + '.then(function(rs){return Promise.all(rs.map(function(x){return x.unregister();}));}).then(go,go);}else go();};</script></body>',
            { status: 504, headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" } });
    });
}

/**
 * 못 받은 지도 타일은 TILE_FAIL_MS 동안 다시 묻지 않고 바로 실패(2026-11-03 홍TV님 점검 P6: 산속 오프라인에서 지도를 움직일 때마다 같은 타일을 계속 다시 받으려 했음 - 배터리).
 * 주소 → 못 받은 시각. TILE_FAIL_KEEP 개가 넘으면 비움.
 */
var TILE_FAIL_MS = 90000, TILE_FAIL_KEEP = 2000, tileFails = new Map();
/** 받아 둔 것 먼저, 없으면 받아서(타일이면 조금 남겨 둠). */
function cacheFirst(req, cacheName) {
    return caches.match(req, { ignoreVary: true }).then(function (hit) {
        if (hit) return hit;
        var tile = isTile(req.url), failed = tile && tileFails.get(req.url);
        if (failed && Date.now() - failed < TILE_FAIL_MS) return new Response("", { status: 504, statusText: "offline (recent fail)" });
        return fetch(req).then(function (res) {
            if (tile) tileFails.delete(req.url);
            if (res && res.ok && cacheName) {
                var copy = res.clone();
                caches.open(cacheName).then(function (c) {
                    c.put(req, copy);
                    if (cacheName === TILES && ++puts % 50 === 0) trim(TILES, TILE_KEEP);
                });
            }
            return res;
        }, function (err) {
            if (tile) {
                if (tileFails.size >= TILE_FAIL_KEEP) tileFails.clear();
                tileFails.set(req.url, Date.now());
            }
            throw err;
        });
    });
}

/**
 * 판 붙은 js · css(?v=내용 해시, 2026-11-01 점검 - 화면을 열 때마다 파일 20여 개를 서버에 304 로 묻던 것): 받아 둔 것 먼저.
 * 서버가 지금 판이라고 답한 것(immutable)만 그 주소로 담고, 같은 파일의 예전 판은 지움(배포마다 쌓이지 않게). ?없는 주소도 새것으로 고쳐 둠.
 * 못 받으면(산속 오프라인) ?없는 주소로 받아 둔 것 - 미리 받은 SHELL_FILES · 산 페이지 "신호 없을 때 보기"(rf-offline)가 ?없는 주소라서.
 */
function versioned(e) {
    var req = e.request, plain = req.url.split("?")[0];
    return caches.match(req, { ignoreVary: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
            if (res && res.ok && /immutable/.test(res.headers.get("Cache-Control") || "")) {
                var copy = res.clone(), copy2 = res.clone();
                e.waitUntil(caches.open(SHELL).then(function (c) {
                    return c.keys().then(function (keys) {
                        return Promise.all(keys.filter(function (k) { return k.url !== req.url && k.url.split("?")[0] === plain && k.url.indexOf("?v=") > 0; })
                            .map(function (k) { return c.delete(k); }));
                    }).then(function () { return Promise.all([c.put(req, copy), c.put(plain, copy2)]); });
                }).catch(function () { /* 저장 공간 - 이번만 */ }));
            }
            return res;
        }, function (err) {
            return caches.match(plain, { ignoreVary: true }).then(function (old) { if (old) return old; throw err; });
        });
    });
}

self.addEventListener("fetch", function (e) {
    var req = e.request;
    if (req.method !== "GET") return;
    var url = req.url;
    // 오프라인 저장(hike.js saveOffline)이 받는 타일은 OFFLINE 캐시에 들어가므로 여기에는 넣지 않습니다(두 번 저장되던 것)
    if (isTile(url)) { e.respondWith(cacheFirst(req, req.cache === "no-store" ? null : TILES)); return; }
    if (url.indexOf(self.location.origin) !== 0) return;   // 그 밖의 다른 사이트는 손대지 않음
    if (url.indexOf("/api/course-submit") >= 0) return;   // 받은 GPX(관리자 - GPX 편집)는 받아 두지 않고 서버로 - 지운 것이 옛 목록으로 보이거나 GPX 가 캐시에 남지 않게(2026-11-01)
    if (url.indexOf("/api/") >= 0) { e.respondWith(networkFirst(e, API)); return; }
    if (url.indexOf("/vendor/") >= 0) { e.respondWith(cacheFirst(req, SHELL)); return; }
    if (/\/(?:js|css)\/[^/?#]+\.(?:js|css)\?v=/.test(url)) { e.respondWith(versioned(e)); return; }
    if (url.indexOf("/s/") >= 0) return;   // 공유 링크는 서버로
    if (url.indexOf("/check/") >= 0) return;   // 점검 화면(관리자 - 높이 점검 등)도 받아 두지 않고 서버로(2026-11-01 점검)
    e.respondWith(networkFirst(e, SHELL));
});
