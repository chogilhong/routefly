package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 목소리 만들기 - 읽는 말은 주황 { } · 해설 칸 왼쪽 줄 번호(2026-11-26 홍TV님 "{읽기} 이렇게 하든가 색을 넣든가" · "해설에 있는 글에도 동일하게 숫자 표시").
 * 번호 셈은 voice.test.js lineNumbers. 위치는 숨은 textarea 로 잼(div 로 재면 꺾임이 달라 밀렸음), 쳐 넣는 동안은 150ms 뒤 한 번만(줄마다 이벤트가 나면 90초 걸렸음).
 */
public class VoiceGutterTest {

    @Test
    public void 읽는_말_색과_줄_번호() throws Exception {
        String p = VoiceServlet.page();
        assertTrue(p.contains("#vcLines .rd{display:block;font-size:12.5px;color:#ffb84d;margin-top:2px}#vcLines .rd::before{content:'🔈 읽기 {';}#vcLines .rd::after{content:'}';}"));
        assertTrue(p.contains("<div class=\"vc-ed\"><div class=\"vc-no\" id=\"vcNo\" aria-hidden=\"true\"></div><textarea id=\"vcText\""));
        String js = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/voice.js")), StandardCharsets.UTF_8);
        assertTrue("숨은 textarea 로 잼", js.contains("gutterTa = ta.cloneNode(false);") && js.contains("y = gutterTa.scrollHeight - padB;"));
        assertTrue("글 · 넓이가 같으면 다시 재지 않음", js.contains("if (key === gutterKey) return;"));
        assertTrue("넓이는 스크롤 막대를 뺀 것(2026-11-26 PC: 아래로 갈수록 밀림)", js.contains("w = ta.clientWidth + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);")
                && js.contains("gutterTa.style.width = w + 'px';") && !js.contains("gutterTa.style.width = ta.offsetWidth"));
        assertTrue("쳐 넣는 동안은 잠깐 뒤 한 번", js.contains("gutterTimer = setTimeout(function () { gutterMeasure(); gutterPaint(); }, 150);"));
        assertTrue("스크롤은 잰 위치로 바로", js.contains("$('vcText').addEventListener('scroll', function () { if ($('vcNo')) gutterPaint(); });"));
    }
}
