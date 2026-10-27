import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * 가져온 뒤 블로그스팟의 실제 글 주소를 읽어, 옛 주소 → 새 주소 nginx map 을 만듭니다. 2026-10-20 홍TV님.
 *
 * <p>블로그스팟은 blogger:filename 을 늘 따르지는 않음(시험 블로그에서 지운 글 뒤 다시 넣으니 제목 낱말 + _숫자 주소) -
 * 그래서 예상 주소 대신 실제 피드를 읽고, WxrToBlogger 의 --map 파일(옛 경로 · 예상 · 제목 · 올린 시각)과 짝 맞춤.
 * <pre>
 *   java tools\blog-move\BloggerMap.java https://hong-tv.blogspot.com &lt;out.conf&gt; map-001-030.tsv map-031-301.tsv
 *   (인터넷 대신 받아 둔 피드 파일로: --feed feed1.xml feed2.xml ... 을 맨 뒤에)
 * </pre>
 * 짝 맞춤: 올린 시각(초까지 같은 순간) 먼저 - 제목이 다르면 알림만, 그다음 제목이 하나뿐인 글. 못 맞춘 것은 화면에 적고 map 에서 뺌(nginx 기본값 = 블로그 첫 화면).
 * 출력 한 줄: "옛 경로" 새 주소; - 끝 / 있는 것 · 없는 것 둘 다.
 */
public class BloggerMap {

    static final String ATOM = "http://www.w3.org/2005/Atom";

    record Old(String path, String title, Instant at) {}
    record Live(String url, String title, Instant at, Instant updated) {}

    /** 같은 글이 두 벌(가져오기를 두 번 - 2026-10-27 PC: 10-21 · 10-27 글이 함께 남음)일 때 고를 쪽: old = 먼저 들어온 것(updated 가 이른 것), new = 나중 것. */
    static boolean preferNew;

    public static void main(String[] a) throws Exception {
        if (a.length < 3) {
            System.out.println("사용: java BloggerMap.java <블로그 주소> <out.conf> <map.tsv>... [--prefer old|new] [--feed 피드.xml ...]");
            System.exit(1);
        }
        String blog = a[0].replaceAll("/+$", "");
        List<File> maps = new ArrayList<>(), feeds = new ArrayList<>();
        boolean feedArgs = false;
        for (int i = 2; i < a.length; i++) {
            if ("--feed".equals(a[i])) { feedArgs = true; continue; }
            if ("--prefer".equals(a[i]) && i + 1 < a.length) { preferNew = "new".equals(a[++i]); continue; }
            (feedArgs ? feeds : maps).add(new File(a[i]));
        }
        List<Old> olds = new ArrayList<>();
        for (File f : maps) olds.addAll(readMap(f));
        List<Live> lives = new ArrayList<>();
        if (feeds.isEmpty()) lives.addAll(fetchAll(blog));
        else for (File f : feeds) lives.addAll(entries(Files.readAllBytes(f.toPath())));

        Map<String, String> out = match(olds, lives);
        try (Writer w = new OutputStreamWriter(new FileOutputStream(a[1]), StandardCharsets.UTF_8)) {
            w.write("# 옛 블로그 글 → 블로그스팟 (tools/blog-move/BloggerMap.java 가 만듦, " + out.size() + "개)\n");
            for (var e : out.entrySet()) {
                String p = e.getKey().endsWith("/") ? e.getKey().substring(0, e.getKey().length() - 1) : e.getKey() + "/";
                w.write(q(e.getKey()) + " " + e.getValue() + ";\n");
                if (!p.isEmpty()) w.write(q(p) + " " + e.getValue() + ";\n");
            }
        }
        System.out.println("옛 글 " + olds.size() + " · 블로그 글 " + lives.size() + " · 짝 " + out.size() + " → " + a[1]);
    }

    /** nginx 따옴표 문자열 - " 와 \ 만 막음. */
    static String q(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    static List<Old> readMap(File f) throws Exception {
        List<Old> out = new ArrayList<>();
        for (String line : Files.readAllLines(f.toPath(), StandardCharsets.UTF_8)) {
            String[] c = line.split("\t", -1);
            if (c.length < 4 || c[0].isBlank()) continue;
            out.add(new Old(c[0], c[2], Instant.parse(c[3])));
        }
        return out;
    }

    /** 피드를 150개씩 끝까지(블로그스팟 한 번에 최대 150). */
    static List<Live> fetchAll(String blog) throws Exception {
        HttpClient http = HttpClient.newHttpClient();
        List<Live> all = new ArrayList<>();
        for (int start = 1; start < 5000; start += 150) {
            URI u = URI.create(blog + "/feeds/posts/default?max-results=150&start-index=" + start);
            HttpResponse<byte[]> r = http.send(HttpRequest.newBuilder(u).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
            if (r.statusCode() != 200) throw new IllegalStateException("피드 " + r.statusCode() + " " + u);
            List<Live> page = entries(r.body());
            all.addAll(page);
            if (page.size() < 150) break;
        }
        return all;
    }

    static List<Live> entries(byte[] xml) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(true);
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        Document d = f.newDocumentBuilder().parse(new ByteArrayInputStream(xml));
        List<Live> out = new ArrayList<>();
        NodeList es = d.getElementsByTagNameNS(ATOM, "entry");
        for (int i = 0; i < es.getLength(); i++) {
            Element e = (Element) es.item(i);
            String url = null, title = "", pub = null, upd = null;
            for (Node n = e.getFirstChild(); n != null; n = n.getNextSibling()) {
                if (!(n instanceof Element c) || !ATOM.equals(c.getNamespaceURI())) continue;
                switch (c.getLocalName()) {
                    case "title" -> title = c.getTextContent().trim();
                    case "published" -> pub = c.getTextContent().trim();
                    case "updated" -> upd = c.getTextContent().trim();
                    case "link" -> { if ("alternate".equals(c.getAttribute("rel"))) url = c.getAttribute("href"); }
                    default -> { }
                }
            }
            if (url != null && pub != null) out.add(new Live(url.replaceFirst("^http:", "https:"), title, OffsetDateTime.parse(pub).toInstant(),
                    upd == null ? OffsetDateTime.parse(pub).toInstant() : OffsetDateTime.parse(upd).toInstant()));
        }
        return out;
    }

    /**
     * 옛 경로 → 새 주소. 시각(초) 먼저, 그다음 제목이 하나뿐인 것.
     * 같은 시각 · 같은 제목이 여러 벌이면 "두 벌" 로 알리고 --prefer 쪽을 고름(전에는 피드 순서로 아무거나 - 2026-10-27 PC 보고로 고침).
     */
    static Map<String, String> match(List<Old> olds, List<Live> lives) {
        Map<Long, List<Live>> byTime = new HashMap<>();
        Map<String, List<Live>> byTitle = new HashMap<>();
        for (Live l : lives) {
            byTime.computeIfAbsent(l.at().getEpochSecond(), k -> new ArrayList<>()).add(l);
            byTitle.computeIfAbsent(norm(l.title()), k -> new ArrayList<>()).add(l);
        }
        Map<String, String> out = new LinkedHashMap<>();
        int warn = 0, miss = 0, dup = 0;
        for (Old o : olds) {
            List<Live> t = byTime.getOrDefault(o.at().getEpochSecond(), List.of());
            List<Live> same = t.size() == 1 ? t : t.stream().filter(l -> norm(l.title()).equals(norm(o.title()))).toList();
            Live hit = pick(same);
            if (same.size() > 1) {
                dup++;
                System.out.println("두 벌(" + same.size() + "): " + o.path() + " | " + o.title() + " → " + hit.url());
            }
            if (hit == null) {
                List<Live> n = byTitle.getOrDefault(norm(o.title()), List.of());
                if (n.size() == 1) hit = n.get(0);
            }
            if (hit == null) {
                miss++;
                System.out.println("못 맞춤: " + o.path() + " | " + o.title());
                continue;
            }
            if (!norm(hit.title()).equals(norm(o.title()))) {
                warn++;
                System.out.println("제목 다름(시각으로 맞춤): " + o.path() + " | " + o.title() + " → " + hit.title());
            }
            out.put(o.path(), hit.url());
        }
        System.out.println("못 맞춤 " + miss + " · 제목 다름 " + warn + " · 두 벌 " + dup + (dup > 0 ? " (중복 글을 지운 뒤 다시 만드는 것이 좋음, 지금은 " + (preferNew ? "나중" : "먼저") + " 들어온 쪽)" : ""));
        return out;
    }

    /** 여러 벌이면 updated 로 고름(없으면 null). */
    static Live pick(List<Live> c) {
        if (c.isEmpty()) return null;
        Live best = c.get(0);
        for (Live l : c) if (preferNew ? l.updated().isAfter(best.updated()) : l.updated().isBefore(best.updated())) best = l;
        return best;
    }

    static String norm(String s) {
        return s.replaceAll("\\s+", " ").trim();
    }
}
