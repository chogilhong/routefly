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

/** 기상청 날씨누리 단풍 · 철쭉 관측(공공데이터 15150373) → 산 페이지 · 코스 모음 칸(2026-11-14). 값은 src/test/resources/season/ 의 실제 파일. */
public class SeasonTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC(core.autocrlf)는 CRLF
    }

    private static JsonArray peaks() throws Exception {
        return JsonParser.parseString(read("src/main/webapp/data/mountains100.json")).getAsJsonObject().getAsJsonArray("peaks");
    }

    private static JsonArray seasoned() throws Exception {
        JsonArray p = peaks();
        MountainServlet.withSeason(p, JsonParser.parseString(read("src/main/webapp/data/season.json")).getAsJsonObject());
        return p;
    }

    private static JsonObject peak(JsonArray all, String id) {
        return MountainServlet.find(all, id);
    }

    @Test
    public void committedJsonIsRebuiltFromRealFile() throws Exception {
        JsonObject built = SeasonProbe.build(read(SeasonProbe.CSV.toString()), peaks());
        assertEquals("season.json 은 SeasonProbe 로 다시 만든 것과 같아야 함", SeasonProbe.json(built), read("src/main/webapp/data/season.json"));
        assertEquals("단풍 21곳(포털 설명)", 21, built.getAsJsonObject("foliage").size());
        assertEquals("철쭉 3곳", 3, built.getAsJsonObject("azalea").size());
        assertEquals("2025-10-23", built.getAsJsonObject("foliage").getAsJsonObject("가야산").get("start").getAsString());
        assertEquals("2025-11-05", built.getAsJsonObject("foliage").getAsJsonObject("가야산").get("peak").getAsString());
        assertEquals("2026-05-29", built.getAsJsonObject("azalea").getAsJsonObject("소백산").get("peak").getAsString());
        assertFalse("벚꽃 지점(도시)은 산이 아니라 뺌", built.toString().contains("여의도"));
        assertFalse("지리산(통영)에 지리산 관측을 붙이지 않음", built.getAsJsonObject("foliage").has("지리산(통영)"));
    }

    @Test
    public void csvKeepsQuotedNewlines() {
        List<List<String>> r = SeasonProbe.csv("﻿a,b\r\n1,\"x\ny, \"\"z\"\"\"\r\n");
        assertEquals(2, r.size());
        assertEquals("x\ny, \"z\"", r.get(1).get(1));
        assertNull(SeasonProbe.day("결측"));
        assertEquals("2025-11-05", SeasonProbe.day(" 2025-11-05 15:48"));
    }

    @Test
    public void mountainPageShowsLastObservation() throws Exception {
        JsonArray all = seasoned();
        JsonObject g = peak(all, "가야산");
        String html = MountainServlet.page(g, new ArrayList<>(), new ArrayList<>(), null, "https://routefly.kr/routefly");
        assertTrue(html.contains("<section class=\"season\"><h2>가야산 단풍 시기</h2>"));
        assertTrue(html.contains("🍁 단풍 시작 2025년 10월 23일 · 절정 11월 5일"));
        assertTrue("예측이 아니라고 밝힘", html.contains("올해 예측이 아님"));
        assertTrue("출처", html.contains("기상청 날씨누리"));
        assertTrue("자주 묻는 질문", html.contains("<dt>가야산 단풍 절정은 언제인가요?</dt>"));

        String sb = MountainServlet.page(peak(all, "소백산"), new ArrayList<>(), new ArrayList<>(), null, "https://routefly.kr/routefly");
        assertTrue(sb.contains("<h2>소백산 단풍 · 철쭉 시기</h2>"));
        assertTrue(sb.contains("🌸 철쭉 꽃 핌 2026년 5월 20일 · 활짝 5월 29일"));
        assertTrue(sb.contains("<dt>소백산 철쭉은 언제 피나요?</dt>"));

        String none = MountainServlet.page(peak(all, "가리산"), new ArrayList<>(), new ArrayList<>(), null, "https://routefly.kr/routefly");
        assertFalse("관측 없는 산은 칸 없음", none.contains("class=\"season\""));
        assertFalse(none.contains("단풍 절정은"));
    }

    @Test
    public void indexListsPeakOrder() throws Exception {
        String html = MountainServlet.indexPage(seasoned(), new JsonArray(), "https://routefly.kr/routefly", false);
        int s = html.indexOf("<section id=\"season\">");
        assertTrue(s > 0);
        String sec = html.substring(s, html.indexOf("</section>", s));
        assertTrue(sec.contains("🍁 단풍 절정 차례 <small>(2025년 관측)</small>"));
        assertTrue("가장 이른 오대산이 설악산보다 앞", sec.indexOf("오대산 <small>10월 16일") < sec.indexOf("설악산 <small>10월 24일"));
        assertTrue(sec.indexOf("설악산 <small>") < sec.indexOf("내장산 <small>11월 11일"));
        assertTrue(sec.contains("🌸 철쭉 활짝 차례 <small>(2026년 관측)</small>"));
        assertTrue(sec.indexOf("지리산 <small>4월 29일") > sec.indexOf("🌸"));

        JsonArray bare = peaks();
        assertEquals("season.json 이 없으면 칸도 없음", "", MountainServlet.seasonFold(bare));
        assertEquals("", MountainServlet.seasonBlock(peak(bare, "가야산"), "가야산"));
    }

    @Test
    public void badDatesAreDropped() throws Exception {
        JsonArray p = peaks();
        MountainServlet.withSeason(p, JsonParser.parseString("{\"foliage\":{\"가야산\":{\"start\":\"10월\",\"peak\":\"2025-11-05\"}}}").getAsJsonObject());
        JsonObject g = peak(p, "가야산");
        assertFalse(g.has("foliage_start"));
        assertEquals("단풍 절정 2025년 11월 5일", MountainServlet.seasonLine(g, MountainServlet.SEASONS[0]));
    }
}
