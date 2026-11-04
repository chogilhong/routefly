package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산 페이지 코스 목록 · 문답도 국립공원 공식 시간(2026-11-04 홍TV님 - 코스 페이지와 같게). 값은 운영 /api/course:
 * knps-17018-20bc8e55 "월출산 · 구정봉 → 홍계골" 1,492m · 공단 오름 52 · 내림 52분, 월출산 정상 34.76656, 126.703896.
 */
public class MountainOfficialTimeTest {

    @Test
    public void listUsesParkServiceTime() {
        JsonObject peak = JsonParser.parseString("{\"id\":\"월출산\",\"name\":\"월출산\",\"summit\":\"천황봉\",\"lat\":34.76656,\"lon\":126.703896}").getAsJsonObject();
        JsonObject c = JsonParser.parseString("{\"course_id\":\"knps-17018-20bc8e55\",\"name\":\"월출산 · 구정봉 → 홍계골\",\"distance_m\":1492,\"ascent_m\":6,\"descent_m\":345,"
                + "\"start_lat\":34.760294,\"start_lon\":126.693703,\"end_lat\":34.762772,\"end_lon\":126.68339,\"up_min\":52,\"down_min\":52}").getAsJsonObject();
        assertEquals(52, MountainServlet.minutesOf(c));
        assertEquals("52분(공단)", MountainServlet.timeOf(c, false));
        assertEquals("52 min (park service)", MountainServlet.timeOf(c, true));
        assertEquals("왕복은 공식 오름 + 내림", "1시간 44분", MountainServlet.roundTrip(c, false));
        List<JsonObject> cs = new ArrayList<>(List.of(c));
        String ko = MountainServlet.page(peak, cs, new ArrayList<>(), null, "");
        assertTrue("목록(코스 줄 끝 - 문답 글과 가름)", ko.contains(" · 약 52분(공단)</span><span class=\"go\">") && ko.contains("data-min=\"52\""));
        assertTrue("문답", MountainServlet.faq(peak, "월출산", cs, null).get(1)[1].startsWith("정상까지 편도 약 52분(공단), 같은 길로 내려오면 왕복 약 1시간 44분"));
        String en = MountainEn.page(peak, cs, new ArrayList<>(), null, "");
        assertTrue("영어 목록(코스 줄 끝)", en.contains(" · about 52 min (park service)</span><span class=\"go\">") && en.contains("data-min=\"52\""));
        // 공식 시간이 없는 코스는 공단 기준 어림(1km 34분 - 1,492m 51분)
        JsonObject plain = c.deepCopy();
        plain.remove("up_min");
        plain.remove("down_min");
        assertEquals("51분", MountainServlet.timeOf(plain, false));
    }
}
