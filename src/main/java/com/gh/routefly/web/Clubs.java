package com.gh.routefly.web;

import java.net.IDN;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 안내산악회 일정(2026-10-22 홍TV님). 모집 · 예약은 산악회 누리집 · 카페가 하고, routefly 는 산 페이지 · 일정 모음에서 그 예약 화면으로 이어 주고
 * 산행 날 도구(산악회 방)를 줌. 손님은 가입하지 않음.
 *
 * <ul>
 *   <li>로그인은 "관리 링크"(2026-10-22 홍TV님 결정 - 아이디 · 비밀번호는 부담): 산악회가 이름 · 연락처로 신청 → 운영자가 전화로 확인하고 승인 →
 *       운영자가 관리 링크를 문자 · 카톡으로 보냄. 링크를 열면 그 기기에 30일 로그인 쿠키. 링크를 다시 만들면 옛 링크 · 그 로그인은 모두 끊김.</li>
 *   <li>확인 전에는 아무것도 공개되지 않고, 확인 안 된 신청은 14일 뒤 지움. 확인된 곳도 1년 동안 안 쓰면 지움.</li>
 *   <li>광고(featuredUntil) - 운영자가 정한 날까지 "광고" 표시로 위에, 한 화면에 MAX_ADS 개까지만(일반 일정을 밀어내지 않게).</li>
 *   <li>예약 주소는 산악회 누리집과 같은 곳(호스트)만 - 확인 뒤 낚시 주소로 바꾸지 못하게. 누리집 주소를 바꾸면 다시 확인 받음.</li>
 *   <li>파일: party.dir(없으면 stats.dir · 톰캣 폴더/routefly-party)/clubs.json (600), 3초마다 모아 씀. 읽다 실패하면 쓰지 않음(덮어쓰기 막기).</li>
 * </ul>
 */
final class Clubs {

    private static final Logger log = LogManager.getLogger(Clubs.class);
    static final int MAX_CLUBS = 500, MAX_PENDING = 100, MAX_TRIPS_PER_CLUB = 300, MAX_TRIPS = 20000, MAX_SESSIONS = 10, MAX_ADS = 2, MAX_REPEAT = 12;
    static final long DAY = 24 * 3600_000L, SESSION_MS = 30 * DAY, PENDING_KEEP_MS = 14 * DAY, IDLE_KEEP_MS = 365 * DAY;

    static final class Club {
        final int id;
        final long created;
        String name, phone, publicPhone, url, defStops;
        int defBuses = 1, defSeats = 28;
        boolean approved;
        long featuredUntil;     // 0 = 광고 아님
        String linkHash;        // 관리 링크 열쇠의 SHA-256(null = 아직 안 만듦)
        long lastSeen;

        Club(int id, long created) { this.id = id; this.created = created; }

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
    /** 로그인 쿠키 열쇠의 SHA-256 → [산악회 번호, 끝나는 때]. */
    private final Map<String, long[]> sessions = new HashMap<>();
    private int nextClub = 1, nextTrip = 1;
    private final Path file;
    private volatile boolean dirty, broken;
    private java.util.concurrent.ScheduledExecutorService saver;
    private final Object fileLock = new Object();
    /** 100대 명산 이름(data/mountains100.json 의 id) - ClubServlet 이 처음 뜰 때 넣음. 비어 있으면 산 이름을 따지지 않음(시험). */
    private static volatile Set<String> mountains = Set.of();

    Clubs(Path file) {
        this.file = file;
        load();
    }

    Clubs() {
        this(null);
    }

    static final Clubs STORE = new Clubs(Party.defaultFile().resolveSibling("clubs.json")).lazySave();

    static void mountains(Set<String> ids) {
        mountains = Set.copyOf(ids);
    }

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

    /** 누리집 · 예약 주소 - https 이름.도메인 꼴만, 200자까지(없으면 null). */
    static String httpsUrl(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim();
        // 이름.도메인 꼴만(2026-10-22 홍TV님 시험: https://routefly/cafe/test 처럼 .com · .kr 없는 주소도 받았음). 한글 도메인은 xn-- 꼴로
        if (t.length() > 200 || !t.matches("https://([A-Za-z0-9-]+\\.)+([A-Za-z]{2,24}|xn--[A-Za-z0-9-]{2,30})(:\\d{2,5})?(/[^\\s<>\"'`]*)?"))
            throw new IllegalArgumentException("주소는 https:// 로 시작하는 누리집 주소를 넣어 주세요(예: https://cafe.daum.net/산악회).");
        return t;
    }

    /** 주소의 호스트(소문자, 한글 도메인은 한글로) - 화면 "예약 › 반더룽.com" 과 같은 곳 견주기. */
    static String host(String url) {
        if (url == null) return null;
        try {
            String h = URI.create(url).getHost();
            return h == null ? null : IDN.toUnicode(h.toLowerCase());
        } catch (Exception e) {
            return null;
        }
    }

    static String sha(String s) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String randomKey() {
        byte[] b = new byte[24];
        rnd.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    // ---------------------------------------------------------------- 신청 · 확인 · 관리 링크

    /** 산악회 신청(운영자 확인 전) - 아이디 · 비밀번호 없음. publicPhone - 일정 옆에 보일 번호(없으면 안 보임, 사무실 번호 권장). */
    synchronized Club apply(String name, String phone, String publicPhone, String url, long now) {
        purge(now);
        String n = Party.clean(name, 30), ph = Party.phone(phone);
        if (n == null) throw new IllegalArgumentException("산악회 이름을 적어 주세요.");
        if (ph == null) throw new IllegalArgumentException("운영자가 확인 전화를 드릴 연락처를 적어 주세요.");
        String u = httpsUrl(url);
        long pending = clubs.values().stream().filter(c -> !c.approved).count();
        if (pending >= MAX_PENDING || clubs.size() >= MAX_CLUBS) throw new IllegalStateException("지금은 신청을 받을 수 없습니다. 의견 보내기로 알려 주세요.");
        Club c = new Club(nextClub++, now);
        c.name = n; c.phone = ph; c.publicPhone = Party.phone(publicPhone); c.url = u;
        clubs.put(c.id, c);
        log.info("[CLUB] 신청 club={}", c.id);
        dirty = true;
        return c;
    }

    synchronized void approve(int id, boolean on) {
        Club c = need(id);
        c.approved = on;
        log.info("[CLUB] {} club={}", on ? "확인" : "확인 풂", id);
        dirty = true;
    }

    /** 관리 링크 열쇠를 새로 만듦(확인된 곳만) - 옛 링크 · 그 링크로 한 로그인은 모두 끊김. 돌려준 열쇠는 운영자 화면에만 한 번 보임. */
    synchronized String newLink(int id) {
        Club c = need(id);
        if (!c.approved) throw new IllegalStateException("먼저 확인(전화)한 뒤 관리 링크를 만드세요.");
        String key = randomKey();
        c.linkHash = sha(key);
        sessions.entrySet().removeIf(e -> e.getValue()[0] == id);
        log.info("[CLUB] 관리 링크 새로 club={}", id);
        dirty = true;
        return key;
    }

    /** 관리 링크로 들어옴 → 로그인 열쇠(쿠키용). 틀리면 null. */
    synchronized String enter(String key, long now) {
        if (key == null || key.length() < 20 || key.length() > 64) return null;
        String h = sha(key);
        for (Club c : clubs.values()) {
            if (c.approved && h.equals(c.linkHash)) {
                c.lastSeen = now;
                return newSession(c, now);
            }
        }
        return null;
    }

    private String newSession(Club c, long now) {
        String token = randomKey();
        sessions.entrySet().removeIf(e -> e.getValue()[1] < now);
        List<Map.Entry<String, long[]>> mine = new ArrayList<>();
        for (var e : sessions.entrySet()) if (e.getValue()[0] == c.id) mine.add(e);
        mine.sort((a, b) -> Long.compare(a.getValue()[1], b.getValue()[1]));   // 산악회마다 MAX_SESSIONS 개 - 오래된 것부터 버림
        for (int i = 0; i <= mine.size() - MAX_SESSIONS; i++) sessions.remove(mine.get(i).getKey());
        sessions.put(sha(token), new long[] {c.id, now + SESSION_MS});
        dirty = true;
        return token;
    }

    /** 로그인 열쇠 → 산악회(없거나 지났거나 확인이 풀렸으면 null). */
    synchronized Club who(String token, long now) {
        if (token == null || token.length() < 20 || token.length() > 64) return null;
        long[] s = sessions.get(sha(token));
        if (s == null || s[1] < now) return null;
        Club c = clubs.get((int) s[0]);
        if (c == null || !c.approved) return null;
        if (now - c.lastSeen > DAY) { c.lastSeen = now; dirty = true; }
        return c;
    }

    synchronized void logout(String token) {
        if (token != null && sessions.remove(sha(token)) != null) dirty = true;
    }

    /** 정보 · 기본값 고치기. 누리집 주소를 바꾸면 다시 확인 받음(확인 뒤 낚시 주소로 바꾸기 막기). 돌려줌: 다시 확인이 필요해졌으면 true. */
    synchronized boolean edit(Club c, String name, String phone, String publicPhone, String url, String defStops, int defBuses, int defSeats) {
        String n = Party.clean(name, 30), ph = Party.phone(phone), u = httpsUrl(url);
        if (n == null) throw new IllegalArgumentException("산악회 이름을 적어 주세요.");
        if (ph == null) throw new IllegalArgumentException("운영자 연락처를 적어 주세요.");
        if (defBuses < 1 || defBuses > Party.MAX_BUSES) throw new IllegalArgumentException("차량은 1 ~ " + Party.MAX_BUSES + "대입니다.");
        if (defSeats < 0 || defSeats > Party.MAX_SEATS) throw new IllegalArgumentException("좌석 수는 0 ~ " + Party.MAX_SEATS + " 입니다.");
        boolean recheck = c.approved && !java.util.Objects.equals(host(u), host(c.url));
        c.name = n; c.phone = ph; c.publicPhone = Party.phone(publicPhone); c.url = u; c.defStops = Party.clean(defStops, 60);
        c.defBuses = defBuses; c.defSeats = defSeats;
        if (recheck) {
            c.approved = false;   // 운영자가 다시 확인(전화)할 때까지 일정이 안 보임
            sessions.entrySet().removeIf(e -> e.getValue()[0] == c.id);
            log.info("[CLUB] 누리집 바뀜 - 다시 확인 기다림 club={}", c.id);
        }
        dirty = true;
        return recheck;
    }

    /** 그만두기 - 산악회 · 일정 · 로그인 모두 지움(산악회가 직접 · 운영자). */
    synchronized void delete(int id) {
        clubs.remove(id);
        trips.values().removeIf(t -> t.clubId == id);
        sessions.entrySet().removeIf(e -> e.getValue()[0] == id);
        log.info("[CLUB] 지움 club={}", id);
        dirty = true;
    }

    /** 확인 안 된 신청 14일 · 1년 동안 안 쓴 산악회 · 지난 일정(출발 하루 뒤) · 끝난 로그인 지우기. */
    private void purge(long now) {
        List<Integer> gone = new ArrayList<>();
        for (Club c : clubs.values())
            if ((!c.approved && now - c.created > PENDING_KEEP_MS) || (c.approved && now - Math.max(c.created, c.lastSeen) > IDLE_KEEP_MS)) gone.add(c.id);
        for (int id : gone) { clubs.remove(id); trips.values().removeIf(t -> t.clubId == id); sessions.entrySet().removeIf(e -> e.getValue()[0] == id); dirty = true; }
        if (trips.values().removeIf(t -> t.departAt < now - DAY)) dirty = true;
        if (sessions.entrySet().removeIf(e -> e.getValue()[1] < now)) dirty = true;
    }

    private Club need(int id) {
        Club c = clubs.get(id);
        if (c == null) throw new IllegalArgumentException("그 산악회를 찾지 못했습니다.");
        return c;
    }

    // ---------------------------------------------------------------- 일정

    /** 산 이름 - 100대 명산(id) 이면 그대로, 아니면 "기타"(산 페이지에는 안 나오고 일정 모음에만). */
    static String mountain(String s) {
        String m = Party.clean(s, 20);
        if (m == null) throw new IllegalArgumentException("산을 골라 주세요.");
        if (m.equals("기타") || mountains.isEmpty() || mountains.contains(m)) return m;
        throw new IllegalArgumentException("\"" + m + "\" 은(는) 100대 명산 목록에 없습니다. 목록에서 고르거나 \"기타\" 를 고르고 산 이름은 제목에 적어 주세요.");
    }

    /** 일정 넣기 · 고치기(id 가 있으면 자기 것만). repeat - 같은 요일로 몇 주 더(0 ~ 12). 돌려줌: 넣은 일정들. */
    synchronized List<Trip> saveTrip(Club c, Integer id, long departAt, String mountain, String title, String stops, int price, String bookUrl, int repeat, long now) {
        purge(now);
        if (departAt < now - 3600_000L || departAt > now + 180 * DAY) throw new IllegalArgumentException("출발은 지금부터 180일 안으로 적어 주세요.");
        String m = mountain(mountain), t = Party.clean(title, 40);
        if (t == null) t = m.equals("기타") ? null : m + " 산행";
        if (t == null) throw new IllegalArgumentException("산행 제목을 적어 주세요(예: 가야산 만물상 당일).");
        if (price < 0 || price > 5_000_000) throw new IllegalArgumentException("회비가 올바르지 않습니다.");
        if (repeat < 0 || repeat > MAX_REPEAT) throw new IllegalArgumentException("반복은 0 ~ " + MAX_REPEAT + "주입니다.");
        String bu = httpsUrl(bookUrl);
        // 예약 주소는 산악회 누리집과 같은 곳만(확인 받은 곳 - 낚시 주소 막기, 2026-10-22 점검)
        if (bu != null && (c.url == null || !java.util.Objects.equals(host(bu), host(c.url))))
            throw new IllegalArgumentException("예약 주소는 산악회 누리집(" + (c.url == null ? "먼저 정보에 누리집 주소를 넣으세요" : host(c.url)) + ")의 주소만 넣을 수 있습니다.");
        String st = Party.clean(stops != null ? stops : c.defStops, 60);
        List<Trip> out = new ArrayList<>();
        if (id != null) {
            Trip tr = trips.get(id);
            if (tr == null || tr.clubId != c.id) throw new IllegalArgumentException("그 일정을 찾지 못했습니다.");
            fill(tr, departAt, m, t, st, price, bu);
            out.add(tr);
            repeat = 0;
        }
        long mine = trips.values().stream().filter(x -> x.clubId == c.id).count();
        int adds = id == null ? 1 + repeat : repeat;
        if (mine + adds > MAX_TRIPS_PER_CLUB) throw new IllegalStateException("일정은 " + MAX_TRIPS_PER_CLUB + "개까지 올릴 수 있습니다. 지난 일정은 저절로 지워집니다.");
        if (trips.size() + adds > MAX_TRIPS) throw new IllegalStateException("지금은 일정을 더 받을 수 없습니다.");
        for (int w = id == null ? 0 : 1; w <= repeat; w++) {
            Trip tr = new Trip(nextTrip++, c.id);
            fill(tr, departAt + w * 7 * DAY, m, t, st, price, bu);
            trips.put(tr.id, tr);
            out.add(tr);
        }
        dirty = true;
        return out;
    }

    private static void fill(Trip tr, long departAt, String m, String t, String st, int price, String bu) {
        tr.departAt = departAt; tr.mountain = m; tr.title = t; tr.stops = st; tr.price = price; tr.bookUrl = bu;
    }

    synchronized void deleteTrip(Club c, int id) {
        Trip t = trips.get(id);
        if (t == null || t.clubId != c.id) throw new IllegalArgumentException("그 일정을 찾지 못했습니다.");
        trips.remove(id);
        dirty = true;
    }

    private static final Pattern P_DATE = Pattern.compile("(?:(\\d{4})[-./])?(\\d{1,2})[-./](\\d{1,2})(?:\\([^)]*\\))?|(\\d{2})(\\d{2})");
    private static final Pattern P_TIME = Pattern.compile("(\\d{1,2})[:시](\\d{2})?분?|(\\d{2})(\\d{2})");
    private static final Pattern P_PRICE = Pattern.compile("([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})원?|([0-9]{1,3})만원");

    /**
     * 여러 일정 한꺼번에(2026-10-22 점검 - 주말마다 15~20개를 하나씩 넣을 수 없음). 한 줄에 하나: "10/25 07:00 가야산 만물상 당일 39000 https://…".
     * 날짜(10/25 · 1025 · 2026-10-25) 다음 시각(07:00 · 0700, 없으면 07:00), 그다음 100대 명산 이름(없으면 기타), 나머지는 제목. 회비 · 주소는 어디에 있어도.
     * 순수 함수에 가까움(산 목록만 씀) - 돌려줌: [넣을 일정 JSON 들, 못 읽은 줄 까닭 들].
     */
    static JsonObject parseTrips(String text, long now) {
        JsonArray ok = new JsonArray(), bad = new JsonArray();
        if (text == null) text = "";
        String[] lines = norm(text).split("\\r?\\n|\\r");
        if (lines.length > 200) throw new IllegalArgumentException("한 번에 200줄까지 넣을 수 있습니다.");
        ZonedDateTime today = Instant.ofEpochMilli(now).atZone(WeatherServlet.KST);
        for (String raw : lines) {
            String line = raw.replaceAll("[\\t|]|(?<!\\d),|,(?!\\d)", " ").replaceAll(" +", " ").trim();   // 39,000 의 쉼표는 남김
            if (line.isEmpty()) continue;
            List<String> tk = new ArrayList<>(List.of(line.split(" ")));
            String why = null;
            LocalDate d = null;
            Matcher md = P_DATE.matcher(tk.get(0));
            if (md.matches()) {
                int y = md.group(1) != null ? Integer.parseInt(md.group(1)) : today.getYear();
                int mo = Integer.parseInt(md.group(2) != null ? md.group(2) : md.group(4)), da = Integer.parseInt(md.group(3) != null ? md.group(3) : md.group(5));
                try {
                    d = LocalDate.of(y, mo, da);
                    if (md.group(1) == null && d.isBefore(today.toLocalDate().minusDays(1))) d = d.plusYears(1);   // 1/5 를 12월에 적으면 내년
                } catch (Exception e) { d = null; }
                tk.remove(0);
            }
            int hh = 7, mm = 0;
            if (!tk.isEmpty()) {
                Matcher mt = P_TIME.matcher(tk.get(0));
                if (mt.matches()) {
                    hh = Integer.parseInt(mt.group(1) != null ? mt.group(1) : mt.group(3));
                    mm = mt.group(1) != null ? (mt.group(2) == null ? 0 : Integer.parseInt(mt.group(2))) : Integer.parseInt(mt.group(4));
                    tk.remove(0);
                }
            }
            String url = null;
            int price = 0;
            for (int i = tk.size() - 1; i >= 0; i--) {
                if (url == null && tk.get(i).startsWith("https://")) { url = tk.remove(i); continue; }
                Matcher mp = P_PRICE.matcher(tk.get(i));
                if (price == 0 && mp.matches()) { price = mp.group(1) != null ? Integer.parseInt(mp.group(1).replace(",", "")) : Integer.parseInt(mp.group(2)) * 10000; tk.remove(i); }
            }
            String m = "기타";
            for (int i = 0; i < tk.size(); i++) if (mountains.contains(tk.get(i))) { m = tk.get(i); break; }
            String title = Party.clean(String.join(" ", tk), 40);
            if (d == null) why = "날짜가 없음(예: 10/25)";
            else if (hh > 23 || mm > 59) why = "시각이 이상함";
            else if (title == null) why = "제목이 없음";
            if (why != null) { if (bad.size() < 30) bad.add(Party.clean(raw, 40) + " - " + why); continue; }
            JsonObject o = new JsonObject();
            o.addProperty("departAt", d.atTime(hh, mm).atZone(WeatherServlet.KST).toInstant().toEpochMilli());
            o.addProperty("mountain", m);
            o.addProperty("title", title);
            if (price > 0) o.addProperty("price", price);
            if (url != null) o.addProperty("bookUrl", url);
            ok.add(o);
        }
        JsonObject out = new JsonObject();
        out.add("trips", ok);
        out.add("bad", bad);
        return out;
    }

    /** 붙여넣은 글 다듬기 - 전각 숫자 · 빈칸(NBSP · U+3000)을 보통 것으로. */
    static String norm(String s) {
        return Normalizer.normalize(s, Normalizer.Form.NFKC).replace(' ', ' ').replace('　', ' ');
    }

    /** 여러 일정 넣기 - 못 넣은 줄은 까닭과 함께(하나라도 넣을 수 있으면 넣음). */
    JsonObject saveBulk(Club c, String text, boolean save, long now) {
        JsonObject p = parseTrips(text, now);
        JsonArray bad = p.getAsJsonArray("bad"), done = new JsonArray();
        if (save) for (JsonElement e : p.getAsJsonArray("trips")) {
            JsonObject o = e.getAsJsonObject();
            try {
                Trip t = saveTrip(c, null, o.get("departAt").getAsLong(), o.get("mountain").getAsString(), o.get("title").getAsString(), null,
                        o.has("price") ? o.get("price").getAsInt() : 0, o.has("bookUrl") ? o.get("bookUrl").getAsString() : null, 0, now).get(0);
                done.add(t.id);
            } catch (IllegalArgumentException | IllegalStateException ex) {
                if (bad.size() < 30) bad.add(o.get("title").getAsString() + " - " + ex.getMessage());
            }
        }
        p.add("saved", done);
        return p;
    }

    /**
     * 공개 목록 - 확인된 산악회의 다가오는 일정, mountain 이 있으면 그 산만. 날짜순, 광고는 maxAds 개까지(가장 가까운 것)만 맨 위로.
     * 출발 2시간 뒤까지는 보임(당일 늦게 보는 손님 - "출발함" 표시). 돌려줌: [Trip, Club, 광고면 Boolean.TRUE].
     */
    synchronized List<Object[]> upcoming(String mountain, long now, int limit, int maxAds) {
        purge(now);
        List<Object[]> all = new ArrayList<>();
        for (Trip t : trips.values()) {
            Club c = clubs.get(t.clubId);
            if (c == null || !c.approved || t.departAt < now - 2 * 3600_000L) continue;
            if (mountain != null && !mountain.equals(t.mountain)) continue;
            all.add(new Object[] {t, c, Boolean.FALSE});
        }
        all.sort((a, b) -> Long.compare(((Trip) a[0]).departAt, ((Trip) b[0]).departAt));
        List<Object[]> ads = new ArrayList<>(), out = new ArrayList<>();
        for (Object[] x : all) {
            if (ads.size() < maxAds && ((Club) x[1]).featured(now) && ((Trip) x[0]).departAt > now) { x[2] = Boolean.TRUE; ads.add(x); }
            else out.add(x);
        }
        ads.addAll(out);
        return ads.size() > limit ? new ArrayList<>(ads.subList(0, limit)) : ads;
    }

    synchronized List<Trip> tripsOf(Club c, long now) {
        purge(now);
        List<Trip> out = new ArrayList<>();
        for (Trip t : trips.values()) if (t.clubId == c.id) out.add(t);
        out.sort((a, b) -> Long.compare(a.departAt, b.departAt));
        return out;
    }

    // ---------------------------------------------------------------- 운영자

    synchronized List<Club> all(long now) {
        purge(now);
        return new ArrayList<>(clubs.values());
    }

    synchronized int tripCount(int clubId) {
        int n = 0;
        for (Trip t : trips.values()) if (t.clubId == clubId) n++;
        return n;
    }

    /** 광고 - 오늘부터 days 일(0 이면 끔). */
    synchronized void feature(int id, int days, long now) {
        Club c = need(id);
        if (days < 0 || days > 400) throw new IllegalArgumentException("광고 기간은 0 ~ 400일입니다.");
        c.featuredUntil = days == 0 ? 0 : now + days * DAY;
        log.info("[CLUB] 광고 club={} days={}", id, days);
        dirty = true;
    }

    boolean broken() {
        return broken;
    }

    // ---------------------------------------------------------------- 화면 조각

    /** 산 페이지(/m/산) 아래 "🚌 ○○산 가는 안내산악회" - 일정이 없으면 빈 글. */
    static String section(String mountain, long now) {
        List<Object[]> list;
        try {
            list = STORE.upcoming(mountain, now, 8, MAX_ADS);
        } catch (RuntimeException e) {
            return "";
        }
        if (list.isEmpty()) return "";
        StringBuilder b = new StringBuilder("<section class=\"clubs\"><h2>🚌 ").append(ShareServlet.esc(mountain)).append(" 가는 안내산악회</h2><ul class=\"cl\">");
        for (Object[] x : list) b.append(item((Trip) x[0], (Club) x[1], (Boolean) x[2], now));
        b.append("</ul><p class=\"dim\">예약 · 회비 · 취소는 각 산악회에 직접 하세요. routefly 는 예약을 받지 않고, 산악회가 실제로 있는지만 전화로 확인합니다(안전 · 보험 · 환불은 산악회 책임). "
                + "<b>광고</b> 표시는 산악회가 광고비를 낸 일정입니다. <a href=\"" + MountainServlet.REL + "/clubs.html\">모든 산악회 일정 ›</a></p></section>");
        return b.toString();
    }

    /** 목록 한 줄(산 페이지 - 일정 모음은 clubs.js 가 같은 꼴로 그림). */
    static String item(Trip t, Club c, boolean ad, long now) {
        String go = t.bookUrl != null ? t.bookUrl : c.url;
        StringBuilder b = new StringBuilder("<li>");
        if (ad) b.append("<span class=\"ad\">광고</span> ");
        b.append("<b>").append(when(t.departAt)).append("</b>");
        if (t.departAt < now) b.append(" <span class=\"gone\">출발함</span>");
        b.append(" ").append(ShareServlet.esc(t.title)).append("<br><span class=\"dim\">").append(ShareServlet.esc(c.name));
        if (t.stops != null) b.append(" · ").append(ShareServlet.esc(t.stops));
        if (t.price > 0) b.append(" · ").append(String.format(java.util.Locale.KOREA, "%,d원", t.price));
        if (c.publicPhone != null) b.append(" · <a href=\"tel:").append(c.publicPhone.replaceAll("[^0-9+]", "")).append("\">☎ ").append(ShareServlet.esc(c.publicPhone)).append("</a>");
        b.append("</span>");
        if (go != null) b.append(" <a class=\"bk\" href=\"").append(ShareServlet.esc(go)).append("\" target=\"_blank\" rel=\"").append(ad ? "sponsored " : "").append("noopener nofollow\">예약 › <small>")
                .append(ShareServlet.esc(host(go))).append("</small></a>");
        return b.append("</li>").toString();
    }

    private static final String[] DOW = {"월", "화", "수", "목", "금", "토", "일"};

    /** "10/25(토) 07:00" (한국 시각). */
    static String when(long ms) {
        ZonedDateTime z = Instant.ofEpochMilli(ms).atZone(WeatherServlet.KST);
        return String.format("%d/%d(%s) %02d:%02d", z.getMonthValue(), z.getDayOfMonth(), DOW[z.getDayOfWeek().getValue() - 1], z.getHour(), z.getMinute());
    }

    static JsonObject tripJson(Trip t, Club c, boolean ad, long now) {
        JsonObject o = new JsonObject();
        o.addProperty("id", t.id);
        o.addProperty("departAt", t.departAt);
        o.addProperty("when", when(t.departAt));   // 화면은 이 글을 씀(기기 시간대와 관계없이 한국 시각)
        o.addProperty("mountain", t.mountain);
        o.addProperty("title", t.title);
        if (t.stops != null) o.addProperty("stops", t.stops);
        if (t.price > 0) o.addProperty("price", t.price);
        if (t.bookUrl != null) o.addProperty("bookUrl", t.bookUrl);
        if (c != null) {
            o.addProperty("club", c.name);
            if (c.publicPhone != null) o.addProperty("phone", c.publicPhone);
            String go = t.bookUrl != null ? t.bookUrl : c.url;
            if (go != null) { o.addProperty("go", go); o.addProperty("host", host(go)); }
            if (ad) o.addProperty("ad", true);
            if (t.departAt < now) o.addProperty("gone", true);
        }
        return o;
    }

    /** 산악회 자기 정보(관리 화면) · 운영자 목록. */
    static JsonObject clubJson(Club c, long now) {
        JsonObject o = new JsonObject();
        o.addProperty("id", c.id);
        o.addProperty("name", c.name);
        o.addProperty("phone", c.phone);
        if (c.publicPhone != null) o.addProperty("publicPhone", c.publicPhone);
        if (c.url != null) o.addProperty("url", c.url);
        if (c.defStops != null) o.addProperty("defStops", c.defStops);
        o.addProperty("defBuses", c.defBuses);
        o.addProperty("defSeats", c.defSeats);
        o.addProperty("approved", c.approved);
        o.addProperty("hasLink", c.linkHash != null);
        if (c.featured(now)) o.addProperty("featuredUntil", c.featuredUntil);
        o.addProperty("created", LocalDate.ofInstant(Instant.ofEpochMilli(c.created), WeatherServlet.KST).toString());
        if (c.lastSeen > 0) o.addProperty("lastSeen", LocalDate.ofInstant(Instant.ofEpochMilli(c.lastSeen), WeatherServlet.KST).toString());
        return o;
    }

    // ---------------------------------------------------------------- 파일

    void flush() {
        String text;
        synchronized (this) {
            if (!dirty || file == null || broken) return;   // broken - 읽다 실패한 파일을 빈 것으로 덮어쓰지 않게
            purge(System.currentTimeMillis());
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
                dirty = true;   // 다음에 다시
                log.warn("[CLUB] 파일을 쓰지 못함 - {}", e.toString());
            }
        }
    }

    private String snapshot() {
        JsonObject o = new JsonObject();
        o.addProperty("v", 2);
        o.addProperty("nextClub", nextClub);
        o.addProperty("nextTrip", nextTrip);
        JsonArray cs = new JsonArray();
        for (Club c : clubs.values()) {
            JsonObject x = new JsonObject();
            x.addProperty("id", c.id); x.addProperty("created", c.created); x.addProperty("name", c.name); x.addProperty("phone", c.phone);
            x.addProperty("publicPhone", c.publicPhone); x.addProperty("url", c.url); x.addProperty("defStops", c.defStops);
            x.addProperty("defBuses", c.defBuses); x.addProperty("defSeats", c.defSeats); x.addProperty("approved", c.approved);
            x.addProperty("featuredUntil", c.featuredUntil); x.addProperty("linkHash", c.linkHash); x.addProperty("lastSeen", c.lastSeen);
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
            if (!o.has("v")) { log.info("[CLUB] 예전(아이디 · 비밀번호) 시험 파일은 읽지 않음 - 새로 시작"); backup("old"); return; }
            for (JsonElement e : o.getAsJsonArray("clubs")) {
                JsonObject x = e.getAsJsonObject();
                Club c = new Club(x.get("id").getAsInt(), x.get("created").getAsLong());
                c.name = x.get("name").getAsString(); c.phone = x.get("phone").getAsString(); c.publicPhone = str(x, "publicPhone"); c.url = str(x, "url");
                c.defStops = str(x, "defStops"); c.defBuses = x.get("defBuses").getAsInt(); c.defSeats = x.get("defSeats").getAsInt();
                c.approved = x.get("approved").getAsBoolean(); c.featuredUntil = x.get("featuredUntil").getAsLong(); c.linkHash = str(x, "linkHash"); c.lastSeen = x.get("lastSeen").getAsLong();
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
            broken = true;   // 반쯤 읽은 것으로 파일을 덮어쓰지 않음 - 운영자가 파일을 보고 고친 뒤 다시 켬
            clubs.clear(); trips.clear(); sessions.clear();
            log.error("[CLUB] 파일을 읽지 못함 - 고칠 때까지 저장하지 않음(clubs.json.bad-* 에 사본) - {}", e.toString());
            backup("bad");
        }
    }

    private void backup(String why) {
        try {
            Files.copy(file, file.resolveSibling("clubs.json." + why + "-" + System.currentTimeMillis()));
        } catch (Exception ex) {
            log.error("[CLUB] 사본을 남기지 못함 - {}", ex.toString());
        }
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }
}
