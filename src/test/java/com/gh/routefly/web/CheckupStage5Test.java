package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-10-10 5차 점검(화면 - 서비스 워커 · 검색 · 나침반 · 오프라인 저장 지우기 · 핸드폰 손가락 자리). */
public class CheckupStage5Test {

    private static String web(String name) throws Exception {
        return Files.readString(Path.of("src", "main", "webapp", name), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void networkFirstHasTimeout() throws Exception {
        String sw = web("sw.js");
        assertTrue(sw.contains("var NET_WAIT = 4000;"));
        assertTrue("늦으면 받아 둔 것", sw.contains("if (hit) return hit;"));
        // 2026-11-01: 받아 둔 것이 없는 화면 주소는 끝없이 기다리지 않고 STUCK_WAIT 뒤 "다시 열기"(서비스 워커를 내려놓고 새로 엶)
        assertTrue(sw.contains("req.mode === \"navigate\" ? Promise.race([netOrOffline, stuckPage()]) : netOrOffline"));
        assertTrue(sw.contains("x.unregister()"));
        // 2026-11-01 홍TV님: 통계도 다시 서비스 워커를 거침(PC 크롬 멈춤은 그 브라우저 저장 상태 문제로 보고 되돌림 - 받아 둔 것이 없으면 20초 뒤 "다시 열기")
        assertFalse("통계 건너뛰기 되돌림", sw.contains("/stats(?:[?#]|$)/.test(url)) return;"));
        assertTrue(sw.contains("return Promise.race([netOrOffline, slow]);"));
        assertTrue("늦은 답으로도 캐시를 고침", sw.contains("e.waitUntil(caches.open(cacheName)"));
    }

    @Test
    public void previewSearchHasOwnTimerAndViewIsRounded() throws Exception {
        String app = web("js/app.js");
        assertTrue(app.contains("list.qTimer = setTimeout(function () {"));
        assertFalse("검색이 지도 시계를 쓰지 않음", app.contains("clearTimeout(list.timer);\n        list.timer = setTimeout(function () {"));
        assertTrue("0.01° 바깥으로", app.contains("Math.floor(b.getWest() * 100) / 100"));
        assertTrue("다 받은 범위 안이면 묻지 않음", app.contains("bboxInside(bb, lastView.bb)"));
        assertTrue("잘린 목록은 기억하지 않음", app.contains("if (askBb && !j.truncated) lastView ="));
    }

    @Test
    public void hikeFixes() throws Exception {
        String h = web("js/hike.js");
        assertTrue("JSON 아닌 답", h.contains("return r.json().catch(function () { return { success: false, message: \"응답을 읽지 못했습니다 (HTTP \" + r.status + \")\" }; })"));
        assertTrue("검색창 비우면 순번", h.contains("if (!q) {\n            pickSeq++;"));
        assertTrue("검색어를 지우면 처음 안내 글(+ 찜한 코스 - 2026-10-15)", h.contains("if (wasQ) { nearAt = null; pickHome(); }")
                && h.contains("box.innerHTML = PICK_HINT;"));
        assertTrue("빈 채로 종류 탭 - 내 주변 코스를 그 종류로 다시", h.contains("else if (nearAt) nearList(nearAt.lat, nearAt.lon);"));
        assertTrue("예전 실패는 알리지 않음(2026-11-07 부터 목록 칸에 쉬운 말)", h.contains(".catch(function () {\n                    if (my !== pickSeq) return;"));
        assertTrue("나침반 - 그리기는 화면 한 장에 한 번", h.contains("compass.raf = requestAnimationFrame(drawOrientation);"));
        assertTrue("두 번 붙지 않게", h.contains("if (on === !!compass.listening) return;"));
        assertTrue("산행을 끝내면 나침반 끔", h.contains("compassOff();   // 2026-10-10"));
        assertTrue("안내선은 그렸을 때만 지움", h.contains("if (hike.guideShown && map.getSource(\"guide\")) {"));
        assertTrue("검색어 없어도 종류 탭", h.contains("} else if (kindChanged) {"));
        assertEquals("IndexedDB 가 던져도 약속이 끝남", 2, count(h, "} catch (e) { db.close(); reject(e); }"));
        assertTrue(h.contains("RF.notifyDeploy([\"hike.html\", \"js/hike.js\", \"js/kit-hike.js\", \"css/course-kit.css\"]"));
        assertTrue(web("js/app.js").contains("RF.notifyDeploy([\"index.html\", \"js/app.js\", \"js/kit-app.js\", \"css/course-kit.css\"]"));
    }

    @Test
    public void offlineSaveCanBeDeleted() throws Exception {
        String h = web("js/hike.js"), html = web("hike.html");
        assertTrue(html.contains("id=\"saveDelete\""));
        assertTrue(h.contains("$(\"saveDelete\").addEventListener(\"click\""));
        assertTrue("코스마다 받은 주소 목록", h.contains("cache.put(offlineIndexKey(id), new Response(JSON.stringify(Object.keys(all))"));
        assertTrue("다른 저장 코스가 쓰는 것은 남김", h.contains("return !keep[u];"));
        assertTrue("캐시 이름이 sw.js 와 같음", web("sw.js").contains("OFFLINE = \"rf-offline-v1\""));
    }

    @Test
    public void phoneTouchAndLabels() throws Exception {
        String index = web("index.html"), hike = web("hike.html");
        assertTrue("아이폰 확대 막기", index.contains("color:var(--tx); font-size:16px; outline:none; }"));
        assertTrue("뒤로 · 목록 단추 40px(공원 전체 ‹ 코스 모양)", index.contains("#back { margin-left:auto; display:inline-flex; align-items:center; height:40px;"));
        assertTrue(hike.contains("height:40px; padding:0 11px 0 7px;"));
        assertTrue(hike.contains(".tabs button { flex:0 0 auto; height:44px;"));   // 2026-10-28 점검: 40 → 44px
        for (String s : new String[] { index, hike }) {
            assertTrue(s.contains("id=\"q\" aria-label="));
            assertTrue(s.contains("data-kind=\"\" class=\"on\" aria-pressed=\"true\""));
        }
        for (String id : new String[] { "compass", "voice", "layerBtn", "follow", "noteBtn" }) {
            assertTrue(id, hike.matches("(?s).*id=\"" + id + "\"[^>]*aria-label=.*"));
        }
        assertTrue(web("js/hike.js").contains("x.setAttribute(\"aria-pressed\", x === b ? \"true\" : \"false\");"));
    }

    private static int count(String s, String part) {
        int n = 0;
        for (int i = s.indexOf(part); i >= 0; i = s.indexOf(part, i + 1)) n++;
        return n;
    }
}
