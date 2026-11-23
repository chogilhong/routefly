package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** GPX 편집 바탕 지도에 "우리 지도" 하나 더(2026-11-24 홍TV님 "좋은 생각이야. 작업해 줘") - 고친 코스가 따라가기 · 영상에서 어떻게 보일지 그 자리에서. 있던 바탕은 그대로. */
public class StudioOurMapTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 우리_지도를_고를_수_있음() throws Exception {
        String js = read("src/main/webapp/js/studio.js"), html = read("src/main/webapp/studio.html");
        assertTrue("우리 지도 패키지를 받음", html.contains("<script src=\"vendor/pmtiles-4.5.0/pmtiles.js\"></script>\n<script src=\"vendor/rfmap-1.1.8/rfmap.js\"></script>"));
        assertTrue("있던 바탕(위성 · V-World · OSM · OpenTopoMap)은 그대로", js.contains("{ id: \"sat\", name: \"🛰️ 위성사진(V-World)\"") && js.contains("{ id: \"topo\", name: \"⛰️ OpenTopoMap(등고선)\""));
        assertTrue("목록에 우리 지도 - 파일을 읽었을 때만", js.contains("{ id: \"rf\", name: \"🏞️ 우리 지도(따라가기 · 영상과 같음)\", ours: true, pub: true }")
                && js.contains("return (owner || !!x.pub) && (!x.ours || !!ourStyle);"));
        assertTrue("설정 map.basemap.url 로 모양을 먼저 읽음", js.contains("RFMap.open(j.basemapUrl, dem)") && js.contains("ourStyle = s;"));
        assertTrue("층 · 소스 이름에 rfm- (편집 층과 안 겹침) · 고른 때만 보임", js.contains("sources[OUR + k] = ourStyle.sources[k];") && js.contains("c.id = OUR + l.id;")
                && js.contains("c.layout.visibility = pref.base === \"rf\""));
        assertTrue("고르면 한꺼번에 보이기 · 숨기기", js.contains("map.setLayoutProperty(OUR + l.id, \"visibility\", p.base === \"rf\""));
        assertTrue("출처 두 번 막기 - 처음 · 바탕을 바꿀 때 출처 칸을 새로", js.contains("attrib(mapPref().base === \"rf\");") && js.contains("if (inp.type === \"radio\") attrib(p.base === \"rf\");")
                && js.contains("if (attribCtl) map.removeControl(attribCtl);"));
        assertTrue("글꼴 · 아이콘", js.contains("st.glyphs = ourStyle.glyphs;") && js.contains("RFMap.iconImage(map, e.id);"));
    }
}
