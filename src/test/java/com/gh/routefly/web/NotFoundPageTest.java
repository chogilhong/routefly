package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 없는 주소 · 옛 주소(2026-11-12 점검 9차 - 톰캣 기본 404 에 링크가 없었고, 예전 subway.html · /en/ 이 404). */
public class NotFoundPageTest {

    @Test
    public void oldAddressesMove() {
        assertEquals("/tools.html", NotFoundServlet.moved("/subway.html"));
        assertEquals("/en/m/", NotFoundServlet.moved("/en/"));
        assertEquals("/en/m/", NotFoundServlet.moved("/en"));
        assertNull(NotFoundServlet.moved("/notfound"));
    }

    @Test
    public void pageHasLinksAndNoEcho() throws Exception {
        String h = NotFoundServlet.page("/routefly");
        assertTrue(h.contains("href=\"/routefly/m/\"") && h.contains("href=\"/routefly/hike.html\"") && h.contains("href=\"/routefly/en/m/\""));
        assertTrue("검색에 안 나오게", h.contains("<meta name=\"robots\" content=\"noindex\">"));
        String xml = new String(Files.readAllBytes(Path.of("src/main/webapp/WEB-INF/web.xml")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue("404 는 이 화면", xml.contains("<error-code>404</error-code>\n        <location>/notfound</location>"));
        assertTrue("서블릿 · 필터는 어노테이션 그대로", xml.contains("metadata-complete=\"false\""));
        String src = new String(Files.readAllBytes(Path.of("src/main/java/com/gh/routefly/web/NotFoundServlet.java")), StandardCharsets.UTF_8);
        assertTrue("받은 주소를 화면에 쓰지 않음", !src.contains("getRequestURI") && !src.contains("error.request_uri"));
    }
}
