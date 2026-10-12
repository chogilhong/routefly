package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.List;

import jakarta.servlet.annotation.WebFilter;

import org.junit.Test;

/** 화면 파일 · 자료 파일은 늘 새로 묻기(no-cache) - 배포가 바로 보이게. */
public class NoStaleFilterTest {

    @Test
    public void coversScreenAndDataFiles() {
        List<String> p = Arrays.asList(NoStaleFilter.class.getAnnotation(WebFilter.class).urlPatterns());
        for (String want : new String[] {"*.html", "*.js", "*.css", "/data/*"}) assertTrue(want + " 이 빠짐: " + p, p.contains(want));
    }
}
