import { describe, expect, it } from 'vitest';
import { applyMove } from '../moves';
import { GameState } from '../types';
import { act, at, covers, dests, make, movesAt, play, shields, wait } from './upgradeHelpers';

const B = (rows: Record<number, string>) =>
  Array.from({ length: 8 }, (_, y) => rows[y] ?? (y === 0 ? '.......k' : y === 7 ? 'K.......' : '........'));
const T = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');
const alive = (s: GameState, type: string) => s.pieces.some((p) => p.type === type && p.side === 'enemy');
const withShield = (s: GameState, x: number, y: number): GameState => ({
  ...s,
  pieces: s.pieces.map((p) => (p.pos.x === x && p.pos.y === y ? { ...p, shields: [{ strength: 1, expires: null }] } : p)),
});

describe('Offense upgrades', () => {
  // Rook at (3,6) attacks a 2 HP Guardian at (3,4).
  const hit = (ups: string[], extra: Record<number, string> = {}) =>
    play(make(B({ 4: '...g....', 6: '...R....', ...extra }), { '3,6': ups }), 3, 6, 3, 4);

  it('one-hit bonuses: Heavy Strike, Ambush, Opening Assault each kill a 2 HP piece', () => {
    covers('heavy_strike', 'ambush', 'opening_assault');
    expect(alive(hit([]), 'guardian')).toBe(true);
    expect(alive(hit(['heavy_strike']), 'guardian')).toBe(false);
    expect(alive(hit(['ambush']), 'guardian')).toBe(false);
    expect(alive(hit(['opening_assault']), 'guardian')).toBe(false);
  });

  it('Backstab adds damage from behind the target', () => {
    covers('backstab');
    const s = play(make(B({ 2: '...R....', 4: '...g....' }), { '3,2': ['backstab'] }), 3, 2, 3, 4);
    expect(alive(s, 'guardian')).toBe(false);
  });

  it('Marked Prey marks the most valuable enemy at the start of battle', () => {
    covers('marked_prey');
    const s = make(B({ 3: '.p......', 4: '...g....', 6: '...R....' }), { '3,6': ['marked_prey'] });
    expect(at(s, 3, 4)?.statuses.some((st) => st.kind === 'prey')).toBe(true);
    expect(alive(play(s, 3, 6, 3, 4), 'guardian')).toBe(false);
  });

  it('Revenge Strike punishes the last piece that hurt you', () => {
    covers('revenge_strike');
    const s0 = make(B({ 4: '...g....', 6: '...R....' }), { '3,6': ['revenge_strike'] });
    const g = at(s0, 3, 4)!;
    const s = { ...s0, pieces: s0.pieces.map((p) => (p.type === 'rook' ? { ...p, lastAttackerId: g.id } : p)) };
    expect(alive(play(s, 3, 6, 3, 4), 'guardian')).toBe(false);
  });

  it('Finishing Blow and Double Impact finish a wounded target', () => {
    covers('finishing_blow', 'double_impact');
    expect(alive(hit(['finishing_blow']), 'guardian')).toBe(false);
    expect(alive(hit(['double_impact']), 'guardian')).toBe(false);
  });

  it('Perfect Strike defeats a target outright', () => {
    covers('perfect_strike');
    const s = play(make(B({ 2: '...j....', 6: '...R....' }), { '3,6': ['perfect_strike'] }), 3, 6, 3, 3);
    expect(alive(s, 'juggernaut')).toBe(false);
  });

  it('Siege Damage and Royal Hunter add damage against specific targets', () => {
    covers('siege_damage', 'royal_hunter');
    const s = play(make(B({ 2: '...j....', 6: '...R....' }), { '3,6': ['siege_damage'] }), 3, 6, 3, 3);
    expect(s.pieces.find((p) => p.type === 'juggernaut')?.hp).toBe(1);
    const q = withShield(make(B({ 4: '...q....', 6: '...R....' }), { '3,6': ['royal_hunter'] }), 3, 4);
    expect(alive(play(q, 3, 6, 3, 4), 'queen')).toBe(false);
  });

  it('Executioner and Precision get through a shielded 1 HP piece', () => {
    covers('executioner', 'precision');
    const base = (ups: string[]) => withShield(make(B({ 4: '...p....', 6: '...R....' }), { '3,6': ups }), 3, 4);
    expect(alive(play(base([]), 3, 6, 3, 4), 'pawn')).toBe(true);
    expect(alive(play(base(['executioner']), 3, 6, 3, 4), 'pawn')).toBe(false);
    expect(alive(play(base(['precision']), 3, 6, 3, 4), 'pawn')).toBe(false);
  });

  it('Kingbreaker gets through a shielded King', () => {
    covers('kingbreaker');
    const s = withShield(make(B({ 4: '...k....', 6: '...R....', 0: '........' }), { '3,6': ['kingbreaker'] }), 3, 4);
    expect(alive(play(s, 3, 6, 3, 4), 'king')).toBe(false);
  });

  it('Piercing Capture, cleaves and Overkill hit nearby enemies', () => {
    covers('piercing_capture', 'diagonal_cleave', 'orthogonal_cleave', 'overkill');
    // Bystanders are 2 HP Siege Engines (a Guardian would intercept the attack instead).
    const pierce = play(make(B({ 3: '...s....', 4: '...p....', 6: '...R....' }), { '3,6': ['piercing_capture'] }), 3, 6, 3, 4);
    expect(alive(pierce, 'pawn')).toBe(false);
    expect(at(pierce, 3, 3)?.hp).toBe(1);
    const diag = play(make(B({ 3: '..s.....', 4: '...p....', 6: '...R....' }), { '3,6': ['diagonal_cleave'] }), 3, 6, 3, 4);
    expect(at(diag, 2, 3)?.hp).toBe(1);
    const orth = play(make(B({ 4: '...ps...', 6: '...R....' }), { '3,6': ['orthogonal_cleave'] }), 3, 6, 3, 4);
    expect(at(orth, 4, 4)?.hp).toBe(1);
    const plain = play(make(B({ 4: '...ps...', 6: '...R....' }), { '3,6': ['heavy_strike'] }), 3, 6, 3, 4);
    expect(at(plain, 4, 4)?.hp).toBe(2);
    const over = play(make(B({ 4: '...ps...', 6: '...R....' }), { '3,6': ['heavy_strike', 'overkill'] }), 3, 6, 3, 4);
    expect(at(over, 4, 4)?.hp).toBe(1);
  });

  it('Chain Capture allows a second capture in the same turn', () => {
    covers('chain_capture');
    let s = make(B({ 4: '...p.p..', 6: '...R....' }), { '3,6': ['chain_capture'] });
    s = play(s, 3, 6, 3, 4);
    expect(s.turn).toBe('player');
    s = play(s, 3, 4, 5, 4);
    expect(s.turn).toBe('enemy');
    expect(alive(s, 'pawn')).toBe(false);
  });

  it('Shockwave pushes enemies next to the captured square', () => {
    covers('shockwave');
    const s = play(make(B({ 4: '...ps...', 6: '...R....' }), { '3,6': ['shockwave'] }), 3, 6, 3, 4);
    expect(at(s, 5, 4)?.type).toBe('siege');
  });
});

describe('Defense upgrades', () => {
  // Player Rook at (3,6) attacks an enemy Guardian at (3,4) carrying the upgrade.
  const defend = (ups: string[], extra: Record<number, string> = {}, attackerUps: string[] = []) =>
    play(make(B({ 4: '...g....', 6: '...R....', ...extra }), { '3,4': ups, '3,6': attackerUps }), 3, 6, 3, 4);
  const g = (s: GameState) => s.pieces.find((p) => p.type === 'guardian');

  it('Reinforced Body raises max HP; Thick Armor starts with a shield', () => {
    covers('reinforced_body', 'thick_armor');
    const s = make(B({ 4: '...R....' }), { '3,4': ['reinforced_body', 'thick_armor'] });
    expect(at(s, 3, 4)?.maxHp).toBe(2);
    expect(shields(at(s, 3, 4))).toBe(1);
  });

  it('Iron Shell and Stone Skin soak damage', () => {
    covers('iron_shell', 'stone_skin');
    expect(g(defend(['iron_shell']))?.hp).toBe(2);
    expect(g(defend(['stone_skin']))?.hp).toBe(2);
  });

  it('Emergency Barrier, Protected Retreat and Second Wind react to surviving a hit', () => {
    covers('emergency_barrier', 'protected_retreat', 'second_wind');
    expect(shields(g(defend(['emergency_barrier'])))).toBe(1);
    expect(shields(g(defend(['protected_retreat'])))).toBe(1);
    expect(g(defend(['second_wind']))?.hp).toBe(2);
  });

  it('Critical Survival keeps a piece at 1 HP once', () => {
    covers('critical_survival');
    const s = play(make(B({ 4: '...p....', 6: '...R....' }), { '3,4': ['critical_survival'] }), 3, 6, 3, 4);
    expect(alive(s, 'pawn')).toBe(true);
  });

  it('Reflective Armor strikes back at an adjacent attacker', () => {
    covers('reflective_armor');
    const s = play(make(B({ 4: '...g....', 5: '...R....' }), { '3,4': ['reflective_armor'] }), 3, 5, 3, 4);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
  });

  it('Sacrificial Guard takes a fatal hit for an adjacent ally', () => {
    covers('sacrificial_guard');
    const s = play(make(B({ 4: '...pr...', 6: '...R....' }), { '4,4': ['sacrificial_guard'] }), 3, 6, 3, 4);
    expect(alive(s, 'pawn')).toBe(true);
    expect(s.pieces.some((p) => p.type === 'rook' && p.side === 'enemy')).toBe(false);
  });

  it('Royal Protection takes a hit meant for the King', () => {
    covers('royal_protection');
    const s = play(make(B({ 0: '........', 4: '...kg...', 6: '...R....' }), { '4,4': ['royal_protection'] }), 3, 6, 3, 4);
    expect(alive(s, 'king')).toBe(true);
    expect(s.pieces.find((p) => p.type === 'guardian')?.hp).toBe(1);
  });

  it('Brace and Steadfast resist pushes', () => {
    covers('brace', 'steadfast');
    expect(g(defend(['brace'], {}, ['heavy_impact']))?.pos).toEqual({ x: 3, y: 4 });
    expect(g(defend(['steadfast'], {}, ['heavy_impact']))?.pos).toEqual({ x: 3, y: 4 });
    expect(g(defend([], {}, ['heavy_impact']))?.pos).toEqual({ x: 3, y: 3 });
  });

  it('Guardian Aura shields adjacent allies at the start of battle', () => {
    covers('guardian_aura');
    const s = make(B({ 4: '...RB...' }), { '3,4': ['guardian_aura'] });
    expect(shields(at(s, 4, 4))).toBe(1);
  });

  it('Lasting Guard and Fortress Stance', () => {
    covers('lasting_guard', 'fortress_stance');
    let s = make(B({ 4: '...R....' }), { '3,4': ['fortress_stance', 'lasting_guard'] });
    s = wait(s);
    expect(shields(at(s, 3, 4))).toBe(1);
    expect(at(s, 3, 4)?.shields[0].expires).toBeNull();
  });

  it('Shield Transfer passes a shield to an ally', () => {
    covers('shield_transfer');
    const s = act(make(B({ 4: '...RB...' }), { '3,4': ['thick_armor', 'shield_transfer'] }), 3, 4, 'shield_transfer', 4, 4);
    expect(shields(at(s, 4, 4))).toBe(1);
    expect(shields(at(s, 3, 4))).toBe(0);
  });

  it('Defiant Armor gains a shield when an adjacent ally falls', () => {
    covers('defiant_armor');
    const s = play(make(B({ 4: '...pr...', 6: '...R....' }), { '4,4': ['defiant_armor'] }), 3, 6, 3, 4);
    expect(shields(s.pieces.find((p) => p.type === 'rook' && p.side === 'enemy'))).toBe(1);
  });

  it('Impenetrable makes a piece immune until its next turn', () => {
    covers('impenetrable');
    const s = act(make(B({ 4: '...R....' }), { '3,4': ['impenetrable'] }), 3, 4, 'impenetrable');
    expect(at(s, 3, 4)?.statuses.some((st) => st.kind === 'immune')).toBe(true);
  });
});

describe('Bounceback & knockback upgrades', () => {
  // Rook travels 4 from (3,6) to a 2 HP Guardian at (3,2); normal bounce lands on (3,4).
  const bounce = (ups: string[], extra: Record<number, string> = {}, pick = (_m: unknown) => true, gUps: string[] = [], terrain?: string[]) =>
    play(make(B({ 2: '...g....', 6: '...R....', ...extra }), { '3,6': ups, '3,2': gUps }, { terrain }), 3, 6, 3, 2, pick);
  const rook = (s: GameState) => s.pieces.find((p) => p.type === 'rook' && p.side === 'player')!;
  const guardian = (s: GameState) => s.pieces.find((p) => p.type === 'guardian');

  it('changes where the attacker lands', () => {
    covers('reduced_recoil', 'full_retreat', 'counterweight', 'unyielding_assault');
    expect(rook(bounce([])).pos).toEqual({ x: 3, y: 4 });
    expect(rook(bounce(['reduced_recoil'])).pos).toEqual({ x: 3, y: 3 });
    expect(rook(bounce(['full_retreat'])).pos).toEqual({ x: 3, y: 6 });
    expect(rook(bounce(['counterweight'])).pos).toEqual({ x: 3, y: 3 });
    expect(rook(bounce(['unyielding_assault'])).pos).toEqual({ x: 3, y: 3 });
  });

  it('Controlled Bounce and Ricochet offer other landing squares', () => {
    covers('controlled_bounce', 'ricochet');
    const c = make(B({ 2: '...g....', 6: '...R....' }), { '3,6': ['controlled_bounce'] });
    expect(movesAt(c, 3, 6).filter((m) => m.to.x === 3 && m.to.y === 2).map((m) => `${m.bounceTo!.x},${m.bounceTo!.y}`).sort()).toEqual(['3,4', '3,6']);
    const r = make(B({ 2: '...g....', 6: '...R....' }), { '3,6': ['ricochet'] });
    expect(movesAt(r, 3, 6).some((m) => m.uses?.includes('ricochet'))).toBe(true);
  });

  it('Rebound Shield, Rebound Strike and Rebound Capture trigger after bouncing', () => {
    covers('rebound_shield', 'rebound_strike', 'rebound_capture');
    expect(shields(rook(bounce(['rebound_shield'])))).toBe(1);
    expect(alive(bounce(['rebound_strike'], { 4: '..p.....' }), 'pawn')).toBe(false);
    expect(alive(bounce(['rebound_capture'], { 4: '..p.....' }), 'pawn')).toBe(false);
  });

  it('Heavy Impact, Forceful Charge, Knockback and Long Knockback push the defender', () => {
    covers('heavy_impact', 'forceful_charge', 'knockback', 'long_knockback');
    expect(guardian(bounce(['heavy_impact']))?.pos).toEqual({ x: 3, y: 1 });
    expect(guardian(bounce(['forceful_charge']))?.pos).toEqual({ x: 3, y: 1 });
    expect(guardian(bounce(['knockback']))?.pos).toEqual({ x: 3, y: 1 });
    expect(guardian(bounce(['heavy_impact', 'long_knockback']))?.pos).toEqual({ x: 3, y: 0 });
  });

  it('Collision Damage, Wall Slam and Shock Absorber', () => {
    covers('collision_damage', 'wall_slam', 'shock_absorber');
    const col = bounce(['heavy_impact', 'collision_damage'], { 1: '...p....' });
    expect(alive(col, 'guardian')).toBe(false);
    expect(alive(col, 'pawn')).toBe(false);
    const slam = bounce(['heavy_impact', 'wall_slam'], {}, undefined, [], T({ 1: '...#....' }));
    expect(alive(slam, 'guardian')).toBe(false);
    const absorbed = bounce(['heavy_impact', 'wall_slam'], {}, undefined, ['shock_absorber'], T({ 1: '...#....' }));
    expect(alive(absorbed, 'guardian')).toBe(true);
  });

  it('Counterpush shoves the attacker back', () => {
    covers('counterpush');
    const s = play(make(B({ 4: '...g....', 5: '...R....' }), { '3,5': ['heavy_impact'], '3,4': ['counterpush'] }), 3, 5, 3, 4);
    // Rook bounced to (3,5) and was pushed one further back.
    expect(rook(s).pos).toEqual({ x: 3, y: 6 });
  });

  it('Spring Loaded and Recoil Conversion pay off next turn', () => {
    covers('spring_loaded', 'recoil_conversion');
    let s = wait(bounce(['spring_loaded']));
    expect(s.bonus.some((b) => b.source === 'spring_loaded')).toBe(true);
    const r = bounce(['recoil_conversion']);
    expect(rook(r).statuses.find((st) => st.kind === 'rangeBuff')?.amount).toBe(2);
    s = wait(s);
    expect(s).toBeDefined();
  });
});

describe('Heavy unit upgrades', () => {
  // Juggernaut at (3,5)-(4,6) steps up into an enemy Guardian at (3,4).
  const crush = (ups: string[], extra: Record<number, string> = {}) =>
    play(make(B({ 4: '...g....', 5: '...J....', ...extra }), { '3,5': ups }), 3, 5, 3, 4);
  const jug = (s: GameState) => s.pieces.find((p) => p.type === 'juggernaut' && p.side === 'player')!;

  it('HP and shield upgrades', () => {
    covers('reinforced_frame', 'heavy_armor', 'wide_shield', 'colossal_endurance');
    const s = make(B({ 5: '...J....' }), { '3,5': ['reinforced_frame', 'heavy_armor', 'wide_shield'] });
    expect(jug(s).maxHp).toBe(4);
    expect(shields(jug(s))).toBe(4);
    expect(jug(make(B({ 5: '...J....' }), { '3,5': ['colossal_endurance'] })).maxHp).toBe(5);
  });

  it('Crushing Weight and Wide Sweep add footprint damage', () => {
    covers('crushing_weight', 'wide_sweep');
    expect(alive(crush([]), 'guardian')).toBe(true);
    expect(alive(crush(['crushing_weight']), 'guardian')).toBe(false);
    const two = crush(['wide_sweep'], { 4: '...gg...' });
    expect(alive(two, 'guardian')).toBe(false);
  });

  it('Multi-Target Precision focuses extra damage on one target', () => {
    covers('multi_target_precision');
    const s = make(B({ 4: '...gg...', 5: '...J....' }), { '3,5': ['multi_target_precision'] });
    const focus = movesAt(s, 3, 5).find((m) => m.focusId)!;
    const after = applyMove(s, focus);
    expect(after.pieces.filter((p) => p.type === 'guardian')).toHaveLength(1);
  });

  it('Siege Momentum adds damage after two moves the same way', () => {
    covers('siege_momentum');
    let s = make(B({ 2: '...g....', 5: '...J....' }), { '3,5': ['siege_momentum'] });
    s = wait(play(s, 3, 5, 3, 4));
    s = wait(play(s, 3, 4, 3, 3));
    s = play(s, 3, 3, 3, 2);
    expect(alive(s, 'guardian')).toBe(false);
  });

  it('Massive Push and Iron Advance shove pieces out of the way', () => {
    covers('massive_push', 'iron_advance');
    const push = play(make(B({ 3: '...p....', 5: '...J....' }), { '3,5': ['massive_push'] }), 3, 5, 3, 4);
    expect(at(push, 3, 2)?.type).toBe('pawn');
    const iron = play(make(B({ 4: '...P....', 5: '...J....' }), { '3,5': ['iron_advance'] }), 3, 5, 3, 4);
    expect(jug(iron).pos).toEqual({ x: 3, y: 4 });
    expect(at(iron, 3, 3)?.type).toBe('pawn');
  });

  it('Footprint Guard and Anchor Formation protect neighbours', () => {
    covers('footprint_guard', 'anchor_formation');
    const s = make(B({ 5: '..BJ....' }), { '3,5': ['footprint_guard'] });
    expect(shields(at(s, 2, 5))).toBe(1);
    const anchored = play(
      make(B({ 1: '...j....', 3: '..g.....', 6: '..R.....' }), { '3,1': ['anchor_formation'], '2,6': ['heavy_impact'] }),
      2,
      6,
      2,
      3,
    );
    expect(at(anchored, 2, 3)?.type).toBe('guardian');
  });

  it('Heavy Stabilizer resists pushes from smaller pieces', () => {
    covers('heavy_stabilizer');
    const s = play(make(B({ 1: '...j....', 6: '...R....' }), { '3,1': ['heavy_stabilizer'], '3,6': ['heavy_impact'] }), 3, 6, 3, 2);
    expect(s.pieces.find((p) => p.type === 'juggernaut')?.pos).toEqual({ x: 3, y: 1 });
  });

  it('Crushing Entry flattens cracked walls in its path', () => {
    covers('crushing_entry');
    const s = play(make(B({ 5: '...J....' }), { '3,5': ['crushing_entry'] }, { terrain: T({ 4: '...+....' }) }), 3, 5, 3, 4);
    expect(s.board.terrain[4][3]).toBe('normal');
    expect(jug(s).pos).toEqual({ x: 3, y: 4 });
  });

  it('Wide Healing heals every ally around the footprint', () => {
    covers('wide_healing');
    let s = make(B({ 5: '..GJ....' }), { '3,5': ['wide_healing'] });
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'guardian' ? { ...p, hp: 1 } : p)) };
    s = act(s, 3, 5, 'wide_healing');
    expect(at(s, 2, 5)?.hp).toBe(2);
  });

  it('Massive Retaliation hits back after surviving', () => {
    covers('massive_retaliation');
    const s = play(make(B({ 1: '...j....', 3: '...R....' }), { '3,1': ['massive_retaliation'] }), 3, 3, 3, 2);
    expect(s.pieces.some((p) => p.type === 'rook')).toBe(false);
  });

  it('Siege Presence slows adjacent enemies', () => {
    covers('siege_presence');
    const s = make(B({ 1: '...j....', 3: '.....M..' }), { '3,1': ['siege_presence'] });
    expect(dests(movesAt(s, 5, 3).filter((m) => !m.action))).not.toContain('7,1');
    const free = make(B({ 1: '...j....', 3: '.....M..' }));
    expect(dests(movesAt(free, 5, 3).filter((m) => !m.action))).toContain('7,1');
  });

  it('Heavy Recovery heals after standing still', () => {
    covers('heavy_recovery');
    let s = make(B({ 5: '...J....' }), { '3,5': ['heavy_recovery'] });
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'juggernaut' ? { ...p, hp: 1 } : p)) };
    for (let i = 0; i < 4; i++) s = wait(s);
    expect(jug(s).hp).toBe(2);
  });

  it('Unbroken Advance moves again after a blocked hit; Living Avalanche rolls two squares', () => {
    covers('unbroken_advance', 'living_avalanche');
    const s = play(make(B({ 3: '...j....', 5: '...J....' }), { '3,5': ['unbroken_advance'] }), 3, 5, 3, 4);
    expect(s.turn).toBe('player');
    const av = make(B({ 5: '...J....' }), { '3,5': ['living_avalanche'] });
    expect(movesAt(av, 3, 5).find((m) => m.to.y === 3)?.uses).toContain('living_avalanche');
  });
});
