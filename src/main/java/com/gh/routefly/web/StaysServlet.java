package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 들머리 근처 숙박 · 식당. {@code GET /api/stays?lat=35.79&lon=128.12[&kind=food]} - 한국관광공사 TourAPI 위치기반 관광정보
 * (숙박 contentTypeId 32, kind=food 면 음식점 39), 반경 5km. 2026-10-14 홍TV님: 들머리 쪽 펜션 · 모텔 · 호텔(먼저 가야산), 그다음 근처 식당 · 5km.
 *
 * <ul>
 *   <li>좌표는 코스 출발점(들머리)입니다 - 화면이 내 위치를 보내지 않습니다. 소수 셋째 자리(약 100m)로 묶어 하루 동안 담아 둡니다(호출 수 줄이기).</li>
 *   <li>인증키 {@code tour.serviceKey}(공공데이터포털 일반 인증키 Decoding)는 서버에만 둡니다. 없거나 TourAPI 가 실패하면
 *       {@code {success:true, stays:[], unavailable:true}} - 오류 내용은 로그에만.</li>
 *   <li>주소 {@code tour.url} 은 바꿀 수 있습니다(기본 KorService2 locationBasedList2).</li>
 * </ul>
 * → {@code {success, stays:[{name, addr, tel, lat, lon, dist_m}], source:"한국관광공사"}}
 */
@WebServlet(urlPatterns = {"/api/stays"})
public class StaysServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String DEFAULT_URL = "https://apis.data.go.kr/B551011/KorService2/locationBasedList2";
    static final int RADIUS_M = 5000, ROWS = 20, CACHE_MAX = 500;
    static final long CACHE_MS = 24L * 60 * 60 * 1000;

    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(CACHE_MAX, CACHE_MS);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        String type = typeOf(req.getParameter("kind"));
        String key = type + "@" + cacheKey(at[0], at[1]);
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(key, now);
        if (out == null) {
            out = fetch(at[0], at[1], type);
            if (!out.has("unavailable")) CACHE.put(key, out, now);
        }
        Json.ok(req, resp, out);
    }

    private static JsonObject fetch(double lat, double lon, String type) {
        String serviceKey = RouteflyConfig.get("tour.serviceKey");
        if (serviceKey == null) return unavailable();
        String base = RouteflyConfig.get("tour.url");
        String text = OpenApi.get(url(base != null ? base : DEFAULT_URL, serviceKey, lat, lon, type), "STAYS");
        JsonObject out = text == null ? null : body(text);
        if (out == null && text != null) OpenApi.warn("STAYS", text);
        return out != null ? out : unavailable();
    }

    private static JsonObject unavailable() {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("stays", new JsonArray());
        out.addProperty("unavailable", true);
        return out;
    }

    /** 순수 함수 - 우리나라 안 좌표면 [lat, lon], 아니면 null. */
    static double[] parse(String lat, String lon) {
        try {
            double a = Double.parseDouble(lat), o = Double.parseDouble(lon);
            return a >= 33 && a <= 39 && o >= 124 && o <= 132 ? new double[] {a, o} : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** 순수 함수 - 담아 두는 열쇠(소수 셋째 자리 - 약 100m). */
    static String cacheKey(double lat, double lon) {
        return String.format(Locale.ROOT, "%.3f,%.3f", lat, lon);
    }

    /** 순수 함수 - kind → TourAPI 관광타입(food 면 음식점 39, 그 밖은 숙박 32). */
    static String typeOf(String kind) {
        return "food".equals(kind) ? "39" : "32";
    }

    /** 순수 함수 - TourAPI 주소(거리순 arrange=E). */
    static String url(String base, String serviceKey, double lat, double lon, String type) {
        return base + "?serviceKey=" + URLEncoder.encode(serviceKey, StandardCharsets.UTF_8)
                + "&MobileOS=ETC&MobileApp=routefly&_type=json&arrange=E&contentTypeId=" + type
                + String.format(Locale.ROOT, "&mapX=%.6f&mapY=%.6f&radius=%d&numOfRows=%d&pageNo=1", lon, lat, RADIUS_M, ROWS);
    }

    /** 순수 함수 - TourAPI JSON → 응답. 모양이 다르면(오류 XML 등) null. item 이 하나면 배열이 아니라 객체로 옴. 빈 결과는 items 가 "". */
    static JsonObject body(String text) {
        JsonObject root;
        try {
            root = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
        } catch (Exception e) {
            return null;
        }
        if (root == null) return null;
        JsonObject header = root.getAsJsonObject("header");
        if (header == null || !"0000".equals(str(header, "resultCode"))) return null;
        JsonArray stays = new JsonArray();
        JsonObject b = root.getAsJsonObject("body");
        JsonElement items = b == null ? null : b.get("items");
        JsonElement list = items != null && items.isJsonObject() ? items.getAsJsonObject().get("item") : null;
        JsonArray arr = list == null ? new JsonArray() : list.isJsonArray() ? list.getAsJsonArray() : one(list);
        for (JsonElement e : arr) {
            if (!e.isJsonObject()) continue;
            JsonObject it = e.getAsJsonObject(), s = new JsonObject();
            String name = str(it, "title");
            Double y = num(it, "mapy"), x = num(it, "mapx");
            if (name == null || y == null || x == null) continue;
            s.addProperty("name", name);
            String addr = str(it, "addr1"), tel = str(it, "tel");
            if (addr != null) s.addProperty("addr", addr);
            if (tel != null) s.addProperty("tel", tel);
            s.addProperty("lat", y);
            s.addProperty("lon", x);
            Double d = num(it, "dist");
            if (d != null) s.addProperty("dist_m", Math.round(d));
            stays.add(s);
        }
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("stays", stays);
        out.addProperty("source", "한국관광공사");
        return out;
    }

    private static JsonArray one(JsonElement e) {
        JsonArray a = new JsonArray();
        a.add(e);
        return a;
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        if (e == null || e.isJsonNull()) return null;
        String s = e.getAsString().trim();
        return s.isEmpty() ? null : s;
    }

    private static Double num(JsonObject o, String k) {
        try {
            String s = str(o, k);
            return s == null ? null : Double.valueOf(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
