package com.gh.routefly.web;

import java.io.BufferedReader;
import java.io.IOException;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 안내산악회 계정 · 일정(Clubs). 2026-10-22 홍TV님.
 *
 * <ul>
 *   <li>{@code GET /api/club/list[?m=산]} - 공개 일정(확인된 산악회만, 추천 먼저).</li>
 *   <li>{@code POST /api/club/signup · login · logout · me · edit · password · delete · trip · trip-delete} - 산악회(로그인 쿠키 rf-club).</li>
 *   <li>{@code POST /api/club/admin/list · approve · feature · reset} - 운영자 기기만(통계 열쇠로 만든 쿠키 - PartyServlet.owner).</li>
 * </ul>
 * 설정 club.enabled=true 일 때만(그 전엔 "준비 중"). POST 는 application/json 만 받음(다른 누리집이 몰래 보내는 폼 막기) · 로그인 쿠키는 HttpOnly · SameSite=Lax.
 */
@WebServlet(urlPatterns = {"/api/club/*"})
public class ClubServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final String COOKIE = "rf-club";

    /** 가입: 한 곳(IP 묶음)에서 하루 3번. 로그인 실패: 한 곳에서 15분에 10번 · 한 아이디에 15분에 10번(비밀번호 맞히기 막기). */
    static final PartyServlet.Quota SIGNUPS = new PartyServlet.Quota(3, 24 * 3600_000L);
    static final PartyServlet.Quota FAILS_IP = new PartyServlet.Quota(10, 15 * 60_000L), FAILS_ID = new PartyServlet.Quota(10, 15 * 60_000L);

    static boolean enabled() {
        return "true".equalsIgnoreCase(RouteflyConfig.get("club.enabled"));
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!"/list".equals(req.getPathInfo())) { Json.fail(resp, 404, "없는 주소입니다."); return; }
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.addProperty("enabled", enabled());
        long now = System.currentTimeMillis();
        JsonArray arr = new JsonArray();
        if (enabled()) {
            String m = req.getParameter("m");
            for (Object[] x : Clubs.STORE.upcoming(m == null || m.isBlank() ? null : m.trim(), now, 300)) arr.add(Clubs.tripJson((Clubs.Trip) x[0], (Clubs.Club) x[1], now));
        }
        o.add("trips", arr);
        Json.write(resp, 200, o, false);
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!enabled()) { Json.fail(resp, 404, "안내산악회 일정은 준비 중입니다."); return; }
        String ct = req.getContentType();
        if (ct == null || !ct.toLowerCase().startsWith("application/json")) { Json.fail(resp, 415, "요청을 읽지 못했습니다."); return; }
        String path = req.getPathInfo() == null ? "" : req.getPathInfo();
        String ip = RateLimiter.group(SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For")));
        long now = System.currentTimeMillis();
        JsonObject in;
        try {
            in = body(req);
        } catch (Exception e) {
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
            return;
        }
        boolean secure = req.isSecure() || "https".equalsIgnoreCase(req.getHeader("X-Forwarded-Proto"));
        String cookiePath = req.getContextPath().isEmpty() ? "/" : req.getContextPath();
        try {
            JsonObject out;
            if (path.startsWith("/admin/")) {
                if (!PartyServlet.owner(req)) { Json.fail(resp, 404, "없는 주소입니다."); return; }
                out = admin(Clubs.STORE, path, in, now);
            } else if ("/signup".equals(path)) {
                if (!bool(in, "agree")) throw new IllegalArgumentException("개인정보 수집 · 이용에 동의해 주세요.");
                if (SIGNUPS.over(ip, now)) { Json.fail(resp, 429, "가입을 너무 많이 했습니다. 내일 다시 해 주세요."); return; }
                String token = Clubs.STORE.signup(str(in, "login"), str(in, "password"), str(in, "name"), str(in, "phone"), str(in, "url"), now);
                SIGNUPS.take(ip, now);
                setCookie(resp, token, cookiePath, secure, Clubs.SESSION_MS / 1000);
                out = me(Clubs.STORE, Clubs.STORE.who(token, now), now);
            } else if ("/login".equals(path)) {
                String id = str(in, "login") == null ? "" : str(in, "login").trim().toLowerCase();
                if (FAILS_IP.over(ip, now) || FAILS_ID.over(id, now)) { Json.fail(resp, 429, "비밀번호를 너무 많이 틀렸습니다. 15분 뒤 다시 해 주세요."); return; }
                String token;
                try {
                    token = Clubs.STORE.login(id, str(in, "password"), now);
                } catch (IllegalArgumentException e) {
                    FAILS_IP.take(ip, now);
                    FAILS_ID.take(id, now);
                    throw e;
                }
                setCookie(resp, token, cookiePath, secure, Clubs.SESSION_MS / 1000);
                out = me(Clubs.STORE, Clubs.STORE.who(token, now), now);
            } else if ("/logout".equals(path)) {
                Clubs.STORE.logout(cookie(req));
                setCookie(resp, "", cookiePath, secure, 0);
                out = ok();
            } else {
                Clubs.Club c = Clubs.STORE.who(cookie(req), now);
                if (c == null) { Json.fail(resp, 401, "로그인해 주세요."); return; }
                if ("/delete".equals(path)) {
                    if (!Clubs.verify(str(in, "password"), c.pw)) throw new IllegalArgumentException("비밀번호가 맞지 않습니다.");
                    Clubs.STORE.delete(c);
                    setCookie(resp, "", cookiePath, secure, 0);
                    out = ok();
                } else {
                    out = handle(Clubs.STORE, c, path, in, now);
                }
            }
            Json.write(resp, 200, out, false);
        } catch (IllegalArgumentException | IllegalStateException e) {
            Json.fail(resp, 400, e.getMessage());
        } catch (RuntimeException e) {
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
        }
    }

    /** 로그인한 산악회의 요청(시험이 store · 시각을 넣음). */
    static JsonObject handle(Clubs s, Clubs.Club c, String path, JsonObject in, long now) {
        switch (path) {
            case "/me" -> { }
            case "/edit" -> s.edit(c, str(in, "name"), str(in, "phone"), str(in, "url"), str(in, "intro"));
            case "/password" -> s.password(c, str(in, "old"), str(in, "password"));
            case "/trip" -> s.saveTrip(c, in.has("id") && !in.get("id").isJsonNull() ? in.get("id").getAsInt() : null, lng(in, "departAt"), str(in, "mountain"), str(in, "title"),
                    str(in, "stops"), (int) lng(in, "price"), str(in, "bookUrl"), now);
            case "/trip-delete" -> s.deleteTrip(c, (int) lng(in, "id"));
            default -> throw new IllegalArgumentException("없는 주소입니다.");
        }
        return me(s, c, now);
    }

    static JsonObject me(Clubs s, Clubs.Club c, long now) {
        JsonObject o = ok();
        o.add("club", Clubs.clubJson(c, now));
        JsonArray ts = new JsonArray();
        for (Clubs.Trip t : s.tripsOf(c, now)) ts.add(Clubs.tripJson(t, null, now));
        o.add("trips", ts);
        return o;
    }

    /** 운영자 - 산악회 목록(확인 전 포함) · 확인 · 추천 · 임시 비밀번호. */
    static JsonObject admin(Clubs s, String path, JsonObject in, long now) {
        JsonObject o = ok();
        switch (path) {
            case "/admin/list" -> { }
            case "/admin/approve" -> s.approve((int) lng(in, "id"), bool(in, "on"));
            case "/admin/feature" -> s.feature((int) lng(in, "id"), (int) lng(in, "days"), now);
            case "/admin/reset" -> o.addProperty("temp", s.resetPassword((int) lng(in, "id")));
            default -> throw new IllegalArgumentException("없는 주소입니다.");
        }
        JsonArray arr = new JsonArray();
        for (Clubs.Club c : s.all()) {
            JsonObject x = Clubs.clubJson(c, now);
            x.addProperty("trips", s.tripCount(c.id));
            arr.add(x);
        }
        o.add("clubs", arr);
        return o;
    }

    /** 로그인한 산악회(산악회 방 만들기 하루 제한을 받지 않게 - PartyServlet). 확인된 곳만. */
    static boolean approvedClub(HttpServletRequest req) {
        if (!enabled()) return false;
        Clubs.Club c = Clubs.STORE.who(cookie(req), System.currentTimeMillis());
        return c != null && c.approved;
    }

    private static void setCookie(HttpServletResponse resp, String token, String path, boolean secure, long maxAge) {
        resp.addHeader("Set-Cookie", COOKIE + "=" + token + "; Max-Age=" + maxAge + "; Path=" + path + "; HttpOnly; SameSite=Lax" + (secure ? "; Secure" : ""));
    }

    static String cookie(HttpServletRequest req) {
        if (req.getCookies() == null) return null;
        for (jakarta.servlet.http.Cookie c : req.getCookies()) if (COOKIE.equals(c.getName())) return c.getValue();
        return null;
    }

    private static JsonObject ok() {
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        return o;
    }

    private static JsonObject body(HttpServletRequest req) throws IOException {
        StringBuilder sb = new StringBuilder();
        char[] buf = new char[1024];
        BufferedReader r = req.getReader();
        for (int n; (n = r.read(buf)) > 0;) {
            sb.append(buf, 0, n);
            if (sb.length() > 4096) throw new IOException("too large");
        }
        return JsonParser.parseString(sb.toString()).getAsJsonObject();
    }

    private static String str(JsonObject in, String k) {
        JsonElement e = in.get(k);
        return e == null || e.isJsonNull() || !e.isJsonPrimitive() ? null : e.getAsString();
    }

    private static long lng(JsonObject in, String k) {
        JsonElement e = in.get(k);
        return e == null || e.isJsonNull() || !e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber() ? 0 : e.getAsLong();
    }

    private static boolean bool(JsonObject in, String k) {
        JsonElement e = in.get(k);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isBoolean() && e.getAsBoolean();
    }
}
