package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** dronefly 공역 파일(data/drone-airspace.json)이 받은 브이월드 응답과 같은지 - 응답을 다시 받으면 DroneAirspace 를 다시 돌림. */
public class DroneAirspaceTest {

    @Test
    public void 공역_파일은_받은_응답에서_만든_것() throws Exception {
        String built = DroneAirspace.build(Path.of("src/test/resources/drone"), "2026-11-17");
        assertEquals("DroneAirspace 를 다시 돌려 주세요", built, Files.readString(DroneAirspace.OUT, StandardCharsets.UTF_8));
        JsonObject o = JsonParser.parseString(built).getAsJsonObject();
        // 2026-11-17 PC 가 받은 개수
        assertEquals(15, o.getAsJsonArray("prh").size());
        assertEquals(84, o.getAsJsonArray("res").size());
        assertEquals(53, o.getAsJsonArray("ctr").size());
        assertEquals(75, o.getAsJsonArray("moa").size());
        assertEquals(48, o.getAsJsonArray("ua").size());
        assertEquals(243, o.getAsJsonArray("port").size());   // WFS(2026-11-17 8634745)
        assertEquals(3, o.getAsJsonArray("tmp").size());
        assertTrue(built.contains("[\"군산항 6부두(61,62선석)\",\"UNL\",\"GND\",\"선광㈜\",\"063-450-4306\",\"군산지방해양수산청\",\"063-441-2259\"]"));
        assertTrue(built.contains("\"A)RKRR B)2501311500 C)2504301459\""));
        assertTrue(built.contains("[\"RK P73A\",\"GND\",\"UNL\",\"비행금지구역\"]") && built.contains("[\"(UA 2) GUSEONGSAN\",\"500FT HEI\",\"SFC\"]"));
    }
}
