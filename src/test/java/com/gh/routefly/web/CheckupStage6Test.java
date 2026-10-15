package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.junit.Test;

/** 2026-10-16 6차 점검(10-15 ~ 16 에 넣은 산 페이지 · 영어 · 난이도 · 안내판 · 통계가 서로 맞물리는지). */
public class CheckupStage6Test {

    private static String read(String... p) throws Exception {
        return Files.readString(Path.of("src", p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void everyRfFunctionUsedExists() throws Exception {
        String kit = read("main", "webapp", "js", "course-kit.js");
        int i = kit.indexOf("global.RF = {"), j = kit.indexOf("};", i);
        Set<String> exported = new TreeSet<>();
        Matcher m = Pattern.compile("(\\w+)\\s*:\\s*\\w+").matcher(kit.substring(i, j));
        while (m.find()) exported.add(m.group(1));
        Set<String> missing = new TreeSet<>();
        try (Stream<Path> files = Files.list(Path.of("src", "main", "webapp", "js"))) {
            for (Path f : (Iterable<Path>) files::iterator) {
                if (f.getFileName().toString().equals("course-kit.js") || !f.toString().endsWith(".js")) continue;
                Matcher u = Pattern.compile("\\bRF\\.(\\w+)").matcher(Files.readString(f, StandardCharsets.UTF_8));
                while (u.find()) if (!exported.contains(u.group(1))) missing.add(f.getFileName() + ":" + u.group(1));
            }
        }
        assertEquals("화면 스크립트가 부르는 RF 함수는 course-kit.js 가 내보내야 함", Set.of(), missing);
    }

    @Test
    public void difficultyStepsSameInJavaAndJs() throws Exception {
        String kit = read("main", "webapp", "js", "course-kit.js");
        assertTrue(kit.contains("HOUR_STEPS = [1.5, 3, 5, 8], ASC_STEPS = [300, 700, 1100, 1500], STEEP_STEPS = [20, 28, 36, 46]"));
        assertArrayEquals(new double[] {1.5, 3, 5, 8}, MountainServlet.HOUR_STEPS, 0);
        assertArrayEquals(new double[] {300, 700, 1100, 1500}, MountainServlet.ASC_STEPS, 0);
        assertArrayEquals(new double[] {20, 28, 36, 46}, MountainServlet.STEEP_STEPS, 0);
        assertEquals("단계 이름 수", 5, MountainServlet.LEVELS.length);
        for (String[] lv : MountainServlet.LEVELS) assertTrue(lv[0], kit.contains("{ ko: \"" + lv[0] + "\", en: \"" + lv[1] + "\""));
    }

    @Test
    public void mountainPagesShareBoardStyles() throws Exception {
        String css = read("main", "webapp", "css", "mountain.css"), kitCss = read("main", "webapp", "css", "course-kit.css");
        assertFalse("안내판 · 난이도 모양은 course-kit.css 한 곳에", css.contains(".rf-board {") || css.contains(".lv0 {") || css.contains(".rfBoardBox {"));
        assertTrue(kitCss.contains(".rf-board {") && kitCss.contains(".lv0 {") && kitCss.contains(".rfBoardBox {"));
        String page = MountainServlet.notFoundPage("x", "b"), en = MountainEn.notFoundPage("x", "b");
        for (String h : new String[] {page, en})
            assertTrue("산 페이지가 course-kit.css 를 먼저 읽음", h.indexOf("/css/course-kit.css") > 0 && h.indexOf("/css/course-kit.css") < h.indexOf("/css/mountain.css"));
        assertTrue("오프라인 저장에도", read("main", "webapp", "js", "course-kit.js").contains("rel + \"/css/course-kit.css\", rel + \"/css/mountain.css\""));
    }

    @Test
    public void heightsAreOfficialOnly() throws Exception {
        for (String f : new String[] {"MountainServlet.java", "MountainEn.java", "OgServlet.java"})
            assertFalse(f + " 는 GPS height 를 화면에 쓰지 않음", read("main", "java", "com", "gh", "routefly", "web", f).contains("get(\"height\")"));
        assertTrue("코스 응답도 공식 높이", read("main", "java", "com", "gh", "routefly", "web", "CourseServlet.java").contains("Peaks.applyDetail(detail, Peaks.tops(getServletContext()), Peaks.shelters(getServletContext()));"));
    }

    @Test
    public void voiceCatchesSkippedPoints() throws Exception {
        String h = read("main", "webapp", "js", "hike.js");
        assertTrue("지난번과 지금 사이에 지나친 지점도", h.contains("(prev < qd && qd <= d)"));
        assertTrue("3km 넘게 튀면 그 사이는 말하지 않음", h.contains("d - hike.voiceD < 3000"));
        assertTrue("안내판 지점 = 음성 지점", h.contains("!(+q.off_route_m > (RF.isTopName(q.name) ? 160 : 80))"));
    }
}
