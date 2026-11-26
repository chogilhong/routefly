package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 목소리 만들기 - 멈춘 뒤 글을 고치고 이어 듣기를 누르면 처음이 아니라 멈춘 줄의 처음부터(2026-11-26 홍TV님 "1번을 수정하고 … 이어 듣기를 했는데 다시 1번부터"). 셈은 voice.test.js resumeFrom. */
public class VoiceResumeEditTest {

    @Test
    public void 고친_뒤_멈춘_줄부터() throws Exception {
        String js = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/voice.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue("멈춘 전체 듣기가 있으면 새 줄 시각으로 이어 들음", js.contains("if (audio && audio.paused && audioTimes) {")
                && js.contains("var from = resumeFrom(audioTimes, audio.currentTime, j.times);\n        playAll(j.wav, sig, j.times, from);"));
        assertTrue("그 자리로 옮겨 시작", js.contains("if (from > 0) audio.currentTime = from;"));
        assertTrue("줄 시각을 기억 · 끝나면 지움", js.contains("audioSig = sig; audioTimes = times;") && js.contains("audioTimes = null;\n    audioSig = null;"));
    }
}
