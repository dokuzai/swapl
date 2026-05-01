// Extended city catalog. The listing form picks from this list only — we
// don't accept arbitrary free-text city names because the postcard
// generator can't guarantee a sensible composition for cities the AI
// doesn't recognise.
//
// Aliases let users type the local form ("Roma", "München") and still
// resolve to the canonical English name we store on the listing.

export type ExtendedCity = {
  name: string;          // canonical English name (used as DB key + stamp default)
  country: string;
  countryCode: string;   // ISO-3166 alpha-2
  aliases?: string[];
  region:
    | "europe-mediterranean"
    | "europe-northern"
    | "europe-central"
    | "europe-eastern"
    | "asia-east"
    | "asia-south"
    | "asia-southeast"
    | "asia-central"
    | "middle-east"
    | "africa-north"
    | "africa-sub"
    | "americas-north"
    | "americas-latin"
    | "oceania"
    | "uk-ireland";
};

// 120 cities, biased toward swapl's likely demand (Europe, Latin America,
// East/Southeast Asia, North America). Add more as the network grows.
export const EXTENDED_CITIES: ExtendedCity[] = [
  // UK + Ireland
  { name: "London", country: "United Kingdom", countryCode: "GB", region: "uk-ireland" },
  { name: "Edinburgh", country: "United Kingdom", countryCode: "GB", region: "uk-ireland" },
  { name: "Glasgow", country: "United Kingdom", countryCode: "GB", region: "uk-ireland" },
  { name: "Manchester", country: "United Kingdom", countryCode: "GB", region: "uk-ireland" },
  { name: "Bristol", country: "United Kingdom", countryCode: "GB", region: "uk-ireland" },
  { name: "Dublin", country: "Ireland", countryCode: "IE", region: "uk-ireland" },

  // Europe — Northern
  { name: "Amsterdam", country: "Netherlands", countryCode: "NL", aliases: ["A'dam"], region: "europe-northern" },
  { name: "Rotterdam", country: "Netherlands", countryCode: "NL", region: "europe-northern" },
  { name: "Copenhagen", country: "Denmark", countryCode: "DK", aliases: ["København"], region: "europe-northern" },
  { name: "Stockholm", country: "Sweden", countryCode: "SE", region: "europe-northern" },
  { name: "Gothenburg", country: "Sweden", countryCode: "SE", aliases: ["Göteborg"], region: "europe-northern" },
  { name: "Oslo", country: "Norway", countryCode: "NO", region: "europe-northern" },
  { name: "Helsinki", country: "Finland", countryCode: "FI", region: "europe-northern" },
  { name: "Reykjavík", country: "Iceland", countryCode: "IS", aliases: ["Reykjavik"], region: "europe-northern" },
  { name: "Tallinn", country: "Estonia", countryCode: "EE", region: "europe-northern" },

  // Europe — Central
  { name: "Berlin", country: "Germany", countryCode: "DE", region: "europe-central" },
  { name: "Munich", country: "Germany", countryCode: "DE", aliases: ["München"], region: "europe-central" },
  { name: "Hamburg", country: "Germany", countryCode: "DE", region: "europe-central" },
  { name: "Cologne", country: "Germany", countryCode: "DE", aliases: ["Köln"], region: "europe-central" },
  { name: "Frankfurt", country: "Germany", countryCode: "DE", region: "europe-central" },
  { name: "Vienna", country: "Austria", countryCode: "AT", aliases: ["Wien"], region: "europe-central" },
  { name: "Salzburg", country: "Austria", countryCode: "AT", region: "europe-central" },
  { name: "Innsbruck", country: "Austria", countryCode: "AT", region: "europe-central" },
  { name: "Zürich", country: "Switzerland", countryCode: "CH", aliases: ["Zurich"], region: "europe-central" },
  { name: "Geneva", country: "Switzerland", countryCode: "CH", aliases: ["Genève"], region: "europe-central" },
  { name: "Bern", country: "Switzerland", countryCode: "CH", region: "europe-central" },
  { name: "Brussels", country: "Belgium", countryCode: "BE", aliases: ["Bruxelles"], region: "europe-central" },
  { name: "Antwerp", country: "Belgium", countryCode: "BE", aliases: ["Antwerpen"], region: "europe-central" },
  { name: "Luxembourg", country: "Luxembourg", countryCode: "LU", region: "europe-central" },

  // Europe — Mediterranean
  { name: "Paris", country: "France", countryCode: "FR", region: "europe-mediterranean" },
  { name: "Lyon", country: "France", countryCode: "FR", region: "europe-mediterranean" },
  { name: "Marseille", country: "France", countryCode: "FR", region: "europe-mediterranean" },
  { name: "Bordeaux", country: "France", countryCode: "FR", region: "europe-mediterranean" },
  { name: "Nice", country: "France", countryCode: "FR", region: "europe-mediterranean" },
  { name: "Madrid", country: "Spain", countryCode: "ES", region: "europe-mediterranean" },
  { name: "Barcelona", country: "Spain", countryCode: "ES", region: "europe-mediterranean" },
  { name: "Seville", country: "Spain", countryCode: "ES", aliases: ["Sevilla"], region: "europe-mediterranean" },
  { name: "Valencia", country: "Spain", countryCode: "ES", aliases: ["València"], region: "europe-mediterranean" },
  { name: "Bilbao", country: "Spain", countryCode: "ES", region: "europe-mediterranean" },
  { name: "Granada", country: "Spain", countryCode: "ES", region: "europe-mediterranean" },
  { name: "Lisbon", country: "Portugal", countryCode: "PT", aliases: ["Lisboa"], region: "europe-mediterranean" },
  { name: "Porto", country: "Portugal", countryCode: "PT", region: "europe-mediterranean" },
  { name: "Rome", country: "Italy", countryCode: "IT", aliases: ["Roma"], region: "europe-mediterranean" },
  { name: "Milan", country: "Italy", countryCode: "IT", aliases: ["Milano"], region: "europe-mediterranean" },
  { name: "Florence", country: "Italy", countryCode: "IT", aliases: ["Firenze"], region: "europe-mediterranean" },
  { name: "Venice", country: "Italy", countryCode: "IT", aliases: ["Venezia"], region: "europe-mediterranean" },
  { name: "Naples", country: "Italy", countryCode: "IT", aliases: ["Napoli"], region: "europe-mediterranean" },
  { name: "Bologna", country: "Italy", countryCode: "IT", region: "europe-mediterranean" },
  { name: "Turin", country: "Italy", countryCode: "IT", aliases: ["Torino"], region: "europe-mediterranean" },
  { name: "Palermo", country: "Italy", countryCode: "IT", region: "europe-mediterranean" },
  { name: "Athens", country: "Greece", countryCode: "GR", aliases: ["Athína"], region: "europe-mediterranean" },
  { name: "Santorini", country: "Greece", countryCode: "GR", region: "europe-mediterranean" },
  { name: "Thessaloniki", country: "Greece", countryCode: "GR", region: "europe-mediterranean" },

  // Europe — Eastern
  { name: "Prague", country: "Czechia", countryCode: "CZ", aliases: ["Praha"], region: "europe-eastern" },
  { name: "Warsaw", country: "Poland", countryCode: "PL", aliases: ["Warszawa"], region: "europe-eastern" },
  { name: "Krakow", country: "Poland", countryCode: "PL", aliases: ["Kraków"], region: "europe-eastern" },
  { name: "Budapest", country: "Hungary", countryCode: "HU", region: "europe-eastern" },
  { name: "Bucharest", country: "Romania", countryCode: "RO", aliases: ["București"], region: "europe-eastern" },
  { name: "Sofia", country: "Bulgaria", countryCode: "BG", region: "europe-eastern" },
  { name: "Belgrade", country: "Serbia", countryCode: "RS", aliases: ["Beograd"], region: "europe-eastern" },
  { name: "Zagreb", country: "Croatia", countryCode: "HR", region: "europe-eastern" },
  { name: "Split", country: "Croatia", countryCode: "HR", region: "europe-eastern" },
  { name: "Dubrovnik", country: "Croatia", countryCode: "HR", region: "europe-eastern" },
  { name: "Ljubljana", country: "Slovenia", countryCode: "SI", region: "europe-eastern" },

  // Middle East / North Africa
  { name: "Istanbul", country: "Türkiye", countryCode: "TR", region: "middle-east" },
  { name: "Ankara", country: "Türkiye", countryCode: "TR", region: "middle-east" },
  { name: "Tel Aviv", country: "Israel", countryCode: "IL", region: "middle-east" },
  { name: "Jerusalem", country: "Israel", countryCode: "IL", region: "middle-east" },
  { name: "Dubai", country: "UAE", countryCode: "AE", region: "middle-east" },
  { name: "Abu Dhabi", country: "UAE", countryCode: "AE", region: "middle-east" },
  { name: "Doha", country: "Qatar", countryCode: "QA", region: "middle-east" },
  { name: "Beirut", country: "Lebanon", countryCode: "LB", region: "middle-east" },
  { name: "Amman", country: "Jordan", countryCode: "JO", region: "middle-east" },
  { name: "Marrakesh", country: "Morocco", countryCode: "MA", aliases: ["Marrakech"], region: "africa-north" },
  { name: "Casablanca", country: "Morocco", countryCode: "MA", region: "africa-north" },
  { name: "Fez", country: "Morocco", countryCode: "MA", aliases: ["Fes"], region: "africa-north" },
  { name: "Tunis", country: "Tunisia", countryCode: "TN", region: "africa-north" },
  { name: "Cairo", country: "Egypt", countryCode: "EG", aliases: ["القاهرة"], region: "africa-north" },
  { name: "Alexandria", country: "Egypt", countryCode: "EG", region: "africa-north" },

  // Sub-Saharan Africa
  { name: "Cape Town", country: "South Africa", countryCode: "ZA", region: "africa-sub" },
  { name: "Johannesburg", country: "South Africa", countryCode: "ZA", region: "africa-sub" },
  { name: "Nairobi", country: "Kenya", countryCode: "KE", region: "africa-sub" },
  { name: "Accra", country: "Ghana", countryCode: "GH", region: "africa-sub" },
  { name: "Lagos", country: "Nigeria", countryCode: "NG", region: "africa-sub" },

  // Asia — East
  { name: "Tokyo", country: "Japan", countryCode: "JP", aliases: ["東京"], region: "asia-east" },
  { name: "Kyoto", country: "Japan", countryCode: "JP", aliases: ["京都"], region: "asia-east" },
  { name: "Osaka", country: "Japan", countryCode: "JP", aliases: ["大阪"], region: "asia-east" },
  { name: "Sapporo", country: "Japan", countryCode: "JP", region: "asia-east" },
  { name: "Seoul", country: "South Korea", countryCode: "KR", aliases: ["서울"], region: "asia-east" },
  { name: "Busan", country: "South Korea", countryCode: "KR", region: "asia-east" },
  { name: "Beijing", country: "China", countryCode: "CN", aliases: ["北京"], region: "asia-east" },
  { name: "Shanghai", country: "China", countryCode: "CN", aliases: ["上海"], region: "asia-east" },
  { name: "Hong Kong", country: "China", countryCode: "HK", aliases: ["香港"], region: "asia-east" },
  { name: "Taipei", country: "Taiwan", countryCode: "TW", region: "asia-east" },

  // Asia — Southeast
  { name: "Singapore", country: "Singapore", countryCode: "SG", region: "asia-southeast" },
  { name: "Bangkok", country: "Thailand", countryCode: "TH", region: "asia-southeast" },
  { name: "Chiang Mai", country: "Thailand", countryCode: "TH", region: "asia-southeast" },
  { name: "Bali", country: "Indonesia", countryCode: "ID", region: "asia-southeast" },
  { name: "Jakarta", country: "Indonesia", countryCode: "ID", region: "asia-southeast" },
  { name: "Hanoi", country: "Vietnam", countryCode: "VN", region: "asia-southeast" },
  { name: "Ho Chi Minh City", country: "Vietnam", countryCode: "VN", aliases: ["Saigon"], region: "asia-southeast" },
  { name: "Manila", country: "Philippines", countryCode: "PH", region: "asia-southeast" },
  { name: "Kuala Lumpur", country: "Malaysia", countryCode: "MY", region: "asia-southeast" },

  // Asia — South
  { name: "Mumbai", country: "India", countryCode: "IN", region: "asia-south" },
  { name: "Delhi", country: "India", countryCode: "IN", region: "asia-south" },
  { name: "Bangalore", country: "India", countryCode: "IN", aliases: ["Bengaluru"], region: "asia-south" },
  { name: "Jaipur", country: "India", countryCode: "IN", region: "asia-south" },
  { name: "Goa", country: "India", countryCode: "IN", region: "asia-south" },

  // Oceania
  { name: "Sydney", country: "Australia", countryCode: "AU", region: "oceania" },
  { name: "Melbourne", country: "Australia", countryCode: "AU", region: "oceania" },
  { name: "Brisbane", country: "Australia", countryCode: "AU", region: "oceania" },
  { name: "Perth", country: "Australia", countryCode: "AU", region: "oceania" },
  { name: "Auckland", country: "New Zealand", countryCode: "NZ", region: "oceania" },
  { name: "Wellington", country: "New Zealand", countryCode: "NZ", region: "oceania" },

  // Americas — North
  { name: "New York", country: "USA", countryCode: "US", aliases: ["NYC", "Manhattan"], region: "americas-north" },
  { name: "Brooklyn", country: "USA", countryCode: "US", region: "americas-north" },
  { name: "Los Angeles", country: "USA", countryCode: "US", aliases: ["LA"], region: "americas-north" },
  { name: "San Francisco", country: "USA", countryCode: "US", aliases: ["SF"], region: "americas-north" },
  { name: "Chicago", country: "USA", countryCode: "US", region: "americas-north" },
  { name: "Boston", country: "USA", countryCode: "US", region: "americas-north" },
  { name: "Seattle", country: "USA", countryCode: "US", region: "americas-north" },
  { name: "Austin", country: "USA", countryCode: "US", region: "americas-north" },
  { name: "Miami", country: "USA", countryCode: "US", region: "americas-north" },
  { name: "Portland", country: "USA", countryCode: "US", region: "americas-north" },
  { name: "Toronto", country: "Canada", countryCode: "CA", region: "americas-north" },
  { name: "Vancouver", country: "Canada", countryCode: "CA", region: "americas-north" },
  { name: "Montréal", country: "Canada", countryCode: "CA", aliases: ["Montreal"], region: "americas-north" },

  // Americas — Latin
  { name: "CDMX", country: "Mexico", countryCode: "MX", aliases: ["Mexico City", "Ciudad de México"], region: "americas-latin" },
  { name: "Oaxaca", country: "Mexico", countryCode: "MX", region: "americas-latin" },
  { name: "Mérida", country: "Mexico", countryCode: "MX", aliases: ["Merida"], region: "americas-latin" },
  { name: "Guadalajara", country: "Mexico", countryCode: "MX", region: "americas-latin" },
  { name: "Buenos Aires", country: "Argentina", countryCode: "AR", region: "americas-latin" },
  { name: "Rio", country: "Brazil", countryCode: "BR", aliases: ["Rio de Janeiro"], region: "americas-latin" },
  { name: "São Paulo", country: "Brazil", countryCode: "BR", aliases: ["Sao Paulo"], region: "americas-latin" },
  { name: "Lima", country: "Peru", countryCode: "PE", region: "americas-latin" },
  { name: "Cusco", country: "Peru", countryCode: "PE", aliases: ["Cuzco"], region: "americas-latin" },
  { name: "Cartagena", country: "Colombia", countryCode: "CO", region: "americas-latin" },
  { name: "Bogotá", country: "Colombia", countryCode: "CO", aliases: ["Bogota"], region: "americas-latin" },
  { name: "Medellín", country: "Colombia", countryCode: "CO", aliases: ["Medellin"], region: "americas-latin" },
  { name: "Santiago", country: "Chile", countryCode: "CL", region: "americas-latin" },
  { name: "Havana", country: "Cuba", countryCode: "CU", aliases: ["La Habana"], region: "americas-latin" },
];

const lookup = new Map<string, ExtendedCity>();
for (const c of EXTENDED_CITIES) {
  lookup.set(c.name.toLowerCase(), c);
  for (const a of c.aliases ?? []) lookup.set(a.toLowerCase(), c);
}

export function findCity(input: string): ExtendedCity | null {
  return lookup.get(input.trim().toLowerCase()) ?? null;
}

export function isKnownCity(input: string): boolean {
  return findCity(input) !== null;
}

export function suggestCities(query: string, limit = 8): ExtendedCity[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = findCity(q);
  const scored: Array<{ city: ExtendedCity; score: number }> = [];
  for (const c of EXTENDED_CITIES) {
    if (exact && c.name === exact.name) continue;
    const haystacks = [c.name, ...(c.aliases ?? [])].map((s) => s.toLowerCase());
    let best = -1;
    for (const h of haystacks) {
      if (h.startsWith(q)) best = Math.max(best, 100 - h.length);
      else if (h.includes(q)) best = Math.max(best, 50 - h.length);
    }
    if (best > -1) scored.push({ city: c, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = exact ? [exact, ...scored.map((s) => s.city)] : scored.map((s) => s.city);
  return out.slice(0, limit);
}
