/*
 * routefly 서비스 워커 - 산속에서 통신이 끊겨도 산행 화면이 열리고, 저장해 둔 코스 · 지도가 보이게.
 *
 *   - 화면 파일(html · js · css): 인터넷이 되면 늘 새로 받고(배포하면 바로 반영), 안 되면 받아 둔 것
 *   - API(코스 · 주변 길 · 지도 설정): 위와 같음(새로 받으면 받아 둔 것도 고침)
 *   - 지도 타일(V-World 위성사진 · 지형): 받아 둔 것이 있으면 그것(오프라인 저장 · 본 적 있는 곳), 없으면 받아서 조금 남겨 둠
 *   - MapLibre(vendor): 바뀌지 않으므로 받아 둔 것 먼저
 */
var SHELL = "rf-shell-v2", API = "rf-api-v1", TILES = "rf-tiles-rt-v1", OFFLINE = "rf-offline-v1";
var TILE_KEEP = 1500;   // 지나가며 본 타일은 이만큼만 남깁니다(저장 공간)
// 2026-10-09 점검: API 캐시도 한도 - 지도를 움직일 때마다 목록 주소(bbox)가 하나씩 늘어 끝없이 커졌습니다.
// 오프라인 저장한 코스는 OFFLINE 캐시에 따로 있어 지워지지 않습니다.
var API_KEEP = 300;

var SHELL_FILES = ["hike.html", "about.html", "./", "css/course-kit.css", "js/course-kit.js", "js/hike.js", "js/app.js",
    "vendor/maplibre-gl-5.24.0/maplibre-gl.js", "vendor/maplibre-gl-5.24.0/maplibre-gl.css", "favicon.svg", "manifest.json",
    "img/icon-192.png", "img/icon-512.png"];

self.addEventListener("install", function (e) {
    e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).catch(function () { /* 하나 못 받아도 설치는 */ }));
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
function networkFirst(e, cacheName) {
    var req = e.request;
    var fresh = req.mode === "navigate" ? fetch(req, { cache: "no-cache" }).catch(function () { return fetch(req); })
        : fetch(new Request(req, { cache: "no-cache" }));
    var net = fresh.then(function (res) {
        if (res && res.ok) {
            var copy = res.clone();
            e.waitUntil(caches.open(cacheName).then(function (c) {
                return c.put(req, copy);
            }).then(function () { if (cacheName === API && ++apiPuts % 20 === 0) return trim(API, API_KEEP); })
              .catch(function () { /* 저장 공간 - 이번만 */ }));
        }
        return res;
    });
    var netOrOffline = net.catch(function () {
        return caches.match(req, { ignoreVary: true }).then(function (hit) {
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
    e.waitUntil(net.catch(function () { /* 위에서 처리 */ }));   // 먼저 캐시를 내준 뒤에도 늦은 답으로 캐시를 고칠 때까지
    var slow = new Promise(function (resolve) { setTimeout(resolve, NET_WAIT); }).then(function () {
        return caches.match(req, { ignoreVary: true }).then(function (hit) { return hit || netOrOffline; });
    });
    return Promise.race([netOrOffline, slow]);
}

/** 받아 둔 것 먼저, 없으면 받아서(타일이면 조금 남겨 둠). */
function cacheFirst(req, cacheName) {
    return caches.match(req, { ignoreVary: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
            if (res && res.ok && cacheName) {
                var copy = res.clone();
                caches.open(cacheName).then(function (c) {
                    c.put(req, copy);
                    if (cacheName === TILES && ++puts % 50 === 0) trim(TILES, TILE_KEEP);
                });
            }
            return res;
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
    if (url.indexOf("/api/") >= 0) { e.respondWith(networkFirst(e, API)); return; }
    if (url.indexOf("/vendor/") >= 0) { e.respondWith(cacheFirst(req, SHELL)); return; }
    if (url.indexOf("/s/") >= 0) return;   // 공유 링크는 서버로
    e.respondWith(networkFirst(e, SHELL));
});
