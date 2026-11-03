package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 코스 정확도 점검(2026-11-03 홍TV님 "노선 · 코스를 중심으로 집중 점검 - 코스가 정확해야 해").
 */
public class CourseAccuracyTest {

    @Test
    public void downhillCourseHasNoFakeClimb() {   // 정상에서 내려가기만 하는 코스: 내리막이 오르막으로 보이면 안 됨
        Double[] down = {1708.0, 1500.0, 1200.0, 900.0, 600.0, 450.0};
        assertEquals(Double.valueOf(0), Steep.minClimb(down));
        assertEquals("배치 오르막 0 그대로", Integer.valueOf(0), Steep.ascent(0, Steep.minClimb(down)));
        // 출발 뒤 조금 오르고 길게 내려감 - 오른 만큼만
        assertEquals(Double.valueOf(50), Steep.minClimb(new Double[] {null, 1000.0, 1050.0, 400.0}));
        // 상세(applyDetail)도 같은 규칙
        JsonObject d = JsonParser.parseString("{\"course\":{\"ascent_m\":0,\"ele_max_m\":1708},\"points\":[[128.46,38.11,1708,0],[128.47,38.12,1200,1500],[128.48,38.13,450,3200]],\"pois\":[]}").getAsJsonObject();
        Peaks.applyDetail(d, Peaks.tops(new JsonArray()));
        assertEquals(0, d.getAsJsonObject("course").get("ascent_m").getAsInt());
    }

    /** 화면 조각은 node 로(없으면 건너뜀). */
    @Test
    public void screenPieces() throws Exception {
        ReviewRound5Test.node("src/test/js/course-accuracy.test.js");
    }

    @Test
    public void summitFirstCourseGoesUp() {   // 정상에서 시작하게 적힌 코스: 따라가기는 들머리부터(&rev=1), 오르막 · 내리막 · 시간도 오르는 쪽
        JsonObject peak = JsonParser.parseString("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.8226,\"lon\":128.1229}").getAsJsonObject();
        JsonObject down = JsonParser.parseString("{\"course_id\":\"k2\",\"name\":\"상왕봉 → 해인사\",\"distance_m\":4000,\"ascent_m\":60,\"descent_m\":600,"
                + "\"start_lat\":35.8226,\"start_lon\":128.1229,\"end_lat\":35.80,\"end_lon\":128.09}").getAsJsonObject();
        JsonObject up = JsonParser.parseString("{\"course_id\":\"k1\",\"name\":\"해인사 → 상왕봉\",\"distance_m\":4000,\"ascent_m\":600,\"descent_m\":60,"
                + "\"start_lat\":35.80,\"start_lon\":128.09,\"end_lat\":35.8226,\"end_lon\":128.1229}").getAsJsonObject();
        JsonObject loop = JsonParser.parseString("{\"course_id\":\"k3\",\"name\":\"원점회귀\",\"distance_m\":8000,\"ascent_m\":700,\"descent_m\":700,"
                + "\"start_lat\":35.80,\"start_lon\":128.09,\"end_lat\":35.8005,\"end_lon\":128.0905}").getAsJsonObject();
        assertTrue(MountainServlet.fromTop(down, peak));
        assertFalse(MountainServlet.fromTop(up, peak));
        assertFalse("원점회귀는 적힌 방향 그대로", MountainServlet.fromTop(loop, peak));
        List<JsonObject> cs = new ArrayList<>(List.of(down, up, loop));
        String ko = MountainServlet.page(peak, cs, new ArrayList<>(), null, "");
        assertTrue(ko, ko.contains("/hike.html?lang=ko#c=k2&amp;rev=1&amp;m="));
        assertTrue(ko.contains("/hike.html?lang=ko#c=k1&amp;m="));
        assertTrue(ko.contains("/hike.html?lang=ko#c=k3&amp;m="));
        assertTrue("오르는 쪽 오르막 · 내리막(일출 출발 · 거르기)", ko.contains("data-id=\"k2\" data-name=\"상왕봉 → 해인사\" data-dist=\"4000\" data-asc=\"600\" data-desc=\"60\""));
        assertTrue(ko.contains(" · 오르막 600m"));
        assertFalse("내려가는 쪽 오르막 60m 가 보이지 않음", ko.contains(" · 오르막 60m"));
        assertTrue("🚌 가는 길(들머리)과 같은 쪽", ko.contains("35.800000,128.090000"));
        String en = MountainEn.page(peak, cs, new ArrayList<>(), null, "");
        assertTrue(en.contains("/hike.html?lang=en#c=k2&amp;rev=1&amp;m="));
        assertTrue(en.contains("data-id=\"k2\" data-name=\"상왕봉 → 해인사\" data-dist=\"4000\" data-asc=\"600\" data-desc=\"60\""));
        assertEquals("원본 코스는 그대로", 60, down.get("ascent_m").getAsInt());
        // 문답 "정상까지 편도"도 오르는 쪽(1시간 + 1시간 + 2분)
        assertTrue(ko.contains("정상까지 편도 약 2시간 2분"));
    }
}
