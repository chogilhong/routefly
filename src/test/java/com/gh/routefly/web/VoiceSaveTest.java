package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 목소리 만들기 💾 저장(2026-11-27 홍TV님 "저장 기능을 둬서 현재 그대로 저장하고 열면 소리까지 들어가 있게") -
 * 글 · 목소리 · 빠르기 · 줄 사이 · 만든 소리를 산 이름으로 IndexedDB(rf-voice / proj)에, 📚 저장한 산 · 📂 열기로 열면 소리까지 cache 에. 열쇠 셈은 voice.test.js projKeys.
 */
public class VoiceSaveTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 저장하고_열면_소리까지() throws Exception {
        String vs = read("src/main/java/com/gh/routefly/web/VoiceServlet.java"), js = read("src/main/webapp/js/voice.js");
        assertTrue("💾 저장 단추", vs.contains("<button id=\\\"vcSave\\\""));
        assertTrue("지금 글의 만든 소리만 산 이름으로 저장",
            js.contains("projKeys(t, o.voice, o.rate).forEach(function (key) { var c = cache[key]; if (c && !c.err) { snd[key] = c.wav; k++; } });")
            && js.contains("var p = { name: n, text: t, voice: o.voice, rate: o.rate, gap: o.gap, t: Date.now(), snd: snd };") && js.contains("return st.put(p, n);"));
        assertTrue("열면 목소리 · 빠르기 · 줄 사이를 맞추고 소리를 cache 에",
            js.contains("$('vcRate').value = p.rate;") && js.contains("cache[k] = { wav: w }; n++;"));
        assertTrue("📚 저장한 산 · 📂 열기 둘 다 소리를 넣음",
            js.contains("var k = applyProj(p);\n        if (p) info(") && js.contains("getProj(r.name).then(function (p) { var k = applyProj(p);"));
        assertTrue("✕ 는 저장한 소리도 지움", js.contains("idbDo('readwrite', function (st) { return st.delete(n); })"));
    }
}
