package com.gh.routefly.web;

import static org.junit.Assert.*;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;

/** 빈 구간(park-gaps.json, OpenStreetMap)을 코스처럼(/api/course?id=osmgap-…) - 2026-10-30 홍TV님 "이 노선을 코스로". 좌표 · 높이는 테스트 데이터. */
public class GapCourseTest {

    @Test
    public void gapDetailLikeCourse() {
        JsonObject g = JsonParser.parseString("{\"id\":\"osmgap-1-2\",\"name\":\"북한산 · 숨은벽 안부 → 북한산(백운대)\",\"fetched\":\"2026-10-30\","
                + "\"coords\":[[126.9770,37.6619,600],[126.9775,37.6605,650],[126.9780,37.6596,640],[126.9781,37.6587,836]]}").getAsJsonObject();
        JsonObject d = CourseServlet.gapDetail(g);
        JsonObject c = d.getAsJsonObject("course");
        assertEquals("osmgap-1-2", c.get("course_id").getAsString());
        assertEquals("hike", c.get("kind").getAsString());
        assertEquals("오르막 = 50 + 196", 246, c.get("ascent_m").getAsInt());
        assertEquals(10, c.get("descent_m").getAsInt());
        assertEquals(836, c.get("ele_max_m").getAsDouble(), 1e-9);
        JsonArray pts = d.getAsJsonArray("points");
        assertEquals(4, pts.size());
        assertEquals("처음 누적 거리 0", 0, pts.get(0).getAsJsonArray().get(3).getAsInt());
        assertEquals("끝 누적 거리 = distance_m", c.get("distance_m").getAsInt(), pts.get(3).getAsJsonArray().get(3).getAsInt());
        JsonArray pois = d.getAsJsonArray("pois");
        assertEquals("숨은벽 안부", pois.get(0).getAsJsonObject().get("name").getAsString());
        assertEquals("북한산(백운대)", pois.get(1).getAsJsonObject().get("name").getAsString());
        assertTrue(CourseQueries.validId("osmgap-374757073-374756974"));
    }

    @Test
    public void gapWithoutEleOrBad() {
        JsonObject noEle = JsonParser.parseString("{\"id\":\"osmgap-1-2\",\"name\":\"a · b → c\",\"coords\":[[126.97,37.66],[126.98,37.65]]}").getAsJsonObject();
        JsonObject c = CourseServlet.gapDetail(noEle).getAsJsonObject("course");
        assertFalse("높이를 모르면 오르막 칸 없음", c.has("ascent_m"));
        assertTrue(CourseServlet.gapDetail(noEle).getAsJsonArray("points").get(0).getAsJsonArray().get(2).isJsonNull());
        assertNull("나라 밖", CourseServlet.gapDetail(JsonParser.parseString("{\"id\":\"x\",\"name\":\"a\",\"coords\":[[0.1,51.5],[0.2,51.6]]}").getAsJsonObject()));
        assertNull(CourseServlet.gapDetail(null));
    }

    /** 정상 이름이 산 이름과 붙어 쓴 것("북한산백운대")도 "백운대" 이름표에 공식 높이(2026-10-30 PC: 숨은벽 · 백운대 그래프 최고 808m). */
    @Test
    public void summitNameGluedToMountain() {
        Peaks.Top t = new Peaks.Top(37.658722, 126.978088, 836, "북한산", "북한산백운대");
        assertTrue(Peaks.sameTop("백운대", t));
        assertFalse("다른 봉우리는 아님", Peaks.sameTop("인수봉", t));
        JsonObject g = JsonParser.parseString("{\"id\":\"osmgap-1-2\",\"name\":\"북한산 · 숨은벽 → 백운대\","
                + "\"coords\":[[126.9770,37.6619,585.7],[126.97807,37.65872,808.4]]}").getAsJsonObject();
        JsonObject d = CourseServlet.gapDetail(g);
        Peaks.applyDetail(d, java.util.List.of(t));
        JsonObject end = d.getAsJsonArray("pois").get(1).getAsJsonObject();
        assertEquals(836, end.get("ele_m").getAsInt());
        assertTrue(end.get("ele_official").getAsBoolean());
    }
}
