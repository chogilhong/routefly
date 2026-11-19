package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 잘못 놓인 대피소 이름(2026-11-19 홍TV님 "소청대피소와 희운각대피소는 다른데") - 코스 지점은 운영 /api/course 응답(src/test/resources/shelters),
 * 공단 좌표는 data/knps-shelters.json.
 */
public class ShelterPlaceTest {

    private static JsonObject json(String path) throws Exception {
        return JsonParser.parseString(new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8)).getAsJsonObject();
    }

    private static List<String> names(JsonArray pois) {
        List<String> out = new ArrayList<>();
        for (JsonElement e : pois) out.add(e.getAsJsonObject().get("name").getAsString());
        return out;
    }

    @Test
    public void 공단_좌표로_바로잡음() throws Exception {
        JsonObject d = json("src/main/webapp/data/knps-shelters.json");
        // 남설악 → "소청대피소": 끝 지점은 희운각대피소 26m 옆 - 희운각으로, 바로 뒤의 희운각(37m 옆)은 같은 이름이라 뺌
        JsonArray kmp = json("src/test/resources/shelters/course-kmp-2322010401-1-pois.json").getAsJsonArray("pois");
        assertEquals(List.of("남설악탐방지원센터", "대청봉", "중청대피소", "중청봉", "소청봉", "희운각대피소"), names(Shelters.fixPois(d, kmp)));
        assertEquals("원본은 그대로(복사해서 고침)", "소청대피소", kmp.get(5).getAsJsonObject().get("name").getAsString());
        assertTrue("코스 페이지 칸도 소청 없이", Shelters.onCourse(d, Shelters.fixPois(d, kmp)).stream().noneMatch(s -> s.get("name").getAsString().equals("소청대피소")));
        // 권금성 → 대청봉: 3.4km 떨어진 "양폭대피소"(둘레 100m 안에 대피소 없음)는 뺌, 맞는 자리의 희운각 · 중청은 그대로
        JsonArray frst = json("src/test/resources/shelters/course-frst-428302602-1d4420-pois.json").getAsJsonArray("pois");
        List<String> f = names(Shelters.fixPois(d, frst));
        assertFalse(f.contains("양폭대피소"));
        assertTrue(f.contains("희운각대피소") && f.contains("중청대피소") && f.contains("양폭포"));
        assertEquals(frst.size() - 1, f.size());
        // 공단 좌표와 300 ~ 600m 차이(노고단 · 양폭 - 공단 좌표 오차일 수 있음)는 그대로
        JsonArray bac = json("src/test/resources/shelters/course-knps-4016-55eabbcc-pois.json").getAsJsonArray("pois");
        assertEquals(names(bac), names(Shelters.fixPois(d, bac)));
        assertNull(Shelters.fixPois(d, null));
    }

    @Test
    public void 두_곳에서_같이() throws Exception {
        String q = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/CourseQueries.java")), StandardCharsets.UTF_8);
        String p = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/CoursePageServlet.java")), StandardCharsets.UTF_8);
        assertTrue("api/course", q.contains("out.add(\"pois\", Shelters.fixPois(Shelters.current(), Json.rows(c,"));
        assertTrue("코스 페이지", p.contains("pois = Shelters.fixPois(Shelters.load(getServletContext()),"));
        assertTrue("받아 둔 응답을 다시 받게", CourseServlet.SHAPE.endsWith("-shel1"));
        // 코스 이름 끝도 바로잡음(park-notes trails - 화면 noteTrailName 과 같은 규칙)
        JsonObject parks = json("src/main/webapp/data/park-notes.json").getAsJsonObject("parks");
        assertEquals("설악산(대청봉) 1코스 · 남설악탐방지원센터 → 희운각대피소",
                ShareServlet.noteName(parks, "kmp-2322010401-1", "설악산(대청봉) 1코스 · 남설악탐방지원센터 → 소청대피소"));
    }
}
