package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산 · 코스 페이지의 "🏠 대피소" 칸(2026-11-19 홍TV님 "2번으로 해줘") - 자료는 data/knps-shelters.json(tools/shelters/build.js),
 * 코스 지점은 운영 /api/course?id=knps-4016-55eabbcc 응답(src/test/resources/shelters).
 */
public class ShelterLinkTest {

    private static JsonObject json(String path) throws Exception {
        return JsonParser.parseString(new String(Files.readAllBytes(Paths.get(path)), StandardCharsets.UTF_8)).getAsJsonObject();
    }

    private static List<String> names(List<JsonObject> list) {
        return list.stream().map(s -> s.get("name").getAsString()).toList();
    }

    @Test
    public void 산_대피소() throws Exception {
        JsonObject d = json("src/main/webapp/data/knps-shelters.json");
        List<JsonObject> sorak = Shelters.ofPark(d, "설악산");
        assertTrue(names(sorak).contains("소청대피소"));
        assertTrue(names(sorak).contains("희운각대피소"));
        assertTrue("대피소가 없는 산은 빈 것", Shelters.ofPark(d, "계룡산").isEmpty());
        assertEquals("빈 칸이면 글 없음", "", Shelters.block(d, Shelters.ofPark(d, "계룡산"), "..", false));
        String h = Shelters.block(d, sorak, "..", false);
        assertTrue(h.contains("<a href=\"../hike.html?lang=ko&amp;q=" + MountainServlet.enc("소청대피소") + "\">소청대피소</a> · <a href=\""
                + d.get("reserveUrl").getAsString() + "\" target=\"_blank\" rel=\"noopener\">예약 ›</a>"));
        assertTrue(h.startsWith("<section class=\"shelters\"><h2>대피소(국립공원공단)</h2>"));
        // 예약 화면에 없는 대피소는 이름(검색 링크)만
        for (JsonObject s : sorak)
            if (!s.get("reserve").getAsBoolean()) {
                String nm = s.get("name").getAsString();
                assertTrue(nm, h.contains(">" + nm + "</a></li>"));
            }
        String en = Shelters.block(d, sorak, "../..", true);
        assertTrue(en.contains("../../hike.html?lang=en&amp;q="));
        assertTrue(en.contains(">Book ›</a>"));
        assertTrue("영어 이름 + 한글", en.contains(">Socheong shelter <small lang=\"ko\">소청대피소</small></a>"));
        assertEquals("화면 enName 과 같은 값(course-kit.test.js)", "Je 2yeonhwabong shelter", MountainEn.courseName("제2연화봉대피소"));
    }

    @Test
    public void 코스가_지나는_대피소() throws Exception {
        JsonObject d = json("src/main/webapp/data/knps-shelters.json");
        JsonArray pois = json("src/test/resources/shelters/course-knps-4016-55eabbcc-pois.json").getAsJsonArray("pois");
        assertEquals(List.of("수렴동대피소", "소청대피소"), names(Shelters.onCourse(d, pois)));   // 지나는 차례
        // 경로에서 POI_NEAR_M 보다 먼 지점은 뺌(검색 CourseQueries.viaPoi 와 같은 거리)
        for (var e : pois) if ("소청대피소".equals(e.getAsJsonObject().get("name").getAsString())) e.getAsJsonObject().addProperty("off_route_m", CourseQueries.POI_NEAR_M + 1);
        assertEquals(List.of("수렴동대피소"), names(Shelters.onCourse(d, pois)));
        assertTrue(Shelters.onCourse(d, null).isEmpty());
        assertTrue(Shelters.onCourse(new JsonObject(), pois).isEmpty());
    }

    /** 산 페이지(한국어 · 영어) · 코스 페이지에 실제로 붙는지 - doGet 처럼 Shelters.load 를 먼저(앱 파일을 읽는 ServletContext). */
    @Test
    public void 페이지에_붙음() throws Exception {
        jakarta.servlet.ServletContext ctx = (jakarta.servlet.ServletContext) java.lang.reflect.Proxy.newProxyInstance(getClass().getClassLoader(),
                new Class<?>[] {jakarta.servlet.ServletContext.class}, (o, m, a) -> "getResourceAsStream".equals(m.getName()) ? Files.newInputStream(Paths.get("src/main/webapp" + a[0])) : null);
        Shelters.load(ctx);
        JsonObject seorak = JsonParser.parseString("{\"id\":\"설악산\",\"name\":\"설악산\",\"summit\":\"대청봉\",\"lat\":38.119,\"lon\":128.465}").getAsJsonObject();
        String ko = MountainServlet.page(seorak, new java.util.ArrayList<>(), new java.util.ArrayList<>(), null, "", 11);
        assertTrue(ko.contains("<h2>대피소(국립공원공단)</h2>"));
        assertTrue(ko.contains(">소청대피소</a> · <a href="));
        String en = MountainEn.page(seorak, new java.util.ArrayList<>(), new java.util.ArrayList<>(), null, "https://r.kr");
        assertTrue(en.contains("<h2>Shelters (Korea National Park Service)</h2>"));
        JsonObject gyeryong = JsonParser.parseString("{\"id\":\"계룡산\",\"name\":\"계룡산\",\"lat\":36.34,\"lon\":127.2}").getAsJsonObject();
        assertFalse("대피소 없는 산은 칸 없음", MountainServlet.page(gyeryong, new java.util.ArrayList<>(), new java.util.ArrayList<>(), null, "", 11).contains("class=\"shelters\""));
        JsonObject real = json("src/test/resources/shelters/course-knps-4016-55eabbcc-pois.json");
        JsonObject c = real.getAsJsonObject("course");
        JsonArray pois = real.getAsJsonArray("pois");
        String cp = CoursePageServlet.page(c, null, null, null, null, pois, true, "https://r.kr", List.of());
        assertTrue(cp.contains("<a href=\"../hike.html?lang=ko&amp;q=" + MountainServlet.enc("수렴동대피소") + "\">수렴동대피소</a>"));
        assertTrue(cp.contains(">소청대피소</a> · <a href="));
        assertFalse("이 코스가 안 지나는 대피소는 없음", cp.contains(">희운각대피소</a>"));
        // 따라가기 검색 맨 위 예약 카드 - 예약 받는 대피소만(RF.shelterOf 는 course-kit.test.js 가 봄)
        String hike = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/hike.js")), StandardCharsets.UTF_8);
        assertTrue(hike.contains("var sh = from ? null : RF.shelterOf(shelterData, lastQ);"));
        assertTrue(hike.contains("if (sh && sh.reserve && shelterData.reserveUrl) {"));
        assertTrue("영어 카드 공원 이름도 영어", hike.contains("RF.enName(sh.park) + \" · fees and open dates"));
        assertTrue("영어 카드도 같은 이름 규칙", hike.contains("EN ? RF.enName(sh.name) + \" (\" + sh.name + \")\" : sh.name"));
    }
}
