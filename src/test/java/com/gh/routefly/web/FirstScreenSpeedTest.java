package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.File;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServletRequest;

import org.junit.Assume;
import org.junit.Test;

/**
 * 첫 화면 속도(2026-11-02 홍TV님 "첫 화면이 열리는 시간을 재서 느린 곳부터") - 운영 화면을 느린 4G(왕복 150ms · 1.6Mbps · CPU 4배 느리게)로 잰 뒤 고친 것.
 *  - 사이트 첫 주소(/)는 작은 넘김 화면(root.html): 예전엔 3D 화면(index.html)이라 넘기기 전에 MapLibre · app.js 를 미리 받아 코스 모음이 0.6초쯤 늦었음
 *  - 따라가기: 지도 설정(api/map-config)을 머리(early.js)에서 미리 묻고, 타일 곳(s3 · V-World)에 미리 연결
 *  - 카카오맵 아이콘 600px 27KB → 96px
 *  - 산불조심기간 안내를 서버가 html 에(코스 모음 · 산 페이지 - 스크립트가 늦게 넣어 아래 칸이 밀렸음, CLS 0.2~0.7)
 */
public class FirstScreenSpeedTest {

    private static String web(String p) throws Exception {
        return Files.readString(Path.of("src/main/webapp", p), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void rootIsSmallRedirectPage() throws Exception {
        assertArrayEquals("빈 매핑 - 첫 주소 하나만", new String[] {""}, RootPageServlet.class.getAnnotation(WebServlet.class).urlPatterns());
        String root = web(RootPageServlet.PAGE.substring(1)), index = web("index.html");
        List<String> scripts = new ArrayList<>();
        Matcher m = Pattern.compile("<script src=\"([^\"]+)\"").matcher(root);
        while (m.find()) scripts.add(m.group(1));
        assertEquals("넘기는 스크립트 하나만", List.of("js/root-go.js"), scripts);
        assertTrue("head 에서 먼저(그리기 전에 넘김)", root.indexOf("js/root-go.js") < root.indexOf("<title>"));
        assertFalse("3D 화면 파일(스타일 · 미리 받기)을 부르지 않음", root.contains("<link rel=\"stylesheet\"") || root.contains("rel=\"preload\"") || root.contains("rel=\"manifest\""));
        // 카톡 · 검색 미리보기(스크립트를 안 돌림)는 예전 첫 주소(index.html)와 같은 글 · 그림
        Matcher meta = Pattern.compile("<meta (?:property=\"og:[a-z]+\"|name=\"description\") content=\"[^\"]*\">|<link rel=\"canonical\"[^>]*>").matcher(index);
        int n = 0;
        while (meta.find()) { assertTrue(meta.group(), root.contains(meta.group())); n++; }
        assertEquals("og 넷 · 설명 · canonical", 6, n);
        assertTrue("3D 화면은 그대로 넘김 스크립트를 먼저", index.indexOf("<script src=\"js/root-go.js\"></script>") < index.indexOf("maplibre-gl.js"));
        assertTrue("신호 없을 때 예전 공유 링크(#c=)도 3D 화면", web("sw.js").contains("\"./\", \"index.html\", "));
    }

    @Test
    public void rootServletForwardsToPage() throws Exception {
        List<String> to = new ArrayList<>();
        RequestDispatcher rd = (RequestDispatcher) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {RequestDispatcher.class},
                (p, m, a) -> { if ("forward".equals(m.getName())) to.add("forward"); return null; });
        HttpServletRequest req = (HttpServletRequest) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (p, m, a) -> { if ("getRequestDispatcher".equals(m.getName())) { to.add((String) a[0]); return rd; } return null; });
        new RootPageServlet().doGet(req, null);
        assertEquals(List.of("/root.html", "forward"), to);
    }

    @Test
    public void hikeAsksMapConfigEarly() throws Exception {
        String hike = web("hike.html"), js = web("js/hike.js");
        assertTrue("early.js(머리)가 hike.js 보다 먼저", hike.indexOf("<script src=\"js/early.js\">") < hike.indexOf("<script src=\"js/hike.js\">")
                && hike.indexOf("<script src=\"js/early.js\">") < hike.indexOf("</head>"));
        assertTrue("미리 물어 둔 답을 씀(없으면 예전처럼)", js.contains("(window.rfMapCfg ? window.rfMapCfg.then(readJson) : getJson(\"api/map-config\")).catch("));
        for (String h : new String[] {hike, web("index.html")}) {
            assertTrue("타일 곳 미리 연결", h.contains("<link rel=\"preconnect\" href=\"https://s3.amazonaws.com\" crossorigin>")
                    && h.contains("<link rel=\"preconnect\" href=\"https://api.vworld.kr\" crossorigin>"));
            assertTrue("스타일보다 먼저", h.indexOf("preconnect") < h.indexOf("maplibre-gl.css"));
        }
        assertTrue("기본 지형 주소와 같은 곳", MapConfigServlet.DEFAULT_DEM_URL.startsWith("https://s3.amazonaws.com/"));
    }

    @Test
    public void kakaoIconIsSmall() throws Exception {
        byte[] png = Files.readAllBytes(Path.of("src/main/webapp/img/kakaomap.png"));
        assertTrue("16 · 22px 로 보이는 아이콘 - " + png.length + " 바이트", png.length < 8 * 1024);
        ByteBuffer b = ByteBuffer.wrap(png);
        assertEquals("가로", 96, b.getInt(16));
        assertEquals("세로", 96, b.getInt(20));
    }

    @Test
    public void fireNoteIsInHtml() throws Exception {
        long autumn = java.time.ZonedDateTime.of(2026, 11, 2, 9, 0, 0, 0, java.time.ZoneOffset.ofHours(9)).toInstant().toEpochMilli();
        // course-kit.test.js 의 fireNote 와 같은 경계(한국 날짜)
        assertEquals(List.of(true, true, false, true, false, true, false), List.of(
                !MountainServlet.fireNote(java.time.Instant.parse("2026-02-01T00:00:00Z").toEpochMilli()).isEmpty(),
                !MountainServlet.fireNote(java.time.Instant.parse("2026-05-15T14:00:00Z").toEpochMilli()).isEmpty(),
                !MountainServlet.fireNote(java.time.Instant.parse("2026-05-15T15:00:00Z").toEpochMilli()).isEmpty(),
                MountainServlet.fireNote(java.time.Instant.parse("2026-11-01T00:00:00Z").toEpochMilli()).contains("가을철"),
                !MountainServlet.fireNote(java.time.Instant.parse("2026-10-31T14:00:00Z").toEpochMilli()).isEmpty(),
                !MountainServlet.fireNote(java.time.Instant.parse("2026-12-15T14:59:00Z").toEpochMilli()).isEmpty(),
                !MountainServlet.fireNote(java.time.Instant.parse("2026-12-15T15:00:00Z").toEpochMilli()).isEmpty()));
        String kit = web("js/course-kit.js");
        assertTrue("글이 course-kit.js(따라가기 · 3D)와 같음", kit.contains("\"🔥 \" + season + \" 산불조심기간 - 일부 탐방로는 입산이 통제되고 산에서 불 · 담배는 금지입니다. 현지 안내판 · 공원 누리집을 확인하세요.\""));
        String html = MountainServlet.withFire("<main><h1>x</h1><p class=\"lead\">설명</p><section id=\"near\"></section><p class=\"lead\">둘째</p>", autumn);
        assertEquals("첫 설명 바로 아래 한 번", "<main><h1>x</h1><p class=\"lead\">설명</p><p class=\"fire\">" + MountainServlet.fireNote(autumn).replace("<", "&lt;")
                + "</p><section id=\"near\"></section><p class=\"lead\">둘째</p>", html);
        assertEquals("기간이 아니면 그대로", "<p class=\"lead\">a</p>", MountainServlet.withFire("<p class=\"lead\">a</p>", java.time.Instant.parse("2026-07-01T00:00:00Z").toEpochMilli()));
        assertEquals("설명이 없는 화면은 그대로", "<p>a</p>", MountainServlet.withFire("<p>a</p>", autumn));
        String js = web("js/mountain.js");
        assertTrue("이미 있으면 스크립트가 다시 넣지 않음", js.contains("if (lead && fire && !fireP) {"));
        assertTrue("받아 둔 옛 화면은 기간이 지나면 뺌", js.contains("if (fireP && window.RF && !fire) fireP.parentNode.removeChild(fireP);"));
    }

    @Test
    public void fireNoteWiredForKoreanPages() throws Exception {
        String src = Files.readString(Path.of("src/main/java/com/gh/routefly/web/MountainServlet.java"), StandardCharsets.UTF_8);
        for (String page : new String[] {"withFire(indexPage(", "withFire(choosePage(", "withFire(page(peak, "})
            assertTrue("코스 모음 · 같은 이름 고르기 · 산 페이지 - " + page, src.contains("resp.getWriter().print(" + page));
        assertFalse("영어 화면(mountain-en.js)에는 산불 안내가 없음 - 그대로", src.contains("withFire(MountainEn."));
    }

    @Test
    public void jsChecksPass() throws Exception {
        File script = new File("src/test/js/first-screen.test.js");
        assertTrue(script.isFile());
        Process p;
        try {
            p = new ProcessBuilder("node", script.getPath()).redirectErrorStream(true).start();
        } catch (java.io.IOException e) {
            Assume.assumeNoException("node 가 없어 건너뜁니다", e);
            return;
        }
        String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertTrue("node 가 끝나지 않았습니다", p.waitFor(60, TimeUnit.SECONDS));
        assertEquals(out, 0, p.exitValue());
        assertTrue(out, out.contains("OK "));
    }
}
