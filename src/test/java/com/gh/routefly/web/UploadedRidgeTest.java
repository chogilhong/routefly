package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 홍TV님이 올린 종주 코스(u-)는 들머리가 멀어도 정상을 지나면 산 페이지에(2026-11-25 홍TV님 "2번으로 해" - 덕유산 육구종주).
 * 출발 · 도착 자리는 운영 /api/course?id=u-20261125-233437 값(PC 2026-11-25), 정상은 mountains100.json 의 덕유산.
 */
public class UploadedRidgeTest {

    private static JsonObject row(String id, double sLat, double sLon, double eLat, double eLon) {
        JsonObject o = new JsonObject();
        o.addProperty("course_id", id);
        o.addProperty("name", id);
        o.addProperty("start_lat", sLat); o.addProperty("start_lon", sLon);
        o.addProperty("end_lat", eLat); o.addProperty("end_lon", eLon);
        return o;
    }

    @Test
    public void 올린_종주는_정상을_지나면_산_페이지에() throws Exception {
        JsonObject peak = null;
        for (com.google.gson.JsonElement e : JsonParser.parseString(new String(Files.readAllBytes(Paths.get("src/main/webapp/data/mountains100.json")), StandardCharsets.UTF_8))
                .getAsJsonObject().getAsJsonArray("peaks")) if ("덕유산".equals(e.getAsJsonObject().get("id").getAsString())) peak = e.getAsJsonObject();
        assertNotNull(peak);
        double lat = peak.get("lat").getAsDouble(), lon = peak.get("lon").getAsDouble();
        JsonObject yukgu = row("u-20261125-233437", 35.718259, 127.660334, 35.900739, 127.776669);   // 육십령 → 구천동
        JsonObject nearU = row("u-near", lat + 0.005, lon, lat - 0.03, lon);                          // 들머리가 정상 2km 안 - near 가 이미 고름
        JsonObject farKmp = row("kmp-far", 35.718259, 127.660334, 35.900739, 127.776669);            // 올린 코스가 아님
        JsonObject inFar = row("u-infar", lat + 0.03, lon, lat + 0.03, lon);                           // far 에 이미 든 것
        JsonArray rows = new JsonArray();
        for (JsonObject o : new JsonObject[] {yukgu, nearU, farKmp, inFar}) rows.add(o);
        List<JsonObject> far = new ArrayList<>();
        far.add(inFar);
        List<JsonObject> mine = MountainServlet.mine(rows, peak, far);
        assertEquals(1, mine.size());
        assertSame(yukgu, mine.get(0));
        assertTrue("정상을 안 지나면(passes 없음) 넣지 않음", MountainServlet.through(mine, peak).isEmpty());
        yukgu.add("passes", JsonParser.parseString("[\"덕유산\"]"));
        assertEquals(1, MountainServlet.through(mine, peak).size());

        String src = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/MountainServlet.java")), StandardCharsets.UTF_8);
        assertTrue("가파름 · 지나는 산을 채움", src.contains("mine.forEach(picked::add);"));
        int cut = src.indexOf("courses = new ArrayList<>(courses.subList(0, MAX_COURSES));"), add = src.indexOf("for (JsonObject o : through(mine, peak))");
        assertTrue("30개로 자른 뒤 끝에 더함", cut > 0 && add > cut);

        JsonObject f = JsonParser.parseString(new String(Files.readAllBytes(Paths.get("src/main/webapp/data/flights.json")), StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonObject("videos");
        JsonObject v = f.getAsJsonArray("덕유산").get(0).getAsJsonObject();
        assertEquals("JKiWncRJL4Y", v.get("id").getAsString());
        assertEquals("u-20261125-233437", v.get("course").getAsString());
    }
}
