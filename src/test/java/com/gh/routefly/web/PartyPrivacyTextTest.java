package com.gh.routefly.web;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 산악회 방 개인정보처리방침이 코드와 같은지(2026-11-22 점검 - 뺀 "최소 인원" · 예전 "출발 3시간 전부터" 가 남아 있었음). */
public class PartyPrivacyTextTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 방침_문구가_코드와_같음() throws Exception {
        String ko = read("src/main/webapp/privacy.html"), en = read("src/main/webapp/privacy-en.html"), party = read("src/main/java/com/gh/routefly/web/Party.java");
        assertFalse("최소 인원은 2026-10-26 뺌", ko.contains("최소 인원") || en.contains("minimum number of people"));
        assertFalse(ko.contains("출발 3시간 전부터") || en.contains("3 hours before departure"));
        // 위치를 받기 시작하는 때 - Party.started(): 자기 탑승지 출발 시각 또는 버스에 탄 때
        assertTrue(party.contains("long at = stopAt(r, m.stop);") && party.contains("if (r.departed || m.boarded || r.departAt == 0) return true;"));
        assertTrue(ko.contains("내 탑승지 출발 시각(또는 버스에 탄 때)부터 하산 탑승"));
        assertTrue(en.contains("the departure time of your pickup stop (or when you board the bus) until you board for the return"));
    }
}
