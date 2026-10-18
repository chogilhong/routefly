package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.util.ArrayList;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** ⛑️ 산 페이지의 오늘의 산행 안전 칸(2026-10-18 홍TV님 - 별거 별거와 같은 api/safety, js/mountain.js · mountain-en.js 가 채움). */
public class MountainSafetyTest {

    private static final JsonObject PEAK = JsonParser.parseString("{\"id\":\"가야산\",\"name\":\"가야산\",\"lat\":35.82,\"lon\":128.12,\"elev\":1433}").getAsJsonObject();

    @Test
    public void 한국어() {
        String h = MountainServlet.page(PEAK, new ArrayList<>(), new ArrayList<>(), null, "");
        int wx = h.indexOf("id=\"wx\""), safe = h.indexOf("<section id=\"safe\">");
        assertTrue("날씨 바로 아래", wx > 0 && safe > wx);
        assertTrue(h.contains("<h2>⛑️ 오늘의 산행 안전</h2><ul class=\"wl sfl\" id=\"sfList\">") && h.contains("id=\"sfEr\"") && h.contains("<b>119</b>"));
    }

    @Test
    public void 영어() {
        String h = MountainEn.page(PEAK, new ArrayList<>(), new ArrayList<>(), null, "");
        assertTrue(h.indexOf("<section id=\"safe\">") > h.indexOf("id=\"wx\""));
        assertTrue(h.contains("<h2>⛑️ Today's hiking safety</h2>") && h.contains("Nearest emergency rooms") && !h.contains("오늘의 산행 안전"));
    }
}
