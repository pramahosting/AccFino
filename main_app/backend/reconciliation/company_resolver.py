"""
main_app/backend/reconciliation/company_resolver.py
─────────────────────────────────────────────────────────────────────────────
Resolves the 'Who' column for each transaction.

Resolution order:
  1. Home company aliases → 🟢 Internal
  2. Company alias DB     → canonical name (e.g. "Microsoft", "JB Hi-Fi")
  3. Description parsing  → extract entity from description patterns
  4. Auto-capture unknown companies for admin review

NO extract_who_bank() — all logic is driven by the company DB and
description parsing only.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple


# ══════════════════════════════════════════════════════════════════════════════
# Description parsing — extract entity name from bank statement text
# ══════════════════════════════════════════════════════════════════════════════

# ── Prefixes that introduce an entity name ─────────────────────────────────
_PREFIX = re.compile(
    r"""^(?:
        (?:fast\s+)?transfer\s+(?:to|from)\s+          |  # Transfer To / Transfer From
        tfr\s+(?:to|from)\s+                            |  # TFR To / TFR From
        trf\s+(?:to|from)\s+                            |  # TRF To
        payment\s+(?:to|from)\s+                        |  # Payment To / Payment From
        paid\s+(?:to|by)\s+                             |  # Paid To / Paid By
        received\s+from\s+                              |  # Received From
        direct\s+credit\s+(?:\d{4,10}\s+)?             |  # Direct Credit [BSB/ref]
        direct\s+debit\s+(?:\d{4,10}\s+)?              |  # Direct Debit [BSB/ref]
        osko\s+(?:to|from|payment|credit|debit)\s+      |  # OSKO To / OSKO From
        bpay\s+(?:ref(?:erence)?\s+)?(?:\d+\s+)?    |  # BPAY Reference 123456
        bpay\s+(?:to\s+)?                               |  # BPAY
        (?:internet|online)\s+transfer\s+(?:to|from)\s+ |  # Internet Transfer To
        eft\s+(?:to|from)\s+                            |  # EFT To / EFT From
        pexa\s+(?:transfer|payment)\s+                  |  # PEXA Transfer
        return\s+                                          |  # Return (refund)
        payg\s+\w+\s+                                     |  # PAYG Withholding/Instalment
        direct\s+entry\s+(?:\d{4,10}\s+)?               |  # Direct Entry
        pay\s+anyone\s+(?:to\s+)?                         |  # Pay Anyone To
        salary\s+(?:payment\s+)?                           |  # Salary Payment
        superannuation\s+(?:contribution\s+)?                 # Super Contribution
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# ── Suffixes to strip from extracted entity name ───────────────────────────
_SUFFIX = re.compile(
    r"""(?:
        \s+inv(?:oice)?\s*\d+\w*        |  # INV0100, Invoice 001
        \s*[-–]\s*(?:macq|westpac|anz|nab|cba|commbank|stgeorge|ing|amp|boq|bendigo|suncorp|hsbc|citibank)\b.*  |
        \s+commbank\b.*                  |  # CommBank App savings
        \s+app\s+savings\b.*             |
        \s+(?:internet\s+)?savings\b.*   |
        \s+(?:internet\s+)?banking\b.*   |
        \s+value\s+date\b.*              |  # Value Date: 01/01/2025
        \s+card\s+xx\w*\b.*             |  # Card xx0174
        \s+payid\b.*                     |
        \s+bsb\b.*                       |
        \s+a\/c\b.*                      |
        \s+(?:ref|reference)\s*[:#]?\s*\w+\s*$  |
        \s+\d{6,}\s*$                    |  # trailing 6+ digit account numbers
        \s+\(\w+\)\s*$                      # trailing (code)
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# ── Card transaction: MERCHANT [CITY] AU Card xx####  ──────────────────────
_CARD = re.compile(
    r"^(.+?)\s+(?:[A-Z][a-z]+\s+)?(?:AU|US|GB|NZ|SG|CA|EU)\s+Card\s+xx",
    re.IGNORECASE,
)

# ── Merchant*Reference: UBER*EATS REF, APPLE.COM/BILL ──────────────────────
_STAR = re.compile(r"^([^*\s][^*]{1,40}?)\s*\*\s*\S")

# ── Trailing noise to clean from any extracted name ────────────────────────
_TRAIL_NOISE = re.compile(
    r"""(?:
        \s*[-–#@]\s*$                |  # trailing dash, hash, at
        \s+(?:au|pty|ltd|pty\.?\s*ltd\.?|limited|inc\.?|llc|corp\.?)\s*$  |
        \s+sydney\s*$|
        \s+melbourne\s*$|
        \s+brisbane\s*$|
        \s+perth\s*$|
        \s+adelaide\s*$
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# ── Digits-only / BSB at start (e.g. "158824 SINGH PRAMOD") ───────────────
_LEADING_DIGITS = re.compile(r"^\d[\d\s]{3,}\s+")


def extract_entity(desc: str) -> str:
    """
    Extract a company or person name from a bank statement description.

    Handles:
      Transfer To Headstart Finances Australia CommBank App savings
        → "Headstart Finances Australia"
      Direct Credit 158824 SINGH PRAMOD KUM 69647
        → "Singh Pramod Kum"
      Direct Credit 141000 INNOMATE PTY LTD INV0100
        → "Innomate Pty Ltd"
      Microsoft-G097235073 Sydney AU Card xx0174
        → "Microsoft"
      UBER *ONE SYDNEY AU Card xx0174
        → "Uber"
      JB HI-FI DIRECT SOUTHBANK AU Card xx0174
        → "Jb Hi-Fi Direct"
      MICROSOFT#G092337400 MSBILL.INFO AU Card xx0174
        → "Microsoft"
    """
    text = desc.strip()
    if not text:
        return ""

    entity = ""

    # ── Strategy 1: Prefix pattern (Transfer To / Direct Credit / etc.) ────
    m = _PREFIX.match(text)
    if m:
        raw = text[m.end():]
        # Remove trailing BSB/account if Direct Credit didn't catch it
        raw = _LEADING_DIGITS.sub("", raw)
        # Cut at suffix noise
        raw = _SUFFIX.split(raw)[0]
        raw = _TRAIL_NOISE.sub("", raw).strip()
        # Strip trailing standalone digits (account numbers after name)
        raw = re.sub(r"\s+\d+\s*$", "", raw).strip()
        if len(raw) >= 3 and not raw.isdigit():
            entity = raw

    # ── Strategy 2: Card transaction ───────────────────────────────────────
    elif _CARD.match(text):
        m2 = _CARD.match(text)
        raw = m2.group(1).strip()
        # Strip trailing reference codes only when preceded by a space
        # (catches "MICROSOFT-G097235073" but not "7-ELEVEN" or "JB HI-FI")
        raw = re.sub(r"\s+[-#]\w+$", "", raw).strip()
        # Strip trailing standalone numbers (store/transaction IDs like "1234")
        raw = re.sub(r"\s+\d+\s*$", "", raw).strip()
        # Strip trailing ALL-CAPS suburb/city tokens (SOUTHBANK, AUBURN, HOMEBUSH)
        # Only strip if preceded by a space (not part of the name itself)
        raw = re.sub(r"\s+[A-Z][A-Z0-9]{2,}$", "", raw).strip()
        # Strip .COM/.COM/BILL domain suffixes
        raw = re.sub(r"\.com.*$", "", raw, flags=re.IGNORECASE).strip()
        if len(raw) >= 2:
            entity = raw

    # ── Strategy 3: Merchant*Reference ─────────────────────────────────────
    elif _STAR.match(text):
        m3 = _STAR.match(text)
        raw = m3.group(1).strip()
        if len(raw) >= 3:
            entity = raw

    # ── Clean up and title-case ────────────────────────────────────────────
    if entity:
        # Remove any remaining BSB/account digits at start
        entity = _LEADING_DIGITS.sub("", entity).strip()
        # Final noise cleanup
        entity = _TRAIL_NOISE.sub("", entity).strip()
        if len(entity) >= 3 and not entity.isdigit():
            return entity.title()

    return ""


# ══════════════════════════════════════════════════════════════════════════════
# CompanyResolver
# ══════════════════════════════════════════════════════════════════════════════

class CompanyResolver:
    """
    Resolves the 'Who' field from a transaction description.

    Resolution order:
      1. Home company aliases (→ Internal transfer)
      2. Company alias DB    (→ canonical name)
      3. Description parsing (→ extracted entity)
      4. Auto-capture unknown companies for admin review
    """

    def __init__(
        self,
        db=None,
        home_company: str = "",
        home_aliases: Optional[list] = None,
    ):
        self.db            = db
        self.home_company  = (home_company or "").strip()
        self._alias_cache: dict = {}
        self._cache_loaded = False
        self._home_aliases: set = set()
        if self.home_company:
            self._home_aliases = _generate_home_aliases(
                self.home_company, home_aliases or []
            )

    # ── DB alias cache ─────────────────────────────────────────────────────
    def _load_alias_cache(self):
        if self._cache_loaded or not self.db:
            return
        try:
            from db_app.models.company import Company, CompanyAlias
            rows = (
                self.db.query(CompanyAlias.alias, Company.name)
                .join(Company, CompanyAlias.company_id == Company.id)
                .filter(Company.approved == True)
                .order_by(CompanyAlias.priority.desc())
                .all()
            )
            for alias, name in rows:
                self._alias_cache[alias.strip().lower()] = name
        except Exception:
            pass
        self._cache_loaded = True

    # ── Main resolver ──────────────────────────────────────────────────────
    def resolve(
        self,
        description: str,
        debit: float = 0.0,
        credit: float = 0.0,
    ) -> Tuple[str, bool]:
        """
        Returns (who_name, is_internal).
        is_internal=True means the transaction matches the user's home company.
        """
        desc = (description or "").strip()
        if not desc:
            return "", False

        desc_lower = desc.lower()

        # ── Step 1: Home company check ─────────────────────────────────────
        if self.home_company and self._home_aliases:
            for alias in sorted(self._home_aliases, key=len, reverse=True):
                if alias in desc_lower:
                    return self.home_company, True

        # ── Step 2: Extract entity name from description ───────────────────
        # Do this BEFORE DB lookup so we search a clean entity name (not the
        # full description) against aliases. This prevents "commbank" alias
        # matching inside "Transfer To Harsh Singh - Macq CommBank App savings".
        extracted = extract_entity(desc)
        search_target = extracted.lower() if extracted else desc_lower

        # ── Step 3: Company alias DB lookup ───────────────────────────────
        self._load_alias_cache()
        if self._alias_cache:
            # Pass 1: search extracted entity / description
            match = _alias_lookup(search_target, self._alias_cache)
            if match:
                return match, False

            # Pass 2: try full description ONLY for card/star patterns
            # (NOT for Transfer To / Direct Credit — those have a clean extracted entity
            # and searching the full description causes false matches like CommBank)
            if extracted and search_target != desc_lower:
                _is_transfer_desc = bool(_PREFIX.match(desc))
                if not _is_transfer_desc:
                    match = _alias_lookup(desc_lower, self._alias_cache)
                    if match:
                        return match, False

        # ── Step 4: Return extracted entity name ──────────────────────────
        if extracted:
            return extracted, False

        return "", False

    # ── Auto-capture unknown companies ────────────────────────────────────
    def capture_new_company(self, who: str, description: str):
        """Save newly-seen entity to DB as pending — admin can approve it."""
        if not self.db or not who or not who.strip():
            return
        try:
            from db_app.models.company import Company
            exists = (
                self.db.query(Company)
                .filter(Company.name.ilike(f"%{who}%"))
                .first()
            )
            if not exists:
                self.db.add(Company(
                    name=who, short_name=who[:50],
                    category="Unknown", country="AU", approved=False,
                ))
                self.db.commit()
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _alias_lookup(text: str, cache: dict) -> str:
    """
    Search the alias cache against text.
    Returns canonical company name or "" if no match.
    Longer aliases are checked first (more specific wins).
    Short aliases (≤4 chars) use word-boundary matching to avoid
    false positives like "ing" inside "SINGH".
    """
    for alias in sorted(cache.keys(), key=len, reverse=True):
        if alias not in text:
            continue
        if len(alias) <= 4:
            if not re.search(r'\b' + re.escape(alias) + r'\b', text):
                continue
        return cache[alias]
    return ""


def _generate_home_aliases(name: str, extra: list) -> set:
    """
    Auto-generate search aliases from a company name.
    "Headstart Finances Australia Pty Ltd"
      → {"headstart finances australia pty ltd", "headstart finances australia",
         "headstart finances", "headstart", "hfa"}
    """
    aliases: set = set()
    n = name.strip().lower()
    aliases.add(n)

    # Strip legal suffixes progressively
    for suffix in [" pty ltd", " pty. ltd.", " limited", " ltd",
                   " pty", " co.", " inc.", " llc", " llp",
                   " incorporated", " corporation", " corp."]:
        if n.endswith(suffix):
            aliases.add(n[:-len(suffix)].strip())

    # First 1, 2, 3 significant words
    words = [w for w in n.split() if len(w) >= 4
             and w not in {"pty", "ltd", "the", "and", "for", "with"}]
    for i in range(1, min(4, len(words) + 1)):
        aliases.add(" ".join(words[:i]))

    # Acronym from capital letters
    acronym = "".join(c for c in name if c.isupper()).lower()
    if len(acronym) >= 2:
        aliases.add(acronym)

    for e in extra:
        aliases.add(e.strip().lower())

    return {a for a in aliases if len(a) >= 3}


# ── Convenience wrapper ────────────────────────────────────────────────────

def resolve_who(
    description: str,
    home_company: str = "",
    db=None,
    debit: float = 0.0,
    credit: float = 0.0,
) -> Tuple[str, bool]:
    resolver = CompanyResolver(db=db, home_company=home_company)
    return resolver.resolve(description, debit, credit)
