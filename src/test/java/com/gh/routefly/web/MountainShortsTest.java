package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 산 페이지 ▶ 이 산 이야기(유튜브 쇼츠) - data/shorts.json(홍TV님이 올린 영상 주소, 2026-11-19). */
public class MountainShortsTest {

    private static JsonObject json(String path) throws Exception {
        return JsonParser.parseString(new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8)).getAsJsonObject();
    }

    @Test
    public void 산_페이지에_쇼츠() throws Exception {
        JsonObject videos = json("src/main/webapp/data/shorts.json").getAsJsonObject("videos");
        JsonArray peaks = json("src/main/webapp/data/mountains100.json").getAsJsonArray("peaks");
        // shorts.json 의 산 이름은 모두 mountains100.json 의 id(틀리면 칸이 안 붙음)
        for (String id : videos.keySet()) {
            boolean found = false;
            for (JsonElement e : peaks) found |= id.equals(e.getAsJsonObject().get("id").getAsString());
            assertTrue(id, found);
        }
        // 2판(Vrew · 밝은 판)으로 다시 올린 영상(2026-11-20 - docs/youtube/v2/): 계룡산 Elzwl8pQ8vQ(아래) · 공작산 dHGzzqRUsCE · 금산 eWfqp97Uwco · 가리왕산 bFC_tTjoaFA · 명성산 Vq2UPp31dtM · 용문산 wyo-8TdOXsQ · 강천산 icz6CCy-hBE · 오봉산 VwPdgUtgg0g · 칠갑산 cAi60TLaI_w · 오대산 DbQOtOK3rnk · 적상산 GKlusMikJvI · 지리산 s9D8pcz0RvY
        assertEquals("dHGzzqRUsCE", videos.getAsJsonArray("공작산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("eWfqp97Uwco", videos.getAsJsonArray("금산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("bFC_tTjoaFA", videos.getAsJsonArray("가리왕산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("Vq2UPp31dtM", videos.getAsJsonArray("명성산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("wyo-8TdOXsQ", videos.getAsJsonArray("용문산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("icz6CCy-hBE", videos.getAsJsonArray("강천산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("VwPdgUtgg0g", videos.getAsJsonArray("오봉산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("cAi60TLaI_w", videos.getAsJsonArray("칠갑산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("DbQOtOK3rnk", videos.getAsJsonArray("오대산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("GKlusMikJvI", videos.getAsJsonArray("적상산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("R8yW3K7rDvk", videos.getAsJsonArray("두타산").get(0).getAsJsonObject().get("id").getAsString());   // 새 산(2026-11-21)
        assertEquals("nc2cHCHNr_k", videos.getAsJsonArray("백운산(정선)").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("n2BHPYH3QXQ", videos.getAsJsonArray("주왕산").get(0).getAsJsonObject().get("id").getAsString());
        assertEquals("s9D8pcz0RvY", videos.getAsJsonArray("지리산").get(0).getAsJsonObject().get("id").getAsString());
        MountainServlet.withShorts(peaks, videos);
        JsonObject gyeryong = null, gaya = null;
        for (JsonElement e : peaks) {
            String id = e.getAsJsonObject().get("id").getAsString();
            if (id.equals("계룡산")) gyeryong = e.getAsJsonObject();
            if (id.equals("가야산")) gaya = e.getAsJsonObject();
        }
        String ko = MountainServlet.shortsBlock(gyeryong, false);
        assertEquals("<section class=\"shorts\"><h2>▶ 이 산 이야기</h2><ul class=\"tips\"><li><a href=\"https://www.youtube.com/shorts/Elzwl8pQ8vQ\" target=\"_blank\" rel=\"noopener\">"
                + "닭볏 쓴 용이 사는 산? 계룡산 이야기 ›</a></li></ul></section>", ko);
        assertTrue(MountainServlet.shortsBlock(gyeryong, true).contains("▶ Story of this mountain (in Korean)"));
        assertEquals("영상이 없는 산은 칸 없음", "", MountainServlet.shortsBlock(gaya, false));
        // 페이지에 실제로 붙음(한국어 · 영어)
        assertTrue(MountainServlet.page(gyeryong, new ArrayList<>(), new ArrayList<>(), null, "", 11).contains("youtube.com/shorts/Elzwl8pQ8vQ"));
        assertTrue(MountainEn.page(gyeryong, new ArrayList<>(), new ArrayList<>(), null, "https://r.kr").contains("youtube.com/shorts/Elzwl8pQ8vQ"));
        assertFalse(MountainServlet.page(gaya, new ArrayList<>(), new ArrayList<>(), null, "", 11).contains("class=\"shorts\""));
        // 자리: "코스 n개 바로 보기" 바로 위(2026-11-20 홍TV님) - 코스가 있을 때 쇼츠 칸 끝 바로 뒤가 바로 보기 줄
        JsonObject c = new JsonObject();
        c.addProperty("course_id", "knps-2016-e8499de1");
        c.addProperty("name", "계룡산 · 삼불봉 → 관음봉");
        c.addProperty("distance_m", 1820);
        String withCourse = MountainServlet.page(gyeryong, new ArrayList<>(java.util.List.of(c)), new ArrayList<>(), null, "", 11);
        assertTrue(withCourse.contains("</ul></section><p class=\"jump\"><a href=\"#trails\">🥾 코스 1개 바로 보기 ↓</a></p>"));
        assertTrue(MountainEn.page(gyeryong, new ArrayList<>(java.util.List.of(c)), new ArrayList<>(), null, "https://r.kr").contains("</ul></section><p class=\"jump\"><a href=\"#trails\">🥾 See the 1 trail"));
        // 이상한 영상 ID 는 링크로 만들지 않음
        JsonObject bad = JsonParser.parseString("{\"shorts\":[{\"id\":\"x\\\" onclick=\\\"y\",\"title\":\"t\"}]}").getAsJsonObject();
        assertFalse(MountainServlet.shortsBlock(bad, false).contains("<li>"));
    }
}
