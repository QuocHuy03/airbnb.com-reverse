# -*- coding: utf-8 -*-
"""
Engine cao Airbnb -> stream NDJSON ra stdout cho Electron doc real-time.
Moi dong stdout = 1 JSON object:
  {"type":"status","msg":...}
  {"type":"meta","pages":N,"location":...}
  {"type":"room","data":{...}}      # moi phong 1 event
  {"type":"progress","page":i,"total_pages":N,"count":K}
  {"type":"done","count":K}
  {"type":"error","msg":...}

Input: 1 tham so argv[1] = JSON config:
  {location,type,checkin,checkout,months,month_start,price_min,price_max,
   adults,children,place_type,currency,lang,domain,proxy,max_pages,with_host}
"""
import sys, os, io, json, time, base64, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python/ -> pyairbnb
from datetime import datetime
import pyairbnb.api as api
import pyairbnb.search as search
import pyairbnb.utils as utils

GV = utils.get_nested_value

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()

# ---------- host (1 request PDP nhe, KHONG co sdt) ----------
_RE_HOST_NAME = re.compile(r'"MeetYourHostSection"[\s\S]{0,300}?"name":"([^"]{1,60})"')
_RE_HOST_ID   = re.compile(r'"hostId":"(\d+)"')
_RE_HOST_PIC  = re.compile(r'"MeetYourHostSection"[\s\S]{0,500}?"profilePictureUrl":"([^"]+)"')

def fetch_host(rid, domain, lang, proxy):
    from curl_cffi import requests
    proxies = {"http":proxy,"https":proxy} if proxy else None
    try:
        t = requests.get(f"https://{domain}/rooms/{rid}", impersonate="chrome124",
                         headers={"Accept-Language":lang}, proxies=proxies, timeout=30).text
        nm=_RE_HOST_NAME.search(t); hid=_RE_HOST_ID.search(t); pic=_RE_HOST_PIC.search(t)
        return (nm.group(1) if nm else "", hid.group(1) if hid else "", pic.group(1) if pic else "")
    except Exception:
        return "", "", ""

# ---------- helpers ----------
def decode_id(raw):
    if not raw: return raw
    s=str(raw)
    if s.isdigit(): return s
    try:
        dec=base64.b64decode(s + "="*(-len(s)%4)).decode()
        if ":" in dec: return dec.split(":")[-1]
    except Exception: pass
    return s

def parse_rating(label):
    if not label: return ("","")
    m=re.match(r"([\d.,]+)\s*\((\d+)\)", label.strip())
    if m: return (m.group(1).replace(",","."), m.group(2))
    return ("","")

def build_raw_params(c):
    rp=[
        {"filterName":"cdnCacheSafe","filterValues":["false"]},
        {"filterName":"channel","filterValues":["EXPLORE"]},
        {"filterName":"itemsPerGrid","filterValues":["50"]},
        {"filterName":"query","filterValues":[c["location"]]},
        {"filterName":"refinementPaths","filterValues":["/homes"]},
        {"filterName":"screenSize","filterValues":["large"]},
        {"filterName":"tabId","filterValues":["home_tab"]},
        {"filterName":"version","filterValues":["1.8.3"]},
        {"filterName":"priceFilterInputType","filterValues":["0"]},
    ]
    if c.get("adults"):   rp.append({"filterName":"adults","filterValues":[str(c["adults"])]})
    if c.get("children"): rp.append({"filterName":"children","filterValues":[str(c["children"])]})
    if c.get("type")=="monthly":
        start=c.get("month_start") or datetime.now().strftime("%Y-%m-01")
        months=int(c.get("months") or 1)
        rp+=[
            {"filterName":"datePickerType","filterValues":["monthly_stays"]},
            {"filterName":"flexibleTripLengths","filterValues":["one_month"]},
            {"filterName":"monthlyStartDate","filterValues":[start]},
            {"filterName":"monthlyLength","filterValues":[str(months)]},
            {"filterName":"priceFilterNumNights","filterValues":[str(months*30)]},
        ]
    else:
        rp.append({"filterName":"datePickerType","filterValues":["calendar"]})
        ci,co=c.get("checkin"),c.get("checkout")
        if ci and co:
            days=(datetime.strptime(co,"%Y-%m-%d")-datetime.strptime(ci,"%Y-%m-%d")).days
            rp+=[
                {"filterName":"checkin","filterValues":[ci]},
                {"filterName":"checkout","filterValues":[co]},
                {"filterName":"priceFilterNumNights","filterValues":[str(days)]},
            ]
    if c.get("place_type") in ("Private room","Entire home/apt"):
        rp+=[{"filterName":"room_types","filterValues":[c["place_type"]]},
             {"filterName":"selected_filter_order","filterValues":["room_types:"+c["place_type"]]}]
    if c.get("price_min"): rp.append({"filterName":"price_min","filterValues":[str(c["price_min"])]})
    if c.get("price_max"): rp.append({"filterName":"price_max","filterValues":[str(c["price_max"])]})
    return rp

def extract(r, domain):
    raw=r.get("propertyId") or GV(r,"demandStayListing.id","")
    rid=decode_id(raw)
    name=GV(r,"nameLocalized.localizedStringWithTranslationPreference","") \
        or GV(r,"demandStayListing.description.name.localizedStringWithTranslationPreference","") \
        or (r.get("title") if isinstance(r.get("title"),str) else "")
    pl=GV(r,"structuredDisplayPrice.primaryLine",{}) or {}
    rate,nrev=parse_rating(r.get("avgRatingLocalized",""))
    imgs=[]
    for p in r.get("contextualPictures",[]) or []:
        u=p.get("picture") or p.get("baseUrl")
        if u: imgs.append(u)
    return {
        "room_id":rid, "name":name,
        "price":pl.get("price",""), "price_label":pl.get("accessibilityLabel",""),
        "rating":rate, "review_count":nrev,
        "lat":GV(r,"demandStayListing.location.coordinate.latitude",""),
        "lng":GV(r,"demandStayListing.location.coordinate.longitude",""),
        "image":imgs[0] if imgs else "", "all_images":imgs,
        "url":f"https://{domain}/rooms/{rid}" if rid else "",
        "host_name":"", "host_id":"", "host_url":"", "host_avatar":"", "host_phone":"",
    }

def call(key,h,c,rp,cursor):
    return search.get(api_key=key,cursor=cursor,check_in=None,check_out=None,
        ne_lat=0,ne_long=0,sw_lat=0,sw_long=0,zoom_value=0,currency=c.get("currency","VND"),
        place_type=None,price_min=0,price_max=0,amenities=[],free_cancellation=False,
        adults=0,children=0,infants=0,min_bedrooms=0,min_beds=0,min_bathrooms=0,
        language=c.get("lang","vi"),proxy_url=c.get("proxy",""),hash=h,raw_params=rp)

def search_range(key, h, c, price_min, price_max, mp, seen, seen_names, rooms, domain, with_host,
                  total_pages_ref, page_offset_ref):
    """Chay 1 search voi khoang gia [price_min, price_max]. Cap nhat seen+rooms in-place."""
    cfg = dict(c)
    if price_min is not None: cfg["price_min"] = price_min
    if price_max is not None: cfg["price_max"] = price_max
    rp = build_raw_params(cfg)
    try:
        data = call(key, h, cfg, rp, "")
    except Exception as e:
        emit({"type":"status","msg":f"search loi (range {price_min}-{price_max}): {str(e)[:80]}"}); return
    pag = GV(data,"data.presentation.staysSearch.results.paginationInfo",{})
    cursors = pag.get("pageCursors",[]) or [""]
    if mp: cursors = cursors[:mp]

    label = ""
    if price_min and price_max: label = f" [{price_min:,}-{price_max:,}]"
    elif price_min:             label = f" [{price_min:,}+]"
    elif price_max:             label = f" [<{price_max:,}]"

    total_pages_ref[0] += len(cursors)
    emit({"type":"meta","pages":total_pages_ref[0],"location":c["location"]})

    def collect(d, page_abs):
        def walk(o):
            if isinstance(o,dict):
                if o.get("__typename")=="StaySearchResult":
                    rec=extract(o,domain)
                    nm=(rec.get("name") or "").strip().lower()
                    if rec["room_id"] and rec["room_id"] not in seen and (not nm or nm not in seen_names):
                        seen.add(rec["room_id"])
                        if nm: seen_names.add(nm)
                        if not with_host:
                            emit({"type":"room","data":rec})
                        rooms.append(rec)
                for v in o.values(): walk(v)
            elif isinstance(o,list):
                for v in o: walk(v)
        walk(d)
        emit({"type":"progress","page":page_abs,"total_pages":total_pages_ref[0],"count":len(rooms)})

    collect(data, page_offset_ref[0]+1)
    for i,cur in enumerate(cursors[1:],2):
        try:
            collect(call(key,h,cfg,rp,cur), page_offset_ref[0]+i)
        except Exception as e:
            emit({"type":"status","msg":f"trang {i}{label} loi: {str(e)[:60]}"})
        time.sleep(0.5)
    page_offset_ref[0] += len(cursors)


def run_one_location(key, h, c, price_ranges, mp, seen, seen_names, rooms, domain, with_host,
                     total_pages_ref, page_offset_ref):
    """Chay search cho 1 location (co the chia nhieu price_ranges)."""
    if price_ranges:
        for rng in price_ranges:
            pmin = rng.get("min") or None
            pmax = rng.get("max") or None
            label = f"{pmin or 0:,}-{pmax or '∞'}"
            emit({"type":"status","msg":f"[{c['location']}] Tìm khoảng giá {label}..."})
            search_range(key,h,c,pmin,pmax,mp,seen,seen_names,rooms,domain,with_host,
                         total_pages_ref,page_offset_ref)
    else:
        rp=build_raw_params(c)
        try:
            data=call(key,h,c,rp,"")
        except Exception as e:
            emit({"type":"status","msg":f"[{c['location']}] search loi: {str(e)[:80]}"}); return
        pag=GV(data,"data.presentation.staysSearch.results.paginationInfo",{})
        cursors=pag.get("pageCursors",[]) or [""]
        if mp: cursors=cursors[:mp]
        total_pages_ref[0]+=len(cursors)
        emit({"type":"meta","pages":total_pages_ref[0],"location":c["location"]})

        def collect(d,page_abs):
            def walk(o):
                if isinstance(o,dict):
                    if o.get("__typename")=="StaySearchResult":
                        rec=extract(o,domain)
                        nm=(rec.get("name") or "").strip().lower()
                        if rec["room_id"] and rec["room_id"] not in seen and (not nm or nm not in seen_names):
                            seen.add(rec["room_id"])
                            if nm: seen_names.add(nm)
                            if not with_host:
                                emit({"type":"room","data":rec})
                            rooms.append(rec)
                    for v in o.values(): walk(v)
                elif isinstance(o,list):
                    for v in o: walk(v)
            walk(d)
            emit({"type":"progress","page":page_abs,"total_pages":total_pages_ref[0],"count":len(rooms)})

        collect(data, page_offset_ref[0]+1)
        for i,cur in enumerate(cursors[1:],2):
            try:
                collect(call(key,h,c,rp,cur), page_offset_ref[0]+i)
            except Exception as e:
                emit({"type":"status","msg":f"trang {i} loi: {str(e)[:60]}"})
            time.sleep(0.5)
        page_offset_ref[0]+=len(cursors)


def main():
    try:
        c=json.loads(sys.argv[1]) if len(sys.argv)>1 else {}
    except Exception as e:
        emit({"type":"error","msg":f"bad config: {e}"}); return
    if not c.get("location"):
        emit({"type":"error","msg":"thieu location"}); return

    domain=c.get("domain","www.airbnb.com.vn"); lang=c.get("lang","vi"); proxy=c.get("proxy","")
    with_host=bool(c.get("with_host"))
    mp=int(c.get("max_pages") or 0)

    try:
        key=api.get(proxy); h=search.fetch_stays_search_hash(proxy)
    except Exception as e:
        emit({"type":"error","msg":f"khong lay duoc key/hash: {e}"}); return

    # nhieu location cach nhau ;
    raw_loc=c.get("location","")
    locations=[l.strip() for l in raw_loc.replace("\n",";").split(";") if l.strip()]
    if not locations: locations=[raw_loc]

    price_ranges = c.get("price_ranges") or []
    seen=set(); seen_names=set(); rooms=[]
    total_pages_ref=[0]; page_offset_ref=[0]

    for loc in locations:
        cfg=dict(c); cfg["location"]=loc
        if len(locations)>1:
            emit({"type":"status","msg":f"--- Địa điểm: {loc} ---"})
        run_one_location(key,h,cfg,price_ranges,mp,seen,seen_names,rooms,domain,with_host,
                         total_pages_ref,page_offset_ref)

    if with_host:
        emit({"type":"status","msg":f"Lay host cho {len(rooms)} phong..."})
        total=total_pages_ref[0]
        for idx,rec in enumerate(rooms,1):
            hn,hid,pic=fetch_host(rec["room_id"],domain,lang,proxy)
            rec["host_name"]=hn; rec["host_id"]=hid; rec["host_avatar"]=pic
            rec["host_url"]=f"https://{domain}/users/show/{hid}" if hid else ""
            emit({"type":"room","data":rec})
            emit({"type":"progress","page":total,"total_pages":total,"count":idx,"phase":"host"})
            time.sleep(0.35)

    emit({"type":"done","count":len(rooms)})

if __name__=="__main__":
    main()
