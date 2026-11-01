import { describe, expect, it } from 'vitest';
import { getCard } from '../shared/data';
import { battleFromRows, battleRows, createMatch, stepBattle, tryPlayCard, type BattleState } from '../shared/sim';
import type { TeamId } from '../shared/types';

const DEPLOY: Record<TeamId, { x: number; y: number }> = {
  red: { x: 12.5, y: 19.5 },
  blue: { x: 51.5, y: 19.5 },
};

/** Plays the first card that can be played now. Depends only on the state, so a resumed match replays it identically. */
function scripted(state: BattleState): void {
  if (state.elapsedMs % 2000 !== 0) return;
  for (const team of ['red', 'blue'] as TeamId[]) {
    for (const c of [...state.teams[team].hand.hand]) {
      const category = getCard(c.cardId).category;
      if (category === 'structure') continue;
      const pos = category === 'unit' ? DEPLOY[team] : { x: 32, y: 20 };
      if (tryPlayCard(state, team, { kind: category, instanceId: c.instanceId, pos }).ok) break;
    }
  }
}

function run(state: BattleState, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    scripted(state);
    stepBattle(state);
  }
}

describe('battle rows', () => {
  it('round-trips a live battle through rows without change', () => {
    const state = createMatch(11);
    run(state, 800);
    const rows = battleRows(state);
    expect(rows.entities.length).toBeGreaterThan(2);
    expect(battleRows(battleFromRows(rows))).toEqual(rows);
  });

  it('a battle saved mid-match and restored continues exactly as an uninterrupted one', () => {
    const reference = createMatch(11);
    run(reference, 1500);

    const saved = createMatch(11);
    run(saved, 700);
    const restored = battleFromRows(battleRows(saved));
    for (let i = 700; i < 1500; i++) {
      scripted(restored);
      stepBattle(restored);
    }

    expect(battleRows(restored)).toEqual(battleRows(reference));
  });

  it('keeps hands, stored cards, and pending abilities through a save', () => {
    const state = createMatch(4);
    const stored = state.teams.red.hand.hand[0];
    state.teams.red.hand = { hand: state.teams.red.hand.hand.slice(1), stored };
    run(state, 300);
    const rows = battleRows(state);
    const restored = battleFromRows(rows);
    expect(restored.teams.red.hand.stored).toEqual(state.teams.red.hand.stored);
    expect(restored.teams.red.hand.hand).toEqual(state.teams.red.hand.hand);
    expect(restored.pending).toEqual(state.pending);
  });
});
