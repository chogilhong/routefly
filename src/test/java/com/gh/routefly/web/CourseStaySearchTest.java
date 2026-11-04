package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 2026-11-04 홍TV님 "코스 페이지도 똑같이" - 코스 페이지(/c/)도 산 페이지처럼 🏨 근처 숙소 찾기 칸만(트립닷컴 한 줄은 뺌). 값은 운영 knps-17018-20bc8e55. */
public class CourseStaySearchTest {

    @Test
    public void coursePageHasSearchBoxOnly() throws Exception {
        JsonObject c = JsonParser.parseString("{\"course_id\":\"knps-17018-20bc8e55\",\"name\":\"월출산 · 구정봉 → 홍계골\",\"kind\":\"hike\",\"distance_m\":1492,\"ascent_m\":6,"
                + "\"descent_m\":345,\"ele_min_m\":347.6,\"ele_max_m\":687.2,\"start_lat\":34.760294,\"start_lon\":126.693703,\"end_lat\":34.762772,\"end_lon\":126.68339}").getAsJsonObject();
        String page = CoursePageServlet.page(c, null, null, null, null, new com.google.gson.JsonArray(), true, "https://r.kr", java.util.List.of());
        assertTrue("펴 둔 숙소 찾기 칸", page.contains("<section id=\"staySearch\"><details class=\"fold kind\" open data-keep=\"1\">") && page.contains("id=\"ssForm\""));
        assertTrue("코스 이름 앞(산 이름)을 미리 채움", page.contains("value=\"월출산\""));
        assertFalse("트립닷컴 한 줄 없음", page.contains("근처 숙소(트립닷컴)") || page.contains("trip.com"));
        assertTrue("숙소 찾기 스크립트(kit-m · course-page), 날씨 · 찜 스크립트(mountain.js)는 없음",
                page.contains("js/kit-m.js\"></script>") && page.contains("js/course-page.js\"></script>") && !page.contains("js/mountain.js"));
        // 100대 명산 코스여도 산 이름만 - 산 페이지 숙박 거점 "월출산 천황사"(동쪽 대표 들머리)는 이 코스(서쪽 홍계골)와 맞지 않음(2026-11-04 홍TV님)
        JsonObject peak = JsonParser.parseString("{\"id\":\"월출산\",\"name\":\"월출산\",\"summit\":\"천황봉\",\"height\":840,\"lat\":34.76656,\"lon\":126.703896}").getAsJsonObject();
        String withPeak = CoursePageServlet.page(c, peak, null, null, null, new com.google.gson.JsonArray(), true, "https://r.kr", java.util.List.of());
        assertTrue(withPeak.contains("value=\"월출산\"") && !withPeak.contains("천황사"));
        String js = Files.readString(Path.of("src/main/webapp/js/course-page.js"), StandardCharsets.UTF_8);
        assertTrue("산 페이지와 같은 부름", js.contains("window.RF.staySearch(f, document.getElementById(\"ssOut\"), partnersP, \"../\", false)"));
    }
}
