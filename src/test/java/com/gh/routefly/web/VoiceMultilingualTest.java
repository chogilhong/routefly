package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonArray;

/**
 * 목소리 만들기 - 한국어 목소리 뒤에 여러 언어 목소리(2026-11-28 홍TV님 "목소리 더 추가").
 * 테스트 데이터 voice/voices-list-docs-sample.json 은 Microsoft 문서(Text to speech REST API, "Get a list of voices" 응답 예)의 JSON 을 그대로 옮긴 것(// 줄만 뺌).
 */
public class VoiceMultilingualTest {

    @Test
    public void 여러_언어_목소리도_목록에() throws Exception {
        String body = new String(Files.readAllBytes(Paths.get("src/test/resources/voice/voices-list-docs-sample.json")), StandardCharsets.UTF_8);
        JsonArray v = VoiceServlet.koVoices(body);
        assertEquals("SecondaryLocaleList 에 ko-KR 이 있는 Jenny Multilingual 만(Jenny · Orla · Yunxi 는 아님)", 1, v.size());
        assertEquals("en-US-JennyMultilingualNeural", v.get(0).getAsJsonObject().get("name").getAsString());
        assertTrue(v.get(0).getAsJsonObject().get("multi").getAsBoolean());
        // 한국어 목소리가 앞에, 여러 언어는 뒤에
        JsonArray w = VoiceServlet.koVoices("[{\"ShortName\":\"en-US-AvaMultilingualNeural\",\"Locale\":\"en-US\",\"LocalName\":\"Ava Multilingual\",\"Gender\":\"Female\"},"
                + "{\"ShortName\":\"ko-KR-TestNeural\",\"Locale\":\"ko-KR\",\"LocalName\":\"시험\",\"Gender\":\"Female\"}]");
        assertEquals("ko-KR-TestNeural", w.get(0).getAsJsonObject().get("name").getAsString());
        assertNull(w.get(0).getAsJsonObject().get("multi"));
        assertEquals("en-US-AvaMultilingualNeural", w.get(1).getAsJsonObject().get("name").getAsString());
    }

    @Test
    public void 여러_언어_목소리는_한국어로_읽게() {
        String s = VoiceServlet.ssml("가", "en-US-JennyMultilingualNeural", 5);
        assertTrue(s, s.contains("xml:lang=\"en-US\"><voice name=\"en-US-JennyMultilingualNeural\"><lang xml:lang=\"ko-KR\"><prosody rate=\"+5%\">가</prosody></lang></voice>"));
        assertFalse("한국어 목소리는 그대로", VoiceServlet.ssml("가", "ko-KR-TestNeural", 0).contains("<lang"));
    }
}
