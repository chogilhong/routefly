package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.time.LocalDate;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 이번 주말 날씨 좋은 산(2026-10-15). 예보 값은 테스트 데이터, 중기는 실제 응답(resources/mid). */
public class WeekendServletTest {

    @Test
    public void weekendDates() {
        assertEquals("[2026-10-17, 2026-10-18]", WeekendServlet.weekend(LocalDate.of(2026, 10, 15)).toString());   // 목
        assertEquals("[2026-10-17, 2026-10-18]", WeekendServlet.weekend(LocalDate.of(2026, 10, 17)).toString());   // 토
        assertEquals("[2026-10-18]", WeekendServlet.weekend(LocalDate.of(2026, 10, 18)).toString());               // 일
    }

    @Test
    public void shortDaySummary() {
        StringBuilder h = new StringBuilder("{\"hours\":[");
        for (int i = 0; i < 24; i++) h.append(i > 0 ? "," : "").append("{\"t\":\"2026-10-17 ").append(String.format("%02d", i)).append(":00\",\"sky\":")
                .append(i < 12 ? 1 : 3).append(",\"pty\":").append(i == 20 ? 1 : 0).append(",\"pop\":").append(i == 15 ? 20 : 0).append("}");
        h.append("]}");
        JsonObject d = WeekendServlet.shortDay(JsonParser.parseString(h.toString()).getAsJsonObject(), "2026-10-17");
        assertEquals("낮(06 ~ 18시) 맑음 6 · 구름 7 → 구름많음, 20시 비는 셈하지 않음", "{\"word\":\"구름많음\",\"pop\":20,\"good\":true}", d.toString());
        assertNull("그 날 자료 없음", WeekendServlet.shortDay(JsonParser.parseString(h.toString()).getAsJsonObject(), "2026-10-18"));
        assertFalse(WeekendServlet.day("흐리고 비", 60).get("good").getAsBoolean());
        assertFalse(WeekendServlet.day("맑음", 40).get("good").getAsBoolean());
    }

    @Test
    public void midDayFromRealResponse() throws Exception {
        String land = new String(WeekendServletTest.class.getResourceAsStream("/mid/land-11H20000.json").readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        String ta = new String(WeekendServletTest.class.getResourceAsStream("/mid/ta-11H20701.json").readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        JsonObject mid = new JsonObject();
        mid.add("days", MidServlet.days(land, ta, "202610151800"));
        JsonObject d = WeekendServlet.midDay(mid, "2026-10-24");
        assertNotNull(d);
        assertTrue(d.has("word") && d.has("pop") && d.has("good"));
        assertNull(WeekendServlet.midDay(mid, "2026-10-17"));
    }
}
