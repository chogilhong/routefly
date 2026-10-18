package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 공휴일(🧰 별거 별거 - 2026-10-18 홍TV님). {@code GET /api/holiday?year=2026}
 * 한국천문연구원 특일 정보(공공데이터포털 SpcdeInfoService getRestDeInfo) - 대체공휴일 · 임시공휴일까지.
 *
 * <ul>
 *   <li>인증키 {@code holiday.serviceKey}, 없으면 {@code tour.serviceKey}(공공데이터포털 개인 키는 같고 활용 신청만 따로).</li>
 *   <li>달마다 한 번씩 12번 묻고 해마다 12시간 담아 둠. 키가 없거나 다 실패하면 {@code {success:true, days:[], unavailable:true}}.</li>
 * </ul>
 * → {@code {success, year, days:[{date:"2026-10-03", name:"개천절"}], source:"한국천문연구원"}} (날짜 차례)
 */
@WebServlet(urlPatterns = {"/api/holiday"})
public class HolidayServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String DEFAULT_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(20, 12L * 60 * 60 * 1000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        int now = LocalDate.now(WeatherServlet.KST).getYear(), y;
        try { y = Integer.parseInt(String.valueOf(req.getParameter("year")).trim()); } catch (NumberFormatException e) { y = now; }
        if (y < now - 1 || y > now + 2) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "year 는 작년 ~ 2년 뒤입니다.");
            return;
        }
        Json.ok(req, resp, year(y));
    }

    static JsonObject year(int y) {
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(String.valueOf(y), now);
        if (out == null) {
            out = fetch(y);
            if (!out.has("unavailable")) CACHE.put(String.valueOf(y), out, now);
        }
        return out;
    }

    private static JsonObject fetch(int y) {
        String key = RouteflyConfig.get("holiday.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        if (key == null) return unavailable(y);
        String u = RouteflyConfig.get("holiday.url");
        JsonArray days = new JsonArray();
        int ok = 0;
        for (int m = 1; m <= 12; m++) {
            String text = OpenApi.get(url(u != null ? u : DEFAULT_URL, key, y, m), "HOLIDAY");
            JsonArray d = text == null ? null : items(text);
            if (d == null) { if (text != null) OpenApi.warn("HOLIDAY", text); continue; }
            ok++;
            d.forEach(days::add);
        }
        if (ok < 12) return unavailable(y);   // 한 달이라도 빠지면 틀린 목록이 되므로 다음에 다시
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.addProperty("year", y);
        out.add("days", days);
        out.addProperty("source", "한국천문연구원");
        return out;
    }

    private static JsonObject unavailable(int y) {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.addProperty("year", y);
        out.add("days", new JsonArray());
        out.addProperty("unavailable", true);
        return out;
    }

    static String url(String base, String key, int y, int m) {
        return base + "?serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8) + "&solYear=" + y + "&solMonth=" + String.format("%02d", m) + "&numOfRows=50&_type=json";
    }

    /**
     * 순수 함수 - 특일 정보 JSON → [{date, name}] (isHoliday Y 만). 그 달에 공휴일이 없으면 빈 배열(items 가 "" 로 옴),
     * 공휴일이 하나면 item 이 배열이 아니라 객체로 옴. 모양이 다르거나 resultCode 가 00 이 아니면 null.
     */
    static JsonArray items(String text) {
        try {
            JsonObject res = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
            JsonObject head = res.getAsJsonObject("header");
            if (head == null || !"00".equals(head.get("resultCode").getAsString())) return null;
            JsonArray out = new JsonArray();
            JsonElement items = res.getAsJsonObject("body").get("items");
            if (items == null || !items.isJsonObject()) return out;
            JsonElement it = items.getAsJsonObject().get("item");
            JsonArray list = it == null ? new JsonArray() : it.isJsonArray() ? it.getAsJsonArray() : new JsonArray();
            if (it != null && it.isJsonObject()) list.add(it);
            for (JsonElement e : list) {
                JsonObject o = e.getAsJsonObject();
                if (o.has("isHoliday") && !"Y".equals(o.get("isHoliday").getAsString())) continue;
                String d = o.get("locdate").getAsString();
                if (!d.matches("\\d{8}")) continue;
                JsonObject x = new JsonObject();
                x.addProperty("date", d.substring(0, 4) + "-" + d.substring(4, 6) + "-" + d.substring(6, 8));
                x.addProperty("name", o.get("dateName").getAsString().trim());
                out.add(x);
            }
            return out;
        } catch (RuntimeException e) {
            return null;
        }
    }
}
