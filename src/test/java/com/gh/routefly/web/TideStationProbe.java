package com.gh.routefly.web;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Locale;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 물때 예보 지점 목록 만들기(시험이 아님 - 네트워크를 씀). 2026-10-18 🧰 별거 별거.
 * 내려받을 지점 목록이 없어(PC 조사) DT_0001 ~ DT_0099 를 오늘 날짜로 하나씩 물어, 자료가 오는 코드의 이름 · 위경도(응답의 obsvtrNm · lat · lot)를 모읍니다.
 * 활용 한도(개발 10,000건) 안 - 99번. 지은 값 없이 실제 응답만.
 *
 * <pre>
 * .claude\run-tests.ps1 -Run web.TideStationProbe
 * </pre>
 * 결과는 src/main/webapp/data/tide-stations.json [{code, name, lat, lon}] (이름 차례) - 커밋해 화면(tools.html 🌊 물때)이 씀.
 */
public final class TideStationProbe {

    private TideStationProbe() {
    }

    public static void main(String[] args) throws Exception {
        String key = RouteflyConfig.get("tide.serviceKey");
        if (key == null) key = RouteflyConfig.get("tour.serviceKey");
        if (key == null) { System.out.println("tide.serviceKey · tour.serviceKey 가 비어 있습니다."); return; }
        LocalDate d = LocalDate.now(WeatherServlet.KST);
        java.util.TreeMap<String, String> rows = new java.util.TreeMap<>();
        int none = 0;
        for (int i = 1; i <= 99; i++) {
            String code = String.format(Locale.ROOT, "DT_%04d", i);
            Thread.sleep(300);
            String t = OpenApi.get(TideServlet.url(TideServlet.DEFAULT_URL, key, code, d), "TIDE-STATION");
            if (t == null) { System.out.println(code + " : 받지 못함"); continue; }
            JsonObject p = TideServlet.parse(t);
            if (p == null || !p.has("name") || p.getAsJsonArray("tides").size() == 0) { none++; continue; }
            JsonObject item = first(t);
            if (item == null || !item.has("lat") || !item.has("lot")) { System.out.println(code + " : 위경도 없음 " + p.get("name")); continue; }
            String name = p.get("name").getAsString();
            rows.put(name + "\u0000" + code, String.format(Locale.ROOT, "{\"code\":\"%s\",\"name\":\"%s\",\"lat\":%.5f,\"lon\":%.5f}",
                    code, name.replace("\"", ""), item.get("lat").getAsDouble(), item.get("lot").getAsDouble()));
            System.out.println(code + " : " + name);
        }
        Path out = Path.of("src", "main", "webapp", "data", "tide-stations.json");
        Files.writeString(out, "[\n" + String.join(",\n", rows.values()) + "\n]\n", StandardCharsets.UTF_8);
        System.out.println("지점 " + rows.size() + "곳 · 자료 없음 " + none + "곳 → " + out.toAbsolutePath());
    }

    private static JsonObject first(String text) {
        try {
            JsonObject root = JsonParser.parseString(text).getAsJsonObject();
            if (root.has("response")) root = root.getAsJsonObject("response");
            var it = root.getAsJsonObject("body").getAsJsonObject("items").get("item");
            return it.isJsonArray() ? it.getAsJsonArray().get(0).getAsJsonObject() : it.getAsJsonObject();
        } catch (RuntimeException e) {
            return null;
        }
    }
}
