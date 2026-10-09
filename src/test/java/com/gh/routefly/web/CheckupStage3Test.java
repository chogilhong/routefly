package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-10-09 2차 점검 3단계(화면 · 보안) - totonian 점검과 같은 항목 포함(WAR 에 진짜 설정 막기, HSTS, noindex). */
public class CheckupStage3Test {

    private static String read(String path) throws Exception {
        return Files.readString(Path.of(path), StandardCharsets.UTF_8);
    }

    @Test
    public void realConfigNeverPackaged() throws Exception {
        assertTrue(read("pom.xml").contains("<packagingExcludes>WEB-INF/config.properties,WEB-INF/classes/config.properties</packagingExcludes>"));
        assertFalse("진짜 설정이 resources 에 없음", Files.exists(Path.of("src/main/resources/config.properties")));
    }

    @Test
    public void headersForApiAndHttps() throws Exception {
        String f = read("src/main/java/com/gh/routefly/web/SecurityFilter.java");
        assertTrue(f.contains("if (req.isSecure()) res.setHeader(\"Strict-Transport-Security\""));
        assertTrue(f.contains("res.setHeader(\"X-Robots-Tag\", \"noindex\")"));
    }

    @Test
    public void phoneScreensCanZoomAndButtonsAreBigEnough() throws Exception {
        String hike = read("src/main/webapp/hike.html"), index = read("src/main/webapp/index.html");
        assertFalse("글자를 키울 수 있게", hike.contains("user-scalable=no"));
        assertTrue(hike.contains("#sos { margin-left:2px; height:36px;"));
        assertTrue(index.contains(".tools button { flex:1 1 auto; min-width:0; height:36px;"));
        assertTrue(index.contains(".kinds button { flex:1; height:34px;"));
    }
}
