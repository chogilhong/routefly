package com.gh.routefly.web;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 한국관광공사 반려동물 동반여행 서비스(KorPetTourService2)의 실제 응답을 받아 보는 확인용 프로그램(시험이 아님 - 네트워크를 씀).
 * 2026-10-14 홍TV님 · PC: 활용매뉴얼 v4.1 은 목록의 숙박 80 · 음식점 82 라는데, 실제로는 32 · 39 에만 답하는 것으로 보임.
 * 제주시청 둘레는 20km 까지 0곳.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.PetTourProbe
 * </pre>
 *
 * 키는 config.properties 의 tour.serviceKey 를 RouteflyConfig 로 읽습니다(화면 · 파일에 키를 쓰지 않음).
 * 받은 응답은 src/test/resources/stays/pet-probe-&lt;곳&gt;-&lt;타입&gt;.json 에 저장합니다(키는 지움). 모두 열네 번 묻습니다.
 */
public final class PetTourProbe {

    private static final String BASE = "https://apis.data.go.kr/B551011/KorPetTourService2/";
    private static final String[][] PLACES = {
        {"bukhansan", "37.6879", "127.0350"},
        {"jeju", "33.4996", "126.5312"},
        {"gayasan", "35.7998", "128.0961"},
    };
    private static final String[] TYPES = {"32", "39", "80", "82", ""};
    private static final String[] DETAIL_IDS = {"2558084", "3532743"};

    private PetTourProbe() {
    }

    public static void main(String[] args) throws Exception {
        String key = RouteflyConfig.get("tour.serviceKey");
        if (key == null || key.isBlank()) {
            System.out.println("tour.serviceKey 가 비어 있습니다.");
            return;
        }
        key = key.trim();
        Path dir = Path.of("src", "test", "resources", "stays");
        Files.createDirectories(dir);
        for (String[] p : PLACES) {
            for (String t : TYPES) {
                String url = BASE + "locationBasedList2?serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                        + "&MobileOS=ETC&MobileApp=routefly&_type=json&arrange=E&numOfRows=10&pageNo=1&radius=20000"
                        + "&mapX=" + p[2] + "&mapY=" + p[1] + (t.isEmpty() ? "" : "&contentTypeId=" + t);
                report(p[0] + " contentTypeId=" + (t.isEmpty() ? "(없음)" : t), fetch(url, key, dir.resolve("pet-probe-" + p[0] + "-" + (t.isEmpty() ? "all" : t) + ".json")));
            }
        }
        for (String id : DETAIL_IDS) {
            String url = BASE + "detailPetTour2?serviceKey=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                    + "&MobileOS=ETC&MobileApp=routefly&_type=json&contentId=" + id;
            report("detailPetTour2 " + id, fetch(url, key, dir.resolve("pet-probe-detail-" + id + ".json")));
        }
        System.out.println("저장: " + dir.toAbsolutePath() + " (pet-probe-*.json, 키 없음)");
    }

    /** 받아서 키를 지우고 저장. 실패하면 null. 묻는 사이 0.7초 쉼(429 막음). */
    private static String fetch(String url, String key, Path file) throws Exception {
        Thread.sleep(700);
        String text = OpenApi.get(url, "PET-PROBE");
        if (text == null) return null;
        text = scrub(text, key);
        Files.writeString(file, text, StandardCharsets.UTF_8);
        return text;
    }

    /** 순수 함수 - 응답 속 키(그대로 · 인코딩된 것)를 지움. */
    static String scrub(String text, String key) {
        return text.replace(key, "***").replace(URLEncoder.encode(key, StandardCharsets.UTF_8), "***");
    }

    private static void report(String what, String text) {
        if (text == null) {
            System.out.println(what + " : 받지 못함(로그 [PET-PROBE] 참고)");
            return;
        }
        try {
            JsonObject r = JsonParser.parseString(text).getAsJsonObject().getAsJsonObject("response");
            String code = r.getAsJsonObject("header").get("resultCode").getAsString();
            JsonObject b = r.getAsJsonObject("body");
            JsonElement total = b == null ? null : b.get("totalCount");
            StringBuilder sb = new StringBuilder(what + " : resultCode " + code + " · totalCount " + (total == null ? "-" : total.getAsString()));
            JsonElement items = b == null ? null : b.get("items");
            JsonElement list = items != null && items.isJsonObject() ? items.getAsJsonObject().get("item") : null;
            if (list != null) {
                int n = 0;
                for (JsonElement e : list.isJsonArray() ? list.getAsJsonArray() : one(list)) {
                    if (n++ == 5) break;
                    JsonObject it = e.getAsJsonObject();
                    sb.append(String.format(Locale.ROOT, "%n    %s [%s] %s", s(it, "title"), s(it, "contenttypeid"), it.has("dist") ? s(it, "dist") + "m" : String.join(",", it.keySet())));
                }
            }
            System.out.println(sb);
        } catch (Exception e) {
            System.out.println(what + " : JSON 아님 - " + text.substring(0, Math.min(200, text.length())).replaceAll("\\s+", " "));
        }
    }

    private static com.google.gson.JsonArray one(JsonElement e) {
        com.google.gson.JsonArray a = new com.google.gson.JsonArray();
        a.add(e);
        return a;
    }

    private static String s(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? "-" : e.getAsString();
    }
}
