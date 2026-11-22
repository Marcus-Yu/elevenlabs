import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMatchDemo, runMatchStep } from "./operations";

const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  consent: { findFirst: vi.fn(), create: vi.fn() },
  shareCard: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  actionLog: { findUnique: vi.fn() },
  cardMatch: { findFirst: vi.fn() },
  approval: { findMany: vi.fn() },
  profileFact: { findMany: vi.fn() },
}));
vi.mock("wasp/server", () => ({ prisma, HttpError: Error }));
const gateway = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../../server/gateway", () => ({ gateway }));

const context = (id: string) => ({ user: { id } }) as Parameters<typeof getMatchDemo>[1];
const card = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  fields: { published: { seeking: "Robotics" }, stripped: [], ruleId: "default", logReason: null, ...fields },
});
const revealedMatch = { id: "match", rationale: "Robotics", aAccepted: true, bAccepted: true, revealedAt: new Date() };
const approval = (status: string, fields: string[]) => ({ status, payload: { cardMatchId: "match", fields } });

beforeEach(() => {
  vi.resetAllMocks();
  prisma.shareCard.findFirst.mockResolvedValue(null);
  prisma.profileFact.findMany.mockResolvedValue([]);
});

describe("match demo operations", () => {
  it("reads each user's active, unexpired cards and resets just their own pair", async () => {
    await getMatchDemo(undefined, context("first"));
    const firstPartner = prisma.shareCard.findFirst.mock.calls[1][0].where.userId;
    await getMatchDemo(undefined, context("second"));
    const secondPartner = prisma.shareCard.findFirst.mock.calls[3][0].where.userId;
    expect(firstPartner).not.toBe(secondPartner);
    expect(firstPartner).not.toBe("first");
    expect(prisma.shareCard.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { userId: firstPartner, purpose: "match:robotics-engineer", status: "ACTIVE", expiresAt: { gt: expect.any(Date) } },
    }));

    await runMatchStep({ step: "reset" }, context("first") as Parameters<typeof runMatchStep>[1]);
    expect(prisma.shareCard.updateMany).toHaveBeenCalledWith({
      where: { userId: { in: ["first", firstPartner] }, purpose: "match:robotics-engineer", status: { in: ["ACTIVE", "DRAFT"] } },
      data: { status: "REVOKED" },
    });
  });

  it("publishes under the scoped synthetic account and stores only filtered fields", async () => {
    prisma.shareCard.findFirst.mockResolvedValueOnce(card("A"));
    prisma.shareCard.create.mockResolvedValue({ id: "B" });
    prisma.profileFact.findMany.mockResolvedValue([
      { id: "f1", key: "seeking", value: "Robotics" },
      { id: "f2", key: "experience", value: "ROS 2" },
      { id: "f3", key: "salary_floor", value: "$165,000" },
    ]);
    gateway.execute.mockResolvedValue({ decision: { outcome: "allow", ruleId: "card_fields" }, logId: "log" });
    const reason = 'card_fields: stripped "salary" (fact "salary_floor": declared_fact_not_allowed) as not allowed for matching';
    prisma.actionLog.findUnique.mockResolvedValue({ reason });

    await runMatchStep({ step: "publishB" }, context("first") as Parameters<typeof runMatchStep>[1]);
    const partner = prisma.shareCard.findFirst.mock.calls[1][0].where.userId;
    expect(prisma.user.create).toHaveBeenCalledWith({ data: { id: partner, profiles: expect.any(Object) } });
    expect(prisma.shareCard.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: partner, fields: {} }) });
    expect(prisma.shareCard.updateMany).toHaveBeenCalledWith({
      where: { id: "B", status: "DRAFT" },
      data: { status: "ACTIVE", fields: { published: { seeking: "Robotics", experience: "ROS 2" }, stripped: ["salary"], ruleId: "card_fields", logReason: reason } },
    });
  });

  it("returns no private draft from a legacy published B card", async () => {
    prisma.shareCard.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(card("B", {
      draft: { seeking: "Robotics", salary: "$165,000", email: "b@example.invalid" },
      privateNote: "Different private field",
      stripped: ["salary"],
    }));
    const result = await getMatchDemo(undefined, context("first"));
    expect(result).toMatchObject({
      draftA: expect.objectContaining({ hiring_for: expect.any(String) }),
      cardB: { published: { seeking: "Robotics" }, stripped: ["salary"], ruleId: "default", logReason: null },
      intro: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/165,000|b@example\.invalid|privateNote/);
  });

  it("keeps identity hidden until both reveals execute, then returns only the chosen fields", async () => {
    prisma.shareCard.findFirst.mockImplementation(({ where }) => card(where.userId));
    prisma.cardMatch.findFirst.mockResolvedValue(revealedMatch);
    prisma.approval.findMany.mockResolvedValueOnce([approval("EXECUTED", ["company"])])
      .mockResolvedValueOnce([approval("APPROVED", ["name"])]);
    await expect(getMatchDemo(undefined, context("first"))).resolves.toMatchObject({ intro: null });
    expect(prisma.profileFact.findMany).not.toHaveBeenCalled();

    prisma.approval.findMany.mockResolvedValueOnce([approval("EXECUTED", ["company"])])
      .mockResolvedValueOnce([approval("EXECUTED", ["name"])]);
    prisma.profileFact.findMany.mockResolvedValueOnce([{ key: "company_name", value: "Orrery Robotics" }])
      .mockResolvedValueOnce([{ key: "name", value: "Sam Rivera" }, { key: "email", value: "b@example.invalid" }]);
    const result = await getMatchDemo(undefined, context("first"));
    expect(result).toMatchObject({ intro: expect.stringContaining("Sam Rivera") });
    expect(JSON.stringify(result)).toContain("Orrery Robotics");
    expect(JSON.stringify(result)).not.toMatch(/b@example\.invalid|demo@example\.invalid/);
  });
});
