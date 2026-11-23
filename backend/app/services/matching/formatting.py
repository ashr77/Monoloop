"""Number formatting that reproduces the original TypeScript output exactly
(explanations are user-facing text, so the port must read the same)."""

from __future__ import annotations

import math


def js_round(x: float) -> int:
    """JavaScript Math.round: halves round toward +infinity (Python's round() is banker's)."""
    return math.floor(x + 0.5)


def js_str(n: float | int) -> str:
    """JavaScript String(number) for the values used here."""
    f = float(n)
    if f.is_integer():
        return str(int(f))
    return repr(f)


def fmt(n: float | int) -> str:
    """Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))."""
    f = float(n)
    if f.is_integer():
        return str(int(f))
    s = f"{f:.2f}".rstrip("0").rstrip(".")
    return s


def format_size(length: float, width: float) -> str:
    return f"{fmt(length)}×{fmt(width)} mm"


def bdt(n: float) -> str:
    return f"{js_round(n):,} BDT"
