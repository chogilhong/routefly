package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;

/**
 * 없어진 코스 주소(배치 재실행으로 끝 해시가 바뀜)는 같은 산 페이지로 301(2026-11-08 홍TV님 "작업해" - 구글 색인 예시 연화산 코스 넷이 404).
 * 같은 묶음 코스는 운영 /api/courses?q= 실제 응답(2026-11-08 받음)에서 그 앞부분만 고름 - CourseQueries.sameGroup 과 같은 LIKE '앞부분%'.
 */
public class CourseMovedTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");   // PC(core.autocrlf)는 CRLF
    }

    private static JsonArray peaks() throws Exception {
        return JsonParser.parseString(read("src/main/webapp/data/mountains100.json")).getAsJsonObject().getAsJsonArray("peaks");
    }

    /** 실제 목록 응답에서 그 코스 ID 와 같은 묶음(CourseQueries.groupPrefix)만. */
    private static JsonArray group(String file, String goneId) throws Exception {
        String p = CourseQueries.groupPrefix(goneId);
        JsonArray out = new JsonArray();
        for (JsonElement e : JsonParser.parseString(read(file)).getAsJsonObject().getAsJsonArray("courses"))
            if (p != null && e.getAsJsonObject().get("course_id").getAsString().startsWith(p)) out.add(e);
        return out;
    }

    @Test
    public void goneCourseGoesToMountain() throws Exception {
        JsonArray same = group("src/test/resources/course/courses-q-연화산.json", "frst-488205101-3f5aca");   // 구글 색인 예시 - 지금 404
        assertEquals("같은 산 코드 코스 24개", 24, same.size());
        assertEquals("연화산", CoursePageServlet.movedPeak(peaks(), same));
    }

    @Test
    public void notFamousMountainStays404() throws Exception {
        JsonArray same = group("src/test/resources/course/courses-q-가야산.json", "frst-462300101-000000");   // 광양 가야산 - 100대 명산 아님
        assertTrue(same.size() > 0);
        assertNull("100대 명산에 안 닿으면 404 그대로", CoursePageServlet.movedPeak(peaks(), same));
        assertNull("묶음이 없으면", CoursePageServlet.movedPeak(peaks(), new JsonArray()));
    }

    @Test
    public void wiredAs301() throws Exception {
        String src = read("src/main/java/com/gh/routefly/web/CoursePageServlet.java");
        assertTrue(src.contains("if (rows.size() == 0) same = CourseQueries.sameGroup(c, id);"));
        assertTrue(src.contains("resp.setStatus(HttpServletResponse.SC_MOVED_PERMANENTLY);") && src.contains("resp.setHeader(\"Location\", base + \"/m/\" + MountainServlet.enc(peakId));"));
    }

    /** route.html · park.html 은 같은 빈 틀이라 꼬리만 다른 주소가 중복 62개로 잡혔음(2026-11-08 Search Console) - 화면이 열쇠 하나만 남긴 canonical 을 닮. 규칙은 course-kit.test.js. */
    @Test
    public void routeParkCanonical() throws Exception {
        assertTrue(read("src/main/webapp/js/route.js").contains("RF.setCanonical([\"trail\", \"prefix\"]);"));
        assertTrue(read("src/main/webapp/js/park.js").contains("RF.setCanonical([\"name\"]);"));
        assertTrue("작은 course-kit 에도", read("src/main/webapp/js/kit-route.js").contains("function canonicalHref(") && read("src/main/webapp/js/kit-park.js").contains("function setCanonical("));
    }
}
