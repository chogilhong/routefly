package com.gh.routefly.web;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

/**
 * DB 연결. 요청마다 연결을 열고 닫습니다(investing 과 같음 - 연결 풀은 사용자가 늘면 붙입니다).
 * 접속 정보는 config.properties 의 {@code db.url} / {@code db.user} / {@code db.password}.
 */
final class Db {

    private Db() {
    }

    static Connection open() throws SQLException {
        String url = RouteflyConfig.get("db.url");
        if (url == null) throw new SQLException("db.url 이 설정되지 않았습니다(config.properties)");
        try {
            // 톰캣 웹앱 안에서는 드라이버 자동 등록이 안 될 때가 있어 직접 올립니다.
            Class.forName("org.mariadb.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            throw new SQLException("MariaDB 드라이버가 없습니다", e);
        }
        return DriverManager.getConnection(url, RouteflyConfig.get("db.user"), RouteflyConfig.get("db.password"));
    }
}
