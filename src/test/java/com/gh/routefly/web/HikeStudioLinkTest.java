package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 따라가기 코스 목록 줄의 📐(GPX 편집 · 💾 GPX 저장) - 운영자 기기만(2026-11-23 홍TV님 "코스번호를 알아야 열텐데. 나도 코스번호를 몰라"). */
public class HikeStudioLinkTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 운영자_기기만_목록에서_GPX_편집으로() throws Exception {
        String js = read("src/main/webapp/js/hike.js"), html = read("src/main/webapp/hike.html");
        assertTrue("줄마다 숨긴 📐 - 그 코스 ID 로 studio.html#c=", js.contains("ed.className = \"fly studio\";\n                ed.hidden = true;")
                && js.contains("ed.href = \"studio.html#c=\" + encodeURIComponent(r.course_id)") && js.contains("ed.onclick = function (e) { e.stopPropagation(); };"));
        assertTrue("운영자 기기(서버 /api/course-upload owner)일 때만 보임", js.contains("if (own) Array.prototype.forEach.call(box.querySelectorAll(\"a.studio\"), function (a) { a.hidden = false;")
                && js.contains("ownerP = fetch(\"api/course-upload\", { headers: { Accept: \"application/json\" }, cache: \"no-store\" })"));
        assertTrue("숨김이 display 에 덮이지 않게 · fly(3D) 와 겹치지 않게", html.contains("#pickList .it .fly[hidden] { display:none; }") && html.contains("#pickList .it.hased .fly:not(.studio) { right:56px; }"));
        assertTrue("GPX 편집은 #c= · &title= 로 받은 길을 엶", read("src/main/webapp/js/studio.js").contains("var id = get(\"c\");"));
    }
}
