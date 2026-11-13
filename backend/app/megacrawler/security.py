"""
HS MegaCrawler Security & Responsible Crawling Guard
SSRF Protection, URL Trap Detection, Infinite Loop Elimination, and Politeness Throttling.
Company: HS AI Solutions
Founder: Harshan Seliyan
"""

import ipaddress
import socket
import re
import urllib.parse
from typing import Dict, Set, Optional, Tuple
from collections import defaultdict
import time
import asyncio

# Private/Reserved IPv4 & IPv6 Networks
BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),       # Link-local / Cloud metadata
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.88.99.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),          # Multicast
    ipaddress.ip_network("240.0.0.0/4"),          # Reserved
    ipaddress.ip_network("255.255.255.255/32"),
    # IPv6
    ipaddress.ip_network("::1/128"),              # Loopback
    ipaddress.ip_network("fc00::/7"),             # Unique local
    ipaddress.ip_network("fe80::/10"),            # Link-local
    ipaddress.ip_network("ff00::/8")              # Multicast
]

BLOCKED_HOSTNAMES = {
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "metadata.google.internal",
    "instance-data",
    "169.254.169.254"
}

# Suspicious trap patterns
TRAP_PATTERNS = [
    r"/(?:calendar|events|archive)/\d{4}/\d{2}/\d{2}/.*(?:calendar|events|archive)/\d{4}", # Infinite calendar recursion
    r"/(?:dir|folder|page)/\d+/(?:dir|folder|page)/\d+/(?:dir|folder|page)",               # Path nesting loops
    r"/(cart|checkout|login|signup|signin|account|auth|admin|wp-admin|logout)/",           # Auth boundaries & transactional pages
    r"\.(zip|tar|gz|iso|exe|bin|dmg|mp4|mov|avi|wmv|wav|mkv)$"                             # Raw heavy binary dumps (unless media crawler)
]

class SecurityGuard:
    """SSRF, URL Trap, and Politeness Manager."""

    def __init__(self):
        self._domain_locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        self._domain_last_request: Dict[str, float] = {}
        self._domain_active_concurrency: Dict[str, int] = defaultdict(int)
        self._domain_visited_paths: Dict[str, Set[str]] = defaultdict(set)
        self._dns_cache: Dict[str, Tuple[str, float]] = {}

    def is_safe_url(self, url: str) -> Tuple[bool, str]:
        """
        Validate URL against SSRF, unauthorized schemes, and cloud metadata gates.
        Resolves domain DNS to protect against DNS rebinding.
        """
        try:
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme.lower() not in ("http", "https"):
                return False, f"Unsupported scheme: {parsed.scheme}"

            host = parsed.hostname
            if not host:
                return False, "Missing hostname"

            host_lower = host.lower().strip(".")

            if host_lower in BLOCKED_HOSTNAMES:
                return False, f"Blocked host: {host_lower}"

            # Direct IP check
            try:
                ip_obj = ipaddress.ip_address(host_lower)
                for net in BLOCKED_NETWORKS:
                    if ip_obj in net:
                        return False, f"SSRF blocked: Host IP {host_lower} resides in restricted network {net}"
            except ValueError:
                # Host is a domain name; perform DNS resolution check
                resolved_ip = self._resolve_host(host_lower)
                if resolved_ip:
                    ip_obj = ipaddress.ip_address(resolved_ip)
                    for net in BLOCKED_NETWORKS:
                        if ip_obj in net:
                            return False, f"SSRF blocked: Domain {host_lower} resolves to restricted IP {resolved_ip}"

            return True, "Safe"
        except Exception as e:
            return False, f"URL parse error: {str(e)}"

    def _resolve_host(self, hostname: str) -> Optional[str]:
        """Resolve hostname with local TTL cache to check IP boundary."""
        now = time.time()
        if hostname in self._dns_cache:
            ip, cached_at = self._dns_cache[hostname]
            if now - cached_at < 300: # 5 min TTL
                return ip

        try:
            ip = socket.gethostbyname(hostname)
            self._dns_cache[hostname] = (ip, now)
            return ip
        except Exception:
            return None

    def is_url_trap(self, url: str) -> Tuple[bool, str]:
        """
        Detects crawling loops, repeating path patterns, excessive query parameters,
        and deep infinite link recursion traps.
        """
        parsed = urllib.parse.urlparse(url)
        path = parsed.path.lower()
        query = parsed.query

        # 1. Excessive Path Depth (> 7 segments)
        segments = [s for s in path.split("/") if s]
        if len(segments) > 7:
            return True, f"Excessive path depth ({len(segments)} segments)"

        # 2. Repeating Subpath Loop Detection (e.g. /a/b/a/b/a/b)
        for i in range(len(segments) - 2):
            if segments[i] == segments[i+1] == segments[i+2]:
                return True, "Repeated segment loop detected"
            if i + 3 < len(segments) and segments[i:i+2] == segments[i+2:i+4]:
                return True, "Alternating two-token path loop detected"

        # 3. Known Trap Regex Patterns
        for pat in TRAP_PATTERNS:
            if re.search(pat, path, re.IGNORECASE):
                return True, f"Matched trap pattern: {pat}"

        # 4. Query Parameter Explosion (> 6 parameters)
        if query:
            params = urllib.parse.parse_qs(query)
            if len(params) > 6:
                return True, f"Query parameter explosion ({len(params)} params)"

        # 5. Domain visited path frequency (avoid infinite pseudo-dynamic loops)
        domain = parsed.netloc.lower()
        if len(self._domain_visited_paths[domain]) > 1000:
            # Clean oldest to bound memory
            self._domain_visited_paths[domain] = set(list(self._domain_visited_paths[domain])[-500:])

        return False, "Normal"

    async def acquire_domain_slot(self, domain: str, delay_sec: float = 1.0, max_concurrency: int = 2) -> bool:
        """
        Enforce per-domain rate limiting and polite backoff.
        Ensures max concurrency per domain is not breached.
        """
        domain = domain.lower()
        lock = self._domain_locks[domain]

        async with lock:
            current_concurrency = self._domain_active_concurrency[domain]
            if current_concurrency >= max_concurrency:
                return False

            now = time.time()
            last_req = self._domain_last_request.get(domain, 0.0)
            elapsed = now - last_req

            if elapsed < delay_sec:
                await asyncio.sleep(delay_sec - elapsed)

            self._domain_last_request[domain] = time.time()
            self._domain_active_concurrency[domain] += 1
            return True

    def release_domain_slot(self, domain: str):
        """Release active request slot for domain."""
        domain = domain.lower()
        if domain in self._domain_active_concurrency:
            self._domain_active_concurrency[domain] = max(0, self._domain_active_concurrency[domain] - 1)

security_guard = SecurityGuard()
