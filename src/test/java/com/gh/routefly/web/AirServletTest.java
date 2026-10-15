package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 미세먼지(에어코리아 - 2026-10-15). 응답 모양은 공공데이터포털 활용 안내의 JSON(response.header.resultCode · body.items),
 * 값은 테스트 데이터. 실제 응답은 AirProbe 로 받아 src/test/resources/air/ 에 둡니다.
 */
public class AirServletTest {

    static final String STATIONS = "{\"response\":{\"header\":{\"resultCode\":\"00\",\"resultMsg\":\"NORMAL_CODE\"},\"body\":{\"totalCount\":4,\"items\":["
            + "{\"stationName\":\"가야면\",\"addr\":\"경남 합천군 가야면\",\"dmX\":\"35.7900\",\"dmY\":\"128.1200\"},"
            + "{\"stationName\":\"거꾸로\",\"addr\":\"경북 고령군\",\"dmX\":\"128.3000\",\"dmY\":\"35.7300\"},"
            + "{\"stationName\":\"좌표없음\",\"dmX\":\"\",\"dmY\":\"\"},"
            + "{\"stationName\":\"서울\",\"dmX\":\"37.56\",\"dmY\":\"126.97\"}]}}}";

    @Test
    public void stationsReadEitherAxisOrder() {
        List<String> names = new ArrayList<>();
        List<double[]> pos = new ArrayList<>();
        assertTrue(AirServlet.stations(STATIONS, names, pos, new ArrayList<>()));
        assertEquals(List.of("가야면", "거꾸로", "서울"), names);
        assertEquals(35.73, pos.get(1)[0], 1e-9);   // dmX 가 경도여도 위도로 맞춤
        assertEquals(128.3, pos.get(1)[1], 1e-9);
        assertEquals("가까운 차례 · 40km 안만", List.of(0, 1), AirServlet.nearest(pos, 35.80, 128.10, AirServlet.AIR_NEAR_M, 3));
        assertEquals(List.of(0), AirServlet.nearest(pos, 35.80, 128.10, AirServlet.AIR_NEAR_M, 1));
        assertTrue("40km 안에 없음", AirServlet.nearest(pos, 33.5, 126.5, AirServlet.AIR_NEAR_M, 3).isEmpty());
    }

    @Test
    public void errorCodeIsNotData() {
        assertFalse(AirServlet.stations("{\"response\":{\"header\":{\"resultCode\":\"30\"}}}", new ArrayList<>(), new ArrayList<>(), new ArrayList<>()));
        assertFalse(AirServlet.stations("<OpenAPI_ServiceResponse>", new ArrayList<>(), new ArrayList<>(), new ArrayList<>()));
        assertNull(AirServlet.measure("{\"response\":{\"header\":{\"resultCode\":\"22\"}}}"));
    }

    @Test
    public void measureSkipsBlankRowsAndGrades() {
        String t = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":{\"item\":["
                + "{\"dataTime\":\"2026-10-15 15:00\",\"pm10Value\":\"-\",\"pm25Value\":\"-\"},"
                + "{\"dataTime\":\"2026-10-15 14:00\",\"pm10Value\":\"42\",\"pm25Value\":\"14\"}]}}}}";
        JsonObject m = AirServlet.measure(t);
        assertEquals("2026-10-15 14:00", m.get("time").getAsString());
        assertEquals(42, m.get("pm10").getAsInt());
        assertEquals("보통", m.get("pm10Word").getAsString());
        assertEquals("좋음", m.get("pm25Word").getAsString());
    }

    /** 실제 응답(AirProbe 2026-10-15 14시, 대가야읍 - 가야산) - items 가 배열인 모양. */
    @Test
    public void realResponse() throws Exception {
        String t = new String(AirServletTest.class.getResourceAsStream("/air/measure-대가야읍.json").readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        JsonObject m = AirServlet.measure(t);
        assertEquals("2026-10-15 14:00", m.get("time").getAsString());
        assertEquals(18, m.get("pm10").getAsInt());
        assertEquals(6, m.get("pm25").getAsInt());
        assertEquals("좋음", m.get("pm10Word").getAsString());
    }

    @Test
    public void regionFromAddress() {
        assertEquals("경남", AirServlet.region("경남 합천군 가야면"));
        assertEquals("경남", AirServlet.region("경상남도 합천군"));
        assertEquals("전북", AirServlet.region("전북특별자치도 군산시 외항1길 222"));
        assertEquals("경기북부", AirServlet.region("경기 포천시 신북면"));
        assertEquals("경기남부", AirServlet.region("경기도 수원시 장안구"));
        assertEquals("영동", AirServlet.region("강원특별자치도 고성군 간성읍"));
        assertEquals("영서", AirServlet.region("강원 춘천시"));
        assertEquals("서울", AirServlet.region("서울 도봉구 방학로"));
        assertNull(AirServlet.region(""));
    }

    /** 예보 응답 모양은 공공데이터포털 안내(informCode · informData · informGrade · dataTime), 값은 테스트 데이터. 실제 응답은 AirProbe → air/forecast.json. */
    @Test
    public void forecastLatestPerDay() {
        String t = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":["
                + "{\"informCode\":\"PM10\",\"informData\":\"2026-10-16\",\"dataTime\":\"2026-10-15 11시 발표\",\"informGrade\":\"서울 : 보통,경남 : 나쁨\"},"
                + "{\"informCode\":\"PM10\",\"informData\":\"2026-10-16\",\"dataTime\":\"2026-10-15 17시 발표\",\"informGrade\":\"서울 : 좋음,경남 : 보통\"},"
                + "{\"informCode\":\"PM25\",\"informData\":\"2026-10-16\",\"dataTime\":\"2026-10-15 17시 발표\",\"informGrade\":\"서울 : 좋음,경남 : 좋음\"},"
                + "{\"informCode\":\"O3\",\"informData\":\"2026-10-16\",\"dataTime\":\"2026-10-15 17시 발표\",\"informGrade\":\"경남 : 보통\"},"
                + "{\"informCode\":\"PM10\",\"informData\":\"2026-10-17\",\"dataTime\":\"2026-10-15 17시 발표\",\"informGrade\":\"경남 : 예보없음\"}]}}}";
        assertEquals("{\"2026-10-16\":{\"pm10\":\"보통\",\"pm25\":\"좋음\"}}", AirServlet.forecastFor(t, "경남").toString());
        assertEquals(0, AirServlet.forecastFor(t, "제주").size());
    }

    /** 실제 예보 응답(AirProbe 2026-10-15 17시 무렵) - 경북 · 서울 · 제주 모두 날짜별 등급이 나옴. */
    @Test
    public void realForecast() throws Exception {
        String t = new String(AirServletTest.class.getResourceAsStream("/air/forecast.json").readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        for (String r : new String[] {"경북", "서울", "제주", "영동", "경기북부"}) {
            JsonObject f = AirServlet.forecastFor(t, r);
            assertTrue(r + " 예보", f.size() > 0);
            String d = f.keySet().iterator().next();
            assertTrue(r + " " + d, f.getAsJsonObject(d).has("pm10") || f.getAsJsonObject(d).has("pm25"));
        }
    }

    @Test
    public void gradeBoundaries() {
        assertEquals("좋음", AirServlet.word(30, 30, 80, 150));
        assertEquals("보통", AirServlet.word(80, 30, 80, 150));
        assertEquals("나쁨", AirServlet.word(81, 30, 80, 150));
        assertEquals("매우나쁨", AirServlet.word(76, 15, 35, 75));
    }
}
