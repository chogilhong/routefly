package com.gh.routefly.web;

import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import jakarta.servlet.annotation.WebListener;

/** 웹앱이 내려갈 때 산악회 방 파일을 마저 쓰고(모아 쓰기), 익명 자취 쓰기를 마친 뒤 DB 연결 풀을 닫습니다(이클립스 F5 로 다시 올려도 옛 연결 · 스레드가 남지 않게). */
@WebListener
public class DbShutdown implements ServletContextListener {
    @Override
    public void contextDestroyed(ServletContextEvent e) {
        Party.STORE.shutdown();
        Clubs.STORE.shutdown();
        PartyTrack.shutdown();
        Db.close();
    }
}
