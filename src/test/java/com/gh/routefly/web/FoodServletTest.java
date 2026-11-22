package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonObject;

/** 산행 끝 🍜 근처 맛집(2026-11-22 홍TV님 B안 - 송산 옆 영종 하늘도시가 카카오 글자 검색에 안 나왔음). */
public class FoodServletTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void kakaoKeywordAroundEnd() {
        assertEquals("카카오 키워드 맛집 · 둘레 3km · 정확도 순 15곳",
            "https://dapi.kakao.com/v2/local/search/keyword.json?query=%EB%A7%9B%EC%A7%91&x=126.560988&y=37.480123&radius=3000&sort=accuracy&size=15",
            FoodServlet.url(37.4801234, 126.5609876));
    }

    /** 카카오 답 모양으로 만든 테스트 데이터(실제 가게 아님) - 앞 5곳 · 3km 넘는 곳 뺌 · 못 받으면 unavailable. */
    @Test
    public void bodyTopFiveWithinRadius() {
        StringBuilder k = new StringBuilder("{\"documents\":[");
        for (int i = 0; i < 8; i++) {
            if (i > 0) k.append(',');
            k.append("{\"place_name\":\"시험식당").append(i).append("\",\"category_name\":\"음식점 > 한식 > 국밥\",\"x\":\"126.56\",\"y\":\"37.48\",\"distance\":\"")
             .append(i == 1 ? 3500 : 300 * i).append("\",\"place_url\":\"http://place.map.kakao.com/").append(100 + i).append("\"}");
        }
        k.append("],\"meta\":{}}");
        JsonObject out = FoodServlet.body(StaysServlet.kakaoStays(k.toString()));
        assertEquals(5, out.getAsJsonArray("food").size());
        assertEquals("3km 넘는 곳(시험식당1)은 뺌", "시험식당2", out.getAsJsonArray("food").get(1).getAsJsonObject().get("name").getAsString());
        assertEquals("국밥", out.getAsJsonArray("food").get(0).getAsJsonObject().get("kind").getAsString());
        assertEquals("https://place.map.kakao.com/100", out.getAsJsonArray("food").get(0).getAsJsonObject().get("url").getAsString());
        assertEquals(3, out.get("radius_km").getAsInt());
        JsonObject none = FoodServlet.body(null);
        assertTrue(none.get("unavailable").getAsBoolean() && none.getAsJsonArray("food").size() == 0);
    }

    @Test
    public void doneSheetShowsList() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), html = read("src/main/webapp/hike.html");
        assertTrue("같은 좌표 규칙(코스 끝 점 · 5km 칸 가운데)으로 api/food", js.contains("if (food && at) getJson(\"api/food?lat=\" + (+at[0]).toFixed(4) + \"&lon=\" + (+at[1]).toFixed(4))"));
        assertTrue("🍜 단추 바로 뒤에 목록, 누르면 카카오맵 가게 화면", js.contains("food.parentNode.insertBefore(ul, food.nextSibling);") && js.contains("if (f.url) { row.href = f.url; row.target = \"_blank\"; row.rel = \"noopener\"; }"));
        assertTrue("거리는 m 를 km 로", js.contains("RF.km(f.dist_m) + \"km\""));
        assertTrue("글은 textContent 로만", js.contains("nm.textContent = f.name;"));
        assertTrue(html.contains("#doneNext .nearFood { flex-basis:100%;"));
        assertTrue("개인정보처리방침", read("src/main/webapp/privacy.html").contains("둘레 3km 맛집") && read("src/main/webapp/privacy-en.html").contains("restaurants within 3 km"));
    }
}
