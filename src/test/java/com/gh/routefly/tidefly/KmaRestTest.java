package com.gh.routefly.tidefly;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * 기상청 API허브 쉬기(2026-11-18 PC 운영 로그: 배포 직후 [SEA] 158칸 → HTTP 403 150줄 → 연결이 막혀 5초마다 연결 시간 초과 2,600줄).
 */
public class KmaRestTest {

    @Test
    public void 막히면_쉼() throws Exception {
        long now = 1_000_000L;
        assertEquals(now + 60 * 60_000L, TideflyServlet.kmaRest(403, 0, now));   // 키 · 한도 · 막힘
        assertEquals(now + 60 * 60_000L, TideflyServlet.kmaRest(401, 0, now));
        assertEquals(0, TideflyServlet.kmaRest(-1, 4, now));                     // 연결 실패 4번까지는 그대로
        assertEquals(now + 15 * 60_000L, TideflyServlet.kmaRest(-1, 5, now));    // 5번 연달아면 15분
        assertEquals(0, TideflyServlet.kmaRest(200, 9, now));
        assertEquals(0, TideflyServlet.kmaRest(500, 0, now));                    // 서버 오류 한 번은 칸마다의 10분 쉬기(SEA_FAIL_MS)로
        String s = new String(Files.readAllBytes(Path.of("src/main/java/com/gh/routefly/tidefly/TideflyServlet.java")), StandardCharsets.UTF_8);
        assertTrue("쉬는 동안은 묻지 않음", s.contains("if (System.currentTimeMillis() < kmaRestUntil) return null;"));
        assertTrue("첫 바퀴는 소해구 예측을 묻지 않음", s.contains("if (key != null && !firstWarm) for (JsonObject p : points().values()) {"));
        assertTrue(s.contains("kmaSeen(res.statusCode(), tag);") && s.contains("kmaSeen(-1, tag);"));
    }
}
