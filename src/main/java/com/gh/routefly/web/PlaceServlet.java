package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 장소 이름 → 좌표(2026-10-29 홍TV님 "산청군청 근처 숙소" 를 /m/ 에서). {@code GET /api/place?q=산청군청} - 국토교통부 V-World 검색 API 2.0.
 * 장소(place)로 먼저, 없으면 도로명 주소 · 지번 주소로. 우리나라 안 좌표만, 5곳까지.
 * <ul>
 *   <li>키는 서버 설정 {@code place.vworld.key}(없으면 지도와 같은 {@code map.vworld.key}). 없거나 실패하면 {@code {success:true, places:[], unavailable:true}}.</li>
 *   <li>찾는 말은 사람이 친 이름이라 로그 · 통계에 남기지 않음(OpenApi 로그는 tag 와 까닭만). 같은 말은 하루 동안 담아 둠.</li>
 * </ul>
 * → {@code {success, places:[{name, addr, lat, lon}], source:"국토교통부 V-World"}}
 */
@WebServlet(urlPatterns = {"/api/place"})
public class PlaceServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final org.apache.logging.log4j.Logger log = org.apache.logging.log4j.LogManager.getLogger(PlaceServlet.class);
    static final String URL = "https://api.vworld.kr/req/search";
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(2000, 24L * 3600_000L);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String q = query(req.getParameter("q"));
        if (q == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "장소 이름을 2~30자로 적어 주세요.");
            return;
        }
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(q, now);
        if (out == null) {
            out = fetch(q);
            if (!out.has("unavailable")) CACHE.put(q, out, now);
        }
        Json.ok(req, resp, out);
    }

    /** 순수 함수 - 찾는 말(2~30자, 꺾쇠 · 따옴표 · 숨은 글자 빼고). 틀리면 null. */
    static String query(String q) {
        String t = Party.clean(q, 30);
        return t == null || t.codePointCount(0, t.length()) < 2 ? null : t;
    }

    private static JsonObject fetch(String q) {
        String key = RouteflyConfig.get("place.vworld.key");
        if (key == null) key = RouteflyConfig.get("map.vworld.key");
        if (key == null) return empty(true);
        String domain = host(RouteflyConfig.get("site.baseUrl"));
        for (String[] t : new String[][] {{"place", null}, {"address", "road"}, {"address", "parcel"}}) {
            String text = OpenApi.get(url(key, q, t[0], t[1], domain), "PLACE");
            if (text == null) return empty(true);
            JsonObject out = parse(text);
            if (out == null) { log.warn("[PLACE] V-World 답이 OK 가 아님 - 키 · 서비스 주소 확인"); return empty(true); }   // 답 내용은 남기지 않음(찾는 말 · 키가 섞일 수 있음)
            if (out.getAsJsonArray("places").size() > 0) return out;
        }
        return empty(false);
    }

    /** 순수 함수 - 요청 주소. */
    static String url(String key, String q, String type, String category, String domain) {
        return URL + "?service=search&request=search&version=2.0&crs=EPSG:4326&size=5&page=1&format=json&errorformat=json&type=" + type
                + (category != null ? "&category=" + category : "") + "&query=" + URLEncoder.encode(q, StandardCharsets.UTF_8)
                + (domain != null ? "&domain=" + URLEncoder.encode(domain, StandardCharsets.UTF_8) : "")
                + "&key=" + URLEncoder.encode(key, StandardCharsets.UTF_8);
    }

    private static String host(String base) {
        if (base == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^https?://([^/:]+)").matcher(base);
        return m.find() ? m.group(1) : null;
    }

    /** 순수 함수 - V-World 답 → {success, places}. OK 도 NOT_FOUND 도 아니면(키 오류 등) null. */
    static JsonObject parse(String text) {
        try {
            JsonObject r = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
            String status = r.get("status").getAsString();
            if ("NOT_FOUND".equals(status)) return empty(false);
            if (!"OK".equals(status)) return null;
            JsonArray items = r.getAsJsonObject("result").getAsJsonArray("items"), places = new JsonArray();
            java.util.Set<String> seen = new java.util.HashSet<>();   // 같은 곳(주소 · 좌표 같음)은 하나만 - 산청군청 · 경상남도산청군청이 둘 다 나왔음(2026-10-29 홍TV님 화면)
            for (JsonElement e : items) {
                JsonObject it = e.getAsJsonObject(), pt = it.getAsJsonObject("point");
                double lat = pt.get("y").getAsDouble(), lon = pt.get("x").getAsDouble();
                if (StaysServlet.parse(String.valueOf(lat), String.valueOf(lon)) == null) continue;
                JsonObject p = new JsonObject();
                String name = it.has("title") && !it.get("title").isJsonNull() ? it.get("title").getAsString() : null;
                JsonObject a = it.has("address") && it.get("address").isJsonObject() ? it.getAsJsonObject("address") : null;
                String addr = a == null ? null : a.has("road") && !a.get("road").getAsString().isEmpty() ? a.get("road").getAsString() : a.has("parcel") ? a.get("parcel").getAsString() : null;
                p.addProperty("name", Party.clean(name != null ? name : addr, 60));
                if (addr != null) p.addProperty("addr", Party.clean(addr, 80));
                // 주소가 있으면 주소만으로(같은 건물도 V-World 좌표가 수십 m 씩 다름 - 2026-10-29 PC), 없으면 약 100m 칸으로
                if (!seen.add(addr != null && !addr.isBlank() ? addr.replaceAll("\\s+", "") : "@" + Math.round(lat * 1e3) + "," + Math.round(lon * 1e3))) continue;
                p.addProperty("lat", Math.round(lat * 1e6) / 1e6);
                p.addProperty("lon", Math.round(lon * 1e6) / 1e6);
                places.add(p);
                if (places.size() >= 5) break;
            }
            JsonObject out = empty(false);
            out.add("places", places);
            return out;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static JsonObject empty(boolean unavailable) {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("places", new JsonArray());
        out.addProperty("source", "국토교통부 V-World");
        if (unavailable) out.addProperty("unavailable", true);
        return out;
    }
}
