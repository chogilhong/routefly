package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 목소리 만들기 전체 듣기 - 읽는 줄을 밝히고 화면 가운데로(2026-11-26 홍TV님 "6까지 읽었어. 그럼 스크롤을 올려서 다음 줄부터 볼 수 있도록"). 줄 셈은 voice.test.js lineAt. */
public class VoiceFollowTest {

    @Test
    public void 읽는_줄_따라가기() throws Exception {
        String js = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/voice.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue("소리가 나아가면 줄 번호를 셈", js.contains("audio.ontimeupdate = function () { if (audio) markLine(lineAt(times, audio.currentTime)); };"));
        assertTrue("줄이 바뀔 때 가운데로", js.contains("lis[i].scrollIntoView({ block: 'center', behavior: 'smooth' });") && js.contains("if (i === nowLine) return;"));
        assertTrue("전체 듣기에 줄 시각을 넘김", js.contains("playAll(j.wav, sig, j.times);"));
        assertTrue("끝나면 밝힘을 지움", js.contains("audioSig = null;\n    markLine(-1);"));
        assertTrue("css", VoiceServlet.class.getName() != null
                && new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/VoiceServlet.java")), StandardCharsets.UTF_8).contains("#vcLines li.now{"));
    }
}
