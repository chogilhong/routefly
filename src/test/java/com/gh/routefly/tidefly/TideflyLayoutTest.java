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

    @Test
    public void 카드_칸은_minmax_0_이라_물때표_띠가_화면을_넓히지_않음() throws Exception {
        String css = Files.readString(Path.of("src/main/webapp/css/tidefly.css"), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue(css.contains(".cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr);"));
        assertTrue("날짜 띠는 안에서 옆으로 밀림", css.contains(".tstrip { display: flex; gap: 4px; overflow-x: auto;"));
    }
}
