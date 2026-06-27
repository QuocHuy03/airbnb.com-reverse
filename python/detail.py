# -*- coding: utf-8 -*-
"""
Lay chi tiet 1 phong -> in 1 JSON object ra stdout.
Input argv[1] = JSON {room_id, domain, lang}
Output: {ok, detail:{...}} hoac {ok:false, error}
"""
import sys, os, io, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pyairbnb.details as details

_RE_HOST_NAME = re.compile(r'"MeetYourHostSection"[\s\S]{0,300}?"name":"([^"]{1,60})"')
_RE_HOST_ID   = re.compile(r'"hostId":"(\d+)"')
_RE_HOST_PIC  = re.compile(r'"MeetYourHostSection"[\s\S]{0,500}?"profilePictureUrl":"([^"]+)"')

def host_from_html(domain, rid, lang, proxy):
    from curl_cffi import requests
    proxies = {"http":proxy,"https":proxy} if proxy else None
    try:
        t = requests.get(f"https://{domain}/rooms/{rid}", impersonate="chrome124",
                         headers={"Accept-Language":lang}, proxies=proxies, timeout=30).text
        nm=_RE_HOST_NAME.search(t); hid=_RE_HOST_ID.search(t); pic=_RE_HOST_PIC.search(t)
        return {"name":nm.group(1) if nm else "", "id":hid.group(1) if hid else "",
                "avatar":pic.group(1) if pic else ""}
    except Exception:
        return {"name":"","id":"","avatar":""}

def main():
    try:
        c = json.loads(sys.argv[1]) if len(sys.argv)>1 else {}
    except Exception as e:
        print(json.dumps({"ok":False,"error":f"bad config: {e}"})); return
    rid = str(c.get("room_id") or "").strip()
    if not rid:
        print(json.dumps({"ok":False,"error":"thieu room_id"})); return
    domain = c.get("domain","www.airbnb.com.vn"); lang = c.get("lang","vi"); proxy = c.get("proxy","")
    url = f"https://{domain}/rooms/{rid}"
    try:
        d, _price, _cookies = details.get(url, lang, proxy)
    except Exception as e:
        print(json.dumps({"ok":False,"error":f"khong lay duoc chi tiet: {e}"}, ensure_ascii=False)); return

    host = host_from_html(domain, rid, lang, proxy)
    if not (d.get("host") or {}).get("name"):
        d["host"] = host
    else:
        d["host"] = {**d.get("host", {}), **{k:v for k,v in host.items() if v}}
    d["host"]["url"] = f"https://{domain}/users/show/{host['id']}" if host.get("id") else ""
    d["host"]["phone"] = ""  # Airbnb an, khong scrape duoc

    detail = {
        "room_id": rid,
        "url": url,
        "title": d.get("title") if isinstance(d.get("title"), str) else "",
        "description": d.get("description",""),
        "room_type": d.get("room_type",""),
        "person_capacity": d.get("person_capacity",0),
        "is_super_host": d.get("is_super_host",False),
        "is_guest_favorite": d.get("is_guest_favorite",False),
        "coordinates": d.get("coordinates",{}),
        "rating": d.get("rating",{}),
        "images": [{"url":i.get("url",""),"title":i.get("title","")} for i in d.get("images",[])],
        "amenities": [{"title":g.get("title",""),
                       "values":[{"title":a.get("title",""),"available":a.get("available",True)}
                                 for a in g.get("values",[])]}
                      for g in d.get("amenities",[])],
        "highlights": [{"title":h.get("title",""),"subtitle":h.get("subtitle","")}
                       for h in d.get("highlights",[])],
        "house_rules": d.get("house_rules",{}),
        "location_descriptions": d.get("location_descriptions",[]),
        "host": d.get("host",{}),
    }
    print(json.dumps({"ok":True,"detail":detail}, ensure_ascii=False))

if __name__=="__main__":
    main()
