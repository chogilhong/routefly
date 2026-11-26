package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 🛩 3D 영상이 준비되면 💾 저장 · 저장 안 함을 고름(2026-11-26 홍TV님 "저장할 수도 있고 저장 안 할 수도 있고") - 따라가기 · 기록 보기 두 곳. */
public class VideoSaveChoiceTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 저장_저장안함_고르기() throws Exception {
        String ck = read("src/main/webapp/js/course-kit.js");
        assertTrue(ck.contains("en ? \"💾 Save\" : \"💾 저장\", en ? \"Don't save\" : \"저장 안 함\").then(function (yes) {"));
        assertTrue("저장 안 함이면 저장하지 않고, 어느 쪽이든 다시 묻지 않게 지움", ck.contains("if (yes !== false) videoSave(v.blob, v.name,")
                && ck.indexOf("objectStore(\"v\").delete(\"last\")", ck.indexOf("if (yes !== false) videoSave(")) > 0);
        assertTrue(read("src/main/webapp/js/trip.js").contains("RFDialog.confirm(t, { ok: ok, cancel: no })"));
        assertTrue(read("src/main/webapp/js/hike.js").contains("hAsk(t, { ok: ok, cancel: no })"));
        assertTrue("만든 파일에도", read("src/main/webapp/js/kit-trip.js").contains("if (yes !== false) videoSave(") && read("src/main/webapp/js/kit-hike.js").contains("if (yes !== false) videoSave("));
        assertTrue("서비스워커 캐시 이름을 올림", read("src/main/webapp/sw.js").contains("var SHELL = \"rf-shell-v433\""));
    }
}
