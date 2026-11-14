package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Map;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 🌧 레이더 비구름(2026-11-14) - 실제 응답 src/test/resources/radar/(RadarProbe, 2026-11-14 13:50 KST). 기대값은 같은 파일을 따로 계산한 값. */
public class RadarTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    private static Map<Integer, Double> echo() throws Exception {
        return Radar.echoes(read("src/test/resources/radar/rdr-aws-all-202611141350.txt"));
    }

    private static Map<Integer, double[]> stn() throws Exception {
        return Radar.stations(read("src/test/resources/radar/stn-aws.txt"));
    }

    @Test
    public void readsRealFiles() throws Exception {
        Map<Integer, Double> e = echo();
        assertEquals("비 값 387 + 강수없음(-250) 107 - 설명에 없는 -200 23곳은 뺌", 494, e.size());
        assertEquals("삼호(44) 2.72mm/h", 2.72, e.get(44), 1e-9);
        assertEquals("광덕산(94) -250 → 0", 0.0, e.get(94), 1e-9);
        assertFalse("안면도(132) -200 은 모름", e.containsKey(132));
        double[] p = stn().get(44);
        assertEquals(34.74476, p[0], 1e-9);
        assertEquals(126.41220, p[1], 1e-9);
    }

    @Test
    public void nearHallasan() throws Exception {
        JsonObject o = Radar.near(echo(), stn(), 33.361015, 126.535667, "202611141350");   // 한라산 정상 자리(mountains100.json)
        assertEquals("13:50", o.get("tm").getAsString());
        assertEquals(4, o.get("seen").getAsInt());
        assertEquals(4, o.get("count").getAsInt());
        assertEquals(2.6, o.get("max").getAsDouble(), 1e-9);
        assertEquals("가까운 3곳만", 3, o.getAsJsonArray("rain").size());
        JsonObject first = o.getAsJsonArray("rain").get(0).getAsJsonObject();
        assertEquals(10.0, first.get("km").getAsDouble(), 1e-9);
        assertEquals("북", first.get("dir").getAsString());
        assertEquals(2.6, first.get("mmh").getAsDouble(), 1e-9);
        assertEquals("남서", o.getAsJsonArray("rain").get(1).getAsJsonObject().get("dir").getAsString());
    }

    @Test
    public void nearBukhansanAndUnknown() throws Exception {
        JsonObject o = Radar.near(echo(), stn(), 37.658722, 126.978088, "202611141350");   // 북한산
        assertEquals(18, o.get("seen").getAsInt());
        assertEquals("0.1mm/h 넘는 곳만", 12, o.get("count").getAsInt());
        assertEquals(0.4, o.get("max").getAsDouble(), 1e-9);
        assertEquals("남동", o.getAsJsonArray("rain").get(0).getAsJsonObject().get("dir").getAsString());
        assertNull("지리산 둘레 15km 안에 값 있는 지점이 없으면 모름(비 없음이라 하지 않음)", Radar.near(echo(), stn(), 35.336895, 127.730614, "202611141350"));
        JsonObject here = Radar.near(echo(), stn(), 34.74476, 126.41220, "202611141350");   // 삼호 지점 바로 위
        assertEquals("1km 안은 방향 없음", "", here.getAsJsonArray("rain").get(0).getAsJsonObject().get("dir").getAsString());
    }

    @Test
    public void staleDataIsNotShown() {
        assertTrue("같은 시각", Radar.fresh("202611141410", "202611141410"));
        assertTrue("30분 늦은 것까지", Radar.fresh("202611141340", "202611141410"));
        assertFalse("40분 늦은 것은 안 보임(미리 받기가 계속 실패)", Radar.fresh("202611141330", "202611141410"));
        assertFalse("자정 넘어", Radar.fresh("202611142320", "202611150000"));
    }

    @Test
    public void secondRealSlotAlsoReads() throws Exception {
        Map<Integer, Double> e = Radar.echoes(read("src/test/resources/radar/rdr-aws-all-202611141410.txt"));   // PC 0d58824 - 비 373곳 · 최대 10.73
        assertEquals(10.73, e.values().stream().mapToDouble(Double::doubleValue).max().getAsDouble(), 1e-9);
        assertEquals(373, e.values().stream().filter(v -> v > 0).count());
    }
}
