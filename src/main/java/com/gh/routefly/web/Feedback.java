package com.gh.routefly.web;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.SSLSocketFactory;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 의견 보내기(2026-10-20 홍TV님 - "나에게 메일"). 손님이 앱에서 적은 글을 운영자 메일로 보내고, 파일에도 남김(메일이 안 될 때 /stats 에서 봄).
 * <ul>
 *   <li>파일: stats.dir(없으면 톰캣 폴더/routefly-stats)/feedback/feedback-YYYY-MM.jsonl (600) - 12달 지나면 지움. IP 는 남기지 않음.</li>
 *   <li>메일: 설정 mail.smtp.host · mail.smtp.user · mail.smtp.password · mail.to 가 다 있을 때만(SMTPS 465, 비번은 Gmail 앱 비밀번호).</li>
 *   <li>막기: 한 곳(IP)에서 10분에 3번 · 하루 10번, 서버 전체 하루 200번(메모리에만).</li>
 * </ul>
 */
final class Feedback {

    private static final Logger log = LogManager.getLogger(Feedback.class);
    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    static final int MAX_TEXT = 1000, KEEP_MONTHS = 12, PER_10MIN = 3, PER_DAY = 10, ALL_PER_DAY = 200;

    private final Path dir;
    private final Map<String, List<Long>> hits = new ConcurrentHashMap<>();
    private final List<Long> all = new ArrayList<>();
    private final ExecutorService mailer = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "routefly-mail");
        t.setDaemon(true);
        return t;
    });

    Feedback(Path dir) {
        this.dir = dir;
    }

    static final Feedback STORE = new Feedback(defaultDir());

    static Path defaultDir() {
        String d = RouteflyConfig.get("stats.dir");
        if (d == null) d = System.getProperty("catalina.base", System.getProperty("java.io.tmpdir")) + "/routefly-stats";
        return Path.of(d, "feedback");
    }

    /** 순수 함수 - 답장 받을 메일(선택): 비면 null, 모양이 틀리면 IllegalArgumentException. */
    static String reply(String s) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim();
        if (t.length() > 80 || !t.matches("[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}")) throw new IllegalArgumentException("답장 받을 메일 주소가 올바르지 않습니다.");
        return t;
    }

    /** 순수 함수 - 글: 제어 문자를 빼고(줄바꿈은 둠) 1000자까지. 2자 미만이면 IllegalArgumentException. */
    static String text(String s) {
        String t = s == null ? "" : s.replace("\r\n", "\n").replaceAll("[\\p{Cntrl}&&[^\n\t]]", "").trim();
        if (t.length() < 2) throw new IllegalArgumentException("내용을 적어 주세요.");
        return t.length() > MAX_TEXT ? t.substring(0, MAX_TEXT) : t;
    }

    /** 순수 함수 - 어느 화면에서(경로만 - ? 뒤는 버림, 60자). */
    static String page(String s) {
        if (s == null) return "";
        String t = s.replaceAll("[?#].*", "").replaceAll("[^A-Za-z0-9가-힣/._\\-]", "");
        return t.length() > 60 ? t.substring(0, 60) : t;
    }

    /** 이 곳(IP)에서 지금 받아도 되나 - 받으면 셈. */
    synchronized boolean allow(String ip, long now) {
        all.removeIf(t -> now - t > 24 * 3600_000L);
        if (all.size() >= ALL_PER_DAY) return false;
        List<Long> l = hits.computeIfAbsent(ip == null ? "" : ip, k -> new ArrayList<>());
        l.removeIf(t -> now - t > 24 * 3600_000L);
        long recent = l.stream().filter(t -> now - t < 600_000L).count();
        if (recent >= PER_10MIN || l.size() >= PER_DAY) return false;
        l.add(now);
        all.add(now);
        hits.values().removeIf(List::isEmpty);
        return true;
    }

    /** 받기 - 파일에 남기고 메일(설정이 있으면, 뒤에서). */
    void add(String text, String page, String reply, long now) {
        JsonObject o = new JsonObject();
        o.addProperty("at", now);
        o.addProperty("page", page);
        if (reply != null) o.addProperty("reply", reply);
        o.addProperty("text", text);
        save(o, now);
        Mail m = Mail.fromConfig();
        if (m != null) mailer.submit(() -> {
            try {
                m.send("[routefly 의견] " + (page.isEmpty() ? "앱" : page), body(text, page, reply, now), reply);
            } catch (Exception e) {
                log.warn("[FEEDBACK] 메일을 보내지 못함(파일에는 남음) - {}", e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        });
    }

    static String body(String text, String page, String reply, long now) {
        return text + "\n\n----\n화면: " + (page.isEmpty() ? "-" : page) + "\n시각: " + stamp(now)
                + "\n답장: " + (reply == null ? "(안 적음)" : reply) + "\n(routefly 의견 보내기 - 서버 파일 feedback/ 에도 남음)";
    }

    static String stamp(long now) {
        return ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(now), KST).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
    }

    private synchronized void save(JsonObject o, long now) {
        if (dir == null) return;
        try {
            Files.createDirectories(dir);
            LocalDateTime t = LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(now), KST);
            Path f = dir.resolve(String.format(Locale.ROOT, "feedback-%04d-%02d.jsonl", t.getYear(), t.getMonthValue()));
            boolean fresh = !Files.exists(f);
            Files.writeString(f, o + "\n", StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            if (fresh) try { Files.setPosixFilePermissions(f, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")); } catch (UnsupportedOperationException e) { /* 윈도 */ }
            String oldest = String.format(Locale.ROOT, "feedback-%04d-%02d.jsonl", t.minusMonths(KEEP_MONTHS).getYear(), t.minusMonths(KEEP_MONTHS).getMonthValue());
            try (var s = Files.list(dir)) {
                for (Path p : (Iterable<Path>) s::iterator) {
                    String n = p.getFileName().toString();
                    if (n.startsWith("feedback-") && n.endsWith(".jsonl") && n.compareTo(oldest) < 0) Files.deleteIfExists(p);
                }
            }
        } catch (IOException e) {
            log.warn("[FEEDBACK] 파일에 쓰지 못함 - {}", e.toString());
        }
    }

    /** 최근 n 개(새것부터) - /stats 보기. */
    synchronized List<JsonObject> recent(int n) {
        List<JsonObject> out = new ArrayList<>();
        if (dir == null || !Files.isDirectory(dir)) return out;
        try (var s = Files.list(dir)) {
            List<Path> files = new ArrayList<>(s.filter(p -> p.getFileName().toString().matches("feedback-\\d{4}-\\d{2}\\.jsonl")).sorted().toList());
            Collections.reverse(files);
            for (Path f : files) {
                List<String> lines = Files.readAllLines(f, StandardCharsets.UTF_8);
                for (int i = lines.size() - 1; i >= 0 && out.size() < n; i--) {
                    if (!lines.get(i).isBlank()) out.add(JsonParser.parseString(lines.get(i)).getAsJsonObject());
                }
                if (out.size() >= n) break;
            }
        } catch (Exception e) {
            log.warn("[FEEDBACK] 파일을 읽지 못함 - {}", e.toString());
        }
        return out;
    }

    // ---------------------------------------------------------------- 메일(SMTPS - 따로 라이브러리 없이)

    static final class Mail {
        final String host, user, password, to;
        final int port;
        final boolean ssl;

        Mail(String host, int port, boolean ssl, String user, String password, String to) {
            this.host = host; this.port = port; this.ssl = ssl; this.user = user; this.password = password; this.to = to;
        }

        static Mail fromConfig() {
            String host = RouteflyConfig.get("mail.smtp.host"), user = RouteflyConfig.get("mail.smtp.user"), pw = RouteflyConfig.get("mail.smtp.password"), to = RouteflyConfig.get("mail.to");
            if (host == null || user == null || pw == null || to == null) return null;
            int port = 465;
            try { if (RouteflyConfig.get("mail.smtp.port") != null) port = Integer.parseInt(RouteflyConfig.get("mail.smtp.port").trim()); } catch (NumberFormatException e) { /* 465 */ }
            return new Mail(host.trim(), port, true, user.trim(), pw.replace(" ", ""), to.trim());
        }

        private static String b64(String s) {
            return Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));
        }

        /** 한 통 보내기. 실패하면 IOException(서버 답 첫 줄). */
        void send(String subject, String body, String replyTo) throws IOException {
            try (Socket s = ssl ? SSLSocketFactory.getDefault().createSocket() : new Socket()) {
                s.connect(new InetSocketAddress(host, port), 10_000);
                s.setSoTimeout(20_000);
                BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.US_ASCII));
                OutputStream out = s.getOutputStream();
                expect(in, 220);
                cmd(out, in, "EHLO routefly", 250);
                cmd(out, in, "AUTH LOGIN", 334);
                cmd(out, in, b64(user), 334);
                cmd(out, in, b64(password), 235);
                cmd(out, in, "MAIL FROM:<" + user + ">", 250);
                cmd(out, in, "RCPT TO:<" + to + ">", 250);
                cmd(out, in, "DATA", 354);
                StringBuilder m = new StringBuilder();
                m.append("From: routefly <").append(user).append(">\r\n");
                m.append("To: <").append(to).append(">\r\n");
                if (replyTo != null) m.append("Reply-To: <").append(replyTo).append(">\r\n");
                m.append("Subject: =?UTF-8?B?").append(b64(subject.replaceAll("[\\r\\n]", " "))).append("?=\r\n");
                m.append("Date: ").append(DateTimeFormatter.RFC_1123_DATE_TIME.format(ZonedDateTime.now(KST))).append("\r\n");
                m.append("MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n");
                String enc = b64(body.replace("\r\n", "\n").replace("\n", "\r\n"));
                for (int i = 0; i < enc.length(); i += 76) m.append(enc, i, Math.min(enc.length(), i + 76)).append("\r\n");
                m.append(".");
                cmd(out, in, m.toString(), 250);
                out.write("QUIT\r\n".getBytes(StandardCharsets.US_ASCII));
                out.flush();
            }
        }

        private static void cmd(OutputStream out, BufferedReader in, String line, int want) throws IOException {
            out.write((line + "\r\n").getBytes(StandardCharsets.US_ASCII));
            out.flush();
            expect(in, want);
        }

        /** 여러 줄 답(250-…)은 마지막 줄(250 …)까지 읽음. */
        private static void expect(BufferedReader in, int want) throws IOException {
            String first = null, l;
            while ((l = in.readLine()) != null) {
                if (first == null) first = l;
                if (l.length() < 4 || l.charAt(3) != '-') break;
            }
            if (first == null || !first.startsWith(String.valueOf(want))) {
                throw new IOException("메일 서버 답 " + (first == null ? "없음" : first.length() > 60 ? first.substring(0, 60) : first) + " (기다린 것 " + want + ")");
            }
        }
    }
}
