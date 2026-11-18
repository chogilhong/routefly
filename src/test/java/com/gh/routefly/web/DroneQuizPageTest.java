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
        // 1종 - 100문항 문제 · 보기는 글로, 검색에 냄(noindex 아님). 정답 · 해설 · 근거 · 블로그 링크는 페이지에 없음(2026-11-18 홍TV님 "우리 앱에 들어올 수 있도록" → A) - 문항마다 그 문항부터 푸는 링크
        String c1 = DroneQuizServlet.page(DroneQuizServlet.set(d, "c1"), "https://r.kr/routefly");
        assertEquals(100, c1.split("<li id=\"q", -1).length - 1);
        assertFalse(c1.contains("noindex"));
        assertTrue(c1.contains("<link rel=\"canonical\" href=\"https://r.kr/routefly/drone-quiz/c1\">"));
        assertTrue(c1.contains("<p class=\"dqQ\">30. 주정성분이 있는 음료를 섭취한 경우") && c1.contains("<li>③ 0.02% 이상</li>"));
        assertTrue(c1.contains("href=\"../dronefly.html#quiz-c1-30\">✏️ 풀고 정답 보기 ›</a>") && c1.contains("href=\"../dronefly.html#quiz-c1\""));
        assertFalse(c1.contains("hongtv.tistory.com") || c1.contains("<details"));
        assertFalse("정답 줄 없음", c1.contains("<p>정답 "));
        assertFalse("근거 없음", c1.contains("근거:"));
        assertTrue(c1.contains("실제 시험 문제가 아닙니다"));
        // 4종 · 교관 과정 - 부등호는 이스케이프(원문 "<4.1")
        String c4 = DroneQuizServlet.page(DroneQuizServlet.set(d, "c4"), "https://r.kr/routefly");
        assertEquals(95, c4.split("<li id=\"q", -1).length - 1);
        assertTrue(c4.contains("약함: &lt;4.1(knot/100feet)"));
        assertFalse("블로그 링크도 뺌", c4.contains("hongtv.tistory.com") || c4.contains("<details"));
        String in = DroneQuizServlet.page(DroneQuizServlet.set(d, "inst"), "https://r.kr/routefly");
        assertEquals(65, in.split("<li id=\"q", -1).length - 1);
        assertTrue(in.contains("1번 관련 문제) 국제민간항공협약은 언제 제정되었나요?"));
        assertTrue("관련 문제 번호는 주소에 맞게", in.contains("href=\"../dronefly.html#quiz-inst-1-%EA%B4%80%EB%A0%A8\""));
        // dronefly 화면에서 이 페이지로 · 이 페이지에서 그 시험으로
        String js = new String(Files.readAllBytes(Path.of("src/main/webapp/js/dronefly.js")), StandardCharsets.UTF_8);
        assertTrue(js.contains("var hq = /^#quiz-([a-z0-9]+)(?:-(.+))?$/.exec(quizHash());") && js.contains("if (hq[2]) startQuiz('all', true, hq[2]); else loadQuiz();"));
        assertTrue(js.contains("if (at != null && run.list.indexOf(at) >= 0) run.i = run.list.indexOf(at);") && js.contains("$('quizPage').href = 'drone-quiz/' + $('quizSet').value;"));
        // 그림 해설은 그림이 있는 문항에만 블로그로(2026-11-18 "1번으로") - 4종 28 · 교관 8, 1종 없음
        assertTrue(js.contains("+ (q.post && q.pic ? '<p class=\"small\"><a href=\"https://hongtv.tistory.com/' + q.post"));
        int[] pics = new int[3];
        for (int i = 0; i < 3; i++) for (com.google.gson.JsonElement q : d.getAsJsonArray("sets").get(i).getAsJsonObject().getAsJsonArray("qs")) if (q.getAsJsonObject().has("pic")) pics[i]++;
        assertArrayEquals(new int[] {28, 0, 8}, pics);
    }
}
