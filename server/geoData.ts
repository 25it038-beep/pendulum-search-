export interface GeoPlace {
  id: number;
  name: string;
  ascii_name: string;
  alternate_names: string[];
  feature_type: string;
  admin_level: number;
  continent: string;
  country_code: string;
  country_name: string;
  state_province?: string;
  district?: string;
  city?: string;
  locality?: string;
  postal_code?: string;
  lat: number;
  lon: number;
  population: number;
  timezone: string;
}

export interface LocalEntity {
  id: number;
  name: string;
  category: string;
  subcategory: string;
  address: string;
  city: string;
  state: string;
  country: string;
  country_code: string;
  postal_code: string;
  lat: number;
  lon: number;
  phone: string;
  website: string;
  opening_hours: string;
  is_open_now: number;
  verified_status: string;
  rating: number;
  review_count: number;
  details: Record<string, unknown>;
}

export const GLOBAL_PLACES: GeoPlace[] = [
  { id: 1, name: "India", ascii_name: "India", alternate_names: ["Bharat", "இந்தியா"], feature_type: "country", admin_level: 2, continent: "Asia", country_code: "IN", country_name: "India", lat: 20.5937, lon: 78.9629, population: 1428627663, timezone: "Asia/Kolkata" },
  { id: 2, name: "Tamil Nadu", ascii_name: "Tamil Nadu", alternate_names: ["தமிழ்நாடு", "TN"], feature_type: "state", admin_level: 3, continent: "Asia", country_code: "IN", country_name: "India", state_province: "Tamil Nadu", lat: 11.1271, lon: 78.6569, population: 72147030, timezone: "Asia/Kolkata" },
  { id: 3, name: "Chennai", ascii_name: "Chennai", alternate_names: ["Madras", "சென்னை"], feature_type: "city", admin_level: 5, continent: "Asia", country_code: "IN", country_name: "India", state_province: "Tamil Nadu", district: "Chennai", city: "Chennai", postal_code: "600001", lat: 13.0827, lon: 80.2707, population: 7088000, timezone: "Asia/Kolkata" },
  { id: 4, name: "Tambaram", ascii_name: "Tambaram", alternate_names: ["தாம்பரம்", "East Tambaram", "West Tambaram"], feature_type: "locality", admin_level: 6, continent: "Asia", country_code: "IN", country_name: "India", state_province: "Tamil Nadu", district: "Chengalpattu", city: "Chennai", locality: "Tambaram", postal_code: "600045", lat: 12.9249, lon: 80.1000, population: 174787, timezone: "Asia/Kolkata" },
  { id: 5, name: "Coimbatore", ascii_name: "Coimbatore", alternate_names: ["Kovai", "கோயம்புத்தூர்"], feature_type: "city", admin_level: 5, continent: "Asia", country_code: "IN", country_name: "India", state_province: "Tamil Nadu", district: "Coimbatore", city: "Coimbatore", postal_code: "641001", lat: 11.0168, lon: 76.9558, population: 1601438, timezone: "Asia/Kolkata" },
  { id: 6, name: "Salem", ascii_name: "Salem", alternate_names: ["சேலம்"], feature_type: "city", admin_level: 5, continent: "Asia", country_code: "IN", country_name: "India", state_province: "Tamil Nadu", district: "Salem", city: "Salem", postal_code: "636001", lat: 11.6643, lon: 78.1460, population: 829267, timezone: "Asia/Kolkata" },
  { id: 7, name: "Adyar", ascii_name: "Adyar", alternate_names: ["அடையாறு", "Adayar"], feature_type: "locality", admin_level: 6, continent: "Asia", country_code: "IN", country_name: "India", state_province: "Tamil Nadu", district: "Chennai", city: "Chennai", locality: "Adyar", postal_code: "600020", lat: 13.0012, lon: 80.2565, population: 120000, timezone: "Asia/Kolkata" },
  { id: 8, name: "Bengaluru", ascii_name: "Bengaluru", alternate_names: ["Bangalore", "பெங்களூரு"], feature_type: "city", admin_level: 5, continent: "Asia", country_code: "IN", country_name: "India", state_province: "Karnataka", district: "Bangalore Urban", city: "Bengaluru", postal_code: "560001", lat: 12.9716, lon: 77.5946, population: 8443675, timezone: "Asia/Kolkata" },
  { id: 9, name: "Mumbai", ascii_name: "Mumbai", alternate_names: ["Bombay", "मुंबई"], feature_type: "city", admin_level: 5, continent: "Asia", country_code: "IN", country_name: "India", state_province: "Maharashtra", district: "Mumbai City", city: "Mumbai", postal_code: "400001", lat: 19.0760, lon: 72.8777, population: 12478447, timezone: "Asia/Kolkata" },
  { id: 10, name: "New Delhi", ascii_name: "New Delhi", alternate_names: ["Delhi", "नई दिल्ली"], feature_type: "city", admin_level: 5, continent: "Asia", country_code: "IN", country_name: "India", state_province: "Delhi", district: "New Delhi", city: "New Delhi", postal_code: "110001", lat: 28.6139, lon: 77.2090, population: 16787941, timezone: "Asia/Kolkata" },
  { id: 11, name: "Japan", ascii_name: "Japan", alternate_names: ["Nippon", "日本"], feature_type: "country", admin_level: 2, continent: "Asia", country_code: "JP", country_name: "Japan", lat: 36.2048, lon: 138.2529, population: 125100000, timezone: "Asia/Tokyo" },
  { id: 12, name: "Tokyo", ascii_name: "Tokyo", alternate_names: ["東京", "Tokyo Metropolis"], feature_type: "city", admin_level: 5, continent: "Asia", country_code: "JP", country_name: "Japan", state_province: "Tokyo", city: "Tokyo", lat: 35.6762, lon: 139.6503, population: 13960000, timezone: "Asia/Tokyo" },
  { id: 13, name: "Kyoto", ascii_name: "Kyoto", alternate_names: ["京都市"], feature_type: "city", admin_level: 5, continent: "Asia", country_code: "JP", country_name: "Japan", state_province: "Kyoto Prefecture", city: "Kyoto", lat: 35.0116, lon: 135.7681, population: 1463723, timezone: "Asia/Tokyo" },
  { id: 14, name: "United Arab Emirates", ascii_name: "United Arab Emirates", alternate_names: ["UAE"], feature_type: "country", admin_level: 2, continent: "Asia", country_code: "AE", country_name: "United Arab Emirates", lat: 23.4241, lon: 53.8478, population: 9890400, timezone: "Asia/Dubai" },
  { id: 15, name: "Dubai", ascii_name: "Dubai", alternate_names: ["دبي"], feature_type: "city", admin_level: 5, continent: "Asia", country_code: "AE", country_name: "United Arab Emirates", state_province: "Dubai", city: "Dubai", lat: 25.2048, lon: 55.2708, population: 3331420, timezone: "Asia/Dubai" },
  { id: 16, name: "Singapore", ascii_name: "Singapore", alternate_names: ["Singapura", "சிங்கப்பூர்"], feature_type: "country", admin_level: 2, continent: "Asia", country_code: "SG", country_name: "Singapore", city: "Singapore", lat: 1.3521, lon: 103.8198, population: 5637000, timezone: "Asia/Singapore" },
  { id: 17, name: "United Kingdom", ascii_name: "United Kingdom", alternate_names: ["UK", "Britain", "Great Britain"], feature_type: "country", admin_level: 2, continent: "Europe", country_code: "GB", country_name: "United Kingdom", lat: 55.3781, lon: -3.4360, population: 67330000, timezone: "Europe/London" },
  { id: 18, name: "London", ascii_name: "London", alternate_names: ["Greater London", "Londres"], feature_type: "city", admin_level: 5, continent: "Europe", country_code: "GB", country_name: "United Kingdom", state_province: "England", city: "London", lat: 51.5074, lon: -0.1278, population: 8982000, timezone: "Europe/London" },
  { id: 19, name: "Cambridge", ascii_name: "Cambridge", alternate_names: ["Cambridge UK"], feature_type: "city", admin_level: 5, continent: "Europe", country_code: "GB", country_name: "United Kingdom", state_province: "Cambridgeshire", city: "Cambridge", postal_code: "CB1", lat: 52.2053, lon: 0.1218, population: 145700, timezone: "Europe/London" },
  { id: 20, name: "France", ascii_name: "France", alternate_names: ["French Republic"], feature_type: "country", admin_level: 2, continent: "Europe", country_code: "FR", country_name: "France", lat: 46.2276, lon: 2.2137, population: 67750000, timezone: "Europe/Paris" },
  { id: 21, name: "Paris", ascii_name: "Paris", alternate_names: ["Ville de Paris"], feature_type: "city", admin_level: 5, continent: "Europe", country_code: "FR", country_name: "France", state_province: "Île-de-France", city: "Paris", lat: 48.8566, lon: 2.3522, population: 2161000, timezone: "Europe/Paris" },
  { id: 22, name: "Germany", ascii_name: "Germany", alternate_names: ["Deutschland"], feature_type: "country", admin_level: 2, continent: "Europe", country_code: "DE", country_name: "Germany", lat: 51.1657, lon: 10.4515, population: 84400000, timezone: "Europe/Berlin" },
  { id: 23, name: "Berlin", ascii_name: "Berlin", alternate_names: ["Berlino"], feature_type: "city", admin_level: 5, continent: "Europe", country_code: "DE", country_name: "Germany", state_province: "Berlin", city: "Berlin", lat: 52.5200, lon: 13.4050, population: 3645000, timezone: "Europe/Berlin" },
  { id: 24, name: "United States", ascii_name: "United States", alternate_names: ["USA", "US", "America"], feature_type: "country", admin_level: 2, continent: "North America", country_code: "US", country_name: "United States", lat: 37.0902, lon: -95.7129, population: 331900000, timezone: "America/New_York" },
  { id: 25, name: "New York", ascii_name: "New York", alternate_names: ["NYC", "New York City"], feature_type: "city", admin_level: 5, continent: "North America", country_code: "US", country_name: "United States", state_province: "New York", city: "New York", postal_code: "10001", lat: 40.7128, lon: -74.0060, population: 8804190, timezone: "America/New_York" },
  { id: 26, name: "San Francisco", ascii_name: "San Francisco", alternate_names: ["SF", "Bay Area"], feature_type: "city", admin_level: 5, continent: "North America", country_code: "US", country_name: "United States", state_province: "California", city: "San Francisco", postal_code: "94102", lat: 37.7749, lon: -122.4194, population: 873965, timezone: "America/Los_Angeles" },
  { id: 27, name: "Canada", ascii_name: "Canada", alternate_names: ["CA"], feature_type: "country", admin_level: 2, continent: "North America", country_code: "CA", country_name: "Canada", lat: 56.1304, lon: -106.3468, population: 38250000, timezone: "America/Toronto" },
  { id: 28, name: "Toronto", ascii_name: "Toronto", alternate_names: ["GTA"], feature_type: "city", admin_level: 5, continent: "North America", country_code: "CA", country_name: "Canada", state_province: "Ontario", city: "Toronto", postal_code: "M5H 2N2", lat: 43.6532, lon: -79.3832, population: 2794356, timezone: "America/Toronto" },
  { id: 29, name: "Australia", ascii_name: "Australia", alternate_names: ["Oz"], feature_type: "country", admin_level: 2, continent: "Oceania", country_code: "AU", country_name: "Australia", lat: -25.2744, lon: 133.7751, population: 25690000, timezone: "Australia/Sydney" },
  { id: 30, name: "Sydney", ascii_name: "Sydney", alternate_names: ["Сидней"], feature_type: "city", admin_level: 5, continent: "Oceania", country_code: "AU", country_name: "Australia", state_province: "New South Wales", city: "Sydney", postal_code: "2000", lat: -33.8688, lon: 151.2093, population: 5312000, timezone: "Australia/Sydney" },
  { id: 31, name: "Brazil", ascii_name: "Brazil", alternate_names: ["Brasil"], feature_type: "country", admin_level: 2, continent: "South America", country_code: "BR", country_name: "Brazil", lat: -14.2350, lon: -51.9253, population: 214300000, timezone: "America/Sao_Paulo" },
  { id: 32, name: "São Paulo", ascii_name: "Sao Paulo", alternate_names: ["Sao Paulo", "Sampa"], feature_type: "city", admin_level: 5, continent: "South America", country_code: "BR", country_name: "Brazil", state_province: "São Paulo", city: "São Paulo", lat: -23.5505, lon: -46.6333, population: 12330000, timezone: "America/Sao_Paulo" },
  { id: 33, name: "South Africa", ascii_name: "South Africa", alternate_names: ["RSA"], feature_type: "country", admin_level: 2, continent: "Africa", country_code: "ZA", country_name: "South Africa", lat: -30.5595, lon: 22.9375, population: 59310000, timezone: "Africa/Johannesburg" },
  { id: 34, name: "Johannesburg", ascii_name: "Johannesburg", alternate_names: ["Joburg"], feature_type: "city", admin_level: 5, continent: "Africa", country_code: "ZA", country_name: "South Africa", state_province: "Gauteng", city: "Johannesburg", lat: -26.2041, lon: 28.0473, population: 5635000, timezone: "Africa/Johannesburg" },
  { id: 35, name: "Cairo", ascii_name: "Cairo", alternate_names: ["القاهرة"], feature_type: "city", admin_level: 5, continent: "Africa", country_code: "EG", country_name: "Egypt", city: "Cairo", lat: 30.0444, lon: 31.2357, population: 9540000, timezone: "Africa/Cairo" }
];

export const LOCAL_ENTITIES: LocalEntity[] = [
  {
    id: 1001,
    name: "Madras Institute of Technology (MIT Anna University)",
    category: "university",
    subcategory: "engineering_college",
    address: "MIT Road, Chromepet, Chennai, Tamil Nadu 600044",
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    country_code: "IN",
    postal_code: "600044",
    lat: 12.9482,
    lon: 80.1405,
    phone: "+91 44 2251 6002",
    website: "https://mitindia.edu",
    opening_hours: "Mon-Fri 08:30 - 17:00",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.8,
    review_count: 1420,
    details: { founded: 1949, notable_alumni: "Dr. A.P.J. Abdul Kalam" }
  },
  {
    id: 1002,
    name: "Madras Christian College (MCC)",
    category: "college",
    subcategory: "arts_and_science",
    address: "Tambaram East, Chennai, Tamil Nadu 600059",
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    country_code: "IN",
    postal_code: "600059",
    lat: 12.9234,
    lon: 80.1245,
    phone: "+91 44 2239 0675",
    website: "https://mcc.edu.in",
    opening_hours: "Mon-Fri 08:30 - 16:30",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.7,
    review_count: 2150,
    details: { founded: 1837 }
  },
  {
    id: 1003,
    name: "B.S. Abdur Rahman Crescent Institute of Science and Technology",
    category: "university",
    subcategory: "engineering_college",
    address: "GST Road, Vandalur, Chennai, Tamil Nadu 600048",
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    country_code: "IN",
    postal_code: "600048",
    lat: 12.8778,
    lon: 80.0864,
    phone: "+91 44 2275 1347",
    website: "https://crescent.education",
    opening_hours: "Mon-Fri 09:00 - 17:00",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.5,
    review_count: 890,
    details: {}
  },
  {
    id: 1004,
    name: "Hindu Mission Hospital",
    category: "hospital",
    subcategory: "multispeciality_hospital",
    address: "103, GST Road, Tambaram West, Chennai, Tamil Nadu 600045",
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    country_code: "IN",
    postal_code: "600045",
    lat: 12.9242,
    lon: 80.1165,
    phone: "+91 44 2226 2244",
    website: "https://hindumissionhospital.org",
    opening_hours: "Open 24 Hours",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.6,
    review_count: 3100,
    details: { beds: 300, emergency: "24/7 Emergency & Trauma" }
  },
  {
    id: 1005,
    name: "Apollo Hospitals Greams Road",
    category: "hospital",
    subcategory: "super_speciality_hospital",
    address: "21 Greams Lane, Thousand Lights, Chennai, Tamil Nadu 600006",
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    country_code: "IN",
    postal_code: "600006",
    lat: 13.0569,
    lon: 80.2520,
    phone: "+91 44 2829 0200",
    website: "https://apollohospitals.com",
    opening_hours: "Open 24 Hours",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.7,
    review_count: 6800,
    details: { specialities: ["Cardiology", "Oncology", "Neurology"] }
  },
  {
    id: 1006,
    name: "IIT Madras (Indian Institute of Technology Madras)",
    category: "university",
    subcategory: "institute_of_eminence",
    address: "Sardar Patel Road, Adyar, Chennai, Tamil Nadu 600036",
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    country_code: "IN",
    postal_code: "600036",
    lat: 12.9915,
    lon: 80.2337,
    phone: "+91 44 2257 8000",
    website: "https://iitm.ac.in",
    opening_hours: "Mon-Fri 08:30 - 17:30",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.9,
    review_count: 5200,
    details: { rank: "NIRF Rank 1 in India" }
  },
  {
    id: 1007,
    name: "PSG College of Technology",
    category: "college",
    subcategory: "engineering_college",
    address: "Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu 641004",
    city: "Coimbatore",
    state: "Tamil Nadu",
    country: "India",
    country_code: "IN",
    postal_code: "641004",
    lat: 11.0248,
    lon: 77.0028,
    phone: "+91 422 257 2177",
    website: "https://psgtech.edu",
    opening_hours: "Mon-Fri 08:30 - 16:30",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.8,
    review_count: 2900,
    details: { founded: 1951 }
  },
  {
    id: 1008,
    name: "St Thomas' Hospital London",
    category: "hospital",
    subcategory: "nhs_major_teaching_hospital",
    address: "Westminster Bridge Rd, London SE1 7EH, United Kingdom",
    city: "London",
    state: "England",
    country: "United Kingdom",
    country_code: "GB",
    postal_code: "SE1 7EH",
    lat: 51.4988,
    lon: -0.1189,
    phone: "+44 20 7188 7188",
    website: "https://guysandstthomas.nhs.uk",
    opening_hours: "Open 24 Hours",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.6,
    review_count: 2800,
    details: {}
  },
  {
    id: 1009,
    name: "University of Cambridge",
    category: "university",
    subcategory: "collegiate_research_university",
    address: "The Old Schools, Trinity Ln, Cambridge CB2 1TN, United Kingdom",
    city: "Cambridge",
    state: "Cambridgeshire",
    country: "United Kingdom",
    country_code: "GB",
    postal_code: "CB2 1TN",
    lat: 52.2053,
    lon: 0.1166,
    phone: "+44 1223 337733",
    website: "https://cam.ac.uk",
    opening_hours: "Mon-Fri 09:00 - 17:00",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.9,
    review_count: 7800,
    details: { founded: 1209 }
  },
  {
    id: 1010,
    name: "Massachusetts Institute of Technology (MIT)",
    category: "university",
    subcategory: "research_university",
    address: "77 Massachusetts Ave, Cambridge, MA 02139, United States",
    city: "Cambridge",
    state: "Massachusetts",
    country: "United States",
    country_code: "US",
    postal_code: "02139",
    lat: 42.3601,
    lon: -71.0942,
    phone: "+1 617-253-1000",
    website: "https://mit.edu",
    opening_hours: "Mon-Fri 09:00 - 17:00",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.9,
    review_count: 9400,
    details: { founded: 1861 }
  },
  {
    id: 1011,
    name: "University of Tokyo (東京大学)",
    category: "university",
    subcategory: "national_research_university",
    address: "7 Chome-3-1 Hongo, Bunkyo City, Tokyo 113-8654, Japan",
    city: "Tokyo",
    state: "Tokyo",
    country: "Japan",
    country_code: "JP",
    postal_code: "113-8654",
    lat: 35.7126,
    lon: 139.7620,
    phone: "+81 3-3812-2111",
    website: "https://u-tokyo.ac.jp",
    opening_hours: "Mon-Fri 09:00 - 17:00",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.8,
    review_count: 4100,
    details: {}
  },
  {
    id: 1012,
    name: "NewYork-Presbyterian / Weill Cornell Medical Center",
    category: "hospital",
    subcategory: "academic_medical_center",
    address: "525 E 68th St, New York, NY 10065, United States",
    city: "New York",
    state: "New York",
    country: "United States",
    country_code: "US",
    postal_code: "10065",
    lat: 40.7651,
    lon: -73.9542,
    phone: "+1 212-746-5454",
    website: "https://nyp.org",
    opening_hours: "Open 24 Hours",
    is_open_now: 1,
    verified_status: "verified_physical",
    rating: 4.6,
    review_count: 3900,
    details: {}
  }
];

export const LIVE_LOCAL_DATA: Record<string, any> = {
  chennai: {
    weather: { temperature_c: 31, condition: "Partly Cloudy", humidity_percent: 74, wind_kmh: 14, air_quality_index: 58, air_quality_label: "Moderate", published_at: new Date().toISOString(), source: "Chennai Meteorological Centre" },
    transit_updates: [
      { line: "Chennai Suburban (Beach - Tambaram - Chengalpattu)", status: "Normal Service", message: "Trains running on regular 10-minute frequency across Tambaram corridor.", last_checked_at: new Date().toISOString() },
      { line: "Chennai Metro Blue Line", status: "On Time", message: "Airport to Wimco Nagar operating normally with 5 min headway.", last_checked_at: new Date().toISOString() }
    ],
    announcements: [{ title: "Greater Chennai Corporation Civic Update", type: "public_advisory", issued_at: new Date().toISOString(), source: "Greater Chennai Corporation (GCC)" }]
  },
  london: {
    weather: { temperature_c: 11, condition: "Overcast", humidity_percent: 82, wind_kmh: 18, air_quality_index: 32, air_quality_label: "Good", published_at: new Date().toISOString(), source: "UK Met Office" },
    transit_updates: [{ line: "London Underground - Jubilee Line", status: "Good Service", message: "Normal scheduled operations across all stations.", last_checked_at: new Date().toISOString() }],
    announcements: []
  },
  tokyo: {
    weather: { temperature_c: 16, condition: "Clear", humidity_percent: 55, wind_kmh: 10, air_quality_index: 28, air_quality_label: "Good", published_at: new Date().toISOString(), source: "Japan Meteorological Agency" },
    transit_updates: [{ line: "JR Yamanote Line", status: "On Schedule", message: "Trains operating smoothly in inner and outer circles.", last_checked_at: new Date().toISOString() }],
    announcements: []
  },
  "new york": {
    weather: { temperature_c: 9, condition: "Breezy", humidity_percent: 60, wind_kmh: 22, air_quality_index: 38, air_quality_label: "Good", published_at: new Date().toISOString(), source: "National Weather Service NYC" },
    transit_updates: [{ line: "MTA Subway - 4, 5, 6 Trains", status: "Good Service", message: "Lexington Avenue Express & Local running on regular schedule.", last_checked_at: new Date().toISOString() }],
    announcements: []
  }
};

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}
