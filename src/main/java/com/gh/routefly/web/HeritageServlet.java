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
    /**
     * 칸 답(글)을 하루 담아 둠 - 40칸까지(2026-11-17 PC: 서울 칸 하나가 줄이기 전 5.7MB 라 3,000칸이면 톰캣 768MB 를 넘음).
     * JsonObject 나무가 아니라 다 만든 글로(나무는 글보다 몇 배 큼).
     */
    /** 점검 12차 B2(2026-11-18): UTF-8 바이트로 담아(글의 약 절반) 80칸 - 줄인 서울 칸 약 0.5MB × 80 = 40MB 안쪽. */
    static final int CACHE_CELLS = 80;
    private static final OpenApi.Cache<byte[]> CACHE = new OpenApi.Cache<>(CACHE_CELLS, 24L * 3600_000L);
    /** V-World 응답 상한 8MB(줄이기 전 서울 칸 5.7MB) - 넘으면 끊음(점검 12차 B1). */
    static final int MAX_BYTES = 8 << 20;
    /** V-World 에 동시에 묻는 수 - 2개(서로 다른 칸 수십 개를 한꺼번에 불러 메모리를 바닥내는 것 막기, 점검 12차 B1). */
    private static final java.util.concurrent.Semaphore OUT = new java.util.concurrent.Semaphore(2);
    /** 같은 칸을 동시에 물으면 한 번만 받고 나눔. */
    private static final java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.CompletableFuture<byte[]>> FLIGHT = new java.util.concurrent.ConcurrentHashMap<>();
    /** 경계 줄이기 허용 오차(도) - 약 2m. 판정이 아니라 사전 협의 안내라 이 정도면 충분. */
    static final double TOL = 0.00002;
    /** 기억에 없어 V-World 에 새로 묻는 횟수 상한 - 주소마다 한 시간 20번(점검 12차 B2 - 60번은 칸 밀어내기에 넉넉), 하루 5,000번(설정 quota.heritage.ip · .day). */
    private static final OutQuota QUOTA = OutQuota.of("heritage", 20, 5000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] c = cell(req.getParameter("w"), req.getParameter("s"), req.getParameter("e"), req.getParameter("n"));
        if (c == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "w · s · e · n 은 우리나라 안 0.1° 격자 칸 한 개입니다.");
            return;
        }
        String key = key(c);
        long now = System.currentTimeMillis();
        byte[] bytes = CACHE.get(key, now);
        if (bytes == null) {
            String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
            if (!QUOTA.allow(ip, now)) { Json.ok(req, resp, unavailable()); return; }
            bytes = once(key, c);
            if (bytes == null) { Json.ok(req, resp, unavailable()); return; }
        }
        String text = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        Json.ok(req, resp, text, Json.etag(text));
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

    /** 같은 칸은 한 번만, 바깥은 동시에 2개까지 받아 기억에 담음. 못 받으면 null. */
    private static byte[] once(String key, double[] c) {
        java.util.concurrent.CompletableFuture<byte[]> mine = new java.util.concurrent.CompletableFuture<>(), f = FLIGHT.putIfAbsent(key, mine);
        if (f != null) {
            try { return f.get(15, java.util.concurrent.TimeUnit.SECONDS); } catch (Exception e) { return null; }
        }
        byte[] out = null;
        try {
            if (OUT.tryAcquire(5, java.util.concurrent.TimeUnit.SECONDS)) {
                try {
                    JsonObject o = fetch(c);
                    if (!o.has("unavailable")) {
                        out = o.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                        CACHE.put(key, out, System.currentTimeMillis());
                    }
                } finally {
                    OUT.release();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            mine.complete(out);
            FLIGHT.remove(key, mine);
        }
        return out;
    }

    private static JsonObject fetch(double[] c) {
        String key = RouteflyConfig.get("map.vworld.key");
        if (key == null || key.isBlank()) return unavailable();
        String text = OpenApi.get(url(key, domain(RouteflyConfig.get("site.baseUrl")), c), "HERITAGE", Duration.ofSeconds(10), MAX_BYTES);
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
                JsonArray g = simplifyMulti(f.getAsJsonObject("geometry").getAsJsonArray("coordinates"));
                if (g.size() == 0) continue;
                z.add("g", g);
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

    /** MultiPolygon 좌표 → 고리마다 줄이고(Douglas-Peucker, TOL) 소수 5자리로. 줄여서 점 4개가 못 되면 줄이지 않은 고리를 씀. */
    static JsonArray simplifyMulti(JsonArray multi) {
        JsonArray out = new JsonArray();
        for (JsonElement pe : multi) {
            JsonArray poly = new JsonArray();
            for (JsonElement re : pe.getAsJsonArray()) {
                JsonArray ring = re.getAsJsonArray();
                double[][] pts = new double[ring.size()][];
                for (int i = 0; i < pts.length; i++) {
                    JsonArray p = ring.get(i).getAsJsonArray();
                    pts[i] = new double[] {p.get(0).getAsDouble(), p.get(1).getAsDouble()};
                }
                boolean[] keep = new boolean[pts.length];
                if (pts.length > 0) { keep[0] = true; keep[pts.length - 1] = true; }
                dp(pts, 0, pts.length - 1, keep);
                JsonArray r = new JsonArray();
                for (int i = 0; i < pts.length; i++)
                    if (keep[i]) { JsonArray p = new JsonArray(); p.add(Math.round(pts[i][0] * 1e5) / 1e5); p.add(Math.round(pts[i][1] * 1e5) / 1e5); r.add(p); }
                // 작은 구역(비석 하나 같은 몇 m)은 줄이면 선이 되어 사라짐 - 그런 고리는 줄이지 않고 그대로(소수 5자리)
                if (r.size() < 4) {
                    r = new JsonArray();
                    for (double[] q : pts) { JsonArray p = new JsonArray(); p.add(Math.round(q[0] * 1e5) / 1e5); p.add(Math.round(q[1] * 1e5) / 1e5); r.add(p); }
                }
                if (r.size() >= 4) poly.add(r);
                else if (poly.size() == 0) break;   // 원래부터 점 4개가 못 되는 바깥 고리는 다각형째 뺌
            }
            if (poly.size() > 0) out.add(poly);
        }
        return out;
    }

    private static void dp(double[][] p, int a, int b, boolean[] keep) {
        if (b <= a + 1) return;
        double ax = p[a][0], ay = p[a][1], dx = p[b][0] - ax, dy = p[b][1] - ay, len2 = dx * dx + dy * dy, best = -1;
        int at = -1;
        for (int i = a + 1; i < b; i++) {
            double px = p[i][0] - ax, py = p[i][1] - ay, d;
            if (len2 == 0) d = Math.hypot(px, py);
            else { double t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2)); d = Math.hypot(px - t * dx, py - t * dy); }
            if (d > best) { best = d; at = i; }
        }
        if (best > TOL) { keep[at] = true; dp(p, a, at, keep); dp(p, at, b, keep); }
    }

    private static JsonObject unavailable() {
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.add("zones", new JsonArray());
        o.addProperty("unavailable", true);
        return o;
    }
}
