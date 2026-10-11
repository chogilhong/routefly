package com.gh.routefly.web;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import org.junit.Test;

/** DB 연결 풀(2026-10-07): 크기 설정값 읽기, 웹앱이 내려갈 때 풀 닫기. */
public class DbPoolTest {

    @Test
    public void poolSizeDefaultsWhenEmptyOrBad() {
        assertEquals(10, Db.poolSize(null, 10));
        assertEquals(5, Db.poolSize("", 5));
        assertEquals(5, Db.poolSize("  ", 5));
        assertEquals("숫자가 아니면 기본값", 10, Db.poolSize("abc", 10));
        assertEquals("소수도 기본값", 10, Db.poolSize("2.5", 10));
        assertEquals("0 은 기본값", 10, Db.poolSize("0", 10));
        assertEquals("음수는 기본값", 5, Db.poolSize("-3", 5));
    }

    @Test
    public void poolSizeReadsPositiveNumber() {
        assertEquals(20, Db.poolSize("20", 10));
        assertEquals("앞뒤 공백은 무시", 3, Db.poolSize(" 3 ", 5));
        assertEquals(1, Db.poolSize("1", 10));
    }

    @Test
    public void defaultsMatchExample() throws Exception {
        assertEquals(10, Db.DEFAULT_MAX_ACTIVE);
        assertEquals(5, Db.DEFAULT_MAX_IDLE);
        assertEquals("여러 쿼리를 잇는 요청보다 넉넉히(문이 연결 수만큼만 들여보냄)", 120_000, Db.CHECKOUT_TIME_MS);
        String ex = new String(Files.readAllBytes(Paths.get("src/main/resources/config.properties.example")), StandardCharsets.UTF_8);
        assertTrue(ex.contains("db.pool.maxActive=10"));
        assertTrue(ex.contains("db.pool.maxIdle=5"));
    }

    /** 2026-10-11 오픈 전 점검: 연결을 닫으면 문(세마포어)을 한 번만 다시 엶 - 두 번 닫아도 자리가 늘지 않게. */
    @Test
    public void gateReleasedOnceOnClose() throws Exception {
        int[] closed = {0};
        java.sql.Connection fake = (java.sql.Connection) java.lang.reflect.Proxy.newProxyInstance(java.sql.Connection.class.getClassLoader(),
                new Class<?>[] {java.sql.Connection.class}, (proxy, m, args) -> {
                    if ("close".equals(m.getName())) closed[0]++;
                    if ("isClosed".equals(m.getName())) return closed[0] > 0;
                    return null;
                });
        java.util.concurrent.Semaphore g = new java.util.concurrent.Semaphore(1);
        g.acquire();
        java.sql.Connection c = Db.released(fake, g);
        assertEquals(0, g.availablePermits());
        c.close();
        c.close();
        assertEquals("한 번만 돌려줌", 1, g.availablePermits());
        assertEquals("실제 연결 close 는 그대로 넘김", 2, closed[0]);
        assertTrue(c.isClosed());
    }

    /** 풀을 닫지 않으면 이클립스 F5 때마다 옛 연결이 남습니다 - 웹앱 종료 처리에서 닫아야 합니다. */
    @Test
    public void shutdownClosesPool() throws Exception {
        String src = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/DbShutdown.java")), StandardCharsets.UTF_8);
        assertTrue(src.contains("@WebListener"));
        assertTrue("종료 처리에 Db.close() 가 있어야 합니다", src.contains("Db.close();"));
    }

    /** 닫은 뒤에 다시 닫아도 괜찮고(풀을 만든 적 없을 때 포함), 예전 오류 문구는 그대로입니다. */
    @Test
    public void closeTwiceIsSafeAndMessageKept() throws Exception {
        Db.close();
        Db.close();
        String src = new String(Files.readAllBytes(Paths.get("src/main/java/com/gh/routefly/web/Db.java")), StandardCharsets.UTF_8);
        assertTrue(src.contains("\"db.url 이 설정되지 않았습니다(config.properties)\""));
    }
}
