# routefly 를 AWS Lightsail 에 올리기

집 PC + Cloudflare 터널(주소가 켤 때마다 바뀜) 대신, 바뀌지 않는 주소(예: `https://routefly.kr/routefly/`)로 띄우는 순서입니다.
구성: Ubuntu 24.04 · Java 21 · 톰캣 11 · MariaDB · Nginx(HTTPS, Let's Encrypt) + routefly-batch 상주 실행(9장). 앞에 Cloudflare 를 둘지는 8장에서 고릅니다.

- `routefly.kr` · `<고정 IP>` · `<키.pem>` 은 예시입니다. 실제 값으로 바꿔 씁니다.
- 비밀번호 · 지도 키 · `.pem` 파일은 이 저장소에 넣지 않습니다.
- 요금 · 톰캣 판 번호는 바뀌므로 만들 때 화면과 tomcat.apache.org 에서 확인합니다.

## 0. 미리 정할 것

| 항목 | 고를 것 | 이유 |
|---|---|---|
| 지역 | 서울(ap-northeast-2) | 국내 사용자에게 가장 빠름 |
| OS | Linux/Unix → OS Only → Ubuntu 24.04 LTS | 자료가 가장 많음 |
| 요금제 | 4GB(IPv4 포함, 2026-10 기준 월 24달러 안팎 · 80GB SSD) | 배치 `-Xmx1g` + 톰캣 `-Xmx768m` 만 1.8GB 에 MariaDB · 리눅스가 더해짐. 웹만 올리면 2GB(월 12달러)로 충분 |
| 도메인 | 예: `routefly.kr` | HTTPS 인증서 · 앱의 `server.url` 에 필요 |

서버를 꺼 둬도(stopped) 요금은 그대로 나갑니다.

## 1. 인스턴스 만들기 (Lightsail 콘솔)

1. lightsail.aws.amazon.com → Create instance
2. 지역 Seoul → Linux/Unix → OS Only → Ubuntu 24.04 LTS
3. 요금제 4GB → 이름 `routefly` → Create
4. Networking 탭 → Create static IP → 인스턴스에 붙이기(안 붙이면 다시 켤 때 IP 가 바뀜)
5. Networking → IPv4 Firewall: SSH(22) · HTTP(80) 는 기본으로 열려 있음, HTTPS(443) 추가. 8080 · 3306 은 열지 않습니다.

## 2. 도메인 연결

도메인 업체(가비아 등) DNS 에 A 레코드:

```
routefly.kr      A    <고정 IP>     (가비아 화면의 호스트 이름은 비움 또는 @)
www.routefly.kr  A    <고정 IP>     (호스트 이름 www)
```

진짜 주소는 `routefly.kr` 하나로 정합니다. `www.routefly.kr` 로 들어와도 6-1 의 www 칸이 `https://routefly.kr` 로 넘깁니다
(같은 화면이 두 주소로 보이면 검색 엔진이 둘로 나눠 셈 - 2026-10-18 홍TV님 도메인 구매 때).

Cloudflare 를 쓸 거라면 8-2 의 순서대로 처음부터 Cloudflare DNS 에 넣어도 됩니다.

## 3. 접속과 기본 준비

콘솔의 Connect using SSH(브라우저 창), 또는 Account → SSH keys 에서 키를 받아 PowerShell 로:

```
ssh -i <키.pem> ubuntu@<고정 IP>
```

```bash
sudo apt update && sudo apt -y upgrade
sudo timedatectl set-timezone Asia/Seoul

# 메모리 여유용 스왑 2GB
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 4. Java 21 · MariaDB

```bash
sudo apt -y install openjdk-21-jdk-headless mariadb-server
sudo mysql_secure_installation          # root 비밀번호, 익명 사용자 · 원격 root · test DB 지우기 모두 Y

sudo mariadb
```

```sql
CREATE DATABASE routefly CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- 웹은 읽기만 합니다(config.properties.example) - SELECT 만
CREATE USER 'routefly_web'@'localhost' IDENTIFIED BY '<새 비밀번호>';
GRANT SELECT ON routefly.* TO 'routefly_web'@'localhost';
-- 배치(9장)용 - 코스를 넣고 지우므로 쓰기 권한까지. 표 만들기 · 고치기(DDL)는 배치가 하지 않으므로 주지 않습니다
-- (2026-10-11 오픈 전 점검: 배치가 잘못되거나 뚫려도 표를 DROP 할 수 없게. 표는 9-4 처럼 관리자로)
CREATE USER 'routefly_batch'@'localhost' IDENTIFIED BY '<다른 새 비밀번호>';
GRANT SELECT, INSERT, UPDATE, DELETE ON routefly.* TO 'routefly_batch'@'localhost';
-- 웹 계정은 쿼리 하나가 5초를 넘으면 DB 가 끊음(무거운 요청이 연결을 오래 묶지 않게)
ALTER USER 'routefly_web'@'localhost' WITH MAX_STATEMENT_TIME 5;
EXIT;
```

PC 의 DB 를 옮깁니다(PC 의 덤프 프로그램은 PATH 에 없음 - `C:\Program Files\MariaDB 12.3\bin\`, MariaDB 판이 바뀌면 폴더 이름도 바뀜):

```
(PC)     & "C:\Program Files\MariaDB 12.3\bin\mariadb-dump.exe" -u root -p --single-transaction --result-file=routefly.sql routefly   # PowerShell 의 > 는 UTF-16 으로 써서 서버가 못 읽음
(PC)     scp -i <키.pem> routefly.sql ubuntu@<고정 IP>:~
(서버)   sudo mariadb routefly < ~/routefly.sql && rm ~/routefly.sql
```

MariaDB 메모리 상한(innodb_buffer_pool_size)도 이때 정합니다 - 11-2.

PC 에서 DB 를 볼 때(DBeaver, 2026-10-19 홍TV님 연결 확인) - 3306 은 열지 않고 SSH 터널로:

```sql
-- 서버에서 sudo mariadb (DB root 는 unix_socket - 리눅스 root 만 들어옴, 비밀번호 없음)
CREATE USER 'routefly_view'@'localhost' IDENTIFIED BY '<새 비밀번호>';
GRANT SELECT ON routefly.* TO 'routefly_view'@'localhost';    -- 보기만. 고치기 · 지우기는 서버에서 sudo mariadb
```

| DBeaver 탭 | 값 |
|---|---|
| SSH | Host `routefly.kr` · 22 · User `ubuntu` · Authentication `Public Key`(.pem, .ppk 아님) |
| Main | Host `localhost`(서버 안에서 본 주소) · 3306 · Database `routefly` · `routefly_view` |

붙은 뒤 `SELECT @@hostname;` 이 `ip-172-26-...` 이면 서버입니다(SSH 터널 체크가 빠지면 같은 localhost 가 PC DB 로 붙음).

## 5. 톰캣 11

Ubuntu 저장소에는 톰캣 11 이 없어 Apache 에서 받습니다. `11.0.X` 는 tomcat.apache.org 의 최신 번호로.

```bash
sudo useradd -r -m -d /opt/tomcat -s /bin/false tomcat
cd /tmp && wget https://dlcdn.apache.org/tomcat/tomcat-11/v11.0.X/bin/apache-tomcat-11.0.X.tar.gz
sudo tar xzf apache-tomcat-11.0.X.tar.gz -C /opt/tomcat --strip-components=1
sudo rm -rf /opt/tomcat/webapps/{ROOT,docs,examples,manager,host-manager}   # 기본 예제 · 관리 화면은 지움
# 톰캣 프로그램 · 설정은 root 것(뚫려도 server.xml · 프로그램을 못 고치게), 톰캣은 쓰는 곳만 - 2026-10-11 오픈 전 점검
sudo chown -R root:tomcat /opt/tomcat && sudo chmod -R g+rX,o-rwx /opt/tomcat
sudo chown -R tomcat: /opt/tomcat/{logs,temp,work,webapps}
sudo mkdir -p /opt/tomcat/conf/Catalina/localhost && sudo chown -R tomcat: /opt/tomcat/conf/Catalina   # 톰캣이 처음에 만드는 곳
```

톰캣은 127.0.0.1 에서만 받게 합니다(밖에서는 Nginx 로만). `/opt/tomcat/conf/server.xml` 의 8080 Connector 에 `address="127.0.0.1"` 를 넣습니다:

```xml
<Connector port="8080" address="127.0.0.1" protocol="HTTP/1.1"
           connectionTimeout="20000" redirectPort="8443" />
```

같은 파일의 `<Host name="localhost" ...>` 안에 오류 화면이 톰캣 판 번호 · 오류 내용을 보이지 않게 넣습니다(2026-10-11 오픈 전 점검 - 없는 주소 404 에 "Apache Tomcat/11.0.x" 가 보였음):

```xml
<Valve className="org.apache.catalina.valves.ErrorReportValve" showReport="false" showServerInfo="false" />
```

같은 `<Host>` 안의 접속 기록(AccessLogValve)은 주소의 ?뒤를 빼고(`%U`) 30일만 둡니다 - 개인정보처리방침(privacy.html) "접속 기록" 과 맞춤:

```xml
<Valve className="org.apache.catalina.valves.AccessLogValve" directory="logs" prefix="localhost_access_log" suffix=".txt"
       pattern="%h %t &quot;%m %U&quot; %s %b" maxDays="30" />
```

`/etc/systemd/system/tomcat.service`:

```ini
[Unit]
Description=Tomcat 11 (routefly)
After=network.target mariadb.service

[Service]
Type=forking
User=tomcat
Environment=JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
Environment=CATALINA_HOME=/opt/tomcat
Environment="CATALINA_OPTS=-Xms256m -Xmx768m -Duser.timezone=Asia/Seoul -Dfile.encoding=UTF-8 -Droutefly.config=/opt/routefly/config.properties"
ExecStart=/opt/tomcat/bin/startup.sh
ExecStop=/opt/tomcat/bin/shutdown.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now tomcat
```

설정 파일은 `src/main/resources/config.properties.example` 을 바탕으로 만듭니다:

```bash
sudo mkdir -p /opt/routefly
sudo nano /opt/routefly/config.properties
#   db.url=jdbc:mariadb://127.0.0.1:3306/routefly
#   db.user=routefly_web / db.password=...
#   map.vworld.key=...            (V-World 사이트에 routefly.kr 을 서비스 주소로 추가해야 동작)
#   map.dem.url=                  (비우면 기본값)
#   site.baseUrl=https://routefly.kr/routefly
sudo chown tomcat: /opt/routefly/config.properties && sudo chmod 600 /opt/routefly/config.properties
```

PC 경로 설정 두 개는 서버 경로로 바꿔 넣습니다(2026-10-19 - 처음 옮길 때 빠졌던 것):

```bash
# 주차장 CSV(공공데이터 원본 - 저장소에 넣지 않음). PC 에서 먼저:  scp -i <키.pem> <PC 설정의 parking.csv 경로> ubuntu@routefly.kr:~/parking.csv
sudo mkdir -p /opt/routefly/data /opt/routefly/stats
sudo install -o tomcat -g tomcat -m 640 ~/parking.csv /opt/routefly/data/parking.csv && rm ~/parking.csv
# 운영 통계 파일 폴더(비우면 /opt/tomcat/routefly-stats - 톰캣을 새로 깔면 사라지므로 밖에 둠)
sudo chown tomcat: /opt/routefly/stats && sudo chmod 750 /opt/routefly/stats
# 이미 있는지 먼저 본 뒤(0 이어야 함) 덧붙임 - 같은 키가 두 줄이 되지 않게
sudo grep -cE '^(parking\.csv|stats\.dir)=' /opt/routefly/config.properties
echo 'parking.csv=/opt/routefly/data/parking.csv' | sudo tee -a /opt/routefly/config.properties
echo 'stats.dir=/opt/routefly/stats' | sudo tee -a /opt/routefly/config.properties
sudo systemctl restart tomcat
```

확인: `https://routefly.kr/routefly/api/parking?lat=35.33&lon=127.73` 이 `"unavailable":true` 가 아니고 lots 가 나오면 됨
(로그 `[PARKING] … 곳 읽음`). 통계는 10분 뒤 `sudo ls -l /opt/routefly/stats/` 에 stats.json.

## 6. Nginx + HTTPS

```bash
sudo apt -y install nginx certbot python3-certbot-nginx
sudo rm /etc/nginx/sites-enabled/default
```

`/etc/nginx/conf.d/routefly-common.conf` (2026-10-11 오픈 전 점검):

```nginx
server_tokens off;            # 응답에 nginx 판 번호를 넣지 않음
# js · css 를 압축해서 보냄 - 지도 프로그램(maplibre-gl.js) 1,057KB → 275KB 등, 첫 방문이 약 1.4MB → 0.4MB.
# /api 는 톰캣(GzipFilter)이 이미 압축하므로 nginx 는 그대로 넘깁니다(두 번 압축하지 않음)
# gzip on 은 Ubuntu 기본 /etc/nginx/nginx.conf 에 이미 있어 여기 다시 쓰면 "duplicate" 로 nginx -t 실패(2026-10-19 서버)
gzip_proxied any;
gzip_min_length 1024;
gzip_types application/javascript text/javascript text/css image/svg+xml application/manifest+json;
gzip_vary on;
# 접속 기록에는 주소의 ?뒤(코스 검색어 · 지도 범위 - "내 주변 코스" 는 내 둘레 약 1km 칸)를 남기지 않음 - 개인정보처리방침(privacy.html)과 맞춤.
# 기록은 logrotate 기본(14일)으로 지워짐
log_format routefly_noargs '$remote_addr - [$time_local] "$request_method $uri" $status $body_bytes_sent "$http_user_agent"';
access_log /var/log/nginx/access.log routefly_noargs;
```

Ubuntu 기본 `/etc/nginx/nginx.conf` 의 `access_log /var/log/nginx/access.log;` 는 ?뒤까지 남기므로 끕니다(두 줄이면 같은 파일에 둘 다 씀):

```bash
sudo sed -i 's|^\(\s*\)access_log /var/log/nginx/access.log;|\1# access_log /var/log/nginx/access.log;   # routefly-common.conf 의 ?뒤 없는 기록을 씀|' /etc/nginx/nginx.conf
```

`/etc/nginx/sites-available/routefly` 에 아래 6-1 또는 6-2 중 하나를 넣고:

```bash
sudo ln -s /etc/nginx/sites-available/routefly /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d routefly.kr -d www.routefly.kr   # 이메일 입력, HTTP → HTTPS 넘기기. 인증서 하나에 두 이름. 갱신은 자동(certbot.timer)
```

### 왜 머리글을 이렇게 넘기나 (SecurityFilter)

`SecurityFilter.clientIp` 는 바로 앞이 127.0.0.1(이 서버의 Nginx)일 때만 전달 머리글을 믿고,
`CF-Connecting-IP` 가 있으면 그것을, 없으면 `X-Forwarded-For` 의 맨 뒤 값을 요청한 곳으로 봅니다. `/api` · `/s` 의 분당 횟수 제한이 이 값으로 셉니다.

- `X-Forwarded-For` 를 넘기지 않으면 모든 사용자가 127.0.0.1 한 사람이 되어, 분당 120번 남짓을 전체가 나눠 쓰게 됩니다(사람이 조금만 늘어도 429).
- Nginx 는 요청에 들어온 머리글을 그대로 넘기므로, Cloudflare 를 안 쓰는데 `CF-Connecting-IP` 를 지우지 않으면 누구나 그 값을 꾸며 넣어 제한을 피할 수 있습니다.
- `ShareServlet` 은 `X-Forwarded-Proto` 로 https 여부를 봅니다.

### 6-1. Cloudflare 없이 (처음엔 이것)

```nginx
# www 로 들어오면 routefly.kr 로(주소 하나로 - 2장). certbot 이 이 칸에도 443 을 붙임
server {
    listen 80;
    server_name www.routefly.kr;
    return 301 https://routefly.kr$request_uri;
}

server {
    listen 80;
    server_name routefly.kr;

    location = / { return 302 /routefly/; }
    # 검색 엔진용(산 소개 페이지 /routefly/m/… - 2026-10-14 SitemapServlet). 사이트 뿌리에 있어야 해서 앱으로 넘김
    # 검색 사이트 소유 확인 파일(네이버 naver….html · 구글 google….html, 2026-10-19) - 받은 파일 그대로 /var/www/site-verify 에(6-3)
    location ~ ^/(naver|google)[0-9a-f]+\.html$ { root /var/www/site-verify; }
    location = /robots.txt  { proxy_pass http://127.0.0.1:8080/routefly/robots.txt;  proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
    location = /sitemap.xml { proxy_pass http://127.0.0.1:8080/routefly/sitemap.xml; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # 맨 뒤 = 실제로 접속한 IP
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header CF-Connecting-IP "";                          # 밖에서 꾸며 넣은 값을 지움
        client_max_body_size 2m;
    }
}
```

certbot 이 위 파일에 `listen 443 ssl` 을 붙인 뒤, 그 443 server 블록 안에 한 줄 더 넣습니다(HTTPS 만 쓰라고 브라우저에 알림 - 톰캣은 Nginx 뒤라 https 인지 몰라 HSTS 를 못 붙임):

```nginx
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### 6-2. Cloudflare 를 앞에 둘 때

```nginx
# Cloudflare 대역에서 온 요청만 받음 - 서버 IP 로 바로 오는 우회 요청(꾸민 CF-Connecting-IP)을 막음
include /etc/nginx/cloudflare-allow.conf;
deny all;

server {
    listen 80;
    server_name routefly.kr;

    location = / { return 302 /routefly/; }
    # 검색 엔진용(산 소개 페이지 /routefly/m/… - 2026-10-14 SitemapServlet). 사이트 뿌리에 있어야 해서 앱으로 넘김
    # 검색 사이트 소유 확인 파일(네이버 naver….html · 구글 google….html, 2026-10-19) - 받은 파일 그대로 /var/www/site-verify 에(6-3)
    location ~ ^/(naver|google)[0-9a-f]+\.html$ { root /var/www/site-verify; }
    location = /robots.txt  { proxy_pass http://127.0.0.1:8080/routefly/robots.txt;  proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
    location = /sitemap.xml { proxy_pass http://127.0.0.1:8080/routefly/sitemap.xml; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # 맨 뒤는 Cloudflare 서버 IP
        proxy_set_header X-Forwarded-Proto $scheme;
        # CF-Connecting-IP 는 지우지 않음 - Cloudflare 가 넣은 진짜 사용자 IP(SecurityFilter 가 먼저 씀)
        client_max_body_size 2m;
    }
}
```

`allow`/`deny` 를 `http` 단계(파일 맨 위)에 두면 이 사이트 전체에 걸립니다. `/etc/nginx/cloudflare-allow.conf` 는 Cloudflare 가 공개하는 대역으로 만듭니다(대역이 바뀌면 다시):

```bash
{ for ip in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do echo "allow $ip;"; done; } \
  | sudo tee /etc/nginx/cloudflare-allow.conf
sudo nginx -t && sudo systemctl reload nginx
```

`deny all` 뒤에는 Let's Encrypt 가 서버에 바로 확인하러 올 수 없어 certbot 자동 갱신이 실패할 수 있습니다.
그래서 6-2 로 바꿀 때는 Cloudflare 의 Origin Certificate(대시보드 SSL/TLS → Origin Server → Create Certificate, 최대 15년)를 받아
Nginx 의 `ssl_certificate` · `ssl_certificate_key` 를 그 파일로 바꾸고 certbot 은 지웁니다(`sudo apt remove certbot`).
Origin Certificate 는 Cloudflare 만 믿는 인증서라 Cloudflare 를 빼면 다시 6-1 + certbot 으로 돌아가야 합니다.

### 6-3. 검색 등록 - 소유 확인 파일 (2026-10-19)

네이버 서치어드바이저 · 구글 서치 콘솔은 `https://routefly.kr` 을 확인합니다. 첫 화면이 `/routefly/` 로 넘어가(302) 메타 태그 방식은 못 믿으므로
그들이 주는 HTML 확인 파일을 사이트 뿌리에 그대로 둡니다(앱 · 톰캣은 건드리지 않음 - 위 nginx 의 `location ~ ^/(naver|google)…`).

```
(PC)    검색 사이트에서 확인 파일 내려받기 → MobaXterm 왼쪽 SFTP 창(ubuntu 집)에 끌어 놓기
```

```bash
sudo mkdir -p /var/www/site-verify
sudo install -m 644 ~/naver*.html /var/www/site-verify/ && rm ~/naver*.html      # 구글이면 google*.html
sudo nano /etc/nginx/sites-available/routefly     # 처음 한 번: location = /robots.txt 줄 바로 위에 위의 location ~ 줄 넣기
sudo nginx -t && sudo systemctl reload nginx
curl -s https://routefly.kr/$(ls /var/www/site-verify | head -1)                   # 받은 파일 내용이 그대로 나오면 됨
```

그다음 검색 사이트에서 [소유확인] → 사이트맵 제출 `https://routefly.kr/sitemap.xml`(산 소개 페이지 등 200여 개, SitemapServlet).
확인 파일은 지우지 않습니다(검색 사이트가 가끔 다시 확인함).

## 7. 배포 (버전업할 때마다)

```
(PC)     powershell -NoProfile -ExecutionPolicy Bypass -File .claude\build-war.ps1   # Maven 없이 javac + jar(2026-10-19)
         → target\routefly.war   (이클립스 Run As → Maven build... → package 나 Export → WAR file 도 같은 것)
(PC)     scp -i <키.pem> target\routefly.war ubuntu@<고정 IP>:~
(서버)   sudo install -o tomcat -g tomcat -m 644 ~/routefly.war /opt/tomcat/webapps/routefly.war
```

scp 대신 FileZilla(SFTP)로 올려도 됩니다(2026-10-19 홍TV님 접속 확인): 프로토콜 SFTP · 호스트 routefly.kr · 포트 22 · 사용자 ubuntu · 로그온 유형 "키 파일"(.pem → FileZilla 가 .ppk 로 바꿈, 저장소 밖에 둠).
열리는 곳은 /home/ubuntu(~) - 여기에 올린 뒤 위 `sudo install` 줄로 옮깁니다. /opt/routefly · /var/backups/routefly 처럼 다른 계정 폴더는 FileZilla 로 바로 못 쓰니
받을 때도 `sudo cp <파일> ~/ && sudo chown ubuntu: ~/<파일>` 로 먼저 홈에 꺼냅니다(다 받으면 ~ 의 사본은 지움). FTP 서버(vsftpd 등)는 깔지 않습니다(비밀번호가 암호 없이 오감).

톰캣이 알아서 풀어 다시 띄웁니다(몇 초). 확인:

- `https://routefly.kr/routefly/` · `https://routefly.kr/routefly/hike.html`
- 로그: `sudo tail -f /opt/tomcat/logs/catalina.out`
- 화면은 열려 있던 사람에게 '새 버전이 있습니다 · 누르면 새로 고침' 띠가 뜹니다.

앱은 한 번만 주소를 바꿔 다시 빌드합니다(app/README.md):

```
npm run url -- https://routefly.kr/routefly/hike.html
```

그 뒤로는 서버 배포만으로 앱 화면도 바뀝니다(스토어 다시 올릴 필요 없음 - `app/` 쪽을 고칠 때만).

## 8. Cloudflare (CDN) - 지금은 없어도 됨

### 8-1. 효과가 적은 이유

| 자료 | 어디서 오나 | CDN 효과 |
|---|---|---|
| 배경 지도 타일 | V-World · OpenStreetMap | 없음(남의 서버) |
| 3D 지형 타일 | `map.dem.url` (AWS S3 elevation-tiles-prod) | 없음(남의 서버) |
| html · js · css | Lightsail | 없음 - `NoStaleFilter` 가 no-cache 로 보내 CDN 도 담지 않음 |
| vendor · img | Lightsail | 조금(전체 webapp 이 1.7MB 남짓) |
| `/api` · `/s` | Lightsail | 없음(DB 결과) |
| 앱 셸 | 폰의 서비스워커(`sw.js`) | 이미 폰에 있음 |

무거운 지도 타일이 우리 서버를 거치지 않아 요금제의 전송량(4GB 요금제 4TB)을 넘기기 어렵습니다.
붙이는 까닭은 속도보다 보호(서버 IP 숨김 · 디도스 막기)입니다. 사용자가 늘거나 스토어에 올릴 때 붙입니다.

### 8-2. 붙이는 순서

1. Cloudflare 에 `routefly.kr` 추가 → 도메인 업체에서 네임서버를 Cloudflare 것으로 바꿈
2. DNS: `routefly.kr  A  <고정 IP>` 를 주황 구름(Proxied) 으로
   `www.routefly.kr  A  <고정 IP>` 도 같게(Proxied) - Nginx 6-2 에도 6-1 의 www 칸(→ https://routefly.kr)을 함께 넣습니다.
3. SSL/TLS → Full (strict) (서버의 certbot 인증서를 그대로 씀)
4. 서버 Nginx 를 6-2 로 바꿈(Cloudflare 대역만 받기 + `CF-Connecting-IP` 지우는 줄 빼기). 4 를 빼먹으면 서버 IP 로 바로 와서 `CF-Connecting-IP` 를 꾸며 넣어 횟수 제한을 피할 수 있습니다.
5. 캐시 규칙은 기본값 그대로(no-cache 인 html · js · css 와 확장자 없는 `/api` 는 담지 않음)

## 9. routefly-batch 도 서버에서 돌리기

배치도 서버로 옮겨 PC 를 꺼도 코스가 갱신되게 합니다(2026-10-11 홍TV님 결정). 배치는 같은 서버의 MariaDB 에 바로 넣습니다.
PC 는 배치 개발 · 테스트 실행(`bin\run-dev.ps1`)과 jar 빌드(`bin\build.ps1`)만 하고, PC 의 작업 스케줄러 실행은 끕니다.

순서(2026-10-19 홍TV님 결정 - 코스의 원본은 서버 하나):

1. PC → 서버: 지금까지 PC 배치가 만든 코스 표를 서버로 한 번 옮김(9-5 의 명령 그대로, 이번 한 번만)
2. 서버 배치: 9-1 ~ 9-4 - 1시간마다 `--once`(systemd 타이머)
3. 서버 → PC: PC 작업 스케줄러는 배치 대신 서버 표를 받아 오기만(9-6). PC 에서는 배치를 정기로 돌리지 않음

1 ~ 3 은 V-World 운영키를 받은 날 한꺼번에 합니다(2026-10-19 홍TV님). 지금 키는 PC(localhost)용이라 서버에서 지명을 못 받으면
이름이 덜 붙은 코스가 lastrun 을 남겨 주기(7 ~ 30일) 동안 다시 돌지 않기 때문입니다. 그때까지 PC 배치는 그대로 돌고, 서버 화면은 배포 때 옮긴 자료입니다
(10-19 route_course PC · 서버 모두 26683).

저장소에 리눅스용 상주 실행 스크립트(`bin/routefly-batch.sh` · `bin/.setenv.sh`, 설치 자리 `/app/routefly/batch`)가 이미 있습니다.
`data` · `cache` · `logs` 는 설정을 비워 두면 모두 그 아래(`<FXMS_HOME>/data/...`)를 씁니다.

### 9-1. 서버에 놓을 모양

```
/app/routefly/batch/
  bin/routefly-batch.sh, bin/.setenv.sh
  deploy/lib/*.jar          PC 의 bin\build.ps1 결과(routefly-batch.jar + mariadb + fxms + jdom)
  deploy/conf/              fxms.xml · classes.xml · sql/ · trailheads.txt + 서버용 batch.properties · databases.xml
  data/                     courses · forest · knps · komount · durunubi · osm (PC 에서 받은 원본 자료)
  cache/                    osm · dem (올리면 Overpass · DEM 을 처음부터 다시 받지 않음)
  logs/                     배치가 만듦
```

fxms jar 는 저장소에 없으므로 PC 의 `deploy\lib` 에서만 가져옵니다. jar 는 윈도우 · 리눅스 구분이 없습니다.
올리기 전에 PC 의 `data` · `cache` 폴더 크기를 봅니다(4GB 요금제 디스크 80GB).

### 9-2. 처음 한 번

`/app/routefly` 는 routefly 의 집 폴더라 권한이 700 입니다(useradd -m). ubuntu 는 그 안에 들어가지 못하므로
올린 묶음은 ubuntu 집(`~`)에 두고, 서버 쪽 명령은 모두 sudo 로 합니다(2026-10-19 서버에서 확인 - "올리는 동안만 ubuntu 소유" 는 안 통함).

```bash
sudo useradd -r -m -d /app/routefly -s /bin/false routefly
sudo mkdir -p /app/routefly/batch
sudo locale-gen ko_KR.UTF-8                                                     # 스크립트의 LANG=ko_KR.UTF-8
```

```
(PC)  bin\build.ps1 로 jar 만들기
(PC)  tar -czf batch.tgz bin deploy data cache                                  # 프로젝트 폴더에서(윈도우 tar)
(PC)  scp -i <키.pem> batch.tgz ubuntu@<고정 IP>:~
```

```bash
sudo tar -xzf ~/batch.tgz -C /app/routefly/batch && rm ~/batch.tgz
sudo sed -i 's/\r$//' /app/routefly/batch/bin/*.sh /app/routefly/batch/bin/.setenv.sh   # 윈도우 줄끝(CRLF)이면 bash 가 못 읽음
sudo nano /app/routefly/batch/deploy/conf/batch.properties     # 서버용으로 새로(아래)
sudo nano /app/routefly/batch/deploy/conf/databases.xml        # url jdbc:mariadb://127.0.0.1:3306/routefly, routefly_batch 계정
# 프로그램(bin · jar · 쿼리 XML)은 root 것 - 배치가 받은 자료를 읽다 뚫려도 자기 프로그램을 고쳐 남지 못하게(2026-10-11 오픈 전 점검)
sudo bash -c 'cd /app/routefly/batch && chown -R routefly: . \
  && chown -R root:routefly bin deploy/lib deploy/conf/sql && chmod -R g+rX,o-rwx bin deploy/lib deploy/conf/sql \
  && chmod 750 bin/routefly-batch.sh \
  && chown root:routefly deploy/conf/batch.properties deploy/conf/databases.xml \
  && chmod 640 deploy/conf/batch.properties deploy/conf/databases.xml'     # routefly 는 설정을 읽기만
```

서버용 `batch.properties` 는 `batch.properties.example` 을 바탕으로 만들고 이것만 다르게 둡니다.

- `*.dir` · `osm.cacheDir` 는 비움(PC 의 `C:\...` 경로를 그대로 가져오면 안 됨)
- `vworld.domain` 은 새 도메인, V-World 사이트에도 그 도메인을 등록
- 키(`forest.serviceKey` · `durunubi.serviceKey` · `vworld.key`)는 PC 값과 같음

### 9-3. 하나씩 시험한 뒤 상주로

```bash
sudo bash -c 'cd /app/routefly/batch && sudo -u routefly bin/routefly-batch.sh --once=courseImport; echo "끝 코드 $?"'
sudo bash -c 'cd /app/routefly/batch && sudo -u routefly bin/routefly-batch.sh --once=knpsSign; echo "끝 코드 $?"'   # DB 계정 확인(넣음 3216)
sudo ls -lt /app/routefly/batch/logs/batch/
sudo tail -n 50 /app/routefly/batch/logs/batch/knpssign.log
```

- 로그 이름은 배치 이름의 소문자입니다: `logs/batch/<소문자 이름>.log`(courseimport.log · knpssign.log), 지난 날은 `<소문자 이름>.YYYYMMDD.log`,
  타이머 회차 전체는 `routefly-batch.log`, 주기 기록은 `<이름>.lastrun`(courseImport.lastrun - 이쪽은 대소문자 그대로).
- 2026-10-19 서버 확인: courseImport 끝 코드 0("data/courses 에 .gpx 파일이 없습니다" - PC 도 README 뿐이라 정상),
  knpsSign 끝 코드 0("넣음 3216" - PC 10-11 회차와 같음).
- 실행 첫머리의 `DBManager.initSqlPoolCommon FILE-PATH(.../deploy/conf/sql/queries.xml) NOT FOUND` 는 무해합니다.
  fxms 가 공용 쿼리 파일을 찾아보는 것이고, routefly-batch 는 그 파일을 쓰지 않습니다(쿼리는 `sql/course/CourseBatch.xml` - `CourseQid.QUERY_XML_FILE`). PC 에도 그 파일은 없습니다.
- fxms 의 `project:routefly_batch.xml · service:courseImport.xml not found` 안내도 PC 와 같고 무해합니다.

상주 실행(인자 없이 `routefly-batch.sh`) 대신 PC 작업 스케줄러와 같은 "1시간마다 `--once`" 를 systemd 타이머로 돌립니다(2026-10-19).
상주 실행(`BatchDaemon`)은 켜는 순간 배치 9개를 한꺼번에 함께 돌리고(첫 대기 0, 배치마다 스레드), 지난 실행 시각(`logs/batch/*.lastrun`)을
보지 않아 다시 켤 때마다 30일짜리 osmBike · knps 까지 처음부터 돕니다 - CPU 를 오래 다 써 웹이 느려지고 Overpass 호출도 늘어납니다.
`--once` 는 배치마다 주기(lastrun)를 지키며 하나씩 차례로 돌고, 앞 회차가 아직 돌면 systemd 가 새 회차를 시작하지 않습니다.

```bash
sudo tee /etc/systemd/system/routefly-batch.service >/dev/null <<'UNIT'
[Unit]
Description=routefly-batch (--once, 배치마다 주기는 lastrun 이 지킴)
After=network-online.target mariadb.service
Wants=network-online.target

[Service]
Type=oneshot
User=routefly
WorkingDirectory=/app/routefly/batch
ExecStart=/app/routefly/batch/bin/routefly-batch.sh --once
# 2026-10-11 오픈 전 점검: 권한을 더 얻지 못하게 · /usr /boot /etc 는 읽기만 · 집 폴더 · /tmp 는 따로, 새 파일은 남이 못 읽게
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
UMask=0027
UNIT

sudo tee /etc/systemd/system/routefly-batch.timer >/dev/null <<'UNIT'
[Unit]
Description=routefly-batch 1시간마다

[Timer]
OnCalendar=*-*-* *:07:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now routefly-batch.timer
systemctl list-timers routefly-batch.timer       # 다음 실행 시각
sudo systemctl start routefly-batch.service      # 첫 회차를 바로 - 서버에는 lastrun 이 없어 모든 배치가 돌아 몇 시간 걸림(밤에)
journalctl -u routefly-batch -f                  # 진행 보기(배치별은 sudo tail -f .../logs/batch/<소문자 이름>.log)
```

- 첫 회차는 lastrun 이 없는 배치가 모두 "주기가 지났다" 로 보고 돕니다 - PC 의 lastrun 파일은 올리지 않습니다(올리면 건너뜀).
  위에서 손으로 돌린 courseImport · knpsSign 은 lastrun 이 생겨 주기(1시간 · 30일) 전이면 건너뜁니다(정상).
  courseImport · komount · durunubi · knps* 는 `data/` 의 파일을 읽으므로 9-2 에서 `data` 를 꼭 올립니다.
- 서버가 한 바퀴 잘 돌면 PC 작업 스케줄러의 routefly-batch 작업을 "사용 안 함" 으로 바꾸고, 9-6 의 받아 오기 작업을 만듭니다(두 곳에서 같이 돌리지 않음).

### 9-4. 배치를 고쳤을 때

```
(PC)     bin\build.ps1
(PC)     scp -i <키.pem> deploy\lib\routefly-batch.jar ubuntu@<고정 IP>:~
(서버)   sudo install -o root -g routefly -m 640 ~/routefly-batch.jar /app/routefly/batch/deploy/lib/   # 9-2 처럼 프로그램은 root 것
         (restart 없음 - 다음 회차가 새 jar 로 돎. 도는 중에 바꾸면 그 회차는 끝까지 예전 jar)
```

쿼리 XML(`deploy/conf/sql`)이나 표(`sql/route_ddl.sql`)가 바뀐 경우에는 그것도 함께 올리고, 표는 서버 DB 에서 실행합니다.
새로 받은 원본 자료(`data/` 아래 ZIP · CSV · GPX)도 서버의 같은 자리에 올립니다.

### 9-5. 다른 길 - 배치는 PC 에서, 서버에는 표만 옮기기 (2026-10-16)

9장의 기본은 "배치도 서버에서" 입니다. 서버 메모리 · CPU 가 빠듯하면(11장) 배치는 PC 에서 돌리고, 다 만든 코스 표만 서버로 옮길 수 있습니다.

| | 서버에서 돌리기(9-1 ~ 9-4, 기본) | PC 에서 돌리고 표 옮기기(9-5) |
|---|---|---|
| PC | 꺼도 됨 | 갱신할 때 켜 있어야 함 |
| 서버 메모리 | 배치 1GB 더 씀 | 웹 · DB 만 |
| 갱신 | 주기마다 저절로(courseImport 1시간 등) | 홍TV님이 옮길 때만(주 1번 등) |
| 좋은 점 | 손이 안 감 | PC 화면에서 먼저 보고 괜찮을 때만 올림 |

둘을 섞지 않습니다. 서버 배치가 넣은 코스를 PC 표가 덮어써 사라지므로, 9-5 로 가면 서버의 routefly-batch 를 끕니다
(`sudo systemctl disable --now routefly-batch.timer` - 9-3 의 타이머).
2026-10-19 의 순서(9장 맨 위)에서는 9-5 를 PC → 서버 첫 옮기기에 한 번만 씁니다(그때는 서버 배치가 아직 없음).

옮기는 표는 배치가 채우는 6개뿐입니다(route_course · route_course_point · route_course_poi · route_course_info · route_signpost · route_park_spot).
웹이 쓰는 표가 나중에 생겨도(산악회 위치 등) 이 방법은 그 표를 건드리지 않습니다.

```
(PC, 홍TV님)  & "C:\Program Files\MariaDB 12.3\bin\mariadb-dump.exe" -u root -p --single-transaction --result-file=route.sql routefly route_course route_course_point route_course_poi route_course_info route_signpost route_park_spot
(PC)          tar -czf route.tgz route.sql
(PC)          scp -i <키.pem> route.tgz ubuntu@<고정 IP>:~
```

서버에서는 새 표를 옆 DB(routefly_new)에 먼저 넣고, 한 번에 바꿔 끼웁니다. 넣는 동안에도 웹은 예전 코스를 그대로 보여 줍니다.

```bash
cd ~ && tar -xzf route.tgz
sudo mariadb -e "CREATE DATABASE IF NOT EXISTS routefly_new CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
                 CREATE DATABASE IF NOT EXISTS routefly_old CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mariadb routefly_new < route.sql
sudo mariadb -e "SELECT COUNT(*) FROM routefly_new.route_course; SELECT COUNT(*) FROM routefly.route_course;"   # 수가 크게 줄었으면 멈추고 PC 확인

# 지난번 예전 표를 지우고, 지금 표 → routefly_old, 새 표 → routefly (RENAME 한 줄은 한꺼번에 바뀜)
sudo mariadb -e "DROP TABLE IF EXISTS routefly_old.route_course, routefly_old.route_course_point, routefly_old.route_course_poi,
                   routefly_old.route_course_info, routefly_old.route_signpost, routefly_old.route_park_spot;
  RENAME TABLE routefly.route_course TO routefly_old.route_course,             routefly_new.route_course TO routefly.route_course,
               routefly.route_course_point TO routefly_old.route_course_point, routefly_new.route_course_point TO routefly.route_course_point,
               routefly.route_course_poi TO routefly_old.route_course_poi,     routefly_new.route_course_poi TO routefly.route_course_poi,
               routefly.route_course_info TO routefly_old.route_course_info,   routefly_new.route_course_info TO routefly.route_course_info,
               routefly.route_signpost TO routefly_old.route_signpost,         routefly_new.route_signpost TO routefly.route_signpost,
               routefly.route_park_spot TO routefly_old.route_park_spot,       routefly_new.route_park_spot TO routefly.route_park_spot;"
rm ~/route.sql ~/route.tgz
```

- 웹 계정 권한은 DB 단위(`routefly.*`)라 바꿔 끼운 표에도 그대로 붙습니다.
- 서버 화면의 코스 목록은 10분 · 경사는 하루 메모리에 남으므로, 바로 보려면 `sudo systemctl restart tomcat`.
- 되돌리기: 위 RENAME 을 routefly ↔ routefly_old 로 바꿔 한 번 더(routefly_new 는 그때 비어 있음). routefly_old 는 다음 옮길 때까지 남겨 둡니다.
- 처음 한 번은 바꿔 끼울 표가 없으므로 4장처럼 `routefly` 에 바로 넣습니다.

### 9-6. 서버 → PC 받아 오기 (2026-10-19 홍TV님 결정)

배치는 서버에서만 돌고, PC 는 서버가 만든 6개 표를 하루 한 번 받아 옵니다(PC 화면 · 개발 확인도 서비스와 같은 코스로).
9-5 를 방향만 거꾸로 한 스크립트가 routefly-batch 저장소의 `bin\pull-from-server.ps1` 입니다.

1. ssh 로 서버에서 `sudo mariadb-dump`(6개 표) → gzip → scp 로 PC `work\` 에 가져오고 서버 파일은 지움(3306 은 열지 않음)
2. PC DB 의 `routefly_new` 에 넣고, route_course 수가 지금 PC 보다 20% 넘게 줄었으면 멈춤(`-Force` 로 넣기)
3. RENAME 한 번으로 `routefly` ↔ `routefly_old` 바꿔 끼움 - 되돌리기는 9-5 와 같음

비밀값은 스크립트에 없습니다.

- SSH 키 경로: `-Key` 또는 환경 변수 `ROUTEFLY_SSH_KEY`
- PC DB 계정: 홍TV님이 `C:\GH\config\routefly\pull.cnf` 에 직접 씀(`[client]` 다음 줄에 `user=` · `password=`, 그 계정에 routefly · routefly_new · routefly_old 권한).
  다른 곳에 두면 `-DefaultsFile`. PC Claude 는 이 폴더를 읽지 못합니다(guard).
- 서버 ubuntu 계정의 sudo 가 비밀번호를 묻지 않아야 합니다(Lightsail Ubuntu 기본).

```
(PC, 손으로 한 번)  powershell -NoProfile -ExecutionPolicy Bypass -File bin\pull-from-server.ps1 -Key <키.pem>
                   → 끝에 "OK route_course <수>" 면 성공, "FAIL ..." 면 그 까닭
(PC, 작업 스케줄러) 이름 routefly-pull, 매일 05:30(서버 DB 백업 04:00 뒤), 동작: powershell.exe
                   인수 -NoProfile -ExecutionPolicy Bypass -File C:\GH\workspace\routefly-batch\bin\pull-from-server.ps1 -Key <키.pem>
                   시작 위치 C:\GH\workspace\routefly-batch
```

- PC 에서 고친 배치를 시험할 때는 `bin\run-dev.ps1 --once=<이름>` 으로 PC DB 에서 봅니다. 다음 받아 오기 때 서버 것으로 덮어써지므로,
  그 결과를 서비스에 쓰려면 jar 를 서버에 올립니다(9-4).
- 웹 화면은 코스 목록을 10분 메모리에 두므로 PC 톰캣에서 바로 보려면 다시 띄웁니다.

## 10. 꼭 해 둘 것

- 자동 스냅샷: 인스턴스 → Snapshots → Enable automatic snapshots(하루 한 번)
- 보안 업데이트: `sudo apt -y install unattended-upgrades` (기본으로 켜져 있으면 그대로)
- 지도 출처 표시(© OpenStreetMap contributors)는 서버를 옮겨도 그대로 보여야 합니다.
- routefly.kr 이 열리면 설정의 `site.baseUrl=https://routefly.kr/routefly` 주석을 풀고(공유 링크 · og 그림 · 산 페이지 canonical - 이미 5장에서 넣었으면 또 넣지 않음. `sudo grep -c '^site.baseUrl=' /opt/routefly/config.properties` 가 1 이어야 함, 2026-10-19 두 줄이 되어 하나 지움. site.baseUrl 은 서버에만 - PC 설정은 비움(주석): 켜 두면 PC 개발 · 테스트 때 /s/ 공유 · og 가 서버 routefly.kr 의 옛 화면으로 넘어가 헷갈림), HSTS(6-1 의 `Strict-Transport-Security`)가 붙는지
  `curl -sI https://routefly.kr/routefly/ | grep -i strict` 로 봅니다. 몇 주 문제없으면 그때 hstspreload.org 등록을 생각합니다(되돌리기 어려우니 서두르지 않음).

- V-World 지도 키(2026-10-19): 서버는 routefly.kr 전용 개발키(서비스명 routefly, 서비스 URL https://routefly.kr, WMTS/TMS)를 씀.
  발급 2026-10-19 · 만료 2027-04-19(6개월, 최대 3회 연장). PC 설정은 예전 키 그대로(localhost 개발용).
  서버 반영 확인(2026-10-19 PC): api/map-config 의 키가 새 키, Referer https://routefly.kr 로 Satellite 타일 200 image/jpeg. 운영키는 신청해 두고 심사 기다리는 중.
  할 일: 만료 전에 운영키(2년, 심사)로 바꾸기 - 승인되면 서버 `/opt/routefly/config.properties` 의 `map.vworld.key` 교체 → `sudo systemctl restart tomcat`.
  심사가 늦으면 2027-04 초에 개발키 연장. 키 값은 이 문서 · 대화에 적지 않음.

### 10-1. 막기 · 백업 (2026-10-15)

```bash
# 비밀번호로 SSH 들어오기 막기(Lightsail 은 기본이 키 로그인) - PasswordAuthentication no 인지 확인
sudo grep -i '^PasswordAuthentication' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf

# fail2ban - SSH 를 여러 번 틀리는 곳을 한동안 막음(기본 설정 sshd 감시만 켬)
sudo apt -y install fail2ban
sudo tee /etc/fail2ban/jail.d/routefly.local >/dev/null <<'CONF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
CONF
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd

# DB 백업 - 매일 새벽 4시, 14일치. DB root 는 unix_socket(리눅스 root 면 비밀번호 없이 - 4장 2026-10-19 서버)이라 비밀번호 파일이 필요 없음.
# root 에 비밀번호를 걸었다면 /root/.my.cnf([client] user=root password=…, chmod 600)를 홍TV님이 직접 만듦
sudo install -d -m 700 /var/backups/routefly
echo '0 4 * * * root umask 077 && mariadb-dump --single-transaction routefly | gzip > /var/backups/routefly/routefly-$(date +\%Y\%m\%d).sql.gz && find /var/backups/routefly -name "*.sql.gz" -mtime +14 -delete' \
  | sudo tee /etc/cron.d/routefly-db-backup
```

- 백업 파일은 600(umask 077, 2026-10-20 - 처음 것은 644 였음. 폴더가 700 이라 남이 읽을 수는 없었지만 파일도 막음).
- 서버 안 백업은 서버가 통째로 사라지면 같이 사라집니다. 자동 스냅샷(위)과 함께, 달에 한 번쯤 `scp` 로 PC 에 한 벌 받아 둡니다.
- 되살리기: `gunzip -c routefly-YYYYMMDD.sql.gz | mariadb routefly`
- 이용자 기록 · 사진은 서버에 없습니다(핸드폰 안 - 따라가기 "📒 내 기록 → 💾 백업 저장").

## 11. 메모리 · CPU (4GB 요금제) - 2026-10-16

### 11-1. 나눠 쓰는 모양

| 쓰는 것 | 메모리 | 정하는 곳 |
|---|---|---|
| 배치(9장) | 1GB 까지 | `-Xmx1g` (bin/.setenv.sh) |
| 톰캣 | 768MB 까지 + 자바 자체 약 200MB | 5장 `CATALINA_OPTS` |
| MariaDB | 512MB + 연결 · 정렬 몇백 MB | 11-2 |
| 리눅스 · nginx · fail2ban | 약 0.5GB | |
| 합계 | 약 3 ~ 3.5GB | 넘치면 스왑 2GB(3장)가 받음 |

배치를 9-5 처럼 PC 에서 돌리면 1GB 가 빠져 넉넉해집니다.

### 11-2. MariaDB 메모리 상한

설정하지 않으면 MariaDB 기본값을 따릅니다. 4GB 서버에서는 512MB 로 묶어 둡니다.

```bash
sudo tee /etc/mysql/mariadb.conf.d/60-routefly.cnf >/dev/null <<'CONF'
[mysqld]
innodb_buffer_pool_size = 512M
max_connections = 60
CONF
sudo systemctl restart mariadb
sudo mariadb -e "SELECT @@innodb_buffer_pool_size/1024/1024 AS MB, @@max_connections;"
```

### 11-3. 처음 몇 주 볼 것

- `free -h` - available 이 300MB 아래로 자주 내려가거나 스왑 사용이 1GB 를 넘으면 빠듯한 것
- Lightsail 콘솔 → 인스턴스 → Metrics → CPU: Lightsail 은 평소 조금 쓰다 잠깐 몰아 쓰는 방식이라, "burst capacity" 가 바닥(0%)에 붙어 있으면 느려집니다.
  배치(osmBike · forestTrail 처럼 오래 도는 것)를 처음 손으로 돌릴 때는 사람이 적은 새벽에.
- `journalctl -k | grep -i "out of memory"` - 메모리가 모자라 프로그램이 죽은 적이 있는지

### 11-4. 산악회 위치 보기를 더하면 (어림셈)

- 한 사람이 30초마다 위치 하나(100바이트 남짓) - 동시에 1,000명이 걸어도 초당 약 33번이라 톰캣에는 가벼움.
- 지금 위치는 사람마다 마지막 하나만 메모리에 둠 - 1,000명이어도 1MB 아래.
- 법이 정한 이용 · 제공 기록은 산행 한 번에 한 줄 - DB 도 거의 늘지 않음.
- 위치기반서비스사업 신고를 한 뒤에 엽니다(웹 계정에 그 표 쓰기 권한도 그때 더함).

### 11-5. 언제 키우나

- 주말 동시 이용이 수천 명이 되거나, 11-3 에서 메모리 · CPU 가 자주 바닥이면 8GB 요금제로.
  스냅샷 → 그 스냅샷으로 더 큰 요금제 새 인스턴스 → 고정 IP 를 새 인스턴스로 옮김(10분 남짓, 주소는 그대로).
- 그 전에 먼저 해 볼 것: 배치를 9-5 로 PC 에 두기.

## 12. 옛 도메인을 routefly.kr 로 넘기기 (2026-10-19 홍TV님 결정)

> 2026-10-20 바뀜(홍TV님): 옛 블로그 글은 블로그스팟(Blogger)으로 옮기고 호스팅은 해지(마감 11-02).
> 옛 도메인은 이 서버로 돌려(12-1 의 3~5 그대로) 두 가지만 합니다: ① 옛 그림 `/wp-content/uploads/…` 를 백업에서 그대로 내줌(블로그스팟 글이 이 주소로 그림을 부름)
> ② 옛 글 주소는 블로그스팟의 같은 글로 301(글마다 짝 - 가져온 뒤 만듦), 그 밖은 블로그스팟 첫 화면으로. nginx 는 12-4 를 이 모양으로 바꿔 씁니다(만들 때 적음).

예전 사이트(워드프레스 호스팅)를 닫고, 그 도메인으로 오는 사람을 https://routefly.kr/routefly/ 로 보냅니다(301 - 검색 엔진도 "옮겼다"로 알아들음).
아래 `<옛도메인>` 자리에 실제 이름을 넣습니다(하위 이름 www · genie · sports 같은 것도 함께). 도메인 이름 말고는 이 문서에 적지 않습니다(계정 · 결제 정보 등).

### 12-1. 순서 (거꾸로 하면 백업 전에 사이트가 사라질 수 있음)

1. 워드프레스 백업(사이트마다) - 12-2
2. 호스팅 회사에 문의 - 12-3 (답이 오기 전에는 해지하지 않음)
3. DNS 를 이 서버로: `<옛도메인>` 의 A 레코드(@ · www · 하위 이름마다)를 Lightsail 고정 IP 로. 메일을 그 도메인으로 받고 있으면 MX 레코드는 건드리지 않음
4. 서버 nginx + 인증서 - 12-4 (DNS 가 바뀐 뒤라야 certbot 이 됨)
5. 넘어가는지 확인(브라우저 · `curl -sI https://<옛도메인>/` 이 301 → https://routefly.kr/routefly/)
6. 하루 이틀 지켜본 뒤 호스팅 해지. 도메인 자체는 기한까지 유지(갱신도 계속 - 끊기면 남이 사서 쓸 수 있음)

### 12-2. 워드프레스 백업 (홍TV님이 함 - 로그인 · 비밀번호가 필요해서)

사이트마다 두 가지를 받습니다. 둘 다 있어야 나중에 다시 살릴 수 있습니다.

- 파일: 호스팅 관리 화면의 웹 FTP(또는 FileZilla 같은 FTP 프로그램)로 사이트 폴더 전체(특히 `wp-content` - 사진 · 테마 · 플러그인). 관리 화면에 "백업 · 압축 내려받기"가 있으면 그것이 편함
- DB: 관리 화면의 phpMyAdmin → 그 사이트 DB → 내보내기(SQL, 빠른 방법) → `.sql` 파일. `wp-config.php` 의 DB_NAME 이 그 사이트 DB 이름
- 덤으로: 워드프레스 관리자 → 도구 → 내보내기 → 모든 콘텐츠(글 · 페이지 · 댓글이 XML 한 파일 - 다른 워드프레스로 옮기기 쉬움)

받을 곳: PC 의 저장소 밖 폴더(예 `C:\GH\backup\<사이트>-<날짜>\`) + 외장 디스크나 클라우드 드라이브에 한 벌 더.
백업에는 회원 · 댓글 개인정보와 `wp-config.php` 의 DB 비밀번호가 들어 있으니 저장소 · 대화에 올리지 않습니다.
PC Claude 는 받은 뒤 확인만(파일 크기, zip 이 열리는지, `.sql` 끝에 테이블들이 다 있는지 - `wp_posts` · `wp_options` 등) - 내용을 대화에 옮기지 않음.

### 12-3. 호스팅 회사에 물을 것

1. `<옛도메인>` 의 실제 등록 기관(등록대행자)은 어디인가요? 호스팅을 해지해도 도메인 관리(네임서버 · DNS 레코드 바꾸기)를 제가 계속 할 수 있나요? 관리 화면은 어디인가요?
2. 안 된다면 다른 등록 기관(가비아)으로 옮기는 방법 - 인증코드(AuthCode) 받는 곳, 해지 전에 옮겨야 하는지
3. 해지하면 사이트 파일 · DB 는 언제 지워지나요? 남은 기간 환불은 어떻게 되나요?
4. (그 도메인 메일을 쓰고 있다면) 해지 뒤 메일은 어떻게 되나요?

DNS 를 계속 바꿀 수 없다면 해지 전에 가비아로 기관 이전을 먼저 합니다(이전 중에도 사이트는 그대로 열림).

### 12-4. 서버 nginx (DNS 를 바꾼 뒤)

`/etc/nginx/sites-available/old-domains` - 이름은 실제 것으로:

```nginx
server {
    listen 80;
    server_name <옛도메인> www.<옛도메인> genie.<옛도메인> sports.<옛도메인>;
    return 301 https://routefly.kr/routefly/;   # 옛 글 주소는 routefly 에 없으니 첫 화면으로(뒤 경로는 버림)
}
```

```bash
sudo ln -s /etc/nginx/sites-available/old-domains /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <옛도메인> -d www.<옛도메인> -d genie.<옛도메인> -d sports.<옛도메인>   # https 로 오는 사람도 넘기게. 갱신은 자동
```

certbot 이 443 칸을 붙인 뒤 그 칸에도 `return 301 https://routefly.kr/routefly/;` 이 들어 있는지 봅니다(없으면 넣고 reload).
DNS 를 아직 안 바꾼 이름이 섞이면 certbot 이 실패하니, 바꾼 이름만 -d 로 넣습니다.
