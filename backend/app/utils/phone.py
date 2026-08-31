import re
from typing import Optional, Tuple

def normalize_phone(raw_phone: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    Normalizes Indian mobile phone numbers.
    Returns (raw_phone, normalized_10_digit_phone).
    Examples:
        "+91 91458-87170" -> ("+91 91458-87170", "9145887170")
        "09145887170"     -> ("09145887170", "9145887170")
        "9145887170"      -> ("9145887170", "9145887170")
    """
    if not raw_phone:
        return None, None
        
    raw = raw_phone.strip()
    digits = re.sub(r"\D", "", raw)
    
    if len(digits) == 12 and digits.startswith("91"):
        normalized = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        normalized = digits[1:]
    elif len(digits) == 10:
        normalized = digits
    else:
        normalized = digits if digits else None
        
    return raw, normalized
