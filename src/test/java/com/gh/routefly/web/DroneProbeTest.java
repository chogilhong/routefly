package com.gh.routefly.web;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.Test;

/** DroneProbe 순수 함수 - 네트워크 · 키 없이. */
public class DroneProbeTest {

    /** V-World 실제 오류 응답("status" : "ERROR", 콜론 앞뒤 빈칸 - 2026-11-17 PC)을 되는 짝으로 보지 않음. */
    @Test
    public void 드론_브이월드_오류는_되는_짝이_아님() throws Exception {
        String err = Files.readString(Path.of("src/test/resources/drone/try-map_vworld_key-nodomain.json"), StandardCharsets.UTF_8);
        assertTrue(err.contains("INCORRECT_KEY"));
        assertFalse(DroneProbe.ok(err));
    }
}
