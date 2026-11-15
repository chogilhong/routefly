package com.gh.routefly.tidefly;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 타이드플라이 화면 폭(2026-11-15 PC: 폰 375px 에서 물때표를 펴면 날짜 띠 986px 이 카드를 넓혀 문서 폭 1036px). */
public class TideflyLayoutTest {

    /** 물때 파일 폴더(2026-11-15 PC: 운영 /opt/tomcat/routefly-tidefly-cache 가 AccessDenied → stats.dir 아래로). */
    @Test
    public void 물때_파일_폴더는_설정_다음_stats_dir() {
        String sep = java.io.File.separator;
        org.junit.Assert.assertEquals(Path.of("/x/tf", "tide"), TideflyServlet.cacheDir("/x/tf", "/opt/routefly/stats", "/opt/tomcat", "/tmp"));
        org.junit.Assert.assertEquals(Path.of("/opt/routefly/stats" + sep + "tidefly-cache", "tide"), TideflyServlet.cacheDir(null, "/opt/routefly/stats", "/opt/tomcat", "/tmp"));
        org.junit.Assert.assertEquals(Path.of("/opt/routefly/stats" + sep + "tidefly-cache", "tide"), TideflyServlet.cacheDir(" ", "/opt/routefly/stats", "/opt/tomcat", "/tmp"));
        org.junit.Assert.assertEquals(Path.of("/opt/tomcat" + sep + "routefly-tidefly-cache", "tide"), TideflyServlet.cacheDir(null, null, "/opt/tomcat", "/tmp"));
        org.junit.Assert.assertEquals(Path.of("/tmp" + sep + "routefly-tidefly-cache", "tide"), TideflyServlet.cacheDir(null, "", null, "/tmp"));
    }

    /** 2026-11-15 PC: 포털 429 뒤에도 화면 요청이 연달아 물었음 - 429 면 30분 쉼. */
    @Test
    public void 포털_429_면_30분_쉼() {
        org.junit.Assert.assertEquals(1_000 + 30 * 60_000L, TideflyServlet.restUntil(429, 1_000));
        org.junit.Assert.assertEquals(0, TideflyServlet.restUntil(503, 1_000));
        org.junit.Assert.assertEquals(0, TideflyServlet.restUntil(500, 1_000));
    }

    /** 2026-11-15 PC: 배포 뒤 첫 손님 전까지 [TIDEFLY] 줄 0 - 서블릿이 첫 요청 때에야 떠서 미리 받기가 늦었음. */
    @Test
    public void 웹앱이_뜰_때_미리_받기_시작() {
        jakarta.servlet.annotation.WebServlet w = TideflyServlet.class.getAnnotation(jakarta.servlet.annotation.WebServlet.class);
        org.junit.Assert.assertTrue(java.util.Arrays.asList(w.urlPatterns()).contains("/api/tidefly"));
        org.junit.Assert.assertTrue("loadOnStartup 이 있어야 뜰 때 init", w.loadOnStartup() >= 0);
    }

    @Test
    public void 카드_칸은_minmax_0_이라_물때표_띠가_화면을_넓히지_않음() throws Exception {
        String css = Files.readString(Path.of("src/main/webapp/css/tidefly.css"), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue(css.contains(".cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr);"));
        assertTrue("날짜 띠는 안에서 옆으로 밀림", css.contains(".tstrip { display: flex; gap: 4px; overflow-x: auto;"));
    }
}
