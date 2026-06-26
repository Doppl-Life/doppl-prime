// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KnowledgeLegend } from '../../../src/knowledge/KnowledgeLegend';

/**
 * KnowledgeLegend — the fixed key for the knowledge graph. Each entry encodes by glyph + LABEL, never color
 * alone (rule #4 / §12). This pins the tool hues, the in-run "retrieved" (stigmergy read) edge, and the
 * graveyard "culled" entry.
 */

afterEach(() => cleanup());

describe('KnowledgeLegend', () => {
  it('names each research tool, the retrieved (read) edge, and the culled (dead-end) marker by label', () => {
    render(<KnowledgeLegend />);
    expect(screen.getByText('web_search')).toBeTruthy();
    expect(screen.getByText('x_search')).toBeTruthy();
    expect(screen.getByText('youtube_search')).toBeTruthy();
    expect(screen.getByText('fetch_url')).toBeTruthy();
    expect(screen.getByText(/retrieved/i)).toBeTruthy(); // the in-run stigmergy read edge
    expect(screen.getByText(/culled \(dead end\)/i)).toBeTruthy();
  });
});
