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
  source: 'google_maps' | 'web_search' | 'bbb' | 'yellowpages' | 'manta' | 'directory';
  sourceUrl: string | null;
  rawData: unknown;
}

// === After enrichment ===

export interface EnrichedLead extends Omit<RawLead, 'rawData'> {
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
