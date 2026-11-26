package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.YearMonth;
import java.time.ZoneId;

import org.junit.After;
import org.junit.Test;

/** 목소리 만들기 - 이번 달 글자 수를 파일에 남겨 서버를 다시 켜도 이어 셈(2026-11-26 홍TV님 "50만자 중 기존 얼마를 사용했고 현재 작업은 얼마고"). */
public class VoiceUsageTest {

    @After
    public void clean() { VoiceServlet.resetUsage(null); }

    @Test
    public void 다시_켜도_이어_셈() throws Exception {
        Path f = Files.createTempDirectory("voice").resolve("voice-usage.txt");
        String m = YearMonth.now(ZoneId.of("Asia/Seoul")).toString();
        VoiceServlet.resetUsage(f);
        assertEquals(0, VoiceServlet.used(0));
        assertEquals(120, VoiceServlet.used(120));
        assertEquals(m + " 120", Files.readString(f, StandardCharsets.UTF_8).trim());
        VoiceServlet.resetUsage(f);   // 서버를 다시 켠 셈
        assertEquals("파일에서 이어 읽음", 120, VoiceServlet.used(0));
        assertEquals(150, VoiceServlet.used(30));
        Files.writeString(f, "2026-01 9999\n", StandardCharsets.UTF_8);
        VoiceServlet.resetUsage(f);
        assertEquals("지난달 것이면 0부터", m.equals("2026-01") ? 9999 : 0, VoiceServlet.used(0));
        // 화면 글(js/voice.js usageText 는 voice.test.js)
        assertTrue(new String(Files.readAllBytes(java.nio.file.Paths.get("src/main/webapp/js/voice.js")), StandardCharsets.UTF_8)
                .contains("usageText(monthChars + sent - jobSent, jobSent, jobTotal, LIMIT)"));
    }
}
