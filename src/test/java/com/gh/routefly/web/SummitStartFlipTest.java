package com.gh.routefly.web;

import static org.junit.Assert.*;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 2026-11-26 홍TV님 "설악산 · 남설악탐방지원센터 → 대청봉 · … → 소공원 인데" - 정상을 넘어 반대쪽으로 내려가는 종주가
 * 들머리(오색)가 날머리(소공원)보다 정상에 가깝다고 뒤집혀 보였음. 정상에서 시작하는 코스만 뒤집음.
 * 좌표: u-20261126-142312 의 api 응답 시작 · 끝, 정상은 data/mountains100.json 의 설악산.
 */
public class SummitStartFlipTest {

    @Test
    public void ridgeOverSummitKeepsWrittenDirection() {
        JsonObject peak = JsonParser.parseString("{\"id\":\"설악산\",\"name\":\"설악산\",\"lat\":38.119102,\"lon\":128.465347}").getAsJsonObject();
        JsonObject c = JsonParser.parseString("{\"course_id\":\"u-20261126-142312\",\"name\":\"설악산 · 남설악탐방지원센터 → 대청봉 → 소공원\","
                + "\"start_lat\":38.08476,\"start_lon\":128.449,\"end_lat\":38.17405,\"end_lon\":128.48663}").getAsJsonObject();
        assertFalse("들머리가 정상에서 먼 종주는 적힌 방향 그대로", MountainServlet.fromTop(c, peak));
        // 정상에서 시작해 소공원으로 내려가는 코스는 여전히 뒤집음
        JsonObject down = JsonParser.parseString("{\"course_id\":\"d\",\"name\":\"대청봉 → 소공원\","
                + "\"start_lat\":38.119102,\"start_lon\":128.465347,\"end_lat\":38.17405,\"end_lon\":128.48663}").getAsJsonObject();
        assertTrue(MountainServlet.fromTop(down, peak));
    }
}
