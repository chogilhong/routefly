package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 코스 페이지 예상 시간 - 국립공원 공식 시간이 있으면 그것(2026-11-04 홍TV님: "월출산 · 구정봉 → 홍계골" 1.49km 하산이 어림 34분, 공단 52분, 실제 안내 45분 ~ 1시간).
 * 값은 운영 routefly.kr /api/course 의 info · distance_m.
 */
public class CourseOfficialTimeTest {

    private static JsonObject info(String json) {
        return JsonParser.parseString(json).getAsJsonObject();
    }

    @Test
    public void officialTimeFirst() {
        JsonObject gujeong = info("{\"up_min\":52,\"down_min\":52,\"level\":null,\"notice\":null}");   // knps-17018-20bc8e55 · 1,492m
        assertEquals(Integer.valueOf(52), CoursePageServlet.officialMin(gujeong, 1492));
        assertEquals("약 52분(국립공원 공식 안내)", CoursePageServlet.timeText("hike", 1492, 6, 345, CoursePageServlet.officialMin(gujeong, 1492)));
        // knps-4014-29ea77ae 소공원 → 희운각대피소 1,592m 에 공단 230분 - 더 긴 공식 구간의 시간이라 쓰지 않고 어림
        JsonObject heeun = info("{\"up_min\":230,\"down_min\":160,\"level\":\"어려움(2.86)\"}");
        assertNull(CoursePageServlet.officialMin(heeun, 1592));
        assertTrue(CoursePageServlet.timeText("hike", 1592, 426, 46, CoursePageServlet.officialMin(heeun, 1592)).endsWith("쉬는 시간 포함)"));
        assertNull("공식 정보 없음", CoursePageServlet.officialMin(null, 1492));
        assertEquals("오르는 시간이 없으면 내려오는 시간", Integer.valueOf(52), CoursePageServlet.officialMin(info("{\"down_min\":52}"), 1492));
        assertEquals("1시간 넘으면 시간 · 분", "약 1시간 10분(국립공원 공식 안내)", CoursePageServlet.timeText("hike", 3000, 300, 0, 70));
        assertEquals("딱 맞는 시간은 분 없이", "약 2시간(국립공원 공식 안내)", CoursePageServlet.timeText("hike", 3980, 779, 12, 120));
    }

    @Test
    public void pageShowsOfficialTime() {
        JsonObject c = info("{\"course_id\":\"knps-17018-20bc8e55\",\"name\":\"월출산 · 구정봉 → 홍계골\",\"kind\":\"hike\",\"distance_m\":1492,\"ascent_m\":6,\"descent_m\":345,\"ele_min_m\":347.6,\"ele_max_m\":687.2,\"start_lat\":34.760294,\"start_lon\":126.693703,\"end_lat\":34.762772,\"end_lon\":126.68339}");
        String page = CoursePageServlet.page(c, null, info("{\"up_min\":52,\"down_min\":52}"), null, null, new com.google.gson.JsonArray(), true, "https://r.kr", java.util.List.of());
        assertTrue("검색 설명에 공식 시간", page.contains("오르막 6m · 약 52분. 고도 그림"));
        assertTrue("요약 칸", page.contains("<dt>예상 시간</dt><dd>약 52분(국립공원 공식 안내)</dd>"));
        assertFalse("어림 34분은 없음", page.contains("약 34분"));
    }
}
