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
 * 따라가기 화면(app.js)은 예전 셋을 그대로 씀.
 */
@WebServlet(urlPatterns = {"/api/wx"})
public class WxServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    /** 기상청 · 에어코리아를 함께 묻는 일꾼(데몬 - 톰캣이 내려갈 때 붙잡지 않음). */
    /** 기다리는 일 60개까지 - 넘으면 그 요청은 unavailable(2026-10-28 보안 점검: 위쪽이 느릴 때 끝없이 쌓였음). 다시 배포할 때 destroy 가 닫음. */
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
