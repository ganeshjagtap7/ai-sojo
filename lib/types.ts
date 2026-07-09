// === Criteria (from AI conversation) ===

export interface SearchCriteria {
  location: {
    city: string;
    state: string;
    country: string;
    radiusMiles: number;
  };
  industry: {
    primary: string;
    subSectors: string[];
    keywords: string[];
  };
  businessSize: {
    revenueMin: number | null;
    revenueMax: number | null;
    employeeMin: number | null;
    employeeMax: number | null;
    // Buy-side asking-price band, e.g. "acquire under $500k" => priceMax. Optional
    // so existing constructors/tests compile; the ranker rewards for-sale listings
    // whose askingPrice falls inside it.
    priceMin?: number | null;
    priceMax?: number | null;
  };
  preferences: {
    businessAgeYears: number | null;
    ownerOperated: boolean | null;
    disqualifiers: string[];
  };
  searcherType: 'traditional' | 'self_funded' | 'aspiring' | 'unknown';
}

// === Scraping output ===

export interface RawLead {
  businessName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  googleRating: number | null;
  reviewCount: number | null;
  categories: string[];
  yearsInBusiness: number | null;
  employeeCount: number | null;
  bbbRating: string | null;
  bbbAccredited: boolean | null;
  source: 'google_maps' | 'web_search' | 'bbb' | 'yellowpages' | 'manta' | 'startupage' | 'apppeak' | 'quietlight' | 'websiteclosers' | 'investorsclub' | 'motioninvest' | 'microns' | 'synergy' | 'businessdeals' | 'exitbid' | 'sideprojectors' | 'indiabiz' | 'buybiz' | 'mergerdomo' | 'tobuz' | 'smedealz' | 'businessex' | 'businessesforsale' | 'trustmrr' | 'producthunt' | 'franchisegator' | 'hvacinformed' | 'trustpilot' | 'esa' | 'serviceexperts' | 'dealstream' | 'directory';
  sourceUrl: string | null;
  // === Deal-sourcing fields (populated by marketplace scrapers like StartuPage / AppPeak) ===
  // Optional so local-business scrapers and the enricher compile untouched.
  mrr?: number | null;            // monthly recurring revenue, USD
  askingPrice?: number | null;    // sale price, USD (null when not for sale)
  revenueMultiple?: number | null; // asking price / annual revenue (null when N/A)
  profitMultiple?: number | null;  // asking price / annual profit (null when N/A)
  annualRevenue?: number | null;  // when stated directly
  annualProfit?: number | null;   // when stated directly
  currency?: string | null;       // ISO 4217 of the money fields as listed on the source (e.g. 'INR', 'USD'); null = infer
  forSale?: boolean | null;       // true = listed for sale, false = MRR-only target
  founderName?: string | null;
  foundedDate?: string | null;    // founding date from profile JSON-LD, e.g. "2026-06-01"
  rawData: unknown;
}

// === After enrichment ===

// Extends RawLead in full (incl. deal fields + rawData) so real scraped data —
// asking price, revenue, cash flow, EBITDA, broker contact, etc. — survives
// enrichment instead of being dropped. The enricher only ADDS id/contact/
// businessDetails on top; it must never discard the source's real fields.
export interface EnrichedLead extends RawLead {
  id: string;
  contact: {
    ownerName: string | null;
    phone: string | null;
    email: string | null;
    linkedin: string | null;
    website: string | null;
  };
  businessDetails: {
    yearsInBusiness: number | null;
    employeeCount: number | null;
    estimatedRevenue: string | null;
    googleRating: number | null;
    reviewCount: number | null;
    bbbRating: string | null;
    bbbAccredited: boolean | null;
    operatingHours: string | null;
    categories: string[];
  };
}

// === After ranking ===

export interface RankedLead extends EnrichedLead {
  matchScore: number;
  matchReason: string;
  scrapedAt: string;
}

// === Job ===

export interface SearchMetadata {
  totalScraped: number;
  afterDedup: number;
  afterFiltering: number;
  sourcesUsed: string[];
  searchDurationSeconds: number;
}

export interface JobProgress {
  step: string;
  stepsCompleted: number;
  totalSteps: number;
  message: string;
}

export interface Job {
  id: string;
  status: 'processing' | 'complete' | 'failed';
  criteria: SearchCriteria;
  progress: JobProgress;
  results: RankedLead[] | null;
  metadata: SearchMetadata | null;
  error: string | null;
  createdAt: number;
}
