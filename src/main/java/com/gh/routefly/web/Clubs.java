package com.gh.routefly.web;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 안내산악회 계정 · 산행 일정(2026-10-22 홍TV님 "추천한 작업 진행 - 필요하면 로그인 페이지도").
 *
 * <ul>
 *   <li>모집 · 예약은 산악회 누리집이 하고, routefly 는 일정을 산 페이지에 이어 주고(누르면 그 산악회 예약 화면으로) 산행 날 도구(산악회 방)를 줌.</li>
 *   <li>산악회가 가입하면 운영자가 확인(approved)한 뒤에만 일정이 공개됨 - 가짜 · 광고 글 막기.</li>
 *   <li>추천(featuredUntil) - 운영자가 정한 날까지 목록 맨 위 + "추천 · 광고" 표시(돈 받은 자리는 꼭 표시 - 표시광고법).</li>
 *   <li>비밀번호는 PBKDF2(SHA-256, 소금)로만, 로그인 열쇠는 쿠키에 무작위 값 · 파일엔 그 해시만.</li>
 *   <li>파일: party.dir(없으면 stats.dir · 톰캣 폴더/routefly-party)/clubs.json (600), 3초마다 모아 씀.</li>
 * </ul>
 */
final class Clubs {

    private static final Logger log = LogManager.getLogger(Clubs.class);
    static final int MAX_CLUBS = 500, MAX_TRIPS_PER_CLUB = 60, MAX_TRIPS = 5000, PBKDF2_ITER = 120_000;
    static final long DAY = 24 * 3600_000L, SESSION_MS = 30 * DAY;

    static final class Club {
        final int id;
        final String login;
        String pw;              // "iter:소금(base64):해시(base64)"
        String name, phone, url, intro;
        boolean approved;
        long featuredUntil;     // 0 = 추천 아님
        final long created;

        Club(int id, String login, long created) {
            this.id = id; this.login = login; this.created = created;
        }

        boolean featured(long now) { return featuredUntil > now; }
    }

    static final class Trip {
        final int id, clubId;
        long departAt;
        String mountain, title, stops, bookUrl;
        int price;              // 원(0 = 안 적음)
        Trip(int id, int clubId) { this.id = id; this.clubId = clubId; }
    }

    private final SecureRandom rnd = new SecureRandom();
    private final Map<Integer, Club> clubs = new LinkedHashMap<>();
    private final Map<Integer, Trip> trips = new LinkedHashMap<>();
    /** 로그인 열쇠의 SHA-256 → [산악회 번호, 끝나는 때]. 열쇠 자체는 쿠키에만. */
    private final Map<String, long[]> sessions = new HashMap<>();
    private int nextClub = 1, nextTrip = 1;
    private final Path file;
    private volatile boolean dirty;
    private java.util.concurrent.ScheduledExecutorService saver;
    private final Object fileLock = new Object();

    Clubs(Path file) {
        this.file = file;
        load();
    }

    Clubs() {
        this(null);
    }

    static final Clubs STORE = new Clubs(Party.defaultFile().resolveSibling("clubs.json")).lazySave();

    Clubs lazySave() {
        saver = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "routefly-clubs-save"); t.setDaemon(true); return t; });
        saver.scheduleWithFixedDelay(this::flush, 3, 3, java.util.concurrent.TimeUnit.SECONDS);
        return this;
    }

    void shutdown() {
        if (saver != null) saver.shutdownNow();
        flush();
    }

    // ---------------------------------------------------------------- 순수 함수(검사)

    /** 아이디 - 영문 소문자 · 숫자 · _ 4~20자. */
    static String loginId(String s) {
        String t = s == null ? "" : s.trim().toLowerCase();
        if (!t.matches("[a-z0-9_]{4,20}")) throw new IllegalArgumentException("아이디는 영문 소문자 · 숫자 · _ 4~20자로 적어 주세요.");
        return t;
    }

    static void checkPassword(String pw, String login) {
        if (pw == null || pw.length() < 8 || pw.length() > 64) throw new IllegalArgumentException("비밀번호는 8~64자로 적어 주세요.");
        if (!pw.matches(".*[A-Za-z].*") || !pw.matches(".*[0-9].*")) throw new IllegalArgumentException("비밀번호에 영문과 숫자를 함께 넣어 주세요.");
        if (login != null && pw.toLowerCase().contains(login)) throw new IllegalArgumentException("비밀번호에 아이디를 넣지 마세요.");
    }

    /** 누리집 · 예약 주소 - https 만, 200자까지(없으면 null). javascript: 같은 것은 막음. */
    static String httpsUrl(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim();
        // 이름.도메인 꼴만(2026-10-22 홍TV님 시험: https://routefly/cafe/test 처럼 .com · .kr 없는 주소도 받았음). 한글 도메인은 xn-- 꼴로
        if (t.length() > 200 || !t.matches("https://([A-Za-z0-9-]+\\.)+([A-Za-z]{2,24}|xn--[A-Za-z0-9-]{2,30})(:\\d{2,5})?(/[^\\s<>\"'`]*)?")) throw new IllegalArgumentException("주소는 https:// 로 시작하는 누리집 주소를 넣어 주세요(예: https://cafe.daum.net/산악회).");
        return t;
    }

    static String hash(String pw) {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        return PBKDF2_ITER + ":" + Base64.getEncoder().encodeToString(salt) + ":" + Base64.getEncoder().encodeToString(pbkdf2(pw, salt, PBKDF2_ITER));
    }

    static boolean verify(String pw, String stored) {
        if (pw == null || stored == null) return false;
        String[] p = stored.split(":");
        if (p.length != 3) return false;
        byte[] want = Base64.getDecoder().decode(p[2]);
        return MessageDigest.isEqual(want, pbkdf2(pw, Base64.getDecoder().decode(p[1]), Integer.parseInt(p[0])));
    }

    private static byte[] pbkdf2(String pw, byte[] salt, int iter) {
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(new PBEKeySpec(pw.toCharArray(), salt, iter, 256)).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static String sha(String s) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // ---------------------------------------------------------------- 계정

    /** 가입 - 운영자 확인 전(approved=false). 돌려줌: 로그인 열쇠. */
    synchronized String signup(String login, String pw, String name, String phone, String url, long now) {
        String id = loginId(login);
        checkPassword(pw, id);
        String n = Party.clean(name, 30);
        if (n == null) throw new IllegalArgumentException("산악회 이름을 적어 주세요.");
        String ph = Party.phone(phone);
        if (ph == null) throw new IllegalArgumentException("손님이 연락할 대표 연락처를 적어 주세요.");
        String u = httpsUrl(url);
        if (clubs.size() >= MAX_CLUBS) throw new IllegalStateException("지금은 가입을 받을 수 없습니다. 의견 보내기로 알려 주세요.");
        for (Club c : clubs.values()) if (c.login.equals(id)) throw new IllegalArgumentException("이미 쓰는 아이디입니다.");
        Club c = new Club(nextClub++, id, now);
        c.pw = hash(pw);
        c.name = n; c.phone = ph; c.url = u;
        clubs.put(c.id, c);
        log.info("[CLUB] 가입 club={} (확인 기다림)", c.id);
        dirty = true;
        return newSession(c, now);
    }

    /** 로그인 - 맞으면 열쇠, 틀리면 IllegalArgumentException(아이디 · 비밀번호 어느 쪽이 틀렸는지는 안 알림). */
    String login(String login, String pw, long now) {
        Club c;
        synchronized (this) {
            c = byLogin(login == null ? "" : login.trim().toLowerCase());
        }
        // PBKDF2 는 느리니 자물쇠 밖에서(다른 요청을 막지 않게). 없는 아이디도 같은 시간 들게 가짜로 한 번
        boolean ok = verify(pw, c != null ? c.pw : DUMMY) && c != null;
        if (!ok) throw new IllegalArgumentException("아이디 또는 비밀번호가 맞지 않습니다.");
        synchronized (this) {
            if (!clubs.containsKey(c.id)) throw new IllegalArgumentException("아이디 또는 비밀번호가 맞지 않습니다.");
            return newSession(c, now);
        }
    }

    private static final String DUMMY = hash("dummy-password-0");

    private Club byLogin(String id) {
        for (Club c : clubs.values()) if (c.login.equals(id)) return c;
        return null;
    }

    private String newSession(Club c, long now) {
        byte[] b = new byte[24];
        rnd.nextBytes(b);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        sessions.entrySet().removeIf(e -> e.getValue()[1] < now);
        sessions.put(sha(token), new long[] {c.id, now + SESSION_MS});
        dirty = true;
        return token;
    }

    /** 로그인 열쇠 → 산악회(없거나 지났으면 null). */
    synchronized Club who(String token, long now) {
        if (token == null || token.length() < 20 || token.length() > 64) return null;
        long[] s = sessions.get(sha(token));
        if (s == null || s[1] < now) return null;
        return clubs.get((int) s[0]);
    }

    synchronized void logout(String token) {
        if (token != null && sessions.remove(sha(token)) != null) dirty = true;
    }

    synchronized void edit(Club c, String name, String phone, String url, String intro) {
        String n = Party.clean(name, 30), ph = Party.phone(phone);
        if (n == null) throw new IllegalArgumentException("산악회 이름을 적어 주세요.");
        if (ph == null) throw new IllegalArgumentException("대표 연락처를 적어 주세요.");
        c.name = n; c.phone = ph; c.url = httpsUrl(url); c.intro = Party.clean(intro, 100);
        dirty = true;
    }

    void password(Club c, String old, String pw) {
        if (!verify(old, c.pw)) throw new IllegalArgumentException("지금 비밀번호가 맞지 않습니다.");
        checkPassword(pw, c.login);
        String h = hash(pw);
        synchronized (this) {
            c.pw = h;
            sessions.entrySet().removeIf(e -> e.getValue()[0] == c.id);   // 다른 기기의 로그인은 끊음
            dirty = true;
        }
    }

    /** 탈퇴 - 산악회 · 일정 · 로그인 모두 지움. */
    synchronized void delete(Club c) {
        clubs.remove(c.id);
        trips.values().removeIf(t -> t.clubId == c.id);
        sessions.entrySet().removeIf(e -> e.getValue()[0] == c.id);
        log.info("[CLUB] 탈퇴 club={}", c.id);
        dirty = true;
    }

    // ---------------------------------------------------------------- 일정

    /** 일정 넣기 · 고치기(id 가 있으면 자기 것만). 지난 일정은 못 넣음. */
    synchronized Trip saveTrip(Club c, Integer id, long departAt, String mountain, String title, String stops, int price, String bookUrl, long now) {
        if (departAt < now - 3600_000L || departAt > now + 120 * DAY) throw new IllegalArgumentException("출발은 지금부터 120일 안으로 적어 주세요.");
        String m = Party.clean(mountain, 20), t = Party.clean(title, 40);
        if (m == null) throw new IllegalArgumentException("산을 골라 주세요.");
        if (t == null) throw new IllegalArgumentException("산행 제목을 적어 주세요(예: 가야산 만물상 당일).");
        if (price < 0 || price > 5_000_000) throw new IllegalArgumentException("회비가 올바르지 않습니다.");
        Trip tr;
        if (id != null) {
            tr = trips.get(id);
            if (tr == null || tr.clubId != c.id) throw new IllegalArgumentException("그 일정을 찾지 못했습니다.");
        } else {
            long mine = trips.values().stream().filter(x -> x.clubId == c.id).count();
            if (mine >= MAX_TRIPS_PER_CLUB) throw new IllegalStateException("일정은 " + MAX_TRIPS_PER_CLUB + "개까지 올릴 수 있습니다. 지난 일정은 저절로 지워집니다.");
            if (trips.size() >= MAX_TRIPS) throw new IllegalStateException("지금은 일정을 더 받을 수 없습니다.");
            tr = new Trip(nextTrip++, c.id);
            trips.put(tr.id, tr);
        }
        tr.departAt = departAt; tr.mountain = m; tr.title = t; tr.stops = Party.clean(stops, 60); tr.price = price;
        tr.bookUrl = httpsUrl(bookUrl);
        dirty = true;
        return tr;
    }

    synchronized void deleteTrip(Club c, int id) {
        Trip t = trips.get(id);
        if (t == null || t.clubId != c.id) throw new IllegalArgumentException("그 일정을 찾지 못했습니다.");
        trips.remove(id);
        dirty = true;
    }

    /** 지난 일정(출발 하루 뒤) 지우기. */
    private void sweep(long now) {
        if (trips.values().removeIf(t -> t.departAt < now - DAY)) dirty = true;
    }

    /**
     * 공개 목록 - 확인된 산악회의 다가오는 일정. mountain 이 있으면 그 산만. 추천(돈 낸 곳)이 먼저, 그다음 날짜순. limit 개까지.
     * 출발 2시간 뒤까지는 보임(당일 늦게 보는 손님).
     */
    synchronized List<Object[]> upcoming(String mountain, long now, int limit) {
        sweep(now);
        List<Object[]> out = new ArrayList<>();
        for (Trip t : trips.values()) {
            Club c = clubs.get(t.clubId);
            if (c == null || !c.approved || t.departAt < now - 2 * 3600_000L) continue;
            if (mountain != null && !mountain.equals(t.mountain)) continue;
            out.add(new Object[] {t, c});
        }
        out.sort((a, b) -> {
            boolean fa = ((Club) a[1]).featured(now), fb = ((Club) b[1]).featured(now);
            if (fa != fb) return fa ? -1 : 1;
            return Long.compare(((Trip) a[0]).departAt, ((Trip) b[0]).departAt);
        });
        return out.size() > limit ? new ArrayList<>(out.subList(0, limit)) : out;
    }

    synchronized List<Trip> tripsOf(Club c, long now) {
        sweep(now);
        List<Trip> out = new ArrayList<>();
        for (Trip t : trips.values()) if (t.clubId == c.id) out.add(t);
        out.sort((a, b) -> Long.compare(a.departAt, b.departAt));
        return out;
    }

    synchronized Trip trip(Club c, int id) {
        Trip t = trips.get(id);
        if (t == null || t.clubId != c.id) throw new IllegalArgumentException("그 일정을 찾지 못했습니다.");
        return t;
    }

    // ---------------------------------------------------------------- 운영자

    synchronized List<Club> all() {
        return new ArrayList<>(clubs.values());
    }

    synchronized int tripCount(int clubId) {
        int n = 0;
        for (Trip t : trips.values()) if (t.clubId == clubId) n++;
        return n;
    }

    synchronized void approve(int id, boolean on) {
        Club c = clubs.get(id);
        if (c == null) throw new IllegalArgumentException("그 산악회를 찾지 못했습니다.");
        c.approved = on;
        log.info("[CLUB] {} club={}", on ? "확인" : "확인 풂", id);
        dirty = true;
    }

    /** 추천 - 오늘부터 days 일(0 이면 끔). */
    synchronized void feature(int id, int days, long now) {
        Club c = clubs.get(id);
        if (c == null) throw new IllegalArgumentException("그 산악회를 찾지 못했습니다.");
        if (days < 0 || days > 400) throw new IllegalArgumentException("추천 기간은 0 ~ 400일입니다.");
        c.featuredUntil = days == 0 ? 0 : now + days * DAY;
        log.info("[CLUB] 추천 club={} days={}", id, days);
        dirty = true;
    }

    /** 비밀번호를 잊은 산악회 - 운영자가 임시 비밀번호를 만들어 전화로 알려 줌(메일을 받지 않아서). */
    String resetPassword(int id) {
        String tmp = "rf" + Integer.toString(100000 + rnd.nextInt(900000)) + "a" + Integer.toString(rnd.nextInt(10));
        String h = hash(tmp);
        synchronized (this) {
            Club c = clubs.get(id);
            if (c == null) throw new IllegalArgumentException("그 산악회를 찾지 못했습니다.");
            c.pw = h;
            sessions.entrySet().removeIf(e -> e.getValue()[0] == id);
            log.info("[CLUB] 임시 비밀번호 club={}", id);
            dirty = true;
        }
        return tmp;
    }

    // ---------------------------------------------------------------- 산 페이지 칸

    /** 산 페이지(/m/산) 아래 "이 산에 가는 안내산악회" - 일정이 없으면 빈 글. 누르면 그 산악회 예약 화면(없으면 누리집). */
    static String section(String mountain, long now) {
        List<Object[]> list;
        try {
            list = STORE.upcoming(mountain, now, 8);
        } catch (RuntimeException e) {
            return "";
        }
        if (list.isEmpty()) return "";
        StringBuilder b = new StringBuilder("<section class=\"clubs\"><h2>🚌 ").append(ShareServlet.esc(mountain)).append(" 가는 안내산악회</h2><ul class=\"cl\">");
        for (Object[] x : list) b.append(item((Trip) x[0], (Club) x[1], now, false));
        b.append("</ul><p class=\"dim\">예약 · 회비 · 취소는 각 산악회에 직접 문의하세요. routefly 는 일정을 이어 줄 뿐 예약을 받지 않습니다. "
                + "<b>추천</b> 표시는 산악회가 광고비를 낸 일정입니다. <a href=\"" + MountainServlet.REL + "/clubs.html\">모든 산악회 일정 ›</a></p></section>");
        return b.toString();
    }

    /** 목록 한 줄(산 페이지 · 일정 모음이 같이 씀 - 일정 모음은 js 가 같은 꼴로 그림). */
    static String item(Trip t, Club c, long now, boolean showMountain) {
        String go = t.bookUrl != null ? t.bookUrl : c.url;
        StringBuilder b = new StringBuilder("<li>");
        if (c.featured(now)) b.append("<span class=\"ad\">추천 · 광고</span> ");
        b.append("<b>").append(when(t.departAt)).append("</b> ");
        if (showMountain) b.append("[").append(ShareServlet.esc(t.mountain)).append("] ");
        b.append(ShareServlet.esc(t.title)).append("<br><span class=\"dim\">").append(ShareServlet.esc(c.name));
        if (t.stops != null) b.append(" · ").append(ShareServlet.esc(t.stops));
        if (t.price > 0) b.append(" · ").append(String.format(java.util.Locale.KOREA, "%,d원", t.price));
        b.append(" · <a href=\"tel:").append(c.phone.replaceAll("[^0-9+]", "")).append("\">☎ ").append(ShareServlet.esc(c.phone)).append("</a></span>");
        if (go != null) b.append(" <a class=\"bk\" href=\"").append(ShareServlet.esc(go)).append("\" target=\"_blank\" rel=\"noopener nofollow\">예약 ›</a>");
        return b.append("</li>").toString();
    }

    private static final String[] DOW = {"월", "화", "수", "목", "금", "토", "일"};

    /** "10/25(토) 07:00" (한국 시각). */
    static String when(long ms) {
        java.time.ZonedDateTime z = Instant.ofEpochMilli(ms).atZone(WeatherServlet.KST);
        return String.format("%d/%d(%s) %02d:%02d", z.getMonthValue(), z.getDayOfMonth(), DOW[z.getDayOfWeek().getValue() - 1], z.getHour(), z.getMinute());
    }

    static JsonObject tripJson(Trip t, Club c, long now) {
        JsonObject o = new JsonObject();
        o.addProperty("id", t.id);
        o.addProperty("departAt", t.departAt);
        o.addProperty("mountain", t.mountain);
        o.addProperty("title", t.title);
        if (t.stops != null) o.addProperty("stops", t.stops);
        if (t.price > 0) o.addProperty("price", t.price);
        if (t.bookUrl != null) o.addProperty("bookUrl", t.bookUrl);
        if (c != null) {
            o.addProperty("club", c.name);
            o.addProperty("phone", c.phone);
            if (c.url != null) o.addProperty("url", c.url);
            if (c.featured(now)) o.addProperty("featured", true);
        }
        return o;
    }

    static JsonObject clubJson(Club c, long now) {
        JsonObject o = new JsonObject();
        o.addProperty("id", c.id);
        o.addProperty("login", c.login);
        o.addProperty("name", c.name);
        o.addProperty("phone", c.phone);
        if (c.url != null) o.addProperty("url", c.url);
        if (c.intro != null) o.addProperty("intro", c.intro);
        o.addProperty("approved", c.approved);
        if (c.featured(now)) o.addProperty("featuredUntil", c.featuredUntil);
        o.addProperty("created", LocalDate.ofInstant(Instant.ofEpochMilli(c.created), WeatherServlet.KST).toString());
        return o;
    }

    // ---------------------------------------------------------------- 파일

    void flush() {
        String text;
        synchronized (this) {
            if (!dirty || file == null) return;
            dirty = false;
            text = snapshot();
        }
        synchronized (fileLock) {
            try {
                Files.createDirectories(file.getParent());
                Path tmp = file.resolveSibling("clubs.json.tmp");
                Files.deleteIfExists(tmp);
                try { Files.createFile(tmp, java.nio.file.attribute.PosixFilePermissions.asFileAttribute(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"))); }
                catch (UnsupportedOperationException e) { /* 윈도 */ }
                Files.writeString(tmp, text, StandardCharsets.UTF_8);
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            } catch (Exception e) {
                log.warn("[CLUB] 파일을 쓰지 못함 - {}", e.toString());
            }
        }
    }

    private String snapshot() {
        JsonObject o = new JsonObject();
        o.addProperty("nextClub", nextClub);
        o.addProperty("nextTrip", nextTrip);
        JsonArray cs = new JsonArray();
        for (Club c : clubs.values()) {
            JsonObject x = new JsonObject();
            x.addProperty("id", c.id); x.addProperty("login", c.login); x.addProperty("pw", c.pw); x.addProperty("name", c.name); x.addProperty("phone", c.phone);
            x.addProperty("url", c.url); x.addProperty("intro", c.intro); x.addProperty("approved", c.approved); x.addProperty("featuredUntil", c.featuredUntil); x.addProperty("created", c.created);
            cs.add(x);
        }
        o.add("clubs", cs);
        JsonArray ts = new JsonArray();
        for (Trip t : trips.values()) {
            JsonObject x = new JsonObject();
            x.addProperty("id", t.id); x.addProperty("clubId", t.clubId); x.addProperty("departAt", t.departAt); x.addProperty("mountain", t.mountain); x.addProperty("title", t.title);
            x.addProperty("stops", t.stops); x.addProperty("price", t.price); x.addProperty("bookUrl", t.bookUrl);
            ts.add(x);
        }
        o.add("trips", ts);
        JsonObject ss = new JsonObject();
        sessions.forEach((k, v) -> { JsonArray a = new JsonArray(); a.add(v[0]); a.add(v[1]); ss.add(k, a); });
        o.add("sessions", ss);
        return o.toString();
    }

    private void load() {
        if (file == null || !Files.isRegularFile(file)) return;
        try {
            JsonObject o = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
            for (JsonElement e : o.getAsJsonArray("clubs")) {
                JsonObject x = e.getAsJsonObject();
                Club c = new Club(x.get("id").getAsInt(), x.get("login").getAsString(), x.get("created").getAsLong());
                c.pw = x.get("pw").getAsString(); c.name = x.get("name").getAsString(); c.phone = x.get("phone").getAsString();
                c.url = str(x, "url"); c.intro = str(x, "intro"); c.approved = x.get("approved").getAsBoolean(); c.featuredUntil = x.get("featuredUntil").getAsLong();
                clubs.put(c.id, c);
                nextClub = Math.max(nextClub, c.id + 1);
            }
            for (JsonElement e : o.getAsJsonArray("trips")) {
                JsonObject x = e.getAsJsonObject();
                Trip t = new Trip(x.get("id").getAsInt(), x.get("clubId").getAsInt());
                t.departAt = x.get("departAt").getAsLong(); t.mountain = x.get("mountain").getAsString(); t.title = x.get("title").getAsString();
                t.stops = str(x, "stops"); t.price = x.get("price").getAsInt(); t.bookUrl = str(x, "bookUrl");
                trips.put(t.id, t);
                nextTrip = Math.max(nextTrip, t.id + 1);
            }
            for (var e : o.getAsJsonObject("sessions").entrySet()) {
                JsonArray a = e.getValue().getAsJsonArray();
                sessions.put(e.getKey(), new long[] {a.get(0).getAsLong(), a.get(1).getAsLong()});
            }
            nextClub = Math.max(nextClub, o.get("nextClub").getAsInt());
            nextTrip = Math.max(nextTrip, o.get("nextTrip").getAsInt());
            log.info("[CLUB] 산악회 {}곳 · 일정 {}개 읽음", clubs.size(), trips.size());
        } catch (Exception e) {
            log.warn("[CLUB] 파일을 읽지 못함 - {}", e.toString());
            try { Files.copy(file, file.resolveSibling("clubs.json.bad-" + System.currentTimeMillis())); } catch (Exception ex) { /* 그대로 */ }
        }
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }
}
