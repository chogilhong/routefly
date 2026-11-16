package com.gh.routefly.web;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 점검 11차(2026-11-16 홍TV님 "전부 작업해") - docs/review-11-2026-11-16.md. 화면 조각은 review11.test.js(node), 순수 함수는 course-kit.test.js.
 */
public class CheckupRound11Test {

    static String read(String path) throws Exception {
        return Files.readString(Path.of(path), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    /** 화면 조각은 node 로(없으면 건너뜀). */
    @Test
    public void screenPieces() throws Exception {
        ReviewRound5Test.node("src/test/js/review11.test.js");
    }

    /** A1 · A3 ~ A6 - 따라가기 안전. */
    @Test
    public void 따라가기_안전() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), html = read("src/main/webapp/hike.html");
        String adopt = js.substring(js.indexOf("function adoptCourse(nc, msg) {"), js.indexOf("hike.guideBr = null;", js.indexOf("function adoptCourse(nc, msg) {")));
        assertTrue("A1 하산길에서 위험 · 조망 다시 알림", adopt.contains("hike.spotDone = {};"));
        assertTrue("A3 낮은 화면 - 고도 그래프 숨김 · 안내 두 줄", html.contains("@media (max-height:760px) {") && html.contains("#courseNote:not(.open):not([hidden]) { display:-webkit-box;"));
        assertTrue("A4 괜찮으세요 · SOS 는 맨 위", html.contains("#stillSheet, #sosSheet { z-index:10000; }"));
        String still = js.substring(js.indexOf("function stillTick() {"), js.indexOf("if (hike.stillAsk) {", js.indexOf("function stillTick() {")));
        assertFalse("A5 도착이어도 끝 자리 밖이면 움직임 없음 확인", still.contains("|| hike.arrived) return;"));
        assertTrue(still.contains("< ARRIVED_STILL_M)) { hike.still = null; return; }"));
        int sun = js.indexOf("if (sun && hike.running && !hike.sun60"), late = js.indexOf("if (hike.running && hike.lateNext && nowMs > hike.lateNext)"), eta = js.indexOf("if (d >= c.total - ARRIVE_M) setV(\"sEta\"");
        assertTrue("A5 해 지기 · 귀가 예정 알림은 도착 판정 앞(늘)", sun > 0 && late > sun && eta > late);
        assertTrue("A6 벗어나면 진동", js.contains("if (!hike.wasOff && !hike.sim && navigator.vibrate) navigator.vibrate([400, 150, 400]);"));
    }
}
