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

    @Test
    public void passesBetweenPoints() {   // 솎은 점 사이로 정상을 지나는 코스(점은 둘 다 정상에서 400m 넘게 떨어짐)
        List<double[]> tops = Peaks.tops(PEAKS);
        assertNull(Peaks.near(tops, 38.119, 128.4605, Peaks.PASS_M));
        assertEquals(Integer.valueOf(1708), Peaks.passing(tops, 38.119, 128.4605, 38.1192, 128.4705, Peaks.PASS_M));
        assertNull("비켜 가는 선분", Peaks.passing(tops, 38.125, 128.4605, 38.125, 128.4705, Peaks.PASS_M));
        JsonObject d = JsonParser.parseString("{\"course\":{\"ele_max_m\":1690},\"points\":[[128.4605,38.119,1600,0],[128.4705,38.1192,1650,900]],\"pois\":[]}").getAsJsonObject();
        Peaks.applyDetail(d, tops);
        assertEquals(1708, d.getAsJsonObject("course").get("ele_max_m").getAsInt());
    }

    @Test
    public void shelters() {   // 공단 대피소 높이(data/shelters.json - 2026-10-16)
        List<double[]> sh = Peaks.shelters(JsonParser.parseString("[{\"name\":\"중청대피소\",\"lat\":38.1205,\"lon\":128.4635,\"ele\":1640.4},{\"name\":\"높이 없음\",\"lat\":1,\"lon\":1}]").getAsJsonArray());
        assertEquals("높이 없는 것은 뺌", 1, sh.size());
        JsonObject d = JsonParser.parseString("{\"course\":{},\"points\":[],\"pois\":[{\"name\":\"중청대피소\",\"lat\":38.1206,\"lon\":128.4636,\"ele_m\":1651},"
                + "{\"name\":\"중청\",\"lat\":38.1206,\"lon\":128.4636,\"ele_m\":1651}]}").getAsJsonObject();
        Peaks.applyDetail(d, List.of(), sh);
        assertEquals(1640, d.getAsJsonArray("pois").get(0).getAsJsonObject().get("ele_m").getAsInt());
        assertEquals("이름에 대피소가 없으면 그대로", 1651, d.getAsJsonArray("pois").get(1).getAsJsonObject().get("ele_m").getAsInt());
        // 웹 앱의 파일이 JSON 이고 높이가 숫자
        try {
            JsonObject f = JsonParser.parseString(java.nio.file.Files.readString(java.nio.file.Path.of("src/main/webapp/data/shelters.json"))).getAsJsonObject();
            for (com.google.gson.JsonElement e : f.getAsJsonArray("shelters")) assertTrue(e.getAsJsonObject().get("ele").getAsDouble() > 0);
        } catch (java.io.IOException e) {
            fail(e.toString());
        }
    }

    @Test
    public void ascentFloor() {   // 오르막이 적어도 오르는 높이보다 작으면(2026-10-16 PC: 송추 → 사패능선 오르막 6m)
        assertEquals(Double.valueOf(296), Steep.minClimb(new Double[] {150.0, null, 446.0, 300.0}));
        assertEquals("낮은 끝 기준", Double.valueOf(650), Steep.minClimb(new Double[] {1000.0, 1650.0, 1600.0}));
        assertNull(Steep.minClimb(new Double[] {null, null}));
        assertEquals(Integer.valueOf(296), Steep.ascent(6, 296.0));
        assertEquals("DB 가 더 크면 DB", Integer.valueOf(900), Steep.ascent(900, 650.0));
        assertEquals(Integer.valueOf(650), Steep.ascent(null, 650.0));
        JsonObject d = JsonParser.parseString("{\"course\":{\"ascent_m\":6,\"ele_max_m\":446},\"points\":[[127.0,37.7,150,0],[127.01,37.71,446,2000],[127.02,37.72,300,3250]],\"pois\":[]}").getAsJsonObject();
        Peaks.applyDetail(d, Peaks.tops(PEAKS));
        assertEquals(296, d.getAsJsonObject("course").get("ascent_m").getAsInt());
    }
}
