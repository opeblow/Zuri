import os, json, time, urllib.request, urllib.error

PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY", "")

BANK_CACHE = {"data": None, "ts": 0}

ALL_BANKS = [
    {"code": "044", "name": "Access Bank"},
    {"code": "023", "name": "Citibank Nigeria"},
    {"code": "050", "name": "Ecobank Nigeria"},
    {"code": "011", "name": "First Bank of Nigeria"},
    {"code": "214", "name": "First City Monument Bank"},
    {"code": "070", "name": "Fidelity Bank"},
    {"code": "058", "name": "Guaranty Trust Bank"},
    {"code": "030", "name": "Heritage Bank"},
    {"code": "221", "name": "Stanbic IBTC Bank"},
    {"code": "016", "name": "Standard Chartered Bank"},
    {"code": "232", "name": "Sterling Bank"},
    {"code": "033", "name": "United Bank for Africa"},
    {"code": "032", "name": "Union Bank of Nigeria"},
    {"code": "035", "name": "Wema Bank"},
    {"code": "215", "name": "Unity Bank"},
    {"code": "076", "name": "Polaris Bank"},
    {"code": "054", "name": "Zenith Bank"},
    {"code": "001", "name": "Globus Bank"},
    {"code": "100", "name": "SunTrust Bank"},
    {"code": "101", "name": "Providus Bank"},
    {"code": "082", "name": "Keystone Bank"},
    {"code": "301", "name": "Jaiz Bank"},
    {"code": "303", "name": "Lotus Bank"},
    {"code": "318", "name": "Optimus Bank"},
    {"code": "307", "name": "Titan Trust Bank"},
    {"code": "066", "name": "Premium Trust Bank"},
    {"code": "999991", "name": "OPay Digital Services Limited"},
    {"code": "999992", "name": "PalmPay Limited"},
    {"code": "50515", "name": "Moniepoint Microfinance Bank"},
    {"code": "50211", "name": "Kuda Microfinance Bank"},
    {"code": "50126", "name": "Eyowo Microfinance Bank"},
    {"code": "51310", "name": "Sparkle (Sparkle Microfinance Bank)"},
    {"code": "51314", "name": "FairMoney Microfinance Bank"},
    {"code": "565", "name": "Carbon (One Finance)"},
    {"code": "327", "name": "Paga"},
    {"code": "566", "name": "VFD Microfinance Bank"},
    {"code": "254", "name": "Rubies Microfinance Bank"},
    {"code": "090267", "name": "Sagegrey Finance"},
    {"code": "090175", "name": "GOALS MFB"},
    {"code": "090275", "name": "Coronation Merchant Bank"},
    {"code": "090267", "name": "Sagegrey Finance"},
    {"code": "090197", "name": "Addosser MFB"},
    {"code": "090484", "name": "Accion Microfinance Bank"},
    {"code": "090290", "name": "Bowen MFB"},
    {"code": "090328", "name": "Pecan Trust MFB"},
    {"code": "090344", "name": "Ampersand Microfinance Bank"},
    {"code": "090356", "name": "Gabsyn Microfinance Bank"},
    {"code": "090330", "name": "Ojokoro Microfinance Bank"},
    {"code": "090272", "name": "Firmus Microfinance Bank"},
    {"code": "090377", "name": "Money Master PSB"},
    {"code": "090434", "name": "AVURU MFB"},
    {"code": "090403", "name": "Terrace MFB"},
    {"code": "090368", "name": "Jubilee Life MFB"},
    {"code": "090393", "name": "Lobrow MFB"},
    {"code": "090448", "name": "Bridgeway Microfinance Bank"},
    {"code": "090110", "name": "Nsukka Microfinance Bank"},
    {"code": "090325", "name": "Supreme MFB"},
    {"code": "090332", "name": "PMF Microfinance Bank"},
    {"code": "090339", "name": "Seed Capital Microfinance Bank"},
    {"code": "090279", "name": "Innov8 MFB"},
    {"code": "090384", "name": "First Apple Finance"},
    {"code": "090360", "name": "Alpha Kapital Microfinance Bank"},
    {"code": "090271", "name": "Vale Finance"},
    {"code": "090283", "name": "Capstone Microfinance Bank"},
    {"code": "090386", "name": "Purplewood Microfinance Bank"},
    {"code": "090273", "name": "Irez Microfinance Bank"},
    {"code": "090333", "name": "Branch International Finance"},
    {"code": "090300", "name": "Ekondo MFB"},
    {"code": "090352", "name": "Morgan International Finance"},
    {"code": "090383", "name": "Balloon Microfinance Bank"},
    {"code": "090362", "name": "Iwo MFB"},
    {"code": "090297", "name": "Payaza MFB"},
    {"code": "090261", "name": "Trust MFB"},
    {"code": "090318", "name": "Benyst Microfinance Bank"},
    {"code": "090389", "name": "Zova MFB"},
    {"code": "090306", "name": "Headway MFB"},
    {"code": "090363", "name": "EdFin Microfinance Bank"},
    {"code": "090371", "name": "Gateway Mortgage Bank"},
    {"code": "090365", "name": "Moyofade MFB"},
    {"code": "090346", "name": "Baines Credit MFB"},
    {"code": "090369", "name": "Kold MFB"},
    {"code": "090286", "name": "Adeyinka Adekoya Microfinance Bank"},
    {"code": "090358", "name": "AG Mortgage Bank PLC"},
    {"code": "090443", "name": "Vault MFB"},
    {"code": "090316", "name": "Abulesoro MFB"},
    {"code": "090361", "name": "Assigned Microfinance Bank"},
    {"code": "090474", "name": "Nacab Microfinance Bank"},
    {"code": "090477", "name": "PSFintech MFB"},
    {"code": "090349", "name": "Okemerc Microfinance Bank"},
    {"code": "090348", "name": "Infinity Trust Mortgage Bank"},
    {"code": "090773", "name": "Include MFB"},
    {"code": "090418", "name": "Tagpay MFB"},
    {"code": "090416", "name": "Wetland Microfinance Bank"},
    {"code": "090492", "name": "Felint MFB"},
    {"code": "090347", "name": "Frontier Microfinance Bank"},
    {"code": "090486", "name": "Nrswt Microfinance Bank"},
    {"code": "090457", "name": "Fulap Microfinance Bank"},
    {"code": "090440", "name": "Prestige Microfinance Bank"},
    {"code": "090490", "name": "Innovectives Karma MFB"},
    {"code": "090409", "name": "One Finance"},
    {"code": "090466", "name": "Verdant Microfinance Bank"},
    {"code": "090464", "name": "Alkanet Microfinance Bank"},
    {"code": "090373", "name": "Baobab Microfinance Bank"},
]

def _fetch_paystack():
    try:
        headers = {"Accept": "application/json"}
        if PAYSTACK_SECRET_KEY:
            headers["Authorization"] = f"Bearer {PAYSTACK_SECRET_KEY}"
        req = urllib.request.Request(
            "https://api.paystack.co/bank?country=nigeria&per_page=200",
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = json.loads(resp.read().decode())
            if body.get("status") and body.get("data"):
                return [
                    {"code": b.get("code", ""), "name": b.get("name", "")}
                    for b in body["data"]
                    if b.get("active")
                ]
    except (urllib.error.URLError, json.JSONDecodeError, KeyError, OSError):
        pass
    return None

def normalize_bank_name(name):
    low = (name or "").lower()
    mapping = [
        ("opay", "OPay"), ("palmpay", "PalmPay"), ("palm pay", "PalmPay"),
        ("moniepoint", "Moniepoint"), ("kuda", "Kuda"),
        ("piggy vest", "PiggyVest"), ("providus", "Providus"),
    ]
    for key, nice in mapping:
        if key in low:
            return nice
    return name

def get_all_banks():
    now = time.time()
    if BANK_CACHE["data"] and now - BANK_CACHE["ts"] < 3600:
        return BANK_CACHE["data"]
    merged = {b["code"]: b for b in ALL_BANKS}
    live = _fetch_paystack()
    if live:
        for b in live:
            if b["code"] and b["code"] not in merged:
                merged[b["code"]] = b
    result = list(merged.values())
    for b in result:
        b = dict(b)
        b["name"] = normalize_bank_name(b["name"])
    result = [dict(b) for b in result]
    BANK_CACHE["data"] = result
    BANK_CACHE["ts"] = now
    return result
