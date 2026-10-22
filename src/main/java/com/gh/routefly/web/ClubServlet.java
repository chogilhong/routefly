package com.gh.routefly.web;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 안내산악회 일정(Clubs). 2026-10-22 홍TV님.
 *
 * <ul>
 *   <li>{@code GET /api/club/list[?m=산]} - 공개 일정(확인된 산악회만, 광고는 MAX_ADS 개까지 위).</li>
 *   <li>{@code POST /api/club/apply} - 산악회 신청(이름 · 연락처 - 아이디 · 비밀번호 없음).</li>
 *   <li>{@code POST /api/club/enter {key}} - 운영자가 보낸 관리 링크(club.html#k=…)로 들어옴 → 로그인 쿠키 rf-club(30일).</li>
 *   <li>{@code POST /api/club/me · edit · trip · trip-delete · bulk · logout · quit} - 로그인한 산악회.</li>
 *   <li>{@code POST /api/club/admin/list · approve · link · feature · delete} - 운영자 기기만(통계 열쇠로 만든 쿠키 - PartyServlet.owner).</li>
 * </ul>
 * 설정 club.enabled=true 일 때만. POST 는 application/json 만(다른 누리집이 몰래 보내는 폼 막기) · 쿠키는 HttpOnly · SameSite=Lax.
 */
@WebServlet(urlPatterns = {"/api/club/*"})
public class ClubServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    static final String COOKIE = "rf-club";

    /** 신청: 한 곳(IP 묶음)에서 하루 5번 · 서버 전체 하루 30번. 관리 링크 틀림: 한 곳에서 15분에 10번. */
    static final PartyServlet.Quota APPLY = new PartyServlet.Quota(5, 24 * 3600_000L), APPLY_ALL = new PartyServlet.Quota(30, 24 * 3600_000L);
    static final PartyServlet.Quota BAD_LINK = new PartyServlet.Quota(10, 15 * 60_000L);

    static boolean enabled() {
        return "true".equalsIgnoreCase(RouteflyConfig.get("club.enabled"));
    }

    @Override
    public void init() {
        // 100대 명산 이름 - 일정의 산이 산 페이지와 맞게(2026-10-22 점검: 자유 글이라 "가야산(합천)" 은 산 페이지에 안 나왔음)
        try (InputStream in = getServletContext().getResourceAsStream("/data/mountains100.json")) {
            if (in == null) return;
            Set<String> ids = new HashSet<>();
            for (JsonElement e : JsonParser.parseString(new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonArray("peaks"))
                ids.add(e.getAsJsonObject().get("id").getAsString());
            Clubs.mountains(ids);
        } catch (Exception e) {
            // 산 이름을 따지지 않음
        }
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
            for (Object[] x : Clubs.STORE.upcoming(m == null || m.isBlank() ? null : m.trim(), now, 500, Clubs.MAX_ADS + 1))
                arr.add(Clubs.tripJson((Clubs.Trip) x[0], (Clubs.Club) x[1], (Boolean) x[2], now));
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
            in = body(req, "/bulk".equals(path) ? 32768 : 4096);
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
            } else if ("/apply".equals(path)) {
                if (!bool(in, "agree")) throw new IllegalArgumentException("개인정보 수집 · 이용에 동의해 주세요.");
                if (!take(APPLY, ip, now) || !take(APPLY_ALL, "*", now)) { Json.fail(resp, 429, "신청이 많습니다. 내일 다시 해 주세요."); return; }   // 먼저 셈(동시에 여러 번 보내 넘기기 막기)
                Clubs.STORE.apply(str(in, "name"), str(in, "phone"), str(in, "publicPhone"), str(in, "url"), now);
                out = ok();
            } else if ("/enter".equals(path)) {
                if (BAD_LINK.over(ip, now)) { Json.fail(resp, 429, "잘못된 링크를 너무 많이 열었습니다. 15분 뒤 다시 해 주세요."); return; }
                String token = Clubs.STORE.enter(str(in, "key"), now);
                if (token == null) { BAD_LINK.take(ip, now); throw new IllegalArgumentException("관리 링크가 맞지 않거나 새 링크로 바뀌었습니다. 운영자에게 새 링크를 받아 주세요."); }
                setCookie(resp, token, cookiePath, secure, Clubs.SESSION_MS / 1000);
                out = me(Clubs.STORE, Clubs.STORE.who(token, now), now);
            } else if ("/logout".equals(path)) {
                Clubs.STORE.logout(cookie(req));
                setCookie(resp, "", cookiePath, secure, 0);
                out = ok();
            } else {
                Clubs.Club c = Clubs.STORE.who(cookie(req), now);
                if (c == null) { Json.fail(resp, 401, "관리 링크로 다시 들어와 주세요."); return; }
                if ("/quit".equals(path)) {
                    Clubs.STORE.delete(c.id);
                    setCookie(resp, "", cookiePath, secure, 0);
                    out = ok();
                } else {
                    out = handle(Clubs.STORE, c, path, in, now);
                    if (out.has("recheck")) setCookie(resp, "", cookiePath, secure, 0);   // 누리집이 바뀌어 다시 확인 - 로그인도 끊김
                }
            }
            Json.write(resp, 200, out, false);
        } catch (IllegalArgumentException | IllegalStateException e) {
            Json.fail(resp, 400, e instanceof NumberFormatException ? "요청을 읽지 못했습니다." : e.getMessage());
        } catch (RuntimeException e) {
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
        }
    }

    private static synchronized boolean take(PartyServlet.Quota q, String key, long now) {
        return q.take(key, now);
    }

    /** 로그인한 산악회의 요청(시험이 store · 시각을 넣음). */
    static JsonObject handle(Clubs s, Clubs.Club c, String path, JsonObject in, long now) {
        JsonObject extra = new JsonObject();
        switch (path) {
            case "/me" -> { }
            case "/edit" -> {
                if (s.edit(c, str(in, "name"), str(in, "phone"), str(in, "publicPhone"), str(in, "url"), str(in, "defStops"), num(in, "defBuses", 1), num(in, "defSeats", 28))) {
                    JsonObject o = ok();
                    o.addProperty("recheck", true);
                    return o;
                }
            }
            case "/trip" -> s.saveTrip(c, in.has("id") && !in.get("id").isJsonNull() ? num(in, "id", -1) : null, lng(in, "departAt"), str(in, "mountain"), str(in, "title"),
                    str(in, "stops"), num(in, "price", 0), str(in, "bookUrl"), num(in, "repeat", 0), now);
            case "/trip-delete" -> s.deleteTrip(c, num(in, "id", -1));
            case "/bulk" -> extra = s.saveBulk(c, str(in, "text"), bool(in, "save"), now);
            default -> throw new IllegalArgumentException("없는 주소입니다.");
        }
        JsonObject o = me(s, c, now);
        if (extra.has("trips")) o.add("bulk", extra);
        return o;
    }

    static JsonObject me(Clubs s, Clubs.Club c, long now) {
        JsonObject o = ok();
        o.add("club", Clubs.clubJson(c, now));
        JsonArray ts = new JsonArray();
        for (Clubs.Trip t : s.tripsOf(c, now)) ts.add(Clubs.tripJson(t, null, false, now));
        o.add("trips", ts);
        return o;
    }

    /** 운영자 - 산악회 목록(확인 전 포함) · 확인 · 관리 링크 · 광고 · 지우기. 관리 링크 열쇠는 만든 그 응답에만 실림. */
    static JsonObject admin(Clubs s, String path, JsonObject in, long now) {
        JsonObject o = ok();
        switch (path) {
            case "/admin/list" -> { }
            case "/admin/approve" -> s.approve(num(in, "id", -1), bool(in, "on"));
            case "/admin/link" -> o.addProperty("key", s.newLink(num(in, "id", -1)));
            case "/admin/feature" -> s.feature(num(in, "id", -1), num(in, "days", 0), now);
            case "/admin/delete" -> s.delete(num(in, "id", -1));
            default -> throw new IllegalArgumentException("없는 주소입니다.");
        }
        JsonArray arr = new JsonArray();
        for (Clubs.Club c : s.all(now)) {
            JsonObject x = Clubs.clubJson(c, now);
            x.addProperty("trips", s.tripCount(c.id));
            arr.add(x);
        }
        o.add("clubs", arr);
        if (s.broken()) o.addProperty("broken", "clubs.json 을 읽지 못해 저장을 멈췄습니다. 서버의 clubs.json.bad-* 를 확인해 주세요.");
        return o;
    }

    /** 로그인한 확인된 산악회 번호(산악회 방 만들기 - 산악회마다 하루 제한, PartyServlet). 아니면 0. */
    static int clubId(HttpServletRequest req) {
        if (!enabled()) return 0;
        Clubs.Club c = Clubs.STORE.who(cookie(req), System.currentTimeMillis());
        return c == null ? 0 : c.id;
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

    private static JsonObject body(HttpServletRequest req, int max) throws IOException {
        StringBuilder sb = new StringBuilder();
        char[] buf = new char[1024];
        BufferedReader r = req.getReader();
        for (int n; (n = r.read(buf)) > 0;) {
            sb.append(buf, 0, n);
            if (sb.length() > max) throw new IOException("too large");
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

    /** 숫자 칸(숫자가 아니면 기본값 - 오류 글에 내부 사정이 나가지 않게). */
    private static int num(JsonObject in, String k, int def) {
        JsonElement e = in.get(k);
        if (e == null || e.isJsonNull() || !e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber()) return def;
        double d = e.getAsDouble();
        return d >= Integer.MIN_VALUE && d <= Integer.MAX_VALUE ? (int) d : def;
    }

    private static boolean bool(JsonObject in, String k) {
        JsonElement e = in.get(k);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isBoolean() && e.getAsBoolean();
    }
}
