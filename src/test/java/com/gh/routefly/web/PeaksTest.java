package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 정상 높이는 공식 값으로(2026-10-16 홍TV님 - 3D 화면 "대청봉 1,700m" → 1,708m). */
public class PeaksTest {

    private static final JsonArray PEAKS = JsonParser.parseString("[{\"id\":\"설악산\",\"lat\":38.119,\"lon\":128.4655,\"elev\":1708.1,\"height\":1734},"
            + "{\"id\":\"공식 높이 없음\",\"lat\":37.0,\"lon\":127.0,\"height\":500}]").getAsJsonArray();

    @Test
    public void detail() {
        List<double[]> tops = Peaks.tops(PEAKS);
        assertEquals("공식 높이가 있는 정상만", 1, tops.size());
        JsonObject d = JsonParser.parseString("{\"course\":{\"ele_max_m\":1700.4},"
                + "\"points\":[[128.44,38.10,300,0],[128.4654,38.1191,1700,9000],[128.47,38.12,1500,10000]],"
                + "\"pois\":[{\"name\":\"대청봉\",\"lat\":38.1192,\"lon\":128.4652,\"ele_m\":1700.0},{\"name\":\"오색\",\"lat\":38.08,\"lon\":128.5,\"ele_m\":285}]}").getAsJsonObject();
        Peaks.applyDetail(d, tops);
        assertEquals(1708, d.getAsJsonArray("pois").get(0).getAsJsonObject().get("ele_m").getAsInt());
        assertTrue(d.getAsJsonArray("pois").get(0).getAsJsonObject().get("ele_official").getAsBoolean());
        assertEquals("정상에서 먼 지점은 그대로", 285, d.getAsJsonArray("pois").get(1).getAsJsonObject().get("ele_m").getAsInt());
        assertEquals("정상을 지나는 코스의 최고", 1708, d.getAsJsonObject("course").get("ele_max_m").getAsInt());
    }

    @Test
    public void guards() {
        assertNull("지나는 정상 없음", Peaks.courseTop(1700.0, List.of()));
        assertNull("너무 다르면(다른 높은 곳) 그대로", Peaks.courseTop(1300.0, List.of(1708)));
        assertEquals(Integer.valueOf(1708), Peaks.courseTop(1700.4, List.of(1708)));
        List<double[]> tops = Peaks.tops(PEAKS);
        assertNull("300m 밖", Peaks.near(tops, 38.125, 128.4655, Peaks.POI_M));
        // 코스가 정상 근처를 지나지 않으면 최고 높이 그대로
        JsonObject d = JsonParser.parseString("{\"course\":{\"ele_max_m\":1200},\"points\":[[128.40,38.05,1200,0]],\"pois\":[]}").getAsJsonObject();
        Peaks.applyDetail(d, tops);
        assertEquals(1200, d.getAsJsonObject("course").get("ele_max_m").getAsInt());
    }
}
