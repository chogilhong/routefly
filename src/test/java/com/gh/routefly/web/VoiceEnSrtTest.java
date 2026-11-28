package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 목소리 만들기 "⬇ 영어 srt" - 🌐 영어 자막 글(한 줄 = 한 장면)을 지금 소리의 줄 시각 그대로(2026-11-28 홍TV님). 셈은 voice.test.js enSrt. */
public class VoiceEnSrtTest {

    @Test
    public void 영어_srt_단추와_글_칸() throws Exception {
        String java = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/VoiceServlet.java")), StandardCharsets.UTF_8);
        assertTrue("⬇ srt 옆에 ⬇ 영어 srt", java.contains("<button id=\\\"vcSrt\\\">⬇ srt</button><button id=\\\"vcSrtEn\\\""));
        assertTrue("🌐 영어 자막 글 칸", java.contains("<textarea id=\\\"vcEn\\\""));
        String js = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/voice.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue("지금 소리의 줄 시각으로", js.contains("var r = enSrt($('vcEn').value, j.times);"));
        assertTrue("파일 이름 .en.srt", js.contains("fileName() + '.en.srt'"));
        assertTrue("줄 수가 다르면 안 만듦", js.contains("if (en.length !== n) return { error:"));
    }
}
