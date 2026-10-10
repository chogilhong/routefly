package com.gh.routefly.web;

import java.sql.Connection;
import java.sql.SQLException;

import org.apache.ibatis.datasource.pooled.PooledDataSource;

/**
 * DB 연결. 2026-10-07: 연결 풀(MyBatis {@link PooledDataSource}, investing 의 Db 와 같은 방식)에서 빌려 줍니다.
 * 부르는 쪽은 예전처럼 try-with-resources 로 닫으면 되고, 그 close() 가 풀에 돌려주는 것이 됩니다.
 *
 * <p>접속 정보는 config.properties 의 {@code db.url} / {@code db.user} / {@code db.password},
 * 풀 크기는 {@code db.pool.maxActive}(기본 10) / {@code db.pool.maxIdle}(기본 5).
 * 처음 부를 때 한 번 만들고, 웹앱이 내려갈 때 {@link #close()} 로 닫습니다({@link DbShutdown}).
 */
final class Db {

    static final int DEFAULT_MAX_ACTIVE = 10;
    static final int DEFAULT_MAX_IDLE = 5;
    static final int CHECKOUT_TIME_MS = 20_000;
    /** 이만큼 쉬었던 연결은 빌려 주기 전에 SELECT 1 로 살아 있는지 봅니다(밤새 쉬면 DB 의 wait_timeout 으로 끊겨 있음). */
    static final int PING_IDLE_MS = 5 * 60_000;

    /** 쿼리 하나가 이보다 오래 응답이 없으면 끊습니다(db.url 에 socketTimeout 이 이미 있으면 그 값). */
    static final int SOCKET_TIMEOUT_MS = 15_000;
    static final int POOL_WAIT_MS = 2_000;

    private static volatile PooledDataSource pool;

    private Db() {
    }

    static Connection open() throws SQLException {
        return pool().getConnection();
    }

    private static PooledDataSource pool() throws SQLException {
        PooledDataSource p = pool;
        if (p != null) return p;
        synchronized (Db.class) {
            if (pool != null) return pool;
            String url = RouteflyConfig.get("db.url");
            if (url == null) throw new SQLException("db.url 이 설정되지 않았습니다(config.properties)");
            try {
                // 톰캣 웹앱 안에서는 드라이버 자동 등록이 안 될 때가 있어 직접 올립니다.
                Class.forName("org.mariadb.jdbc.Driver");
            } catch (ClassNotFoundException e) {
                throw new SQLException("MariaDB 드라이버가 없습니다", e);
            }
            // 2026-10-10 점검: 쿼리가 끝없이 걸리면 연결 10개가 다 묶여 화면 전체가 멈춥니다 - 소켓 시간 제한을 둡니다
            url = withSocketTimeout(url, SOCKET_TIMEOUT_MS);
            PooledDataSource ds = new PooledDataSource("org.mariadb.jdbc.Driver", url,
                    RouteflyConfig.get("db.user"), RouteflyConfig.get("db.password"));
            ds.setPoolMaximumActiveConnections(poolSize(RouteflyConfig.get("db.pool.maxActive"), DEFAULT_MAX_ACTIVE));
            ds.setPoolMaximumIdleConnections(poolSize(RouteflyConfig.get("db.pool.maxIdle"), DEFAULT_MAX_IDLE));
            ds.setPoolMaximumCheckoutTime(CHECKOUT_TIME_MS);
            ds.setPoolTimeToWait(POOL_WAIT_MS);
            ds.setPoolPingEnabled(true);
            ds.setPoolPingQuery("SELECT 1");
            ds.setPoolPingConnectionsNotUsedFor(PING_IDLE_MS);
            pool = ds;
            return ds;
        }
    }

    /** 웹앱이 내려갈 때 - 풀의 연결을 전부 닫습니다(이클립스 F5 로 다시 올려도 옛 연결이 남지 않게). */
    static synchronized void close() {
        PooledDataSource p = pool;
        pool = null;
        if (p != null) p.forceCloseAll();
    }

    /** 순수 함수 - JDBC 주소에 socketTimeout 이 없으면 붙입니다. */
    static String withSocketTimeout(String url, int ms) {
        if (url.toLowerCase(java.util.Locale.ROOT).contains("sockettimeout=")) return url;
        return url + (url.contains("?") ? "&" : "?") + "socketTimeout=" + ms;
    }

    /** 순수 함수 - 풀 크기 설정값. 비었거나 숫자가 아니거나 1 보다 작으면 기본값. */
    static int poolSize(String v, int def) {
        if (v == null) return def;
        try {
            int n = Integer.parseInt(v.trim());
            return n >= 1 ? n : def;
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
