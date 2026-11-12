"""
Server text in English and Nepali.

* Notifications and emails use MESSAGES: each is created with a key and its
  values (stored on the notification), and rendered in the reader's language:
  in-app in the language of the request, emails in the recipient's saved
  language (User.preferred_language).
* Error messages (HTTPException.detail) and dashboard texts are translated by
  `translate_text`, from the exact English text or a pattern (ERRORS /
  PATTERNS), so the code that raises them stays plain English.
* Nepali style: Devanagari digits (रु. ५,०००) and Bikram Sambat dates.

The frontend sends the language in the X-Language header.
"""

import re
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

LANGS = ("en", "ne")
DEFAULT_LANG = "en"
_NE_DIGITS = str.maketrans("0123456789", "०१२३४५६७८९")


def normalize_lang(value: Optional[str]) -> str:
    value = (value or "").lower()[:2]
    return value if value in LANGS else DEFAULT_LANG


def request_lang(request) -> str:
    """The language of the current request (X-Language header)."""
    try:
        return normalize_lang(request.headers.get("x-language"))
    except Exception:  # noqa: BLE001
        return DEFAULT_LANG


def ne_digits(text: str) -> str:
    return str(text).translate(_NE_DIGITS)


def money(amount, lang: str) -> str:
    from app.services.policy_document import rs

    text = rs(Decimal(str(amount).replace(",", "")))
    return "रु. " + ne_digits(text.removeprefix("Rs. ")) if lang == "ne" else text


def date_time(value, lang: str) -> str:
    from app.services.policy_document import ne_date
    from app.utils.local_time import format_local, to_local

    dt = datetime.fromisoformat(value) if isinstance(value, str) else value
    if lang != "ne":
        return format_local(dt)
    bs = ne_date(dt).split(" (")[0]  # "वि.सं. २०८३ कार्तिक २६"
    return f"{bs}, {ne_digits(to_local(dt).strftime('%H:%M'))}"


def _fmt(name: str, value: Any, lang: str) -> str:
    """Format one value for a message. A {"en": .., "ne": ..} dict picks the language."""
    if isinstance(value, dict) and "en" in value:
        return str(value.get(lang) or value["en"])
    if value is None:
        return ""
    if name == "amount" or name.endswith("_amount"):
        return money(value, lang)
    if name == "deadline" or name.endswith("_at"):
        return date_time(value, lang)
    if isinstance(value, (int, float, Decimal)) and lang == "ne":
        return ne_digits(str(value))
    return str(value)


# ---------------------------------------------------------------------------
# Notifications / emails: key -> title and message, per language
# ---------------------------------------------------------------------------
MESSAGES: dict[str, dict[str, dict[str, str]]] = {
    "member_awaiting_approval": {
        "title": {"en": "New member awaiting approval", "ne": "नयाँ सदस्य स्वीकृतिको पर्खाइमा"},
        "message": {
            "en": "{name} ({email}) verified their email and is waiting for your approval.",
            "ne": "{name} ({email}) ले आफ्नो इमेल प्रमाणित गर्नुभएको छ र तपाईंको स्वीकृतिको पर्खाइमा हुनुहुन्छ।",
        },
    },
    "loan_new_application": {
        "title": {"en": "New Loan Application", "ne": "नयाँ ऋण आवेदन"},
        "message": {
            "en": "{applicant} has applied for a loan of {amount} for '{purpose}'. Please verify fund availability.",
            "ne": "{applicant} ले '{purpose}' का लागि {amount} ऋणको आवेदन दिनुभएको छ। कृपया कोष उपलब्धता प्रमाणित गर्नुहोस्।",
        },
    },
    "loan_funds_verified": {
        "title": {"en": "Loan Funds Verified — Awaiting Approval", "ne": "ऋणको कोष प्रमाणित — स्वीकृतिको पर्खाइमा"},
        "message": {
            "en": "Treasurer {treasurer} has verified fund availability for {applicant}'s loan of {amount}. "
                  "Please review and approve or reject.",
            "ne": "कोषाध्यक्ष {treasurer} ले {applicant} को {amount} ऋणका लागि कोष उपलब्धता प्रमाणित गर्नुभएको छ। "
                  "कृपया हेरेर स्वीकृत वा अस्वीकृत गर्नुहोस्।",
        },
    },
    "loan_approved": {
        "title": {"en": "Loan Application Approved", "ne": "ऋण आवेदन स्वीकृत"},
        "message": {
            "en": "President {decider} has approved your loan application of {amount}.",
            "ne": "अध्यक्ष {decider} ले तपाईंको {amount} को ऋण आवेदन स्वीकृत गर्नुभएको छ।",
        },
    },
    "loan_approved_contact": {
        "title": {"en": "Loan Application Approved", "ne": "ऋण आवेदन स्वीकृत"},
        "message": {
            "en": "President {decider} has approved your loan application of {amount}.\n\n"
                  "To collect your funds, please contact the Treasurer:\nName: {t_name}\nPhone: {t_phone}\nEmail: {t_email}",
            "ne": "अध्यक्ष {decider} ले तपाईंको {amount} को ऋण आवेदन स्वीकृत गर्नुभएको छ।\n\n"
                  "रकम लिन कृपया कोषाध्यक्षलाई सम्पर्क गर्नुहोस्:\nनाम: {t_name}\nफोन: {t_phone}\nइमेल: {t_email}",
        },
    },
    "loan_rejected": {
        "title": {"en": "Loan Application Rejected", "ne": "ऋण आवेदन अस्वीकृत"},
        "message": {
            "en": "President {decider} has rejected your loan application of {amount}.",
            "ne": "अध्यक्ष {decider} ले तपाईंको {amount} को ऋण आवेदन अस्वीकृत गर्नुभएको छ।",
        },
    },
    "loan_rejected_reason": {
        "title": {"en": "Loan Application Rejected", "ne": "ऋण आवेदन अस्वीकृत"},
        "message": {
            "en": "President {decider} has rejected your loan application of {amount}.\nReason: {reason}",
            "ne": "अध्यक्ष {decider} ले तपाईंको {amount} को ऋण आवेदन अस्वीकृत गर्नुभएको छ।\nकारण: {reason}",
        },
    },
    "guarantee_request": {
        "title": {"en": "Guarantee request", "ne": "जमानी अनुरोध"},
        "message": {
            "en": "{applicant} has asked you to be the guarantor for a loan of {amount} ({purpose}). "
                  "Please review and sign, or decline.",
            "ne": "{applicant} ले {amount} को ऋण ({purpose}) का लागि तपाईंलाई जमानीकर्ता बस्न अनुरोध गर्नुभएको छ। "
                  "कृपया हेरेर हस्ताक्षर गर्नुहोस् वा अस्वीकार गर्नुहोस्।",
        },
    },
    "guarantor_signed": {
        "title": {"en": "Your guarantor signed", "ne": "तपाईंको जमानीकर्ताले हस्ताक्षर गर्नुभयो"},
        "message": {
            "en": "{guarantor} signed as guarantor for your loan of {amount}. It now goes to the Treasurer.",
            "ne": "{guarantor} ले तपाईंको {amount} को ऋणका लागि जमानीकर्ताको रूपमा हस्ताक्षर गर्नुभयो। अब यो कोषाध्यक्षकहाँ जान्छ।",
        },
    },
    "guarantor_declined": {
        "title": {"en": "Your guarantor declined", "ne": "तपाईंको जमानीकर्ताले अस्वीकार गर्नुभयो"},
        "message": {
            "en": "{guarantor} declined to be the guarantor for your loan of {amount}. "
                  "The application was closed; you can apply again with another guarantor.",
            "ne": "{guarantor} ले तपाईंको {amount} को ऋणका लागि जमानीकर्ता बस्न अस्वीकार गर्नुभयो। "
                  "आवेदन बन्द गरियो; तपाईं अर्को जमानीकर्तासहित फेरि आवेदन दिन सक्नुहुन्छ।",
        },
    },
    "guarantor_declined_note": {
        "title": {"en": "Your guarantor declined", "ne": "तपाईंको जमानीकर्ताले अस्वीकार गर्नुभयो"},
        "message": {
            "en": "{guarantor} declined to be the guarantor for your loan of {amount}: {note} "
                  "The application was closed; you can apply again with another guarantor.",
            "ne": "{guarantor} ले तपाईंको {amount} को ऋणका लागि जमानीकर्ता बस्न अस्वीकार गर्नुभयो: {note} "
                  "आवेदन बन्द गरियो; तपाईं अर्को जमानीकर्तासहित फेरि आवेदन दिन सक्नुहुन्छ।",
        },
    },
    "loan_agreement_ready": {
        "title": {"en": "Loan approved: agreement ready", "ne": "ऋण स्वीकृत: सम्झौता तयार"},
        "message": {
            "en": "{president} approved the loan of {amount} for {applicant}. The agreement PDF is ready in the Loans tab.",
            "ne": "{president} ले {applicant} को {amount} को ऋण स्वीकृत गर्नुभयो। सम्झौताको PDF ऋण ट्याबमा तयार छ।",
        },
    },
    "deposit_submitted": {
        "title": {"en": "New Deposit Requires Verification", "ne": "नयाँ जम्मा प्रमाणीकरण आवश्यक"},
        "message": {
            "en": "{depositor} submitted a deposit of {amount}. Please review and verify/reject it.",
            "ne": "{depositor} ले {amount} जम्मा गर्नुभएको छ। कृपया हेरेर प्रमाणित वा अस्वीकृत गर्नुहोस्।",
        },
    },
    "deposit_verified": {
        "title": {"en": "Deposit Verified", "ne": "जम्मा प्रमाणित"},
        "message": {
            "en": "Your deposit of {amount} has been verified by {reviewer}.",
            "ne": "तपाईंको {amount} को जम्मा {reviewer} द्वारा प्रमाणित गरिएको छ।",
        },
    },
    "deposit_rejected": {
        "title": {"en": "Deposit Rejected", "ne": "जम्मा अस्वीकृत"},
        "message": {
            "en": "Your deposit of {amount} has been rejected by {reviewer}.",
            "ne": "तपाईंको {amount} को जम्मा {reviewer} द्वारा अस्वीकृत गरिएको छ।",
        },
    },
    "policy_open_for_signing": {
        "title": {"en": "New policy needs your signature", "ne": "नयाँ नीतिमा तपाईंको हस्ताक्षर आवश्यक"},
        "message": {
            "en": "{treasurer} (Treasurer) has signed and opened a new {label} for signing. Please sign or reject it "
                  "by {deadline}. It takes effect only if every member has signed by then; you can change your "
                  "decision until the deadline.",
            "ne": "{treasurer} (कोषाध्यक्ष) ले नयाँ {label} मा हस्ताक्षर गरी हस्ताक्षरका लागि खुला गर्नुभएको छ। कृपया "
                  "{deadline} भित्र हस्ताक्षर वा अस्वीकार गर्नुहोस्। सबै सदस्यले त्यतिबेलासम्म हस्ताक्षर गरेमा मात्र यो "
                  "लागू हुन्छ; म्यादसम्म तपाईं आफ्नो निर्णय बदल्न सक्नुहुन्छ।",
        },
    },
    "policy_rejected_by_member": {
        "title": {"en": "Policy rejected by a member", "ne": "एक सदस्यले नीति अस्वीकार गर्नुभयो"},
        "message": {
            "en": "{member} rejected the {label}: {reason}",
            "ne": "{member} ले {label} अस्वीकार गर्नुभयो: {reason}",
        },
    },
    "policy_adopted": {
        "title": {"en": "Policy adopted", "ne": "नीति पारित"},
        "message": {
            "en": "The {label} was signed by every member by the deadline and is now active.",
            "ne": "{label} मा सबै सदस्यले म्यादभित्र हस्ताक्षर गर्नुभयो र अब यो लागू भएको छ।",
        },
    },
    "policy_not_adopted": {
        "title": {"en": "Policy not adopted", "ne": "नीति पारित भएन"},
        "message": {
            "en": "The {label} was not adopted: at the deadline {rejected} member(s) had rejected it and {missing} "
                  "had not signed. The Treasurer can revise it and open it again.",
            "ne": "{label} पारित भएन: म्यादसम्म {rejected} जना सदस्यले अस्वीकार गर्नुभएको थियो र {missing} जनाले "
                  "हस्ताक्षर गर्नुभएको थिएन। कोषाध्यक्षले यसलाई संशोधन गरी फेरि खोल्न सक्नुहुन्छ।",
        },
    },
    "proxy_request": {
        "title": {"en": "Proxy signature needs your authorisation", "ne": "प्रतिनिधि हस्ताक्षरका लागि तपाईंको अनुमति आवश्यक"},
        "message": {
            "en": "Admin {admin} asks to {verb} the {label} on behalf of {signer}. Consultation: {note}",
            "ne": "{signer} को तर्फबाट {label} {verb} गर्न एडमिन {admin} ले अनुमति माग्नुभएको छ। परामर्श: {note}",
        },
    },
    "proxy_declined": {
        "title": {"en": "Proxy signature declined", "ne": "प्रतिनिधि हस्ताक्षर अस्वीकृत"},
        "message": {
            "en": "{member} declined your request to sign the {label} on behalf of {signer}.",
            "ne": "{member} ले {signer} को तर्फबाट {label} मा हस्ताक्षर गर्ने तपाईंको अनुरोध अस्वीकार गर्नुभयो।",
        },
    },
    "proxy_applied": {
        "title": {"en": "A policy was signed on your behalf", "ne": "तपाईंको तर्फबाट नीतिमा हस्ताक्षर गरियो"},
        "message": {
            "en": "Admin {admin} {verb} the {label} on your behalf, as agreed with you ({note}), authorised by the "
                  "office bearers. You can change your response yourself while the policy is open.",
            "ne": "तपाईंसँग भएको सहमतिअनुसार ({note}) पदाधिकारीहरूको अनुमतिमा एडमिन {admin} ले तपाईंको तर्फबाट {label} "
                  "{verb} गर्नुभयो। नीति खुला रहेसम्म तपाईं आफैं आफ्नो जवाफ बदल्न सक्नुहुन्छ।",
        },
    },
    # Email only
    "membership_approved": {
        "title": {"en": "Your Yugantar membership was approved", "ne": "तपाईंको युगान्तर सदस्यता स्वीकृत भयो"},
        "message": {
            "en": "Your registration has been approved. You can now log in.",
            "ne": "तपाईंको दर्ता स्वीकृत भएको छ। अब तपाईं लगइन गर्न सक्नुहुन्छ।",
        },
    },
    "membership_approved_verify": {
        "title": {"en": "Your Yugantar membership was approved", "ne": "तपाईंको युगान्तर सदस्यता स्वीकृत भयो"},
        "message": {
            "en": "Your registration has been approved. Please also verify your email address using the link we "
                  "sent you; then you can log in.",
            "ne": "तपाईंको दर्ता स्वीकृत भएको छ। कृपया हामीले पठाएको लिङ्कबाट आफ्नो इमेल पनि प्रमाणित गर्नुहोस्; "
                  "त्यसपछि तपाईं लगइन गर्न सक्नुहुन्छ।",
        },
    },
    "registration_rejected": {
        "title": {"en": "Your Yugantar registration", "ne": "तपाईंको युगान्तर दर्ता"},
        "message": {
            "en": "Your registration was not approved. If you think this is a mistake, please contact the "
                  "cooperative's administrator.",
            "ne": "तपाईंको दर्ता स्वीकृत भएन। यो गल्ती हो जस्तो लागेमा कृपया सहकारीको एडमिनलाई सम्पर्क गर्नुहोस्।",
        },
    },
}

EMAIL_WRAPPER = {
    "en": "Hello {first_name},\n\n{message}\n\nPlease log in to the Yugantar portal for details.\n\n"
          "Best regards,\nYugantar System",
    "ne": "नमस्ते {first_name},\n\n{message}\n\nविस्तृत जानकारीका लागि कृपया युगान्तर पोर्टलमा लगइन गर्नुहोस्।\n\n"
          "शुभकामना सहित,\nयुगान्तर प्रणाली",
}
EMAIL_SUBJECT = {"en": "{title} — Yugantar", "ne": "{title} — युगान्तर"}


def render(key: str, lang: str, args: Optional[dict] = None) -> tuple[str, str]:
    """(title, message) for a catalogue key in `lang`."""
    entry = MESSAGES[key]
    lang = normalize_lang(lang)
    values = {k: _fmt(k, v, lang) for k, v in (args or {}).items()}
    return entry["title"][lang].format(**values), entry["message"][lang].format(**values)


def render_email(key: str, lang: str, first_name: str, args: Optional[dict] = None) -> tuple[str, str]:
    """(subject, body) of the plain-text email for a catalogue key."""
    title, message = render(key, lang, args)
    lang = normalize_lang(lang)
    return (
        EMAIL_SUBJECT[lang].format(title=title),
        EMAIL_WRAPPER[lang].format(first_name=first_name, message=message),
    )


def both(en: str, ne: str) -> dict:
    """A value given in both languages (e.g. a policy label)."""
    return {"en": en, "ne": ne}


# ---------------------------------------------------------------------------
# Errors and other server texts: exact English -> Nepali
# ---------------------------------------------------------------------------
ERRORS: dict[str, str] = {
    "User not found": "प्रयोगकर्ता फेला परेन",
    "Loan not found.": "ऋण फेला परेन।",
    "Loan not found": "ऋण फेला परेन",
    "Deposit not found": "जम्मा फेला परेन",
    "Insufficient privileges": "पर्याप्त अनुमति छैन",
    "Receipt not found": "रसिद फेला परेन",
    "Loan payment not found": "ऋण भुक्तानी फेला परेन",
    "Proxy request not found.": "प्रतिनिधि अनुरोध फेला परेन।",
    "Loan policy not found.": "ऋण नीति फेला परेन।",
    "Loan policy not found": "ऋण नीति फेला परेन",
    "Deposit policy not found": "जम्मा नीति फेला परेन",
    "Deposit policy not found.": "जम्मा नीति फेला परेन।",
    "Policy not found.": "नीति फेला परेन।",
    "Policy not found": "नीति फेला परेन",
    "Fine not found": "जरिवाना फेला परेन",
    "Notification not found": "सूचना फेला परेन",
    "Task not found": "कार्य फेला परेन",
    "Guarantee request not found.": "जमानी अनुरोध फेला परेन।",
    "Unknown policy type.": "अज्ञात नीति प्रकार।",
    "Decision must be 'approved' or 'rejected'.": "निर्णय 'स्वीकृत' वा 'अस्वीकृत' हुनुपर्छ।",
    "Review status must be 'verified' or 'rejected'.": "समीक्षाको स्थिति 'प्रमाणित' वा 'अस्वीकृत' हुनुपर्छ।",
    "Change reason must be provided for policy deactivation": "नीति निष्क्रिय गर्न परिवर्तनको कारण दिनुपर्छ",
    "Change reason must be provided for updating the policy.": "नीति अद्यावधिक गर्न परिवर्तनको कारण दिनुपर्छ।",
    "Change reason must be provided for updating a loan policy.": "ऋण नीति अद्यावधिक गर्न परिवर्तनको कारण दिनुपर्छ।",
    "Change reason must be provided for policy updates": "नीति अद्यावधिक गर्न परिवर्तनको कारण दिनुपर्छ",
    "Change reason is required for updating the policy": "नीति अद्यावधिक गर्न परिवर्तनको कारण आवश्यक छ",
    "Admin access required": "एडमिन अनुमति आवश्यक छ",
    "You verified the funds for this loan; a different person has to approve or reject it.":
        "यो ऋणको कोष तपाईंले प्रमाणित गर्नुभएको हो; स्वीकृत वा अस्वीकृत अर्को व्यक्तिले गर्नुपर्छ।",
    "You have already responded to this request.": "तपाईंले यो अनुरोधको जवाफ दिइसक्नुभएको छ।",
    "You can't be your own guarantor.": "तपाईं आफैं आफ्नो जमानीकर्ता बन्न सक्नुहुन्न।",
    "You can only modify your own payments": "तपाईं आफ्नै भुक्तानी मात्र परिवर्तन गर्न सक्नुहुन्छ",
    "You can only make payments for your own loans": "तपाईं आफ्नै ऋणको मात्र भुक्तानी गर्न सक्नुहुन्छ",
    "You are this loan's guarantor, so another office bearer has to review it.":
        "तपाईं यो ऋणको जमानीकर्ता हुनुहुन्छ, त्यसैले अर्को पदाधिकारीले यसको समीक्षा गर्नुपर्छ।",
    "You are not one of the required signers for this policy.": "तपाईं यो नीतिका आवश्यक हस्ताक्षरकर्तामध्ये हुनुहुन्न।",
    "You already have a pending, approved or active loan. Please complete it before applying for a new one.":
        "तपाईंको विचाराधीन, स्वीकृत वा सक्रिय ऋण पहिले नै छ। नयाँ आवेदन दिनुअघि कृपया त्यो पूरा गर्नुहोस्।",
    "Waiting for the guarantor to sign before this loan can be reviewed.":
        "यो ऋणको समीक्षा गर्नुअघि जमानीकर्ताको हस्ताक्षर पर्खिँदै।",
    "User is already approved": "प्रयोगकर्ता पहिले नै स्वीकृत छ",
    "User account is disabled or no longer exists": "प्रयोगकर्ता खाता निष्क्रिय छ वा अब छैन",
    "User account is disabled": "प्रयोगकर्ता खाता निष्क्रिय छ",
    "Too many uploads. Please try again in a few minutes.": "धेरै अपलोड भयो। कृपया केही मिनेटपछि फेरि प्रयास गर्नुहोस्।",
    "Token has expired": "टोकनको म्याद सकियो",
    "This request has already been answered.": "यो अनुरोधको जवाफ दिइसकिएको छ।",
    "This receipt is already attached to another deposit.": "यो रसिद पहिले नै अर्को जम्मासँग जोडिएको छ।",
    "This receipt has expired. Please upload the voucher again.": "यो रसिदको म्याद सकियो। कृपया भौचर फेरि अपलोड गर्नुहोस्।",
    "This policy requires a guarantor: choose a member who will stand surety for the loan.":
        "यो नीतिमा जमानीकर्ता आवश्यक छ: ऋणको जमानी बस्ने सदस्य छान्नुहोस्।",
    "This payment belongs to a deposit; review the deposit instead":
        "यो भुक्तानी एउटा जम्मासँग सम्बन्धित छ; त्यसको सट्टा जम्माको समीक्षा गर्नुहोस्",
    "This payment belongs to a deposit; edit or withdraw the deposit instead":
        "यो भुक्तानी एउटा जम्मासँग सम्बन्धित छ; त्यसको सट्टा जम्मा सम्पादन गर्नुहोस् वा फिर्ता लिनुहोस्",
    "This member is already approved; disable the account instead.":
        "यो सदस्य पहिले नै स्वीकृत हुनुहुन्छ; त्यसको सट्टा खाता निष्क्रिय गर्नुहोस्।",
    "The signing deadline for this policy has passed.": "यो नीतिमा हस्ताक्षर गर्ने म्याद सकियो।",
    "There is already a pending proxy request for this member.": "यो सदस्यका लागि प्रतिनिधि अनुरोध पहिले नै विचाराधीन छ।",
    "The record file is missing from storage.": "अभिलेख फाइल भण्डारणमा भेटिएन।",
    "The receipt image has been deleted after the retention period.": "राख्ने अवधि सकिएपछि रसिदको तस्बिर मेटाइएको छ।",
    "The member is no longer a required signer.": "यो सदस्य अब आवश्यक हस्ताक्षरकर्ता हुनुहुन्न।",
    "The guarantor must be an active registered member.": "जमानीकर्ता सक्रिय दर्ता भएको सदस्य हुनुपर्छ।",
    "The current deposit policy is missing its schedule settings. Please ask the Treasurer to fix it.":
        "हालको जम्मा नीतिमा तालिकाको सेटिङ छैन। कृपया कोषाध्यक्षलाई मिलाउन भन्नुहोस्।",
    "The agreement is created when the loan is approved.": "ऋण स्वीकृत भएपछि सम्झौता बनाइन्छ।",
    "That member is not a required signer of this policy.": "ती सदस्य यो नीतिका आवश्यक हस्ताक्षरकर्ता हुनुहुन्न।",
    "That email address is already in use.": "यो इमेल ठेगाना पहिले नै प्रयोगमा छ।",
    "System admin accounts don't sign policies. Please sign from your member account.":
        "एडमिन खाताले नीतिमा हस्ताक्षर गर्दैन। कृपया आफ्नो सदस्य खाताबाट हस्ताक्षर गर्नुहोस्।",
    "Sign your own policy directly, not by proxy.": "आफ्नो हस्ताक्षर आफैं गर्नुहोस्, प्रतिनिधिमार्फत होइन।",
    "Refresh token missing": "रिफ्रेस टोकन छैन",
    "Policies that have taken effect cannot be deleted": "लागू भइसकेका नीति मेटाउन सकिँदैन",
    "Active policies cannot be deleted": "सक्रिय नीति मेटाउन सकिँदैन",
    "Please give a reason for rejecting.": "कृपया अस्वीकार गर्नुको कारण दिनुहोस्।",
    "Give the member's reason for rejecting.": "सदस्यले अस्वीकार गर्नुको कारण दिनुहोस्।",
    "Describe how the member was consulted.": "सदस्यसँग कसरी परामर्श गरियो, लेख्नुहोस्।",
    "Only the President, Treasurer or Secretary (not the absent member or the requesting Admin) can authorise this.":
        "अध्यक्ष, कोषाध्यक्ष वा सचिवले मात्र (अनुपस्थित सदस्य वा अनुरोध गर्ने एडमिनले होइन) यसको अनुमति दिन सक्नुहुन्छ।",
    "Only pending payments can be modified": "विचाराधीन भुक्तानी मात्र परिवर्तन गर्न सकिन्छ",
    "Only pending deposits can be withdrawn": "विचाराधीन जम्मा मात्र फिर्ता लिन सकिन्छ",
    "Only pending deposits can be edited": "विचाराधीन जम्मा मात्र सम्पादन गर्न सकिन्छ",
    "Only completed or failed tasks can be deleted.": "पूरा भएका वा असफल कार्य मात्र मेटाउन सकिन्छ।",
    "Only an Admin can request to sign on a member's behalf.": "सदस्यको तर्फबाट हस्ताक्षर गर्ने अनुरोध एडमिनले मात्र गर्न सक्नुहुन्छ।",
    "Only an Admin can cancel proxy requests.": "प्रतिनिधि अनुरोध एडमिनले मात्र रद्द गर्न सक्नुहुन्छ।",
    "Not enough independent office bearers to authorise this proxy (need at least two).":
        "यो प्रतिनिधि हस्ताक्षरको अनुमति दिन पर्याप्त स्वतन्त्र पदाधिकारी छैनन् (कम्तीमा दुई जना चाहिन्छ)।",
    "No hand signature on file.": "हस्ताक्षरको तस्बिर छैन।",
    "No deposit policy is in force right now. Please contact the Treasurer.":
        "अहिले कुनै जम्मा नीति लागू छैन। कृपया कोषाध्यक्षलाई सम्पर्क गर्नुहोस्।",
    "Loan policy is not currently active.": "ऋण नीति अहिले सक्रिय छैन।",
    "Invalid or expired reset token": "रिसेट टोकन अमान्य छ वा म्याद सकियो",
    "Invalid or expired refresh token": "रिफ्रेस टोकन अमान्य छ वा म्याद सकियो",
    "Invalid file type. Please upload a JPEG, PNG or WEBP image.": "फाइलको प्रकार मिलेन। कृपया JPEG, PNG वा WEBP तस्बिर अपलोड गर्नुहोस्।",
    "Invalid email or password": "इमेल वा पासवर्ड मिलेन",
    "Incorrect username or password": "प्रयोगकर्ता नाम वा पासवर्ड मिलेन",
    "Insufficient privileges — only the President, Treasurer or Secretary can review loans":
        "पर्याप्त अनुमति छैन — अध्यक्ष, कोषाध्यक्ष वा सचिवले मात्र ऋणको समीक्षा गर्न सक्नुहुन्छ",
    "Image dimensions are too large.": "तस्बिरको आकार धेरै ठूलो छ।",
    "Funds must be verified by a Treasurer before the loan can be approved.":
        "ऋण स्वीकृत गर्नुअघि कोषाध्यक्षले कोष प्रमाणित गर्नुपर्छ।",
    "Funds have already been verified for this loan.": "यो ऋणको कोष पहिले नै प्रमाणित भइसकेको छ।",
    "File size exceeds 10MB limit.": "फाइलको आकार १० MB भन्दा बढी छ।",
    "Current password is incorrect": "हालको पासवर्ड मिलेन",
    "Could not validate credentials": "प्रमाणीकरण गर्न सकिएन",
    "A user with this email already exists.": "यो इमेलको प्रयोगकर्ता पहिले नै छ।",
    "A record is created once the policy has been adopted.": "नीति पारित भएपछि अभिलेख बनाइन्छ।",
    "A preview is available while the policy is open for signing.": "नीति हस्ताक्षरका लागि खुला रहँदा मात्र पूर्वावलोकन उपलब्ध हुन्छ।",
    "Admin users cannot modify their own roles or status": "एडमिनले आफ्नै भूमिका वा स्थिति परिवर्तन गर्न सक्नुहुन्न",
    "Admin users cannot disable themselves": "एडमिनले आफैंलाई निष्क्रिय गर्न सक्नुहुन्न",
    "Admin users cannot delete themselves": "एडमिनले आफैंलाई मेटाउन सक्नुहुन्न",
    "The signature image is too large (max about 1.5 MB).": "हस्ताक्षरको तस्बिर धेरै ठूलो छ (बढीमा करिब १.५ MB)।",
    "The signature must be a PNG, JPEG or WebP image.": "हस्ताक्षर PNG, JPEG वा WebP तस्बिर हुनुपर्छ।",
    "The signature image could not be read.": "हस्ताक्षरको तस्बिर पढ्न सकिएन।",
    "The signature image is too large.": "हस्ताक्षरको तस्बिर धेरै ठूलो छ।",
    "The signature is empty. Please draw or upload your signature.": "हस्ताक्षर खाली छ। कृपया हस्ताक्षर गर्नुहोस् वा तस्बिर अपलोड गर्नुहोस्।",
    "The signature is too small. Please sign larger.": "हस्ताक्षर धेरै सानो भयो। कृपया अलि ठूलो गरी हस्ताक्षर गर्नुहोस्।",
    "Your account is disabled. Please contact the administrator.": "तपाईंको खाता निष्क्रिय छ। कृपया एडमिनलाई सम्पर्क गर्नुहोस्।",
    "This account is disabled.": "यो खाता निष्क्रिय छ।",
    "Please verify your email address first. Check your inbox for the verification link.":
        "कृपया पहिले आफ्नो इमेल ठेगाना प्रमाणित गर्नुहोस्। प्रमाणीकरण लिङ्कका लागि इनबक्स हेर्नुहोस्।",
    "Your account is awaiting approval by an administrator.": "तपाईंको खाता एडमिनको स्वीकृतिको पर्खाइमा छ।",
    # Dashboard (Home) action titles
    "Sign a new policy": "नयाँ नीतिमा हस्ताक्षर गर्नुहोस्",
    "Sign as guarantor": "जमानीकर्ताको रूपमा हस्ताक्षर गर्नुहोस्",
    "Deposits to verify": "प्रमाणित गर्नुपर्ने जम्मा",
    "Loan applications to review": "समीक्षा गर्नुपर्ने ऋण आवेदन",
    "Loan payments to review": "समीक्षा गर्नुपर्ने ऋण भुक्तानी",
    "Proxy signatures to authorise": "अनुमति दिनुपर्ने प्रतिनिधि हस्ताक्षर",
    "Deposit awaiting verification": "प्रमाणीकरण पर्खिँदै गरेको जम्मा",
    # Home history and admin activity log
    "Deposit": "जम्मा",
    "Loan principal payment": "ऋणको साँवा भुक्तानी",
    "Loan interest payment": "ऋणको ब्याज भुक्तानी",
    "Registered": "दर्ता भयो",
    "Submitted a deposit": "जम्मा पेस गर्नुभयो",
    "Applied for a loan": "ऋणका लागि आवेदन दिनुभयो",
}

_SCHEDULE_NE = {"monthly fixed day": "हरेक महिना निश्चित दिन", "occasional": "आवधिक"}
_STATUS_NE = {
    "draft": "मस्यौदा", "finalized": "हस्ताक्षरका लागि खुला", "active": "सक्रिय", "expired": "समाप्त",
    "void": "पारित नभएको", "pending": "विचाराधीन", "approved": "स्वीकृत", "rejected": "अस्वीकृत",
    "verified": "प्रमाणित", "paid": "चुक्ता", "applied": "लागू", "declined": "अस्वीकृत", "cancelled": "रद्द",
    "completed": "पूरा", "failed": "असफल",
}


def _rs_ne(m: str) -> str:
    return "रु. " + ne_digits(m)


def _label_ne(text: str) -> str:
    """Policy labels ("Deposit policy (Rs. 5,000.00, monthly fixed day)") in Nepali."""
    m = re.fullmatch(r"Deposit policy \(Rs\. ([\d,.]+), (.+)\)", text)
    if m:
        return f"जम्मा नीति ({_rs_ne(m[1])}, {_SCHEDULE_NE.get(m[2], m[2])})"
    m = re.fullmatch(r"Loan policy \(Rs\. ([\d,.]+)–([\d,.]+), ([\d.]+)%\)", text)
    if m:
        return f"ऋण नीति ({_rs_ne(m[1])}–{ne_digits(m[2])}, {ne_digits(m[3])}%)"
    return text


def _plural_n(n: str) -> str:
    return ne_digits(n)


# (pattern, function(match) -> Nepali)
PATTERNS: list[tuple[re.Pattern, Any]] = [
    (re.compile(r"This request is already (\w+)\."), lambda m: f"यो अनुरोध पहिले नै {_STATUS_NE.get(m[1], m[1])} छ।"),
    (re.compile(r"Only draft policies can be edited\. Current status: (\w+)"),
     lambda m: f"मस्यौदा नीति मात्र सम्पादन गर्न सकिन्छ। हालको स्थिति: {_STATUS_NE.get(m[1], m[1])}"),
    (re.compile(r"Only draft policies can be opened for signing\. Current status: (\w+)"),
     lambda m: f"मस्यौदा नीति मात्र हस्ताक्षरका लागि खोल्न सकिन्छ। हालको स्थिति: {_STATUS_NE.get(m[1], m[1])}"),
    (re.compile(r"Only open or lapsed policies can be revised\. Current status: (\w+)"),
     lambda m: f"खुला वा म्याद नाघेका नीति मात्र संशोधन गर्न सकिन्छ। हालको स्थिति: {_STATUS_NE.get(m[1], m[1])}"),
    (re.compile(r"This policy is not open for signing\. Current status: (\w+)"),
     lambda m: f"यो नीति हस्ताक्षरका लागि खुला छैन। हालको स्थिति: {_STATUS_NE.get(m[1], m[1])}"),
    (re.compile(r"Only pending (loans|payments|deposits) can be (verified|rejected|approved|reviewed)\.\s*Current status: (\w+)"),
     lambda m: "{} मात्र {} गर्न सकिन्छ। हालको स्थिति: {}".format(
         {"loans": "विचाराधीन ऋण", "payments": "विचाराधीन भुक्तानी", "deposits": "विचाराधीन जम्मा"}[m[1]],
         {"verified": "प्रमाणित", "rejected": "अस्वीकृत", "approved": "स्वीकृत", "reviewed": "समीक्षा"}[m[2]],
         _STATUS_NE.get(m[3], m[3]))),
    (re.compile(r"Requested amount Rs\. ([\d,.]+) is below the minimum Rs\. ([\d,.]+)\."),
     lambda m: f"माग गरिएको रकम {_rs_ne(m[1])} न्यूनतम {_rs_ne(m[2])} भन्दा कम छ।"),
    (re.compile(r"Requested amount Rs\. ([\d,.]+) exceeds the maximum Rs\. ([\d,.]+)\."),
     lambda m: f"माग गरिएको रकम {_rs_ne(m[1])} अधिकतम {_rs_ne(m[2])} भन्दा बढी छ।"),
    (re.compile(r"Deposits must use the current deposit policy \(Rs\. ([\d,.]+)\)\. Please refresh and try again\."),
     lambda m: f"जम्मा हालको जम्मा नीति ({_rs_ne(m[1])}) अनुसार हुनुपर्छ। कृपया पृष्ठ ताजा गरी फेरि प्रयास गर्नुहोस्।"),
    (re.compile(r"Cannot make payments on a loan with status '(\w+)'"),
     lambda m: f"'{_STATUS_NE.get(m[1], m[1])}' स्थितिको ऋणमा भुक्तानी गर्न सकिँदैन"),
    (re.compile(r"Email verification failed: (.*)", re.S), lambda m: f"इमेल प्रमाणीकरण असफल: {m[1]}"),
    # Dashboard details
    (re.compile(r"(\d+) deposits? waiting for your verification\."),
     lambda m: f"{_plural_n(m[1])} वटा जम्मा तपाईंको प्रमाणीकरणको पर्खाइमा।"),
    (re.compile(r"(\d+) applications? waiting for you\."), lambda m: f"{_plural_n(m[1])} वटा आवेदन तपाईंको पर्खाइमा।"),
    (re.compile(r"(\d+) payments? waiting for review\."), lambda m: f"{_plural_n(m[1])} वटा भुक्तानी समीक्षाको पर्खाइमा।"),
    (re.compile(r"(\d+) requests? from the Admin need your decision\."),
     lambda m: f"एडमिनका {_plural_n(m[1])} वटा अनुरोधमा तपाईंको निर्णय चाहिन्छ।"),
    (re.compile(r"(\d+) of your deposits (?:is|are) waiting for the Treasurer\."),
     lambda m: f"तपाईंका {_plural_n(m[1])} वटा जम्मा कोषाध्यक्षको पर्खाइमा।"),
    (re.compile(r"(.+)\. Signing closes (\d+ \w+ \d{4}), (\d\d:\d\d) NPT\."),
     lambda m: f"{_label_ne(m[1])}। हस्ताक्षरको म्याद {_ad_to_ne(m[2])}, {ne_digits(m[3])} सम्म।"),
    (re.compile(r"(.+) asked you to guarantee a loan of Rs\. ([\d,.]+)\. Review and sign, or decline\."),
     lambda m: f"{'एक सदस्य' if m[1] == 'A member' else m[1]} ले {_rs_ne(m[2])} को ऋणका लागि जमानी बस्न अनुरोध "
               "गर्नुभएको छ। हेरेर हस्ताक्षर गर्नुहोस् वा अस्वीकार गर्नुहोस्।"),
    (re.compile(r"(Deposit|Loan) policy \(.+\)"), lambda m: _label_ne(m[0])),
    # Admin activity log
    (re.compile(r"Approved (.+)'s membership"), lambda m: f"{m[1]} को सदस्यता स्वीकृत गर्नुभयो"),
    (re.compile(r"(Verified|Rejected|Pending) (.+)'s deposit"),
     lambda m: f"{m[2]} को जम्मा {_STATUS_NE.get(m[1].lower(), m[1])} गर्नुभयो"),
    (re.compile(r"Verified funds for (.+)'s loan"), lambda m: f"{m[1]} को ऋणको कोष प्रमाणित गर्नुभयो"),
    (re.compile(r"(Approved|Rejected) (.+)'s loan"), lambda m: f"{m[2]} को ऋण {_STATUS_NE[m[1].lower()]} गर्नुभयो"),
    (re.compile(r"(\w+) (.+)'s loan (principal|interest) payment"),
     lambda m: "{} को ऋणको {} भुक्तानी {} गर्नुभयो".format(
         m[2], "साँवा" if m[3] == "principal" else "ब्याज", _STATUS_NE.get(m[1].lower(), m[1]))),
    (re.compile(r"(Signed|Rejected) the (.+?)( \(by proxy\))?"),
     lambda m: "{} {}{}".format(_label_ne(m[2]), "मा हस्ताक्षर गर्नुभयो" if m[1] == "Signed" else "अस्वीकार गर्नुभयो",
                                " (प्रतिनिधिमार्फत)" if m[3] else "")),
]


def _ad_to_ne(text: str) -> str:
    """'19 Nov 2026' -> BS date in Nepali."""
    try:
        from app.services.policy_document import ne_date

        return ne_date(datetime.strptime(text, "%d %b %Y")).split(" (")[0]
    except ValueError:
        return ne_digits(text)


def translate_text(text: Any, lang: str) -> Any:
    """Nepali for a known server text (exact or pattern); otherwise unchanged."""
    if lang != "ne" or not isinstance(text, str) or not text:
        return text
    if text in ERRORS:
        return ERRORS[text]
    for pattern, make in PATTERNS:
        m = pattern.fullmatch(text)
        if m:
            try:
                return make(m)
            except Exception:  # noqa: BLE001
                return text
    return text
