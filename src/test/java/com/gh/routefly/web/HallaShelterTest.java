package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 한라산 대피소 따로(2026-11-23 홍TV님 "한라산은 별도로 넣어줘") - data/halla-shelters.json 을 지도 표시(famousFetch)에만. */
public class HallaShelterTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8);
    }

    @Test
    public void 한라산_대피소_자료와_지도_표시() throws Exception {
        JsonArray s = JsonParser.parseString(read("src/main/webapp/data/halla-shelters.json")).getAsJsonObject().getAsJsonArray("shelters");
        assertEquals(4, s.size());
        for (JsonElement e : s) {
            JsonObject o = e.getAsJsonObject();
            double lat = o.get("lat").getAsDouble(), lon = o.get("lon").getAsDouble();
            assertTrue(o.get("name").getAsString(), o.get("name").getAsString().endsWith("대피소") && "한라산".equals(o.get("park").getAsString()));
            assertTrue(o.get("name").getAsString() + " 한라산 안", lat > 33.30 && lat < 33.45 && lon > 126.45 && lon < 126.65);
            assertTrue("자리 출처", o.get("src").getAsString().startsWith("osm "));
        }
        String kit = read("src/main/webapp/js/course-kit.js");
        assertTrue(kit.contains("j(\"data/knps-shelters.json\"), j(\"data/halla-shelters.json\")]).then(function (d) {")
            && kit.contains("return { gj: famousMarks(peaks, elev, shelters.concat(halla)), peaks: peaks, elev: elev, shelters: shelters };"));
        assertFalse("예약 · 검색 카드(Shelters · hike.js)는 공단 것만", read("src/main/java/com/gh/routefly/web/Shelters.java").contains("halla") || read("src/main/webapp/js/hike.js").contains("halla-shelters"));
    }
}
