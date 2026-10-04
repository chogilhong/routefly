package com.gh.routefly.web;

import java.io.IOException;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Timestamp;

import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

/** SELECT 결과 → JSON, JSON 응답 쓰기(investing 의 OverviewServlet 안 도우미를 여러 서블릿이 쓰게 뺀 것). */
final class Json {

    private Json() {
    }

    /** SELECT 결과를 JSON 줄 목록으로. 숫자는 숫자, 시각은 "yyyy-MM-dd HH:mm:ss" 문자열. */
    static JsonArray rows(Connection c, String sql, Object... params) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) ps.setObject(i + 1, params[i]);
            try (ResultSet rs = ps.executeQuery()) {
                ResultSetMetaData md = rs.getMetaData();
                JsonArray out = new JsonArray();
                while (rs.next()) {
                    JsonObject row = new JsonObject();
                    for (int i = 1; i <= md.getColumnCount(); i++) {
                        row.add(md.getColumnLabel(i), value(rs.getObject(i)));
                    }
                    out.add(row);
                }
                return out;
            }
        }
    }

    static JsonElement value(Object v) {
        if (v == null) return JsonNull.INSTANCE;
        if (v instanceof BigDecimal) return new JsonPrimitive((BigDecimal) v);
        if (v instanceof Number) return new JsonPrimitive((Number) v);
        if (v instanceof Timestamp) return new JsonPrimitive(((Timestamp) v).toLocalDateTime().toString().replace('T', ' '));
        if (v instanceof java.time.LocalDateTime) return new JsonPrimitive(v.toString().replace('T', ' '));
        return new JsonPrimitive(String.valueOf(v));
    }

    /** 실패 응답 {success:false, message}. */
    static void fail(HttpServletResponse resp, int status, String message) throws IOException {
        JsonObject out = new JsonObject();
        out.addProperty("success", false);
        out.addProperty("message", message);
        write(resp, status, out, false);
    }

    /**
     * JSON 응답. 코스 자료는 배치가 1시간마다 바꾸는 공개 자료라 짧게(5분) 캐시하게 둡니다.
     * 실패 응답은 캐시하지 않습니다.
     */
    static void write(HttpServletResponse resp, int status, JsonObject body, boolean cacheable) throws IOException {
        resp.setStatus(status);
        resp.setCharacterEncoding("UTF-8");
        resp.setContentType("application/json;charset=UTF-8");
        resp.setHeader("Cache-Control", cacheable ? "public, max-age=300" : "no-store");
        resp.getWriter().write(body.toString());
    }
}
