package com.gh.routefly.web;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 산행을 마친 화면 "📺 TV 맛집" - {@code GET /api/food?lat=37.48&lon=126.56}(2026-11-22 홍TV님 "TV 프로(백반기행 등)에 나오는 유명한 맛집" · "30km 로 늘리고 나머지는 알아서 해").
 *
 * <ul>
 *   <li>카카오 키워드 검색을 프로그램 이름({@link #SHOWS})으로 한 번씩 - 가게 이름에 프로그램 이름이 없어도 나와, 카카오 가게 정보의 방송 표시로 찾는 것으로 봄
 *       (PC 가 덕기봉 · 가야산 · 설악산에서 받은 답 src/test/resources/food/tv-*.json, 수요미식회 · 줄서는식당 · 6시내고향은 셋 다 0건이라 뺌).
 *       방송에 나왔다는 보증은 아니어서 화면에 "카카오 검색 결과" 라고 밝힘.</li>
 *   <li>카카오 반경(radius)은 20km 까지라 30km 는 사각형(rect)으로 묻고 거리는 우리가 셈해 30km 안만. 음식점(FD6)만 - 펜션 · 카페는 뺌.</li>
 *   <li>같은 가게는 한 번(카카오 가게 주소, 없으면 이름), 나온 프로그램을 함께. 가까운 순 20곳까지.</li>
 *   <li>좌표는 화면이 코스 끝 점, 코스가 없으면 끝낸 자리가 든 약 5km 고정 칸의 가운데만 보냄. 소수 셋째 자리 + 프로그램으로 하루 담아 둠. 키 kakao.restKey(서버에만).</li>
 * </ul>
 * → {@code {success, food:[{name, kind, addr, tel, lat, lon, dist_m, url, shows:[…]}], radius_km:30, source:"카카오"}} - 모두 못 받으면 unavailable.
 */
@WebServlet(urlPatterns = {"/api/food"})
public class FoodServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String KAKAO_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
    static final int RADIUS_M = 30000, ROWS = 20;
    static final List<String> SHOWS = List.of("백반기행", "생생정보", "생활의달인", "맛있는녀석들");
    private static final OpenApi.Cache<JsonArray> CACHE = new OpenApi.Cache<>(2000, 24L * 60 * 60 * 1000);
    /** 기억에 없어 카카오에 새로 묻는 횟수 상한(프로그램마다 한 번 셈) - 주소마다 한 시간 80번, 하루 3,000번(설정 quota.food.ip · .day). */
    private static final OutQuota QUOTA = OutQuota.of("food", 80, 3000);
    /** 함께 기다리는 한도(밀리초) - 하나 묻기 마감(6초)보다 조금 길게. */
    static final long WAIT_MS = 8_000;
    /** 카카오 묻기 일꾼 - 4개, 줄 16개(넘치면 그 프로그램만 빠짐). 데몬이라 톰캣이 내려갈 때 붙잡지 않음. */
    private static final java.util.concurrent.ThreadPoolExecutor POOL = new java.util.concurrent.ThreadPoolExecutor(4, 4, 0, java.util.concurrent.TimeUnit.MILLISECONDS,
            new java.util.concurrent.ArrayBlockingQueue<>(16), r -> {
                Thread t = new Thread(r, "food-kakao");
                t.setDaemon(true);
                return t;
            }, new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        long now = System.currentTimeMillis();
        String kakao = RouteflyConfig.get("kakao.restKey");
        String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
        // 점검 14차 D7(2026-11-24): 프로그램 넷을 차례로(최대 6초 × 4) 묻던 것을 함께 묻고 8초까지만 기다림. 못 받은 프로그램이 있으면 답을 남기지 않음.
        Map<String, java.util.concurrent.Future<JsonArray>> jobs = new LinkedHashMap<>();
        boolean partial = false;
        for (String show : SHOWS) {
            String key = show + "@" + StaysServlet.cacheKey(at[0], at[1]);
            JsonArray got = CACHE.get(key, now);
            if (got != null) { jobs.put(show, java.util.concurrent.CompletableFuture.completedFuture(got)); continue; }
            if (kakao == null || !QUOTA.allow(ip, now)) { partial |= kakao != null; continue; }
            try {
                jobs.put(show, POOL.submit(() -> {
                    String t = OpenApi.get(url(at[0], at[1], show), "FOOD-KAKAO", java.time.Duration.ofSeconds(6), "Authorization", "KakaoAK " + kakao);
                    JsonArray a = t == null ? null : StaysServlet.kakaoStays(t);
                    if (a == null && t != null) OpenApi.warn("FOOD-KAKAO", t);
                    if (a != null) CACHE.put(key, a, System.currentTimeMillis());
                    return a;
                }));
            } catch (java.util.concurrent.RejectedExecutionException e) {
                partial = true;   // 줄이 꽉 참 - 그 프로그램만 빠짐
            }
        }
        Map<String, JsonArray> byShow = new LinkedHashMap<>();
        long until = System.currentTimeMillis() + WAIT_MS;
        for (var e : jobs.entrySet()) {
            JsonArray got = null;
            try {
                got = e.getValue().get(Math.max(0, until - System.currentTimeMillis()), java.util.concurrent.TimeUnit.MILLISECONDS);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                e.getValue().cancel(true);
            } catch (Exception ex) {
                e.getValue().cancel(true);   // 시간이 다 됨 - 그 프로그램만 빠짐
            }
            if (got != null) byShow.put(e.getKey(), got);
            else partial = true;
        }
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("food", byShow.isEmpty() ? new JsonArray() : merge(byShow, at[0], at[1]));
        if (byShow.isEmpty()) out.addProperty("unavailable", true);
        else { out.addProperty("radius_km", RADIUS_M / 1000); out.addProperty("source", "카카오"); }
        if (partial && !byShow.isEmpty()) Json.write(resp, HttpServletResponse.SC_OK, out, false);   // 일부만 - 1분 동안 이 답이 남지 않게
        else Json.okPrivate(req, resp, out);
    }

    /** 순수 함수 - 카카오 키워드(프로그램 이름), 둘레 30km 사각형(왼쪽 아래 경도 · 위도, 오른쪽 위 경도 · 위도), 정확도 순 15곳(한 쪽 최대). */
    static String url(double lat, double lon, String show) {
        double dLat = RADIUS_M / 111320.0, dLon = RADIUS_M / (111320.0 * Math.cos(Math.toRadians(lat)));
        return KAKAO_URL + "?query=" + java.net.URLEncoder.encode(show, java.nio.charset.StandardCharsets.UTF_8)
            + String.format(Locale.ROOT, "&x=%.6f&y=%.6f&rect=%.6f,%.6f,%.6f,%.6f&sort=accuracy&size=15", lon, lat, lon - dLon, lat - dLat, lon + dLon, lat + dLat);
    }

    /**
     * 순수 함수 - 프로그램마다 읽은 가게(StaysServlet.kakaoStays) → 하나로: 음식점(group FD6)만, 같은 가게(주소 · 없으면 이름)는 한 번에 나온 프로그램을 모아,
     * 거리는 우리가 셈(30km 넘으면 뺌), 가까운 순 20곳.
     */
    static JsonArray merge(Map<String, JsonArray> byShow, double lat, double lon) {
        Map<String, JsonObject> one = new LinkedHashMap<>();
        for (Map.Entry<String, JsonArray> e : byShow.entrySet()) {
            for (JsonElement el : e.getValue()) {
                JsonObject o = el.getAsJsonObject();
                if (!o.has("group") || !"FD6".equals(o.get("group").getAsString())) continue;
                long d = Math.round(MountainServlet.distM(lat, lon, o.get("lat").getAsDouble(), o.get("lon").getAsDouble()));
                if (d > RADIUS_M) continue;
                String k = o.has("url") ? o.get("url").getAsString() : "n:" + o.get("name").getAsString();
                JsonObject f = one.get(k);
                if (f == null) {
                    f = o.deepCopy();
                    f.remove("group");
                    f.addProperty("dist_m", d);
                    f.add("shows", new JsonArray());
                    one.put(k, f);
                }
                f.getAsJsonArray("shows").add(e.getKey());
            }
        }
        List<JsonObject> all = new java.util.ArrayList<>(one.values());
        all.sort(java.util.Comparator.comparingLong(o -> o.get("dist_m").getAsLong()));
        JsonArray out = new JsonArray();
        for (JsonObject o : all) if (out.size() < ROWS) out.add(o);
        return out;
    }
}
