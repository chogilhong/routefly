package com.gh.routefly.web;

import jakarta.servlet.ServletContextEvent;
import jakarta.servlet.ServletContextListener;
import jakarta.servlet.annotation.WebListener;

/** 웹앱이 내려갈 때 DB 연결 풀을 닫습니다(이클립스 F5 로 다시 올려도 옛 연결이 남지 않게). */
@WebListener
public class DbShutdown implements ServletContextListener {
    @Override
    public void contextDestroyed(ServletContextEvent e) {
        Db.close();
    }
}
