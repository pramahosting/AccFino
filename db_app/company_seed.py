"""
db_app/company_seed.py
─────────────────────────────────────────────────────────────────────────────
Seed data for the company database.

Structure: (name, short_name, category, subcategory, country, abn,
            is_government, [alias, alias, ...])

Call seed_companies(db) once during db init.
New entries here will be inserted on next startup if not already present.
"""
from __future__ import annotations
from typing import List, Tuple, Optional

# (name, short_name, category, subcategory, country, abn, is_gov, aliases)
SEED: List[Tuple] = [

    # ══════════════════════════════════════════════════════════════════════
    # AUSTRALIAN GOVERNMENT BODIES
    # ══════════════════════════════════════════════════════════════════════
    ("Australian Taxation Office", "ATO", "Government", "Federal Revenue", "AU",
     "52 824 753 556", True,
     ["ato", "australian taxation office", "tax office", "ato.gov.au",
      "ato payment", "tax payment ato", "payg ato", "gst ato", "bas ato",
      "income tax ato", "superannuation ato"]),

    ("Australian Securities and Investments Commission", "ASIC", "Government",
     "Federal Regulator", "AU", "26 665 134 540", True,
     ["asic", "asic.gov.au", "asic fee", "asic annual fee", "asic lodgement"]),

    ("Australian Business Registry Services", "ABRS", "Government",
     "Federal Registry", "AU", "", True,
     ["abrs", "abr", "australian business registry"]),

    ("Australian Prudential Regulation Authority", "APRA", "Government",
     "Federal Regulator", "AU", "", True,
     ["apra", "apra levy"]),

    ("Australian Competition and Consumer Commission", "ACCC", "Government",
     "Federal Regulator", "AU", "", True,
     ["accc"]),

    ("Services Australia", "Services AU", "Government", "Federal Services", "AU",
     "", True,
     ["services australia", "centrelink", "medicare", "myagedcare",
      "child support", "family assistance"]),

    ("Department of Home Affairs", "Home Affairs", "Government",
     "Federal Department", "AU", "", True,
     ["home affairs", "immigration", "border force", "abf"]),

    ("Australian Federal Police", "AFP", "Government", "Federal Law Enforcement",
     "AU", "", True,
     ["afp", "australian federal police"]),

    ("Fair Work Commission", "FWC", "Government", "Federal Regulator", "AU",
     "", True,
     ["fair work commission", "fair work ombudsman", "fwc", "fwo"]),

    ("Australian Bureau of Statistics", "ABS", "Government", "Federal Statistics",
     "AU", "", True,
     ["abs", "australian bureau of statistics"]),

    ("NDIS", "NDIS", "Government", "Federal Disability", "AU",
     "", True,
     ["ndis", "national disability insurance", "ndia"]),

    ("Department of Veterans Affairs", "DVA", "Government",
     "Federal Department", "AU", "", True,
     ["dva", "veterans affairs", "department of veterans"]),

    ("Australian Postal Corporation", "Australia Post", "Government",
     "Postal Services", "AU", "28 864 970 579", True,
     ["australia post", "auspost", "aus post", "australian post",
      "express post", "parcel post"]),

    ("State Revenue Office Victoria", "SRO VIC", "Government",
     "State Revenue", "AU", "", True,
     ["sro", "state revenue office", "land tax", "payroll tax vic",
      "stamp duty", "land transfer duty"]),

    ("Revenue NSW", "Revenue NSW", "Government", "State Revenue", "AU",
     "", True,
     ["revenue nsw", "osr nsw", "fine notice", "service nsw"]),

    ("Queensland Revenue Office", "QRO", "Government", "State Revenue", "AU",
     "", True,
     ["qro", "queensland revenue office", "payroll tax qld"]),

    ("WorkSafe Victoria", "WorkSafe", "Government",
     "State Regulator", "AU", "", True,
     ["worksafe", "worksafe vic", "worksafe victoria", "workcover"]),

    ("SafeWork NSW", "SafeWork NSW", "Government", "State Regulator", "AU",
     "", True,
     ["safework nsw", "workcover nsw"]),

    ("Transport for NSW", "TfNSW", "Government", "State Transport", "AU",
     "", True,
     ["transport for nsw", "rms", "roads and maritime", "service nsw rego",
      "vehicle registration nsw", "tfnsw"]),

    ("VicRoads", "VicRoads", "Government", "State Transport", "AU",
     "", True,
     ["vicroads", "vic roads", "vehicle registration vic", "rego vic"]),

    ("Australian Superannuation Regulatory Authority", "SARA", "Government",
     "Federal Super", "AU", "", True,
     ["australian super", "austsuper", "australiansuper"]),

    # ══════════════════════════════════════════════════════════════════════
    # AUSTRALIAN BANKS
    # ══════════════════════════════════════════════════════════════════════
    ("Commonwealth Bank of Australia", "CommBank", "Bank", "Big 4", "AU",
     "48 123 123 124", False,
     ["cba", "commbank", "commonwealth bank", "commonwealthbk",
      "direct credit cba", "fast transfer cba", "netbank"]),

    ("Australia and New Zealand Banking Group", "ANZ", "Bank", "Big 4", "AU",
     "11 005 357 522", False,
     ["anz", "anz bank", "australia and new zealand bank", "anz internet banking"]),

    ("Westpac Banking Corporation", "Westpac", "Bank", "Big 4", "AU",
     "33 007 457 141", False,
     ["westpac", "westpac bank", "bank of melbourne", "banksa",
      "bom", "stgeorge", "st george", "st.george"]),

    ("National Australia Bank", "NAB", "Bank", "Big 4", "AU",
     "12 004 044 937", False,
     ["nab", "national australia bank", "nab bank", "ubank", "u bank"]),

    ("Macquarie Bank", "Macquarie", "Bank", "Investment Bank", "AU",
     "46 008 583 542", False,
     ["macquarie", "macquarie bank", "macquarie group", "mbl"]),

    ("Bendigo and Adelaide Bank", "Bendigo Bank", "Bank", "Regional", "AU",
     "11 068 049 178", False,
     ["bendigo", "bendigo bank", "adelaide bank", "community bank"]),

    ("Bank of Queensland", "BOQ", "Bank", "Regional", "AU",
     "32 009 656 740", False,
     ["boq", "bank of queensland"]),

    ("Suncorp Bank", "Suncorp", "Bank", "Regional", "AU",
     "66 010 831 722", False,
     ["suncorp", "suncorp bank", "suncorp metway"]),

    ("ING Bank Australia", "ING", "Bank", "Digital Bank", "AU",
     "15 008 842 575", False,
     ["ing", "ing bank", "ing direct", "ing australia"]),

    ("HSBC Australia", "HSBC", "Bank", "International", "AU",
     "48 006 434 162", False,
     ["hsbc", "hsbc australia", "hsbc bank"]),

    ("Citibank Australia", "Citi", "Bank", "International", "AU",
     "", False,
     ["citi", "citibank", "citi australia"]),

    ("ME Bank", "ME Bank", "Bank", "Digital Bank", "AU",
     "56 070 887 679", False,
     ["me bank", "mebank", "members equity"]),

    ("AMP Bank", "AMP Bank", "Bank", "Finance", "AU",
     "15 003 888 292", False,
     ["amp bank", "amp"]),

    ("Heritage Bank", "Heritage", "Bank", "Mutual Bank", "AU",
     "32 087 652 024", False,
     ["heritage bank", "heritage"]),

    ("Greater Bank", "Greater Bank", "Bank", "Mutual Bank", "AU",
     "", False,
     ["greater bank"]),

    ("Teachers Mutual Bank", "Teachers Mutual", "Bank", "Mutual Bank", "AU",
     "", False,
     ["teachers mutual", "tmb", "firefighters mutual", "health professionals bank",
      "unibank", "university mutual"]),

    ("People's Choice Credit Union", "People's Choice", "Bank", "Credit Union", "AU",
     "", False,
     ["peoples choice", "people's choice", "people's choice credit union"]),

    ("CUA", "CUA", "Bank", "Credit Union", "AU",
     "", False,
     ["cua", "credit union australia", "great southern bank"]),

    ("Police Bank", "Police Bank", "Bank", "Mutual Bank", "AU",
     "", False,
     ["police bank"]),

    ("Defence Bank", "Defence Bank", "Bank", "Mutual Bank", "AU",
     "", False,
     ["defence bank"]),

    # ══════════════════════════════════════════════════════════════════════
    # SUPERANNUATION FUNDS
    # ══════════════════════════════════════════════════════════════════════
    ("Australian Super", "AustralianSuper", "Superannuation", "Industry Fund", "AU",
     "", False,
     ["australiansuper", "australian super", "austsuper"]),

    ("Aware Super", "Aware Super", "Superannuation", "Industry Fund", "AU",
     "", False,
     ["aware super", "first state super", "visionsuper"]),

    ("Hostplus", "Hostplus", "Superannuation", "Industry Fund", "AU",
     "", False,
     ["hostplus", "host plus"]),

    ("Hesta", "HESTA", "Superannuation", "Industry Fund", "AU",
     "", False,
     ["hesta"]),

    ("REST Industry Super", "REST", "Superannuation", "Industry Fund", "AU",
     "", False,
     ["rest super", "rest industry", "retail employees"]),

    ("Sunsuper", "Sunsuper", "Superannuation", "Industry Fund", "AU",
     "", False,
     ["sunsuper", "sun super", "qsuper"]),

    ("Cbus Super", "Cbus", "Superannuation", "Industry Fund", "AU",
     "", False,
     ["cbus", "cbus super", "construction super"]),

    ("UniSuper", "UniSuper", "Superannuation", "Industry Fund", "AU",
     "", False,
     ["unisuper", "uni super"]),

    ("GESB Super", "GESB", "Superannuation", "Government Fund", "AU",
     "", False,
     ["gesb", "gesb super"]),

    ("Mercer Super", "Mercer", "Superannuation", "Retail Fund", "AU",
     "", False,
     ["mercer super", "mercer"]),

    ("Vanguard Super", "Vanguard Super", "Superannuation", "Retail Fund", "AU",
     "", False,
     ["vanguard super", "vanguard australia"]),

    # ══════════════════════════════════════════════════════════════════════
    # PAYMENT PROCESSORS / FINTECH
    # ══════════════════════════════════════════════════════════════════════
    ("Stripe", "Stripe", "Payment Processor", "Online Payments", "US",
     "", False,
     ["stripe", "stripe.com", "stripe payment", "stripe fee"]),

    ("PayPal", "PayPal", "Payment Processor", "Online Payments", "US",
     "", False,
     ["paypal", "paypal.com", "paypal payment", "paypal fee", "paypal australia"]),

    ("Square Australia", "Square", "Payment Processor", "POS Payments", "AU",
     "", False,
     ["square", "squareup", "square payment", "square australia"]),

    ("Tyro Payments", "Tyro", "Payment Processor", "POS Payments", "AU",
     "49 103 575 042", False,
     ["tyro", "tyro payments", "tyro eftpos"]),

    ("Afterpay", "Afterpay", "Payment Processor", "BNPL", "AU",
     "41 618 283 329", False,
     ["afterpay", "after pay"]),

    ("Zip Co", "Zip", "Payment Processor", "BNPL", "AU",
     "88 164 440 993", False,
     ["zip", "zipmoney", "zip pay", "zip co"]),

    ("Wise", "Wise", "Payment Processor", "International Transfer", "GB",
     "", False,
     ["wise", "transferwise", "wise payment", "wise transfer", "wise australia"]),

    ("Western Union", "Western Union", "Payment Processor",
     "International Transfer", "US", "", False,
     ["western union", "wu"]),

    ("MoneyGram", "MoneyGram", "Payment Processor",
     "International Transfer", "US", "", False,
     ["moneygram"]),

    # ══════════════════════════════════════════════════════════════════════
    # UTILITIES
    # ══════════════════════════════════════════════════════════════════════
    ("AGL Energy", "AGL", "Utility", "Energy", "AU",
     "74 115 061 375", False,
     ["agl", "agl energy", "agl electricity", "agl gas"]),

    ("Origin Energy", "Origin", "Utility", "Energy", "AU",
     "30 000 051 696", False,
     ["origin energy", "origin", "origin electricity", "origin gas"]),

    ("EnergyAustralia", "EnergyAustralia", "Utility", "Energy", "AU",
     "99 086 014 968", False,
     ["energyaustralia", "energy australia", "tru energy"]),

    ("Alinta Energy", "Alinta", "Utility", "Energy", "AU",
     "", False,
     ["alinta", "alinta energy"]),

    ("Simply Energy", "Simply Energy", "Utility", "Energy", "AU",
     "", False,
     ["simply energy"]),

    ("Red Energy", "Red Energy", "Utility", "Energy", "AU",
     "", False,
     ["red energy"]),

    ("Aurora Energy", "Aurora", "Utility", "Energy", "AU",
     "", False,
     ["aurora energy", "aurora tas"]),

    ("Sydney Water", "Sydney Water", "Utility", "Water", "AU",
     "", True,
     ["sydney water", "sydney water corp"]),

    ("Yarra Valley Water", "Yarra Valley Water", "Utility", "Water", "AU",
     "", True,
     ["yarra valley water", "yvw"]),

    ("South East Water", "South East Water", "Utility", "Water", "AU",
     "", True,
     ["south east water", "sew"]),

    ("Icon Water", "Icon Water", "Utility", "Water", "AU",
     "", True,
     ["icon water", "actew"]),

    ("Telstra", "Telstra", "Telecommunications", "Mobile & Internet", "AU",
     "33 051 775 556", False,
     ["telstra", "telstra mobile", "telstra internet", "telstra bill",
      "bigpond", "belong"]),

    ("Optus", "Optus", "Telecommunications", "Mobile & Internet", "AU",
     "90 052 833 208", False,
     ["optus", "optus mobile", "optus internet", "singtel optus",
      "gomo", "live connected"]),

    ("Vodafone Australia", "Vodafone", "Telecommunications", "Mobile", "AU",
     "76 096 304 620", False,
     ["vodafone", "vodafone au", "tpg vodafone"]),

    ("TPG Telecom", "TPG", "Telecommunications", "Mobile & Internet", "AU",
     "15 093 058 060", False,
     ["tpg", "tpg telecom", "tpg internet", "iiNet", "internode",
      "iinet", "lebara"]),

    ("Aussie Broadband", "Aussie BB", "Telecommunications", "Internet", "AU",
     "", False,
     ["aussie broadband", "aussie bb"]),

    ("Superloop", "Superloop", "Telecommunications", "Internet", "AU",
     "", False,
     ["superloop", "exetel"]),

    # ══════════════════════════════════════════════════════════════════════
    # SUPERMARKETS / GROCERY
    # ══════════════════════════════════════════════════════════════════════
    ("Coles Group", "Coles", "Retail", "Supermarket", "AU",
     "11 004 089 936", False,
     ["coles", "coles supermarket", "coles express", "coles online"]),

    ("Woolworths Group", "Woolworths", "Retail", "Supermarket", "AU",
     "88 000 014 675", False,
     ["woolworths", "woolies", "woolworths supermarket", "woolworths online",
      "everyday rewards", "bws", "dan murphy"]),

    ("ALDI", "ALDI", "Retail", "Supermarket", "AU",
     "", False,
     ["aldi", "aldi stores"]),

    ("IGA", "IGA", "Retail", "Supermarket", "AU",
     "", False,
     ["iga", "iga supermarket"]),

    ("Costco", "Costco", "Retail", "Warehouse Retail", "AU",
     "", False,
     ["costco", "costco wholesale"]),

    ("Harris Farm Markets", "Harris Farm", "Retail", "Supermarket", "AU",
     "", False,
     ["harris farm", "harris farm markets"]),

    # ══════════════════════════════════════════════════════════════════════
    # DEPARTMENT STORES / ELECTRONICS
    # ══════════════════════════════════════════════════════════════════════
    ("Big W", "Big W", "Retail", "Department Store", "AU",
     "", False,
     ["bigw", "big w"]),

    ("Kmart Australia", "Kmart", "Retail", "Department Store", "AU",
     "", False,
     ["kmart", "kmart australia"]),

    ("Target Australia", "Target", "Retail", "Department Store", "AU",
     "", False,
     ["target", "target australia"]),

    ("Myer", "Myer", "Retail", "Department Store", "AU",
     "14 119 085 602", False,
     ["myer"]),

    ("David Jones", "David Jones", "Retail", "Department Store", "AU",
     "", False,
     ["david jones", "dj's", "djs"]),

    ("Harvey Norman", "Harvey Norman", "Retail", "Electronics", "AU",
     "54 003 237 545", False,
     ["harvey norman", "harvey norman online"]),

    ("JB Hi-Fi", "JB Hi-Fi", "Retail", "Electronics", "AU",
     "80 093 220 136", False,
     ["jb hi-fi", "jb hifi", "jbhifi", "the good guys"]),

    ("Officeworks", "Officeworks", "Retail", "Office Supplies", "AU",
     "", False,
     ["officeworks", "office works"]),

    ("Bunnings Warehouse", "Bunnings", "Retail", "Hardware", "AU",
     "", False,
     ["bunnings", "bunnings warehouse", "bunnings hardware"]),

    ("Mitre 10", "Mitre 10", "Retail", "Hardware", "AU",
     "", False,
     ["mitre 10", "mitre10", "true value hardware"]),

    ("Amazon Australia", "Amazon AU", "Retail", "E-commerce", "AU",
     "", False,
     ["amazon", "amazon au", "amazon.com.au", "amazon australia"]),

    ("eBay Australia", "eBay", "Retail", "E-commerce", "AU",
     "", False,
     ["ebay", "ebay au", "ebay australia"]),

    ("Kogan.com", "Kogan", "Retail", "E-commerce", "AU",
     "", False,
     ["kogan", "kogan.com"]),

    # ══════════════════════════════════════════════════════════════════════
    # FOOD & BEVERAGE / FAST FOOD
    # ══════════════════════════════════════════════════════════════════════
    ("McDonald's Australia", "McDonald's", "Food & Beverage", "Fast Food", "AU",
     "", False,
     ["mcdonald", "mcdonalds", "maccas", "mcd"]),

    ("KFC Australia", "KFC", "Food & Beverage", "Fast Food", "AU",
     "", False,
     ["kfc", "kentucky fried"]),

    ("Hungry Jack's", "Hungry Jack's", "Food & Beverage", "Fast Food", "AU",
     "", False,
     ["hungry jacks", "hungry jack"]),

    ("Subway Australia", "Subway", "Food & Beverage", "Fast Food", "AU",
     "", False,
     ["subway"]),

    ("Domino's Pizza", "Domino's", "Food & Beverage", "Fast Food", "AU",
     "16 124 452 269", False,
     ["dominos", "domino's", "domino pizza"]),

    ("Pizza Hut Australia", "Pizza Hut", "Food & Beverage", "Fast Food", "AU",
     "", False,
     ["pizza hut"]),

    ("Grill'd", "Grill'd", "Food & Beverage", "Fast Food", "AU",
     "", False,
     ["grill'd", "grilld"]),

    ("Oporto", "Oporto", "Food & Beverage", "Fast Food", "AU",
     "", False,
     ["oporto"]),

    ("Red Rooster", "Red Rooster", "Food & Beverage", "Fast Food", "AU",
     "", False,
     ["red rooster"]),

    ("Nando's Australia", "Nando's", "Food & Beverage", "Restaurant", "AU",
     "", False,
     ["nandos", "nando's"]),

    ("Uber Eats", "Uber Eats", "Food & Beverage", "Food Delivery", "AU",
     "", False,
     ["uber eats", "ubereats", "uber eat"]),

    ("Menulog", "Menulog", "Food & Beverage", "Food Delivery", "AU",
     "", False,
     ["menulog", "menu log"]),

    ("DoorDash Australia", "DoorDash", "Food & Beverage", "Food Delivery", "AU",
     "", False,
     ["doordash", "door dash"]),

    ("Deliveroo Australia", "Deliveroo", "Food & Beverage", "Food Delivery", "AU",
     "", False,
     ["deliveroo"]),

    # ══════════════════════════════════════════════════════════════════════
    # TRANSPORT / RIDE-SHARE / FUEL
    # ══════════════════════════════════════════════════════════════════════
    ("Uber Australia", "Uber", "Transport", "Ride-Share", "AU",
     "", False,
     ["uber", "uber ride", "uber trip", "uber aus"]),

    ("DiDi Australia", "DiDi", "Transport", "Ride-Share", "AU",
     "", False,
     ["didi", "didi ride", "didi australia"]),

    ("Ola Cabs", "Ola", "Transport", "Ride-Share", "AU",
     "", False,
     ["ola", "ola cabs", "ola ride"]),

    ("13cabs", "13cabs", "Transport", "Taxi", "AU",
     "", False,
     ["13cabs", "13 cabs", "silver top taxi"]),

    ("Cabcharge", "Cabcharge", "Transport", "Taxi", "AU",
     "99 001 958 390", False,
     ["cabcharge", "cab charge"]),

    ("Qantas", "Qantas", "Transport", "Airline", "AU",
     "16 009 661 901", False,
     ["qantas", "qantas airways", "jetstar"]),

    ("Virgin Australia", "Virgin Australia", "Transport", "Airline", "AU",
     "36 090 670 965", False,
     ["virgin australia", "virgin air", "tigerair"]),

    ("Rex Airlines", "Rex", "Transport", "Airline", "AU",
     "", False,
     ["rex airlines", "rex airline", "rex"]),

    ("FlixBus Australia", "FlixBus", "Transport", "Coach", "AU",
     "", False,
     ["flixbus", "flix bus"]),

    ("Translink Queensland", "Translink", "Transport", "Public Transit", "AU",
     "", True,
     ["translink", "go card"]),

    ("Opal Card", "Opal", "Transport", "Public Transit", "AU",
     "", True,
     ["opal", "opal card", "transport nsw opal"]),

    ("Myki", "Myki", "Transport", "Public Transit", "AU",
     "", True,
     ["myki", "ptv"]),

    ("CityLink", "CityLink", "Transport", "Toll Road", "AU",
     "", False,
     ["citylink", "city link", "eastlink", "linkt", "etag"]),

    ("Ampol", "Ampol", "Transport", "Fuel", "AU",
     "35 000 002 566", False,
     ["ampol", "caltex", "caltex australia"]),

    ("BP Australia", "BP", "Transport", "Fuel", "AU",
     "", False,
     ["bp", "bp australia", "bp fuel", "bp service station"]),

    ("Shell Australia", "Shell", "Transport", "Fuel", "AU",
     "", False,
     ["shell", "shell petrol", "shell fuel", "shell service station"]),

    ("7-Eleven Australia", "7-Eleven", "Transport", "Fuel & Convenience", "AU",
     "39 006 634 509", False,
     ["7-eleven", "7eleven", "7 eleven"]),

    ("United Petroleum", "United", "Transport", "Fuel", "AU",
     "", False,
     ["united petroleum", "united fuel"]),

    # ══════════════════════════════════════════════════════════════════════
    # INSURANCE
    # ══════════════════════════════════════════════════════════════════════
    ("NRMA Insurance", "NRMA", "Insurance", "General Insurance", "AU",
     "", False,
     ["nrma", "nrma insurance"]),

    ("AAMI", "AAMI", "Insurance", "General Insurance", "AU",
     "", False,
     ["aami"]),

    ("Allianz Australia", "Allianz", "Insurance", "General Insurance", "AU",
     "15 000 122 850", False,
     ["allianz", "allianz australia"]),

    ("QBE Insurance", "QBE", "Insurance", "General Insurance", "AU",
     "82 010 882 002", False,
     ["qbe", "qbe insurance"]),

    ("Medibank", "Medibank", "Insurance", "Health Insurance", "AU",
     "47 080 890 259", False,
     ["medibank", "medibank private", "ahm"]),

    ("Bupa Australia", "Bupa", "Insurance", "Health Insurance", "AU",
     "", False,
     ["bupa", "bupa australia"]),

    ("HCF", "HCF", "Insurance", "Health Insurance", "AU",
     "", False,
     ["hcf", "hcf health"]),

    ("NIB Health Funds", "NIB", "Insurance", "Health Insurance", "AU",
     "83 000 124 381", False,
     ["nib", "nib health"]),

    ("HBF Health", "HBF", "Insurance", "Health Insurance", "AU",
     "", False,
     ["hbf", "hbf health"]),

    # ══════════════════════════════════════════════════════════════════════
    # SOFTWARE / SUBSCRIPTIONS / TECH
    # ══════════════════════════════════════════════════════════════════════
    ("Xero", "Xero", "Software", "Accounting", "NZ",
     "", False,
     ["xero", "xero.com", "xero subscription", "xero accounting"]),

    ("MYOB", "MYOB", "Software", "Accounting", "AU",
     "13 086 760 198", False,
     ["myob", "myob accountright", "myob subscription"]),

    ("QuickBooks", "QuickBooks", "Software", "Accounting", "US",
     "", False,
     ["quickbooks", "quickbooks online", "intuit"]),

    ("Microsoft", "Microsoft", "Software", "Technology", "US",
     "", False,
     ["microsoft", "microsoft 365", "office 365", "azure", "ms365",
      "outlook", "teams microsoft"]),

    ("Google", "Google", "Software", "Technology", "US",
     "", False,
     ["google", "google workspace", "google cloud", "google ads",
      "google pay", "google play", "google storage"]),

    ("Apple", "Apple", "Software", "Technology", "US",
     "", False,
     ["apple", "apple.com", "apple store", "itunes", "app store apple",
      "icloud", "apple one", "apple music", "apple tv"]),

    ("Adobe", "Adobe", "Software", "Creative", "US",
     "", False,
     ["adobe", "adobe creative cloud", "adobe acrobat", "adobe subscription"]),

    ("Atlassian", "Atlassian", "Software", "Productivity", "AU",
     "13 085 280 910", False,
     ["atlassian", "jira", "confluence", "trello"]),

    ("Canva", "Canva", "Software", "Design", "AU",
     "", False,
     ["canva", "canva pro"]),

    ("Zoom", "Zoom", "Software", "Communication", "US",
     "", False,
     ["zoom", "zoom.us", "zoom subscription", "zoom video"]),

    ("Slack", "Slack", "Software", "Communication", "US",
     "", False,
     ["slack", "slack technologies"]),

    ("Dropbox", "Dropbox", "Software", "Cloud Storage", "US",
     "", False,
     ["dropbox"]),

    ("AWS", "AWS", "Software", "Cloud", "US",
     "", False,
     ["aws", "amazon web services", "amazon aws"]),

    ("HubSpot", "HubSpot", "Software", "CRM", "US",
     "", False,
     ["hubspot"]),

    ("Salesforce", "Salesforce", "Software", "CRM", "US",
     "", False,
     ["salesforce"]),

    ("Shopify", "Shopify", "Software", "E-commerce Platform", "CA",
     "", False,
     ["shopify", "shopify subscription", "shopify payment"]),

    ("Netflix", "Netflix", "Entertainment", "Streaming", "US",
     "", False,
     ["netflix", "netflix.com"]),

    ("Spotify", "Spotify", "Entertainment", "Streaming", "SE",
     "", False,
     ["spotify", "spotify premium"]),

    ("Stan", "Stan", "Entertainment", "Streaming", "AU",
     "", False,
     ["stan", "stan entertainment", "stan.com.au"]),

    ("Disney+", "Disney+", "Entertainment", "Streaming", "US",
     "", False,
     ["disney", "disney plus", "disney+", "disneyplus"]),

    ("Amazon Prime", "Prime Video", "Entertainment", "Streaming", "US",
     "", False,
     ["amazon prime", "prime video", "prime subscription"]),

    # ══════════════════════════════════════════════════════════════════════
    # ACCOUNTING / PROFESSIONAL SERVICES
    # ══════════════════════════════════════════════════════════════════════
    ("Deloitte Australia", "Deloitte", "Professional Services", "Big 4 Accounting", "AU",
     "", False,
     ["deloitte"]),

    ("PwC Australia", "PwC", "Professional Services", "Big 4 Accounting", "AU",
     "", False,
     ["pwc", "pricewaterhousecoopers"]),

    ("KPMG Australia", "KPMG", "Professional Services", "Big 4 Accounting", "AU",
     "", False,
     ["kpmg"]),

    ("Ernst & Young Australia", "EY", "Professional Services", "Big 4 Accounting", "AU",
     "", False,
     ["ernst young", "ernst & young", "ey australia"]),

    ("Grant Thornton Australia", "Grant Thornton", "Professional Services",
     "Mid-Tier Accounting", "AU", "", False,
     ["grant thornton"]),

    ("BDO Australia", "BDO", "Professional Services", "Mid-Tier Accounting", "AU",
     "", False,
     ["bdo", "bdo australia"]),

    # ══════════════════════════════════════════════════════════════════════
    # WORLDWIDE — MAJOR ORGANISATIONS
    # ══════════════════════════════════════════════════════════════════════
    ("International Monetary Fund", "IMF", "International Organisation",
     "Finance", "XX", "", True,
     ["imf", "international monetary fund"]),

    ("World Bank", "World Bank", "International Organisation",
     "Finance", "XX", "", True,
     ["world bank"]),

    ("United Nations", "UN", "International Organisation",
     "Government", "XX", "", True,
     ["united nations", "un "]),

    ("SWIFT", "SWIFT", "Payment Processor",
     "International Banking", "BE", "", False,
     ["swift", "swift transfer", "swift payment"]),
]


def seed_companies(db) -> int:
    """
    Insert seed companies + aliases. Skips existing. Returns count inserted.
    Deduplicates aliases per company to avoid UNIQUE constraint errors.
    """
    from db_app.models.company import Company, CompanyAlias

    inserted = 0
    for row in SEED:
        name, short_name, cat, subcat, country, abn, is_gov, aliases = row

        existing = db.query(Company).filter(Company.name == name).first()
        if existing:
            # Add any new aliases not already present
            existing_aliases = {a.alias for a in existing.aliases}
            for alias in aliases:
                al = alias.strip().lower()
                if al and al not in existing_aliases:
                    existing_aliases.add(al)  # prevent dupes within this loop
                    try:
                        db.add(CompanyAlias(company_id=existing.id, alias=al))
                        db.flush()
                    except Exception:
                        db.rollback()
            continue

        # New company
        try:
            company = Company(
                name=name, short_name=short_name, category=cat,
                subcategory=subcat, country=country, abn=abn or "",
                is_government=is_gov, approved=True,
            )
            db.add(company)
            db.flush()

            seen_aliases = set()
            for alias in aliases:
                al = alias.strip().lower()
                if al and al not in seen_aliases:
                    seen_aliases.add(al)
                    db.add(CompanyAlias(company_id=company.id, alias=al))

            db.flush()
            db.commit()
            inserted += 1
        except Exception:
            db.rollback()

    return inserted

