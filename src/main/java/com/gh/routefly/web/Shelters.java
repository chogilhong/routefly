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

    /** 공단 좌표에서 이만큼(m) 넘게 떨어진 "○○대피소" 지점은 잘못 놓인 이름 - 운영 점검(2026-11-19): 잘못된 것은 1.1 ~ 3.4km, 맞는 것도 공단 좌표와 300 ~ 600m 차이(노고단 · 양폭). */
    static final int WRONG_M = 1000;
    /** 잘못 놓인 이름 자리에서 이 거리(m) 안에 다른 공단 대피소가 있으면 그 이름으로(소청대피소 → 희운각대피소 26m). */
    static final int SAME_M = 100;

    /**
     * 순수 함수 - 코스 지점(pois: name · lat · lon)의 대피소 이름을 공단 좌표로 바로잡음(2026-11-19 홍TV님 "소청대피소와 희운각대피소는 다른데").
     * 배치가 끝점에 붙인 지명(V-World · 산림청)이 틀린 곳이 있음 - 남설악 → "소청대피소" 코스 끝은 희운각대피소 26m 옆(소청대피소는 1,137m),
     * 설악동 쪽 산림청 코스 17개의 "양폭대피소" 는 실제 양폭대피소에서 3.2km. 공단 대피소 이름인데 WRONG_M 넘게 떨어졌으면 SAME_M 안의
     * 공단 대피소 이름으로, 없으면 뺌. 같은 이름이 둘이 되면 앞 것만. 좌표가 없는 지점 · 대피소가 아닌 이름은 그대로.
     */
    static JsonArray fixPois(JsonObject d, JsonArray pois) {
        if (d == null || !d.has("shelters") || pois == null) return pois;
        JsonArray out = new JsonArray();
        List<String> names = new ArrayList<>();
        for (JsonElement e : pois) {
            JsonObject p = e.getAsJsonObject();
            String nm = p.has("name") && !p.get("name").isJsonNull() ? p.get("name").getAsString() : null;
            JsonObject own = nm == null ? null : byName(d, nm);
            if (own != null && p.has("lat") && !p.get("lat").isJsonNull() && p.has("lon") && !p.get("lon").isJsonNull()) {
                double lat = p.get("lat").getAsDouble(), lon = p.get("lon").getAsDouble();
                if (far(own, lat, lon) > WRONG_M) {
                    JsonObject near = null;
                    for (JsonElement s : d.getAsJsonArray("shelters"))
                        if (far(s.getAsJsonObject(), lat, lon) <= SAME_M) near = s.getAsJsonObject();
                    if (near == null) continue;
                    p = p.deepCopy();
                    p.addProperty("name", near.get("name").getAsString());
                }
            }
            String fixed = p.has("name") && !p.get("name").isJsonNull() ? p.get("name").getAsString() : null;
            if (fixed != null && byName(d, fixed) != null && names.contains(fixed)) continue;
            if (fixed != null) names.add(fixed);
            out.add(p);
        }
        return out;
    }

    private static JsonObject byName(JsonObject d, String name) {
        for (JsonElement s : d.getAsJsonArray("shelters")) if (s.getAsJsonObject().get("name").getAsString().equals(name)) return s.getAsJsonObject();
        return null;
    }

    private static double far(JsonObject s, double lat, double lon) {
        return MountainServlet.distM(s.get("lat").getAsDouble(), s.get("lon").getAsDouble(), lat, lon);
    }

    /**
     * 순수 함수 - "🏠 대피소" 칸. 이름은 따라가기 검색(그 대피소를 지나는 코스)으로, 예약 받는 곳은 "예약 ›"(새 창).
     * rel - 앱 안 상대 주소 앞부분(".." 등). 없으면 빈 글.
     */
    /**
     * 순수 함수 - 예약 링크 주소: 공단 예약 화면 + 그 산 탭(?deptId=, data/knps-shelters.json reserveDept). 탭 값이 없는 산은 예약 화면 첫 주소.
     * 공단 화면은 탭이 골라진 채 열리고 표는 탭을 한 번 더 눌러야 뜸(PC 조사 2026-11-21 - 바로 표가 뜨는 주소는 없음). 따라가기 검색 카드(hike.js)도 같은 규칙.
     */
    static String reserveHref(JsonObject d, String park) {
        String url = d.has("reserveUrl") ? d.get("reserveUrl").getAsString() : null;
        if (url == null) return null;
        JsonObject dept = d.has("reserveDept") && d.get("reserveDept").isJsonObject() ? d.getAsJsonObject("reserveDept") : null;
        String id = dept != null && park != null && dept.has(park) ? dept.get(park).getAsString() : null;
        return id != null && id.matches("[A-Z0-9]{1,8}") ? url + "?deptId=" + id : url;
    }

    static String block(JsonObject d, List<JsonObject> list, String rel, boolean en) {
        if (list.isEmpty()) return "";
        String park = list.get(0).has("park") ? list.get(0).get("park").getAsString() : null;   // 한 칸은 한 공원(ofPark)
        String url = reserveHref(d, park);
        boolean tab = url != null && url.contains("?deptId=");
        StringBuilder b = new StringBuilder("<section class=\"shelters\"><h2>").append(en ? "Shelters (Korea National Park Service)" : "대피소(국립공원공단)").append("</h2><ul class=\"tips\">");
        for (JsonObject s : list) {
            String nm = s.get("name").getAsString();
            b.append("<li><a href=\"").append(rel).append("/hike.html?lang=").append(en ? "en" : "ko").append("&amp;q=").append(MountainServlet.enc(nm)).append("\">")
                    .append(en ? ShareServlet.esc(MountainEn.courseName(nm)) + " <small lang=\"ko\">" + ShareServlet.esc(nm) + "</small>" : ShareServlet.esc(nm)).append("</a>");   // 영어 - 코스 이름과 같은 규칙(대피소 → shelter, 나머지 로마자, 2026-11-19 PC)
            if (url != null && s.get("reserve").getAsBoolean()) b.append(" · <a href=\"").append(ShareServlet.esc(url)).append("\" target=\"_blank\" rel=\"noopener\">").append(en ? "Book ›" : "예약 ›").append("</a>");
            b.append("</li>");
        }
        b.append("</ul><p class=\"dim\">").append(en
                ? "Tap a shelter name for trails that pass it. Fees and open dates are on the KNPS booking page."
                : "대피소 이름을 누르면 그 대피소를 지나는 코스. 요금 · 예약 가능 날짜는 공단 예약 화면에서 확인하세요.")
                .append(!tab ? "" : en ? " Book › opens the " + ShareServlet.esc(MountainEn.courseName(park)) + " tab - tap the tab once more to see free places by date."
                        : " 예약 › 은 공단 예약 화면의 " + ShareServlet.esc(park) + " 탭으로 엽니다 - 그 탭을 한 번 더 누르면 날짜별 남은 자리가 나옵니다.")   // 2026-11-21 홍TV님 "지리산으로 와야 하는데"
                .append("</p></section>");
        return b.toString();
    }
}
