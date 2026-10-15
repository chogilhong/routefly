package com.gh.routefly.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
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
 * 이번 주말 날씨 좋은 산. {@code GET /api/weekend} - 중기예보 육상 구역 10곳마다 토 · 일 낮(06 ~ 18시) 날씨, 그 구역의 100대 명산.
 * 2026-10-15 홍TV님(코스 모음 /m/ 맨 위).
 *
 * <ul>
 *   <li>날짜가 단기예보 안이면 구역 대표 지점(MidServlet.CITIES 의 첫 지점) 격자의 단기예보(WeatherServlet.forecast) - 낮에 비 · 눈이 있으면 그것,
 *       없으면 하늘(맑음 · 구름많음 · 흐림) 가운데 가장 잦은 것, 강수확률은 가장 높은 값.</li>
 *   <li>그 뒤면 중기예보(MidServlet.forLand) 오전 · 오후.</li>
 *   <li>산은 정상에서 가장 가까운 기온 지점의 구역으로 나눔(어림 - 구역 경계의 산은 옆 구역일 수 있음).</li>
 *   <li>한 시간 담아 둠(예보 자체는 각 서블릿이 발표 시각마다 담아 둠).</li>
 * </ul>
 * → {@code {success, dates:["2026-10-17","2026-10-18"], regions:[{code, name, days:{날짜:{word, pop, good}}, peaks:[산 id …]}]}}
 */
@WebServlet(urlPatterns = {"/api/weekend"})
public class WeekendServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(4, 60L * 60 * 1000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String key = RouteflyConfig.get("weather.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        LocalDate today = LocalDate.now(WeatherServlet.KST);
        List<LocalDate> dates = weekend(today);
        String ck = dates.toString();
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(ck, now);
        if (out == null && key != null) {
            out = build(key, dates, peaks());
            if (out.getAsJsonArray("regions").size() > 0) CACHE.put(ck, out, now);
        }
        if (out == null || out.getAsJsonArray("regions").size() == 0) {
            JsonObject u = new JsonObject();
            u.addProperty("success", true);
            u.addProperty("unavailable", true);
            Json.write(resp, HttpServletResponse.SC_OK, u, false);
            return;
        }
        Json.ok(req, resp, out);
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
                Object[] near = MidServlet.city(p.get("lat").getAsDouble(), p.get("lon").getAsDouble(), null);
                if (near != null && l[0].equals(near[4])) ps.add(p.has("id") ? p.get("id").getAsString() : p.get("name").getAsString());
            }
            r.add("peaks", ps);
            regions.add(r);
        }
        out.add("regions", regions);
        return out;
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
