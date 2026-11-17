package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 🚁 dronefly 문화재보호구역(2026-11-17 홍TV님 "문화재보호구역도 넣어줘"). {@code GET /api/heritage?w=126.9&s=37.5&e=127.0&n=37.6}
 * → {@code {success, zones:[{l:[구분, 시도, 시군구], g:MultiPolygon}], partial?}}.
 * <ul>
 *   <li>전국 2만 곳이 넘어(lt_c_uo301 20,379 - 2026-11-17 WFS) 폰에 다 담을 수 없어, 고정 격자 칸(0.1°, 약 10km - course-kit GRID_DEG)마다 서버가 V-World WFS 에 묻고 하루 담아 둠.
 *       칸은 모든 사용자에게 같은 칸이라 요청에 내 위치가 담기지 않음(코스 찾기 칸과 같은 방식). 칸 안 어느 구역에 드는지는 폰이 셈.</li>
 *   <li>판정에는 넣지 않고 "문화유산법 제35조 사전 협의" 안내만(드론원스톱 지도와 같음 - 2026-11-17 PC 가 그쪽 소스에서 봄).</li>
 *   <li>키는 지도와 같은 map.vworld.key, 도메인은 site.baseUrl 의 호스트(없으면 routefly.kr - 브이월드에 등록한 서비스 URL, 빼면 INCORRECT_KEY).</li>
 * </ul>
 */
@WebServlet(urlPatterns = {"/api/heritage"})
public class HeritageServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final double CELL = 0.1;
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(3000, 24L * 3600_000L);
    /** 기억에 없어 V-World 에 새로 묻는 횟수 상한 - 주소마다 한 시간 60번, 하루 5,000번(설정 quota.heritage.ip · .day). */
    private static final OutQuota QUOTA = OutQuota.of("heritage", 60, 5000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] c = cell(req.getParameter("w"), req.getParameter("s"), req.getParameter("e"), req.getParameter("n"));
        if (c == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "w · s · e · n 은 우리나라 안 0.1° 격자 칸 한 개입니다.");
            return;
        }
        String key = key(c);
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(key, now);
        if (out == null) {
            String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
            out = QUOTA.allow(ip, now) ? fetch(c) : unavailable();
            if (!out.has("unavailable")) CACHE.put(key, out, now);
        }
        Json.ok(req, resp, out);
    }

    /** 순수 함수 - 격자 칸 한 개 [서, 남, 동, 북](0.1° 배수, 한 칸 크기, 우리나라 안). 아니면 null. */
    static double[] cell(String w, String s, String e, String n) {
        try {
            double[] c = {Double.parseDouble(w), Double.parseDouble(s), Double.parseDouble(e), Double.parseDouble(n)};
            for (double v : c) if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-6) return null;
            if (Math.abs(c[2] - c[0] - CELL) > 1e-6 || Math.abs(c[3] - c[1] - CELL) > 1e-6) return null;
            if (c[0] < 124 || c[2] > 132 || c[1] < 33 || c[3] > 39) return null;
            return c;
        } catch (RuntimeException x) {
            return null;
        }
    }

    static String key(double[] c) {
        return Math.round(c[0] * 10) + "," + Math.round(c[1] * 10);
    }

    private static JsonObject fetch(double[] c) {
        String key = RouteflyConfig.get("map.vworld.key");
        if (key == null || key.isBlank()) return unavailable();
        String text = OpenApi.get(url(key, domain(RouteflyConfig.get("site.baseUrl")), c), "HERITAGE", Duration.ofSeconds(10));
        JsonObject out = text == null ? null : parse(text);
        return out == null ? unavailable() : out;
    }

    /** 순수 함수 - WFS 주소(경계 상자는 위도,경도 차례 - DroneProbe 로 받아 봄). */
    static String url(String key, String domain, double[] c) {
        return "https://api.vworld.kr/req/wfs?service=WFS&version=1.1.0&request=GetFeature&typename=lt_c_uo301&srsname=EPSG:4326&output=application/json"
                + "&bbox=" + c[1] + "," + c[0] + "," + c[3] + "," + c[2]
                + "&key=" + URLEncoder.encode(key, StandardCharsets.UTF_8) + "&domain=" + URLEncoder.encode(domain, StandardCharsets.UTF_8);
    }

    /** 순수 함수 - 브이월드에 보낼 도메인: site.baseUrl 의 호스트, 없으면 routefly.kr. */
    static String domain(String base) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^https?://([^/:]+)").matcher(base == null ? "" : base);
        return m.find() ? m.group(1) : "routefly.kr";
    }

    /** 순수 함수 - WFS GeoJSON → {success, zones, partial?}. 꼴이 틀리면(오류 XML 등) null. 좌표는 소수 5자리(약 1m). */
    static JsonObject parse(String text) {
        try {
            JsonObject r = JsonParser.parseString(text).getAsJsonObject();
            JsonArray feats = r.getAsJsonArray("features"), zones = new JsonArray();
            for (JsonElement e : feats) {
                JsonObject f = e.getAsJsonObject(), p = f.getAsJsonObject("properties"), z = new JsonObject();
                JsonArray l = new JsonArray();
                for (String k : new String[] {"uname", "sido_name", "sigg_name"}) l.add(p.has(k) && !p.get(k).isJsonNull() ? p.get(k).getAsString().trim() : "");
                z.add("l", l);
                z.add("g", round(f.getAsJsonObject("geometry").getAsJsonArray("coordinates")));
                zones.add(z);
            }
            JsonObject out = new JsonObject();
            out.addProperty("success", true);
            out.add("zones", zones);
            // 한 번에 1000곳까지만 옴 - 칸 안에 더 있으면 알림(2026-11-17 전국 상자는 20,379 중 1,000)
            if (r.has("numberMatched") && r.get("numberMatched").getAsInt() > zones.size()) out.addProperty("partial", true);
            return out;
        } catch (RuntimeException x) {
            return null;
        }
    }

    private static JsonElement round(JsonArray a) {
        JsonArray o = new JsonArray();
        for (JsonElement e : a)
            if (e.isJsonArray()) o.add(round(e.getAsJsonArray()));
            else o.add(Math.round(e.getAsDouble() * 1e5) / 1e5);
        return o;
    }

    private static JsonObject unavailable() {
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.add("zones", new JsonArray());
        o.addProperty("unavailable", true);
        return o;
    }
}
