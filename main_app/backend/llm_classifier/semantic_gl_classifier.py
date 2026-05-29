"""
GL Account + GST Classifier
Priority: RDR rules → keywords (fast) → nomic-embed-text → qwen2.5:7b (only if unmatched)
main_app/backend/llm_classifier/semantic_gl_classifier.py
"""
import csv, hashlib, json, math
from pathlib import Path
from typing import Optional, Tuple
import urllib.request as _ur

OLLAMA_BASE = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
LLM_MODEL   = "qwen2.5:7b"

COA_PATH   = Path(__file__).resolve().parents[2] / "data" / "ChartOfAccounts.csv"
CACHE_PATH = Path(__file__).resolve().parent / "gl_embed_cache.json"

SIMILARITY_THRESHOLD = 0.72
CONFIDENCE_GAP       = 0.05

# ── GST per account name / type ───────────────────────────────────────────────
_NAME_GST = {
    "Wages":                      "BAS Excluded",
    "Superannuation":             "BAS Excluded",
    "Dividends":                  "BAS Excluded",
    "Owner A Share Capital":      "BAS Excluded",
    "Depreciation":               "BAS Excluded",
    "Assets Immediate Write off": "BAS Excluded",
    "Council Rates":              "BAS Excluded",
    "Interest Income":            "Input Taxed Sales",
    "Bank Fees":                  "Input Taxed Sales",
    "Donation":                   "GST Free Sale",
    "Transfer":                   "BAS Excluded",
    "GST":                        "BAS Excluded",
}
_TYPE_GST = {
    "Revenue":      "GST on Sale",
    "Direct Costs": "GST on Purchase",
    "Expense":      "GST on Purchase",
    "Fixed Asset":  "GST on Purchase",
    "Inventory":    "GST on Purchase",
    "Equity":       "BAS Excluded",
    "GST":          "BAS Excluded",
}

# ── Full keyword table ────────────────────────────────────────────────────────
# ORDER MATTERS: more specific entries first
_KW: list = [
    # ── Income ───────────────────────────────────────────────────────────────
    (["salary deposit","salary credit","payroll deposit","wages credit",
      "pay run","payg","wage payment","payday","salary transfer"],
     "Wages", "BAS Excluded"),

    (["interest received","interest income","term deposit interest",
      "savings interest","interest earned"],
     "Interest Income", "Input Taxed Sales"),

    (["invoice paid","invoice payment","client payment","consulting fee received",
      "advisory fee","professional fee received","service fee received",
      "retainer received","project payment received","payment received"],
     "Services", "GST on Sale"),

    (["product sale","goods sold","merchandise sale","sales revenue"],
     "Product Sales", "GST on Sale"),

    (["rent received","rental income","lease received","sublease income"],
     "Other Revenue", "GST on Sale"),

    # ── Bank / finance ────────────────────────────────────────────────────────
    (["bank fee","bank charge","account fee","dishonour fee","overdrawn fee",
      "eftpos fee","atm fee","monthly account fee","annual account fee",
      "transaction fee","service fee bank","bank service"],
     "Bank Fees", "Input Taxed Sales"),

    # ── Payroll ───────────────────────────────────────────────────────────────
    (["superannuat","smsf","super contrib","super payment","super fund",
      "superannuation sgc"],
     "Superannuation", "BAS Excluded"),

    # ── Marketing ─────────────────────────────────────────────────────────────
    (["facebook ads","google ads","instagram ads","linkedin ads","tiktok ads",
      "social media ad","marketing","advertis","campaign spend","sponsored post",
      "seo service","google analytics","adwords"],
     "Marketing & Advertisement", "GST on Purchase"),

    # ── Fuel / vehicle — before generic "service" ─────────────────────────────
    (["caltex","ampol","bp ","shell ","7-eleven fuel","united petrol",
      "petrol","diesel","fuel pump","bowser","service station","servo "],
     "Motor Vehicle Expenses", "GST on Purchase"),

    (["car wash","vehicle wash","rego renewal","car registration",
      "vehicle registration","parking fee","parking meter","toll ",
      "etag ","linkt","roam express","mechanic","auto service",
      "tyre","windscreen","roadside assist"],
     "Motor Vehicle Expenses", "GST on Purchase"),

    # ── Food delivery — before generic uber ───────────────────────────────────
    (["uber eats","ubereats","doordash","menulog","deliveroo","grubhub",
      "eatnow","foodora"],
     "Entertainment", "GST on Purchase"),

    # ── Restaurants / cafes / food ────────────────────────────────────────────
    (["restaurant","cafe","coffee shop","coffee house","dominos","domino",
      "mcdonald","hungry jacks","kfc","subway","nandos","pizza hut","pizza",
      "sushi","thai food","chinese food","indian food","fish and chips",
      "burger","grill","oporto","guzman","el jannah","roll'd",
      "schnitz","zambreros","boost juice","chatime","gong cha",
      "starbucks","hudsons coffee","gloria jeans"],
     "Entertainment", "GST on Purchase"),

    # ── Travel — after food delivery ──────────────────────────────────────────
    (["uber ","ola ride","didi ride","taxi","cabcharge",
      "qantas","virgin australia","jetstar","tigerair","rex airline",
      "flight centre","booking.com","hotels.com","airbnb","hotel ",
      "motel","accommodation","expedia","wotif","trivago"],
     "Travel & Accommodation", "GST on Purchase"),

    # ── Insurance ─────────────────────────────────────────────────────────────
    (["insurance","insur ","gio ","aami ","nrma ","allianz","aig ",
      "zurich","racv ","racq ","ctp ","policy renewal","cover-more"],
     "Insurance", "GST on Purchase"),

    # ── Telecoms ─────────────────────────────────────────────────────────────
    (["optus","telstra","vodafone","tpg ","aussie broadband","iinet",
      "spintel","lebara","amaysim","belong ","boost mobile",
      "phone bill","mobile plan","mobile bill","phone plan"],
     "Telephone & Internet", "GST on Purchase"),

    (["nbn ","internet plan","broadband plan","isp ","adsl","fibre"],
     "Telephone & Internet", "GST on Purchase"),

    # ── Utilities ─────────────────────────────────────────────────────────────
    (["electricity","origin energy","agl ","energyaustralia","aurora energy",
      "simply energy","momentum energy","gas bill","power bill",
      "water bill","sydney water","yarra valley water","sa water"],
     "Utilities", "GST on Purchase"),

    # ── Council / rates ───────────────────────────────────────────────────────
    (["council rate","council levy","land tax","water rate","strata levy",
      "strata fee","body corporate"],
     "Council Rates", "BAS Excluded"),

    # ── Rent ─────────────────────────────────────────────────────────────────
    (["office rent","rent payment","lease payment","property lease",
      "commercial rent","warehouse rent","storage rent"],
     "Rent", "GST on Purchase"),

    # ── Software / subscriptions ──────────────────────────────────────────────
    (["netflix","spotify","disney+","apple tv+","binge ","stan ","paramount+",
      "adobe ","microsoft 365","office 365","dropbox","slack ","zoom ",
      "xero ","myob ","reckon","quickbooks","github ","aws ","google cloud",
      "google workspace","azure ","digitalocean","cloudflare","heroku",
      "saas ","subscription","monthly plan","annual plan","software licence"],
     "Subscriptions", "GST on Purchase"),

    # ── Repairs / maintenance ─────────────────────────────────────────────────
    (["bunnings","mitre 10","total tools","hardware store","tradelink",
      "reece plumbing","plumbing supplies"],
     "Repairs and Maintenance", "GST on Purchase"),

    (["repair","maintenance","plumber","plumbing","electrician","electrical ",
      "hvac ","air con service","tradesman","service call","handyman"],
     "Repairs and Maintenance", "GST on Purchase"),

    # ── Office supplies ───────────────────────────────────────────────────────
    (["officeworks","stationery","toner cartridge","ink cartridge",
      "paper ream","office supply","pens ","notebooks","staples "],
     "Office Expenses", "GST on Purchase"),

    # ── Cleaning ─────────────────────────────────────────────────────────────
    (["cleaning","cleaner","janitor","hygiene service","commercial clean",
      "window clean","carpet clean"],
     "Cleaning", "GST on Purchase"),

    # ── Professional / accounting / legal ────────────────────────────────────
    (["accounting fee","bookkeeping","tax agent","audit fee","cpa ",
      "bdo ","pwc ","kpmg ","deloitte","ey ","grant thornton"],
     "Accounting & Legal Fees", "GST on Purchase"),

    (["legal fee","solicitor","lawyer","barrister","conveyancing",
      "law firm","legal advice"],
     "Accounting & Legal Fees", "GST on Purchase"),

    # ── Postage / freight ─────────────────────────────────────────────────────
    (["auspost","australia post","dhl ","fedex","startrack","toll ipec",
      "couriers please","sendle","courier ","postage","freight","delivery fee"],
     "Postage & Freight", "GST on Purchase"),

    # ── Training ─────────────────────────────────────────────────────────────
    (["training","course fee","seminar","workshop","udemy","linkedin learning",
      "tafe ","skillshare","coursera","masterclass"],
     "Training & Education", "GST on Purchase"),

    # ── Printing ─────────────────────────────────────────────────────────────
    (["printing","print job","photocopy","signage","banner","brochure print"],
     "Printing & Stationery", "GST on Purchase"),

    # ── Computer equipment ────────────────────────────────────────────────────
    (["macbook","imac","ipad","iphone ","samsung galaxy","dell laptop",
      "lenovo laptop","hp laptop","computer purchase","monitor purchase",
      "keyboard","mouse purchase","webcam","headset"],
     "Computer Equipment", "GST on Purchase"),

    # ── Office equipment ──────────────────────────────────────────────────────
    (["office furniture","desk ","chair ","whiteboard","projector",
      "office equipment","scanner","photocopier","shredder"],
     "Office Equipment", "GST on Purchase"),

    # ── Subcontractors ────────────────────────────────────────────────────────
    (["subcontract","subcontractor","labour hire","contractor invoice",
      "freelancer","airtasker","hipages"],
     "Subcontractors", "GST on Purchase"),

    # ── COGS / inventory ──────────────────────────────────────────────────────
    (["cost of goods","cogs","inventory purchase","stock purchase",
      "raw material","wholesale purchase","materials purchase"],
     "Cost of Goods Sold", "GST on Purchase"),

    (["project purchase","project material","project supplies","job material"],
     "Project Purchases", "GST on Purchase"),

    # ── Equity ────────────────────────────────────────────────────────────────
    (["dividend payment","owner drawing","drawings","distribution payment",
      "owner withdrawal"],
     "Dividends", "BAS Excluded"),

    (["share capital","capital injection","equity contribution","paid up capital"],
     "Owner A Share Capital", "BAS Excluded"),

    # ── Depreciation ──────────────────────────────────────────────────────────
    (["depreciation","amortis"],
     "Depreciation", "BAS Excluded"),

    # ── General retail — AFTER specific stores ────────────────────────────────
    (["woolworths","coles","aldi ","iga ","foodworks","supermarket","grocery store"],
     "Office Expenses", "GST on Purchase"),

    (["bigw","kmart","target ","myer ","david jones","harvey norman",
      "jb hi-fi","the good guys","costco","ikea"],
     "Office Expenses", "GST on Purchase"),

    # ── Donation ─────────────────────────────────────────────────────────────
    (["donation","charity","fundrais","community fund","red cross","cancer council"],
     "Donation", "GST Free Sale"),

    # ── Salary catch-all — LAST ───────────────────────────────────────────────
    (["salary","wages","pay "],
     "Wages", "BAS Excluded"),
]


def _keyword_match(desc: str, credit: float) -> Tuple[str, str]:
    """Returns (gl_name, gst_category) or ('','') if no match."""
    dl = desc.lower()
    for (keywords, gl, gst) in _KW:
        for kw in keywords:
            if kw in dl:
                return gl, gst
    return "", ""


def _gst_for_account(name: str, coa_type: str, credit: float) -> str:
    if name in _NAME_GST:
        return _NAME_GST[name]
    if coa_type in _TYPE_GST:
        t = _TYPE_GST[coa_type]
        return t
    return "GST on Purchase" if credit == 0 else "GST on Sale"


def _cosine(a: list, b: list) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na  = math.sqrt(sum(x * x for x in a))
    nb  = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def _http_post(url: str, body: dict, timeout: int = 10) -> dict:
    payload = json.dumps(body).encode()
    req = _ur.Request(url, data=payload,
                      headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(_ur.urlopen(req, timeout=timeout).read())


def _check_ollama() -> Tuple[bool, str]:
    try:
        resp = json.loads(_ur.urlopen(f"{OLLAMA_BASE}/api/tags", timeout=3).read())
        models = [m["name"] for m in resp.get("models", [])]
        if not models:
            return False, ""
        for pref in ["qwen2.5:7b", "qwen2.5", "llama3.2", "llama3", "mistral"]:
            m = next((x for x in models if x.startswith(pref)), None)
            if m:
                return True, m
        return True, models[0]
    except Exception:
        return False, ""


def _embed(text: str) -> Optional[list]:
    try:
        resp = _http_post(f"{OLLAMA_BASE}/api/embeddings",
                          {"model": EMBED_MODEL, "prompt": text}, timeout=10)
        return resp.get("embedding")
    except Exception:
        return None


def _chat(system: str, user: str, model: str) -> str:
    try:
        resp = _http_post(
            f"{OLLAMA_BASE}/api/chat",
            {"model": model, "stream": False,
             "messages": [{"role": "system", "content": system},
                          {"role": "user",   "content": user}],
             "options": {"temperature": 0.0}},
            timeout=20,
        )
        return (resp.get("message", {}).get("content") or "").strip().strip(".")
    except Exception:
        return ""


def _load_coa() -> list:
    rows = []
    try:
        with open(COA_PATH, newline="", encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                n = (row.get("*Name") or row.get("Name") or "").strip()
                t = (row.get("*Type") or row.get("Type") or "").strip()
                d = (row.get("Description") or "").strip()
                if n:
                    rows.append({"name": n, "type": t, "desc": d})
    except Exception as e:
        print(f"[semantic_gl] CoA load error: {e}")
    return rows


def _build_embeddings(coa: list) -> dict:
    names_hash = hashlib.md5(
        json.dumps([r["name"] for r in coa]).encode()).hexdigest()[:12]
    if CACHE_PATH.exists():
        try:
            cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            if cache.get("hash") == names_hash and len(cache.get("embeddings", {})) > 0:
                print(f"[semantic_gl] Loaded {len(cache['embeddings'])} cached embeddings")
                return cache["embeddings"]
        except Exception:
            pass

    print(f"[semantic_gl] Building embeddings for {len(coa)} accounts...")
    embeddings = {}
    for row in coa:
        text = f"{row['type']} — {row['name']}"
        if row["desc"]:
            text += f": {row['desc']}"
        vec = _embed(text)
        if vec:
            embeddings[row["name"]] = vec
            print(f"  ✓ {row['name']}")
        else:
            print(f"  ✗ {row['name']}")
    try:
        CACHE_PATH.write_text(
            json.dumps({"hash": names_hash, "embeddings": embeddings},
                       ensure_ascii=False),
            encoding="utf-8")
        print(f"[semantic_gl] Cached {len(embeddings)} embeddings")
    except Exception:
        pass
    return embeddings


class SemanticGLClassifier:
    _instance = None

    def __init__(self):
        self._coa        = []
        self._embeddings = {}
        self._coa_type   = {}  # {name: type}
        self._ready      = False
        self._ollama_ok  = False
        self._llm_model  = ""

    @classmethod
    def get(cls) -> "SemanticGLClassifier":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _init(self):
        if self._ready:
            return
        self._ollama_ok, self._llm_model = _check_ollama()
        if not self._ollama_ok:
            print("[semantic_gl] Ollama unavailable — keyword fallback only")
            self._ready = True
            return
        print(f"[semantic_gl] Ollama OK, model: {self._llm_model}")
        self._coa      = _load_coa()
        self._coa_type = {r["name"]: r["type"] for r in self._coa}
        self._embeddings = _build_embeddings(self._coa)
        self._ready    = True

    def classify(self, description: str,
                 debit: float = 0.0, credit: float = 0.0) -> Tuple[str, str]:
        """
        Returns (gl_account, gst_category).
        Priority:
          1. Keywords  — instant, covers ~90% of Australian business transactions
          2. Embedding — nomic-embed-text cosine similarity (only if no keyword match)
          3. LLM       — qwen2.5:7b (only if similarity is ambiguous)
          4. Fallback  — credit→Services, debit→Office Expenses
        """
        self._init()
        desc = (description or "").strip()
        if not desc:
            return "", "Unknown"

        # ── 1. Keywords first — fast, deterministic ───────────────────────────
        gl, gst = _keyword_match(desc, credit)
        if gl:
            return gl, gst

        # ── 2. Embedding similarity (only if Ollama available) ────────────────
        if not self._ollama_ok or not self._embeddings:
            # No keyword match, no Ollama → safe default
            return ("Services", "GST on Sale") if credit > 0 \
                else ("Office Expenses", "GST on Purchase")

        ctx = "income received" if credit > 0 else "expense paid"
        vec = _embed(f"{desc} — {ctx}")
        if not vec:
            return ("Services", "GST on Sale") if credit > 0 \
                else ("Office Expenses", "GST on Purchase")

        scores = sorted(
            [((_cosine(vec, emb)), name)
             for name, emb in self._embeddings.items()],
            reverse=True
        )
        if not scores:
            return ("Services", "GST on Sale") if credit > 0 \
                else ("Office Expenses", "GST on Purchase")

        top_score, top_name   = scores[0]
        second_score          = scores[1][0] if len(scores) > 1 else 0.0
        gap                   = top_score - second_score

        # ── 3. High confidence similarity → use directly ──────────────────────
        if top_score >= SIMILARITY_THRESHOLD and gap >= CONFIDENCE_GAP:
            coa_type = self._coa_type.get(top_name, "Expense")
            return top_name, _gst_for_account(top_name, coa_type, credit)

        # ── 4. Ambiguous → ask qwen2.5 to pick from top candidates ────────────
        candidates = [name for (_, name) in scores[:6]]
        coa_all    = ", ".join(r["name"] for r in self._coa)
        result = _chat(
            "You are an Australian accounting GL classifier. "
            "Return ONLY the exact account name — no explanation, no punctuation.",
            f"Transaction: {desc}\n"
            f"Type: {'income' if credit > 0 else 'expense'}\n"
            f"Top candidates: {', '.join(candidates)}\n"
            f"All valid accounts: {coa_all}\n"
            f"Reply with one account name only.",
            self._llm_model,
        )
        if result:
            # Exact match
            for r in self._coa:
                if r["name"].lower() == result.lower():
                    return r["name"], _gst_for_account(r["name"], r["type"], credit)
            # Partial match
            for r in self._coa:
                if r["name"].lower() in result.lower() \
                        or result.lower() in r["name"].lower():
                    return r["name"], _gst_for_account(r["name"], r["type"], credit)

        # ── 5. Fall back to top similarity result ─────────────────────────────
        coa_type = self._coa_type.get(top_name, "Expense")
        return top_name, _gst_for_account(top_name, coa_type, credit)

    def rebuild(self):
        SemanticGLClassifier._instance = None
        self._ready      = False
        self._embeddings = {}
        if CACHE_PATH.exists():
            try: CACHE_PATH.unlink()
            except Exception: pass


# ── Singleton ─────────────────────────────────────────────────────────────────
_clf = SemanticGLClassifier.get()


def classify_gl_gst(description: str,
                    debit: float = 0.0,
                    credit: float = 0.0) -> Tuple[str, str]:
    """Public API — returns (gl_account, gst_category)."""
    return _clf.classify(description, debit, credit)


def classify_gl(description: str, debit: float = 0.0,
                credit: float = 0.0, predicted_type: str = "") -> str:
    gl, _ = _clf.classify(description, debit, credit)
    return gl


def rebuild_embeddings():
    _clf.rebuild()
    SemanticGLClassifier._instance = None


def classifier_status() -> dict:
    _clf._init()
    return {
        "ollama_available": _clf._ollama_ok,
        "llm_model":        _clf._llm_model,
        "embed_model":      EMBED_MODEL,
        "coa_accounts":     len(_clf._embeddings),
        "ready":            _clf._ready,
    }