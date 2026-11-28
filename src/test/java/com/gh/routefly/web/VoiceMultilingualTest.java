package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/**
 * 목소리 만들기 - 한국어 목소리 뒤에 여러 언어 목소리(2026-11-28 홍TV님 "목소리 더 추가").
 * 테스트 데이터 voice/voices-list-koreacentral.json 은 Korea Central voices/list 실제 응답(2026-11-28 홍TV님이 PC 에서 받음, 556개).
 */
public class VoiceMultilingualTest {

    @Test
    public void 여러_언어_목소리도_목록에() throws Exception {
        String body = new String(Files.readAllBytes(Paths.get("src/test/resources/voice/voices-list-koreacentral.json")), StandardCharsets.UTF_8);
        if (body.startsWith("﻿")) body = body.substring(1);
        JsonArray v = VoiceServlet.koVoices(body);
        assertEquals("한국어 10 + 여러 언어 56(운영 /check/voice 와 같음)", 66, v.size());
        for (int i = 0; i < v.size(); i++) {
            JsonObject o = v.get(i).getAsJsonObject();
            String name = o.get("name").getAsString();
            if (i < 10) { assertTrue("앞 10개는 한국어 " + name, name.startsWith("ko-KR-")); assertNull(o.get("multi")); }
            else { assertFalse("뒤는 여러 언어 " + name, name.startsWith("ko-KR-")); assertTrue(o.get("multi").getAsBoolean()); assertTrue(name, name.contains("Multilingual")); }
        }
        assertEquals("ko-KR-SunHiNeural", v.get(0).getAsJsonObject().get("name").getAsString());
        String names = v.toString();
        assertTrue(names.contains("en-US-AvaMultilingualNeural") && names.contains("en-US-AndrewMultilingualNeural"));
    }

    @Test
    public void 여러_언어_목소리는_한국어로_읽게() {
        String s = VoiceServlet.ssml("가", "en-US-AvaMultilingualNeural", 5);
        assertTrue(s, s.contains("xml:lang=\"en-US\"><voice name=\"en-US-AvaMultilingualNeural\"><lang xml:lang=\"ko-KR\"><prosody rate=\"+5%\">가</prosody></lang></voice>"));
        assertFalse("한국어 목소리는 그대로", VoiceServlet.ssml("가", "ko-KR-SunHiNeural", 0).contains("<lang"));
    }
}
