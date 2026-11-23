"""
구 이름 자리(data/gu-labels.json) 만들기 - 2026-11-23 홍TV님 "종로구, 도봉구, 강북구, 노원구 등 구역 표시도 해줘".

우리 지도 파일(korea.pmtiles, OpenMapTiles 양식)에는 구 이름(place class borough)이 확대 14 조각에만 있어
확대 10 ~ 13 화면에서는 안 보입니다. 이 스크립트가 지도 파일에서 그 점만 뽑아 GeoJSON 으로 남깁니다(값은 모두 지도 파일 그대로, 지어내지 않음).

  1. 확대 10 조각에서 도시(place class city) 자리를 모음
  2. 도시 자리 확대 14 조각(둘레 3x3)에 구 이름이 있는 도시만 남김
  3. 그 도시 둘레 RADIUS_KM 안 확대 14 조각을 3칸씩 건너뛰며 읽음 - 구 이름 점은 이웃 조각 3x3 에 겹쳐 들어 있어 빠지지 않음(서울로 확인: 모든 조각 읽기와 같은 35곳)
  4. 이름이 같고 3km 안인 점은 하나만(rank 작은 것)

쓰는 법(지도 파일을 다시 만든 뒤):
  python tools/basemap/gu-labels.py <korea.pmtiles 경로 또는 https 주소> src/main/webapp/data/gu-labels.json
필요한 것: pip install pmtiles mapbox-vector-tile
"""
import sys, gzip, math, json, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pmtiles.reader import Reader, MmapSource

RADIUS_KM = 25


def opener(src):
    if src.startswith("https://"):
        def get(o, l):
            for k in range(5):
                try:
                    q = urllib.request.Request(src, headers={"Range": "bytes=%d-%d" % (o, o + l - 1), "User-Agent": "routefly-check"})
                    return urllib.request.urlopen(q, timeout=60).read()
                except Exception:
                    time.sleep(2 + k * 2)
            raise IOError("못 받음 %d" % o)
        return Reader(get), 8
    f = open(src, "rb")
    return Reader(MmapSource(f)), 1


def main(src, out):
    import mapbox_vector_tile
    rd, workers = opener(src)

    def tile(z, x, y):
        d = rd.get(z, x, y)
        if not d:
            return {}
        try:
            d = gzip.decompress(d)
        except OSError:
            pass
        return mapbox_vector_tile.decode(d, default_options={"y_coord_down": True})

    def points(z, x, y, cls):
        t, n, r = tile(z, x, y), 2 ** z, []
        L = t.get("place")
        if not L:
            return r
        ext = L.get("extent", 4096)
        for f in L["features"]:
            p = f["properties"]
            if p.get("class") == cls and f["geometry"]["type"] == "Point":
                gx, gy = f["geometry"]["coordinates"]
                lon = (x + gx / ext) / n * 360 - 180
                lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + gy / ext) / n))))
                r.append({"name": p.get("name:ko") or p.get("name"), "name_en": p.get("name:en") or p.get("name:latin"),
                          "lat": round(lat, 5), "lon": round(lon, 5), "rank": p.get("rank")})
        return r

    def tx(z, lon): return int((lon + 180) / 360 * 2 ** z)
    def ty(z, lat): return int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** z)

    pool = ThreadPoolExecutor(workers)
    z10 = [(x, y) for x in range(tx(10, 124.5), tx(10, 131.0) + 1) for y in range(ty(10, 38.7), ty(10, 33.0) + 1)]
    cities = {}
    for r in pool.map(lambda q: points(10, q[0], q[1], "city"), z10):
        for c in r:
            cities[(c["name"], round(c["lat"], 2), round(c["lon"], 2))] = c
    print("도시", len(cities), file=sys.stderr)

    def has_gu(c):
        x, y = tx(14, c["lon"]), ty(14, c["lat"])
        return any(points(14, x + i, y + j, "borough") for i in (-3, 0, 3) for j in (-3, 0, 3))
    gu_cities = [c for c, ok in zip(cities.values(), pool.map(has_gu, cities.values())) if ok]
    print("구가 있는 도시", len(gu_cities), sorted(c["name"] for c in gu_cities), file=sys.stderr)

    want = set()
    for c in gu_cities:
        dlat = RADIUS_KM / 111.0
        dlon = dlat / math.cos(math.radians(c["lat"]))
        for x in range(tx(14, c["lon"] - dlon), tx(14, c["lon"] + dlon) + 1):
            for y in range(ty(14, c["lat"] + dlat), ty(14, c["lat"] - dlat) + 1):
                want.add((x - x % 3 + 1, y - y % 3 + 1))
    print("읽을 확대 14 조각", len(want), file=sys.stderr)
    found = [g for r in pool.map(lambda q: points(14, q[0], q[1], "borough"), sorted(want)) for g in r]
    found = [g for g in found if (g["name"] or "").endswith("구")]   # OSM 에 borough 로 잘못 단 동 이름(신봉동 등)은 뺌

    keep = []
    for g in sorted(found, key=lambda g: (g["rank"] if g["rank"] is not None else 99, g["name"], g["lat"], g["lon"])):
        if any(k["name"] == g["name"] and abs(k["lat"] - g["lat"]) < 0.027 and abs(k["lon"] - g["lon"]) < 0.034 for k in keep):
            continue
        keep.append(g)
    keep.sort(key=lambda g: (g["name"], g["lat"]))
    gj = {"type": "FeatureCollection",
          "_source": "korea.pmtiles(OpenMapTiles place class borough, 확대 14) - © OpenMapTiles © OpenStreetMap contributors, tools/basemap/gu-labels.py",
          "features": [{"type": "Feature", "properties": {"name": g["name"], "name_en": g["name_en"]},
                        "geometry": {"type": "Point", "coordinates": [g["lon"], g["lat"]]}} for g in keep]}
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(gj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("구 이름", len(keep), file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
