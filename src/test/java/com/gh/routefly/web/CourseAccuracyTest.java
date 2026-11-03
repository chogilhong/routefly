package com.gh.routefly.web;

import static org.junit.Assert.*;

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
}
