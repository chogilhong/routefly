package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 내 기록 창 닫기 - 주소의 #rec 도 지움(2026-11-24 홍TV님 "hike.html#rec 화면에서 닫기를 하면 hike.html 이렇게 되야"). */
public class HikeRecHashTest {

    @Test
    public void 닫으면_주소의_rec_를_지움() throws Exception {
        String js = new String(Files.readAllBytes(Paths.get("src/main/webapp/js/hike.js")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        int at = js.indexOf("$(\"recClose\").addEventListener(\"click\", function () {");
        assertTrue("닫기 단추", at > 0);
        String body = js.substring(at, js.indexOf("\n    });", at));
        assertTrue("창을 숨기고 #rec 만 지움(다른 # 은 그대로 · 새로 읽지 않음)", body.contains("$(\"recSheet\").style.display = \"none\";")
                && body.contains("if (/^#rec$/.test(location.hash)) { try { history.replaceState(null, \"\", location.pathname + location.search); }"));
    }
}
