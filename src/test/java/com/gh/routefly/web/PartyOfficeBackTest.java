package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-11-02 홍TV님: 사무실에서 연 산악회 방의 위쪽 "뒤로" 는 사무실 화면으로(회원 · 인솔자는 그대로 산 모음). */
public class PartyOfficeBackTest {

    @Test
    public void officeSeatBackGoesToOffice() throws Exception {
        String js = Files.readString(Path.of("src/main/webapp/js/party.js"), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue(js.contains("var OFFICE_HOME = EN ? \"party-office.html?lang=en\" : \"party-office.html\";"));
        int at = js.indexOf("if ((RFParty.get() || {}).office) {");
        assertTrue("사무실 자리일 때만", at > 0);
        String body = js.substring(at, js.indexOf("\n    }\n", at));
        assertTrue(body.contains("$(\"back\").href = OFFICE_HOME;") && body.contains("T(\"← 사무실\", \"← Office\")"));
        assertTrue("방 끝 뒤에도 같은 곳", js.contains("location.href = office ? OFFICE_HOME : EXIT;"));
        String html = Files.readString(Path.of("src/main/webapp/party.html"), StandardCharsets.UTF_8);
        assertTrue("기본은 산 모음", html.contains("<a id=\"back\" href=\"m/\">← 산 모음</a>"));
    }
}
