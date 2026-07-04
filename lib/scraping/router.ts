import { SearchCriteria } from '@/lib/types';
import { SourceDef, enabledSources } from './registry';

const DIGITAL_TERMS = ['saas', 'software', 'app', 'ecommerce', 'e-commerce', 'online',
  'content', 'newsletter', 'agency', 'marketplace', 'amazon fba', 'shopify', 'domain',
  'website', 'digital', 'mobile', 'internet'];

export function isDigitalIndustry(industry: SearchCriteria['industry']): boolean {
  const hay = [industry.primary, ...industry.subSectors, ...industry.keywords]
    .join(' ').toLowerCase();
  return DIGITAL_TERMS.some((t) => hay.includes(t));
}

function isUS(loc: SearchCriteria['location']): boolean {
  const c = loc.country.trim().toLowerCase();
  return c === '' || c === 'us' || c === 'usa' || c === 'united states';
}

function isIndia(loc: SearchCriteria['location']): boolean {
  return loc.country.trim().toLowerCase() === 'india';
}

function industryTagMatch(tags: string[], industry: SearchCriteria['industry']): boolean {
  const hay = [industry.primary, ...industry.subSectors, ...industry.keywords]
    .join(' ').toLowerCase();
  return tags.some((t) => hay.includes(t));
}

/**
 * Deterministic source selection. Returns alwaysRun sources plus up to
 * MAX_EXTRA_SOURCES routed extras, in registry priority order.
 * Rules per source, all of which must hold for it to be picked:
 *  - region: 'us' sources only for US searches; 'india' only for India; 'global' always.
 *  - industries: 'any' matches all; 'digital' requires isDigitalIndustry;
 *    a tag array requires a tag match (niche directories).
 *  - kind 'local_business' extras (yellowpages/manta) require a non-digital,
 *    located search — they index physical businesses.
 *  - kind 'micro_saas' requires a digital search.
 */
export function selectSources(criteria: SearchCriteria): SourceDef[] {
  const cap = parseInt(process.env.MAX_EXTRA_SOURCES || '4', 10);
  const all = enabledSources();
  const core = all.filter((s) => s.alwaysRun);
  const digital = isDigitalIndustry(criteria.industry);

  const extras = all.filter((s) => {
    if (s.alwaysRun) return false;
    if (s.region === 'us' && !isUS(criteria.location)) return false;
    if (s.region === 'india' && !isIndia(criteria.location)) return false;
    if (s.industries === 'digital' && !digital) return false;
    if (Array.isArray(s.industries) && !industryTagMatch(s.industries, criteria.industry)) return false;
    if (s.kind === 'local_business' && (digital || !criteria.location.city)) return false;
    if (s.kind === 'micro_saas' && !digital) return false;
    if (s.kind === 'franchise' && !industryTagMatch(['franchise'], criteria.industry)) return false;
    return true;
  }).slice(0, cap);

  return [...core, ...extras];
}
