package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 목소리 만들기 📂 열기 · 저장한 산 고르기 - 새 글은 해설 칸 맨 위(1번 줄)부터(2026-11-28 홍TV님 "열기로 새롭게 문서를 열면 해설 부분을 1번줄 제일 위로"). */
public class VoiceOpenTopTest {

    @Test
    public void 새로_연_글은_맨_위부터() throws Exception {
        String js = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/voice.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        int at = js.indexOf("  function setText(name, text, msg) {");
        assertTrue("해설 칸을 바꾸는 곳(열기 · 저장한 산 둘 다 씀)", at > 0 && js.indexOf("setText(r.name, r.text, msg);") > 0);
        String body = js.substring(at, js.indexOf("\n  }", at));
        int set = body.indexOf("$('vcText').value = text;"), top = body.indexOf("ta.scrollTop = 0;"), gut = body.indexOf("gutter(true);");
        assertTrue("글을 넣은 뒤 맨 위로 · 커서도 처음 · 그 뒤 줄 번호를 다시 그림", set > 0 && top > set && gut > top && body.contains("ta.setSelectionRange(0, 0);"));
    }
}
