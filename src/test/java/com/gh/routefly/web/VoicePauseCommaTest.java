package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 목소리 만들기 쉼만 넣기(2026-11-28 홍TV님 "사용법에 {,} 도 넣어줘, 하산까지{하산까지,} 또는 하산까지 {,}") -
 * 사용법 줄에 예를 적고, 셈(voice.js spoken · shown)은 voice.test.js 가 봄(VoiceJsTest).
 */
public class VoicePauseCommaTest {

    @Test
    public void 사용법에_쉼표_예() throws Exception {
        String java = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/VoiceServlet.java")), StandardCharsets.UTF_8);
        assertTrue(java.contains("쉬어 읽을 곳은 쉼표만 - <code>하산까지{,}</code> 또는 <code>하산까지 {,}</code>(<code>하산까지{하산까지,}</code> 도 같음) → 소리만 쉬고 자막은 그대로."));
        String test = new String(Files.readAllBytes(Paths.get("src/test/js/voice.test.js")), StandardCharsets.UTF_8);
        assertTrue("셈 테스트", test.contains("V.spoken('하산까지 {,} 두 시간'), '하산까지, 두 시간'") && test.contains("V.shown('하산까지 {,} 두 시간'), '하산까지 두 시간'"));
    }
}
