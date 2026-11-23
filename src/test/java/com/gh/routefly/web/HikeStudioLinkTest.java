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
        // 2026-11-24 홍TV님 "모두에게 열어주고": 줄마다 📐 → 코스 기록 보기(trip.html?c=), 누구나. GPX 편집은 그 화면에서 운영자만(TripCourseTest)
        String js = read("src/main/webapp/js/hike.js"), html = read("src/main/webapp/hike.html");
        assertTrue("줄마다 📐 - 그 코스 ID 로 trip.html?c=", js.contains("ed.className = \"fly studio\";")
                && js.contains("ed.href = \"trip.html?c=\" + encodeURIComponent(r.course_id)") && js.contains("ed.onclick = function (e) { e.stopPropagation(); };"));
        assertFalse("숨겨 두지 않음 · 운영자만 보이던 것은 지움", js.contains("ed.hidden = true;") || js.contains("querySelectorAll(\"a.studio\")"));
        assertTrue("fly(3D) 와 겹치지 않게", js.contains("it.classList.add(\"hased\");") && html.contains("#pickList .it.hased .fly:not(.studio) { right:56px; }"));
    }
}
