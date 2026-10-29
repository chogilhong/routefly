package com.gh.routefly.web;

import java.io.IOException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonObject;

/**
 * 산 페이지 날씨 한 번에(2026-10-28 홍TV님 추천 4 - 속도): 단기예보(api/weather) · 중기예보(api/mid) · 미세먼지(api/air)를 한 요청으로.
 * 셋을 함께 물어(가장 늦은 것만큼) {weather, mid, air} 로 돌려줌. 하나라도 못 받았으면 담아 두지 않게(다음에 다시 물음).
 * 산 페이지(mountain.js · mountain-en.js) · 따라가기 3D 날씨(app.js)가 씀. 🧰 도구(tools.js)는 중기예보가 필요 없어 예전 둘(weather · air)을 그대로 씀.
 */
@WebServlet(urlPatterns = {"/api/wx"})
public class WxServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    /** 기상청 · 에어코리아를 함께 묻는 일꾼(데몬). 기다리는 일 60개까지 - 넘으면 그 요청은 unavailable(2026-10-28 보안 점검: 위쪽이 느릴 때 끝없이 쌓였음). 다시 배포할 때 destroy 가 닫음. */
    private static final ExecutorService POOL = new java.util.concurrent.ThreadPoolExecutor(6, 6, 30, TimeUnit.SECONDS, new java.util.concurrent.ArrayBlockingQueue<>(60), r -> {
        Thread t = new Thread(r, "rf-wx");
        t.setDaemon(true);
        return t;
    }, new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
    /** 셋을 함께 기다리는 한도 - 셋이 한 마감을 나눔(예전엔 하나씩 20초라 60초까지 걸렸음). */
    static final long WAIT_MS = 20_000L;

    @Override
    public void destroy() {
        POOL.shutdownNow();
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        JsonObject out = all(() -> WeatherServlet.forecast(at[0], at[1]), () -> MidServlet.at(at[0], at[1]), () -> AirServlet.at(at[0], at[1]));
        JsonObject rg = region(at[0], at[1]);   // 기상청 날씨누리 링크용 행정동(2026-10-30 홍TV님) - 못 받으면 없이
        if (rg != null) out.add("region", rg);
        if (partial(out)) Json.write(resp, HttpServletResponse.SC_OK, out, false);
        else Json.ok(req, resp, out);
    }

    /** 셋을 함께 물어 {weather, mid, air}. 하나가 실패 · 20초 넘으면 그것만 {unavailable:true}. */
    static JsonObject all(Supplier<JsonObject> weather, Supplier<JsonObject> mid, Supplier<JsonObject> air) {
        CompletableFuture<JsonObject> w = start(weather), m = start(mid), a = start(air);
        long until = System.currentTimeMillis() + WAIT_MS;
        JsonObject out = new JsonObject();
        out.addProperty("success", true);   // 따라가기 3D 화면(app.js getJson)은 success 를 봄 - 셋 각각의 실패는 그 안의 unavailable 로
        out.add("weather", get(w, until));
        out.add("mid", get(m, until));
        out.add("air", get(a, until));
        return out;
    }

    static final String REGION_URL = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json";
    /** 자리(소수 둘째 자리 - 약 1km) → 행정동. 행정동은 거의 안 바뀌어 30일. 못 찾은 곳도 빈 것으로 기억(다시 묻지 않음). */
    private static final OpenApi.Cache<JsonObject> REGIONS = new OpenApi.Cache<>(5000, 30L * 86_400_000L);
    private static final JsonObject NONE = new JsonObject();

    /**
     * 그 자리의 행정동 {code, name} - 기상청 날씨누리 동네예보 주소(#dong/행정동코드/위도/경도/…)에 씀. 카카오 좌표 → 행정구역(키 kakao.restKey).
     * 키가 없거나 못 받으면 null(화면은 날씨누리 첫 화면으로).
     */
    static JsonObject region(double lat, double lon) {
        String key = String.format(java.util.Locale.ROOT, "%.2f,%.2f", lat, lon);
        long now = System.currentTimeMillis();
        JsonObject hit = REGIONS.get(key, now);
        if (hit != null) return hit == NONE ? null : hit;
        String kakao = RouteflyConfig.get("kakao.restKey");
        if (kakao == null) return null;
        String t = OpenApi.get(REGION_URL + String.format(java.util.Locale.ROOT, "?x=%.6f&y=%.6f", lon, lat), "WX-REGION", java.time.Duration.ofSeconds(4), "Authorization", "KakaoAK " + kakao);
        if (t == null) return null;   // 연결 문제 - 기억하지 않음
        JsonObject r = parseRegion(t);
        REGIONS.put(key, r == null ? NONE : r, now);
        return r;
    }

    /** 순수 함수 - 카카오 좌표 → 행정구역 답에서 행정동(H) {code(숫자 10자리), name}. 없으면 null. */
    static JsonObject parseRegion(String text) {
        try {
            for (com.google.gson.JsonElement e : com.google.gson.JsonParser.parseString(text).getAsJsonObject().getAsJsonArray("documents")) {
                JsonObject d = e.getAsJsonObject();
                if (!"H".equals(d.has("region_type") ? d.get("region_type").getAsString() : null)) continue;
                String code = d.has("code") ? d.get("code").getAsString() : "", name = d.has("address_name") ? d.get("address_name").getAsString() : "";
                if (!code.matches("\\d{10}") || name.isBlank()) return null;
                JsonObject o = new JsonObject();
                o.addProperty("code", code);
                o.addProperty("name", Party.clean(name, 60));
                return o;
            }
        } catch (RuntimeException e) {
            return null;
        }
        return null;
    }

    /** 하나라도 못 받았나. */
    static boolean partial(JsonObject out) {
        for (String k : new String[] {"weather", "mid", "air"}) if (!out.has(k) || out.getAsJsonObject(k).has("unavailable")) return true;
        return false;
    }

    private static CompletableFuture<JsonObject> start(Supplier<JsonObject> s) {
        try {
            return CompletableFuture.supplyAsync(s, POOL);
        } catch (java.util.concurrent.RejectedExecutionException e) {   // 일꾼이 다 참 - 이번엔 없이
            return CompletableFuture.failedFuture(e);
        }
    }

    private static JsonObject get(CompletableFuture<JsonObject> f, long until) {
        try {
            JsonObject o = f.get(Math.max(1, until - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
            if (o != null) return o;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            f.cancel(true);
        }
        JsonObject u = new JsonObject();
        u.addProperty("unavailable", true);
        return u;
    }
}
