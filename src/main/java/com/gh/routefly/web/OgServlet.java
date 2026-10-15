package com.gh.routefly.web;

import java.awt.Color;
import java.awt.Font;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.GraphicsEnvironment;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import javax.imageio.ImageIO;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * 산마다 공유 그림(2026-10-15 홍TV님 - 카톡 · 검색에 산 페이지를 붙이면 산 이름 · 정상 · 높이가 든 그림).
 * {@code GET /og/m/설악산.png} (한국어) · {@code /og/en/seoraksan.png} (영어). 1200×630 PNG, 한 번 그리면 메모리에 둠(산 98곳 × 2).
 *
 * <p>한글 글꼴(맑은 고딕 · 나눔고딕 · Noto Sans KR …)이 서버에 없으면 산 이름을 로마자로 그립니다(네모 글자 대신).
 */
@WebServlet(urlPatterns = {"/og/*"})
public class OgServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final Logger log = LogManager.getLogger(OgServlet.class);
    static final int W = 1200, H = 630;
    /** 한글 글꼴 후보(앞 것부터). */
    static final String[] KO_FONTS = {"Malgun Gothic", "맑은 고딕", "NanumGothic", "나눔고딕", "NanumBarunGothic", "Noto Sans CJK KR", "Noto Sans KR", "Apple SD Gothic Neo", "UnDotum"};

    private final Map<String, byte[]> cache = new ConcurrentHashMap<>();
    private volatile JsonArray peaks;
    private volatile BufferedImage logo;

    @Override
    public void init() {
        if (System.getProperty("java.awt.headless") == null) System.setProperty("java.awt.headless", "true");
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo() == null ? "" : URLDecoder.decode(req.getPathInfo(), StandardCharsets.UTF_8);
        boolean en = path.startsWith("/en/");
        if (!(en || path.startsWith("/m/")) || !path.endsWith(".png")) {
            resp.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        String key = path.substring(en ? 4 : 3, path.length() - 4);
        JsonObject peak = en ? MountainEn.find(peaks(), key) : MountainServlet.find(peaks(), key);
        if (peak == null) {
            resp.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        String id = MountainEn.id(peak), cacheKey = (en ? "en:" : "ko:") + id;
        byte[] png = cache.get(cacheKey);
        if (png == null) {
            try {
                png = png(en ? english(peak) : korean(peak), english(peak), logo());
            } catch (Exception | Error e) {   // 글꼴 · 그래픽 장치가 없는 서버 - 기본 그림으로
                log.warn("[OG] 그림을 못 그림 {} - {}", id, e.toString());
                resp.sendRedirect(req.getContextPath() + "/img/og.png?v=2");
                return;
            }
            cache.put(cacheKey, png);
        }
        resp.setContentType("image/png");
        resp.setHeader("Cache-Control", "public, max-age=86400");
        resp.setContentLength(png.length);
        resp.getOutputStream().write(png);
    }

    /** 순수 함수 - 한국어 그림의 글 [제목, 둘째 줄, 셋째 줄]. 한글 글꼴이 없으면 png 가 영어 글(english)로 바꿈. */
    static String[] korean(JsonObject peak) {
        String id = MountainEn.id(peak), summit = str(peak, "summit");
        Integer h = MountainServlet.elev(peak);
        String second = "산림청 100대 명산" + (summit != null && !summit.equals(str(peak, "name")) ? " · 정상 " + summit : "")
                + (h != null ? String.format(Locale.KOREA, " · %,dm", h) : "");
        return new String[] {id, second, "등산코스 · 날씨 · 일출 일몰 · 3D 미리보기"};
    }

    static String[] english(JsonObject peak) {
        String summit = str(peak, "summit");
        Integer h = MountainServlet.elev(peak);
        String second = "Korea's 100 Famous Mountains" + (summit != null && !summit.equals(str(peak, "name")) ? " · " + MountainEn.summitName(summit, str(peak, "name")) : "")
                + (h != null ? String.format(Locale.US, " · %,d m", h) : "");
        return new String[] {MountainEn.name(peak), second, "Hiking trails · Weather · Sunrise · 3D preview"};
    }

    /** 순수 함수 - 글꼴 고르기: 후보 가운데 이 글을 다 그릴 수 있는 첫 글꼴, 없으면 null. */
    static String fontFor(String text, Set<String> installed) {
        for (String f : KO_FONTS) {
            if (!installed.contains(f)) continue;
            if (new Font(f, Font.BOLD, 40).canDisplayUpTo(text) == -1) return f;
        }
        return null;
    }

    /**
     * 그림 그리기. lines = [제목, 둘째 줄, 셋째 줄], fallback - 한글 글꼴이 없을 때 쓸 글(영어). logo - img/og.png(왼쪽 위에 줄여 붙임, 없으면 글자만).
     */
    static byte[] png(String[] lines, String[] fallback, BufferedImage logo) throws IOException {
        Set<String> installed = new HashSet<>(Arrays.asList(GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames()));
        String all = lines[0] + lines[1] + lines[2], face = fontFor(all, installed);
        if (face == null && !all.chars().allMatch(c -> c < 0x1100)) lines = fallback;   // 한글을 못 그림(네모 글자) - 영어로
        String title = lines[0], second = lines[1], third = lines[2];
        String fam = face != null ? face : Font.SANS_SERIF;
        BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        // 바탕 - 위는 로고 그림의 바탕색 그대로(로고 둘레에 네모가 안 보이게), 아래로 옅은 초록
        Color top = logo != null ? new Color(logo.getRGB(170, 130)) : new Color(0xF7FAF8);
        g.setPaint(new GradientPaint(0, 200, top, 0, H, new Color(0xE3F1E7)));
        g.fillRect(0, 0, W, H);
        // 산줄기(아래) - 뒤는 옅게, 앞은 진하게
        ridge(g, new int[] {0, 180, 330, 470, 640, 800, 960, 1100, 1200}, new int[] {560, 490, 530, 460, 515, 470, 525, 480, 520}, new Color(0xA8D9B3));
        ridge(g, new int[] {0, 150, 300, 420, 560, 720, 880, 1040, 1200}, new int[] {610, 570, 590, 555, 600, 565, 595, 572, 600}, new Color(0x3FAE5C));
        if (logo != null) {   // og.png 의 로고 부분(160..880 × 120..380)을 줄여 왼쪽 위에
            g.drawImage(cutout(logo.getSubimage(160, 120, Math.min(720, logo.getWidth() - 160), Math.min(260, logo.getHeight() - 120))), 70, 50, 360, 130, null);
        }
        g.setColor(new Color(0x13202B));
        int size = 118;
        Font tf = new Font(fam, Font.BOLD, size);
        while (g.getFontMetrics(tf).stringWidth(title) > W - 140 && size > 60) tf = new Font(fam, Font.BOLD, size -= 6);
        g.setFont(tf);
        g.drawString(title, 70, 300);
        int s2 = 40;
        while (g.getFontMetrics(new Font(fam, Font.PLAIN, s2)).stringWidth(second) > W - 140 && s2 > 28) s2 -= 2;
        g.setFont(new Font(fam, Font.PLAIN, s2));
        g.setColor(new Color(0x3C4A56));
        g.drawString(fit(g, second, W - 140), 70, 370);
        g.setFont(new Font(fam, Font.BOLD, 34));
        g.setColor(new Color(0x1E7F3B));
        g.drawString(fit(g, third, W - 140), 70, 425);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    /** 로고 둘레의 흰 바탕을 투명하게(바탕 그라데이션이 달라 네모가 보였음) - 밝고 색이 거의 없는 점일수록 투명. */
    static BufferedImage cutout(BufferedImage src) {
        BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < src.getHeight(); y++) {
            for (int x = 0; x < src.getWidth(); x++) {
                int rgb = src.getRGB(x, y), r = rgb >> 16 & 255, gr = rgb >> 8 & 255, b = rgb & 255;
                int min = Math.min(r, Math.min(gr, b)), max = Math.max(r, Math.max(gr, b));
                int a = max - min < 24 && min > 215 ? Math.max(0, Math.min(255, (250 - min) * 255 / 35)) : 255;
                out.setRGB(x, y, a << 24 | rgb & 0xFFFFFF);
            }
        }
        return out;
    }

    private static void ridge(Graphics2D g, int[] xs, int[] ys, Color c) {
        Path2D p = new Path2D.Double();
        p.moveTo(0, H);
        for (int i = 0; i < xs.length; i++) p.lineTo(xs[i], ys[i]);
        p.lineTo(W, H);
        p.closePath();
        g.setColor(c);
        g.fill(p);
    }

    /** 폭을 넘으면 뒤를 … 로. */
    private static String fit(Graphics2D g, String s, int w) {
        if (g.getFontMetrics().stringWidth(s) <= w) return s;
        while (s.length() > 1 && g.getFontMetrics().stringWidth(s + "…") > w) s = s.substring(0, s.length() - 1);
        return s + "…";
    }

    private JsonArray peaks() {
        JsonArray p = peaks;
        if (p != null) return p;
        try (InputStream in = getServletContext().getResourceAsStream("/data/mountains100.json")) {
            JsonElement e = in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            p = e != null && e.isJsonObject() && e.getAsJsonObject().has("peaks") ? e.getAsJsonObject().getAsJsonArray("peaks") : new JsonArray();
        } catch (Exception e) {
            p = new JsonArray();
        }
        MountainServlet.withElev(p, MountainServlet.readElev(getServletContext()));   // 공식 높이(data/peak-elev.json)
        peaks = p;
        return p;
    }

    private BufferedImage logo() {
        BufferedImage l = logo;
        if (l != null) return l;
        try (InputStream in = getServletContext().getResourceAsStream("/img/og.png")) {
            l = in == null ? null : ImageIO.read(in);
        } catch (Exception e) {
            l = null;
        }
        logo = l;
        return l;
    }

    private static String str(JsonObject o, String k) {
        JsonElement e = o.get(k);
        return e == null || e.isJsonNull() ? null : e.getAsString();
    }
}
