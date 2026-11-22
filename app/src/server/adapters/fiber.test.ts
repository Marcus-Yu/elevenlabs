import { describe, expect, it } from "vitest";
import { CompanyRecordSchema, ContactRecordSchema } from "../../shared/contracts";
import { createFiberAdapter, InsufficientCreditsError, normalizeDomain, toCompanyRecord, toContactRecord } from "./fiber";
import type { HttpClient, HttpRequest } from "./http";

const NOW = new Date("2026-11-22T12:00:00.000Z");

function fakeHttp(respond: (req: HttpRequest) => { status?: number; body: unknown }) {
  const calls: HttpRequest[] = [];
  const http: HttpClient = {
    mode: "live",
    async request<T>(req: HttpRequest) {
      calls.push(req);
      const { status = 200, body } = respond(req);
      return { status, ok: status < 300, body: body as T, mode: "live" as const };
    },
  };
  return { http, calls };
}

describe("fiber adapter", () => {
  it("maps an ICP into company-search filters, with the key in the body", async () => {
    const { http, calls } = fakeHttp(() => ({ body: { output: { data: [] } } }));
    await createFiberAdapter({ http, apiKey: "k-123", now: () => NOW }).searchCompanies({
      keywords: ["warehouse"],
      industries: ["Logistics"],
      countryCodes: ["USA"],
      employeeCount: { min: 101, max: 1000 },
      pageSize: 5,
    });
    expect(calls[0]).toMatchObject({ provider: "fiber", method: "POST", url: "https://api.fiber.ai/v1/company-search" });
    expect(calls[0].body).toEqual({
      apiKey: "k-123",
      pageSize: 5,
      searchParams: {
        keywords: { containsAny: ["warehouse"] },
        industriesV2: { anyOf: ["Logistics"] },
        headquartersCountryCode: { anyOf: ["USA"] },
        employeeCountV2: { lowerBoundExclusive: 100, upperBoundInclusive: 1000 },
      },
    });
  });

  it("gives every populated company field its own source", () => {
    const record = toCompanyRecord(
      {
        preferred_name: "Locus Robotics",
        domains: ["locusrobotics.com"],
        short_description: "Warehouse robotics company.",
        standard_industries: ["Logistics"],
        employee_count_consensus: { gte: 474, lte: 474 },
        location_consensus: { city: "Wilmington", state_name: "Massachusetts", country_name: "United States of America" },
        linkedin_primary_slug: "locus-robotics",
      },
      NOW.toISOString(),
    );
    expect(CompanyRecordSchema.parse(record)).toBeTruthy();
    expect(record).toMatchObject({ domain: "locusrobotics.com", headcount: { min: 474, max: 474 }, hq: "Wilmington, Massachusetts, United States of America" });
    expect(record!.sources.map((s) => s.claim.split(":")[0])).toEqual(["name", "description", "industry", "headcount", "headquarters"]);
    expect(record!.sources.every((s) => s.url === "https://www.linkedin.com/company/locus-robotics" && s.provider === "fiber")).toBe(true);
  });

  it("drops companies without a domain or name instead of inventing one", () => {
    expect(toCompanyRecord({ preferred_name: "No Domain Inc" }, NOW.toISOString())).toBeNull();
    expect(toCompanyRecord({ domains: ["x.com"] }, NOW.toISOString())).toBeNull();
  });

  it("maps a person to a contact with the current title and never an email", () => {
    const contact = toContactRecord(
      {
        name: "Example Person",
        url: "https://linkedin.com/in/example",
        primary_slug: "example",
        experiences: [
          { is_current: false, title: "Analyst", company_name: "Old Co" },
          { is_current: true, title: "Senior Director of Supply Chain", company_name: "Locus Robotics" },
        ],
        // A provider adding email must not leak it through search.
        ...({ email: "should-not-appear@example.com" } as object),
      },
      "locusrobotics.com",
      NOW.toISOString(),
    );
    expect(ContactRecordSchema.parse(contact)).toBeTruthy();
    expect(contact).toMatchObject({ title: "Senior Director of Supply Chain", linkedinUrl: "https://linkedin.com/in/example" });
    expect(contact).not.toHaveProperty("email");
  });

  it("sends title filters as Fiber term objects and caps contacts at three", async () => {
    const { http, calls } = fakeHttp(() => ({ body: { output: { data: [] } } }));
    await createFiberAdapter({ http, apiKey: "k" }).searchPeople({ companyDomain: "https://www.Logiwa.com/", roles: ["operations"], limit: 10 });
    expect(calls[0].body).toMatchObject({
      pageSize: 3,
      currentCompanies: [{ domain: "logiwa.com" }],
      searchParams: { jobTitleV2: { anyOf: [{ type: "term", term: "operations" }] } },
    });
  });

  it("checks credits before the billed email reveal and refuses when empty", async () => {
    const { http, calls } = fakeHttp((req) =>
      req.method === "GET" ? { body: { output: [{ available: 0, used: 2500, max: 2500 }] } } : { body: {} },
    );
    await expect(
      createFiberAdapter({ http, apiKey: "k" }).revealWorkEmail({ fullName: "A B", companyDomain: "x.com" }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
  });

  it("returns the validated email when the reveal succeeds", async () => {
    const { http } = fakeHttp((req) =>
      req.method === "GET"
        ? { body: { output: [{ available: 10, used: 0, max: 10 }] } }
        : { body: { output: { emails: [{ emailAddress: "a@x.com", validationStatus: "invalid" }, { emailAddress: "b@x.com", validationStatus: "valid" }] } } },
    );
    expect(await createFiberAdapter({ http, apiKey: "k" }).revealWorkEmail({ fullName: "A B", companyDomain: "x.com" })).toBe("b@x.com");
  });

  it("raises a FiberError with the provider's message on failure", async () => {
    const { http } = fakeHttp(() => ({ status: 400, body: { message: "bad searchParams" } }));
    await expect(createFiberAdapter({ http, apiKey: "k" }).searchCompanies({})).rejects.toThrow(/company-search failed with HTTP 400: bad searchParams/);
  });

  it("normalises domains", () => {
    expect(normalizeDomain("https://www.Example.com/path")).toBe("example.com");
    expect(normalizeDomain("example.org")).toBe("example.org");
    expect(normalizeDomain("")).toBe("");
  });
});
