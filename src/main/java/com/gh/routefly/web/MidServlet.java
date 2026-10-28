package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 중기예보(4~10일 뒤). {@code GET /api/mid?lat=35.79&lon=128.12} - 기상청 중기예보 조회서비스(MidFcstInfoService)의
 * 중기육상예보(getMidLandFcst - 오전 · 오후 하늘 · 강수확률)와 중기기온(getMidTa - 최저 · 최고).
 * 2026-10-15 홍TV님: 며칠 뒤 산행 날의 날씨(단기예보는 글피까지).
 *
 * <ul>
 *   <li>예보 구역은 넓은 권역(부산 · 울산 · 경남 등). 권역은 가장 가까운 대기 측정소 주소의 시도로(AirServlet.regionNear), 못 정하면 가까운 기온 지점의 권역.
 *       기온은 그 권역 안에서 가장 가까운 지점(도시).</li>
 *   <li>발표는 하루 두 번(06 · 18시). 발표 시각마다 담아 두고, 막 발표돼 아직 비었으면 앞 발표로.</li>
 *   <li>인증키 {@code weather.serviceKey}, 없으면 {@code tour.serviceKey}(단기예보와 같음). 없거나 실패하면 {@code {success:true, unavailable:true}}.</li>
 * </ul>
 * → {@code {success, region:"부산 · 울산 · 경남", city:"진주", tmFc:"2026-10-15 18:00", days:{"2026-10-19":{wfAm, wfPm, popAm, popPm, tmn, tmx}}, source}}
 * (8일 뒤부터는 하루 한 값 - wfAm = wfPm)
 */
@WebServlet(urlPatterns = {"/api/mid"})
public class MidServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String LAND_URL = "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst";
    static final String TA_URL = "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa";
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(200, 6L * 60 * 60 * 1000);

    /** 중기육상예보 구역 {코드, 이름}. */
    static final String[][] LAND = {
        {"11B00000", "서울 · 인천 · 경기"}, {"11D10000", "강원 영서"}, {"11D20000", "강원 영동"}, {"11C20000", "대전 · 세종 · 충남"},
        {"11C10000", "충북"}, {"11F20000", "광주 · 전남"}, {"11F10000", "전북"}, {"11H10000", "대구 · 경북"}, {"11H20000", "부산 · 울산 · 경남"},
        {"11G00000", "제주"},
    };
    /** 중기기온 지점 {코드, 이름, 위도, 경도, 육상 구역}. 2026-10-15 - MidFcstProbe 로 실제 응답 확인. */
    static final Object[][] CITIES = {
        {"11B10101", "서울", 37.57, 126.98, "11B00000"}, {"11B20201", "인천", 37.46, 126.71, "11B00000"}, {"11B20601", "수원", 37.26, 127.03, "11B00000"},
        {"11D10301", "춘천", 37.88, 127.73, "11D10000"}, {"11D10401", "원주", 37.34, 127.92, "11D10000"}, {"11D20501", "강릉", 37.75, 128.88, "11D20000"},
        {"11C20401", "대전", 36.35, 127.38, "11C20000"}, {"11C20101", "서산", 36.78, 126.45, "11C20000"}, {"11C10301", "청주", 36.64, 127.49, "11C10000"},
        {"11F20501", "광주", 35.16, 126.85, "11F20000"}, {"11F20401", "여수", 34.76, 127.66, "11F20000"}, {"11F10201", "전주", 35.82, 127.15, "11F10000"},
        {"11H10701", "대구", 35.87, 128.60, "11H10000"}, {"11H10501", "안동", 36.57, 128.73, "11H10000"}, {"11H10201", "포항", 36.02, 129.34, "11H10000"},
        {"11H20201", "부산", 35.18, 129.08, "11H20000"}, {"11H20101", "울산", 35.54, 129.31, "11H20000"}, {"11H20301", "창원", 35.23, 128.68, "11H20000"},
        {"11H20701", "진주", 35.18, 128.11, "11H20000"}, {"11G00201", "제주", 33.50, 126.53, "11G00000"}, {"11G00401", "서귀포", 33.25, 126.56, "11G00000"},
    };

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        JsonObject out = at(at[0], at[1]);
        if (out.has("unavailable")) Json.write(resp, HttpServletResponse.SC_OK, out, false);
        else Json.ok(req, resp, out);
    }

    /** 그 자리 중기예보(키가 없으면 unavailable) - api/wx 도 씀. */
    static JsonObject at(double lat, double lon) {
        String key = RouteflyConfig.get("weather.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        return key == null ? unavailable() : answer(key, lat, lon);
    }

    private static JsonObject answer(String key, double lat, double lon) {
        String land = landOf(AirServlet.regionNear(lat, lon));
        Object[] city = city(lat, lon, land);
        if (land == null) land = (String) city[4];
        return forLand(key, land, city);
    }

    /** 그 구역 · 기온 지점의 중기예보(담아 둔 것이 있으면 그것) - 주말 추천(WeekendServlet)도 씀. 못 받으면 unavailable. */
    static JsonObject forLand(String key, String land, Object[] city) {
        long now = System.currentTimeMillis();
        LocalDateTime t = LocalDateTime.now(WeatherServlet.KST);
        for (String tm : new String[] {tmFc(t), tmFc(t.minusHours(12))}) {   // 막 발표돼 비었으면 앞 발표
            String ck = land + "|" + city[0] + "|" + tm;
            JsonObject hit = CACHE.get(ck, now);
            if (hit != null) return hit;
            String a = OpenApi.get(url(LAND_URL, key, land, tm), "MID"), b = a == null ? null : OpenApi.get(url(TA_URL, key, (String) city[0], tm), "MID");
            JsonObject days = a == null || b == null ? null : days(a, b, tm);
            if (days == null || days.size() == 0) {
                if (a != null && items(a) == null) OpenApi.warn("MID", a);
                continue;
            }
            JsonObject out = new JsonObject();
            out.addProperty("success", true);
            out.addProperty("region", landName(land));
            out.addProperty("city", (String) city[1]);
            out.addProperty("tmFc", tm.substring(0, 4) + "-" + tm.substring(4, 6) + "-" + tm.substring(6, 8) + " " + tm.substring(8, 10) + ":00");
            out.add("days", days);
            out.addProperty("source", "기상청 중기예보");
            CACHE.put(ck, out, now);
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

    static String url(String base, String key, String regId, String tmFc) {
        return base + "?serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8) + "&pageNo=1&numOfRows=10&dataType=JSON&regId=" + regId + "&tmFc=" + tmFc;
    }

    /** 순수 함수 - 가장 최근 발표 시각 "yyyyMMddHHmm"(06 · 18시). */
    static String tmFc(LocalDateTime now) {
        LocalDate d = now.toLocalDate();
        int h = now.getHour();
        if (h >= 18) return String.format("%04d%02d%02d1800", d.getYear(), d.getMonthValue(), d.getDayOfMonth());
        if (h >= 6) return String.format("%04d%02d%02d0600", d.getYear(), d.getMonthValue(), d.getDayOfMonth());
        LocalDate y = d.minusDays(1);
        return String.format("%04d%02d%02d1800", y.getYear(), y.getMonthValue(), y.getDayOfMonth());
    }

    /** 순수 함수 - 예보 지역(AirServlet.region: 서울 · 경기북부 · 영동 · 경남 …) → 육상 구역 코드. 모르면 null. */
    static String landOf(String region) {
        if (region == null) return null;
        switch (region) {
            case "서울": case "인천": case "경기북부": case "경기남부": return "11B00000";
            case "영서": return "11D10000";
            case "영동": return "11D20000";
            case "대전": case "세종": case "충남": return "11C20000";
            case "충북": return "11C10000";
            case "광주": case "전남": return "11F20000";
            case "전북": return "11F10000";
            case "대구": case "경북": return "11H10000";
            case "부산": case "울산": case "경남": return "11H20000";
            case "제주": return "11G00000";
            default: return null;
        }
    }

    static String landName(String code) {
        for (String[] l : LAND) if (l[0].equals(code)) return l[1];
        return code;
    }

    /** 순수 함수 - 기온 지점: land 구역 안(없으면 전체)에서 가장 가까운 곳. */
    static Object[] city(double lat, double lon, String land) {
        Object[] best = null;
        double bd = Double.MAX_VALUE;
        for (int pass = 0; pass < 2 && best == null; pass++) {
            for (Object[] c : CITIES) {
                if (pass == 0 && land != null && !land.equals(c[4])) continue;
                if (pass == 0 && land == null) continue;
                double d = MountainServlet.distM(lat, lon, (Double) c[2], (Double) c[3]);
                if (d < bd) { bd = d; best = c; }
            }
        }
        return best;
    }

    /** 응답의 첫 줄(item) - resultCode 00 이 아니거나 모양이 다르면 null. */
    static JsonObject items(String text) {
        try {
            JsonObject r = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
            JsonElement code = r.getAsJsonObject("header").get("resultCode");
            if (code == null || !"00".equals(code.getAsString())) return null;
            JsonElement it = r.getAsJsonObject("body").getAsJsonObject("items").get("item");
            JsonArray a = it.isJsonArray() ? it.getAsJsonArray() : null;
            return a != null && a.size() > 0 ? a.get(0).getAsJsonObject() : it.isJsonObject() ? it.getAsJsonObject() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static final Pattern LAND_KEY = Pattern.compile("^(rnSt|wf)(\\d+)(Am|Pm)?$"), TA_KEY = Pattern.compile("^ta(Min|Max)(\\d+)$");

    /**
     * 순수 함수 - 육상 · 기온 응답 → 날짜별 {wfAm, wfPm, popAm, popPm, tmn, tmx}. 칸 이름은 wf4Am · rnSt8 · taMin4 처럼 "몇 일 뒤" 를 담고,
     * 그 날짜는 발표일 + N일. 칸 수가 바뀌어도(3일 뒤부터 · 10일까지) 이름으로 읽음. 모양이 다르면 null.
     */
    static JsonObject days(String landText, String taText, String tmFc) {
        JsonObject land = items(landText), ta = items(taText);
        if (land == null || ta == null) return null;
        LocalDate base = LocalDate.of(Integer.parseInt(tmFc.substring(0, 4)), Integer.parseInt(tmFc.substring(4, 6)), Integer.parseInt(tmFc.substring(6, 8)));
        Map<String, JsonObject> out = new TreeMap<>();
        for (String k : land.keySet()) {
            Matcher m = LAND_KEY.matcher(k);
            if (!m.matches() || land.get(k).isJsonNull()) continue;
            JsonObject d = out.computeIfAbsent(base.plusDays(Integer.parseInt(m.group(2))).toString(), x -> new JsonObject());
            String v = land.get(k).getAsString().trim();
            if (v.isEmpty()) continue;
            boolean wf = m.group(1).equals("wf");
            String[] halves = m.group(3) == null ? new String[] {"Am", "Pm"} : new String[] {m.group(3)};
            for (String h : halves) {
                if (wf) d.addProperty("wf" + h, v);
                else try { d.addProperty("pop" + h, Integer.parseInt(v)); } catch (NumberFormatException e) { /* 빈 값 */ }
            }
        }
        for (String k : ta.keySet()) {
            Matcher m = TA_KEY.matcher(k);
            if (!m.matches() || ta.get(k).isJsonNull()) continue;
            try {
                int v = (int) Math.round(Double.parseDouble(ta.get(k).getAsString()));
                out.computeIfAbsent(base.plusDays(Integer.parseInt(m.group(2))).toString(), x -> new JsonObject()).addProperty(m.group(1).equals("Min") ? "tmn" : "tmx", v);
            } catch (NumberFormatException e) { /* 빈 값 */ }
        }
        JsonObject o = new JsonObject();
        out.forEach((day, v) -> { if (v.has("wfAm") || v.has("tmx")) o.add(day, v); });
        return o;
    }
}
