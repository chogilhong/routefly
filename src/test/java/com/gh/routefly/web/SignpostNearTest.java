package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonParser;

/** 코스 상세의 국립공원 위치표지판 - 경로에서 가까운 것만(CourseQueries.nearLine). */
public class SignpostNearTest {

    @Test
    public void nearLineInMeters() {
        // 백무동 쪽 두 점(경도, 위도, 고도, 누적 거리)
        JsonArray pts = JsonParser.parseString("[[127.69648,35.34826,1137,2500],[127.69901,35.34567,1307,3000]]").getAsJsonArray();
        assertEquals(0, CourseQueries.nearLine(pts, 35.34826, 127.69648), 0.5);
        double d = CourseQueries.nearLine(pts, 35.34826 + 0.001, 127.69648);   // 북쪽 약 111m
        assertTrue(String.valueOf(d), d > 105 && d < 117);
        assertTrue(CourseQueries.nearLine(pts, 35.36, 127.70) > CourseQueries.SIGN_NEAR_M);
        assertTrue(Double.isInfinite(CourseQueries.nearLine(new JsonArray(), 35.3, 127.6)));
        assertEquals("가까운 점 번호(위험지역 dist_m 에 씀)", 1, CourseQueries.nearIndex(pts, 35.3457, 127.6990));
        assertEquals(-1, CourseQueries.nearIndex(new JsonArray(), 35.3, 127.6));
    }

    /** 2026-10-10 PC: 위험지역 · 표지판 표만 다시 넣어도 ETag 가 바뀌어야(304 로 옛 응답을 쓰지 않게). */
    @Test
    public void etagFollowsSideTables() {
        String t = "2026-10-10 12:00:00";
        assertNotEquals(CourseServlet.versionTag("a", t + "\n20261011012411|20261011020000|"),
                CourseServlet.versionTag("a", t + "\n20261011012411|20261011030000|"));
    }
}
