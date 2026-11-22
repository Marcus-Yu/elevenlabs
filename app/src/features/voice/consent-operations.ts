import { HttpError, prisma } from "wasp/server";

type Context = { user?: { id: string } | null };
function owner(context: Context): string {
  if (!context.user?.id) throw new HttpError(401);
  return context.user.id;
}

/** Model-processing consent is account-wide; never accept a user ID from the client. */
export async function getModelProcessingConsent(_args: void, context: Context) {
  const userId = owner(context);
  const active = await prisma.consent.findFirst({ where: { userId, kind: "model_processing", revokedAt: null }, select: { id: true } });
  return { granted: !!active };
}
export async function setModelProcessingConsent(args: { granted: boolean }, context: Context) {
  const userId = owner(context);
  if (typeof args?.granted !== "boolean") throw new HttpError(400, "Invalid consent choice");
  const where = { userId, kind: "model_processing", revokedAt: null } as const;
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$transaction(async tx => {
        if (args.granted) {
          const existing = await tx.consent.findFirst({ where, select: { id: true } });
          if (!existing) await tx.consent.create({ data: { userId, kind: "model_processing" } });
        } else {
          await tx.consent.updateMany({ where, data: { revokedAt: new Date() } });
        }
      }, { isolationLevel: "Serializable" });
      return;
    } catch (error) {
      if (attempt >= 3 || typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2034") throw error;
    }
  }
}
export async function listVoiceHireGoals(_args: void, context: Context) {
  const userId = owner(context);
  return prisma.goal.findMany({ where: { userId, kind: "hire", status: "ACTIVE" }, select: { id: true, statement: true }, orderBy: { createdAt: "desc" }, take: 100 });
}
