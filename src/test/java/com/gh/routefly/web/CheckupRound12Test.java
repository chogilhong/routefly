package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 점검 12차(2026-11-18 홍TV님 "단계별로 작업 진행해") - 1단계: 안전 · 버그 A1 ~ A8, 메모리 멈춤 막기 B1 · B2. A1 · A2 는 dronefly.test.js. */
public class CheckupRound12Test {

    static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    /** B1: 바깥 응답은 크기 상한을 넘으면 받다가 끊음(2026-11-17 운영 OutOfMemoryError). */
    @Test
    public void B1_바깥_응답_크기_상한() throws Exception {
        assertEquals("가나다", OpenApi.readCapped(new ByteArrayInputStream("가나다".getBytes(StandardCharsets.UTF_8)), 100));
        assertNull(OpenApi.readCapped(new ByteArrayInputStream(new byte[101]), 100));
        String api = read("src/main/java/com/gh/routefly/web/OpenApi.java");
        assertTrue(api.contains("HttpResponse.BodyHandlers.ofInputStream()") && !api.contains("BodyHandlers.ofString"));
        assertTrue("B7 로그에 주소(키)를 남기지 않음", api.contains("log.warn(\"[{}] 호출 실패 - {}\", tag, e.getClass().getSimpleName());"));
        String h = read("src/main/java/com/gh/routefly/web/HeritageServlet.java");
        assertTrue("문화재는 8MB · 동시 2개 · 같은 칸 한 번", h.contains("Duration.ofSeconds(10), MAX_BYTES)") && h.contains("new java.util.concurrent.Semaphore(2)") && h.contains("FLIGHT.putIfAbsent(key, mine)"));
    }

    /** B2: 문화재 칸 기억은 바이트로 80칸, IP 한도 시간당 20번. */
    @Test
    public void B2_문화재_기억과_한도() throws Exception {
        assertEquals(80, HeritageServlet.CACHE_CELLS);
        String h = read("src/main/java/com/gh/routefly/web/HeritageServlet.java");
        assertTrue(h.contains("OpenApi.Cache<byte[]> CACHE") && h.contains("OutQuota.of(\"heritage\", 20, 5000)"));
    }

    /** A3 실패 칸 2분 쉼 · A4 늦은 답 버림 · A5 치는 동안 · A7 지도 임시 금지도 같은 때 · A8 문화재 칸 아래로. */
    @Test
    public void A3_A8_드론플라이() throws Exception {
        String js = read("src/main/webapp/js/dronefly.js");
        assertTrue("A3", js.contains("if (!w || (w !== true && Date.now() - w > 120000)) {") && js.contains("if (!d || d.unavailable) { herWait[key] = Date.now(); return; }"));
        assertTrue("A4", js.contains("var my = ++ask;\n      navigator.geolocation.getCurrentPosition(function (pos) {\n        if (my !== ask) return;") && js.contains("if (my !== ask) return;\n        var ps"));
        assertTrue("A5", js.contains("['alt', 'radius', 'shootWhat'].forEach(function (id) { $(id).addEventListener('input',"));
        assertTrue("A1 · A7", js.contains("var zones = zonesAt(data, here.lat, here.lon, when), v = verdict(zones, opts());\n    refreshAir(when);") && js.contains("map.getSource('air').setData(toGeoJSON(data, when));"));
        assertTrue("A8", js.contains("var before = map.getLayer('her-fill') ? 'her-fill' : undefined;"));
    }

    /** A6: 백그라운드 위치 감시 번호 기억을 따라가기 · 산악회 방이 같이(party-kit). */
    @Test
    public void A6_감시_번호_같이() throws Exception {
        String kit = read("src/main/webapp/js/party-kit.js"), hike = read("src/main/webapp/js/hike.js"), party = read("src/main/webapp/js/party.js");
        assertTrue(kit.contains("var BG_KEY = \"rf-bg-watch\";") && !hike.contains("var BG_KEY"));
        assertTrue(hike.contains("function bgStopAll() { RFParty.bgStopAll(BG); }"));
        assertTrue(party.contains("RFParty.bgStopAll(BG);   // 화면이 막 열림") && party.contains("{ bgId = id; RFParty.bgSave([id]); }") && party.contains("bgId = null; }\n        RFParty.bgSave([]);"));
    }

    /** 2단계: B3 서버 전체 길 점 한도 · B6 검색어 답 공용 캐시 안 함 · B8 http: 빼기 · B9 넘침 물통 /48 · E1 WFS 주소 한 벌. */
    @Test
    public void 단계2_보안과_정리() throws Exception {
        String party = read("src/main/java/com/gh/routefly/web/Party.java");
        assertTrue("B3", party.contains("static final int ALL_TRACK_MAX = 1_000_000;") && party.contains("(m.room.trackPts >= ROOM_TRACK_MAX || allPts >= ALL_TRACK_MAX) && m.track.size() > 100")
                && party.split("allPts -= r.trackPts;", -1).length == 3);
        assertTrue("B6", read("src/main/java/com/gh/routefly/web/PlaceServlet.java").contains("Json.okPrivate(req, resp, out);"));
        assertTrue("B8", !SecurityFilter.CSP.contains(" http: ") && SecurityFilter.CSP.contains("connect-src 'self' https: data: blob:;"));
        assertEquals("B9 IPv6 는 /48 마다", "overflow:2001:db8:1::/48", RateLimiter.overflowKey(RateLimiter.group("2001:db8:1:2::5")));
        assertEquals("overflow", RateLimiter.overflowKey("1.2.3.4"));
        assertTrue("E1", read("src/test/java/com/gh/routefly/web/DroneProbe.java").contains("return HeritageServlet.wfs(layer, bbox);"));
    }

    /** 3단계: C1 공역 자료 먼저 받기 · C2 지형 음영 빼기 · C3 문화재 하루 · C4 tidefly 목록 1분 담기 + 304, 이름 찾기 한 시간. */
    @Test
    public void 단계3_속도() throws Exception {
        assertTrue("C1 (2026-11-18 부터 /api/airspace)", read("src/main/webapp/dronefly.html").contains("<link rel=\"preload\" href=\"api/airspace\" as=\"fetch\" crossorigin>"));
        assertTrue("C2", read("src/main/webapp/js/dronefly.js").contains("if (cfg && cfg.vworldKey) { st.layers = st.layers.filter(function (l) { return l.id !== 'hillshade'; }); delete st.sources.hillshade; }"));
        assertTrue("C3", read("src/main/java/com/gh/routefly/web/HeritageServlet.java").contains("Json.notModified(req, resp, tag, \"public, max-age=86400\")"));
        String tf = read("src/main/java/com/gh/routefly/tidefly/TideflyServlet.java");
        assertTrue("C4", tf.contains("if (cached != null && now - listAt < 60_000) { sendList(req, resp, cached); return; }") && tf.contains("if (!missing) { listCache = text; listAt = now; } else listCache = null;")
                && tf.contains("resp.setHeader(\"Cache-Control\", \"private, max-age=3600\");"));
        String t = com.gh.routefly.tidefly.TideflyServlet.etag("{}");
        // C5(2026-11-18 홍TV님 "2,3 번 작업 진행해"): 펼친 카드가 없으면 1분마다 다시 그리지 않음
        assertTrue("C5", read("src/main/webapp/js/tidefly.js").contains("    paintToday();\n    if (!listEl.querySelector('.cards')) return;\n    var fa = document.activeElement;"));
        assertTrue(t, t.matches("W/\"[0-9a-f]{16}\"") && t.equals(com.gh.routefly.tidefly.TideflyServlet.etag("{}")) && !t.equals(com.gh.routefly.tidefly.TideflyServlet.etag("{ }")));
    }

    /** 4단계: 화면 · 접근성 D1 ~ D9. */
    @Test
    public void 단계4_화면() throws Exception {
        String js = read("src/main/webapp/js/dronefly.js"), h = read("src/main/webapp/dronefly.html"), css = read("src/main/webapp/css/dronefly.css"), tf = read("src/main/webapp/css/tidefly.css");
        assertTrue("D1", js.contains("if (!fromMap) showResult();") && js.contains("$('result').scrollIntoView({ behavior: 'smooth', block: 'start' })"));
        assertTrue("D2", tf.contains(".top .tfLogo .wm { font: 800 min(2.1rem, 9vw)/1") && css.contains(".top .tfLogo .ic .dIc { width: min(2.6rem, 11vw);"));
        assertTrue("D3", css.contains("color: var(--care);") && css.contains(".due.ok { background: rgba(30, 142, 62, .12); color: var(--ok); }") && css.contains(".btn.go { border: 2px dashed #38d9ea; color: #0b6f7c;"));
        assertTrue("D4", tf.contains(".help summary { cursor: pointer; font-weight: 600; min-height: 44px;"));
        assertTrue("D5", read("src/main/webapp/css/mountain.css").contains(".kindLink .fs { flex:1; min-width:0; font-size:12.5px; color:var(--dim); overflow:hidden; line-height:1.35; }"));
        assertTrue("D6", h.contains("<button type=\"submit\" class=\"findBtn\" data-en=\"Search\">찾기</button>") && js.contains("tr('두 글자 이상 적어 주세요.'"));
        assertTrue("D7", read("src/main/webapp/hike.html").contains("height:44px; padding:0 13px; border-radius:22px;") && read("src/main/webapp/css/course-kit.css").contains("#pick .pickTop .rfTextBtn { flex:0 0 auto; height:44px;"));
        assertTrue("D8", h.contains("<option value=\"취미 · 레저\" data-en=\"Hobby · leisure\">") && js.contains("f[0].setAttribute('aria-label', lang === 'en' ? f[0].getAttribute('data-en-aria') : f[1]);"));
        assertTrue("D9", js.contains("150m 아래 · 낮에는 승인 없이, 관할 부대 확인") && !js.contains("낮은 승인"));
    }

    /** 코스 모음 접는 칸 사이 · 위아래를 좁게(2026-11-18 홍TV님 "각 사이, 그리고 위아래 폭을 조금 좁혀줘") - 줄 높이는 손가락 44px 이상. */
    @Test
    public void 코스모음_접는칸_간격() throws Exception {
        String css = read("src/main/webapp/css/mountain.css");
        assertTrue(css.contains("#season, #near, #recent, #weekend, #staySearch, #steep, #curious, #gearIdx { margin-bottom:8px; padding-top:0; padding-bottom:0; }"));
        assertTrue("10 + 글 + 10 = 44px 이상", css.contains("#gearIdx > .fold > summary { padding-top:10px; padding-bottom:10px; }"));
        assertTrue("접혔을 때 아래 줄 감춤", css.contains("#gearIdx > .fold:not([open]) > summary { border-bottom-color:transparent; }"));
    }
}
