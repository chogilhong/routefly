package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 이번 주말 날씨 좋은 산. {@code GET /api/weekend} - 중기예보 육상 구역 10곳마다 토 · 일 낮(06 ~ 18시) 날씨, 그 구역의 100대 명산.
 * 2026-10-15 홍TV님(코스 모음 /m/ 맨 위).
 *
 * <ul>
 *   <li>날짜가 단기예보 안이면 구역 대표 지점(MidServlet.CITIES 의 첫 지점) 격자의 단기예보(WeatherServlet.forecast) - 낮에 비 · 눈이 있으면 그것,
 *       없으면 하늘(맑음 · 구름많음 · 흐림) 가운데 가장 잦은 것, 강수확률은 가장 높은 값.</li>
 *   <li>그 뒤면 중기예보(MidServlet.forLand) 오전 · 오후.</li>
 *   <li>산은 정상에서 가장 가까운 대기 측정소 주소의 시도로 구역을 정함(landOfPeak).</li>
 *   <li>한 시간 담아 둠(예보 자체는 각 서블릿이 발표 시각마다 담아 둠).</li>
 *   <li>미리 채움(2026-10-15 PC: 재시작 뒤 첫 요청이 12초): 톰캣이 뜨고 1분 뒤, 그 뒤 50분마다 뒤에서 새로 만들어 둠 - 손님은 늘 담아 둔 것을 받음.</li>
 * </ul>
 * → {@code {success, dates:["2026-10-17","2026-10-18"], regions:[{code, name, days:{날짜:{word, pop, good}}, peaks:[산 id …]}]}}
 * <p>{@code ?ids=knps-1,frst-2} (찜한 코스 번호, 20개까지 - 2026-10-16 홍TV님) 를 주면 코스 시작점(DB)의 구역 {@code at:[구역 code 또는 null …]} 을 더해 줌.
 * 화면은 코스 번호만 보냄 - 이 기기의 위치는 받지 않음(개인정보처리방침).</p>
 */
@WebServlet(urlPatterns = {"/api/weekend"}, loadOnStartup = 2)
public class WeekendServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(4, 60L * 60 * 1000);
    private transient ScheduledExecutorService warm;
    static final long REFRESH_S = 50 * 60;

    private static java.nio.file.Path file() {
        return Stats.file().resolveSibling("weekend.json");
    }

    /** 남긴 파일을 담기 - 같은 주말 것이고 한 시간 안이면. 돌려줌: 몇 ms 전에 만든 것인지(못 쓰면 -1). */
    private static long fromFile(long now) {
        try {
            java.nio.file.Path f = file();
            if (!java.nio.file.Files.isRegularFile(f)) return -1;
            JsonObject o = com.google.gson.JsonParser.parseString(java.nio.file.Files.readString(f, java.nio.charset.StandardCharsets.UTF_8)).getAsJsonObject();
            long at = o.get("madeAt").getAsLong();
            String ck = weekend(LocalDate.now(WeatherServlet.KST)).toString();
            if (!ck.equals(o.get("key").getAsString()) || now - at >= 60L * 60 * 1000 || now < at) return -1;
            CACHE.put(ck, o.getAsJsonObject("data"), at);
            return now - at;
        } catch (Exception e) {
            return -1;
        }
    }

    private static void toFile(String ck, JsonObject data, long now) {
        try {
            JsonObject o = new JsonObject();
            o.addProperty("key", ck);
            o.addProperty("madeAt", now);
            o.add("data", data);
            java.nio.file.Path f = file();
            java.nio.file.Files.createDirectories(f.getParent());
            java.nio.file.Files.writeString(f, o.toString(), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            // 다음 차례에
        }
    }

    @Override
    public void init() {
        warm = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "routefly-weekend-warm");
            t.setDaemon(true);
            return t;
        });
        // 재시작 · 배포가 잦은 날 공공 API 하루 한도를 덜 쓰게(2026-10-21: 재시작마다 산 100곳을 다시 물어 한도를 다 씀) -
        // 파일에 남긴 것이 50분 안이면 그것부터 쓰고, 새로 만드는 것은 그 50분이 찼을 때
        long age = fromFile(System.currentTimeMillis());
        long first = age < 0 ? 60 : Math.max(60, REFRESH_S - age / 1000);
        warm.scheduleWithFixedDelay(() -> {
            try {
                current(true);
            } catch (Exception e) {
                // 다음 차례에 다시
            }
        }, first, REFRESH_S, TimeUnit.SECONDS);
    }

    @Override
    public void destroy() {
        if (warm != null) warm.shutdownNow();
    }

    /** 지금 주말 추천 - 담아 둔 것, 없으면(또는 refresh) 새로 만듦. 키가 없거나 못 만들면 null. */
    private JsonObject current(boolean refresh) {
        String key = RouteflyConfig.get("weather.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        List<LocalDate> dates = weekend(LocalDate.now(WeatherServlet.KST));
        String ck = dates.toString();
        long now = System.currentTimeMillis();
        JsonObject out = refresh ? null : CACHE.get(ck, now);
        if (out == null && key != null) {
            out = build(key, dates, peaks());
            if (out.getAsJsonArray("regions").size() > 0) { CACHE.put(ck, out, now); toFile(ck, out, now); }
            else if (refresh) out = CACHE.get(ck, now);   // 새로 못 만들면 담아 둔 것 그대로
        }
        return out;
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        JsonObject out = current(false);
        if (out == null || out.getAsJsonArray("regions").size() == 0) {
            JsonObject u = new JsonObject();
            u.addProperty("success", true);
            u.addProperty("unavailable", true);
            Json.write(resp, HttpServletResponse.SC_OK, u, false);
            return;
        }
        String ids = req.getParameter("ids");
        if (ids != null && !ids.isBlank()) {   // 찜한 코스마다 구역 - 응답을 고치지 않게 사본에
            out = out.deepCopy();
            out.add("at", regionsOf(parseIds(ids)));
        }
        Json.ok(req, resp, out);
    }

    /** 순수 함수 - "knps-1,frst-2" → 코스 번호들(20개까지, 영숫자 · - _ . 만 - 아니면 null 자리). */
    static List<String> parseIds(String s) {
        List<String> out = new ArrayList<>();
        for (String part : s.split(",")) {
            if (out.size() >= 20) break;
            String id = part.trim();
            out.add(id.matches("[A-Za-z0-9_.-]{1,80}") ? id : null);
        }
        return out;
    }

    /** 코스마다 시작점의 구역 code(코스가 없거나 DB 가 안 되면 null). */
    private static JsonArray regionsOf(List<String> ids) {
        java.util.Map<String, double[]> at = new java.util.HashMap<>();
        List<String> ok = new ArrayList<>();
        for (String id : ids) if (id != null) ok.add(id);
        if (!ok.isEmpty()) {
            try (java.sql.Connection c = Db.open();
                 java.sql.PreparedStatement ps = c.prepareStatement("SELECT course_id, start_lat, start_lon FROM route_course WHERE course_id IN ("
                         + String.join(",", java.util.Collections.nCopies(ok.size(), "?")) + ") AND start_lat IS NOT NULL")) {
                for (int i = 0; i < ok.size(); i++) ps.setString(i + 1, ok.get(i));
                try (java.sql.ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) at.put(rs.getString(1), new double[] {rs.getDouble(2), rs.getDouble(3)});
                }
            } catch (Exception e) {
                // 구역 없이 - 화면은 날씨를 안 붙임
            }
        }
        JsonArray out = new JsonArray();
        for (String id : ids) {
            double[] p = id == null ? null : at.get(id);
            out.add(p == null ? null : landOfPeak(p[0], p[1]));
        }
        return out;
    }

    /** 순수 함수 - 다가오는 토 · 일(오늘이 토요일이면 오늘 · 내일, 일요일이면 오늘만). */
    static List<LocalDate> weekend(LocalDate today) {
        List<LocalDate> out = new ArrayList<>();
        if (today.getDayOfWeek() == DayOfWeek.SUNDAY) {
            out.add(today);
            return out;
        }
        LocalDate sat = today.plusDays((DayOfWeek.SATURDAY.getValue() - today.getDayOfWeek().getValue() + 7) % 7);
        out.add(sat);
        out.add(sat.plusDays(1));
        return out;
    }

    private JsonArray peaks() {
        try (InputStream in = getServletContext().getResourceAsStream("/data/mountains100.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            return e != null && e.isJsonObject() && e.getAsJsonObject().has("peaks") ? e.getAsJsonObject().getAsJsonArray("peaks") : new JsonArray();
        } catch (Exception e) {
            return new JsonArray();
        }
    }

    private static JsonObject build(String key, List<LocalDate> dates, JsonArray peaks) {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        JsonArray ds = new JsonArray();
        dates.forEach(d -> ds.add(d.toString()));
        out.add("dates", ds);
        JsonArray regions = new JsonArray();
        for (String[] l : MidServlet.LAND) {
            Object[] city = null;
            for (Object[] c : MidServlet.CITIES) if (c[4].equals(l[0])) { city = c; break; }
            if (city == null) continue;
            JsonObject shortFc = WeatherServlet.forecast((Double) city[2], (Double) city[3]);
            JsonObject mid = null;
            JsonObject days = new JsonObject();
            for (LocalDate d : dates) {
                JsonObject day = shortDay(shortFc, d.toString());
                if (day == null) {
                    if (mid == null) mid = MidServlet.forLand(key, l[0], city);
                    day = midDay(mid, d.toString());
                }
                if (day != null) days.add(d.toString(), day);
            }
            if (days.size() == 0) continue;
            JsonObject r = new JsonObject();
            r.addProperty("code", l[0]);
            r.addProperty("name", l[1]);
            r.add("days", days);
            JsonArray ps = new JsonArray();
            for (JsonElement e : peaks) {
                JsonObject p = e.getAsJsonObject();
                if (!p.has("lat") || !p.has("lon")) continue;
                if (l[0].equals(landOfPeak(p.get("lat").getAsDouble(), p.get("lon").getAsDouble()))) ps.add(p.has("id") ? p.get("id").getAsString() : p.get("name").getAsString());
            }
            r.add("peaks", ps);
            regions.add(r);
        }
        out.add("regions", regions);
        return out;
    }

    /**
     * 산의 중기 구역 - 가장 가까운 대기 측정소 주소의 시도(AirServlet.regionNear → MidServlet.landOf), 측정소 목록이 없으면 가장 가까운 기온 지점의 구역.
     * 2026-10-15 PC: 가까운 기온 지점만으로는 성인봉(울릉 · 경북)이 강원 영동, 월악산 · 금수산(충북)이 강원 영서로 갔음.
     */
    static String landOfPeak(double lat, double lon) {
        String land = MidServlet.landOf(AirServlet.regionNear(lat, lon));
        if (land != null) return land;
        Object[] near = MidServlet.city(lat, lon, null);
        return near == null ? null : (String) near[4];
    }

    /** 순수 함수 - 단기예보(WeatherServlet 응답)의 그 날 06 ~ 18시 → {word, pop, good}. 그 날 낮 자료가 없으면 null. */
    static JsonObject shortDay(JsonObject fc, String date) {
        if (fc == null || !fc.has("hours")) return null;
        int[] sky = new int[5];
        int pty = 0, pop = 0, n = 0;
        for (JsonElement e : fc.getAsJsonArray("hours")) {
            JsonObject h = e.getAsJsonObject();
            String t = h.get("t").getAsString();
            if (!t.startsWith(date)) continue;
            int hh = Integer.parseInt(t.substring(11, 13));
            if (hh < 6 || hh > 18) continue;
            n++;
            if (h.has("sky") && !h.get("sky").isJsonNull()) { int s = h.get("sky").getAsInt(); if (s >= 1 && s <= 4) sky[s]++; }
            if (h.has("pty") && !h.get("pty").isJsonNull()) { int p = h.get("pty").getAsInt(); if (p > 0 && (pty == 0 || p == 3)) pty = p; }
            if (h.has("pop") && !h.get("pop").isJsonNull()) pop = Math.max(pop, h.get("pop").getAsInt());
        }
        if (n < 4) return null;   // 낮 자료가 거의 없음(단기예보 끝 날)
        String word = pty == 3 ? "눈" : pty > 0 ? "비" : sky[1] >= sky[3] && sky[1] >= sky[4] ? "맑음" : sky[3] >= sky[4] ? "구름많음" : "흐림";
        return day(word, pop);
    }

    /** 순수 함수 - 중기예보(MidServlet 응답)의 그 날 → {word, pop, good}. 없으면 null. */
    static JsonObject midDay(JsonObject mid, String date) {
        if (mid == null || !mid.has("days") || !mid.getAsJsonObject("days").has(date)) return null;
        JsonObject d = mid.getAsJsonObject("days").getAsJsonObject(date);
        String am = d.has("wfAm") ? d.get("wfAm").getAsString() : null, pm = d.has("wfPm") ? d.get("wfPm").getAsString() : null;
        if (am == null && pm == null) return null;
        String word = am == null ? pm : pm == null || am.equals(pm) ? am : am + " → " + pm;
        int pop = Math.max(d.has("popAm") ? d.get("popAm").getAsInt() : 0, d.has("popPm") ? d.get("popPm").getAsInt() : 0);
        return day(word, pop);
    }

    /** 순수 함수 - 좋은 날: 비 · 눈 · 흐림이 없고 강수확률 30% 이하. */
    static JsonObject day(String word, int pop) {
        JsonObject o = new JsonObject();
        o.addProperty("word", word);
        o.addProperty("pop", pop);
        o.addProperty("good", pop <= 30 && !word.matches(".*(비|눈|흐림|흐리).*"));
        return o;
    }
}
