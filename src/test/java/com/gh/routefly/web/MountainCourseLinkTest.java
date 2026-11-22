package com.gh.routefly.web;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** 산 페이지 코스 이름 = 코스 페이지 링크를 누를 수 있게 보이게(2026-11-22 홍TV님 "그냥 글자만 있는 것 같아서 클릭할 생각을 못할 것 같아"). */
public class MountainCourseLinkTest {

    @Test
    public void 코스_이름은_밑줄과_꺾쇠() throws Exception {
        String css = new String(Files.readAllBytes(Paths.get("src/main/webapp/css/mountain.css")), StandardCharsets.UTF_8).replace("\r\n", "\n");
        assertTrue(css.contains(".cs b a { color:inherit; text-decoration:underline; text-decoration-color:var(--sky);"));
        assertTrue(css.contains(".cs b a::after { content:\" ›\"; color:var(--sky);"));
        assertFalse("예전(밑줄 없음)", css.contains(".cs b a { color:inherit; text-decoration:none; }"));
    }
}
