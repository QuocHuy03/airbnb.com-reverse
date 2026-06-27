# -*- coding: utf-8 -*-
"""
Airbnb VN scraper - theo dia diem / loai thue / ngay / khoang gia, phan trang tu dong.
Moi phong = 1 dong CSV: ten, gia, anh, rating, toa do, host (ten/link), host_phone (N/A).

Dua tren co che reverse cua pyairbnb (curl_cffi impersonate Chrome -> qua WAF, khong can key/login).

LUU Y SU THAT:
 - Airbnb KHONG co thue theo gio. Chi co: nightly (theo dem/ngay) + monthly (theo thang).
 - Airbnb GIAU so dien thoai chu nha (chi hien sau khi dat). Scraping KHONG lay duoc -> host_phone = "" (N/A).
 - 1 lan search toi da ~280 phong (gioi han Airbnb). Muon nhieu hon: chia nho dia diem / loc gia.
"""
import sys, io, os, csv, time, base64, argparse, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # pyairbnb nam cung folder
import pyairbnb.api as api
import pyairbnb.search as search
import pyairbnb.utils as utils
from datetime import datetime

GV = utils.get_nested_value

def build_raw_params(args):
    rp = [
        {"filterName":"cdnCacheSafe","filterValues":["false"]},
        {"filterName":"channel","filterValues":["EXPLORE"]},
        {"filterName":"itemsPerGrid","filterValues":["50"]},
        {"filterName":"query","filterValues":[args.location]},
        {"filterName":"refinementPaths","filterValues":["/homes"]},
        {"filterName":"screenSize","filterValues":["large"]},
        {"filterName":"tabId","filterValues":["home_tab"]},
        {"filterName":"version","filterValues":["1.8.3"]},
        {"filterName":"priceFilterInputType","filterValues":["0"]},
    ]
    if args.adults: rp.append({"filterName":"adults","filterValues":[str(args.adults)]})
    if args.children: rp.append({"filterName":"children","filterValues":[str(args.children)]})

    if args.type == "monthly":
        # thue theo thang
        start = args.month_start or datetime.now().strftime("%Y-%m-01")
        rp += [
            {"filterName":"datePickerType","filterValues":["monthly_stays"]},
            {"filterName":"flexibleTripLengths","filterValues":["one_month"]},
            {"filterName":"monthlyStartDate","filterValues":[start]},
            {"filterName":"monthlyLength","filterValues":[str(args.months)]},
            {"filterName":"priceFilterNumNights","filterValues":[str(args.months*30)]},
        ]
    else:
        # nightly (theo dem/ngay)
        rp.append({"filterName":"datePickerType","filterValues":["calendar"]})
        if args.checkin and args.checkout:
            days=(datetime.strptime(args.checkout,"%Y-%m-%d")-datetime.strptime(args.checkin,"%Y-%m-%d")).days
            rp += [
                {"filterName":"checkin","filterValues":[args.checkin]},
                {"filterName":"checkout","filterValues":[args.checkout]},
                {"filterName":"priceFilterNumNights","filterValues":[str(days)]},
            ]
    if args.place_type in ("Private room","Entire home/apt"):
        rp += [{"filterName":"room_types","filterValues":[args.place_type]},
               {"filterName":"selected_filter_order","filterValues":["room_types:"+args.place_type]}]
    if args.price_min: rp.append({"filterName":"price_min","filterValues":[str(args.price_min)]})
    if args.price_max: rp.append({"filterName":"price_max","filterValues":[str(args.price_max)]})
    return rp

def call(key, h, args, rp, cursor):
    return search.get(api_key=key, cursor=cursor, check_in=None, check_out=None,
        ne_lat=0,ne_long=0,sw_lat=0,sw_long=0,zoom_value=0,currency=args.currency,
        place_type=None,price_min=0,price_max=0,amenities=[],free_cancellation=False,
        adults=0,children=0,infants=0,min_bedrooms=0,min_beds=0,min_bathrooms=0,
        language=args.lang,proxy_url=args.proxy,hash=h,raw_params=rp)

def decode_id(raw):
    if not raw: return raw
    s=str(raw)
    if s.isdigit(): return s
    try:
        dec=base64.b64decode(s + "="*(-len(s)%4)).decode()   # them padding neu thieu
        if ":" in dec: return dec.split(":")[-1]              # DemandStayListing:123 -> 123
    except Exception: pass
    return s

def parse_rating(label):  # "4,84 (37)" -> (4.84, 37)
    if not label: return ("","")
    m=re.match(r"([\d.,]+)\s*\((\d+)\)", label.strip())
    if m: return (m.group(1).replace(",","."), m.group(2))
    return ("","")

def extract(r, domain):
    raw = r.get("propertyId") or GV(r,"demandStayListing.id","")
    rid = decode_id(raw)
    name = GV(r,"nameLocalized.localizedStringWithTranslationPreference","") \
        or GV(r,"demandStayListing.description.name.localizedStringWithTranslationPreference","") \
        or (r.get("title") if isinstance(r.get("title"),str) else "")
    pl = GV(r,"structuredDisplayPrice.primaryLine",{}) or {}
    price = pl.get("price","")
    price_label = pl.get("accessibilityLabel","")
    rate, nrev = parse_rating(r.get("avgRatingLocalized",""))
    imgs=[]
    for p in r.get("contextualPictures",[]) or []:
        u = p.get("picture") or p.get("baseUrl")
        if u: imgs.append(u)
    return {
        "room_id": rid,
        "name": name,
        "price": price,
        "price_label": price_label,
        "rating": rate,
        "review_count": nrev,
        "lat": GV(r,"demandStayListing.location.coordinate.latitude",""),
        "lng": GV(r,"demandStayListing.location.coordinate.longitude",""),
        "image": imgs[0] if imgs else "",
        "all_images": " | ".join(imgs),
        "url": f"https://{domain}/rooms/{rid}" if rid else "",
        "host_name": "",          # chi day khi --with-host
        "host_id": "",
        "host_url": "",
        "host_avatar": "",
        "host_phone": "",         # N/A - Airbnb giau, khong scrape duoc
    }

_RE_HOST_NAME = re.compile(r'"MeetYourHostSection"[\s\S]{0,300}?"name":"([^"]{1,60})"')
_RE_HOST_ID   = re.compile(r'"hostId":"(\d+)"')
_RE_HOST_PIC  = re.compile(r'"MeetYourHostSection"[\s\S]{0,500}?"profilePictureUrl":"([^"]+)"')

def fetch_host(rid, args):
    """1 request PDP nhe -> ten host, id host, anh host. KHONG CO sdt (Airbnb giau)."""
    from curl_cffi import requests
    proxies = {"http":args.proxy,"https":args.proxy} if args.proxy else None
    try:
        t = requests.get(f"https://{args.domain}/rooms/{rid}", impersonate="chrome124",
                         headers={"Accept-Language":args.lang}, proxies=proxies,
                         timeout=30).text
        nm = _RE_HOST_NAME.search(t); hid = _RE_HOST_ID.search(t); pic=_RE_HOST_PIC.search(t)
        return (nm.group(1) if nm else "",
                hid.group(1) if hid else "",
                pic.group(1) if pic else "")
    except Exception:
        return "", "", ""

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--location", required=True, help='vd "Hội An, Việt Nam"')
    ap.add_argument("--type", choices=["nightly","monthly"], default="nightly")
    ap.add_argument("--checkin"); ap.add_argument("--checkout")
    ap.add_argument("--months", type=int, default=1); ap.add_argument("--month-start", dest="month_start")
    ap.add_argument("--price-min", dest="price_min", type=int, default=0)
    ap.add_argument("--price-max", dest="price_max", type=int, default=0)
    ap.add_argument("--adults", type=int, default=0); ap.add_argument("--children", type=int, default=0)
    ap.add_argument("--place-type", dest="place_type", default="", help="'Private room' | 'Entire home/apt'")
    ap.add_argument("--currency", default="VND"); ap.add_argument("--lang", default="vi")
    ap.add_argument("--domain", default="www.airbnb.com.vn"); ap.add_argument("--proxy", default="")
    ap.add_argument("--max-pages", dest="max_pages", type=int, default=0, help="0 = tat ca")
    ap.add_argument("--with-host", dest="with_host", action="store_true", help="lay ten host (cham, KHONG co sdt)")
    ap.add_argument("--out", default=r"c:\tmp\airbnb_out.csv")
    args=ap.parse_args()

    print(f"[*] api_key + hash ...")
    key = api.get(args.proxy); h = search.fetch_stays_search_hash(args.proxy)
    rp = build_raw_params(args)

    # page 1
    data = call(key,h,args,rp,"")
    pag = GV(data,"data.presentation.staysSearch.results.paginationInfo",{})
    cursors = pag.get("pageCursors",[]) or [""]
    if args.max_pages: cursors = cursors[:args.max_pages]
    print(f"[*] {len(cursors)} trang can quet")

    seen=set(); rows=[]
    def collect(d):
        n=0
        def walk(o):
            nonlocal n
            if isinstance(o,dict):
                if o.get("__typename")=="StaySearchResult":
                    rec=extract(o,args.domain)
                    if rec["room_id"] and rec["room_id"] not in seen:
                        seen.add(rec["room_id"]); rows.append(rec); n+=1
                for v in o.values(): walk(v)
            elif isinstance(o,list):
                for v in o: walk(v)
        walk(d); return n

    print(f"[+] trang 1: +{collect(data)} (tong {len(rows)})")
    for i,cur in enumerate(cursors[1:],2):
        try:
            d=call(key,h,args,rp,cur)
            print(f"[+] trang {i}: +{collect(d)} (tong {len(rows)})")
        except Exception as e:
            print(f"[!] trang {i} loi: {str(e)[:80]}");
        time.sleep(0.6)  # nhe nhang, tranh rate-limit

    if args.with_host:
        print(f"[*] lay ten host cho {len(rows)} phong (cham, +1 request/phong)...")
        for idx,rec in enumerate(rows,1):
            hn,hid,pic = fetch_host(rec["room_id"],args)
            rec["host_name"]=hn; rec["host_id"]=hid; rec["host_avatar"]=pic
            rec["host_url"]=f"https://{args.domain}/users/show/{hid}" if hid else ""
            if idx%10==0: print(f"    {idx}/{len(rows)}")
            time.sleep(0.4)

    cols=["room_id","name","price","price_label","rating","review_count",
          "lat","lng","image","all_images","url",
          "host_name","host_id","host_url","host_avatar","host_phone"]
    with open(args.out,"w",newline="",encoding="utf-8-sig") as f:
        w=csv.DictWriter(f,fieldnames=cols); w.writeheader(); w.writerows(rows)
    print(f"\n[OK] {len(rows)} phong -> {args.out}")

if __name__=="__main__":
    main()
