import { describe, expect, it } from 'vitest';
import { buildQuestionKindRequest, readJevAnswers } from './questionKind.ts';

const choice = (value: string, confidence: number) => ({ type: 'choice', choice: value, probabilities: {}, confidence });

function answers(overrides: Record<string, unknown> = {}) {
  return {
    model: 'jev-1.13.0',
    answers: {
      relation: choice('cousins', 0.97),
      side: choice('maternal', 0.9),
      gender: choice('any', 0.8),
      subject: choice('speaker', 1),
      wants_count: { type: 'noul', noul: 0.98 },
      ...overrides,
    },
  };
}

describe('buildQuestionKindRequest', () => {
  it('asks the five questions over the message alone, on the pinned model', () => {
    const body = buildQuestionKindRequest('who are my khalos');
    expect(body.model).toBe('jev-1.13.0');
    expect(body.state).toEqual({ message: 'who are my khalos' });
    expect(Object.keys(body.questions)).toEqual(['relation', 'side', 'gender', 'subject', 'wants_count']);
    expect(Object.keys(body.questions.side.criteria)).toEqual(['maternal', 'paternal', 'both', 'family_name']);
  });
});

describe('readJevAnswers', () => {
  it('reads each answer with its confidence', () => {
    expect(readJevAnswers(answers())).toEqual({
      relation: { value: 'cousins', confidence: 0.97 },
      side: { value: 'maternal', confidence: 0.9 },
      gender: { value: 'any', confidence: 0.8 },
      subject: { value: 'speaker', confidence: 1 },
      wantsCount: { value: true, confidence: 0.96 },
    });
  });

  it('gives a Noul its distance from 0.5 as its confidence: 0.5 is 0, 0 and 1 are 1', () => {
    const count = (noul: number) => readJevAnswers(answers({ wants_count: { type: 'noul', noul } }))?.wantsCount;
    expect(count(0.5)).toEqual({ value: true, confidence: 0 });
    expect(count(0.3)).toEqual({ value: false, confidence: 0.4 });
    expect(count(0)).toEqual({ value: false, confidence: 1 });
    expect(count(1)).toEqual({ value: true, confidence: 1 });
  });

  it.each([
    ['no answers', { model: 'jev-1.13.0' }],
    ['a missing answer', answers({ subject: undefined })],
    ['an option the function did not ask for', answers({ relation: choice('pets', 0.9) })],
    ['a confidence out of range', answers({ side: choice('both', 1.2) })],
    ['a Noul out of range', answers({ wants_count: { type: 'noul', noul: -0.1 } })],
    ['nothing', null],
  ])('gives null for %s', (_why, body) => {
    expect(readJevAnswers(body)).toBeNull();
  });
});
