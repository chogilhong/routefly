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
    }
}
