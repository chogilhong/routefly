package com.gh.routefly.web;

import java.io.IOException;
import java.util.Locale;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * TV 맛집 자료 확인(2026-11-22 홍TV님 "근방 20km 로 확대하고, TV 프로(백반기행 등)에 나오는 유명한 맛집이 있거든 알려줘").
 * {@code GET /api/food?lat=37.48&lon=126.56&show=백반기행} → 카카오 키워드 검색(검색어 = 프로그램 이름) 둘레 20km, 가까운 순 15곳까지.
 *
 * <ul>
 *   <li>지금은 자료 확인 단계 - 화면은 이 답을 쓰지 않습니다(산행 끝 창의 근처 맛집 목록은 홍TV님 결정으로 뺌). 카카오가 프로그램 이름으로
 *       실제 방송 가게를 돌려주는지 PC 가 몇 산에서 받아 보고(src/test/resources/food/), 맞으면 그때 화면에 붙입니다(타이드플라이와 같은 "받은 응답 확인 전 화면 없음").</li>
 *   <li>show 는 {@link #SHOWS} 가운데 하나만(아무 글이나 카카오로 보내지 않음).</li>
 *   <li>카카오 키 kakao.restKey(서버에만). 소수 셋째 자리(약 100m) + 프로그램으로 묶어 하루 담아 둠. 못 받으면 {@code {success:true, food:[], unavailable:true}}.</li>
 * </ul>
 * → {@code {success, show, food:[{name, kind, addr, tel, lat, lon, dist_m, url}], radius_km:20, source:"카카오"}}
 */
@WebServlet(urlPatterns = {"/api/food"})
public class FoodServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String KAKAO_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
    static final int RADIUS_M = 20000, ROWS = 15;   // 3km → 5km → 20km(2026-11-22 홍TV님 "20km 로 확대"), 받은 것 모두
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(1000, 24L * 60 * 60 * 1000);
    /** 기억에 없어 카카오에 새로 묻는 횟수 상한 - 주소마다 한 시간 40번, 하루 3,000번(설정 quota.food.ip · .day). */
    private static final OutQuota QUOTA = OutQuota.of("food", 40, 3000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        String show = show(req.getParameter("show"));
        if (at == null || show == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표, show 는 정해 둔 프로그램 이름입니다.");
            return;
        }
        String key = show + "@" + StaysServlet.cacheKey(at[0], at[1]);
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(key, now);
        if (out == null) {
            String kakao = RouteflyConfig.get("kakao.restKey");
            String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
            String t = kakao == null || !QUOTA.allow(ip, now) ? null
                : OpenApi.get(url(at[0], at[1], show), "FOOD-KAKAO", java.time.Duration.ofSeconds(6), "Authorization", "KakaoAK " + kakao);
            JsonArray all = t == null ? null : StaysServlet.kakaoStays(t);
            if (all == null && t != null) OpenApi.warn("FOOD-KAKAO", t);
            out = body(all);
            out.addProperty("show", show);
            if (all != null) CACHE.put(key, out, now);   // 못 받은 답은 담지 않음
        }
        Json.okPrivate(req, resp, out);
    }

    /** 찾아볼 TV 프로그램 이름(카카오 검색어로 그대로). 홍TV님이 말한 백반기행과 맛집 소개가 잦은 프로그램. */
    static final java.util.List<String> SHOWS = java.util.List.of("백반기행", "생생정보", "생활의달인", "수요미식회", "맛있는녀석들", "줄서는식당", "6시내고향");

    /** 순수 함수 - 정해 둔 프로그램 이름이면 그것(빈칸은 무시), 아니면 null. */
    static String show(String s) {
        if (s == null) return null;
        String k = s.replaceAll("\\s+", "");
        return SHOWS.contains(k) ? k : null;
    }

    /** 순수 함수 - 카카오 키워드(프로그램 이름) 둘레 20km, 정확도 순 15곳(한 쪽 최대). */
    static String url(double lat, double lon, String show) {
        return KAKAO_URL + "?query=" + java.net.URLEncoder.encode(show, java.nio.charset.StandardCharsets.UTF_8)
            + String.format(Locale.ROOT, "&x=%.6f&y=%.6f&radius=%d&sort=accuracy&size=15", lon, lat, RADIUS_M);
    }

    /** 순수 함수 - 읽은 장소들 → 답(반경 안 · 가까운 순). null 이면 못 받음. */
    static JsonObject body(JsonArray all) {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        JsonArray food = new JsonArray();
        if (all != null) for (int i = 0; i < all.size() && food.size() < ROWS; i++) {
            JsonObject o = all.get(i).getAsJsonObject();
            if (o.has("dist_m") && o.get("dist_m").getAsLong() <= RADIUS_M) food.add(o);
        }
        java.util.List<JsonObject> near = new java.util.ArrayList<>();   // 카카오 차례(정확도) → 가까운 순
        for (int i = 0; i < food.size(); i++) near.add(food.get(i).getAsJsonObject());
        near.sort(java.util.Comparator.comparingLong(o -> o.get("dist_m").getAsLong()));
        food = new JsonArray();
        for (JsonObject o : near) food.add(o);
        out.add("food", food);
        if (all == null) out.addProperty("unavailable", true);
        else { out.addProperty("radius_km", RADIUS_M / 1000); out.addProperty("source", "카카오"); }
        return out;
    }
}
