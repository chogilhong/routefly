package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 미세먼지. {@code GET /api/air?lat=35.79&lon=128.12} - 가장 가까운 대기 측정소의 지금 미세먼지 · 초미세먼지.
 * 2026-10-15 홍TV님: 산 소개 페이지 · fly(3D) 날씨 옆에.
 *
 * <ul>
 *   <li>공공데이터포털 한국환경공단 에어코리아 - 측정소 목록(MsrstnInfoInqireSvc getMsrstnList, 하루 담아 둠)에서 가장 가까운 곳(AIR_NEAR_M 안),
 *       그 측정소의 실시간 값(ArpltnInforInqireSvc getMsrstnAcctoRltmMesureDnsty, 30분 담아 둠).</li>
 *   <li>인증키 {@code air.serviceKey}, 없으면 {@code tour.serviceKey}(개인 키는 같고 서비스마다 활용 신청만 따로).
 *       없거나 실패하면 {@code {success:true, unavailable:true}}.</li>
 *   <li>좋음 · 보통 · 나쁨 · 매우나쁨은 받은 농도로 환경부 예보 기준에 맞춰 여기서 정합니다(PM10 30 · 80 · 150, PM2.5 15 · 35 · 75).</li>
 * </ul>
 * → {@code {success, station, time:"2026-10-15 14:00", dist_km, pm10, pm25, pm10Word, pm25Word, source}}
 */
@WebServlet(urlPatterns = {"/api/air"})
public class AirServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String STATIONS_URL = "https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getMsrstnList";
    static final String MEASURE_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty";
    static final double AIR_NEAR_M = 40000;
    /**
     * 가까운 측정소부터 몇 곳까지 물어보는가 / 측정소마다 최근 몇 줄(시간)까지 보는가.
     * 2026-10-15 PC: 98개 산 가운데 7곳은 가장 가까운 측정소의 최근 3시간이 모두 "통신장애"(값 "-"),
     * 3곳(설악산 · 점봉산 · 황석산)은 가장 가까운 측정소 이름으로 물으면 0줄 - 다음 측정소로 넘어감.
     */
    static final int TRY_STATIONS = 3, ROWS = 6;
    /** 측정소 목록(672곳 - 2026-10-15)은 8초를 넘긴 적이 있음(PC 13:16 · 14:48 HttpTimeoutException). */
    static final Duration STATIONS_TIMEOUT = Duration.ofSeconds(25);
    private static final long DAY = 24L * 60 * 60 * 1000;
    private static final OpenApi.Cache<List<double[]>> STATION_POS = new OpenApi.Cache<>(1, DAY);
    private static final OpenApi.Cache<List<String>> STATION_NAMES = new OpenApi.Cache<>(1, DAY);
    private static final OpenApi.Cache<JsonObject> MEASURE = new OpenApi.Cache<>(800, 30L * 60 * 1000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        String key = RouteflyConfig.get("air.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        Json.ok(req, resp, key == null ? unavailable() : answer(key, at[0], at[1]));
    }

    private static JsonObject answer(String key, double lat, double lon) {
        long now = System.currentTimeMillis();
        List<double[]> pos = STATION_POS.get("all", now);
        List<String> names = STATION_NAMES.get("all", now);
        if (pos == null || names == null) {
            pos = new ArrayList<>();
            names = new ArrayList<>();
            String text = OpenApi.get(STATIONS_URL + "?serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                    + "&returnType=json&numOfRows=1000&pageNo=1", "AIR", STATIONS_TIMEOUT);
            if (text == null || !stations(text, names, pos)) {
                if (text != null) OpenApi.warn("AIR", text);
                return unavailable();
            }
            STATION_POS.put("all", pos, now);
            STATION_NAMES.put("all", names, now);
        }
        for (int i : nearest(pos, lat, lon, AIR_NEAR_M, TRY_STATIONS)) {
            String station = names.get(i);
            JsonObject m = MEASURE.get(station, now);
            if (m == null) {
                String text = OpenApi.get(MEASURE_URL + "?serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                        + "&returnType=json&numOfRows=" + ROWS + "&pageNo=1&dataTerm=DAILY&ver=1.0&stationName=" + URLEncoder.encode(station, StandardCharsets.UTF_8), "AIR");
                if (text == null) continue;   // 시간 초과 · 실패 - 담아 두지 않고 다음 측정소
                m = measure(text);
                if (m == null) m = new JsonObject();   // 값 없음(통신장애 · 0줄)도 30분 담아 둠 - 매번 묻지 않게
                MEASURE.put(station, m, now);
            }
            if (m.size() == 0) continue;
            JsonObject out = m.deepCopy();
            out.addProperty("success", true);
            out.addProperty("station", station);
            out.addProperty("dist_km", Math.round(MountainServlet.distM(lat, lon, pos.get(i)[0], pos.get(i)[1]) / 100) / 10.0);
            out.addProperty("source", "에어코리아(한국환경공단)");
            return out;
        }
        return unavailable();
    }

    private static JsonObject unavailable() {
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.addProperty("unavailable", true);
        return o;
    }

    /** 응답의 줄들 - {@code response.body.items} 가 배열이거나 {@code items.item} 인 두 모양 모두. 모양이 다르거나 resultCode 가 00 이 아니면 null. */
    static JsonArray items(String text) {
        try {
            JsonObject r = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
            JsonElement code = r.getAsJsonObject("header").get("resultCode");
            if (code == null || !"00".equals(code.getAsString())) return null;
            JsonElement it = r.getAsJsonObject("body").get("items");
            if (it != null && it.isJsonObject()) it = it.getAsJsonObject().get("item");
            if (it == null || it.isJsonNull()) return new JsonArray();
            if (it.isJsonArray()) return it.getAsJsonArray();
            JsonArray one = new JsonArray();
            one.add(it);
            return one;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 순수 함수 - 측정소 목록 → 이름 · [위도, 경도]. dmX · dmY 중 어느 쪽이 위도인지는 값의 범위로 봅니다(위도 33~39 · 경도 124~132).
     * 읽은 측정소가 하나도 없으면 false.
     */
    static boolean stations(String text, List<String> names, List<double[]> pos) {
        JsonArray list = items(text);
        if (list == null) return false;
        for (JsonElement e : list) {
            if (!e.isJsonObject()) continue;
            JsonObject o = e.getAsJsonObject();
            String n = str(o, "stationName");
            Double x = num(str(o, "dmX")), y = num(str(o, "dmY"));
            if (n == null || x == null || y == null) continue;
            double la = x < 90 ? x : y, lo = x < 90 ? y : x;
            if (la < 32 || la > 40 || lo < 123 || lo > 133) continue;
            names.add(n);
            pos.add(new double[] {la, lo});
        }
        return !names.isEmpty();
    }

    /** 순수 함수 - maxM 안 측정소의 차례, 가까운 것부터 n 곳. */
    static List<Integer> nearest(List<double[]> pos, double lat, double lon, double maxM, int n) {
        List<double[]> hit = new ArrayList<>();
        for (int i = 0; i < pos.size(); i++) {
            double d = MountainServlet.distM(lat, lon, pos.get(i)[0], pos.get(i)[1]);
            if (d <= maxM) hit.add(new double[] {i, d});
        }
        hit.sort((a, b) -> Double.compare(a[1], b[1]));
        List<Integer> out = new ArrayList<>();
        for (int k = 0; k < hit.size() && k < n; k++) out.add((int) hit.get(k)[0]);
        return out;
    }

    /** 순수 함수 - 실시간 값(최근 줄부터, 미세먼지 · 초미세먼지 중 하나라도 있는 첫 줄). 없으면 null. */
    static JsonObject measure(String text) {
        JsonArray list = items(text);
        if (list == null) return null;
        for (JsonElement e : list) {
            if (!e.isJsonObject()) continue;
            JsonObject o = e.getAsJsonObject();
            Double p10 = num(str(o, "pm10Value")), p25 = num(str(o, "pm25Value"));
            if (p10 == null && p25 == null) continue;
            JsonObject out = new JsonObject();
            out.addProperty("time", str(o, "dataTime"));
            if (p10 != null) {
                out.addProperty("pm10", (int) Math.round(p10));
                out.addProperty("pm10Word", word(p10, 30, 80, 150));
            }
            if (p25 != null) {
                out.addProperty("pm25", (int) Math.round(p25));
                out.addProperty("pm25Word", word(p25, 15, 35, 75));
            }
            return out;
        }
        return null;
    }

    /** 순수 함수 - 환경부 예보 등급(좋음 · 보통 · 나쁨 · 매우나쁨). */
    static String word(double v, double good, double normal, double bad) {
        return v <= good ? "좋음" : v <= normal ? "보통" : v <= bad ? "나쁨" : "매우나쁨";
    }

    private static Double num(String s) {
        if (s == null) return null;
        try {
            double d = Double.parseDouble(s.trim());
            return Double.isFinite(d) && d >= 0 ? d : null;
        } catch (NumberFormatException e) {
            return null;   // "-" (점검 · 통신 장애)
        }
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString().trim();
    }
}
