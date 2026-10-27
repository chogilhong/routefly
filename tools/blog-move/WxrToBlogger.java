import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * 워드프레스 내보내기(WXR) → 블로그스팟(Blogger) 가져오기 파일(Atom, blogger 2018 이름공간). 2026-10-20 홍TV님.
 *
 * <p>견본: blogger-sample-skeleton.xml(블로그스팟 백업의 뼈대). 설치할 것 없음 - JDK 만:
 * <pre>
 *   java tools\blog-move\WxrToBlogger.java &lt;WXR.xml&gt; &lt;out.xml&gt; [옵션]
 *     --site https://hongtv.co.kr     옛 사이트 주소(그림 · 링크를 이 모양으로 맞춤, 기본 WXR 의 &lt;link&gt;)
 *     --skip N --limit N              N 개 건너뛰고 N 개만(나눠 넣기 · 2~3개 시험용). 순서는 오래된 글부터
 *     --author 이름                   글쓴이 이름(기본 WXR 의 dc:creator)
 *     --blog-id 숫자                  블로그 ID(블로그스팟 백업의 feed id 숫자 - 모르면 0)
 *     --map map.tsv                   옛 주소 → 새 주소(예상) 짝 - 가져온 뒤 맞는지 확인하고 nginx 301 에 씀
 *     --img-map img.tsv               옛 그림 경로 → 블로그스팟 그림 주소(2026-10-27 - 그림을 블로그스팟 저장소로 옮김).
 *                                     한 줄에 "/wp-content/uploads/2026/09/a.jpg[탭]https://blogger.googleusercontent.com/…" (경로는 % 풀린 글자),
 *                                     본문의 옛 그림 주소(--site 모양으로 맞춘 뒤)를 바꿈. 짝 없는 그림은 그대로 두고 수를 알림
 * </pre>
 * 바꾸는 것: 발행(publish)된 글만 · 라벨은 카테고리 먼저 + 태그(글당 20개 · 글자 합 200자까지, 미분류 뺌) ·
 * 블록 편집기 주석(&lt;!-- wp:… --&gt;) 지움 · &lt;p&gt; 없는 옛 글은 빈 줄 → 문단 · 그림 주소 http/www → --site 모양 ·
 * 본문에 그림이 없으면 대표 그림(특성 이미지)을 맨 위에(2026-10-20 - 없으면 블로그스팟 목록이 제목 글자로만 보임).
 * 댓글은 넣지 않음(견본에 댓글 모양이 없음).
 */
public class WxrToBlogger {

    static final String ATOM = "http://www.w3.org/2005/Atom";
    static final String BLOGGER = "http://schemas.google.com/blogger/2018";
    static final String WP = "http://wordpress.org/export/";   // 판마다 1.0 · 1.1 · 1.2 - 앞부분으로 찾음
    static final String CONTENT = "http://purl.org/rss/1.0/modules/content/";
    static final String DC = "http://purl.org/dc/elements/1.1/";
    static final int MAX_LABELS = 20, MAX_LABEL_BYTES = 200;

    record Post(String id, String title, String html, String published, String updated, String slug, String link,
                String author, List<String> labels) {}

    public static void main(String[] a) throws Exception {
        if (a.length < 2) {
            System.out.println("사용: java WxrToBlogger.java <WXR.xml> <out.xml> [--site URL] [--skip N] [--limit N] [--author 이름] [--blog-id 숫자] [--map map.tsv] [--img-map img.tsv]");
            System.exit(1);
        }
        String site = null, author = null, blogId = "0", map = null, imgMap = null;
        int skip = 0, limit = Integer.MAX_VALUE;
        for (int i = 2; i < a.length; i++) {
            switch (a[i]) {
                case "--site" -> site = a[++i].replaceAll("/+$", "");
                case "--skip" -> skip = Integer.parseInt(a[++i]);
                case "--limit" -> limit = Integer.parseInt(a[++i]);
                case "--author" -> author = a[++i];
                case "--blog-id" -> blogId = a[++i];
                case "--map" -> map = a[++i];
                case "--img-map" -> imgMap = a[++i];
                default -> throw new IllegalArgumentException("모르는 옵션 " + a[i]);
            }
        }
        Document in = parse(new File(a[0]));
        if (site == null) site = text(first(in.getDocumentElement(), null, "link")).replaceAll("/+$", "");
        List<Post> all = posts(in, site, author);
        all.sort((x, y) -> x.published().compareTo(y.published()));
        List<Post> pick = all.subList(Math.min(skip, all.size()), (int) Math.min((long) skip + limit, all.size()));
        if (imgMap != null) pick = swapImages(pick, site, readImgMap(new File(imgMap)));
        write(pick, blogId, new File(a[1]));
        if (map != null) writeMap(pick, new File(map));
        int labels = pick.stream().mapToInt(p -> p.labels().size()).sum();
        System.out.println("발행 글 " + all.size() + "개 중 " + pick.size() + "개 → " + a[1] + " (라벨 합 " + labels + ")");
    }

    // ---------------------------------------------------------------- 그림 주소 바꾸기(--img-map)

    /** 옛 경로(% 풀린 글자) → 새 주소. 빈 줄 · # 줄은 건너뜀. */
    static Map<String, String> readImgMap(File f) throws Exception {
        Map<String, String> m = new LinkedHashMap<>();
        for (String line : java.nio.file.Files.readAllLines(f.toPath(), StandardCharsets.UTF_8)) {
            String[] c = line.split("\t", -1);
            if (c.length < 2 || c[0].isBlank() || c[0].startsWith("#")) continue;
            m.put(c[0].trim(), c[1].trim());
        }
        return m;
    }

    /** 본문의 옛 그림 주소(site + /wp-content/uploads/…)를 짝의 새 주소로. 바꾼 수 · 짝 없는 그림(서로 다른 경로) 수를 알림. */
    static List<Post> swapImages(List<Post> posts, String site, Map<String, String> m) {
        Pattern p = Pattern.compile(Pattern.quote(site) + "(/wp-content/uploads/[^\"'\\s<>)]+)");
        int[] hit = {0};
        Set<String> miss = new java.util.TreeSet<>();
        List<Post> out = new ArrayList<>();
        for (Post x : posts) {
            Matcher mt = p.matcher(x.html());
            StringBuilder sb = new StringBuilder();
            while (mt.find()) {
                String path = URLDecoder.decode(mt.group(1).replace("+", "%2B"), StandardCharsets.UTF_8);
                String to = m.get(path);
                if (to == null) { miss.add(path); mt.appendReplacement(sb, Matcher.quoteReplacement(mt.group())); continue; }
                hit[0]++;
                mt.appendReplacement(sb, Matcher.quoteReplacement(to));
            }
            mt.appendTail(sb);
            out.add(new Post(x.id(), x.title(), sb.toString(), x.published(), x.updated(), x.slug(), x.link(), x.author(), x.labels()));
        }
        System.out.println("그림 주소 바꿈 " + hit[0] + " · 짝 없는 그림 " + miss.size() + (miss.isEmpty() ? "" : " (옛 주소 그대로 - 예: " + miss.iterator().next() + ")"));
        return out;
    }

    // ---------------------------------------------------------------- 읽기

    static Document parse(File f) throws Exception {
        DocumentBuilderFactory f2 = DocumentBuilderFactory.newInstance();
        f2.setNamespaceAware(true);
        f2.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);   // 밖의 파일을 끌어오는 XML 막기
        f2.setExpandEntityReferences(false);
        return f2.newDocumentBuilder().parse(f);
    }

    static List<Post> posts(Document in, String site, String authorOpt) {
        List<Post> out = new ArrayList<>();
        NodeList items = in.getElementsByTagName("item");
        java.util.Map<String, String> attach = new java.util.HashMap<>();   // 첨부 글번호 → 파일 주소(대표 그림 찾기)
        for (int i = 0; i < items.getLength(); i++) {
            Element it = (Element) items.item(i);
            if ("attachment".equals(wp(it, "post_type"))) attach.put(wp(it, "post_id"), wp(it, "attachment_url"));
        }
        for (int i = 0; i < items.getLength(); i++) {
            Element it = (Element) items.item(i);
            if (!"post".equals(wp(it, "post_type")) || !"publish".equals(wp(it, "status"))) continue;
            Set<String> cats = new LinkedHashSet<>(), tags = new LinkedHashSet<>();
            for (Node n = it.getFirstChild(); n != null; n = n.getNextSibling()) {
                if (!(n instanceof Element e) || !"category".equals(local(e)) || e.getNamespaceURI() != null) continue;
                String name = text(e).trim();
                if (name.isEmpty() || "uncategorized".equals(e.getAttribute("nicename")) || "미분류".equals(name)) continue;
                ("category".equals(e.getAttribute("domain")) ? cats : tags).add(name);
            }
            String author = authorOpt != null ? authorOpt : text(first(it, DC, "creator"));
            String title = text(first(it, null, "title")).trim();
            String html = cleanHtml(text(first(it, CONTENT, "encoded")), site);
            String thumb = attach.get(meta(it, "_thumbnail_id"));
            if (thumb != null && !thumb.isBlank() && !IMG.matcher(html).find())   // 본문에 그림이 없으면 대표 그림을 맨 위에(목록 썸네일 · 첫 화면)
                html = "<p>" + sameSite("<img src=\"" + esc(thumb) + "\" alt=\"" + esc(title) + "\">", site) + "</p>\n" + html;
            out.add(new Post(wp(it, "post_id"), title, html,
                    isoDate(wp(it, "post_date_gmt"), wp(it, "post_date")),
                    isoDate(wp(it, "post_modified_gmt"), wp(it, "post_modified")),
                    wp(it, "post_name"), text(first(it, null, "link")).trim(), author, labels(cats, tags)));
        }
        return out;
    }

    /**
     * 카테고리 먼저, 그다음 태그. 같은 이름은 한 번. 글당 20개 · 쉼표로 이은 UTF-8 200바이트까지(넘치면 뒤에서 뺌).
     * 2026-10-20 시험: 쉼표 이음 209바이트는 들어가고 286 · 298바이트는 라벨이 통째로 빠짐 - 바이트로 세고 넉넉히 200.
     */
    static List<String> labels(Set<String> cats, Set<String> tags) {
        Set<String> all = new LinkedHashSet<>();
        for (String c : cats) all.add(c.replaceAll("\\s*,\\s*", " "));
        for (String t : tags) all.add(t.replaceAll("\\s*,\\s*", " "));   // 블로그스팟 라벨에 쉼표는 못 씀
        List<String> out = new ArrayList<>();
        int bytes = 0;
        for (String l : all) {
            int b = l.getBytes(StandardCharsets.UTF_8).length + (out.isEmpty() ? 0 : 1);   // 앞 쉼표 1바이트
            if (out.size() >= MAX_LABELS || bytes + b > MAX_LABEL_BYTES) continue;   // 긴 것은 건너뛰고 짧은 뒤엣것은 넣음
            out.add(l);
            bytes += b;
        }
        return out;
    }

    static final Pattern BLOCK = Pattern.compile("<!--\\s*/?wp:[^>]*?-->\\s*");
    static final Pattern HAS_BLOCK_TAG = Pattern.compile("(?i)<(p|div|h[1-6]|ul|ol|table|figure|blockquote)[\\s>]");

    /** 블록 주석 지우기 · 옛 글은 빈 줄로 문단 · 옛 사이트 주소 모양 맞추기. */
    static String cleanHtml(String html, String site) {
        String h = BLOCK.matcher(html).replaceAll("");
        h = h.replace("\r\n", "\n");
        if (!HAS_BLOCK_TAG.matcher(h).find()) h = autop(h);
        return sameSite(h, site).trim();
    }

    /** 옛 사이트 주소(http · www 섞인 것)를 --site 한 모양으로. */
    static String sameSite(String h, String site) {
        if (site == null || site.isEmpty()) return h;
        String host = site.replaceFirst("^https?://", "").replaceFirst("^www\\.", "");
        return h.replaceAll("(?i)(https?:)?//(www\\.)?" + Pattern.quote(host) + "(?=[/\"'\\s)])", Matcher.quoteReplacement(site));
    }

    /** 워드프레스 wpautop 의 간단판: 빈 줄 → 문단, 홑 줄바꿈 → &lt;br&gt;. */
    static String autop(String h) {
        StringBuilder sb = new StringBuilder();
        for (String para : h.trim().split("\n\\s*\n")) {
            String p = para.trim();
            if (p.isEmpty()) continue;
            sb.append("<p>").append(p.replace("\n", "<br>\n")).append("</p>\n");
        }
        return sb.toString();
    }

    /** "2026-08-01 12:34:56"(GMT) → 2026-08-01T12:34:56.000Z. GMT 가 비면 한국 시각에서 9시간 뺌. */
    static String isoDate(String gmt, String local) {
        if (gmt != null && gmt.length() >= 19 && !gmt.startsWith("0000")) return gmt.substring(0, 10) + "T" + gmt.substring(11, 19) + ".000Z";
        if (local != null && local.length() >= 19 && !local.startsWith("0000"))   // 한국 시각 → UTC
            return java.time.LocalDateTime.parse(local.substring(0, 10) + "T" + local.substring(11, 19)).minusHours(9)
                    .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")) + ".000Z";
        return "1970-01-01T00:00:00.000Z";
    }

    /** 새 주소 이름(블로그스팟이 이대로 씀 - 2026-10-20 시험): /YYYY/MM(한국 날짜)/&lt;이름&gt;.html - 글이름이 영문 · 숫자면 그대로, 한글 등이면 p&lt;글번호&gt;. */
    static String filename(Post p) {
        String slug = p.slug() == null ? "" : URLDecoder.decode(p.slug(), StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
        String name = slug.matches("[a-z0-9][a-z0-9-]{0,60}") ? slug : "p" + p.id();
        String kst = java.time.Instant.parse(p.published()).atZone(java.time.ZoneId.of("Asia/Seoul")).toString();   // 연 · 월은 한국 날짜로
        return "/" + kst.substring(0, 4) + "/" + kst.substring(5, 7) + "/" + name + ".html";
    }

    // ---------------------------------------------------------------- 쓰기

    static void write(List<Post> posts, String blogId, File outFile) throws Exception {
        Document d = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument();
        Element feed = d.createElementNS(ATOM, "feed");
        feed.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:blogger", BLOGGER);
        d.appendChild(feed);
        String blog = "tag:blogger.com,1999:blog-" + blogId;
        add(d, feed, ATOM, "id", blog);
        add(d, feed, ATOM, "title", "import");
        for (Post p : posts) {
            Element e = add(d, feed, ATOM, "entry", null);
            add(d, e, ATOM, "id", blog + ".post-" + p.id());
            add(d, e, BLOGGER, "blogger:type", "POST");
            add(d, e, BLOGGER, "blogger:status", "LIVE");
            Element au = add(d, e, ATOM, "author", null);
            add(d, au, ATOM, "name", p.author());
            add(d, au, ATOM, "uri", "");
            add(d, au, BLOGGER, "blogger:type", "BLOGGER");
            add(d, e, ATOM, "title", p.title());
            add(d, e, ATOM, "content", p.html()).setAttribute("type", "html");
            add(d, e, BLOGGER, "blogger:metaDescription", null);
            add(d, e, BLOGGER, "blogger:created", p.published());
            add(d, e, ATOM, "published", p.published());
            add(d, e, ATOM, "updated", p.updated());
            add(d, e, BLOGGER, "blogger:location", null);
            for (String l : p.labels()) {
                Element c = add(d, e, ATOM, "category", null);
                c.setAttribute("scheme", blog);
                c.setAttribute("term", l);
            }
            add(d, e, BLOGGER, "blogger:filename", filename(p));
            add(d, e, ATOM, "link", null);
            add(d, e, ATOM, "enclosure", null);
            add(d, e, BLOGGER, "blogger:trashed", null);
        }
        var t = TransformerFactory.newInstance().newTransformer();
        t.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        t.setOutputProperty(OutputKeys.INDENT, "yes");
        try (Writer w = new OutputStreamWriter(new FileOutputStream(outFile), StandardCharsets.UTF_8)) {
            t.transform(new DOMSource(d), new StreamResult(w));
        }
    }

    /** 옛 경로(디코드한 것) TAB 새 경로(예상) TAB 제목 TAB 올린 시각(UTC) - BloggerMap.java 가 실제 주소와 짝 맞춤. */
    static void writeMap(List<Post> posts, File f) throws Exception {
        try (Writer w = new OutputStreamWriter(new FileOutputStream(f), StandardCharsets.UTF_8)) {
            for (Post p : posts) {
                String path = p.link().replaceFirst("(?i)^https?://[^/]+", "");
                w.write(URLDecoder.decode(path, StandardCharsets.UTF_8) + "\t" + filename(p) + "\t" + p.title().replace('\t', ' ') + "\t" + p.published() + "\n");
            }
        }
    }

    // ---------------------------------------------------------------- DOM 도우미

    static Element add(Document d, Element parent, String ns, String name, String text) {
        Element e = d.createElementNS(ns, name);
        if (text != null) e.setTextContent(text);
        parent.appendChild(e);
        return e;
    }

    static String local(Element e) {
        return e.getLocalName() != null ? e.getLocalName() : e.getTagName();
    }

    /** 바로 아래 자식 중 이름이 같은 첫 것(ns null = 이름공간 없음). */
    static Element first(Element parent, String ns, String name) {
        for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && name.equals(local(e)) && (ns == null ? e.getNamespaceURI() == null : ns.equals(e.getNamespaceURI()))) return e;
        }
        if (ns == null && "link".equals(name)) {   // 채널 &lt;link&gt; 는 rss/channel 아래
            NodeList ch = parent.getElementsByTagName("channel");
            if (ch.getLength() > 0) return first((Element) ch.item(0), null, name);
        }
        return null;
    }

    static final Pattern IMG = Pattern.compile("(?i)<img[\\s>]");

    static String esc(String s) {
        return s.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;");
    }

    /** wp:postmeta 의 meta_key 값(없으면 null). */
    static String meta(Element it, String key) {
        for (Node n = it.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && "postmeta".equals(local(e)) && key.equals(wp(e, "meta_key"))) return wp(e, "meta_value");
        }
        return null;
    }

    /** wp:이름 - WXR 판(1.0 · 1.1 · 1.2)과 상관없이. */
    static String wp(Element it, String name) {
        for (Node n = it.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && name.equals(local(e)) && e.getNamespaceURI() != null && e.getNamespaceURI().startsWith(WP)) return text(e).trim();
        }
        return "";
    }

    static String text(Element e) {
        return e == null ? "" : e.getTextContent();
    }
}
