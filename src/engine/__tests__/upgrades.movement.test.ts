import { describe, expect, it } from 'vitest';
import { applyMove } from '../moves';
import { act, at, covers, dests, hasAction, make, movesAt, play, shields, wait } from './upgradeHelpers';

// Board legend: player King bottom-left (0,7), enemy King top-right (7,0).
const B = (rows: Record<number, string>) =>
  Array.from({ length: 8 }, (_, y) => rows[y] ?? (y === 0 ? '.......k' : y === 7 ? 'K.......' : '........'));
const T = (rows: Record<number, string>) => Array.from({ length: 8 }, (_, y) => rows[y] ?? '........');

describe('Movement upgrades', () => {
  it('Extended Stride adds one square to limited ranges', () => {
    covers('extended_stride');
    const s = make(B({ 4: '...M....' }), { '3,4': ['extended_stride'] });
    expect(dests(movesAt(s, 3, 4))).toContain('0,1');
  });

  it('Diagonal Step and Orthogonal Step add one-square moves', () => {
    covers('diagonal_step', 'orthogonal_step');
    const r = make(B({ 4: '...R....' }), { '3,4': ['diagonal_step'] });
    expect(dests(movesAt(r, 3, 4))).toContain('2,3');
    const b = make(B({ 4: '...B....' }), { '3,4': ['orthogonal_step'] });
    expect(dests(movesAt(b, 3, 4))).toContain('3,3');
  });

  it('Long Leap extends a Knight jump', () => {
    covers('long_leap');
    const s = make(B({ 4: '...N....' }), { '3,4': ['long_leap'] });
    expect(dests(movesAt(s, 3, 4))).toEqual(expect.arrayContaining(['4,1', '6,3']));
  });

  it('Side Step shifts sideways after a quiet move, once per battle', () => {
    covers('side_step');
    let s = make(B({ 4: '...R....' }), { '3,4': ['side_step'] });
    s = play(s, 3, 4, 2, 3, (m) => !!m.uses?.includes('side_step'));
    expect(at(s, 2, 3)?.used).toContain('side_step');
    s = wait(s);
    expect(movesAt(s, 2, 3).some((m) => m.uses?.includes('side_step'))).toBe(false);
  });

  it('Retreat returns to the square held at the start of the previous turn', () => {
    covers('retreat');
    // A Pawn can't step back on its own, so the only way back is Retreat.
    let s = make(B({ 4: '...P....' }), { '3,4': ['retreat'] });
    s = play(s, 3, 4, 3, 3);
    s = wait(s);
    expect(movesAt(s, 3, 3).some((m) => m.to.x === 3 && m.to.y === 4 && m.uses?.includes('retreat'))).toBe(true);
  });

  it('Quick March lets the first quiet move go one square further', () => {
    covers('quick_march');
    let s = make(B({ 4: '...M....' }), { '3,4': ['quick_march'] });
    const m = movesAt(s, 3, 4).find((m) => m.to.x === 0 && m.to.y === 1)!;
    expect(m.uses).toContain('quick_march');
    s = play(s, 3, 4, 0, 1);
    expect(at(s, 0, 1)?.used).toContain('quick_march');
  });

  it('Corner Turn and Diagonal Pivot bend a slide once', () => {
    covers('corner_turn', 'diagonal_pivot');
    const r = make(B({ 4: '...R....' }), { '3,4': ['corner_turn'] });
    expect(movesAt(r, 3, 4).find((m) => m.to.x === 5 && m.to.y === 2)?.uses).toContain('corner_turn');
    const b = make(B({ 4: '...B....' }), { '3,4': ['diagonal_pivot'] });
    expect(movesAt(b, 3, 4).find((m) => m.to.x === 4 && m.to.y === 2)?.uses).toContain('diagonal_pivot');
  });

  it('Backward Advance lets a Pawn step back', () => {
    covers('backward_advance');
    const s = make(B({ 4: '...P....' }), { '3,4': ['backward_advance'] });
    expect(dests(movesAt(s, 3, 4))).toContain('3,5');
  });

  it("Knight's Training and Royal Pace give one-off moves", () => {
    covers('knights_training', 'royal_pace');
    const r = make(B({ 4: '...R....' }), { '3,4': ['knights_training'] });
    expect(movesAt(r, 3, 4).find((m) => m.to.x === 4 && m.to.y === 2)?.uses).toContain('knights_training');
    const b = make(B({ 4: '...B....' }), { '3,4': ['royal_pace'] });
    expect(movesAt(b, 3, 4).find((m) => m.to.x === 3 && m.to.y === 3)?.uses).toContain('royal_pace');
  });

  it('Short Hop jumps two squares over a gap', () => {
    covers('short_hop');
    const s = make(B({ 4: '...R....' }), { '3,4': ['short_hop'] }, { terrain: T({ 3: '..._....' }) });
    expect(dests(movesAt(s, 3, 4))).toContain('3,2');
  });

  it('Momentum adds range after two moves in the same direction', () => {
    covers('momentum');
    let s = make(B({ 6: '...G....' }), { '3,6': ['momentum'] });
    s = wait(play(s, 3, 6, 3, 5));
    s = wait(play(s, 3, 5, 3, 4));
    expect(dests(movesAt(s, 3, 4))).toContain('3,2');
  });

  it('Long Retreat adds two squares when moving back toward your side', () => {
    covers('long_retreat');
    const s = make(B({ 3: '...M....' }), { '3,3': ['long_retreat'] });
    expect(dests(movesAt(s, 3, 3))).toContain('7,7');
  });

  it('Flanking Step adds a diagonal step only next to an enemy', () => {
    covers('flanking_step');
    const near = make(B({ 4: '...Rp...' }), { '3,4': ['flanking_step'] });
    expect(dests(movesAt(near, 3, 4))).toContain('2,3');
    const far = make(B({ 4: '...R....' }), { '3,4': ['flanking_step'] });
    expect(dests(movesAt(far, 3, 4))).not.toContain('2,3');
  });

  it('Zigzag moves two squares around a corner once', () => {
    covers('zigzag');
    const s = make(B({ 4: '...R....' }), { '3,4': ['zigzag'] });
    expect(movesAt(s, 3, 4).find((m) => m.to.x === 4 && m.to.y === 3)?.uses).toContain('zigzag');
  });

  it('Crossing Step moves through a friendly piece', () => {
    covers('crossing_step');
    const s = make(B({ 3: '...P....', 4: '...B....' }), { '3,4': ['crossing_step'] });
    expect(dests(movesAt(s, 3, 4))).toContain('3,2');
  });

  it('Unstoppable March grants a second move after a quiet move', () => {
    covers('unstoppable_march');
    let s = make(B({ 4: '...R....' }), { '3,4': ['unstoppable_march'] });
    s = play(s, 3, 4, 3, 2);
    expect(s.turn).toBe('player');
    s = play(s, 3, 2, 5, 2);
    expect(s.turn).toBe('enemy');
    expect(at(s, 5, 2)?.used).toContain('unstoppable_march');
  });
});

describe('Terrain & gap upgrades', () => {
  it('Gap Jumper crosses one gap; Long Gap Jump two; Master of the Void any number once', () => {
    covers('gap_jumper', 'long_gap_jump', 'master_of_the_void');
    const one = make(B({ 4: 'R.......' }), { '0,4': ['gap_jumper'] }, { terrain: T({ 4: '.._.....' }) });
    expect(dests(movesAt(one, 0, 4))).toContain('5,4');
    const none = make(B({ 4: 'R.......' }), {}, { terrain: T({ 4: '.._.....' }) });
    expect(dests(movesAt(none, 0, 4))).not.toContain('5,4');
    const two = make(B({ 4: 'R.......' }), { '0,4': ['long_gap_jump'] }, { terrain: T({ 4: '.__.....' }) });
    expect(dests(movesAt(two, 0, 4))).toContain('4,4');
    const many = make(B({ 4: 'R.......' }), { '0,4': ['master_of_the_void'] }, { terrain: T({ 4: '.____...' }) });
    expect(movesAt(many, 0, 4).find((m) => m.to.x === 6 && m.to.y === 4)?.uses).toContain('master_of_the_void');
  });

  it('Bridge Builder, Temporary Platform and Platform Extension make timed bridges', () => {
    covers('bridge_builder', 'temporary_platform', 'platform_extension');
    const terrain = T({ 4: '.._.....' });
    const a = act(make(B({ 4: '.R......' }), { '1,4': ['bridge_builder'] }, { terrain }), 1, 4, 'bridge_builder', 2, 4);
    expect(a.board.terrain[4][2]).toBe('normal');
    const b = act(make(B({ 4: '.R......' }), { '1,4': ['temporary_platform'] }, { terrain }), 1, 4, 'temporary_platform', 2, 4);
    const c = act(make(B({ 4: '.R......' }), { '1,4': ['bridge_builder', 'platform_extension'] }, { terrain }), 1, 4, 'bridge_builder', 2, 4);
    expect(c.timed[0].expires - a.timed[0].expires).toBe(4);
    expect(a.timed[0].expires - b.timed[0].expires).toBe(2);
    // The platform collapses after two rounds.
    let s = b;
    for (let i = 0; i < 4; i++) s = wait(s);
    expect(s.board.terrain[4][2]).toBe('gap');
  });

  it('Permanent Bridge and Gap Conversion change terrain for good', () => {
    covers('permanent_bridge', 'gap_conversion');
    const s = act(make(B({ 4: '.R......' }), { '1,4': ['permanent_bridge'] }, { terrain: T({ 4: '.._.....' }) }), 1, 4, 'permanent_bridge', 2, 4);
    expect(s.board.terrain[4][2]).toBe('normal');
    expect(s.timed).toHaveLength(0);
    const g = act(make(B({ 4: '.R......' }), { '1,4': ['gap_conversion'] }), 1, 4, 'gap_conversion', 2, 4);
    expect(g.board.terrain[4][2]).toBe('gap');
  });

  it('Bridge Collapse and Void Rescue', () => {
    covers('bridge_collapse', 'void_rescue');
    let s = make(B({ 4: '.R......', 5: '..G.....' }), { '1,4': ['bridge_builder', 'bridge_collapse', 'void_rescue'] }, { terrain: T({ 4: '.._.....' }) });
    s = wait(act(s, 1, 4, 'bridge_builder', 2, 4));
    s = wait(play(s, 2, 5, 2, 4));
    s = act(s, 1, 4, 'bridge_collapse', 2, 4);
    expect(s.board.terrain[4][2]).toBe('gap');
    expect(s.pieces.some((p) => p.type === 'guardian')).toBe(true);
    expect(at(s, 1, 4)?.used).toContain('void_rescue');
  });

  it('Void Step teleports across a gap', () => {
    covers('void_step');
    const s = act(make(B({ 4: '.R......' }), { '1,4': ['void_step'] }, { terrain: T({ 4: '..__....' }) }), 1, 4, 'void_step', 4, 4);
    expect(at(s, 4, 4)?.type).toBe('rook');
  });

  it('Cliff Runner and Edge Walker add range near gaps', () => {
    covers('cliff_runner', 'edge_walker');
    const c = make(B({ 4: '...G....' }), { '3,4': ['cliff_runner'] }, { terrain: T({ 5: '...._...' }) });
    expect(dests(movesAt(c, 3, 4))).toContain('3,2');
    const e = make(B({ 4: '...G....' }), { '3,4': ['edge_walker'] }, { terrain: T({ 1: '.._.....', 2: '.._.....', 3: '.._.....', 4: '.._.....' }) });
    expect(dests(movesAt(e, 3, 4))).toContain('3,2');
  });

  it('Island Defender gains a shield when surrounded by gaps on two sides', () => {
    covers('island_defender');
    const s = wait(make(B({ 4: 'R.......' }), { '0,4': ['island_defender'] }, { terrain: T({ 4: '._......' }) }));
    // The player waited (King move); the Rook ended the turn with the edge and a gap beside it.
    expect(shields(at(s, 0, 4))).toBe(1);
  });

  it('Void Anchor and Void Immunity stop falls into gaps', () => {
    covers('void_anchor', 'void_immunity');
    const terrain = T({ 3: '..._....' });
    const fall = play(make(B({ 4: '...g....', 6: '...R....' }), { '3,6': ['heavy_impact'] }, { terrain }), 3, 6, 3, 4);
    expect(fall.pieces.some((p) => p.type === 'guardian')).toBe(false);
    const anchored = play(make(B({ 4: '...g....', 6: '...R....' }), { '3,6': ['heavy_impact'], '3,4': ['void_anchor'] }, { terrain }), 3, 6, 3, 4);
    expect(at(anchored, 3, 4)?.type).toBe('guardian');
    const immune = play(make(B({ 4: '...g....', 6: '...R....' }), { '3,6': ['heavy_impact'], '3,4': ['void_immunity'] }, { terrain }), 3, 6, 3, 4);
    expect(at(immune, 3, 4)?.used).toContain('void_immunity');
  });

  it('Gap Assault and Leap Assault add damage across gaps', () => {
    covers('gap_assault', 'leap_assault');
    // A 2 HP Guardian survives one normal hit; the bonus damage finishes it.
    const shoot = (ups: string[]) => {
      const s = make(B({ 4: '...g....', 6: '...A....' }), { '3,6': ups }, { terrain: T({ 5: '..._....' }) });
      return applyMove(s, movesAt(s, 3, 6).find((m) => m.action === 'shoot')!);
    };
    expect(shoot([]).pieces.some((p) => p.type === 'guardian')).toBe(true);
    expect(shoot(['gap_assault']).pieces.some((p) => p.type === 'guardian')).toBe(false);
    const leap = (ups: string[]) => play(make(B({ 4: '...g....', 6: '..N.....' }), { '2,6': ups }, { terrain: T({ 5: '..__....' }) }), 2, 6, 3, 4);
    expect(leap([]).pieces.some((p) => p.type === 'guardian')).toBe(true);
    expect(leap(['leap_assault']).pieces.some((p) => p.type === 'guardian')).toBe(false);
  });
});

describe('Wall & demolition upgrades', () => {
  const W = (row3: string) => T({ 3: row3 });

  it('Demolition, Battering Ram and Wall Swap knock down adjacent cracked walls', () => {
    covers('demolition', 'battering_ram', 'wall_swap');
    const d = act(make(B({ 4: '...R....' }), { '3,4': ['demolition'] }, { terrain: W('...+....') }), 3, 4, 'demolition', 3, 3);
    expect(d.board.terrain[3][3]).toBe('normal');
    const r = act(make(B({ 4: '...R....' }), { '3,4': ['battering_ram'] }, { terrain: W('...+....') }), 3, 4, 'battering_ram', 3, 3);
    expect(at(r, 3, 3)?.type).toBe('rook');
    const w = act(make(B({ 4: '...R....' }), { '3,4': ['wall_swap'] }, { terrain: W('...+....') }), 3, 4, 'wall_swap', 3, 3);
    expect(at(w, 3, 3)?.type).toBe('rook');
  });

  it('Siege Strike hits a cracked wall along the line of attack', () => {
    covers('siege_strike');
    const s = act(make(B({ 6: '...R....' }), { '3,6': ['siege_strike'] }, { terrain: W('...+....') }), 3, 6, 'siege_strike', 3, 3);
    expect(s.board.terrain[3][3]).toBe('normal');
  });

  it('Shatter destroys connected cracked walls within two squares', () => {
    covers('shatter');
    const s = act(make(B({ 4: '...R....' }), { '3,4': ['shatter'] }, { terrain: W('..+++...') }), 3, 4, 'shatter');
    expect(s.board.terrain[3].slice(2, 5)).toEqual(['normal', 'normal', 'normal']);
  });

  it('Phasing, Extended Phasing and Wall Climber move through walls', () => {
    covers('phasing', 'extended_phasing', 'wall_climber');
    const p = make(B({ 6: '...R....' }), { '3,6': ['phasing'] }, { terrain: T({ 4: '...#....' }) });
    expect(dests(movesAt(p, 3, 6))).toContain('3,3');
    const e = make(B({ 6: '...R....' }), { '3,6': ['extended_phasing'] }, { terrain: T({ 3: '...#....', 4: '...#....' }) });
    expect(dests(movesAt(e, 3, 6))).toContain('3,2');
    const c = make(B({ 6: '...R....' }), { '3,6': ['wall_climber'] }, { terrain: T({ 4: '...#....' }) });
    expect(movesAt(c, 3, 6).find((m) => m.to.x === 3 && m.to.y === 3)?.uses).toContain('wall_climber');
  });

  it('Reinforcement, Barricade and Wall Repair shape walls', () => {
    covers('reinforcement', 'barricade', 'wall_repair');
    const r = act(make(B({ 4: '...R....' }), { '3,4': ['reinforcement'] }, { terrain: W('...+....') }), 3, 4, 'reinforcement', 3, 3);
    expect(r.board.terrain[3][3]).toBe('wall');
    const b = act(make(B({ 4: '...R....' }), { '3,4': ['barricade'] }), 3, 4, 'barricade', 3, 3);
    expect(b.board.terrain[3][3]).toBe('wall');
    expect(b.timed[0].kind).toBe('barricade');
    let w = make(B({ 4: '...R....' }), { '3,4': ['demolition', 'wall_repair'] }, { terrain: W('...+....') });
    w = wait(act(w, 3, 4, 'demolition', 3, 3));
    w = act(w, 3, 4, 'wall_repair', 3, 3);
    expect(w.board.terrain[3][3]).toBe('cracked');
  });

  it('Siege Master demolishes without spending the move', () => {
    covers('siege_master');
    let s = make(B({ 4: '...R....' }), { '3,4': ['siege_master'] }, { terrain: W('...+....') });
    s = act(s, 3, 4, 'siege_master', 3, 3);
    expect(s.turn).toBe('player');
    s = play(s, 3, 4, 3, 1);
    expect(s.turn).toBe('enemy');
  });

  it('Explosive Breach damages enemies beside the wall', () => {
    covers('explosive_breach');
    const s = act(make(B({ 3: '....g...', 4: '...R....' }), { '3,4': ['explosive_breach'] }, { terrain: W('...+....') }), 3, 4, 'explosive_breach', 3, 3);
    expect(at(s, 4, 3)?.hp).toBe(1);
  });

  it('Wall Shield and Fortified Position reward hugging walls', () => {
    covers('wall_shield', 'fortified_position');
    const terrain = T({ 3: '..#.#...' });
    let s = make(B({ 3: '...R....' }), { '3,3': ['wall_shield', 'fortified_position'] }, { terrain });
    s = wait(s);
    expect(shields(at(s, 3, 3))).toBe(1);
    expect(at(s, 3, 3)?.maxHp).toBe(2);
  });

  it('Structural Weakness lets allies knock down walls next to the carrier', () => {
    covers('structural_weakness');
    const s = make(B({ 4: '..BR....' }), { '3,4': ['structural_weakness'] }, { terrain: W('...+....') });
    expect(hasAction(s, 2, 4, 'structural_weakness')).toBe(true);
  });

  it('Chain Demolition takes down a second wall; Siege Charge powers the next attack', () => {
    covers('chain_demolition', 'siege_charge');
    let s = make(B({ 2: '...g....', 4: '...R....' }), { '3,4': ['demolition', 'chain_demolition', 'siege_charge'] }, { terrain: W('...++...') });
    s = act(s, 3, 4, 'demolition', 3, 3);
    expect(s.board.terrain[3][4]).toBe('normal');
    s = wait(s);
    s = play(s, 3, 4, 3, 2);
    expect(s.pieces.some((p) => p.type === 'guardian')).toBe(false);
  });

  it('Absolute Demolition removes a solid wall once', () => {
    covers('absolute_demolition');
    const s = act(make(B({ 4: '...R....' }), { '3,4': ['absolute_demolition'] }, { terrain: W('...#....') }), 3, 4, 'absolute_demolition', 3, 3);
    expect(s.board.terrain[3][3]).toBe('normal');
  });
});
