package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.TreeMap;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 점검 10차 E5(2026-11-15) - 바다 가까운 명산(정상 10km 안 tidefly 포인트)에서 tidefly 로 잇는 줄. 실제 data 파일로. */
public class FishNearTest {

    private static JsonArray peaks() throws Exception {
        JsonArray p = JsonParser.parseString(Files.readString(Path.of("src/main/webapp/data/mountains100.json"), StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("peaks");
        MountainServlet.withFishing(p, JsonParser.parseString(Files.readString(Path.of("src/main/webapp/data/tidefly-points.json"), StandardCharsets.UTF_8)).getAsJsonArray());
        return p;
    }

    @Test
    public void 바다_가까운_명산만() throws Exception {
        TreeMap<String, String> near = new TreeMap<>();
        for (JsonElement e : peaks()) {
            JsonObject o = e.getAsJsonObject();
            if (o.has("fish_near")) near.put(o.get("name").getAsString(), o.get("fish_near").getAsString() + " " + o.get("fish_km").getAsDouble());
        }
        assertEquals(10, near.size());
        assertEquals("원천항 3.4", near.get("금산"));
        assertEquals("울릉도 4.2", near.get("성인봉"));
        assertTrue(!near.containsKey("설악산"));
    }

    @Test
    public void 산_페이지에_줄() throws Exception {
        JsonObject geum = null, seorak = null;
        for (JsonElement e : peaks()) {
            String n = e.getAsJsonObject().get("name").getAsString();
            if (n.equals("금산")) geum = e.getAsJsonObject();
            if (n.equals("설악산")) seorak = e.getAsJsonObject();
        }
        int m = java.time.LocalDate.now(WeatherServlet.KST).getMonthValue();
        String ko = MountainServlet.page(geum, new ArrayList<>(), new ArrayList<>(), null, "", m), en = MountainEn.page(geum, new ArrayList<>(), new ArrayList<>(), null, "");
        assertTrue(ko.contains("<p class=\"fishNear\">🎣 가까운 낚시 포인트 <a href=\"" + MountainServlet.REL + "/tidefly.html?lang=ko&amp;q="));
        assertTrue(ko.contains(">원천항</a> · 약 3.4km - 물때 · 바람 · 파고(tidefly)</p>"));
        assertTrue(en.contains("/tidefly.html?lang=en&amp;q=") && en.contains(">원천항</a> · about 3.4 km"));
        assertTrue("코스 목록 바로 위", ko.indexOf("class=\"fishNear\"") < ko.indexOf("<section id=\"trails\">"));
        assertEquals("", MountainServlet.fishLine(seorak, false));
    }
}
