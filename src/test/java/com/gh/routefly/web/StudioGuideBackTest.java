package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** GPX 편집 → 🗺 안내도에서 고르기 → 탐방 · 노선 안내도의 위 단추는 "‹ GPX 편집"(2026-11-26 홍TV님 "GPX 편집으로 나와서 클릭하면 4화면이 나와야지"). */
public class StudioGuideBackTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 안내도에서_GPX_편집으로_돌아감() throws Exception {
        String st = read("src/main/webapp/js/studio.js");
        assertTrue("국립공원 칩", st.contains("function guideHref(name) { return \"park.html?name=\" + encodeURIComponent(name) + \"&back=studio\"; }"));
        assertTrue("찾은 탐방 안내도", st.contains("(g.label !== g.name ? \"&label=\" + encodeURIComponent(g.label) : \"\") + \"&back=studio\"]);"));
        assertTrue("찾은 노선 안내도", st.contains("+ \"&name=\" + encodeURIComponent(g.name) + \"&back=studio\"]);"));
        String pk = read("src/main/webapp/js/park.js");
        assertTrue(pk.contains("if (backTo === \"studio\") {") && pk.contains("$(\"back\").textContent = T(\"‹ GPX 편집\", \"‹ GPX editor\");\n            $(\"back\").href = \"studio.html\";"));
        String rt = read("src/main/webapp/js/route.js");
        assertTrue(rt.contains("backTo === \"studio\" ? \"studio.html\" : \"series.html\"") && rt.contains("backTo === \"studio\" ? T(\"‹ GPX 편집\", \"‹ GPX editor\")"));
        assertTrue("park · route 는 서비스워커 화면 파일 - 캐시 이름을 올림", read("src/main/webapp/sw.js").contains("var SHELL = \"rf-shell-v430\""));
    }
}
