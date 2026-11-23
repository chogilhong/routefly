package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

import org.junit.Assume;
import org.junit.Test;

/**
 * 2026-11-23 우리 지도 패키지(tools 저장소 map/rfmap 을 sync.js 로 복사한 vendor/rfmap-1.0.0)를 그 패키지 테스트로 돌립니다(src/test/js/rfmap.test.js - 복사본, 직접 고치지 않음).
 * 조각 파일은 운영 지도 파일의 사패산 조각(src/test/resources/basemap). node 가 없는 PC 에서는 건너뜁니다.
 */
public class RfmapJsTest {

    @Test
    public void rfmapPackage() throws Exception {
        File script = new File("src/test/js/rfmap.test.js"), lib = new File("src/main/webapp/vendor/rfmap-1.0.0/rfmap.js");
        assertTrue("테스트 스크립트가 없습니다: " + script.getAbsolutePath(), script.isFile());
        assertTrue("패키지 복사본이 없습니다: " + lib.getAbsolutePath(), lib.isFile());
        Process p;
        try {
            p = new ProcessBuilder("node", script.getPath(), lib.getPath(), "src/test/resources/basemap/omt-z12-3493-1583.pbf").redirectErrorStream(true).start();
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
