package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/** 산행 끝 🍜 · 🏨 · ☕ + 📺 TV 맛집(2026-11-22 홍TV님 - 백반기행 등 TV 에 나온 맛집, 30km). */
public class FoodServletTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void kakaoKeywordAroundEnd() {
        String u = FoodServlet.url(37.481203, 126.555306, "백반기행");
        assertTrue("카카오 키워드 = 프로그램 이름 · 정확도 순 15곳", u.startsWith("https://dapi.kakao.com/v2/local/search/keyword.json?query=%EB%B0%B1%EB%B0%98%EA%B8%B0%ED%96%89&x=126.555306&y=37.481203&rect=") && u.endsWith("&sort=accuracy&size=15"));
        assertFalse("카카오 radius 는 20km 까지라 쓰지 않음", u.contains("radius="));
        String[] r = u.replaceAll(".*rect=([^&]+).*", "$1").split(",");
        assertEquals("왼쪽 아래 → 오른쪽 위 사각형이 둘레 30km", 30000, MountainServlet.distM(37.481203, 126.555306, Double.parseDouble(r[3]), 126.555306), 50);
        assertEquals(30000, MountainServlet.distM(37.481203, 126.555306, 37.481203, Double.parseDouble(r[0])), 100);
        assertEquals("0건이던 수요미식회 · 줄서는식당 · 6시내고향은 뺌(PC 2026-11-22)", "[백반기행, 생생정보, 생활의달인, 맛있는녀석들]", FoodServlet.SHOWS.toString());
    }

    /** 카카오 답 모양으로 만든 테스트 데이터(실제 가게 아님): 음식점만 · 같은 가게 한 번(프로그램 모음) · 30km 넘으면 뺌 · 가까운 순. */
    @Test
    public void bodyTopFiveWithinRadius() throws Exception {
        String a = "{\"documents\":["
            + "{\"place_name\":\"시험국밥\",\"category_name\":\"음식점 > 한식 > 국밥\",\"category_group_code\":\"FD6\",\"x\":\"126.60\",\"y\":\"37.48\",\"place_url\":\"http://place.map.kakao.com/1\"},"
            + "{\"place_name\":\"시험펜션\",\"category_name\":\"여행 > 숙박 > 펜션\",\"category_group_code\":\"AD5\",\"x\":\"126.56\",\"y\":\"37.48\",\"place_url\":\"http://place.map.kakao.com/2\"},"
            + "{\"place_name\":\"시험카페\",\"category_name\":\"음식점 > 카페\",\"category_group_code\":\"CE7\",\"x\":\"126.56\",\"y\":\"37.49\",\"place_url\":\"http://place.map.kakao.com/3\"},"
            + "{\"place_name\":\"먼식당\",\"category_name\":\"음식점 > 한식\",\"category_group_code\":\"FD6\",\"x\":\"127.00\",\"y\":\"37.48\",\"place_url\":\"http://place.map.kakao.com/4\"}],\"meta\":{}}";
        String b = "{\"documents\":["
            + "{\"place_name\":\"시험냉면\",\"category_name\":\"음식점 > 한식 > 냉면\",\"category_group_code\":\"FD6\",\"x\":\"126.57\",\"y\":\"37.48\",\"place_url\":\"http://place.map.kakao.com/5\"},"
            + "{\"place_name\":\"시험국밥\",\"category_name\":\"음식점 > 한식 > 국밥\",\"category_group_code\":\"FD6\",\"x\":\"126.60\",\"y\":\"37.48\",\"place_url\":\"http://place.map.kakao.com/1\"}],\"meta\":{}}";
        Map<String, JsonArray> by = new LinkedHashMap<>();
        by.put("백반기행", StaysServlet.kakaoStays(a));
        by.put("생생정보", StaysServlet.kakaoStays(b));
        JsonArray out = FoodServlet.merge(by, 37.48, 126.555306);
        assertEquals("펜션 · 카페 · 30km 밖(약 39km) 빼고 둘", 2, out.size());
        JsonObject first = out.get(0).getAsJsonObject(), second = out.get(1).getAsJsonObject();
        assertEquals("가까운 순", "시험냉면", first.get("name").getAsString());
        assertEquals("같은 가게는 한 번 · 나온 프로그램 모음", "[\"백반기행\",\"생생정보\"]", second.getAsJsonArray("shows").toString());
        assertEquals("거리는 우리가 셈", Math.round(MountainServlet.distM(37.48, 126.555306, 37.48, 126.60)), second.get("dist_m").getAsLong());
        assertFalse("group 은 화면에 안 보냄", second.has("group"));
        // 실제 답(PC 가 받은 우리 api/food, 2026-11-22): 30km 안 · 가까운 순 · 프로그램 적힘 · 20곳까지 · 펜션 · 카페 없음
        for (String m : new String[] {"deokgibong", "gayasan", "seoraksan"}) {
            JsonObject real = com.google.gson.JsonParser.parseString(read("src/test/resources/food/tv30-" + m + ".json").replace("\uFEFF", "")).getAsJsonObject();
            JsonArray food = real.getAsJsonArray("food");
            assertTrue(m, food.size() > 0 && food.size() <= FoodServlet.ROWS && real.get("radius_km").getAsInt() == 30);
            long last = -1;
            for (int i = 0; i < food.size(); i++) {
                JsonObject f = food.get(i).getAsJsonObject();
                long d = f.get("dist_m").getAsLong();
                assertTrue(m + " 가까운 순 · 30km 안", d >= last && d <= FoodServlet.RADIUS_M);
                last = d;
                assertTrue(m + " 프로그램 적힘", f.getAsJsonArray("shows").size() > 0 && FoodServlet.SHOWS.contains(f.getAsJsonArray("shows").get(0).getAsString()));
                assertFalse(m + " 펜션 · 카페 없음", f.get("kind").getAsString().matches(".*(펜션|카페).*") || f.has("group"));
            }
        }
    }

    /** 산행 끝 창: 🍜 · 🏨 · ☕ 만, 📺 TV 맛집은 있으면 🍜 옆에 단추 → 목록(쿠팡 · 다음 산 · 근처 맛집 목록은 뺀 그대로). */
    @Test
    public void doneSheetShowsList() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), html = read("src/main/webapp/hike.html"), kit = read("src/main/webapp/js/course-kit.js");
        assertTrue("같은 좌표 규칙으로 api/food", js.contains("if (food && at) getJson(\"api/food?lat=\" + (+at[0]).toFixed(4) + \"&lon=\" + (+at[1]).toFixed(4))"));
        assertTrue("🍜 · 🏨 뒤에 단추 · 그 아래 목록(처음엔 접힘) - 숙소가 위로(2026-11-22 홍TV님)", js.contains("food.parentNode.appendChild(btn);") && js.contains("food.parentNode.appendChild(ul);") && js.contains("ul.hidden = true;"));
        assertTrue("카카오 검색 결과라고 밝힘", js.contains("방송 출연은 가게 정보에서 확인하세요."));
        assertTrue("글은 textContent 로만", js.contains("nm.textContent = f.name;") && !js.contains("innerHTML = f."));
        assertTrue(html.contains("#doneNext .tvFood[hidden] { display:none; }"));
        assertTrue("줄마다 길찾기 - 폰은 🚗 티맵 + 🧭 카카오맵, PC 는 카카오맵만(2026-11-22 홍TV님)",
            js.contains("if (phone) go.appendChild(navLink(\"🚗 \" + T(\"티맵\", \"TMAP\"), RF.tmapHref(nmq, f.lat, f.lon)));")
            && js.contains("go.appendChild(navLink(\"🧭 \" + T(\"길찾기\", \"Route\"), \"https://map.kakao.com/link/to/\" + encodeURIComponent(nmq)")
            && html.contains("#doneNext .tvFood .go a {"));
        assertFalse("쿠팡 문구 · 근처 맛집 목록 없음", js.contains("RF.COUPANG_NOTE") || js.contains("nearFood"));
        assertFalse("쿠팡 · 다음 산 고르기 없음", kit.contains("afterHikeGear") || kit.contains("⛰️ 다음 산 고르기"));
        assertTrue("후원은 그대로", js.contains("$(\"doneDonate\").hidden = false;"));
        assertTrue("방침", read("src/main/webapp/privacy.html").contains("TV 프로그램 이름(백반기행 등)으로 둘레 30km") && read("src/main/webapp/privacy-en.html").contains("within 30 km under TV show names"));
    }
}
