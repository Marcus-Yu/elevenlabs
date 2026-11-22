import { z } from "zod";

const shortText = z.string().trim().min(1).max(160);
const years = z.number().int().min(0).max(60);
const reactionIds = z.array(shortText).min(1).max(8);

export const calibrationProfile = z.object({
  id: shortText,
  label: shortText,
  yearsExperience: years,
  skills: z.array(shortText).min(1).max(8),
  workStyle: shortText,
  synthetic: z.literal(true),
});
export const calibrationProfiles = z.array(calibrationProfile).min(6).max(8);
export const startCalibrationInput = z.object({ goalSummary: z.string().trim().min(1).max(2000) });
export const submitCalibrationInput = z.object({
  profiles: calibrationProfiles,
  reactions: z.array(z.object({
    id: shortText,
    profileId: shortText,
    decision: z.enum(["pick", "reject"]),
    reason: z.string().trim().min(1).max(600),
  })).min(1).max(8),
}).refine(({ profiles, reactions }) =>
  new Set(profiles.map((profile) => profile.id)).size === profiles.length &&
  new Set(reactions.map((reaction) => reaction.id)).size === reactions.length &&
  new Set(reactions.map((reaction) => reaction.profileId)).size === reactions.length &&
  reactions.every((reaction) => profiles.some((profile) => profile.id === reaction.profileId)),
);

export const calibrationCriteria = z.object({
  minimumExperience: z.object({ years, reactionIds }).nullable(),
  mustHaveSkills: z.array(z.object({ skill: shortText, reactionIds })).max(8),
  tradeOffs: z.array(z.object({ text: z.string().min(1).max(600), reactionIds })).max(8),
});
export type CalibrationCriteria = z.infer<typeof calibrationCriteria>;
export type CalibrationPanel = {
  profiles: z.infer<typeof calibrationProfiles>;
  source: "live" | "replay";
};
