package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.time.LocalDateTime;

import com.google.gson.JsonObject;
import org.junit.Test;

/** 들머리 날씨(기상청 단기예보) - 2026-10-14. 응답은 단기예보 JSON 모양으로 만든 테스트 데이터. */
public class WeatherServletTest {

    @Test
    public void gridKnownPoints() {
        assertArrayEquals("서울시청", new int[] {60, 127}, WeatherServlet.grid(37.5665, 126.9780));
        int[] g = WeatherServlet.grid(35.79, 128.12);   // 가야산 해인사 둘레
        assertTrue(g[0] > 70 && g[0] < 90 && g[1] > 80 && g[1] < 100);
    }

    @Test
    public void baseTimePicksLatestIssued() {
        assertArrayEquals(new String[] {"20261014", "1400"}, WeatherServlet.baseTime(LocalDateTime.of(2026, 10, 14, 14, 15)));
        assertArrayEquals("10분 전에는 앞 발표", new String[] {"20261014", "1100"}, WeatherServlet.baseTime(LocalDateTime.of(2026, 10, 14, 14, 5)));
        assertArrayEquals("새벽 2시 10분 전은 전날 23시", new String[] {"20261013", "2300"}, WeatherServlet.baseTime(LocalDateTime.of(2026, 10, 14, 1, 30)));
        assertArrayEquals(new String[] {"20261014", "2300"}, WeatherServlet.baseTime(LocalDateTime.of(2026, 10, 14, 23, 59)));
    }

    @Test
    public void previousIssueAndNoData() {
        assertArrayEquals(new String[] {"20261014", "1100"}, WeatherServlet.previous(new String[] {"20261014", "1400"}));
        assertArrayEquals(new String[] {"20261013", "2300"}, WeatherServlet.previous(new String[] {"20261014", "0200"}));
        assertTrue(WeatherServlet.noData("{\"response\":{\"header\":{\"resultCode\": \"03\",\"resultMsg\":\"NO_DATA\"}}}"));
        assertFalse(WeatherServlet.noData("{\"response\":{\"header\":{\"resultCode\":\"00\"}}}"));
    }

    @Test
    public void neighborsAreFourSides() {
        assertArrayEquals(new int[][] {{60, 129}, {62, 129}, {61, 128}, {61, 130}}, WeatherServlet.neighbors(new int[] {61, 129}));
    }

    @Test
    public void urlHasGridAndEncodedKey() {
        String u = WeatherServlet.url(WeatherServlet.DEFAULT_URL, "k+/=", new int[] {81, 88}, new String[] {"20261014", "1400"});
        assertTrue(u, u.contains("serviceKey=k%2B%2F%3D") && u.contains("nx=81&ny=88") && u.contains("base_time=1400") && u.contains("dataType=JSON"));
    }

    @Test
    public void bodyGroupsByHour() {
        String t = "{\"response\":{\"header\":{\"resultCode\":\"00\",\"resultMsg\":\"NORMAL_SERVICE\"},\"body\":{\"items\":{\"item\":["
                + "{\"category\":\"TMP\",\"fcstDate\":\"20261014\",\"fcstTime\":\"1500\",\"fcstValue\":\"18\"},"
                + "{\"category\":\"SKY\",\"fcstDate\":\"20261014\",\"fcstTime\":\"1500\",\"fcstValue\":\"3\"},"
                + "{\"category\":\"PTY\",\"fcstDate\":\"20261014\",\"fcstTime\":\"1500\",\"fcstValue\":\"0\"},"
                + "{\"category\":\"POP\",\"fcstDate\":\"20261014\",\"fcstTime\":\"1500\",\"fcstValue\":\"20\"},"
                + "{\"category\":\"WSD\",\"fcstDate\":\"20261014\",\"fcstTime\":\"1500\",\"fcstValue\":\"2.4\"},"
                + "{\"category\":\"PCP\",\"fcstDate\":\"20261014\",\"fcstTime\":\"1500\",\"fcstValue\":\"강수없음\"},"
                + "{\"category\":\"TMP\",\"fcstDate\":\"20261014\",\"fcstTime\":\"1600\",\"fcstValue\":\"17\"},"
                + "{\"category\":\"TMN\",\"fcstDate\":\"20261015\",\"fcstTime\":\"0600\",\"fcstValue\":\"6.0\"},"
                + "{\"category\":\"TMX\",\"fcstDate\":\"20261015\",\"fcstTime\":\"1500\",\"fcstValue\":\"21.0\"}]}}}}";
        JsonObject o = WeatherServlet.body(t, new String[] {"20261014", "1400"});
        assertEquals("2026-10-14 14:00", o.get("base").getAsString());
        assertEquals(2, o.getAsJsonArray("hours").size());
        JsonObject h = o.getAsJsonArray("hours").get(0).getAsJsonObject();
        assertEquals("2026-10-14 15:00", h.get("t").getAsString());
        assertEquals(18, h.get("tmp").getAsInt());
        assertEquals(3, h.get("sky").getAsInt());
        assertEquals(2.4, h.get("wsd").getAsDouble(), 1e-9);
        assertEquals("강수없음", h.get("pcp").getAsString());
        assertEquals(6.0, o.getAsJsonObject("days").getAsJsonObject("2026-10-15").get("tmn").getAsDouble(), 1e-9);
        assertEquals("기상청", o.get("source").getAsString());
    }

    @Test
    public void bodyRejectsErrors() {
        assertNull(WeatherServlet.body("{\"response\":{\"header\":{\"resultCode\":\"03\",\"resultMsg\":\"NO_DATA\"}}}", new String[] {"20261014", "1400"}));
        assertNull(WeatherServlet.body("<OpenAPI_ServiceResponse/>", new String[] {"20261014", "1400"}));
    }
}
