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

/** 산 페이지 🛩 3D 종주 영상(2026-11-23 홍TV님 "루트플라이에서 활용할 만한 것" 1 · 5번) - data/flights.json, 기록 보기 예시 링크. */
public class MountainFlightTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 산_페이지에_3D_종주_영상() throws Exception {
        JsonObject videos = JsonParser.parseString(read("src/main/webapp/data/flights.json")).getAsJsonObject().getAsJsonObject("videos");
        JsonArray peaks = JsonParser.parseString(read("src/main/webapp/data/mountains100.json")).getAsJsonObject().getAsJsonArray("peaks");
        for (String id : videos.keySet()) {   // 산 이름은 모두 mountains100.json 의 id(틀리면 칸이 안 붙음)
            boolean found = false;
            for (JsonElement e : peaks) found |= id.equals(e.getAsJsonObject().get("id").getAsString());
            assertTrue(id, found);
        }
        assertEquals("RlOjuH9X8R4", videos.getAsJsonArray("지리산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("MtTrpzZRLgM", videos.getAsJsonArray("북한산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("MtTrpzZRLgM", videos.getAsJsonArray("도봉산").get(0).getAsJsonObject().get("id").getAsString());

        JsonArray p = new JsonArray();
        JsonObject ji = new JsonObject(), gy = new JsonObject();
        ji.addProperty("id", "지리산");
        gy.addProperty("id", "계룡산");
        p.add(ji); p.add(gy);
        MountainServlet.withFlights(p, videos);
        String ko = MountainServlet.flightBlock(ji, false), en = MountainServlet.flightBlock(ji, true);
        assertEquals("<section class=\"shorts flight\"><h2>🛩 3D 종주 영상</h2><ul class=\"tips\"><li><a href=\"https://www.youtube.com/watch?v=RlOjuH9X8R4\" target=\"_blank\" rel=\"noopener\">"
                + "지리산 성중종주 3D 비행 - 성삼재 → 천왕봉 → 중산리 · 35.9km (1분 42초) ›</a></li></ul><p class=\"src\">GPS 기록으로 routefly 🛩 3D 영상을 만들었습니다 - 내 GPX 로도 됩니다: 📒 내 기록 → 📂 GPX 열기 → 🛩 3D 영상.</p></section>", ko);
        assertTrue(en.startsWith("<section class=\"shorts flight\"><h2>🛩 3D traverse video (Korean captions)</h2>"));
        assertEquals("영상이 없는 산은 칸 없음", "", MountainServlet.flightBlock(gy, false));
        JsonObject bad = new JsonObject(), arr = new JsonObject();
        JsonArray one = new JsonArray();
        arr.addProperty("id", "x\"><script>");
        arr.addProperty("title", "t");
        one.add(arr);
        bad.add("flights", one);
        assertEquals("이상한 영상 ID 는 버림", "", MountainServlet.flightBlock(bad, false));

        String ms = read("src/main/java/com/gh/routefly/web/MountainServlet.java"), me = read("src/main/java/com/gh/routefly/web/MountainEn.java");
        assertTrue("한국어 · 영어 산 페이지 모두 이 산 이야기 바로 아래", ms.contains("withFlights(p, readJsonVideos(getServletContext(), \"/data/flights.json\"));")
                && ms.contains("b.append(flightBlock(peak, false));") && me.contains("b.append(MountainServlet.flightBlock(peak, true));"));
        assertTrue("기록 보기(GPX 열기) 첫 화면에 3D 영상 예시", read("src/main/webapp/trip.html").contains("<a href=\"https://www.youtube.com/watch?v=RlOjuH9X8R4\" target=\"_blank\" rel=\"noopener\">지리산 성중종주</a>"));
    }
}
