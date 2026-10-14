package com.gh.routefly.web;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
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
 * 숙박 · 식당 한 곳의 반려동물 동반 정보. {@code GET /api/pet?id=<TourAPI contentid>} - 한국관광공사 반려동물 동반여행 서비스 detailPetTour2.
 * 2026-10-14 홍TV님. 키는 tour.serviceKey(같은 공공데이터포털 개인 키, 서비스 활용 신청은 따로). 한 곳씩 누를 때만 묻고 이레 동안 담아 둡니다.
 * → {@code {success, pet:[{k:"동반 가능 동물", v:"소형견"}, …], source:"한국관광공사"}} - 자료가 없으면 pet 은 빈 목록, 실패하면 unavailable.
 */
@WebServlet(urlPatterns = {"/api/pet"})
public class PetServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    /** 한국관광공사_반려동물 동반여행 서비스(KorPetTourService2) - 국문 관광정보(KorService2)의 detailPetTour2 는 빈 응답만 왔음(2026-10-14 PC). */
    static final String DEFAULT_URL = "https://apis.data.go.kr/B551011/KorPetTourService2/detailPetTour2";
    private static final OpenApi.Cache<JsonObject> CACHE = new OpenApi.Cache<>(2000, 7L * 24 * 60 * 60 * 1000);

    /** TourAPI 칸 → 화면 이름(이 차례로). 모르는 칸은 보이지 않음. */
    static final Map<String, String> LABELS = new LinkedHashMap<>();
    static {
        LABELS.put("acmpyTypeCd", "동반 구분");
        LABELS.put("acmpyPsblCpam", "동반 가능 동물");
        LABELS.put("acmpyNeedMtr", "동반 시 필요한 것");
        LABELS.put("etcAcmpyInfo", "기타 동반 정보");
        LABELS.put("relaPosesFclty", "반려동물 시설");
        LABELS.put("relaFrnshPrdlst", "비치 품목");
        LABELS.put("relaPurcPrdlst", "구매 가능 품목");
        LABELS.put("relaRntlPrdlst", "대여 가능 품목");
        LABELS.put("relaAcdntRiskMtr", "사고 대비 사항");
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String id = req.getParameter("id");
        if (id == null || !id.matches("\\d{1,12}")) {
            Json.fail(resp, HttpServletResponse.SC_BAD_REQUEST, "id 는 숫자입니다.");
            return;
        }
        long now = System.currentTimeMillis();
        JsonObject out = CACHE.get(id, now);
        if (out == null) {
            out = fetch(id);
            if (!out.has("unavailable") && out.getAsJsonArray("pet").size() > 0) CACHE.put(id, out, now);   // 빈 결과는 담지 않음(주소를 바꿔도 이레 동안 빈 채로 남았음)
        }
        Json.ok(req, resp, out);
    }

    private static JsonObject fetch(String id) {
        String serviceKey = RouteflyConfig.get("tour.serviceKey");
        if (serviceKey == null) return unavailable();
        String base = RouteflyConfig.get("tour.petUrl");
        String text = OpenApi.get(url(base != null ? base : DEFAULT_URL, serviceKey, id), "PET");
        JsonObject out = text == null ? null : body(text);
        if (out == null && text != null) OpenApi.warn("PET", text);
        if (out != null && out.has("fields")) OpenApi.warn("PET", "아는 칸 없음 - 칸 이름 " + out.remove("fields").getAsString());
        return out != null ? out : unavailable();
    }

    private static JsonObject unavailable() {
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        out.add("pet", new JsonArray());
        out.addProperty("unavailable", true);
        return out;
    }

    /** 순수 함수 - 요청 주소. */
    static String url(String base, String serviceKey, String id) {
        return base + "?serviceKey=" + URLEncoder.encode(serviceKey, StandardCharsets.UTF_8) + "&MobileOS=ETC&MobileApp=routefly&_type=json&contentId=" + id;
    }

    /** 순수 함수 - TourAPI JSON → 이름 · 값 줄. 모양이 다르거나 resultCode 가 0000 이 아니면 null. 자료 없음(items "")은 빈 목록. */
    static JsonObject body(String text) {
        JsonObject root;
        try {
            root = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
        } catch (Exception e) {
            return null;
        }
        if (root == null || root.getAsJsonObject("header") == null) return null;
        JsonElement code = root.getAsJsonObject("header").get("resultCode");
        if (code == null || !"0000".equals(code.getAsString())) return null;
        JsonObject b = root.getAsJsonObject("body");
        JsonElement items = b == null ? null : b.get("items");
        JsonElement list = items != null && items.isJsonObject() ? items.getAsJsonObject().get("item") : null;
        JsonObject it = list == null ? null : list.isJsonArray() ? (list.getAsJsonArray().size() > 0 ? list.getAsJsonArray().get(0).getAsJsonObject() : null)
                : list.isJsonObject() ? list.getAsJsonObject() : null;
        JsonArray pet = new JsonArray();
        if (it != null) {
            // 칸 이름은 대소문자를 가리지 않고(KorService2 가 칸 이름을 바꿨을 수 있음 - 2026-10-14 PC: 모두 빈 목록)
            Map<String, JsonElement> low = new java.util.HashMap<>();
            for (Map.Entry<String, JsonElement> e : it.entrySet()) low.put(e.getKey().toLowerCase(java.util.Locale.ROOT), e.getValue());
            for (Map.Entry<String, String> e : LABELS.entrySet()) {
                JsonElement v = low.get(e.getKey().toLowerCase(java.util.Locale.ROOT));
                if (v == null || v.isJsonNull()) continue;
                String t = OpenApi.plain(v.getAsString());   // 글 속 줄바꿈 표시 · 꼬리표 뗌, &amp; 등 풂
                if (t.isEmpty()) continue;
                JsonObject row = new JsonObject();
                row.addProperty("k", e.getValue());
                row.addProperty("v", t);
                pet.add(row);
            }
        }
        JsonObject out = new JsonObject();
        out.addProperty("success", true);
        if (it != null && pet.size() == 0) out.addProperty("fields", String.join(",", it.keySet()));   // 자료는 왔는데 아는 칸이 없음 - 서블릿이 로그에 칸 이름을 남김
        out.add("pet", pet);
        out.addProperty("source", "한국관광공사");
        return out;
    }
}
