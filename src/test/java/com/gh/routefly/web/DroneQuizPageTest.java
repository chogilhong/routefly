package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.Test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** 드론 필기 문항 페이지(/drone-quiz/c4 · c1 · inst) · 사이트맵(2026-11-18 홍TV님 "드론 문제들도 모두 sitemap 에 등록해줘"). */
public class DroneQuizPageTest {

    private static JsonObject data() throws Exception {
        return JsonParser.parseString(Files.readString(Path.of("src/main/webapp/data/drone-quiz.json"), StandardCharsets.UTF_8)).getAsJsonObject();
    }

    @Test
    public void 문항_페이지와_사이트맵() throws Exception {
        String sm = SitemapServlet.sitemap("https://r.kr/routefly", List.of(), List.of());
        for (String id : new String[] {"c4", "c1", "inst"}) assertTrue(id, sm.contains("<loc>https://r.kr/routefly/drone-quiz/" + id + "</loc>"));
        JsonObject d = data();
        assertNull(DroneQuizServlet.set(d, "x"));
        assertNull("../ 같은 것도 없음", DroneQuizServlet.set(d, "../c1"));
        // 1종 - 100문항 모두 글로, 정답 · 근거, 검색에 냄(noindex 아님), 풀어 보기는 dronefly.html#quiz-c1
        String c1 = DroneQuizServlet.page(DroneQuizServlet.set(d, "c1"), "https://r.kr/routefly");
        assertEquals(100, c1.split("<li id=\"q", -1).length - 1);
        assertFalse(c1.contains("noindex"));
        assertTrue(c1.contains("<link rel=\"canonical\" href=\"https://r.kr/routefly/drone-quiz/c1\">"));
        assertTrue(c1.contains("<p class=\"dqQ\">30. 주정성분이 있는 음료를 섭취한 경우") && c1.contains("<p>정답 ③ 0.02% 이상</p>"));
        assertTrue(c1.contains("근거: 항공안전법 제2조제8호") && c1.contains("href=\"../dronefly.html#quiz-c1\""));
        assertTrue(c1.contains("실제 시험 문제가 아닙니다"));
        // 4종 · 교관 과정 - 블로그 글 링크, 부등호는 이스케이프(원문 "<4.1")
        String c4 = DroneQuizServlet.page(DroneQuizServlet.set(d, "c4"), "https://r.kr/routefly");
        assertEquals(95, c4.split("<li id=\"q", -1).length - 1);
        assertTrue(c4.contains("href=\"https://hongtv.tistory.com/145\"") && c4.contains("약함: &lt;4.1(knot/100feet)"));
        String in = DroneQuizServlet.page(DroneQuizServlet.set(d, "inst"), "https://r.kr/routefly");
        assertEquals(65, in.split("<li id=\"q", -1).length - 1);
        assertTrue(in.contains("1번 관련 문제) 국제민간항공협약은 언제 제정되었나요?"));
        // dronefly 화면에서 이 페이지로 · 이 페이지에서 그 시험으로
        String js = new String(Files.readAllBytes(Path.of("src/main/webapp/js/dronefly.js")), StandardCharsets.UTF_8);
        assertTrue(js.contains("var hq = /^#quiz-([a-z0-9]+)$/.exec(location.hash);") && js.contains("$('quizPage').href = 'drone-quiz/' + $('quizSet').value;"));
    }
}
