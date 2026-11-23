package com.gh.routefly.web;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * GPX 편집에서 그린 곧은 선(2026-11-22 점검): "다 그림" 이 곧은 선 위에도 30m 마다 점을 채워 올리기 · 보내기 검사(longestJump · CourseUploadServlet.check)를 피했음.
 * 점 채우기는 course-kit.test.js(RF.densify).
 */
public class StudioStraightTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 그린_곧은_선은_올리기_보내기_전에_막음() throws Exception {
        String js = read("src/main/webapp/js/studio.js");
        assertTrue(js.contains("var dense = RF.densify(t, 30, RF.JOIN_GAP_M);"));
        assertFalse("예전 채우기(한도 없이 30m 마다)가 남지 않게", js.contains("k = Math.floor(d / 30);"));
        assertTrue("올리기 · 보내기 둘 다 같은 검사", js.contains("if (!c || jumpBlocked(c, \"코스로 올릴\")) return;") && js.contains("if (!c || jumpBlocked(c, \"등록 요청할\")) return;"));
        assertTrue("다 그린 뒤 곧은 선을 알림", js.contains("if (jump.m > RF.JOIN_GAP_M) msg(\"새 길을 목록에 넣었습니다. 다만 \""));
        // 서버 한도와 같음
        assertTrue(CourseUploadServlet.JUMP_MAX_M == 200 && read("src/main/webapp/js/course-kit.js").contains("var JOIN_GAP_M = 200;"));
    }
}
