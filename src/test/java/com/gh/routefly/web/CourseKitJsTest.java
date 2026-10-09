package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

import org.junit.Assume;
import org.junit.Test;

/**
 * 2026-10-09 course-kit.js 순수 함수(거리 · 위치 · 되돌아가기 · 기록 그래프 …)를 node 로 돌립니다(src/test/js/course-kit.test.js).
 * node 가 없는 PC 에서는 건너뜁니다.
 */
public class CourseKitJsTest {

    @Test
    public void courseKitPureFunctions() throws Exception {
        File script = new File("src/test/js/course-kit.test.js");
        assertTrue("테스트 스크립트가 없습니다: " + script.getAbsolutePath(), script.isFile());
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
