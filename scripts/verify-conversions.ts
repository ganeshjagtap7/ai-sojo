// Live verification of the 5 query-based conversions: each must return
// mandate-relevant results, obey the cap (<=150 default), and finish <60s.
import { SearchCriteria } from '../lib/types';
import { scrapeTrustMRR } from '../lib/scraping/trustmrr';
import { scrapeSideProjectors } from '../lib/scraping/sideprojectors';
import { scrapeEsaContractors } from '../lib/scraping/esaContractors';
import { scrapeFranchiseGator } from '../lib/scraping/franchisegator';
import { scrapeBusinessEx } from '../lib/scraping/businessex';

const base = {
  businessSize: { revenueMin: null, revenueMax: null, employeeMin: null, employeeMax: null },
  preferences: { businessAgeYears: null, ownerOperated: null, disqualifiers: [] },
  searcherType: 'self_funded' as const,
};
const saas: SearchCriteria = { ...base,
  location: { city: '', state: '', country: '', radiusMiles: 0 },
  industry: { primary: 'SaaS', subSectors: ['software'], keywords: ['saas', 'analytics'] } };
const toronto: SearchCriteria = { ...base,
  location: { city: 'Toronto', state: 'ON', country: 'Canada', radiusMiles: 25 },
  industry: { primary: 'electrical', subSectors: [], keywords: ['electrical'] } };
const cleaningFL: SearchCriteria = { ...base,
  location: { city: 'Miami', state: 'FL', country: 'US', radiusMiles: 25 },
  industry: { primary: 'cleaning', subSectors: [], keywords: ['cleaning', 'restoration'] } };
const puneRetail: SearchCriteria = { ...base,
  location: { city: 'Pune', state: 'MH', country: 'India', radiusMiles: 25 },
  industry: { primary: 'retail', subSectors: [], keywords: ['retail', 'apparel'] } };

async function run(name: string, fn: () => Promise<{ businessName: string; categories: string[] }[]>) {
  const t0 = Date.now();
  try {
    const leads = await fn();
    const secs = Math.round((Date.now() - t0) / 1000);
    const status = leads.length > 0 && leads.length <= 200 && secs < 60 ? 'PASS' : 'CHECK';
    console.log(`${status} ${name.padEnd(16)} ${String(leads.length).padStart(4)} leads ${String(secs).padStart(3)}s  e.g. ${leads[0]?.businessName?.slice(0, 40) ?? '—'} [${leads[0]?.categories?.[0] ?? ''}]`);
  } catch (e) {
    console.log(`FAIL ${name.padEnd(16)} ${(e as Error).message.slice(0, 80)}`);
  }
}

async function main() {
  await run('trustmrr', () => scrapeTrustMRR(saas));
  await run('sideprojectors', () => scrapeSideProjectors(saas));
  await run('esa', () => scrapeEsaContractors(toronto));
  await run('franchisegator', () => scrapeFranchiseGator(cleaningFL));
  await run('businessex', () => scrapeBusinessEx(puneRetail));
}
main();
