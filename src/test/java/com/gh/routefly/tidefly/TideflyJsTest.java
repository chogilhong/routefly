package com.gh.routefly.tidefly;

import static org.junit.Assert.assertEquals;
import static org.junit.Assume.assumeTrue;

import java.nio.charset.StandardCharsets;

import org.junit.Test;

/** 타이드플라이 화면 js/tidefly.js 의 순수 함수 - src/test/js/tidefly.test.js 를 node 로 돌림. node 가 없으면 건너뜀(routefly CourseKitJsTest 와 같은 방식). */
public class TideflyJsTest {

    @Test
    public void 화면_순수_함수() throws Exception {
        String node = node();
        assumeTrue("node 없음 - 건너뜀", node != null);
        Process p = new ProcessBuilder(node, "src/test/js/tidefly.test.js").redirectErrorStream(true).start();
        String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertEquals(out, 0, p.waitFor());
    }

    private static String node() {
        for (String c : new String[] {"node", "C:\\Program Files\\nodejs\\node.exe"}) {
            try {
                Process p = new ProcessBuilder(c, "--version").redirectErrorStream(true).start();
                p.getInputStream().readAllBytes();
                if (p.waitFor() == 0) return c;
            } catch (Exception e) {
                // 다음 후보
            }
        }
        return null;
    }
}
