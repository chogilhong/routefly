package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.Test;

/** 내 사무실 묶음(2026-10-30 홍TV님 "② 내 사무실 묶음 링크로 해줘") - PC · 폰이 같은 사무실 목록. 이름 · 코드는 시험용. */
public class OfficeBundleTest {

    @Test
    public void bundleFollowsOffices() {
        PartyOffice po = new PartyOffice(null);
        PartyOffice.Office a = po.create("시험산악회", "AAAAAA", 0), b = po.create("시험산악회2", "BBBBBB", 0);
        String bk = po.newBundle(List.of(a), 0);
        assertEquals(1, po.bundleOffices(bk, 0).size());
        po.bundleAdd(bk, b);
        po.bundleAdd(bk, b);   // 두 번 넣어도 하나
        assertEquals(2, po.bundleOffices(bk, 0).size());
        String oldKey = a.key;
        po.newKey(a);
        assertNotEquals(oldKey, a.key);
        assertEquals("사무실 링크를 바꿔도 묶음은 새 열쇠를 줌", a.key, po.bundleOffices(bk, 0).get(0).key);
        po.newCode(a, "CCCCCC");
        assertEquals("회사 코드를 바꿔도 묶음에 남음", "CCCCCC", po.bundleOffices(bk, 0).get(0).code);
        po.delete(b);
        assertEquals("없앤 사무실은 묶음에서 빠짐", 1, po.bundleOffices(bk, 0).size());
        po.bundleRemove(bk, a);
        assertEquals(0, po.bundleOffices(bk, 0).size());
    }

    @Test
    public void bundleKeySecurity() {
        PartyOffice po = new PartyOffice(null);
        PartyOffice.Office a = po.create("시험산악회", "AAAAAA", 0);
        String bk = po.newBundle(List.of(a), 0);
        try { po.bundleOffices("x".repeat(32), 0); fail("틀린 묶음 열쇠"); } catch (SecurityException e) { /* 됨 */ }
        String nk = po.bundleNewKey(bk);
        try { po.bundleOffices(bk, 0); fail("바꾼 뒤 옛 묶음 열쇠는 안 됨"); } catch (SecurityException e) { /* 됨 */ }
        assertEquals(1, po.bundleOffices(nk, 0).size());
        try { po.newBundle(List.of(), 0); fail("빈 묶음"); } catch (IllegalArgumentException e) { /* 됨 */ }
    }

    @Test
    public void bundleSavedAndRead() throws Exception {
        Path dir = Files.createTempDirectory("office");
        PartyOffice po = new PartyOffice(dir.resolve("office.json"));
        PartyOffice.Office a = po.create("시험산악회", "AAAAAA", 0);
        String bk = po.newBundle(List.of(a), 0);
        assertTrue(Files.isRegularFile(dir.resolve("office-bundle.json")));
        PartyOffice again = new PartyOffice(dir.resolve("office.json"));
        assertEquals("다시 켜도 묶음 그대로", "AAAAAA", again.bundleOffices(bk, 0).get(0).code);
    }
}
