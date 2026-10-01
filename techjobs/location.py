"""Decide whether a job's location text is in the United States."""
import re

US_STATES = {
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
    "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
    "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
    "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire",
    "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio",
    "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota",
    "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia",
    "wisconsin", "wyoming", "district of columbia",
}
STATE_ABBR = (
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ "
    "NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC"
).split()
US_CITIES = {
    "san francisco", "new york", "nyc", "seattle", "bellevue", "redmond", "mountain view",
    "sunnyvale", "palo alto", "menlo park", "san jose", "santa clara", "cupertino", "los angeles",
    "austin", "boston", "cambridge", "chicago", "denver", "boulder", "atlanta", "washington dc",
    "washington, d.c.", "pittsburgh", "san diego", "portland", "miami", "dallas", "houston",
    "phoenix", "salt lake city", "raleigh", "durham", "ann arbor", "bay area", "sf bay area",
    "silicon valley", "brooklyn", "hawthorne", "redwood city", "san mateo", "irvine", "kirkland",
    "arlington", "reston", "herndon", "nashville", "philadelphia", "minneapolis", "detroit",
}

_US_TOKEN = re.compile(r"\b(united states|usa)\b|\bu\.s\.(a\.)?", re.I)
_US_CODE = re.compile(r"\bUS\b")  # case-sensitive so "us" in prose doesn't match
_STATE_ABBR = re.compile(r"(?:,\s*|\b(?:US|USA)[\s,-]+)(" + "|".join(STATE_ABBR) + r")\b")
_SPLIT = re.compile(r"\s*(?:;|\||•|·|\n| or | and )\s*")
_REMOTE = re.compile(r"\bremote\b|\banywhere\b", re.I)

# Explicit non-US markers: if one of these appears and nothing US-ish does, reject.
NON_US = re.compile(
    r"\b(india|bengaluru|bangalore|hyderabad|pune|chennai|gurgaon|gurugram|noida|mumbai|delhi|"
    r"canada|toronto|vancouver|montreal|uk|united kingdom|london|ireland|dublin|germany|berlin|"
    r"munich|france|paris|netherlands|amsterdam|spain|madrid|barcelona|poland|warsaw|israel|"
    r"tel aviv|japan|tokyo|singapore|australia|sydney|melbourne|brazil|sao paulo|mexico|"
    r"china|shanghai|beijing|taiwan|taipei|korea|seoul|switzerland|zurich|sweden|stockholm|"
    r"emea|apac|latam|europe|czech|prague|romania|portugal|lisbon|italy|milan|denmark|"
    r"copenhagen|finland|norway|belgium|austria|vienna|argentina|colombia|chile|philippines|"
    r"vietnam|indonesia|malaysia|thailand|uae|dubai|saudi|egypt|nigeria|kenya|south africa)\b",
    re.I,
)


def is_us(location: str | None, *, include_plain_remote: bool = True) -> bool:
    """True if the location string looks like a US location.

    `include_plain_remote`: treat a bare "Remote" (no country) as US. Most US
    tech companies' unqualified "Remote" roles are US-only, so this defaults on.
    """
    if not location or not location.strip():
        return include_plain_remote
    # multi-location strings: "San Francisco, CA; London, UK" -> check each part
    parts = [p for p in _SPLIT.split(location) if p.strip()]
    if len(parts) > 1:
        return any(_single_is_us(p, include_plain_remote) for p in parts)
    return _single_is_us(location, include_plain_remote)


def _single_is_us(text: str, include_plain_remote: bool) -> bool:
    text = text.strip()
    low = text.lower()

    # 1) explicit US country wins (handles multi-location "London; New York, US")
    if _US_TOKEN.search(text) or _US_CODE.search(text):
        return True
    # 2) an explicit foreign place loses — e.g. "Cambridge, UK", "Bengaluru, IN"
    if NON_US.search(text):
        return False
    # 3) ", CA"-style state codes, US state names, well-known US cities
    if _STATE_ABBR.search(text):
        return True
    if any(re.search(rf"\b{re.escape(s)}\b", low) for s in US_STATES):
        return True
    if any(re.search(rf"\b{re.escape(c)}\b", low) for c in US_CITIES):
        return True
    if _REMOTE.search(text):
        return include_plain_remote
    return False


def any_us(locations, **kw) -> bool:
    locs = [l for l in locations if l]
    if not locs:
        return is_us(None, **kw)
    return any(is_us(l, **kw) for l in locs)
