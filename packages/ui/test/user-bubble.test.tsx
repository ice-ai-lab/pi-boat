// @vitest-environment jsdom

import type { Turn } from '@ice-ai/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UserBubble } from '../src/chat/assistant-turn';
import { I18nProvider } from '../src/i18n/i18n-provider';

function buildTurn(images?: string[]): Turn {
  return {
    id: 'entry-1',
    user: { text: 'hello', at: Date.parse('2026-01-01T00:00:00.000Z'), images },
    trail: [],
    final: null,
    usage: null,
    model: null,
    status: 'done',
    errorMessage: null,
  };
}

function render(turn: Turn, onEdit?: () => Promise<boolean>): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <UserBubble turn={turn} onEdit={onEdit} />
    </I18nProvider>,
  );
}

describe('UserBubble hover actions', () => {
  it('renders copy; edit is opt-in through the host session hook', () => {
    const html = render(buildTurn());
    expect(html).toContain('aria-label="Copy message"');
    expect(html).not.toContain('aria-label="Edit from here"');
  });

  it('shows edit only for text-only messages', () => {
    const editable = render(buildTurn(), async () => true);
    expect(editable).toContain('aria-label="Edit from here"');
    expect(editable).toContain('branches within this session');

    const withImage = render(buildTurn(['data:image/png;base64,']), async () => true);
    expect(withImage).not.toContain('aria-label="Edit from here"');
  });
});
