// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ToolCallResult } from '../../../../src/components/run/ToolCallResult';

afterEach(() => cleanup());

describe('ToolCallResult', () => {
  it('unwraps a JSON query envelope to the bare query string', () => {
    render(<ToolCallResult query={'{"query":"remote work decline"}'} />);
    expect(screen.getByText('remote work decline')).toBeTruthy();
  });

  it('shows a non-JSON query verbatim', () => {
    render(<ToolCallResult query="plain text query" />);
    expect(screen.getByText('plain text query')).toBeTruthy();
  });

  it('renders bold, shortened links, and numbered list items from markdown-ish result text', () => {
    const result =
      'Intro paragraph. 1. **First point**: see [example.com](https://example.com/path). 2. **Second point**: done.';
    render(<ToolCallResult result={result} />);
    // bold
    expect(screen.getByText('First point')).toBeTruthy();
    // link: short label, real href, opens safely in a new tab
    const link = screen.getByRole('link', { name: 'example.com' });
    expect(link.getAttribute('href')).toBe('https://example.com/path');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    // numbered markers promoted to list rows
    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('2.')).toBeTruthy();
  });
});
