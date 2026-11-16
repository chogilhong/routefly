package com.gh.routefly.web;

import static org.junit.Assert.assertEquals;
import static org.junit.Assume.assumeTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

/**
 * 올림 폴더 권한(2026-11-16 PC: 종주 5개가 코스 목록에 안 들어감) - 서버 course-inbox 는 2750 tomcat:routefly(setgid)인데
 * save 가 kind 폴더에 setPosixFilePermissions 를 해 setgid 를 지우고, 새 파일이 tomcat 묶음이 되어 배치(routefly)가 AccessDenied.
 * 리눅스에서만(윈도우 PC 는 건너뜀) - 폴더 묶음을 다른 묶음으로 두고 올린 뒤 setgid 가 남는지 · 파일 묶음이 폴더 묶음인지.
 */
public class CourseUploadPermTest {

    private static String sh(String... cmd) throws Exception {
        Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
        String out = new String(p.getInputStream().readAllBytes()).trim();
        return p.waitFor() == 0 ? out : null;
    }

    @Test
    public void setgid_폴더_묶음이_파일로_이어짐() throws Exception {
        assumeTrue(java.nio.file.FileSystems.getDefault().supportedFileAttributeViews().contains("posix"));
        Path dir = Files.createTempDirectory("inbox");
        Path hike = Files.createDirectory(dir.resolve("hike"));
        String group = sh("id", "-gn");
        assumeTrue(group != null && sh("chmod", "2750", dir.toString()) != null && sh("chmod", "2750", hike.toString()) != null);
        // 서버처럼 폴더 묶음을 내 묶음과 다르게(root 로 도는 클라우드 · 리눅스에서만 됨 - 안 되면 같은 묶음으로 봄)
        if (sh("chgrp", "daemon", dir.toString()) != null) sh("chgrp", "daemon", hike.toString());
        List<double[]> pts = new ArrayList<>();
        for (int i = 0; i < 12; i++) pts.add(new double[] {37.65 + i * 0.001, 126.98 + i * 0.001, 500 + i});
        String id = CourseUploadServlet.save(dir.toFile(), "불수사도북 종주 · 화랑대역 → 불광역", "hike", pts, "", new CourseMakers(dir.resolve("makers.json")), 1_763_200_000_000L);
        assertEquals("kind 폴더의 setgid 를 지우지 않음", "2750", sh("stat", "-c", "%a", hike.toString()));
        Path f = hike.resolve(id + ".gpx");
        assertEquals("파일 묶음 = 폴더 묶음", Files.getAttribute(hike, "posix:group"), Files.getAttribute(f, "posix:group"));
        assertEquals("rw-r-----", java.nio.file.attribute.PosixFilePermissions.toString(Files.getPosixFilePermissions(f)));
        // 새 kind 폴더(walk)도 부모 setgid 를 이어받고 그대로
        String id2 = CourseUploadServlet.save(dir.toFile(), "둘레길 · 가 → 나", "walk", pts, "", new CourseMakers(dir.resolve("makers.json")), 1_763_200_001_000L);
        assertEquals(true, sh("stat", "-c", "%a", dir.resolve("walk").toString()).startsWith("2"));
        for (File x : new File[] {hike.resolve(id + ".gpx").toFile(), dir.resolve("walk").resolve(id2 + ".gpx").toFile()}) x.delete();
    }
}
