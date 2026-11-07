package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 산림청 명산등산로(15158915) → 산 페이지 선정 이유(2026-11-07). 응답은 PC MountainInfoProbe 가 받은 실제 응답, 산은 data/mountains100.json. */
public class MountainInfoTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC(core.autocrlf)는 CRLF
    }

    private static JsonArray peaks() throws Exception {
        return JsonParser.parseString(read("src/main/webapp/data/mountains100.json")).getAsJsonObject().getAsJsonArray("peaks");
    }

    @Test
    public void readsRealResponse() throws Exception {
        List<Map<String, String>> s = MountainInfoProbe.items(read("src/test/resources/mountain-info/search-설악산.xml"));
        assertEquals(1, s.size());
        assertEquals("428302602", s.get(0).get("mntncd"));
        assertEquals("섬세한 비경 두루 갖춘 팔방미인", s.get(0).get("subnm"));
        assertTrue(s.get(0).get("aeatreason").startsWith("남한에서 세 번째로 높은 봉우리인 한계령"));
        assertTrue("<BR> 은 띄어쓰기로, 두 번 감싼 글자도 풀림", s.get(0).get("overview").startsWith("<금강산보다 몇 수 위인 한국의 알프스> 한마디로 한국의 알프스다."));
        assertTrue("태그 없음", !s.get(0).get("etccourse").contains("BR"));
    }

    @Test
    public void matchesPeaksOnly() throws Exception {
        List<Map<String, String>> items = new ArrayList<>(MountainInfoProbe.items(read("src/test/resources/mountain-info/search-설악산.xml")));
        items.addAll(MountainInfoProbe.items(read("src/test/resources/mountain-info/area-강원.xml")));   // 가리산 · 가리왕산 · 계방산
        List<String> miss = new ArrayList<>();
        JsonObject info = MountainInfoProbe.match(peaks(), items, miss);
        assertEquals("100대 명산 가운데 받은 넷만", 4, info.size());
        assertEquals("421100101", info.getAsJsonObject("가리산").get("code").getAsString());
        assertEquals("소양호에서 폭포 따라 정상까지", info.getAsJsonObject("가리산").get("sub").getAsString());
        assertTrue(info.has("설악산") && info.has("가리왕산") && info.has("계방산"));
        assertEquals("못 맞춘 산은 이름만", 96, miss.size());
        assertTrue(miss.contains("백운산(광양)"));
    }

    @Test
    public void mountainPageShowsReasonWithSource() throws Exception {
        List<Map<String, String>> items = MountainInfoProbe.items(read("src/test/resources/mountain-info/search-설악산.xml"));
        JsonObject file = new JsonObject();
        file.add("info", MountainInfoProbe.match(peaks(), items, new ArrayList<>()));
        JsonArray ps = peaks();
        MountainServlet.withInfo(ps, file.getAsJsonObject("info"));
        JsonObject seorak = null;
        for (var e : ps) if ("설악산".equals(e.getAsJsonObject().get("id").getAsString())) seorak = e.getAsJsonObject();
        String page = MountainServlet.page(seorak, new ArrayList<>(), new ArrayList<>(), null, "https://routefly.kr/routefly");
        assertTrue(page.contains("<section class=\"why\"><h2>설악산 - 산림청 100대 명산 선정 이유</h2><p><b>섬세한 비경 두루 갖춘 팔방미인</b></p><p>남한에서 세 번째로"));
        assertTrue(page.contains("출처: 산림청 「명산등산로」(공공데이터포털)"));
        JsonObject gaya = null;
        for (var e : ps) if ("가야산".equals(e.getAsJsonObject().get("id").getAsString())) gaya = e.getAsJsonObject();
        assertTrue("산 자료를 읽을 때 붙임", read("src/main/java/com/gh/routefly/web/MountainServlet.java").contains("withInfo(p, readInfo(getServletContext()));"));
        assertFalse("자료가 없는 산은 칸 없음", MountainServlet.page(gaya, new ArrayList<>(), new ArrayList<>(), null, "").contains("class=\"why\""));
    }
}
