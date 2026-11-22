import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomWorkspace, type RoomTransport } from './RoomWorkspace';

describe('RoomWorkspace', () => {
  const transport: RoomTransport = { start: vi.fn(), append: vi.fn(), finish: vi.fn() };
  it('explains the simulation and disables starting without a chosen goal', () => {
    const html = renderToStaticMarkup(<RoomWorkspace goals={[{ id: 'g', statement: 'Find suppliers' }]} transport={transport} />);
    expect(html).toContain('Speak or enter pitch sentences');
    expect(html).toContain('Feedback comes from a simulated panel.');
    expect(html).toMatch(/<button type="button" disabled="">Start new run/);
    expect(transport.start).not.toHaveBeenCalled();
  });
  it('shows goal errors and empty state', () => {
    expect(renderToStaticMarkup(<RoomWorkspace goals={[]} transport={transport} />)).toContain('Create a goal');
    expect(renderToStaticMarkup(<RoomWorkspace goals={[]} goalsError="Load failed" transport={transport} />)).toContain('role="alert"');
  });
});
