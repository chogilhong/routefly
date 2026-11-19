package com.gh.routefly.web;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import jakarta.servlet.ServletContext;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 국립공원 대피소(data/knps-shelters.json - tools/shelters/build.js, 공공데이터 2982556) - 산 페이지 · 코스 페이지의 "🏠 대피소" 칸(2026-11-19 홍TV님 "2번으로 해줘").
 * 예약은 공단 예약 화면으로 가는 링크만(요금 · 예약 가능 날짜는 그 화면에서 - 앱에 적지 않음). 예약 화면에 없는 대피소는 링크 없이 이름만.
 */
final class Shelters {

    private Shelters() {
    }

    private static volatile JsonObject data;

    /** 처음 한 번 읽음(못 읽으면 빈 것 - 칸 없이). */
    static JsonObject load(ServletContext ctx) {
        JsonObject d = data;
        if (d != null) return d;
        try (InputStream in = ctx.getResourceAsStream("/data/knps-shelters.json")) {
            d = in == null ? new JsonObject() : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
        } catch (Exception e) {
            d = new JsonObject();
        }
        return data = d;
    }

    /** 읽어 둔 것(아직 안 읽었으면 빈 것) - 산 · 코스 페이지를 그리는 static page() 가 씀, doGet 이 먼저 load. */
    static JsonObject current() {
        JsonObject d = data;
        return d == null ? new JsonObject() : d;
    }

    /** 순수 함수 - 그 산(park = 산 페이지 이름) 대피소들, 원본 차례. */
    static List<JsonObject> ofPark(JsonObject d, String park) {
        List<JsonObject> out = new ArrayList<>();
        if (d == null || !d.has("shelters") || park == null) return out;
        for (JsonElement e : d.getAsJsonArray("shelters")) if (park.equals(e.getAsJsonObject().get("park").getAsString())) out.add(e.getAsJsonObject());
        return out;
    }

    /** 순수 함수 - 코스 지점(pois: name · off_route_m) 가운데 경로 POI_NEAR_M 안의 대피소, 지나는 차례. 검색(CourseQueries.viaPoi)과 같은 거리. */
    static List<JsonObject> onCourse(JsonObject d, JsonArray pois) {
        List<JsonObject> out = new ArrayList<>();
        if (d == null || !d.has("shelters") || pois == null) return out;
        for (JsonElement p : pois) {
            JsonObject o = p.getAsJsonObject();
            String nm = o.has("name") && !o.get("name").isJsonNull() ? o.get("name").getAsString() : "";
            Integer off = o.has("off_route_m") && !o.get("off_route_m").isJsonNull() ? o.get("off_route_m").getAsInt() : null;
            if (off == null || off > CourseQueries.POI_NEAR_M) continue;
            for (JsonElement e : d.getAsJsonArray("shelters")) {
                JsonObject s = e.getAsJsonObject();
                if (s.get("name").getAsString().equals(nm) && !out.contains(s)) out.add(s);
            }
        }
        return out;
    }

    /**
     * 순수 함수 - "🏠 대피소" 칸. 이름은 따라가기 검색(그 대피소를 지나는 코스)으로, 예약 받는 곳은 "예약 ›"(새 창).
     * rel - 앱 안 상대 주소 앞부분(".." 등). 없으면 빈 글.
     */
    static String block(JsonObject d, List<JsonObject> list, String rel, boolean en) {
        if (list.isEmpty()) return "";
        String url = d.has("reserveUrl") ? d.get("reserveUrl").getAsString() : null;
        StringBuilder b = new StringBuilder("<section class=\"shelters\"><h2>").append(en ? "🏠 Shelters (Korea National Park Service)" : "🏠 대피소(국립공원공단)").append("</h2><ul class=\"tips\">");
        for (JsonObject s : list) {
            String nm = s.get("name").getAsString();
            b.append("<li><a href=\"").append(rel).append("/hike.html?lang=").append(en ? "en" : "ko").append("&amp;q=").append(MountainServlet.enc(nm)).append("\">")
                    .append(ShareServlet.esc(nm)).append("</a>");
            if (url != null && s.get("reserve").getAsBoolean()) b.append(" · <a href=\"").append(ShareServlet.esc(url)).append("\" target=\"_blank\" rel=\"noopener\">").append(en ? "Book ›" : "예약 ›").append("</a>");
            b.append("</li>");
        }
        b.append("</ul><p class=\"dim\">").append(en
                ? "Tap a shelter name for trails that pass it. Fees and open dates are on the KNPS booking page."
                : "대피소 이름을 누르면 그 대피소를 지나는 코스. 요금 · 예약 가능 날짜는 공단 예약 화면에서 확인하세요.").append("</p></section>");
        return b.toString();
    }
}
