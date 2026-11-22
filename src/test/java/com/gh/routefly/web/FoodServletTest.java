package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonObject;

/**
 * 산행 끝 🍜 · TV 맛집 자료 확인(2026-11-22 홍TV님): 근처 맛집 목록은 뺌(🍜 단추만), api/food 는 TV 프로그램 이름으로 20km 안을
 * 카카오에서 찾는 자료 확인용(화면은 아직 안 씀).
 */
public class FoodServletTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void kakaoKeywordAroundEnd() {
        assertEquals("카카오 키워드 = 프로그램 이름 · 둘레 20km · 정확도 순 15곳",
            "https://dapi.kakao.com/v2/local/search/keyword.json?query=%EB%B0%B1%EB%B0%98%EA%B8%B0%ED%96%89&x=126.560988&y=37.480123&radius=20000&sort=accuracy&size=15",
            FoodServlet.url(37.4801234, 126.5609876, "백반기행"));
        assertEquals("빈칸은 무시", "생활의달인", FoodServlet.show(" 생활의 달인 "));
        assertNull("정해 둔 이름만 카카오로 보냄", FoodServlet.show("아무 글"));
        assertNull(FoodServlet.show(null));
    }

    /** 카카오 답 모양으로 만든 테스트 데이터(실제 가게 아님) - 20km 넘는 곳 뺌 · 가까운 순 · 못 받으면 unavailable. */
    @Test
    public void bodyTopFiveWithinRadius() {
        int[] dist = {9000, 25000, 300, 15000, 600};
        StringBuilder k = new StringBuilder("{\"documents\":[");
        for (int i = 0; i < dist.length; i++) {
            if (i > 0) k.append(',');
            k.append("{\"place_name\":\"시험식당").append(i).append("\",\"category_name\":\"음식점 > 한식 > 국밥\",\"x\":\"126.56\",\"y\":\"37.48\",\"distance\":\"")
             .append(dist[i]).append("\",\"place_url\":\"http://place.map.kakao.com/").append(100 + i).append("\"}");
        }
        k.append("],\"meta\":{}}");
        JsonObject out = FoodServlet.body(StaysServlet.kakaoStays(k.toString()));
        StringBuilder names = new StringBuilder();
        for (int i = 0; i < out.getAsJsonArray("food").size(); i++) names.append(out.getAsJsonArray("food").get(i).getAsJsonObject().get("name").getAsString().replace("시험식당", ""));
        assertEquals("20km 넘는 곳(1) 빼고 가까운 순", "2403", names.toString());
        assertEquals("https://place.map.kakao.com/102", out.getAsJsonArray("food").get(0).getAsJsonObject().get("url").getAsString());
        assertEquals(20, out.get("radius_km").getAsInt());
        JsonObject none = FoodServlet.body(null);
        assertTrue(none.get("unavailable").getAsBoolean() && none.getAsJsonArray("food").size() == 0);
    }

    /** 산행 끝 창: 🍜 맛집 · 숙소 · 후원만(쿠팡 · 다음 산 · 근처 맛집 목록 뺌, 2026-11-22 홍TV님). */
    @Test
    public void doneSheetShowsList() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), html = read("src/main/webapp/hike.html"), kit = read("src/main/webapp/js/course-kit.js");
        assertFalse("근처 맛집 목록 없음", js.contains("api/food") || js.contains("nearFood") || html.contains("nearFood"));
        assertFalse("쿠팡 문구 없음", js.contains("RF.COUPANG_NOTE"));
        assertTrue("제휴 표시는 숙소만", js.contains("if (r.affiliate) {   // 제휴 표시는 링크 앞에"));
        assertFalse("쿠팡 · 다음 산 고르기 없음", kit.contains("afterHikeGear") || kit.contains("⛰️ 다음 산 고르기"));
        assertTrue("후원은 그대로", js.contains("$(\"doneDonate\").hidden = false;"));
        assertFalse("방침에서도 둘레 맛집 목록 문장 뺌", read("src/main/webapp/privacy.html").contains("둘레 5km 맛집"));
    }
}
