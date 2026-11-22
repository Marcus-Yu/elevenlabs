import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('./ThreadApprovalCard', () => ({ ThreadApprovalCard: () => null }));
import { candidateQueryFor } from '../matches/candidates';
import { parseHiringCriteria, roboticsDemoCriteria } from './hiring-criteria';
import { HiringWorkflow, type HiringTransport } from './HiringWorkflow';

describe('hiring workflow', () => {
  it('builds the query used by the recorded robotics shortlist', () => {
    const parsed = parseHiringCriteria(roboticsDemoCriteria, []);
    if (!parsed.success) throw parsed.error;
    expect(candidateQueryFor(parsed.data)).toEqual({
      titles: ['robotics engineer', 'robotics software engineer'],
      skills: ['ROS', 'C++'], minYearsExperience: 2, countryCodes: ['USA'], pageSize: 15,
    });
  });
  it('requires a role before goal creation and never submits a prefilled draft', () => {
    const transport = { create: vi.fn(), shortlist: vi.fn(), reject: vi.fn(), confirm: vi.fn(), runs: vi.fn(), startCalibration: vi.fn(), submitCalibration: vi.fn() } as HiringTransport;
    const html = renderToStaticMarkup(createElement(HiringWorkflow, { transport }));
    expect(html).toContain('Research results carry the sources');
    expect(html).toContain('Show calibration profiles');
    expect(html).toMatch(/disabled="">Create goal/);
    const withDraft = renderToStaticMarkup(createElement(HiringWorkflow, { transport, initialDraft: 'We need a robotics engineer.' }));
    expect(withDraft).toContain('We need a robotics engineer.');
    expect(withDraft).toMatch(/<button type="button">Show calibration profiles/);
    expect(transport.startCalibration).not.toHaveBeenCalled();
    expect(transport.create).not.toHaveBeenCalled();
  });
});
