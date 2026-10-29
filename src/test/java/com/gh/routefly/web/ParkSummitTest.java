package com.gh.routefly.web;

import static org.junit.Assert.*;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;

/** 탐방 안내도 정상 이름표(2026-10-30 홍TV님 "백운대 정상이 없어") - 공단 탐방로가 꼭대기를 안 지나도 100대 명산 정상을 보임. */
public class ParkSummitTest {

    private static JsonArray peaks() {
        JsonArray p = JsonParser.parseString("[{\"id\":\"북한산\",\"name\":\"북한산\",\"summit\":\"북한산백운대\",\"height\":856,\"lat\":37.658722,\"lon\":126.978088},"
                + "{\"id\":\"가리산\",\"name\":\"가리산\",\"summit\":\"가리산\",\"lat\":37.871387,\"lon\":127.956276},"
                + "{\"id\":\"대암산\",\"name\":\"대암산\",\"summit\":\"대암산\",\"closed\":\"군 통제\",\"lat\":38.21,\"lon\":128.13}]").getAsJsonArray();
        JsonObject elev = JsonParser.parseString("{\"elev\":{\"북한산\":835.6}}").getAsJsonObject();
        MountainServlet.withElev(p, elev);
        return p;
    }

    @Test
    public void addsMissingSummit() {
        JsonArray pl = JsonParser.parseString("[{\"name\":\"만경대\",\"lat\":37.656257,\"lon\":126.979746,\"ele_m\":800}]").getAsJsonArray();
        ParkServlet.addSummits(pl, peaks(), new double[] {126.95, 37.64, 127.0, 37.68});
        assertEquals(2, pl.size());
        JsonObject s = pl.get(1).getAsJsonObject();
        assertEquals("북한산(백운대)", s.get("name").getAsString());
        assertEquals("공식 높이(정상석)", 836, s.get("ele_m").getAsInt());
        assertTrue(s.get("summit").getAsBoolean());
    }

    @Test
    public void keepsExistingAndSkipsOutsideOrClosed() {
        JsonArray pl = JsonParser.parseString("[{\"name\":\"북한산 (백운대)\",\"lat\":37.6588,\"lon\":126.9781,\"ele_m\":836}]").getAsJsonArray();
        ParkServlet.addSummits(pl, peaks(), new double[] {126.95, 37.64, 127.0, 37.68});
        assertEquals("250m 안에 같은 정상 이름표가 있으면 그대로", 1, pl.size());
        JsonArray far = new JsonArray();
        ParkServlet.addSummits(far, peaks(), new double[] {128.0, 38.0, 128.5, 38.5});
        assertEquals("범위 밖 · 통제된 정상(대암산)은 안 더함", 0, far.size());
        JsonArray gari = new JsonArray();
        ParkServlet.addSummits(gari, peaks(), new double[] {127.9, 37.8, 128.0, 37.9});
        assertEquals("정상 이름이 산 이름 그대로면 그 이름", "가리산", gari.get(0).getAsJsonObject().get("name").getAsString());
    }

    /** 빈 구간(data/park-gaps.json - OpenStreetMap, 2026-10-30 숨은벽 → 백운대) - others 꼴로 더함, 이상한 좌표는 뺌. 좌표는 테스트 데이터. */
    @Test
    public void addsGaps() {
        JsonObject gaps = JsonParser.parseString("{\"북한산\":[{\"id\":\"osmgap-1-2\",\"name\":\"북한산 · 숨은벽 → 백운대\",\"distance_m\":700,"
                + "\"coords\":[[126.9775,37.6618],[126.9780,37.6600],[126.9781,37.6587]]},{\"id\":\"bad\",\"name\":\"x\",\"coords\":[[0.1,51.5],[0.2,51.6]]}]}").getAsJsonObject();
        JsonArray others = new JsonArray();
        ParkServlet.addGaps(others, gaps, "북한산");
        assertEquals("나라 밖 좌표는 뺌", 1, others.size());
        JsonObject o = others.get(0).getAsJsonObject();
        assertEquals("북한산 · 숨은벽 → 백운대", o.get("name").getAsString());
        assertEquals(3, o.getAsJsonArray("coords").size());
        assertTrue(o.get("ascent_m").isJsonNull());
        ParkServlet.addGaps(others, gaps, "설악산");
        assertEquals("다른 공원은 그대로", 1, others.size());
        assertTrue("저장소의 park-gaps.json 이 읽힘", new java.io.File("src/main/webapp/data/park-gaps.json").isFile());
    }
}
