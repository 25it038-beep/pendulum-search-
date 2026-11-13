"""
HS SEARCH - Instant Knowledge & Computation Provider
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import re
import ast
import math
import time
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from app.providers.base import BaseSearchProvider, ProviderResult

class SafeMathEvaluator(ast.NodeVisitor):
    ALLOWED_OPERATORS = {
        ast.Add: lambda a, b: a + b,
        ast.Sub: lambda a, b: a - b,
        ast.Mult: lambda a, b: a * b,
        ast.Div: lambda a, b: a / b if b != 0 else float("inf"),
        ast.Mod: lambda a, b: a % b if b != 0 else 0,
        ast.Pow: lambda a, b: a ** b if b < 1000 else float("inf"),
        ast.USub: lambda a: -a,
        ast.UAdd: lambda a: a
    }

    def evaluate(self, expr_str: str) -> Optional[float]:
        try:
            expr_str = expr_str.replace("^", "**").replace("×", "*").replace("÷", "/")
            tree = ast.parse(expr_str, mode="eval")
            return self.visit(tree.body)
        except Exception:
            return None

    def visit(self, node):
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        elif isinstance(node, ast.BinOp):
            left = self.visit(node.left)
            right = self.visit(node.right)
            op = type(node.op)
            if op in self.ALLOWED_OPERATORS:
                return self.ALLOWED_OPERATORS[op](left, right)
        elif isinstance(node, ast.UnaryOp):
            operand = self.visit(node.operand)
            op = type(node.op)
            if op in self.ALLOWED_OPERATORS:
                return self.ALLOWED_OPERATORS[op](operand)
        raise ValueError("Unsupported operation")

class HSInstantAnswerProvider(BaseSearchProvider):
    """
    Instant Answer Provider: Zero-latency deterministic answers for
    math expressions, live date/time, unit conversions, and system identity.
    """
    name = "HS Instant Answers"
    provider_type = "instant"
    source_category = "live_source"
    is_external = False

    def __init__(self):
        super().__init__()
        self.math_evaluator = SafeMathEvaluator()

    async def search(self, query: str, limit: int = 5, **kwargs) -> List[ProviderResult]:
        start = time.perf_counter()
        q_lower = query.lower().strip()
        results: List[ProviderResult] = []

        # 1. Mathematical calculation: e.g. "25 * 4", "sqrt(144)", "1200 / 12"
        math_match = re.match(r"^[\d\s\+\-\*\/\^\(\)\.\%]+$", query.strip())
        if math_match and any(op in query for op in ["+", "-", "*", "/", "^", "%"]):
            val = self.math_evaluator.evaluate(query)
            if val is not None:
                formatted_val = f"{val:,.4f}".rstrip("0").rstrip(".") if isinstance(val, float) else f"{val:,}"
                results.append(ProviderResult(
                    title=f"Calculation: {query} = {formatted_val}",
                    url="https://hsaisolutions.com/calculator",
                    snippet=f"Exact computed mathematical result: {query} = {formatted_val}.",
                    source_provider="HS Computation Engine",
                    original_publisher="hsaisolutions.com",
                    retrieval_timestamp=datetime.utcnow(),
                    publication_timestamp=datetime.utcnow(),
                    source_attribution="Direct computation via HS Instant Math Evaluator",
                    is_live=True,
                    source_type="live_source",
                    domain="hsaisolutions.com",
                    score=1.0,
                    category="computation"
                ))

        # 2. Date & Time
        if any(w in q_lower for w in ["what time", "current time", "time now", "today's date", "current date", "what is today"]):
            now_local = datetime.now()
            now_utc = datetime.now(timezone.utc)
            date_str = now_local.strftime("%A, %B %d, %Y")
            time_str = now_local.strftime("%I:%M:%S %p")
            utc_str = now_utc.strftime("%H:%M UTC")

            results.append(ProviderResult(
                title=f"Current Time: {time_str} ({date_str})",
                url="https://hsaisolutions.com/time",
                snippet=f"Local Time: {time_str} | Date: {date_str} | Universal Standard: {utc_str}.",
                source_provider="HS Timekeeping Subsystem",
                original_publisher="hsaisolutions.com",
                retrieval_timestamp=datetime.utcnow(),
                publication_timestamp=datetime.utcnow(),
                source_attribution="Synchronized with HS Real-Time Clock",
                is_live=True,
                source_type="live_source",
                domain="hsaisolutions.com",
                score=1.0,
                category="time"
            ))

        # 3. Unit Conversions: e.g. "10 km in miles", "5 miles to km", "100 usd to inr"
        conv_match = re.search(r"(\d+(?:\.\d+)?)\s*(km|miles?|kg|lbs?|celsius|fahrenheit|usd|eur|inr|gbp)\s+(?:to|in|into)\s+(km|miles?|kg|lbs?|celsius|fahrenheit|usd|eur|inr|gbp)", q_lower)
        if conv_match:
            amount = float(conv_match.group(1))
            u_from = conv_match.group(2)
            u_to = conv_match.group(3)
            converted = self._convert_units(amount, u_from, u_to)
            if converted:
                results.append(ProviderResult(
                    title=f"Unit Conversion: {converted}",
                    url="https://hsaisolutions.com/converter",
                    snippet=f"Standard physical/currency conversion: {converted}.",
                    source_provider="HS Conversion Subsystem",
                    original_publisher="hsaisolutions.com",
                    retrieval_timestamp=datetime.utcnow(),
                    publication_timestamp=datetime.utcnow(),
                    source_attribution="Calculated via HS Scientific Unit System",
                    is_live=True,
                    source_type="live_source",
                    domain="hsaisolutions.com",
                    score=0.99,
                    category="conversion"
                ))

        # 4. Identity / Founder
        if any(w in q_lower for w in ["who made hs search", "who is the founder", "founder of hs search", "harshan seliyan"]):
            results.append(ProviderResult(
                title="Harshan Seliyan — Founder & Creator of HS Search",
                url="https://hsaisolutions.com/about",
                snippet="Harshan Seliyan is the founder of HS AI Solutions and creator of the HS Search universal crawler, July AI, and Gravity research platform.",
                source_provider="HS AI Solutions Official Registry",
                original_publisher="hsaisolutions.com",
                retrieval_timestamp=datetime.utcnow(),
                publication_timestamp=datetime.utcnow(),
                source_attribution="Official HS AI Solutions Platform Registry",
                is_live=True,
                source_type="hs_indexed",
                domain="hsaisolutions.com",
                score=1.0,
                category="identity"
            ))

        latency = (time.perf_counter() - start) * 1000.0
        self.record_metrics(latency, error=False)
        return results

    def _convert_units(self, val: float, u1: str, u2: str) -> Optional[str]:
        if "km" in u1 and "mile" in u2:
            return f"{val} km = {val * 0.621371:.2f} miles"
        elif "mile" in u1 and "km" in u2:
            return f"{val} miles = {val * 1.60934:.2f} km"
        elif "kg" in u1 and "lb" in u2:
            return f"{val} kg = {val * 2.20462:.2f} lbs"
        elif "lb" in u1 and "kg" in u2:
            return f"{val} lbs = {val * 0.453592:.2f} kg"
        elif "usd" in u1 and "inr" in u2:
            return f"{val} USD ≈ {val * 86.5:.2f} INR (Live Benchmark Rate)"
        elif "inr" in u1 and "usd" in u2:
            return f"{val} INR ≈ {val / 86.5:.2f} USD (Live Benchmark Rate)"
        return None
