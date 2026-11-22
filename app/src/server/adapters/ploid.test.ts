import { describe, expect, it } from "vitest";
import { ContactRecordSchema } from "../../shared/contracts";
import type { HttpClient, HttpRequest } from "./http";
import { createPloidAdapter, PloidError } from "./ploid";

// Synthetic responses shaped after Ploid's published OpenAPI spec (no Ploid key yet, so nothing recorded).

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

const SEARCH_BODY = {
  data: {
    results: [
      {
        url: "https://www.linkedin.com/in/synthetic-ops",
        title: "VP Operations",
        score: 0.9,
        person: { person_id: "p1", name: "Synthetic Ops Lead", title: "VP Operations", company: "Example 3PL", linkedin_url: "https://www.linkedin.com/in/synthetic-ops", confidence: 0.8, contact_status: "requires_enrichment" },
      },
      { url: null, title: null, score: 0.1, person: { person_id: "p2", name: null } },
    ],
  },
  meta: { request_id: "r1" },
};

describe("ploid adapter", () => {
  it("searches people with bearer auth and company and title filters", async () => {
    const { http, calls } = fakeHttp(() => ({ body: SEARCH_BODY }));
    const contacts = await createPloidAdapter({ http, apiKey: "pk" }).searchContacts({ companyDomain: "example3pl.com", companyName: "Example 3PL", roles: ["VP Operations"] });

    expect(calls[0]).toMatchObject({ provider: "ploid", method: "POST", url: "https://api.ploid.com/v1/search", headers: { authorization: "Bearer pk" } });
    expect(calls[0].body).toMatchObject({ type: "fast", num_results: 3, filters: { company: "Example 3PL", title: { any_of: ["VP Operations"] } } });
    expect(JSON.stringify(calls[0].body)).not.toContain("pk");
    expect(contacts).toHaveLength(1);
    expect(ContactRecordSchema.parse(contacts[0])).toMatchObject({ fullName: "Synthetic Ops Lead", companyDomain: "example3pl.com" });
    expect(contacts[0]).not.toHaveProperty("email");
    expect(contacts[0].sources[0]).toMatchObject({ provider: "ploid", url: "https://www.linkedin.com/in/synthetic-ops" });
  });

  it("reveals a work email only when Ploid reports it found", async () => {
    const found = fakeHttp(() => ({ body: { data: { work_email: { value: "ops@example3pl.com", status: "found" } }, meta: {} } }));
    const missing = fakeHttp(() => ({ body: { data: { work_email: { value: null, status: "not_found" } }, meta: {} } }));
    const contact = { fullName: "Synthetic Ops Lead", companyDomain: "example3pl.com", linkedinUrl: "https://www.linkedin.com/in/synthetic-ops" };

    expect(await createPloidAdapter({ http: found.http, apiKey: "pk" }).revealWorkEmail(contact)).toBe("ops@example3pl.com");
    expect(found.calls[0].body).toEqual({ fields: ["work_email"], response_format: "standard", linkedin_url: contact.linkedinUrl });
    expect(await createPloidAdapter({ http: missing.http, apiKey: "pk" }).revealWorkEmail(contact)).toBeUndefined();
  });

  it("falls back to name and company domain without a LinkedIn profile URL", async () => {
    const { http, calls } = fakeHttp(() => ({ body: { data: {}, meta: {} } }));
    await createPloidAdapter({ http, apiKey: "pk" }).revealWorkEmail({ fullName: "A B", companyDomain: "https://www.x.com" });
    expect(calls[0].body).toMatchObject({ name: "A B", company_domain: "x.com" });
  });

  it("raises PloidError on HTTP failure", async () => {
    const { http } = fakeHttp(() => ({ status: 401, body: { error: { message: "invalid key" } } }));
    await expect(createPloidAdapter({ http, apiKey: "bad" }).searchContacts({ companyDomain: "x.com", roles: ["ops"] })).rejects.toBeInstanceOf(PloidError);
  });
});
