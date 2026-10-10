# routefly 를 AWS Lightsail 에 올리기

집 PC + Cloudflare 터널(주소가 켤 때마다 바뀜) 대신, 바뀌지 않는 주소(예: `https://routefly.kr/routefly/`)로 띄우는 순서입니다.
구성: Ubuntu 24.04 · Java 21 · 톰캣 11 · MariaDB · Nginx(HTTPS, Let's Encrypt). 앞에 Cloudflare 를 둘지는 8장에서 고릅니다.

- `routefly.kr` · `<고정 IP>` · `<키.pem>` 은 예시입니다. 실제 값으로 바꿔 씁니다.
- 비밀번호 · 지도 키 · `.pem` 파일은 이 저장소에 넣지 않습니다.
- 요금 · 톰캣 판 번호는 바뀌므로 만들 때 화면과 tomcat.apache.org 에서 확인합니다.

## 0. 미리 정할 것

| 항목 | 고를 것 | 이유 |
|---|---|---|
| 지역 | 서울(ap-northeast-2) | 국내 사용자에게 가장 빠름 |
| OS | Linux/Unix → OS Only → Ubuntu 24.04 LTS | 자료가 가장 많음 |
| 요금제 | 2GB(IPv4 포함, 2026-10 기준 월 12달러 안팎) | 톰캣 + MariaDB 를 한 대에 두면 1GB 는 빠듯함 |
| 도메인 | 예: `routefly.kr` | HTTPS 인증서 · 앱의 `server.url` 에 필요 |

서버를 꺼 둬도(stopped) 요금은 그대로 나갑니다.

## 1. 인스턴스 만들기 (Lightsail 콘솔)

1. lightsail.aws.amazon.com → Create instance
2. 지역 Seoul → Linux/Unix → OS Only → Ubuntu 24.04 LTS
3. 요금제 2GB → 이름 `routefly` → Create
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
-- 배치가 서버 DB 에 직접 쓸 때(9장)만
CREATE USER 'routefly_batch'@'localhost' IDENTIFIED BY '<다른 새 비밀번호>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP ON routefly.* TO 'routefly_batch'@'localhost';
EXIT;
```

PC 의 DB 를 옮깁니다:

```
(PC)     mysqldump -u root -p routefly > routefly.sql
(PC)     scp -i <키.pem> routefly.sql ubuntu@<고정 IP>:~
(서버)   sudo mariadb routefly < ~/routefly.sql && rm ~/routefly.sql
```

## 5. 톰캣 11

Ubuntu 저장소에는 톰캣 11 이 없어 Apache 에서 받습니다. `11.0.X` 는 tomcat.apache.org 의 최신 번호로.

```bash
sudo useradd -r -m -d /opt/tomcat -s /bin/false tomcat
cd /tmp && wget https://dlcdn.apache.org/tomcat/tomcat-11/v11.0.X/bin/apache-tomcat-11.0.X.tar.gz
sudo tar xzf apache-tomcat-11.0.X.tar.gz -C /opt/tomcat --strip-components=1
sudo rm -rf /opt/tomcat/webapps/{ROOT,docs,examples,manager,host-manager}   # 기본 예제 · 관리 화면은 지움
sudo chown -R tomcat: /opt/tomcat
```

톰캣은 127.0.0.1 에서만 받게 합니다(밖에서는 Nginx 로만). `/opt/tomcat/conf/server.xml` 의 8080 Connector 에 `address="127.0.0.1"` 를 넣습니다:

```xml
<Connector port="8080" address="127.0.0.1" protocol="HTTP/1.1"
           connectionTimeout="20000" redirectPort="8443" />
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

### 6-2. Cloudflare 를 앞에 둘 때

```nginx
# Cloudflare 대역에서 온 요청만 받음 - 서버 IP 로 바로 오는 우회 요청(꾸민 CF-Connecting-IP)을 막음
include /etc/nginx/cloudflare-allow.conf;
deny all;

server {
    listen 80;
    server_name routefly.kr;

    location = / { return 302 /routefly/; }

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

무거운 지도 타일이 우리 서버를 거치지 않아 2GB 요금제의 전송량을 넘기기 어렵습니다.
붙이는 까닭은 속도보다 보호(서버 IP 숨김 · 디도스 막기)입니다. 사용자가 늘거나 스토어에 올릴 때 붙입니다.

### 8-2. 붙이는 순서

1. Cloudflare 에 `routefly.kr` 추가 → 도메인 업체에서 네임서버를 Cloudflare 것으로 바꿈
2. DNS: `routefly.kr  A  <고정 IP>` 를 주황 구름(Proxied) 으로
3. SSL/TLS → Full (strict) (서버의 certbot 인증서를 그대로 씀)
4. 서버 Nginx 를 6-2 로 바꿈(Cloudflare 대역만 받기 + `CF-Connecting-IP` 지우는 줄 빼기). 4 를 빼먹으면 서버 IP 로 바로 와서 `CF-Connecting-IP` 를 꾸며 넣어 횟수 제한을 피할 수 있습니다.
5. 캐시 규칙은 기본값 그대로(no-cache 인 html · js · css 와 확장자 없는 `/api` 는 담지 않음)

## 9. routefly-batch 와의 관계

배치(fxms)는 지금 PC 의 DB 에 씁니다. 서버로 옮긴 뒤에는 둘 중 하나:

| 방법 | 어떻게 | 장단점 |
|---|---|---|
| 덤프로 옮기기 | 배치가 PC DB 를 채운 뒤 4장의 `mysqldump` → `scp` → 서버에 넣기 | 간단, 손으로 함 |
| 서버 DB 에 직접 | PC 에서 `ssh -i <키.pem> -N -L 3307:127.0.0.1:3306 ubuntu@<고정 IP>` 를 켜 두고, 배치의 DB 주소를 `127.0.0.1:3307` · `routefly_batch` 로 | 자동, 3306 을 밖에 열지 않음. 터널이 끊기면 배치가 실패 |

## 10. 꼭 해 둘 것

- 자동 스냅샷: 인스턴스 → Snapshots → Enable automatic snapshots(하루 한 번)
- 보안 업데이트: `sudo apt -y install unattended-upgrades` (기본으로 켜져 있으면 그대로)
- 지도 출처 표시(© OpenStreetMap contributors)는 서버를 옮겨도 그대로 보여야 합니다.
