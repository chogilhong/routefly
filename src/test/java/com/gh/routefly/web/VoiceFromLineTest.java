package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 목소리 만들기 "▶ 이어 듣기 [n]번" - 적은 번호 줄부터 듣기(2026-11-28 홍TV님 "17을 적고 클릭 시 그 항목부터 이어 듣게"). 셈은 voice.test.js lineStart. */
public class VoiceFromLineTest {

    @Test
    public void 적은_번호_줄부터() throws Exception {
        String java = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/VoiceServlet.java")), StandardCharsets.UTF_8);
        assertTrue("처음부터 옆에 이어 듣기 [n]번", java.contains("<span class=\\\"vc-from\\\"><button id=\\\"vcFrom\\\"") && java.contains("<input id=\\\"vcFromNo\\\" type=\\\"number\\\"")
                && java.indexOf("id=\\\"vcRestart\\\"") < java.indexOf("id=\\\"vcFrom\\\""));
        String js = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/voice.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue("번호 줄의 시작 초로", js.contains("from = lineStart(times, n);"));
        assertTrue("듣던 소리면 자리만 옮김, 아니면 새로 이어 붙여 그 줄부터", js.contains("if (same) { audio.currentTime = from; resume(); } else playAll(j.wav, sig, j.times, from);"));
        assertTrue("번호 칸에서 Enter", js.contains("if (e.key === 'Enter') { e.preventDefault(); $('vcFrom').onclick(); }"));
    }
}
