package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/**
 * 인솔자 회원 명단 - 폰 폭(560px 아래)에서는 회원 한 명 = 카드 한 장(2026-11-25 PC 녹화: 389px 에서 상태 칸 단추가 잘리고 하차 칸이 눌림).
 * 머리글을 숨기고 좌석 · 이름 한 줄, 마지막 연락 · 멈춘 시간 · 배터리 작게(🕑 ⏸ 🔋), 상태 · 단추는 맨 아래 넓게.
 */
public class PartyListPhoneTest {

    @Test
    public void 폰_폭_회원_카드() throws Exception {
        String h = new String(Files.readAllBytes(Paths.get("src/main/webapp/party.html")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        int at = h.indexOf("@media (max-width:560px) {\n  #room table thead { display:none; }");
        assertTrue("폰 폭 카드 모양", at > 0);
        String m = h.substring(at, h.indexOf("\n}\n", at));
        assertTrue(m.contains("#list tr { display:flex; flex-wrap:wrap;") && m.contains("#list td:nth-child(6) { flex:1 1 100%; display:flex; flex-wrap:wrap;")
                && m.contains("#list td:nth-child(3)::before { content:\"🕑 \"; }") && m.contains("#list td:nth-child(5)::before { content:\"🔋 \"; }"));
        assertTrue("party.html 은 서비스워커 화면 파일 - 캐시 이름을 올림", new String(Files.readAllBytes(Paths.get("src/main/webapp/sw.js")), StandardCharsets.UTF_8).contains("var SHELL = \"rf-shell-v433\""));
    }
}
