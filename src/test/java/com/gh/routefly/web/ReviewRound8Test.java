package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 점검 8차(2026-11-03 홍TV님) - 예상 시간에 하산(내리막) 시간 · 주머니 모드 · 화면 고침. 화면 js 조각은 review8.test.js.
 */
public class ReviewRound8Test {

    /** 화면 조각은 node 로(없으면 건너뜀). */
    @Test
    public void screenPieces() throws Exception {
        ReviewRound5Test.node("src/test/js/review8.test.js");
    }

    /** 산 페이지 문답: 편도에 내리막도 넣고, 같은 길로 내려오는 왕복 시간을 함께("내려오는 시간은 따로 더하세요" 대신). */
    @Test
    public void mountainTimesIncludeDescent() {
        JsonObject peak = JsonParser.parseString("{\"id\":\"가산\",\"name\":\"가산\",\"lat\":37.5,\"lon\":127.0}").getAsJsonObject();
        List<JsonObject> cs = new ArrayList<>();
        cs.add(JsonParser.parseString("{\"course_id\":\"a\",\"name\":\"가산 · 들머리 → 정상\",\"distance_m\":4000,\"ascent_m\":600,\"descent_m\":60}").getAsJsonObject());
        String qa = MountainServlet.faq(peak, "가산", cs, null).get(1)[1];
        // 편도: 1시간 + 1시간 + 2분, 왕복: 8km 2시간 + 오르막 660m 1시간 6분 + 내리막 660m 22분
        assertEquals("정상까지 편도 약 2시간 2분, 같은 길로 내려오면 왕복 약 3시간 28분입니다(시속 4km · 오르막 600m 에 1시간 · 내리막 300m 에 10분으로 어림).", qa);
        assertFalse(qa.contains("따로 더하세요"));
        String en = MountainEn.faq(peak, "Gasan", cs, null).get(1)[1];
        assertTrue(en, en.contains("About 2 h 2 min one way to the summit, or about 3 h 28 min there and back") && en.contains("10 min per 300 m down"));
        assertEquals("코스 페이지도 같은 기준", "약 2시간 2분(시속 4km · 오르막 600m 에 1시간 · 내리막 300m 에 10분 어림)", CoursePageServlet.timeText("hike", 4000, 600, 60));
        String page = MountainServlet.page(peak, cs, new ArrayList<>(), null, "");
        assertTrue("코스 줄에 data-desc(화면 js 의 거르기 · 일출 출발이 내리막도)", page.contains("data-asc=\"600\" data-desc=\"60\""));
        assertTrue(page.contains(" · 약 2시간 2분"));
    }
}
