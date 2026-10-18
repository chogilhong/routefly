package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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
 * 🛟 오늘의 산행 안전(2026-10-18 홍TV님 추천). {@code GET /api/safety?lat=37.56&lon=126.97}
 * <ul>
 *   <li>가까운 응급실 - 국립중앙의료원 ErmctInfoInqireService getEgytLcinfoInqire(XML, 가까운 순, distance km). 첫 병원 주소의 맨 앞 낱말로 시도를 앎.</li>
 *   <li>산불위험 - 산림청 국립산림과학원 forestPointV2 forestPointListSidoSearchV2(시도별 d1 ~ d4 = 낮음 · 다소높음 · 높음 · 매우높음 면적 비율 %).</li>
 *   <li>자외선 - 기상청 LivingWthrIdxServiceV5 getUVIdxV5(areaNo = 시도 코드 + 0 여덟, time = 06 · 18시 발표, h0 ~ h75 = 발표부터 3시간 간격).</li>
 *   <li>기상특보 - 기상청 WthrWrnInfoService getPwnStatus(t6 = 지금 발효 중인 특보 "o 강풍주의보 : 강원도(…), 인천 …" 줄들).</li>
 * </ul>
 * 키는 safety.serviceKey(없으면 tour.serviceKey - 같은 개인 키, 서비스마다 활용 신청). 실제 응답 모양은 SafetyApiProbe → src/test/resources/safety/(2026-10-18).
 * 부분마다 못 받으면 그 칸만 빠짐. → {@code {success, sido, er:[…], fire:{…}, uv:{…}, warn:{tm, lines:[{type, mine}]}}}
 */
@WebServlet(urlPatterns = {"/api/safety"})
public class SafetyServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static final String ER_URL = "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEgytLcinfoInqire";
    static final String FIRE_URL = "https://apis.data.go.kr/1400377/forestPointV2/forestPointListSidoSearchV2";
    static final String UV_URL = "https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5";
    static final String WARN_URL = "https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus";
    private static final OpenApi.Cache<Object> CACHE = new OpenApi.Cache<>(400, 60L * 60 * 1000);
    private static final OpenApi.Cache<Object> SHORT = new OpenApi.Cache<>(50, 10L * 60 * 1000);   // 특보 · 못 받은 것

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        double[] at = StaysServlet.parse(req.getParameter("lat"), req.getParameter("lon"));
        if (at == null) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "lat · lon 은 우리나라 안 좌표입니다.");
            return;
        }
        String key = RouteflyConfig.get("safety.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        if (key == null) { out.addProperty("unavailable", true); Json.ok(req, resp, out); return; }
        String k = URLEncoder.encode(key, StandardCharsets.UTF_8);

        JsonArray er = (JsonArray) cached("er@" + String.format(Locale.ROOT, "%.2f,%.2f", at[0], at[1]), CACHE, () -> {
            String t = OpenApi.get(ER_URL + "?serviceKey=" + k + String.format(Locale.ROOT, "&WGS84_LON=%.5f&WGS84_LAT=%.5f", at[1], at[0]) + "&pageNo=1&numOfRows=3", "SAFETY-ER");
            return t == null ? null : er(t);
        });
        String sido = er != null && er.size() > 0 ? sido(er.get(0).getAsJsonObject().get("addr").getAsString()) : null;
        if (er != null) out.add("er", er);
        if (sido != null) out.addProperty("sido", sido);

        JsonArray fires = (JsonArray) cached("fire", CACHE, () -> {
            String t = OpenApi.get(FIRE_URL + "?serviceKey=" + k + "&pageNo=1&numOfRows=30&_type=json", "SAFETY-FIRE");
            return t == null ? null : fire(t);
        });
        JsonObject f = sido == null || fires == null ? null : pickFire(fires, sido);
        if (f != null) out.add("fire", f);

        if (f != null && f.has("code")) {
            String area = f.get("code").getAsString() + "00000000";
            String[] tm = uvTime(LocalDateTime.now(WeatherServlet.KST));
            JsonObject uv = (JsonObject) cached("uv@" + area + tm[0], CACHE, () -> {
                String t = OpenApi.get(UV_URL + "?serviceKey=" + k + "&pageNo=1&numOfRows=10&dataType=JSON&areaNo=" + area + "&time=" + tm[0], "SAFETY-UV");
                return t == null ? null : uv(t);
            });
            if (uv != null) out.add("uv", uv);
        }

        JsonObject warn = (JsonObject) cached("warn", SHORT, () -> {
            String t = OpenApi.get(WARN_URL + "?serviceKey=" + k + "&pageNo=1&numOfRows=10&dataType=JSON", "SAFETY-WARN");
            return t == null ? null : warn(t);
        });
        if (warn != null) out.add("warn", mark(warn, sido));
        out.addProperty("source", "국립중앙의료원 · 산림청 · 기상청");
        Json.ok(req, resp, out);
    }

    private interface Fetch { Object get(); }

    /** 받은 것은 cache 에, 못 받은 것은 10분(SHORT - 같은 실패를 되풀이하지 않게) 기억. 못 받았으면 null. */
    private static Object cached(String key, OpenApi.Cache<Object> cache, Fetch f) {
        long now = System.currentTimeMillis();
        Object hit = cache.get(key, now);
        if (hit != null) return hit;
        if (SHORT.get("x@" + key, now) != null) return null;
        Object v = f.get();
        if (v != null) cache.put(key, v, now);
        else SHORT.put("x@" + key, Boolean.TRUE, now);
        return v;
    }

    private static String tag(String xml, String name) {
        Matcher m = Pattern.compile("<" + name + ">([^<]*)</" + name + ">").matcher(xml);
        return m.find() ? m.group(1).trim() : null;
    }

    /** 순수 함수 - 응급실 XML → [{name, addr, tel, km, lat, lon, kind}] (가까운 순 그대로). resultCode 00 이 아니면 null. */
    static JsonArray er(String xml) {
        if (!"00".equals(tag(xml, "resultCode"))) return null;
        JsonArray out = new JsonArray();
        Matcher m = Pattern.compile("<item>(.*?)</item>", Pattern.DOTALL).matcher(xml);
        while (m.find()) {
            String it = m.group(1), name = tag(it, "dutyName"), addr = tag(it, "dutyAddr");
            if (name == null || addr == null) continue;
            JsonObject o = new JsonObject();
            o.addProperty("name", name);
            o.addProperty("addr", addr);
            o.addProperty("tel", tag(it, "dutyTel1"));
            o.addProperty("kind", tag(it, "dutyDivName"));
            try { o.addProperty("km", Double.parseDouble(tag(it, "distance"))); } catch (RuntimeException e) { /* 없음 */ }
            try { o.addProperty("lat", Double.parseDouble(tag(it, "latitude"))); o.addProperty("lon", Double.parseDouble(tag(it, "longitude"))); } catch (RuntimeException e) { /* 없음 */ }
            out.add(o);
        }
        return out;
    }

    /** 순수 함수 - 주소의 맨 앞 낱말(시도) "서울특별시 종로구 …" → "서울특별시". */
    static String sido(String addr) {
        if (addr == null) return null;
        String s = addr.trim();
        int i = s.indexOf(' ');
        return i > 0 ? s.substring(0, i) : s.isEmpty() ? null : s;
    }

    /** 순수 함수 - 시도 이름 → 두 글자 줄임(서울 · 강원 · 전남 …). 전라남도 · 전남광주통합특별시는 "전남", 광주광역시는 "광주". */
    static String shortSido(String s) {
        if (s == null || s.length() < 2) return s;
        if (s.startsWith("전라남") || s.startsWith("전남")) return "전남";
        if (s.startsWith("전라북") || s.startsWith("전북")) return "전북";
        if (s.startsWith("충청남") || s.startsWith("충남")) return "충남";
        if (s.startsWith("충청북") || s.startsWith("충북")) return "충북";
        if (s.startsWith("경상남") || s.startsWith("경남")) return "경남";
        if (s.startsWith("경상북") || s.startsWith("경북")) return "경북";
        return s.substring(0, 2);
    }

    /** 순수 함수 - 산불위험 시도 목록 JSON → [{name, code, d1..d4, meanavg, maxi, date}]. 모양이 다르면 null. */
    static JsonArray fire(String text) {
        try {
            JsonObject res = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
            if (!"00".equals(res.getAsJsonObject("header").get("resultCode").getAsString())) return null;
            JsonElement it = res.getAsJsonObject("body").getAsJsonObject("items").get("item");
            JsonArray list = it.isJsonArray() ? it.getAsJsonArray() : new JsonArray();
            if (it.isJsonObject()) list.add(it);
            JsonArray out = new JsonArray();
            for (JsonElement e : list) {
                JsonObject o = e.getAsJsonObject(), x = new JsonObject();
                x.addProperty("name", o.get("doname").getAsString().trim());
                x.addProperty("code", o.get("regioncode").getAsString().trim());
                for (String d : new String[] {"d1", "d2", "d3", "d4", "meanavg", "maxi"}) if (o.has(d)) x.addProperty(d, o.get(d).getAsDouble());
                if (o.has("analdate")) x.addProperty("date", o.get("analdate").getAsString().trim());
                out.add(x);
            }
            return out;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * 순수 함수 - 시도에 맞는 산불위험 + 단계(level 0 낮음 · 1 다소높음 · 2 높음 · 3 매우높음 = 면적이 1% 라도 있는 가장 높은 단계).
     * 광주광역시 · 전라남도 주소는 전남광주통합특별시(2026)로도 찾음.
     */
    static JsonObject pickFire(JsonArray fires, String sido) {
        String s = shortSido(sido);
        for (JsonElement e : fires) {
            JsonObject o = e.getAsJsonObject();
            String n = o.get("name").getAsString();
            boolean hit = shortSido(n).equals(s) || ("광주".equals(s) && n.contains("광주"));
            if (!hit) continue;
            JsonObject x = o.deepCopy();
            int lv = 0;
            for (int i = 4; i >= 1; i--) if (o.has("d" + i) && o.get("d" + i).getAsDouble() >= 1) { lv = i - 1; break; }
            x.addProperty("level", lv);
            return x;
        }
        return null;
    }

    /** 순수 함수 - 자외선 발표 시각(06 · 18시, 10분 뒤부터로 어림) [time yyyyMMddHH]. */
    static String[] uvTime(LocalDateTime now) {
        LocalDateTime t = now.minusMinutes(10);
        LocalDateTime b = t.getHour() >= 18 ? t.withHour(18) : t.getHour() >= 6 ? t.withHour(6) : t.minusDays(1).withHour(18);
        return new String[] {b.format(DateTimeFormatter.ofPattern("yyyyMMddHH"))};
    }

    /** 순수 함수 - 자외선 JSON → {date, hours:[{h, v}]} (h = 발표부터 몇 시간, 값이 있는 것만). 모양이 다르면 null. */
    static JsonObject uv(String text) {
        try {
            JsonObject res = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
            if (!"00".equals(res.getAsJsonObject("header").get("resultCode").getAsString())) return null;
            JsonElement it = res.getAsJsonObject("body").getAsJsonObject("items").get("item");
            JsonObject o = it.isJsonArray() ? it.getAsJsonArray().get(0).getAsJsonObject() : it.getAsJsonObject();
            JsonObject out = new JsonObject();
            out.addProperty("date", o.get("date").getAsString());
            JsonArray hs = new JsonArray();
            for (int h = 0; h <= 75; h += 3) {
                JsonElement v = o.get("h" + h);
                if (v == null || v.isJsonNull() || v.getAsString().isBlank()) continue;
                JsonObject p = new JsonObject();
                p.addProperty("h", h);
                p.addProperty("v", Integer.parseInt(v.getAsString().trim()));
                hs.add(p);
            }
            out.add("hours", hs);
            return out;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** 순수 함수 - 특보 현황 JSON → {tm(yyyyMMddHHmm), lines:[{type, areas}]} (t6 의 "o 강풍주의보 : …" 줄). 발효 중인 특보가 없으면 빈 lines. */
    static JsonObject warn(String text) {
        try {
            JsonObject res = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
            if (!"00".equals(res.getAsJsonObject("header").get("resultCode").getAsString())) return null;
            JsonElement it = res.getAsJsonObject("body").getAsJsonObject("items").get("item");
            JsonObject o = it.isJsonArray() ? it.getAsJsonArray().get(0).getAsJsonObject() : it.getAsJsonObject();
            JsonObject out = new JsonObject();
            out.addProperty("tm", o.has("tmFc") ? o.get("tmFc").getAsString() : null);
            JsonArray lines = new JsonArray();
            String t6 = o.has("t6") && !o.get("t6").isJsonNull() ? o.get("t6").getAsString() : "";
            for (String ln : t6.split("\\r?\\n")) {
                Matcher m = Pattern.compile("^\\s*o\\s*([^:]+?)\\s*:\\s*(.+)$").matcher(ln);
                if (!m.find()) continue;
                JsonObject x = new JsonObject();
                x.addProperty("type", m.group(1).trim());
                x.addProperty("areas", m.group(2).trim());
                lines.add(x);
            }
            out.add("lines", lines);
            return out;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** 순수 함수 - 특보 줄마다 내 시도가 들어 있는지(mine). 예) 강원특별자치도 → "강원", 전북 → "전북"(t6 는 "전북자치도"), 세종 · 인천 같은 시는 이름 그대로. */
    static JsonObject mark(JsonObject warn, String sido) {
        JsonObject out = warn.deepCopy();
        String s = shortSido(sido);
        List<String> keys = new ArrayList<>();
        if (s != null) {
            keys.add(s);
            if ("전남".equals(s)) { keys.add("전라남도"); if (sido.contains("광주")) keys.add("광주"); }
            if ("전북".equals(s)) keys.add("전라북도");
            if ("충남".equals(s)) keys.add("충청남도");
            if ("충북".equals(s)) keys.add("충청북도");
            if ("경남".equals(s)) keys.add("경상남도");
            if ("경북".equals(s)) keys.add("경상북도");
        }
        for (JsonElement e : out.getAsJsonArray("lines")) {
            JsonObject l = e.getAsJsonObject();
            String a = l.get("areas").getAsString();
            boolean mine = false;
            for (String k : keys) if (a.contains(k)) { mine = true; break; }
            l.addProperty("mine", mine);
        }
        return out;
    }
}
