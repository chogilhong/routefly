package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import com.google.gson.JsonArray;

/** 🎙 목소리 만들기(VoiceServlet, 2026-11-21) - 보낼 값 검사 · SSML · 목소리 목록 고르기 · 화면. */
public class VoiceServletTest {

    @Test
    public void 검사와_SSML() {
        assertNull(VoiceServlet.check("안녕하세요", "ko-KR-TestNeural", 0));
        assertEquals("글이 비었습니다", VoiceServlet.check("  ", "ko-KR-TestNeural", 0));
        assertEquals("한 줄은 400자까지입니다", VoiceServlet.check("가".repeat(401), "ko-KR-TestNeural", 0));
        // 목소리 이름은 SSML 에 그대로 들어가므로 모양만 받음(따옴표 · 꺾쇠로 SSML 을 깨지 못하게)
        assertEquals("목소리 이름이 틀렸습니다", VoiceServlet.check("가", "ko-KR-Test\"/><x", 0));
        assertEquals("목소리 이름이 틀렸습니다", VoiceServlet.check("가", null, 0));
        assertEquals("빠르기는 -50 ~ 50% 입니다", VoiceServlet.check("가", "ko-KR-TestNeural", 51));
        // 글은 이스케이프 - "<" · "&" 가 섞인 대본도 그대로 읽힘
        assertEquals("<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"ko-KR\"><voice name=\"ko-KR-TestNeural\"><prosody rate=\"-10%\">"
                + "A &amp; B &lt;산&gt; &quot;말&quot; &apos;</prosody></voice></speak>", VoiceServlet.ssml("A & B <산> \"말\" '", "ko-KR-TestNeural", -10));
        assertTrue(VoiceServlet.ssml("가", "ko-KR-TestNeural", 5).contains("rate=\"+5%\""));
    }

    @Test
    public void 한국어_목소리만() {
        // voices/list 응답의 칸 이름(ShortName · Locale · LocalName · Gender)만 흉내 낸 테스트 값 - 실제 목소리 이름은 서버가 받은 목록을 씀
        JsonArray v = VoiceServlet.koVoices("[{\"ShortName\":\"ko-KR-TestNeural\",\"Locale\":\"ko-KR\",\"LocalName\":\"시험\",\"Gender\":\"Female\"},"
                + "{\"ShortName\":\"en-US-TestNeural\",\"Locale\":\"en-US\",\"LocalName\":\"Test\",\"Gender\":\"Male\"},"
                + "{\"ShortName\":\"ko-KR-Bad\\\"Neural\",\"Locale\":\"ko-KR\"}]");
        assertEquals("[{\"name\":\"ko-KR-TestNeural\",\"local\":\"시험\",\"gender\":\"Female\"}]", v.toString());
    }

    @Test
    public void 화면() throws Exception {
        String p = VoiceServlet.page();
        assertTrue(p.contains("<meta name=\"robots\" content=\"noindex\">"));
        assertTrue("/check/ 아래라 한 칸 위", p.contains("<script src=\"../js/voice.js\"></script>"));
        assertTrue("읽는 말 안내(2026-11-25)", p.contains("대가야{대 가야}"));
        // 견줘 듣기(2026-11-25 홍TV님 "목소리를 바꿔서 한~두 줄만 … 기존 것은 그대로 두고 테스트 후에 바꿀지 선택")
        assertTrue(p.contains("id=\"vcTry\"") && p.contains("id=\"vcUse\""));
        assertTrue(p.contains("id=\"vcText\"") && p.contains("id=\"vcVoice\"") && p.contains("id=\"vcWav\"") && p.contains("id=\"vcSrt\""));
        // 전체 듣기 중에는 같은 단추가 ⏹ 멈춤(2026-11-21 홍TV님), 다 들으면 되돌아옴
        String js = new String(java.nio.file.Files.readAllBytes(java.nio.file.Path.of("src/main/webapp/js/voice.js")), java.nio.charset.StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue(js.contains("audio.onended = stop;") && js.contains("$('vcPlay').textContent = '⏹ 멈춤';"));
        // 멈추면 자리를 남겨 이어 듣기(2026-11-25 홍TV님 "이어서 듣게"), 글 · 목소리가 같을 때만, ⏮ 처음부터
        assertTrue(js.contains("if (audio && !audio.paused) { pause(); return; }") && js.contains("if (audio && audioSig === sig) { resume(); return; }")
                && js.contains("'▶ 이어 듣기 (' + clock(audio.currentTime) + ')'") && p.contains("id=\"vcRestart\" hidden"));
        String jsTry = js;
        assertTrue("🎧 은 견줄 목소리로 그 줄만, 쓰는 목소리 · 만든 소리는 그대로", jsTry.contains("tr.onclick = function () { tryLine(say); };")
                && jsTry.contains("var c = cache[cacheKey(v, o.rate, say)];") && jsTry.contains("fetchLine(say, v, o.rate)")
                && jsTry.contains("$('vcTry').value = $('vcVoice').value;") && jsTry.contains("$('vcVoice').value = v;"));
        // 소리는 읽는 말로 만들고 캐시 열쇠도 읽는 말(자막만 고쳐도 다시 안 만듦), srt 는 자막 말
        assertTrue(js.contains("var say = spoken(x), c = cache[cacheKey(o.voice, o.rate, say)];") && js.contains("j.texts = xs.map(shown);") && js.contains(".map(spoken).filter("));
    }
}
