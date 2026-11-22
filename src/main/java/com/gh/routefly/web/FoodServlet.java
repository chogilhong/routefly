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
 * 산행을 마친 화면 "🍜 근처 맛집" - {@code GET /api/food?lat=37.48&lon=126.56} → 그 둘레 3km 안 카카오 "맛집" 검색 5곳(2026-11-22 홍TV님 B안:
 * 카카오맵 글자 검색은 둘레를 중심으로 찾지 않아 송산 바로 옆 영종 하늘도시가 하나도 안 나왔음).
 *
 * <ul>
 *   <li>좌표는 화면이 코스 끝 점(공개된 코스 자료), 코스가 없으면 끝낸 자리가 든 약 5km 고정 칸의 가운데만 보냄 - 내 위치 그대로는 오지 않습니다.</li>
 *   <li>카카오 키워드 검색(키 kakao.restKey, 서버에만). 정확도 순(카카오가 고른 차례) 15곳을 받아 앞 5곳만. 장소 모양은 숙소와 같아 {@link StaysServlet#kakaoStays} 로 읽음.</li>
 *   <li>소수 셋째 자리(약 100m)로 묶어 하루 담아 둠. 키가 없거나 못 받으면 {@code {success:true, food:[], unavailable:true}} - 화면은 🍜 카카오맵 단추만.</li>
 * </ul>
 * → {@code {success, food:[{name, kind, addr, tel, lat, lon, dist_m, url}], radius_km:3, source:"카카오"}}
 */
@WebServlet(urlPatterns = {"/api/food"})
public class FoodServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String KAKAO_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
    static final int RADIUS_M = 3000, ROWS = 5;
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(1000, 24L * 60 * 60 * 1000);
    /** 기억에 없어 카카오에 새로 묻는 횟수 상한 - 주소마다 한 시간 40번, 하루 3,000번(설정 quota.food.ip · .day). */
    private static final OutQuota QUOTA = OutQuota.of("food", 40, 3000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        String key = StaysServlet.cacheKey(at[0], at[1]);
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(key, now);
        if (out == null) {
            String kakao = RouteflyConfig.get("kakao.restKey");
            String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
            String t = kakao == null || !QUOTA.allow(ip, now) ? null
                : OpenApi.get(url(at[0], at[1]), "FOOD-KAKAO", java.time.Duration.ofSeconds(6), "Authorization", "KakaoAK " + kakao);
            JsonArray all = t == null ? null : StaysServlet.kakaoStays(t);
            if (all == null && t != null) OpenApi.warn("FOOD-KAKAO", t);
            out = body(all);
            if (all != null) CACHE.put(key, out, now);   // 못 받은 답은 담지 않음
        }
        Json.okPrivate(req, resp, out);
    }

    /** 순수 함수 - 카카오 키워드 "맛집" 둘레 3km, 정확도 순 15곳(한 쪽 최대). */
    static String url(double lat, double lon) {
        return KAKAO_URL + "?query=" + java.net.URLEncoder.encode("맛집", java.nio.charset.StandardCharsets.UTF_8)
            + String.format(Locale.ROOT, "&x=%.6f&y=%.6f&radius=%d&sort=accuracy&size=15", lon, lat, RADIUS_M);
    }

    /** 순수 함수 - 읽은 장소들 → 답(반경 안 · 앞 5곳). null 이면 못 받음. */
    static JsonObject body(JsonArray all) {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        JsonArray food = new JsonArray();
        if (all != null) for (int i = 0; i < all.size() && food.size() < ROWS; i++) {
            JsonObject o = all.get(i).getAsJsonObject();
            if (o.has("dist_m") && o.get("dist_m").getAsLong() <= RADIUS_M) food.add(o);
        }
        out.add("food", food);
        if (all == null) out.addProperty("unavailable", true);
        else { out.addProperty("radius_km", RADIUS_M / 1000); out.addProperty("source", "카카오"); }
        return out;
    }
}
