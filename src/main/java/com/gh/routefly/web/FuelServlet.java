package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 기름값(🧰 별거 별거 - 2026-10-18 홍TV님). {@code GET /api/fuel?prod=B027&sido=01} - 한국석유공사 오피넷 무료 API.
 *
 * <ul>
 *   <li>avgAllPrice(전국 평균 · 전날 대비) · avgSidoPrice(시도별 평균) · lowTop10(그 시도 싼 주유소 10곳). 시도를 안 주면 싼 곳은 빼고.</li>
 *   <li>인증키 {@code opinet.key}(오피넷에서 따로 받음). 없거나 실패하면 {@code {success:true, unavailable:true}}. 1시간 담아 둠.</li>
 *   <li>prod: B027 보통휘발유 · D047 자동차용경유 · B034 고급휘발유 · C004 실내등유 · K015 자동차용부탄(LPG).</li>
 * </ul>
 * → {@code {success, date, national:[{prod, name, price, diff}], sido:[{code, name, price}], low:[{name, brand, price, addr}], source:"오피넷"}}
 */
@WebServlet(urlPatterns = {"/api/fuel"})
public class FuelServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String DEFAULT_URL = "https://www.opinet.co.kr/api/";
    static final Map<String, String> PRODS = Map.of("B027", "보통휘발유", "D047", "자동차용경유", "B034", "고급휘발유", "C004", "실내등유", "K015", "자동차용부탄");
    /** 상표(POLL_DIV_CD) - 모르는 코드는 그대로. */
    static final Map<String, String> BRANDS = Map.ofEntries(Map.entry("SKE", "SK에너지"), Map.entry("GSC", "GS칼텍스"), Map.entry("HDO", "HD현대오일뱅크"),
            Map.entry("SOL", "S-OIL"), Map.entry("RTO", "알뜰(자영)"), Map.entry("RTX", "알뜰(고속도로)"), Map.entry("NHO", "알뜰(농협)"), Map.entry("ETC", "자가상표"),
            Map.entry("E1G", "E1"), Map.entry("SKG", "SK가스"));
    private static final OpenApi.Cache<JsonArray> CACHE = new OpenApi.Cache<>(100, 60L * 60 * 1000);
    /** 못 받은 호출은 10분 동안 다시 묻지 않음(빈 배열로 표시 - HolidayServlet 과 같은 까닭). */
    private static final OpenApi.Cache<Boolean> FAILED = new OpenApi.Cache<>(100, 10L * 60 * 1000);

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String prod = req.getParameter("prod") == null ? "B027" : req.getParameter("prod");
        String sido = req.getParameter("sido");
        if (!PRODS.containsKey(prod) || (sido != null && !sido.isEmpty() && !sido.matches("\\d{2}"))) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "prod · sido 를 확인해 주세요.");
            return;
        }
        String key = RouteflyConfig.get("opinet.key");
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        if (key == null) { out.addProperty("unavailable", true); Json.ok(req, resp, out); return; }
        JsonArray national = call("avgAllPrice.do", "", key), sidoAvg = call("avgSidoPrice.do", "&prodcd=" + prod, key);
        if (national == null && sidoAvg == null) { out.addProperty("unavailable", true); Json.ok(req, resp, out); return; }
        JsonArray nat = new JsonArray();
        String date = null;
        if (national != null) for (JsonElement e : national) {
            JsonObject o = e.getAsJsonObject(), x = new JsonObject();
            x.addProperty("prod", s(o, "PRODCD"));
            x.addProperty("name", s(o, "PRODNM"));
            x.addProperty("price", num(o, "PRICE"));
            x.addProperty("diff", num(o, "DIFF"));
            if (date == null) date = ymd(s(o, "TRADE_DT"));
            nat.add(x);
        }
        JsonArray sd = new JsonArray();
        if (sidoAvg != null) for (JsonElement e : sidoAvg) {
            JsonObject o = e.getAsJsonObject(), x = new JsonObject();
            x.addProperty("code", s(o, "SIDOCD"));
            x.addProperty("name", s(o, "SIDONM"));
            x.addProperty("price", num(o, "PRICE"));
            sd.add(x);
        }
        out.addProperty("prod", prod);
        if (date != null) out.addProperty("date", date);
        out.add("national", nat);
        out.add("sido", sd);
        if (sido != null && !sido.isEmpty()) {
            JsonArray low = call("lowTop10.do", "&prodcd=" + prod + "&area=" + sido + "&cnt=10", key), lw = new JsonArray();
            if (low != null) for (JsonElement e : low) {
                JsonObject o = e.getAsJsonObject(), x = new JsonObject();
                x.addProperty("name", s(o, "OS_NM"));
                String b = s(o, "POLL_DIV_CD");
                x.addProperty("brand", b == null ? null : BRANDS.getOrDefault(b, b));
                x.addProperty("price", num(o, "PRICE"));
                x.addProperty("addr", s(o, "NEW_ADR") != null ? s(o, "NEW_ADR") : s(o, "VAN_ADR"));
                lw.add(x);
            }
            out.add("low", lw);
        }
        out.addProperty("source", "오피넷");
        Json.ok(req, resp, out);
    }

    private static JsonArray call(String what, String query, String key) {
        String k = what + query;
        long now = System.currentTimeMillis();
        JsonArray hit = CACHE.get(k, now);
        if (hit != null) return hit;
        if (FAILED.get(k, now) != null) return null;
        String u = RouteflyConfig.get("opinet.url");
        String text = OpenApi.get(url(u != null ? u : DEFAULT_URL, what, query, key), "FUEL");
        JsonArray a = text == null ? null : oil(text);
        if (a == null && text != null) OpenApi.warn("FUEL", text);
        if (a != null) CACHE.put(k, a, now);
        else FAILED.put(k, Boolean.TRUE, now);
        return a;
    }

    static String url(String base, String what, String query, String key) {
        return base + what + "?out=json&code=" + URLEncoder.encode(key, StandardCharsets.UTF_8) + query;
    }

    /** 순수 함수 - 오피넷 응답 {"RESULT":{"OIL":[…]}} → OIL 배열. 모양이 다르면 null. */
    static JsonArray oil(String text) {
        try {
            JsonElement o = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("RESULT").get("OIL");
            return o != null && o.isJsonArray() ? o.getAsJsonArray() : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static String s(JsonObject o, String k) {
        JsonElement e = o.get(k);
        if (e == null || e.isJsonNull()) return null;
        String v = e.getAsString().trim();
        return v.isEmpty() ? null : v;
    }

    /** 순수 함수 - 값(글 "1,689.53" · "+0.52" 또는 숫자) → 숫자, 못 읽으면 null. */
    static Double num(JsonObject o, String k) {
        String v = s(o, k);
        if (v == null) return null;
        try { return Double.parseDouble(v.replace(",", "").replace("+", "")); } catch (NumberFormatException e) { return null; }
    }

    /** 순수 함수 - "20261018" → "2026-10-18". */
    static String ymd(String d) {
        return d != null && d.matches("\\d{8}") ? d.substring(0, 4) + "-" + d.substring(4, 6) + "-" + d.substring(6, 8) : d;
    }
}
