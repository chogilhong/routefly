package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.junit.Test;

/**
 * 2026-10-11 오픈 전 점검 - CSP script-src 'self' 가 지켜지는지: 화면 안 스크립트(inline) · javascript: 주소 · on…= 속성이 없어야
 * 브라우저가 우리 js 파일만 돌립니다(이름 등에 스크립트가 끼어들어도 돌지 않음).
 */
public class LaunchSecurityTest {

    @Test
    public void cspAllowsOnlyOwnScripts() {
        assertTrue(SecurityFilter.CSP.contains("script-src 'self';"));
        assertFalse("inline · eval 허용 없음", SecurityFilter.CSP.matches(".*script-src[^;]*'unsafe-(inline|eval)'.*"));
        assertTrue("지도 일꾼(blob)", SecurityFilter.CSP.contains("worker-src 'self' blob:"));
        assertTrue(SecurityFilter.CSP.contains("frame-ancestors 'self'"));
        assertTrue(SecurityFilter.CSP.contains("object-src 'none'"));
    }

    @Test
    public void pagesHaveNoInlineScript() throws Exception {
        Pattern inline = Pattern.compile("<script(?![^>]*\\bsrc=)[^>]*>", Pattern.CASE_INSENSITIVE);
        Pattern handler = Pattern.compile("\\son[a-z]+\\s*=", Pattern.CASE_INSENSITIVE);
        try (Stream<Path> files = Files.list(Path.of("src/main/webapp"))) {
            for (Path p : (Iterable<Path>) files.filter(f -> f.toString().endsWith(".html"))::iterator) {
                String h = Files.readString(p, StandardCharsets.UTF_8);
                Matcher m = inline.matcher(h);
                assertFalse(p + " 화면 안 스크립트: " + (m.find() ? m.group() : ""), inline.matcher(h).find());
                assertFalse(p + " on…= 속성", handler.matcher(h).find());
                assertFalse(p + " javascript: 주소", h.toLowerCase().contains("javascript:"));
            }
        }
    }
}
