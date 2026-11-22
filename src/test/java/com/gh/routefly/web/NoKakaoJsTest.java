package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assume.assumeTrue;

import java.nio.charset.StandardCharsets;

import org.junit.Test;

/** 카카오톡 → 크롬 # 되돌리기 js/no-kakao.js(2026-11-22 산악회 점검) - src/test/js/no-kakao.test.js 를 node 로 돌림. node 가 없으면 건너뜀(DroneflyJsTest 와 같은 방식). */
public class NoKakaoJsTest {

    @Test
    public void 크롬에서_조각_되돌리기() throws Exception {
        String node = node();
        assumeTrue("node 없음 - 건너뜀", node != null);
        Process p = new ProcessBuilder(node, "src/test/js/no-kakao.test.js").redirectErrorStream(true).start();
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
