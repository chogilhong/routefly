package com.gh.routefly.web;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPOutputStream;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.WriteListener;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;

/**
 * 2026-10-09 속도 - API 응답(JSON)을 gzip 으로 줄여 보냅니다. 코스 점 · 주변 등산로 JSON 은 숫자가 많아 1/4~1/6 로 줄어,
 * 산에서 느린 통신에 효과가 큽니다. 1KB 보다 작은 응답과 gzip 을 못 받는 곳은 그대로.
 * (Cloudflare 터널은 바깥에서 따로 줄여 주지만, 집 안 · 톰캣 직접 연결은 이것으로 줄어듭니다.)
 */
@WebFilter(urlPatterns = {"/api/*"})
public class GzipFilter extends HttpFilter {

    private static final long serialVersionUID = 1L;
    static final int MIN_BYTES = 1024;

    @Override
    protected void doFilter(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws IOException, ServletException {
        res.addHeader("Vary", "Accept-Encoding");
        if (!acceptsGzip(req.getHeader("Accept-Encoding"))) {
            chain.doFilter(req, res);
            return;
        }
        Buffered w = new Buffered(res);
        chain.doFilter(req, w);
        w.finish();
    }

    /** 순수 함수 - gzip 을 받는가("gzip;q=0" 은 못 받음). */
    static boolean acceptsGzip(String acceptEncoding) {
        if (acceptEncoding == null) return false;
        for (String part : acceptEncoding.toLowerCase().split(",")) {
            String p = part.trim();
            if (p.equals("gzip") || p.startsWith("gzip;") && !p.replace(" ", "").matches("gzip;q=0(\\.0*)?")) return true;
        }
        return false;
    }

    static byte[] gzip(byte[] body) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(body.length / 4 + 64);
        try (GZIPOutputStream z = new GZIPOutputStream(out)) {
            z.write(body);
        }
        return out.toByteArray();
    }

    /** 응답을 메모리에 모았다가 끝에 한 번에 보냅니다(API JSON 은 1MB 안팎이라 괜찮음). */
    static final class Buffered extends HttpServletResponseWrapper {
        private final ByteArrayOutputStream buf = new ByteArrayOutputStream(8192);
        private ServletOutputStream stream;
        private PrintWriter writer;

        Buffered(HttpServletResponse res) {
            super(res);
        }

        @Override
        public ServletOutputStream getOutputStream() {
            if (stream == null) {
                stream = new ServletOutputStream() {
                    @Override
                    public void write(int b) {
                        buf.write(b);
                    }

                    @Override
                    public void write(byte[] b, int off, int len) {
                        buf.write(b, off, len);
                    }

                    @Override
                    public boolean isReady() {
                        return true;
                    }

                    @Override
                    public void setWriteListener(WriteListener l) {
                        // 모아 두기만 합니다
                    }
                };
            }
            return stream;
        }

        @Override
        public PrintWriter getWriter() {
            if (writer == null) {
                String cs = getCharacterEncoding();
                writer = new PrintWriter(new OutputStreamWriter(getOutputStream(), cs == null ? StandardCharsets.UTF_8 : Charset.forName(cs)));
            }
            return writer;
        }

        @Override
        public void setContentLength(int len) {
            // 줄인 뒤 길이가 달라지므로 무시합니다
        }

        @Override
        public void setContentLengthLong(long len) {
            // 위와 같음
        }

        @Override
        public void flushBuffer() {
            // 끝에 한 번에 보냅니다
        }

        void finish() throws IOException {
            if (writer != null) writer.flush();
            byte[] body = buf.toByteArray();
            HttpServletResponse res = (HttpServletResponse) getResponse();
            if (res.getStatus() == HttpServletResponse.SC_NOT_MODIFIED) {   // 304(ETag 같음) - 본문 없이
                res.flushBuffer();
                return;
            }
            if (body.length >= MIN_BYTES) {
                body = gzip(body);
                res.setHeader("Content-Encoding", "gzip");
            }
            res.setContentLength(body.length);
            res.getOutputStream().write(body);
            res.flushBuffer();
        }
    }
}
