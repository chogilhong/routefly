package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 받은 · 연 GPX 점검 한 줄(2026-11-22 홍TV님 - 폰 · 시계로 만든 GPX 를 주고받음). 셈은 course-kit.test.js(RF.gpxCheck). */
public class HikeGpxCheckTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 연_GPX_를_점검() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), kit = read("src/main/webapp/js/kit-hike.js");
        assertTrue("내 GPX 만 · 걷는 중엔 안 물음", js.contains("if (isGpxId(id) && !hike.running) gpxReport(j.trails || []);"));
        assertTrue("한 GPX 에 한 번", js.contains("if (gpxReported[id]) return;"));
        assertTrue("곧은 선 알림", js.contains("if (chk.jumps) toast(T(\"⚠ 이 GPX 에는 곧은 선이 \""));
        assertTrue("같은 공식 코스면 바꿀지 물음 · 그 사이 바뀌었으면 그대로", js.contains("if (yes && c && c.id === id && !hike.running) location.hash = \"c=\" + encodeURIComponent(chk.same.id);"));
        assertTrue(kit.contains("function gpxCheck(track, trails)") && kit.contains("if (Math.min(tl, len) < SAME_SHARE * Math.max(tl, len)) return;"));
    }
}
