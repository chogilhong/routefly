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
routefly.kr      A    <고정 IP>
```

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
(PC)     & "C:\Program Files\MariaDB 12.3\bin\mariadb-dump.exe" -u root -p --result-file=routefly.sql routefly   # PowerShell 의 > 는 UTF-16 으로 써서 서버가 못 읽음
(PC)     scp -i <키.pem> routefly.sql ubuntu@<고정 IP>:~
(서버)   sudo mariadb routefly < ~/routefly.sql && rm ~/routefly.sql
```

MariaDB 메모리 상한(innodb_buffer_pool_size)도 이때 정합니다 - 11-2.

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
gzip on;
gzip_proxied any;
gzip_min_length 1024;
gzip_types application/javascript text/javascript text/css image/svg+xml application/manifest+json;
gzip_vary on;
# 접속 기록에는 주소의 ?뒤(코스 검색어 · 지도 범위 - "내 주변 코스" 는 내 둘레 약 1km 칸)를 남기지 않음 - 개인정보처리방침(privacy.html)과 맞춤.
# 기록은 logrotate 기본(14일)으로 지워짐
log_format routefly_noargs '$remote_addr - [$time_local] "$request_method $uri" $status $body_bytes_sent "$http_user_agent"';
access_log /var/log/nginx/access.log routefly_noargs;
```

`/etc/nginx/sites-available/routefly` 에 아래 6-1 또는 6-2 중 하나를 넣고:

```bash
sudo ln -s /etc/nginx/sites-available/routefly /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d routefly.kr        # 이메일 입력, HTTP → HTTPS 넘기기. 갱신은 자동(certbot.timer)
```

### 왜 머리글을 이렇게 넘기나 (SecurityFilter)

`SecurityFilter.clientIp` 는 바로 앞이 127.0.0.1(이 서버의 Nginx)일 때만 전달 머리글을 믿고,
`CF-Connecting-IP` 가 있으면 그것을, 없으면 `X-Forwarded-For` 의 맨 뒤 값을 요청한 곳으로 봅니다. `/api` · `/s` 의 분당 횟수 제한이 이 값으로 셉니다.

- `X-Forwarded-For` 를 넘기지 않으면 모든 사용자가 127.0.0.1 한 사람이 되어, 분당 120번 남짓을 전체가 나눠 쓰게 됩니다(사람이 조금만 늘어도 429).
- Nginx 는 요청에 들어온 머리글을 그대로 넘기므로, Cloudflare 를 안 쓰는데 `CF-Connecting-IP` 를 지우지 않으면 누구나 그 값을 꾸며 넣어 제한을 피할 수 있습니다.
- `ShareServlet` 은 `X-Forwarded-Proto` 로 https 여부를 봅니다.

### 6-1. Cloudflare 없이 (처음엔 이것)

```nginx
server {
    listen 80;
    server_name routefly.kr;

    location = / { return 302 /routefly/; }
    # 검색 엔진용(산 소개 페이지 /routefly/m/… - 2026-10-14 SitemapServlet). 사이트 뿌리에 있어야 해서 앱으로 넘김
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

## 7. 배포 (버전업할 때마다)

```
(PC)     이클립스: routefly 우클릭 → Run As → Maven build... → Goals: package  (또는 Export → WAR file)
         → target/routefly.war
(PC)     scp -i <키.pem> target\routefly.war ubuntu@<고정 IP>:~
(서버)   sudo install -o tomcat -g tomcat -m 644 ~/routefly.war /opt/tomcat/webapps/routefly.war
```

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
3. SSL/TLS → Full (strict) (서버의 certbot 인증서를 그대로 씀)
4. 서버 Nginx 를 6-2 로 바꿈(Cloudflare 대역만 받기 + `CF-Connecting-IP` 지우는 줄 빼기). 4 를 빼먹으면 서버 IP 로 바로 와서 `CF-Connecting-IP` 를 꾸며 넣어 횟수 제한을 피할 수 있습니다.
5. 캐시 규칙은 기본값 그대로(no-cache 인 html · js · css 와 확장자 없는 `/api` 는 담지 않음)

## 9. routefly-batch 도 서버에서 돌리기

배치도 서버로 옮겨 PC 를 꺼도 코스가 갱신되게 합니다(2026-10-11 홍TV님 결정). 배치는 같은 서버의 MariaDB 에 바로 넣습니다.
PC 는 배치 개발 · 테스트 실행(`bin\run-dev.ps1`)과 jar 빌드(`bin\build.ps1`)만 하고, PC 의 작업 스케줄러 실행은 끕니다.

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

```bash
sudo useradd -r -m -d /app/routefly -s /bin/false routefly
sudo mkdir -p /app/routefly/batch && sudo chown -R ubuntu: /app/routefly/batch   # 올리는 동안만 ubuntu 소유
sudo locale-gen ko_KR.UTF-8                                                     # 스크립트의 LANG=ko_KR.UTF-8
```

```
(PC)  bin\build.ps1 로 jar 만들기
(PC)  scp -i <키.pem> -r bin deploy data cache ubuntu@<고정 IP>:/app/routefly/batch/
```

```bash
cd /app/routefly/batch
sed -i 's/\r$//' bin/*.sh bin/.setenv.sh          # 윈도우에서 온 줄끝(CRLF)이면 bash 가 못 읽음
chmod +x bin/routefly-batch.sh
nano deploy/conf/batch.properties                  # 서버용으로 새로(아래)
nano deploy/conf/databases.xml                     # url jdbc:mariadb://127.0.0.1:3306/routefly, routefly_batch 계정
sudo chown -R routefly: /app/routefly/batch
# 프로그램(bin · jar · 쿼리 XML)은 root 것 - 배치가 받은 자료를 읽다 뚫려도 자기 프로그램을 고쳐 남지 못하게(2026-10-11 오픈 전 점검)
sudo chown -R root:routefly bin deploy/lib deploy/conf/sql && sudo chmod -R g+rX,o-rwx bin deploy/lib deploy/conf/sql
sudo chown root:routefly deploy/conf/batch.properties deploy/conf/databases.xml
sudo chmod 640 deploy/conf/batch.properties deploy/conf/databases.xml   # routefly 는 읽기만
```

서버용 `batch.properties` 는 `batch.properties.example` 을 바탕으로 만들고 이것만 다르게 둡니다.

- `*.dir` · `osm.cacheDir` 는 비움(PC 의 `C:\...` 경로를 그대로 가져오면 안 됨)
- `vworld.domain` 은 새 도메인, V-World 사이트에도 그 도메인을 등록
- 키(`forest.serviceKey` · `durunubi.serviceKey` · `vworld.key`)는 PC 값과 같음

### 9-3. 하나씩 시험한 뒤 상주로

```bash
cd /app/routefly/batch
sudo -u routefly bin/routefly-batch.sh --once=courseImport
sudo -u routefly bin/routefly-batch.sh --once=knpsSign
tail -n 50 logs/batch/courseImport.log
```

`/etc/systemd/system/routefly-batch.service`:

```ini
[Unit]
Description=routefly-batch (fxms, 상주)
After=network-online.target mariadb.service
Wants=network-online.target

[Service]
Type=simple
User=routefly
WorkingDirectory=/app/routefly/batch
ExecStart=/app/routefly/batch/bin/routefly-batch.sh
Restart=on-failure
RestartSec=60
# 2026-10-11 오픈 전 점검: 권한을 더 얻지 못하게 · /usr /boot /etc 는 읽기만 · 집 폴더 · /tmp 는 따로, 새 파일은 남이 못 읽게
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
UMask=0027

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now routefly-batch
sudo systemctl status routefly-batch
```

상주 실행(`BatchDaemon`)은 배치마다 정해진 주기(courseImport 1시간, forestTrail 7일, osmBike 30일 등)대로 돕니다.
서버가 잘 돌면 PC 작업 스케줄러의 routefly-batch 작업을 "사용 안 함" 으로 바꿉니다(두 곳에서 같이 돌리지 않음).

### 9-4. 배치를 고쳤을 때

```
(PC)     bin\build.ps1
(PC)     scp -i <키.pem> deploy\lib\routefly-batch.jar ubuntu@<고정 IP>:~
(서버)   sudo install -o routefly -g routefly -m 644 ~/routefly-batch.jar /app/routefly/batch/deploy/lib/
         sudo systemctl restart routefly-batch
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
(`sudo systemctl disable --now routefly-batch`).

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

## 10. 꼭 해 둘 것

- 자동 스냅샷: 인스턴스 → Snapshots → Enable automatic snapshots(하루 한 번)
- 보안 업데이트: `sudo apt -y install unattended-upgrades` (기본으로 켜져 있으면 그대로)
- 지도 출처 표시(© OpenStreetMap contributors)는 서버를 옮겨도 그대로 보여야 합니다.
- routefly.kr 이 열리면 설정의 `site.baseUrl=https://routefly.kr/routefly` 주석을 풀고(공유 링크 · og 그림 · 산 페이지 canonical), HSTS(6-1 의 `Strict-Transport-Security`)가 붙는지
  `curl -sI https://routefly.kr/routefly/ | grep -i strict` 로 봅니다. 몇 주 문제없으면 그때 hstspreload.org 등록을 생각합니다(되돌리기 어려우니 서두르지 않음).

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

# DB 백업 - 매일 새벽 4시, 14일치. 비밀번호는 root 만 읽는 파일에(명령 줄 · 이 문서에 쓰지 않음)
sudo install -d -m 700 /var/backups/routefly
sudo tee /root/.my.cnf >/dev/null <<'CONF'
[client]
user=root
password=(서버 DB root 비밀번호 - 홍TV님이 직접)
CONF
sudo chmod 600 /root/.my.cnf
echo '0 4 * * * root mariadb-dump --single-transaction routefly | gzip > /var/backups/routefly/routefly-$(date +\%Y\%m\%d).sql.gz && find /var/backups/routefly -name "*.sql.gz" -mtime +14 -delete' \
  | sudo tee /etc/cron.d/routefly-db-backup
```

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
