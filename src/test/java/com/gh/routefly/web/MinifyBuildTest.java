package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/**
 * war 줄이기 · 캐시(2026-10-28 홍TV님 "작업해" - 산속 약한 신호에서 첫 화면 10초).
 * build-war.ps1 이 war 임시 폴더에서만 tools/minify 로 js · css 를 줄임(원본 · 시험 그대로), esbuild 판 고정, node_modules 는 커밋 안 함,
 * 서비스워커는 받아 둔 js · css 가 있으면 1.5초만 기다림 · 잘 안 여는 화면은 미리 받지 않음.
 */
public class MinifyBuildTest {

    private static String read(String p) throws Exception {
        return Files.readString(Path.of(p), StandardCharsets.UTF_8);
    }

    @Test
    public void warBuildMinifiesOnlyTheStage() throws Exception {
        String ps = read(".claude/build-war.ps1");
        assertTrue("임시 폴더(stage)에서만", ps.contains("& $node (Join-Path $mdir 'minify.js') $stage"));
        assertTrue("esbuild 가 없으면 건너뜀", ps.contains("MINIFY-SKIP"));
        for (char c : ps.toCharArray()) assertTrue("PowerShell 5.1 이 읽게 ASCII 만", c < 128);
        String m = read("tools/minify/minify.js");
        assertTrue("vendor · data 는 손대지 않음", m.contains("[\"js\", \"css\"].forEach") && !m.contains("\"vendor\""));
        assertTrue("판 고정", read("tools/minify/package.json").matches("(?s).*\"esbuild\": \"\\d+\\.\\d+\\.\\d+\".*"));
        assertTrue(Files.exists(Path.of("tools/minify/package-lock.json")));
        assertTrue(read(".gitignore").contains("/tools/minify/node_modules/"));
    }

    @Test
    public void serviceWorkerWaitsLessForSavedFiles() throws Exception {
        String sw = read("src/main/webapp/sw.js");
        assertTrue(sw.contains("var SUB_WAIT = 1500;"));
        assertTrue(sw.contains("req.mode === \"navigate\" ? NET_WAIT : SUB_WAIT"));
        assertFalse("잘 안 여는 화면은 열 때 담음", sw.contains("\"tools.html\"") || sw.contains("\"anbu.html\""));
    }
}
