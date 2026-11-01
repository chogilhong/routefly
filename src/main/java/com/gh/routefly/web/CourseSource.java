package com.gh.routefly.web;

import com.google.gson.JsonObject;

/**
 * 코스마다 "출처 / 만든 이" 한 줄(2026-11-01 홍TV님 "코스 이름은 깨끗하게, 누가 만들었는지는 코스 화면에 따로").
 * 코스 ID 앞부분 → 출처(공공 자료 · OpenStreetMap), 올린 코스(u-)는 만든 이(CourseMakers). 모르는 앞부분은 null(줄 없음).
 * 모양 {kind:"source"|"maker", text, en, checked[, partner]} - course-kit.js courseSource · sourceText 와 같음(오프라인으로 받아 둔 옛 코스용).
 */
final class CourseSource {

    private CourseSource() {
    }

    /** 앞부분 → [한국어, 영어]. osm 으로 시작하는 것(osmh · osmb · osmgap)은 모두 OpenStreetMap. */
    private static final String[][] PREFIX = {
        {"knps-", "국립공원공단", "Korea National Park Service"},
        {"frst-", "산림청", "Korea Forest Service"},
        {"drnb-", "한국관광공사 두루누비", "Korea Tourism Organization Durunubi"},
        {"kmp-", "한국등산·트레킹지원센터", "Korea Hiking & Trekking Support Center"},
        {"kmf-", "한국등산·트레킹지원센터", "Korea Hiking & Trekking Support Center"},
        {"osm", "OpenStreetMap", "OpenStreetMap"},
    };

    /** 서버 화면 · API 용 - 올린 코스는 저장해 둔 만든 이로. */
    static JsonObject of(String id) {
        return of(id, id != null && id.startsWith("u-") ? CourseMakers.STORE.get(id) : null);
    }

    /** 순수 함수 - 코스 ID(+ 올린 코스의 {maker, at[, partner]}) → 출처 · 만든 이. 모르면 null. */
    static JsonObject of(String id, JsonObject made) {
        if (id == null) return null;
        JsonObject o = new JsonObject();
        if (id.startsWith("u-")) {   // ⬆ 코스로 올리기 - 보낸 사람 이름이 있으면 그 이름(routefly 점검), 없으면 홍TV님이 만든 것
            String m = made != null && made.has("maker") && made.get("maker").isJsonPrimitive() ? made.get("maker").getAsString().trim() : "";
            boolean partner = made != null && made.has("partner") && made.get("partner").isJsonPrimitive() && made.get("partner").getAsBoolean();
            o.addProperty("kind", "maker");
            o.addProperty("text", m.isEmpty() ? "routefly" : m);
            o.addProperty("en", m.isEmpty() ? "routefly" : m);
            o.addProperty("checked", !m.isEmpty() && !partner);
            if (partner) o.addProperty("partner", true);   // 나중에 제휴 산악회 - 파일에 손으로 표시(결제는 아직 없음)
            return o;
        }
        for (String[] p : PREFIX) {
            if (!id.startsWith(p[0])) continue;
            o.addProperty("kind", "source");
            o.addProperty("text", p[1]);
            o.addProperty("en", p[2]);
            o.addProperty("checked", false);
            return o;
        }
        return null;
    }

    /** 순수 함수 - 화면에 보일 글(이스케이프 전). "출처: 국립공원공단" · "만든 이: 시험대장 (routefly 점검)" · "Made by: … [Partner]". null 이면 "". */
    static String line(JsonObject s, boolean en) {
        if (s == null) return "";
        String text = MountainServlet.str(s, en ? "en" : "text");
        if (text == null) text = MountainServlet.str(s, "text");
        if (!"maker".equals(MountainServlet.str(s, "kind"))) return (en ? "Source: " : "출처: ") + text;
        boolean partner = s.has("partner") && s.get("partner").getAsBoolean(), checked = s.has("checked") && s.get("checked").getAsBoolean();
        return (en ? "Made by: " : "만든 이: ") + text + (partner ? (en ? " [Partner]" : " [제휴]") : checked ? (en ? " (checked by routefly)" : " (routefly 점검)") : "");
    }
}
