package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 카톡 · 파일 앱 GPX 로 앱이 처음 열리면 코스 모음(m/)으로 넘기지 않고 따라가기에서 엶(2026-11-22 홍TV님 폰 SM-N986N 시험 ①:
 * 코스 모음이 뜨고 "따라가기" 를 눌러야 열렸음 - early.js 가 처음 연 화면을 코스 모음으로 넘겼음). 동작은 src/test/js/early-gpx.test.js(node).
 */
public class AppGpxEarlyTest {

    @Test
    public void 받은_GPX_가_있으면_따라가기에_머묾() throws Exception {
        String js = Files.readString(Path.of("src/main/webapp/js/hike.js"), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue("early.js 가 가져간 것을 엶", js.contains("if (window.rfGpxEarly) { var e = window.rfGpxEarly; window.rfGpxEarly = null; got(e); return; }"));
        assertTrue("먼저 가져갔으면 early.js 가 넘기지 않게", js.contains("if (r && (r.text || r.error)) window.rfGpxGot = true;"));
        String node = node();
        assumeTrue("node 없음 - 건너뜀", node != null);
        Process p = new ProcessBuilder(node, "src/test/js/early-gpx.test.js").redirectErrorStream(true).start();
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
