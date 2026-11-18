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
}
