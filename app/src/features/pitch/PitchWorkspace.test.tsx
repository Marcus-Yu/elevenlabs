import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PitchWorkspace } from './PitchWorkspace';

describe('PitchWorkspace', () => {
  it('shows simulation disclosure and disables scoring before a goal is selected', () => {
    const score = vi.fn();
    const html = renderToStaticMarkup(<PitchWorkspace goals={[{ id: 'g', statement: 'Find suppliers' }]} score={score} />);
    expect(html).toContain('Results are simulations');
    expect(html).toContain('Find suppliers');
    expect(html).toMatch(/<button type="submit" disabled=""/);
    expect(html).toContain('Compare revision on same panel');
    expect(score).not.toHaveBeenCalled();
  });
  it('explains an empty or failed goal list without allowing a run', () => {
    const score = vi.fn();
    expect(renderToStaticMarkup(<PitchWorkspace goals={[]} score={score} />)).toContain('Create a goal');
    const failure = renderToStaticMarkup(<PitchWorkspace goals={[]} goalsError="Could not load goals" score={score} />);
    expect(failure).toContain('role="alert"');
    expect(failure).toContain('Could not load goals');
    expect(score).not.toHaveBeenCalled();
  });
});
