package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 내 기록 요약 - 이동 시간 · 휴식 시간 · 이동 중 평균 속도(2026-11-22 홍TV님 - 램블러 요약을 보고). 셈은 course-kit.test.js(RF.moveStats). */
public class HikeMoveStatsTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC git 은 CRLF 로 체크아웃
    }

    @Test
    public void 기록_요약에_이동_휴식_속도() throws Exception {
        // 2026-11-23 홍TV님: 내 기록 📈 창의 요약은 기록 보기 화면(trip.html)으로 - RF.recordSummary
        String js = read("src/main/webapp/js/course-kit.js"), kit = read("src/main/webapp/js/kit-trip.js");
        assertTrue("튄 점을 뺀 기록으로", js.contains("moveStats(cleanTrack(rec.track, rec.kind === \"bike\"))"));
        assertTrue(js.contains("[L(\"이동 시간\", \"Moving time\"), hms(mv.moveMs)], [L(\"휴식 시간\", \"Rest time\"), hms(mv.restMs)]"));
        assertTrue("이동 시간이 없으면 줄을 안 보임", js.contains("if (mv && mv.moveMs > 0) out.push("));
        assertTrue(js.contains("[L(\"평균 속도(이동 중)\", \"Avg speed (moving)\"), num(mv.kmh, 1) + \" km/h\"]"));
        assertTrue("기록 보기 화면이 받는 kit 에", kit.contains("function moveStats(track)") && kit.contains("var MOVE_WINDOW_MS = 120000, MOVE_MIN_MS = 0.2;") && kit.contains("function recordSummary(rec, peaks, elev, en)"));
    }
}
