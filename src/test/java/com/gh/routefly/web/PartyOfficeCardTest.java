package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 회사 사무실 - 승인 기다리는 방 · 지금 산행은 방 하나 = 카드 한 장(2026-11-25 PC 녹화: 9칸 표라 PC 폭에서도 인솔자 · 빼기 칸이, 폰 폭에서는 승인 단추가 화면 밖).
 * 숫자 칸은 작은 이름표(한 · 영)를 위에, 산행 이름 · 상태 · 단추는 한 줄 전체. 끝난 산행 표는 그대로.
 */
public class PartyOfficeCardTest {

    @Test
    public void 사무실_방_카드() throws Exception {
        String h = new String(Files.readAllBytes(Paths.get("src/main/webapp/party-office.html")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue(h.contains("<section id=\"liveSec\">") && h.contains("#pendSec thead, #liveSec thead { display:none; }")
                && h.contains("#pend tr, #live tr { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr));"));
        assertTrue("승인 · 빼기 단추 칸은 한 줄 전체 · 오른쪽", h.contains("#live td:nth-child(9), #pend td:nth-child(5) { text-align:right; }"));
        assertTrue("이름표 한 · 영", h.contains("#live td:nth-child(6)::before { content:\"10분 소식 없음\"; }") && h.contains("html[lang=\"en\"] #live td:nth-child(6)::before { content:\"Silent 10 min\"; }"));
        assertTrue("SOS 방은 카드째 빨강", h.contains("#live tr.sos { background:rgba(201,42,42,0.35); border-color:var(--red); }"));
        assertTrue("끝난 산행 표는 그대로", !h.contains("#ended tr {"));
    }
}
