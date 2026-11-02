package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** 2026-11-02 홍TV님: 산악회 방 "복사했습니다" 문구는 10초 뒤 닫힘 - 못 했을 때 안내는 남김. */
public class PartyCopyMsgTest {

    @Test
    public void copiedNoteClosesAfterTenSeconds() throws Exception {
        String js = Files.readString(Path.of("src/main/webapp/js/party.js"), StandardCharsets.UTF_8).replace("\r\n", "\n");
        int at = js.indexOf("function copyMsg(t, stay)");
        assertTrue("copyMsg 가 있음", at > 0);
        String body = js.substring(at, js.indexOf("\n    }\n", at));
        assertTrue("10초 뒤 지움", body.contains("setTimeout(function () { n.textContent = \"\"; }, 10000)"));
        assertTrue("못 했을 때는 남김", body.contains("if (!stay)") && js.contains("copy it.\"), !ok);"));
    }
}
