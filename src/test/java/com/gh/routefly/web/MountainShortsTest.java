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
        MountainServlet.withShorts(peaks, videos);
        JsonObject gyeryong = null, gaya = null;
        for (JsonElement e : peaks) {
            String id = e.getAsJsonObject().get("id").getAsString();
            if (id.equals("계룡산")) gyeryong = e.getAsJsonObject();
            if (id.equals("가야산")) gaya = e.getAsJsonObject();
        }
        String ko = MountainServlet.shortsBlock(gyeryong, false);
        assertEquals("<section class=\"shorts\"><h2>▶ 이 산 이야기(유튜브 쇼츠)</h2><ul class=\"tips\"><li><a href=\"https://www.youtube.com/shorts/2k---SG4jbU\" target=\"_blank\" rel=\"noopener\">"
                + "계룡산은 왜 &quot;계룡&quot;일까? 닭 볏을 쓴 용 ›</a></li></ul></section>", ko);
        assertTrue(MountainServlet.shortsBlock(gyeryong, true).contains("(YouTube Shorts, in Korean)"));
        assertEquals("영상이 없는 산은 칸 없음", "", MountainServlet.shortsBlock(gaya, false));
        // 페이지에 실제로 붙음(한국어 · 영어)
        assertTrue(MountainServlet.page(gyeryong, new ArrayList<>(), new ArrayList<>(), null, "", 11).contains("youtube.com/shorts/2k---SG4jbU"));
        assertTrue(MountainEn.page(gyeryong, new ArrayList<>(), new ArrayList<>(), null, "https://r.kr").contains("youtube.com/shorts/2k---SG4jbU"));
        assertFalse(MountainServlet.page(gaya, new ArrayList<>(), new ArrayList<>(), null, "", 11).contains("class=\"shorts\""));
        // 이상한 영상 ID 는 링크로 만들지 않음
        JsonObject bad = JsonParser.parseString("{\"shorts\":[{\"id\":\"x\\\" onclick=\\\"y\",\"title\":\"t\"}]}").getAsJsonObject();
        assertFalse(MountainServlet.shortsBlock(bad, false).contains("<li>"));
    }
}
