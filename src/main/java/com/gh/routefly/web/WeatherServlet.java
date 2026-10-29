package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 들머리 날씨. {@code GET /api/weather?lat=35.79&lon=128.12} - 기상청 단기예보(공공데이터포털 VilageFcstInfoService_2.0 getVilageFcst).
 * 2026-10-14 홍TV님: fly(3D) 안내 버튼(먼저 가야산).
 *
 * <ul>
 *   <li>좌표는 코스 출발점(들머리)입니다. 기상청 5km 격자(nx, ny)로 바꿔 묻고, 격자 · 발표 시각마다 담아 둡니다.</li>
 *   <li>인증키 {@code weather.serviceKey}, 없으면 {@code tour.serviceKey}(공공데이터포털 개인 키는 같고, 서비스마다 활용 신청만 따로).
 *       없거나 실패하면 {@code {success:true, hours:[], unavailable:true}}.</li>
 * </ul>
 * → {@code {success, base:"2026-10-14 14:00", near(옆 격자 자료면 true), hours:[{t:"2026-10-14 15:00", tmp, sky, pty, pop, wsd, reh, pcp}], days:{"2026-10-15":{tmn, tmx}}, source:"기상청"}}
 *   sky 1 맑음 · 3 구름많음 · 4 흐림, pty 0 없음 · 1 비 · 2 비/눈 · 3 눈 · 4 소나기.
 */
@WebServlet(urlPatterns = {"/api/weather"})
public class WeatherServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String DEFAULT_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(500, 3L * 60 * 60 * 1000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        Json.ok(req, resp, forecast(at[0], at[1]));
    }

    /** 그 자리 격자의 예보(담아 둔 것이 있으면 그것) - 주말 추천(WeekendServlet)도 씀. */
    static JsonObject forecast(double lat, double lon) {
        int[] g = grid(lat, lon);
        String[] base = baseTime(LocalDateTime.now(KST));
        String key = g[0] + "," + g[1] + "@" + base[0] + base[1];
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(key, now);
        if (out == null) {
            out = fetch(g, base);
            if (!out.has("unavailable")) CACHE.put(key, out, now);
        }
        return out;
    }

    private static JsonObject fetch(int[] g, String[] base) {
        String serviceKey = RouteflyConfig.get("weather.serviceKey");
        if (serviceKey == null) serviceKey = RouteflyConfig.get("tour.serviceKey");
        if (serviceKey == null) return unavailable();
        String u = RouteflyConfig.get("weather.url");
        String text = OpenApi.get(url(u != null ? u : DEFAULT_URL, serviceKey, g, base), "WEATHER");
        JsonObject out = text == null ? null : body(text, base);
        // 막 나온 발표는 격자에 따라 몇 분 늦게 채워짐 - NO_DATA(03)면 한 발표 앞(3시간 전)으로 한 번 더(2026-10-14 PC: 북한산 61,129)
        if (out == null && text != null && noData(text)) {
            String[] prev = previous(base);
            String t2 = OpenApi.get(url(u != null ? u : DEFAULT_URL, serviceKey, g, prev), "WEATHER");
            out = t2 == null ? null : body(t2, prev);
            if (out == null && t2 != null) text = t2;
        }
        // 그래도 자료 없음이면 바로 옆 격자(5km)로 - 북한산 들머리 격자(61,129)는 두 발표 모두 NO_DATA 였고 옆(60,129)은 나왔음(2026-10-14 PC)
        if (out == null && text != null && noData(text)) {
            for (int[] n : neighbors(g)) {
                String t3 = OpenApi.get(url(u != null ? u : DEFAULT_URL, serviceKey, n, base), "WEATHER");
                out = t3 == null ? null : body(t3, base);
                if (out != null) { out.addProperty("near", true); break; }
            }
        }
        if (out == null && text != null) OpenApi.warn("WEATHER", text);
        return out != null ? out : unavailable();
    }

    private static JsonObject unavailable() {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("hours", new JsonArray());
        out.addProperty("unavailable", true);
        return out;
    }

    /**
     * 순수 함수 - 위경도 → 기상청 격자(nx, ny). 기상청 동네예보 격자(람베르트 정각원추, 5km)의 공개 변환식.
     * 서울시청(37.5665, 126.9780) → (60, 127).
     */
    static int[] grid(double lat, double lon) {
        double re = 6371.00877 / 5.0, rad = Math.PI / 180.0;
        double slat1 = 30.0 * rad, slat2 = 60.0 * rad, olon = 126.0 * rad, olat = 38.0 * rad;
        double sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
        sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
        double sf = Math.pow(Math.tan(Math.PI * 0.25 + slat1 * 0.5), sn) * Math.cos(slat1) / sn;
        double ro = re * sf / Math.pow(Math.tan(Math.PI * 0.25 + olat * 0.5), sn);
        double ra = re * sf / Math.pow(Math.tan(Math.PI * 0.25 + lat * rad * 0.5), sn);
        double theta = lon * rad - olon;
        if (theta > Math.PI) theta -= 2.0 * Math.PI;
        if (theta < -Math.PI) theta += 2.0 * Math.PI;
        theta *= sn;
        return new int[] {(int) Math.floor(ra * Math.sin(theta) + 43 + 0.5), (int) Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5)};
    }

    /** 순수 함수 - 지금(한국 시각) 받을 수 있는 가장 늦은 발표 [base_date yyyyMMdd, base_time HHmm]. 02 · 05 · … · 23시 발표, 10분 뒤부터 나옴. */
    static String[] baseTime(LocalDateTime now) {
        LocalDateTime t = now.minusMinutes(10);
        int h = t.getHour();
        int b = h < 2 ? -1 : 2 + (h - 2) / 3 * 3;
        LocalDateTime d = b < 0 ? t.minusDays(1).withHour(23) : t.withHour(b);
        return new String[] {String.format(Locale.ROOT, "%04d%02d%02d", d.getYear(), d.getMonthValue(), d.getDayOfMonth()),
                String.format(Locale.ROOT, "%02d00", d.getHour())};
    }

    /** 순수 함수 - 바로 옆 격자 넷(서 · 동 · 남 · 북). */
    static int[][] neighbors(int[] g) {
        return new int[][] {{g[0] - 1, g[1]}, {g[0] + 1, g[1]}, {g[0], g[1] - 1}, {g[0], g[1] + 1}};
    }

    /** 순수 함수 - 기상청 "자료 없음"(resultCode 03) 응답인가. */
    static boolean noData(String text) {
        return text != null && text.replaceAll("\\s+", "").contains("\"resultCode\":\"03\"");
    }

    /** 순수 함수 - 한 발표 앞(3시간 전, 02시 앞은 전날 23시). */
    static String[] previous(String[] bt) {
        LocalDateTime t = LocalDateTime.of(Integer.parseInt(bt[0].substring(0, 4)), Integer.parseInt(bt[0].substring(4, 6)), Integer.parseInt(bt[0].substring(6, 8)),
                Integer.parseInt(bt[1].substring(0, 2)), 0);
        return baseTime(t.minusHours(3).plusMinutes(10));
    }

    /** 순수 함수 - 요청 주소(JSON, 한 번에 다 - 사흘치 약 900줄). */
    static String url(String base, String serviceKey, int[] g, String[] bt) {
        return base + "?serviceKey=" + URLEncoder.encode(serviceKey, StandardCharsets.UTF_8)
                + "&pageNo=1&numOfRows=1000&dataType=JSON&base_date=" + bt[0] + "&base_time=" + bt[1] + "&nx=" + g[0] + "&ny=" + g[1];
    }

    /** 순수 함수 - 기상청 JSON → 시각별 줄. 모양이 다르거나 resultCode 가 00 이 아니면 null. */
    static JsonObject body(String text, String[] bt) {
        JsonObject root;
        try {
            root = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
        } catch (Exception e) {
            return null;
        }
        if (root == null || root.getAsJsonObject("header") == null) return null;
        JsonElement code = root.getAsJsonObject("header").get("resultCode");
        if (code == null || !"00".equals(code.getAsString())) return null;
        JsonObject b = root.getAsJsonObject("body");
        JsonElement items = b == null ? null : b.get("items");
        JsonElement list = items != null && items.isJsonObject() ? items.getAsJsonObject().get("item") : null;
        Map<String, JsonObject> hours = new TreeMap<>();
        Map<String, JsonObject> days = new TreeMap<>();
        if (list != null && list.isJsonArray()) {
            for (JsonElement e : list.getAsJsonArray()) {
                if (!e.isJsonObject()) continue;
                JsonObject it = e.getAsJsonObject();
                String d = s(it, "fcstDate"), tm = s(it, "fcstTime"), cat = s(it, "category"), v = s(it, "fcstValue");
                if (d == null || tm == null || cat == null || v == null || d.length() != 8 || tm.length() != 4) continue;
                String day = d.substring(0, 4) + "-" + d.substring(4, 6) + "-" + d.substring(6, 8);
                if ("TMN".equals(cat) || "TMX".equals(cat)) {
                    Double n = number(v);
                    if (n != null) days.computeIfAbsent(day, k -> new JsonObject()).addProperty(cat.toLowerCase(Locale.ROOT), n);
                    continue;
                }
                String key = day + " " + tm.substring(0, 2) + ":" + tm.substring(2);
                JsonObject h = hours.computeIfAbsent(key, k -> { JsonObject o = new JsonObject(); o.addProperty("t", k); return o; });
                switch (cat) {
                    case "TMP": case "POP": case "WSD": case "VEC": case "REH": case "SKY": case "PTY": {   // VEC 풍향(바람이 불어오는 쪽, 도) - 시간별 표의 바람 화살표(2026-10-30)
                        Double n = number(v);
                        if (n != null) h.addProperty(cat.toLowerCase(Locale.ROOT), n);
                        break;
                    }
                    case "PCP":
                        h.addProperty("pcp", v);   // "강수없음" · "1.0mm" · "1mm 미만" 처럼 글로 옴
                        break;
                    default:
                }
            }
        }
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.addProperty("base", bt[0].substring(0, 4) + "-" + bt[0].substring(4, 6) + "-" + bt[0].substring(6) + " " + bt[1].substring(0, 2) + ":00");
        JsonArray arr = new JsonArray();
        hours.values().forEach(arr::add);
        out.add("hours", arr);
        JsonObject dj = new JsonObject();
        days.forEach(dj::add);
        out.add("days", dj);
        out.addProperty("source", "기상청");
        return out;
    }

    private static String s(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString().trim();
    }

    private static Double number(String v) {
        try {
            return Double.valueOf(v);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
