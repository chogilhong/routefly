package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 목소리 만들기 💾 저장은 파일로(2026-11-27 홍TV님 "탐색기가 뜨고 어디에 저장할 지 정하면 그리고 저장해야지") -
 * 저장할 곳을 고르는 창(showSaveFilePicker, 없으면 내려받기)으로 .rfvoice(글 · 목소리 · 빠르기 · 줄 사이 · 소리), 📂 열기로 열면 소리까지 되살림.
 * 파일 모양 셈은 voice.test.js projFile · readProj.
 */
public class VoiceFileSaveTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 저장할_곳을_골라_파일로() throws Exception {
        String js = read("src/main/webapp/js/voice.js"), vs = read("src/main/java/com/gh/routefly/web/VoiceServlet.java");
        assertTrue("저장할 곳 고르는 창 · .rfvoice", js.contains("window.showSaveFilePicker({ suggestedName: fname, types: [{ description: 'routefly 목소리 작업', accept: { 'application/json': ['.rfvoice'] } }] })"));
        assertTrue("없는 브라우저는 내려받기", js.contains("download(data, 'application/json', fname);"));
        assertTrue("그만두면 알림", js.contains("e.name === 'AbortError' ? '파일 저장을 그만뒀습니다"));
        assertTrue("열면 소리까지", js.contains("if (r.proj) { var kp = applyProj(r.proj);"));
        assertTrue("열기가 .rfvoice 를 받음", vs.contains("accept=\\\".rfvoice,.md,.srt,.txt,text/plain,text/markdown\\\""));
    }
}
