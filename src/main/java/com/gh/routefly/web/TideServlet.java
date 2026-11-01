package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 물때(🧰 별거 별거 - 2026-10-18 홍TV님). {@code GET /api/tide?obs=DT_0018&date=2026-10-18}
 * 해양수산부 국립해양조사원_조석예보(고, 저조) - 공공데이터포털 15156018, GetTideFcstHghLwApiService(PC 조사 2026-10-18).
 *
 * <ul>
 *   <li>인증키 {@code tide.serviceKey}, 없으면 {@code tour.serviceKey}(같은 개인 키, 이 서비스만 활용 신청 따로).</li>
 *   <li>지점 · 날짜마다 6시간 담아 둠, 못 받으면 10분. date 는 오늘 ~ 30일 뒤(기본 오늘).</li>
 *   <li>extrSe 극치 구분: 1 오전 고조 · 2 오전 저조 · 3 오후 고조 · 4 오후 저조.</li>
 * </ul>
 * → {@code {success, obs, name, date, tides:[{t:"예측 일시(받은 그대로)", cm, high(true 고조)}], source:"국립해양조사원"}}
 */
@WebServlet(urlPatterns = {"/api/tide"})
public class TideServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String DEFAULT_URL = "https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService";
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(300, 6L * 60 * 60 * 1000);
    private static final OpenApi.Cache<JsonObject> FAILED = new OpenApi.Cache<>(300, 10L * 60 * 1000);
    /** 기억에 없어 바깥에 새로 묻는 횟수 상한 - 주소마다 한 시간 60번, 하루 2,000번(설정 quota.tide.ip · .day, 2026-11-01 점검: 아무 지점 번호나 넣어 하루 한도를 쓸 수 있었음). */
    private static final OutQuota QUOTA = OutQuota.of("tide", 60, 2000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String obs = req.getParameter("obs");
        LocalDate today = LocalDate.now(WeatherServlet.KST), d;
        try { d = req.getParameter("date") == null ? today : LocalDate.parse(req.getParameter("date")); } catch (RuntimeException e) { d = null; }
        if (obs == null || !obs.matches("[A-Z]{2}_\\d{4}") || d == null || d.isBefore(today.minusDays(1)) || d.isAfter(today.plusDays(30))) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "obs(예: DT_0018) · date(오늘 ~ 30일 뒤)를 확인해 주세요.");
            return;
        }
        String k = obs + "@" + d;
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(k, now);
        if (out == null) out = FAILED.get(k, now);
        if (out == null) {
            String ip = SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For"));
            if (QUOTA.allow(ip, now)) {
                out = fetch(obs, d);
                (out.has("unavailable") ? FAILED : CACHE).put(k, out, now);
            } else {   // 상한 - 이 요청만 못 받음(기억하지 않음)
                out = new JsonObject();
                out.addProperty("success", true);
                out.addProperty("obs", obs);
                out.addProperty("date", d.toString());
                out.addProperty("unavailable", true);
            }
        }
        Json.ok(req, resp, out);
    }

    private static JsonObject fetch(String obs, LocalDate d) {
        String key = RouteflyConfig.get("tide.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.addProperty("obs", obs);
        out.addProperty("date", d.toString());
        if (key == null) { out.addProperty("unavailable", true); return out; }
        String u = RouteflyConfig.get("tide.url");
        String text = OpenApi.get(url(u != null ? u : DEFAULT_URL, key, obs, d), "TIDE");
        JsonObject p = text == null ? null : parse(text);
        if (p == null) {
            if (text != null) OpenApi.warn("TIDE", text);
            out.addProperty("unavailable", true);
            return out;
        }
        if (p.has("name")) out.add("name", p.get("name"));
        out.add("tides", p.get("tides"));
        out.addProperty("source", "국립해양조사원");
        return out;
    }

    static String url(String base, String key, String obs, LocalDate d) {
        return base + "?serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8) + "&obsCode=" + obs + "&reqDate=" + d.format(DateTimeFormatter.BASIC_ISO_DATE)
                + "&type=json&pageNo=1&numOfRows=20";
    }

    /**
     * 순수 함수 - 조석예보(고, 저조) JSON → {name, tides:[{t, cm, high}]}. 바깥이 {response:{header, body}} 이든 {header, body} 이든,
     * item 이 배열이든 하나(객체)든. resultCode 가 00 이 아니거나 모양이 다르면 null. 자료 없음(3)은 빈 tides.
     */
    static JsonObject parse(String text) {
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            if (root.has("response")) root = root.getAsJsonObject("response");
            JsonObject head = root.getAsJsonObject("header");
            String code = head == null ? null : head.get("resultCode").getAsString().trim();
            JsonObject out = new JsonObject();
            JsonArray tides = new JsonArray();
            out.add("tides", tides);
            if ("3".equals(code) || "03".equals(code)) return out;
            if (!"00".equals(code) && !"0".equals(code)) return null;
            JsonElement items = root.getAsJsonObject("body").get("items");
            if (items == null || !items.isJsonObject()) return out;
            JsonElement it = items.getAsJsonObject().get("item");
            JsonArray list = it != null && it.isJsonArray() ? it.getAsJsonArray() : new JsonArray();
            if (it != null && it.isJsonObject()) list.add(it);
            for (JsonElement e : list) {
                JsonObject o = e.getAsJsonObject(), x = new JsonObject();
                if (!out.has("name") && o.has("obsvtrNm")) out.addProperty("name", o.get("obsvtrNm").getAsString().trim());
                String se = o.has("extrSe") ? o.get("extrSe").getAsString().trim() : "";
                x.addProperty("t", o.get("predcDt").getAsString().trim());
                try { x.addProperty("cm", Double.parseDouble(o.get("predcTdlvVl").getAsString().trim())); } catch (RuntimeException ex) { x.add("cm", null); }
                x.addProperty("high", "1".equals(se) || "3".equals(se));
                tides.add(x);
            }
            return out;
        } catch (RuntimeException e) {
            return null;
        }
    }
}
