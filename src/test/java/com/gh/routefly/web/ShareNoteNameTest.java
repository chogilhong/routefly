package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 공유 카드 제목도 park-notes 로 바로잡은 이름(2026-10-13 PC: 북한산 knps-15015 "구기분소 → 대남문" → 헤원사삼거리 → 대남문). */
public class ShareNoteNameTest {

    static final JsonObject PARKS = JsonParser.parseString("{"
            + "\"북한산\":{\"trails\":{\"knps-15015\":\"헤원사삼거리 → 대남문\"}},"
            + "\"설악산\":{\"names\":{\"신흥사\":\"소공원\"},\"trails\":{\"kmp-1\":\"설악산 · 비선대 → 마등령\"}}}").getAsJsonObject();

    @Test
    public void trailRenameByIdPrefix() {
        assertEquals("북한산 · 헤원사삼거리 → 대남문", ShareServlet.noteName(PARKS, "knps-15015-83a261d3", "북한산 · 구기분소 → 대남문"));
    }

    @Test
    public void fullNameAndPlaceAlias() {
        assertEquals("설악산 · 비선대 → 마등령", ShareServlet.noteName(PARKS, "kmp-1", "설악산 · 아무 이름"));
        assertEquals("설악산 · 소공원 → 설악산 울산바위", ShareServlet.noteName(PARKS, "knps-4012-x", "설악산 · 신흥사 → 설악산 울산바위"));
    }

    @Test
    public void untouchedWhenNoNote() {
        assertEquals("지리산 · 중산리 → 천왕봉", ShareServlet.noteName(PARKS, "knps-1017-x", "지리산 · 중산리 → 천왕봉"));
        assertEquals("이름", ShareServlet.noteName(null, "x", "이름"));
    }
}
