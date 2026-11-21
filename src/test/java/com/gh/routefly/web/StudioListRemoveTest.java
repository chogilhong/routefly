package com.gh.routefly.web;

import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** GPX 편집 목록 줄마다 ✕ - 목록에서 빼기(2026-11-21 홍TV님 "✕ 단추 좋아"). 고치기 칸 🗑 와 같은 removeAt 을 씀(묻기 · 되돌리기 그대로). */
public class StudioListRemoveTest {

    @Test
    public void 줄마다_빼기_단추() throws Exception {
        String js = Files.readString(Path.of("src/main/webapp/js/studio.js")).replace("\r\n", "\n"), html = Files.readString(Path.of("src/main/webapp/studio.html"));
        assertTrue("줄마다 ✕ 단추", js.contains("x0.className = \"x\"; x0.textContent = \"✕\"") && js.contains("it.appendChild(x0);"));
        assertTrue("누르면 줄 고르기는 안 하고 그 줄을 뺌", js.contains("x0.onclick = function (e) { e.stopPropagation(); removeAt(i); };"));
        assertTrue("🗑 도 같은 함수", js.contains("$(\"delBtn\").onclick = function () { if (cur()) removeAt(sel); };"));
        assertTrue("묻고 · 되돌리기 남김", js.contains("function removeAt(i)") && js.contains("목록에서 뺄까요?") && js.contains("push();\n            tracks.splice(i, 1);"));
        assertTrue("앞의 길을 빼면 고른 자리를 당김", js.contains("sel = !tracks.length ? -1 : i < sel ? sel - 1 : Math.min(sel, tracks.length - 1);"));
        assertTrue("단추 모양(누르기 쉬운 32px)", html.contains("#list .it .x { flex:0 0 32px; height:32px;"));
    }

    @Test
    public void 코스_넣는_시각은_매시_37분() throws Exception {
        // 2026-11-21 PC: 서버 courseImport 는 따로 매시 37분(docs/deploy-lightsail.md) - 화면 안내는 옛 "매시 7분" 이었음(GPX 편집 · 따라가기 함께)
        String deploy = Files.readString(Path.of("docs/deploy-lightsail.md"));
        assertTrue(deploy.contains("courseImport 만 매시 37분에 따로 돌립니다"));
        for (String f : new String[] {"src/main/webapp/studio.html", "src/main/webapp/js/studio.js", "src/main/webapp/js/hike.js"}) {
            String s = Files.readString(Path.of(f));
            assertTrue(f, s.contains("매시 37분") && !s.contains("매시 7분") && !s.contains("(at :07)"));
        }
    }
}
