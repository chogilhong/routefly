package com.gh.routefly.web;

import java.io.BufferedReader;
import java.io.IOException;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산악회 방 API(Party - 2026-10-20 홍TV님). 열쇠(token)는 주소가 아니라 본문으로(접속 기록에 남지 않게), 응답은 저장하지 않음(no-store).
 * <pre>
 * GET  /api/party/status                                  {enabled, app} - app: 앱을 플레이스토어에 올렸으면(app.released=true) 회원을 앱으로
 * POST /api/party/create {name, departAt, endAt, minPeople, leaderName, leaderPhone, buses, seats, plates, stops}  인솔자 → 방 + 열쇠(buses 차량 수 · seats 한 대 좌석 · plates 호차별 차량번호)
 * POST /api/party/info   {code}                            참가 전 방 소개(이름 · 출발 · 인솔자 · 인원 · 좌석 수 · 탑승지 · 찬 좌석)
 * POST /api/party/join   {code, nick, role, bus, seat, stop, agree} 회원(hiker) · 운전자(driver) → 열쇠 - agree(위치 제공 동의)가 true 여야
 * POST /api/party/loc    {token, lat, lon, acc, batt, sos} 내 위치(출발 3시간 전부터 받음) → 방 화면
 * POST /api/party/ping   {token, batt, sos}               위치를 못 잡을 때 - 폰은 켜짐 · 배터리 · SOS(위치 없이)
 * POST /api/party/view   {token}                           방 화면
 * POST /api/party/board  {token, on}                       회원 - 출발 때 버스 탔어요
 * POST /api/party/aboard {token, on}                       회원 - 하산 탑승
 * POST /api/party/seat   {token, id?, bus, seat, stop}          자리 · 탑승지 - 회원은 자기 것, 인솔자 · 운전자는 id 로 아무나
 * POST /api/party/mark   {token, bus, seat, what: boarded|reserved, on} 인솔자 · 운전자 - 좌석표
 * POST /api/party/depart {token}                           인솔자 - 출발(안 탄 사람 취소)
 * POST /api/party/notice {token, text} · /bus {token, bus, lat, lon} · /plate {token, bus, plate}  (plate - 인솔자 · 운전자, 운전자는 자기 호차)
 * POST /api/party/kick   {token, id}                       인솔자 - 회원 내보내기(그 폰은 410 "내보냈습니다")
 * POST /api/party/leave  {token} · /end {token, cancel}    나가기 · (인솔자) 방 끝내기 · 산행 취소
 * </pre>
 * 끝난 방 열쇠로 오면 410 + 까닭. 설정 party.enabled=true 가 아니면 status 말고는 404.
 */
@WebServlet(urlPatterns = {"/api/party/*"})
public class PartyServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    static boolean enabled() {
        return "true".equalsIgnoreCase(RouteflyConfig.get("party.enabled"));
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!"/status".equals(req.getPathInfo())) { Json.fail(resp, 404, "없는 주소입니다."); return; }
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        o.addProperty("enabled", enabled());
        o.addProperty("app", "true".equalsIgnoreCase(RouteflyConfig.get("app.released")));
        Json.write(resp, 200, o, false);
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!enabled()) { Json.fail(resp, 404, "산악회 방은 준비 중입니다."); return; }
        // JSON 으로 보낸 것만(다른 누리집이 손님 브라우저로 몰래 보내는 text/plain 글을 막음 - 점검)
        String ct = req.getContentType();
        if (ct == null || !ct.toLowerCase().startsWith("application/json")) { Json.fail(resp, 415, "요청을 읽지 못했습니다."); return; }
        // IPv6 는 /64 로 묶음(점검: 주소마다 따로 세어 한 사람이 주소를 바꿔 가며 방 2000개를 채울 수 있었음)
        String path = req.getPathInfo(), ip = RateLimiter.group(SecurityFilter.clientIp(req.getRemoteAddr(), req.getHeader("CF-Connecting-IP"), req.getHeader("X-Forwarded-For")));
        long now = System.currentTimeMillis();
        boolean lookup = "/info".equals(path) || "/join".equals(path);
        if (lookup && MISSES.over(ip, now)) { Json.fail(resp, 429, "방 코드를 너무 많이 틀렸습니다. 10분 뒤 다시 해 주세요."); return; }
        boolean create = "/create".equals(path) && !owner(req);
        if (create && (CREATES.over(ip, now) || CREATES_ALL.over("*", now))) { Json.fail(resp, 429, "하루에 만들 수 있는 방 수를 넘었습니다. 내일 다시 해 주세요."); return; }
        if ("/join".equals(path) && JOINS.over(ip, now)) { Json.fail(resp, 429, "한 곳에서 참가를 너무 많이 했습니다. 1시간 뒤 다시 해 주세요."); return; }
        JsonObject in;
        try {
            in = body(req);
        } catch (Exception e) {
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
            return;
        }
        try {
            JsonObject out = handle(Party.STORE, path, in, now);
            if (create) { CREATES.take(ip, now); CREATES_ALL.take("*", now); }   // 만든 것만 셈(점검: 날짜를 틀린 것도 세어 하루 막혔음)
            if ("/join".equals(path)) JOINS.take(ip, now);
            Json.write(resp, 200, out, false);
        } catch (Party.Ended e) {
            Json.fail(resp, 410, e.getMessage());
        } catch (IllegalArgumentException | IllegalStateException e) {
            if (lookup && e.getMessage() != null && e.getMessage().contains("찾지 못했습니다")) MISSES.take(ip, now);   // 없는 코드 - 하나씩 쳐 보기 막기
            Json.fail(resp, 400, e.getMessage());
        } catch (SecurityException e) {
            Json.fail(resp, 403, e.getMessage());
        } catch (RuntimeException e) {   // 칸 꼴이 틀림(Gson 등) - 내부 글은 내보내지 않음
            Json.fail(resp, 400, "요청을 읽지 못했습니다.");
        }
    }

    /** 방 만들기: IP 마다 하루 5개(한 사람이 2000개를 채워 아무도 못 만들게 하는 것을 막음 - 점검). */
    static final Quota CREATES = new Quota(5, 24 * 3600_000L);
    /** 방 만들기 - 서버 전체 하루 300개(주소를 바꿔 가며 채우기 막기, 2026-10-22 점검). 운영자는 빼고 셈. */
    static final Quota CREATES_ALL = new Quota(300, 24 * 3600_000L);
    /**
     * 참가 - 한 곳(IP · IPv6 /64)에서 1시간에 120번. 처음엔 15번이었으나 출발하는 버스 안에서 인솔자가 "지금 등록하세요" 하면
     * 버스 와이파이 · 통신사 공유 주소 하나로 수십 명이 한꺼번에 들어옴(2026-10-22 홍TV님 "풀어줘") - 버스 두 대(120석)도 막히지 않게.
     * 프로그램으로 300명을 채우는 것만 늦춤(방 한도 MAX_MEMBERS 300).
     */
    static final Quota JOINS = new Quota(120, 3600_000L);

    /** 운영자 기기(/stats 를 연 브라우저 · 앱 - 쿠키 값이 통계 열쇠에서 만든 값과 맞을 때)는 방 만들기 하루 제한을 받지 않음(2026-10-21 PC: 시험하다 막힘). */
    static boolean owner(HttpServletRequest req) {
        String key = RouteflyConfig.get("stats.key");
        if (key == null || key.length() < 12 || req.getCookies() == null) return false;
        String want = StatsServlet.ownerToken(key);
        for (jakarta.servlet.http.Cookie c : req.getCookies())
            if (StatsServlet.OWNER_COOKIE.equals(c.getName()) && java.security.MessageDigest.isEqual(want.getBytes(java.nio.charset.StandardCharsets.UTF_8), c.getValue().getBytes(java.nio.charset.StandardCharsets.UTF_8))) return true;
        return false;
    }
    /** 없는 방 코드: IP 마다 10분에 20번(코드를 하나씩 쳐 보기 막기 - 점검). */
    static final Quota MISSES = new Quota(20, 600_000L);

    /** IP 마다 기간 안 횟수(메모리, 1만 곳까지 - 넘으면 오래된 것부터 버림). */
    static final class Quota {
        private final int max;
        private final long window;
        private final java.util.LinkedHashMap<String, java.util.ArrayDeque<Long>> hits = new java.util.LinkedHashMap<>(16, 0.75f, true) {
            private static final long serialVersionUID = 1L;
            @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, java.util.ArrayDeque<Long>> e) { return size() > 10_000; }
        };
        Quota(int max, long window) { this.max = max; this.window = window; }

        private java.util.ArrayDeque<Long> of(String ip, long now) {
            java.util.ArrayDeque<Long> q = hits.computeIfAbsent(ip == null ? "" : ip, k -> new java.util.ArrayDeque<>());
            while (!q.isEmpty() && now - q.peekFirst() > window) q.pollFirst();
            return q;
        }
        /** 이미 다 썼나(세지 않음). */
        synchronized boolean over(String ip, long now) { return of(ip, now).size() >= max; }
        /** 한 번 셈 - 다 썼으면 false(세지 않음). */
        synchronized boolean take(String ip, long now) {
            java.util.ArrayDeque<Long> q = of(ip, now);
            if (q.size() >= max) return false;
            q.addLast(now);
            return true;
        }
    }

    /** 본문 JSON(4KB 까지). */
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

    /** 처리(시험이 store · 시각을 넣음). 잘못된 값 → IllegalArgumentException, 권한 없음 → SecurityException, 끝난 방 → Party.Ended. */
    static JsonObject handle(Party p, String path, JsonObject in, long now) {
        if ("/create".equals(path)) {
            Party.Member lead = p.create(str(in, "name"), lng(in, "departAt"), lng(in, "endAt"), Math.max(1, (int) lng(in, "buses")), (int) lng(in, "seats"), (int) lng(in, "minPeople"),
                    Party.stops(str(in, "stops")), str(in, "leaderName"), str(in, "leaderPhone"), strs(in, "plates"), now);
            return withToken(p.view(lead, now), lead);
        }
        if ("/info".equals(path)) return p.info(str(in, "code"), now);
        if ("/join".equals(path)) {
            if (!bool(in, "agree")) throw new IllegalArgumentException("위치 제공에 동의해야 참가할 수 있습니다.");
            Party.Member m = p.join(str(in, "code"), str(in, "nick"), str(in, "role"), integer(in, "bus"), integer(in, "seat"), str(in, "stop"), now);
            return withToken(p.view(m, now), m);
        }
        Party.Member m = p.who(str(in, "token"), now);
        if (m == null) throw new IllegalArgumentException("방이 끝났거나 열쇠가 맞지 않습니다.");
        boolean lead = "lead".equals(m.role), staff = m.staff();
        boolean on = bool(in, "on");
        JsonObject out;
        switch (path == null ? "" : path) {
            case "/loc" -> {
                boolean kept = p.loc(m, num(in, "lat"), num(in, "lon"), num(in, "acc"), num(in, "batt") == null ? null : num(in, "batt").intValue(),
                        bool(in, "sos"), now);
                out = p.view(m, now);
                out.addProperty("locKept", kept);   // false - 출발 3시간 전이라 버림
                return out;
            }
            case "/view" -> { }
            case "/trail" -> { return p.trail(m, (int) lng(in, "id"), now); }
            case "/ping" -> p.ping(m, num(in, "batt") == null ? null : num(in, "batt").intValue(), in.has("sos") ? bool(in, "sos") : null, now);   // sos 가 없으면(앱 RfAlive) 그대로
            case "/board" -> p.board(m, on, now);
            case "/aboard" -> p.aboard(m, on);
            case "/seat" -> p.seat(m, integer(in, "id"), integer(in, "bus"), integer(in, "seat"), str(in, "stop"));
            case "/mark" -> {
                if (!staff) throw new SecurityException("인솔자 · 운전자만 좌석표를 고칠 수 있습니다.");
                if (integer(in, "id") != null && "boarded".equals(str(in, "what"))) p.boardById(m, integer(in, "id"), on);   // 명단에서 사람으로(취소 되돌리기)
                else p.mark(m, integer(in, "bus"), (int) lng(in, "seat"), str(in, "what"), on);
            }
            case "/depart" -> {
                if (!lead) throw new SecurityException("인솔자만 출발할 수 있습니다.");
                int n = p.depart(m);
                out = p.view(m, now);
                out.addProperty("cancelledNow", n);
                return out;
            }
            case "/notice" -> { if (!lead) throw new SecurityException("인솔자만 공지할 수 있습니다."); p.notice(m, str(in, "text"), now); }
            case "/bus" -> { if (!staff) throw new SecurityException("인솔자 · 운전자만 버스 자리를 정할 수 있습니다."); p.bus(m, integer(in, "bus"), num(in, "lat"), num(in, "lon")); }
            case "/plate" -> { if (!staff) throw new SecurityException("인솔자 · 운전자만 차량번호를 적을 수 있습니다."); p.plate(m, integer(in, "bus"), str(in, "plate")); }
            case "/kick" -> { if (!lead) throw new SecurityException("인솔자만 내보낼 수 있습니다."); p.kick(m, (int) lng(in, "id"), now); }
            case "/leave" -> { p.leave(m); return ok(); }
            case "/end" -> { if (!lead) throw new SecurityException("인솔자만 방을 끝낼 수 있습니다."); p.end(m, bool(in, "cancel"), now); return ok(); }
            default -> throw new IllegalArgumentException("없는 주소입니다.");
        }
        return p.view(m, now);
    }

    private static JsonObject withToken(JsonObject o, Party.Member m) {
        o.addProperty("token", m.token);
        return o;
    }

    private static JsonObject ok() {
        JsonObject o = new JsonObject();
        o.addProperty("success", true);
        return o;
    }

    /** 참 · 거짓 칸 - 다른 꼴(객체 · 글)이면 거짓(Gson 예외 글이 그대로 나가지 않게 - 점검). */
    private static boolean bool(JsonObject in, String k) {
        JsonElement e = in.get(k);
        return e != null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isBoolean() && e.getAsBoolean();
    }

    private static String str(JsonObject in, String k) {
        JsonElement e = in.get(k);
        return e == null || e.isJsonNull() || !e.isJsonPrimitive() ? null : e.getAsString();
    }

    /** 글 배열(8개까지) - 배열이 아니면 null. */
    private static java.util.List<String> strs(JsonObject in, String k) {
        JsonElement e = in.get(k);
        if (e == null || !e.isJsonArray()) return null;
        java.util.List<String> out = new java.util.ArrayList<>();
        for (JsonElement x : e.getAsJsonArray()) {
            if (out.size() >= Party.MAX_BUSES) break;
            out.add(x.isJsonPrimitive() ? x.getAsString() : null);
        }
        return out;
    }

    private static Double num(JsonObject in, String k) {
        JsonElement e = in.get(k);
        if (e == null || e.isJsonNull() || !e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber()) return null;
        double v = e.getAsDouble();
        return Double.isFinite(v) ? v : null;
    }

    private static Integer integer(JsonObject in, String k) {
        Double d = num(in, k);
        return d == null ? null : d.intValue();
    }

    private static long lng(JsonObject in, String k) {
        Double d = num(in, k);
        return d == null ? 0 : d.longValue();
    }
}
