import type { CompanyRecord, ContactRecord, SourceRef, UntrustedText } from "../../../shared/contracts";

// Synthetic fixtures for the WP1 stub handlers. They are labelled as stubs in every record and
// use reserved .example domains (RFC 2606), so nothing here can be mistaken for a real company
// or delivered to a real inbox (AGENTS.md rules 1 and 5).

export const STUB_LABEL = "SYNTHETIC STUB DATA (WP1 stub handler) - not a real company or person";
const FETCHED_AT = "2026-11-22T00:00:00.000Z";

function stubSource(claim: string, path: string): SourceRef {
  return { provider: "web", url: `https://stub.example/${path}`, fetchedAt: FETCHED_AT, claim: `${STUB_LABEL}: ${claim}` };
}

export const STUB_COMPANIES: CompanyRecord[] = [
  {
    domain: "stub-3pl-one.example",
    name: "Stub 3PL One (synthetic)",
    description: "Synthetic third-party logistics operator used by WP1 stubs.",
    industry: "Logistics (synthetic)",
    headcount: { min: 201, max: 500 },
    hq: "Stubville, US (synthetic)",
    sources: [stubSource("name, industry and headcount", "companies/stub-3pl-one")],
  },
  {
    domain: "stub-contract-mfg.example",
    name: "Stub Contract Manufacturing (synthetic)",
    description: "Synthetic contract manufacturer used by WP1 stubs.",
    industry: "Contract manufacturing (synthetic)",
    headcount: { min: 51, max: 200 },
    hq: "Stubtown, US (synthetic)",
    sources: [stubSource("name, industry and headcount", "companies/stub-contract-mfg")],
  },
];

export const STUB_CONTACTS: ContactRecord[] = [
  {
    fullName: "Sam Stub (synthetic)",
    title: "VP Operations (synthetic)",
    companyDomain: "stub-3pl-one.example",
    sources: [stubSource("name and title", "people/sam-stub")],
  },
];

export const STUB_JOBS = [
  {
    title: "Robotics Integration Engineer (synthetic)",
    companyDomain: "stub-3pl-one.example",
    sources: [stubSource("job post", "jobs/robotics-integration")],
  },
];

export const STUB_PAGE: UntrustedText & { title: string } = {
  kind: "untrusted",
  text: "Synthetic page text returned by the WP1 web.read stub.",
  source: stubSource("page text", "pages/about"),
  flagged: false,
  title: "Stub page (synthetic)",
};

/** Reserved domain, so a stub reveal can never be delivered anywhere. */
export const STUB_REVEALED_EMAIL = "sam.stub@stub-3pl-one.example";
