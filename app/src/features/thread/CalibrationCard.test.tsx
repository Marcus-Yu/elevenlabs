import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCalibrationReactions, CalibrationCard, type CalibrationProfile } from './CalibrationCard';

const profiles: CalibrationProfile[] = [
  { id: 'a', label: 'Example A', yearsExperience: 5, skills: ['Python'], workStyle: 'Collaborative', synthetic: true },
  { id: 'b', label: 'Example B', yearsExperience: 3, skills: ['Design'], workStyle: 'Independent', synthetic: true },
];

describe('calibration card', () => {
  it('renders synthetic disclosure without preselected decisions', () => {
    const onSubmit = vi.fn();
    const html = renderToStaticMarkup(<CalibrationCard profiles={profiles} onSubmit={onSubmit} />);
    expect(html).toContain('synthetic examples');
    expect(html).toContain('Example A');
    expect(html).toContain('Python');
    expect(html).toMatch(/<button type="submit" disabled=""/);
    expect(html).not.toContain('checked=""');
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('allows a partial selection with explicit reason and supplied ID', () => {
    expect(buildCalibrationReactions(profiles, { a: { decision: 'pick', reason: '  Strong Python  ' } }, () => 'id1'))
      .toEqual([{ id: 'id1', profileId: 'a', decision: 'pick', reason: 'Strong Python' }]);
  });
  it('rejects empty, incomplete or ambiguous submissions', () => {
    expect(buildCalibrationReactions(profiles, {}, () => 'x')).toBeNull();
    expect(buildCalibrationReactions(profiles, { a: { decision: 'reject', reason: ' ' } }, () => 'x')).toBeNull();
    expect(buildCalibrationReactions([...profiles, profiles[0]], { a: { decision: 'pick', reason: 'ok' } }, () => 'x')).toBeNull();
    expect(buildCalibrationReactions(profiles, { a: { decision: 'pick', reason: 'yes' }, b: { decision: 'reject', reason: '' } }, () => 'x')).toBeNull();
  });
});
