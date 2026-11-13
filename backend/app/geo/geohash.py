"""
HS SEARCH - High-Performance Hierarchical Spatial Grid (Geohash) Engine
Company: HS AI Solutions
Founder: Harshan Seliyan
Reference: W3C Spatial Data on the Web Best Practices
"""

import math
from typing import Tuple, List, Dict

BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
BASE32_MAP = {c: i for i, c in enumerate(BASE32)}

# Direction neighbors table for base32 geohashes
NEIGHBORS = {
    "right":  {"even": "bc01fg45238967deuvhjyznpkmstqrwx"},
    "left":   {"even": "238967debc01fg45kmstqrwxuvhjyznp"},
    "top":    {"even": "p0r21436x8zb9dcf5h7kjnmqesgutwvy"},
    "bottom": {"even": "14365h7k9dcfesgutwvy238967debc01"}
}
NEIGHBORS["bottom"]["odd"] = NEIGHBORS["left"]["even"]
NEIGHBORS["top"]["odd"] = NEIGHBORS["right"]["even"]
NEIGHBORS["left"]["odd"] = NEIGHBORS["bottom"]["even"]
NEIGHBORS["right"]["odd"] = NEIGHBORS["top"]["even"]

BORDERS = {
    "right":  {"even": "bcfguvyz"},
    "left":   {"even": "0145hjnp"},
    "top":    {"even": "prxz"},
    "bottom": {"even": "028b"}
}
BORDERS["bottom"]["odd"] = BORDERS["left"]["even"]
BORDERS["top"]["odd"] = BORDERS["right"]["even"]
BORDERS["left"]["odd"] = BORDERS["bottom"]["even"]
BORDERS["right"]["odd"] = BORDERS["top"]["even"]

def encode_geohash(lat: float, lon: float, precision: int = 7) -> str:
    """
    Encode latitude & longitude into a standard base32 geohash string.
    Precision 5: ~4.9 km x 4.9 km
    Precision 6: ~1.2 km x 0.6 km
    Precision 7: ~152 m x 152 m
    Precision 8: ~38 m x 19 m
    """
    lat_interval = [-90.0, 90.0]
    lon_interval = [-180.0, 180.0]
    geohash = []
    bits = [16, 8, 4, 2, 1]
    bit = 0
    ch = 0
    is_even = True

    while len(geohash) < precision:
        if is_even:
            mid = (lon_interval[0] + lon_interval[1]) / 2.0
            if lon > mid:
                ch |= bits[bit]
                lon_interval[0] = mid
            else:
                lon_interval[1] = mid
        else:
            mid = (lat_interval[0] + lat_interval[1]) / 2.0
            if lat > mid:
                ch |= bits[bit]
                lat_interval[0] = mid
            else:
                lat_interval[1] = mid

        is_even = not is_even
        if bit < 4:
            bit += 1
        else:
            geohash.append(BASE32[ch])
            bit = 0
            ch = 0

    return "".join(geohash)

def decode_geohash(geohash: str) -> Tuple[float, float, float, float]:
    """
    Decode geohash string into (lat, lon, lat_err, lon_err).
    """
    lat_interval = [-90.0, 90.0]
    lon_interval = [-180.0, 180.0]
    is_even = True

    for c in geohash.lower():
        cd = BASE32_MAP.get(c)
        if cd is None:
            continue
        for mask in [16, 8, 4, 2, 1]:
            if is_even:
                if cd & mask:
                    lon_interval[0] = (lon_interval[0] + lon_interval[1]) / 2.0
                else:
                    lon_interval[1] = (lon_interval[0] + lon_interval[1]) / 2.0
            else:
                if cd & mask:
                    lat_interval[0] = (lat_interval[0] + lat_interval[1]) / 2.0
                else:
                    lat_interval[1] = (lat_interval[0] + lat_interval[1]) / 2.0
            is_even = not is_even

    lat = (lat_interval[0] + lat_interval[1]) / 2.0
    lon = (lon_interval[0] + lon_interval[1]) / 2.0
    lat_err = (lat_interval[1] - lat_interval[0]) / 2.0
    lon_err = (lon_interval[1] - lon_interval[0]) / 2.0
    return lat, lon, lat_err, lon_err

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Great-circle distance between two points on the Earth using Haversine formula.
    Accurate to within 0.1%.
    """
    R = 6371.0 # Earth radius in kilometers
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def bounding_box_for_radius(lat: float, lon: float, radius_km: float) -> Tuple[float, float, float, float]:
    """
    Calculate (min_lat, max_lat, min_lon, max_lon) for a given radius in kilometers.
    Used for instant spatial R*Tree bounding box search.
    """
    R = 6371.0
    delta_lat = math.degrees(radius_km / R)
    min_lat = max(-90.0, lat - delta_lat)
    max_lat = min(90.0, lat + delta_lat)

    # Adjust longitude delta based on latitude
    cos_lat = math.cos(math.radians(lat))
    if abs(cos_lat) > 1e-6:
        delta_lon = math.degrees(radius_km / (R * cos_lat))
    else:
        delta_lon = 180.0

    min_lon = max(-180.0, lon - delta_lon)
    max_lon = min(180.0, lon + delta_lon)

    return min_lat, max_lat, min_lon, max_lon
