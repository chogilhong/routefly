package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 국립공원 스탬프투어 인증지(2026-10-28 홍TV님 "그럼 하시오") - 코스 선 300m 안만 코스 페이지에, 좌표 없는 줄은 뺌, 자료 파일 꼴. */
public class NpStampTest {

    @Test
    public void stampsNearCourse() {
        JsonArray st = JsonParser.parseString("[{\"park\":\"시험공원\",\"name\":\"가까운센터\",\"lat\":38.0010,\"lon\":128.0000},"
                + "{\"park\":\"시험공원\",\"name\":\"먼센터\",\"lat\":38.0500,\"lon\":128.0000},{\"park\":\"시험공원\",\"name\":\"좌표없음\"}]").getAsJsonArray();
        double[] lat = {38.0000, 38.0005, 38.0020}, lon = {128.0010, 128.0010, 128.0010}, dist = {0, 55, 222};
        List<Object[]> on = CoursePageServlet.stampsOn(st, lat, lon, dist);
        assertEquals(1, on.size());
        assertEquals("가까운센터", on.get(0)[0]);
        assertTrue((Integer) on.get(0)[2] < 120);
        assertTrue(CoursePageServlet.stampsOn(null, lat, lon, dist).isEmpty());
        JsonObject c = new JsonObject();
        c.addProperty("course_id", "x-1"); c.addProperty("name", "시험 <코스>"); c.addProperty("kind", "hike"); c.addProperty("distance_m", 222);
        c.addProperty("start_lat", 38.0); c.addProperty("start_lon", 128.001); c.addProperty("end_lat", 38.002); c.addProperty("end_lon", 128.001);
        String html = CoursePageServlet.page(c, null, null, dist, new Double[] {100.0, 110.0, 120.0}, new JsonArray(), true, "https://routefly.kr/routefly", on);
        assertTrue(html.contains("🏅 국립공원 스탬프투어 인증지") && html.contains("가까운센터"));
        assertFalse("없으면 칸 없음", CoursePageServlet.page(c, null, null, dist, new Double[] {100.0, 110.0, 120.0}, new JsonArray(), true, "https://routefly.kr/routefly").contains("스탬프투어"));
    }

    @Test
    public void dataFileShape() throws Exception {
        JsonObject j = JsonParser.parseString(java.nio.file.Files.readString(java.nio.file.Path.of("src/main/webapp/data/np-stamps.json"))).getAsJsonObject();
        assertTrue(j.has("_src") && j.get("stamps").isJsonArray());
        for (var e : j.getAsJsonArray("stamps")) {   // 넣은 줄은 공원 · 이름 · 좌표가 다 있어야
            JsonObject s = e.getAsJsonObject();
            assertTrue(s.toString(), s.has("park") && s.has("name") && s.get("lat").getAsDouble() > 33 && s.get("lat").getAsDouble() < 39 && s.get("lon").getAsDouble() > 124 && s.get("lon").getAsDouble() < 132);
        }
    }
}
