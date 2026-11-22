import type { ReactNode } from 'react';
import type { CalibrationProfile, CalibrationReaction } from './CalibrationCard';
import type { CalibrationCriteria } from './calibration-contracts';

export function CalibrationCriteriaReview({ criteria, profiles, reactions, children }: {
  criteria: CalibrationCriteria;
  profiles: CalibrationProfile[];
  reactions: CalibrationReaction[];
  children?: ReactNode;
}) {
  const labels = new Map(profiles.map(({ id, label }) => [id, label]));
  const evidence = new Map(reactions.map((reaction) => [reaction.id, reaction]));
  const requirements = [
    ...(criteria.minimumExperience ? [{ text: `Minimum ${criteria.minimumExperience.years} years of experience`, reactionIds: criteria.minimumExperience.reactionIds }] : []),
    ...criteria.mustHaveSkills.map(({ skill, reactionIds }) => ({ text: `Must have ${skill}`, reactionIds })),
    ...criteria.tradeOffs,
  ];
  return <section className="rounded border p-3 space-y-2">
    <h3 className="font-semibold">Review suggested criteria</h3>
    {requirements.length === 0 && <p>Your reactions did not produce a specific requirement.</p>}
    <ul className="space-y-2">{requirements.map(({ text, reactionIds }, index) => <li key={index}>
      <p>{text}</p>
      <ul className="list-disc pl-5 text-sm">{reactionIds.map((id) => {
        const reaction = evidence.get(id);
        return reaction && <li key={id}>
          {reaction.decision === 'pick' ? 'Picked' : 'Rejected'} {labels.get(reaction.profileId)} · “{reaction.reason}”
        </li>;
      })}</ul>
    </li>)}</ul>
    {children}
  </section>;
}
