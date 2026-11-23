package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 자료보기(trip.html) 마우스 따라가기 - 그래프 · 지도 선 위에서 노란 점 · 세로선 · 한 줄(2026-11-23 홍TV님 "GPX 편집처럼 자료보기에서도 마우스 움직임을 따라가게"). */
public class TripHoverTest {

    private static String read(String p) throws Exception {
        return new String(Files.readAllBytes(Paths.get(p)), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    @Test
    public void 그래프와_지도에서_마우스를_따라감() throws Exception {
        String js = read("src/main/webapp/js/trip.js"), html = read("src/main/webapp/trip.html");
        assertTrue("그래프 머리에 한 줄 자리", html.contains("<b id=\"profTip\" aria-live=\"off\"></b>"));
        assertTrue("노란 점 모양", html.contains(".hov { width:16px; height:16px; border-radius:50%; background:#ffd43b;"));
        assertTrue("d 자리로 점 · 그래프 선 · 한 줄", js.contains("var p = RF.at(rc, d);") && js.contains("if (prof) prof.set(d);")
                && js.contains("$(\"profTip\").textContent = RF.km(d) + \" km\""));
        assertTrue("그래프 위 마우스 · 손가락", js.contains("$(\"prof\").addEventListener(\"mousemove\", profMove);")
                && js.contains("hoverAt(Math.max(0, Math.min(1, x / r.width)) * rc.total);") && js.contains("$(\"prof\").addEventListener(\"mouseleave\", hoverOff);"));
        assertTrue("지도 선에서 14px 안일 때만", js.contains("if (q && q.off <= mpp * 14) hoverAt(q.d); else hoverOff();"));
        assertTrue("1시간 안은 \"35분\" (0시간 빼기)", js.contains("return (m >= 60 ? Math.floor(m / 60) + T(\"시간 \", \"h \") : \"\") + (m % 60) + T(\"분\", \"m\");"));
        assertTrue("기록을 새로 그리면 점을 치움", js.contains("labels: false });\n        hoverOff();"));
    }

    @Test
    public void 요약은_타일_두_줄() throws Exception {
        String html = read("src/main/webapp/trip.html");
        assertTrue(html.contains("#sumTbl { margin:12px; display:grid; grid-template-columns:1fr 1fr;") && html.contains("#sumTbl div:first-child { grid-column:1 / -1; }"));
    }
}
