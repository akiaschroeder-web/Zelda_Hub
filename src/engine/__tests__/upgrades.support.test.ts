import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves } from '../moves';
import { GameState, Piece, StatusKind } from '../types';
import { act, at, covers, dests, hasAction, make, movesAt, play, shields, wait } from './upgradeHelpers';

const B = (rows: Record<number, string>) =>
  Array.from({ length: 8 }, (_, y) => rows[y] ?? (y === 0 ? '.......k' : y === 7 ? 'K.......' : '........'));
const hurt = (s: GameState, x: number, y: number, hp = 1): GameState => ({
  ...s,
  pieces: s.pieces.map((p) => (p.pos.x === x && p.pos.y === y ? { ...p, hp } : p)),
});
const status = (p: Piece | undefined, kind: StatusKind) => !!p?.statuses.some((st) => st.kind === kind);

describe('Support & healing upgrades', () => {
  it('Field Medic and Extended Healing heal allies', () => {
    covers('field_medic', 'extended_healing');
    const s = act(hurt(make(B({ 4: '...BG...' }), { '3,4': ['field_medic'] }), 4, 4), 3, 4, 'field_medic', 4, 4);
    expect(at(s, 4, 4)?.hp).toBe(2);
    const far = hurt(make(B({ 4: '...B.G..' }), { '3,4': ['field_medic', 'extended_healing'] }), 5, 4);
    expect(hasAction(far, 3, 4, 'field_medic')).toBe(true);
  });

  it("Medic's Reward and Royal Physician", () => {
    covers('medics_reward', 'royal_physician');
    const s = act(hurt(make(B({ 4: '...BG...' }), { '3,4': ['field_medic', 'medics_reward'] }), 4, 4), 3, 4, 'field_medic', 4, 4);
    expect(shields(at(s, 3, 4))).toBe(1);
    const king = hurt(make(B({ 7: 'KB......' }), { '0,7': ['reinforced_body'], '1,7': ['field_medic', 'royal_physician'] }), 0, 7);
    expect(hasAction(king, 1, 7, 'field_medic')).toBe(true);
  });

  it('Emergency Treatment heals an ally right after it survives a hit', () => {
    covers('emergency_treatment');
    const s = play(make(B({ 4: '...gb...', 6: '...R....' }), { '4,4': ['emergency_treatment'] }), 3, 6, 3, 4);
    expect(s.pieces.find((p) => p.type === 'guardian')?.hp).toBe(2);
  });

  it('Group Healing, Life Transfer and Miracle Recovery', () => {
    covers('group_healing', 'life_transfer', 'miracle_recovery');
    const g = act(hurt(hurt(make(B({ 4: '..GBG...' }), { '3,4': ['group_healing'] }), 2, 4), 4, 4), 3, 4, 'group_healing');
    expect([at(g, 2, 4)?.hp, at(g, 4, 4)?.hp]).toEqual([2, 2]);
    const l = act(hurt(make(B({ 4: '..GJ....' }), { '2,4': ['life_transfer'] }), 3, 4), 2, 4, 'life_transfer', 3, 4);
    expect(at(l, 2, 4)?.hp).toBe(1);
    expect(at(l, 3, 4)?.hp).toBe(3);
    const m = act(hurt(make(B({ 4: '.B.J....' }), { '1,4': ['miracle_recovery'] }), 3, 4), 1, 4, 'miracle_recovery', 3, 4);
    expect(at(m, 3, 4)?.hp).toBe(3);
  });

  it('Healing Aura and Regeneration heal over time', () => {
    covers('healing_aura', 'regeneration');
    let s = hurt(hurt(make(B({ 4: '...BG...', 5: '.....J..' }), { '3,4': ['healing_aura'], '5,5': ['regeneration'] }), 4, 4), 5, 5);
    for (let i = 0; i < 8; i++) s = wait(s);
    expect(at(s, 4, 4)?.hp).toBe(2);
    expect(at(s, 5, 5)?.hp).toBe(2);
  });

  it('Protective Blessing and Shared Armor', () => {
    covers('protective_blessing', 'shared_armor');
    const b = act(make(B({ 4: '...BR...' }), { '3,4': ['protective_blessing'] }), 3, 4, 'protective_blessing', 4, 4);
    expect(shields(at(b, 4, 4))).toBe(1);
    const shared = play(make(B({ 4: '...gs...', 6: '...R....' }), { '3,4': ['shared_armor'], '3,6': ['heavy_strike'] }), 3, 6, 3, 4);
    expect(shared.pieces.find((p) => p.type === 'guardian')?.hp).toBe(1);
    expect(shared.pieces.find((p) => p.type === 'siege')?.hp).toBe(1);
  });

  it('Rescue pulls an ally behind; Emergency Evacuation sends one home', () => {
    covers('rescue', 'emergency_evacuation');
    const r = act(make(B({ 3: '...R....', 4: '..BG....' }), { '3,4': ['rescue'] }), 3, 4, 'rescue', 3, 5);
    expect(at(r, 3, 5)?.type).toBe('rook');
    const e = act(hurt(make(B({ 2: '...G....', 4: '.B......' }), { '1,4': ['emergency_evacuation'] }), 3, 2), 1, 4, 'emergency_evacuation');
    expect(e.pieces.find((p) => p.type === 'guardian')!.pos.y).toBeGreaterThanOrEqual(6);
  });

  it('Rally and Battlefield Inspiration add range', () => {
    covers('rally', 'battlefield_inspiration');
    const r = act(make(B({ 4: '...BG...' }), { '3,4': ['rally'] }), 3, 4, 'rally', 4, 4);
    expect(status(at(r, 4, 4), 'rangeBuff')).toBe(true);
    const b = act(make(B({ 4: '...BG...' }), { '3,4': ['battlefield_inspiration'] }), 3, 4, 'battlefield_inspiration');
    expect(status(at(b, 4, 4), 'rangeBuff')).toBe(true);
  });

  it('Cleansing removes a negative status', () => {
    covers('cleansing');
    let s = make(B({ 4: '...BG...' }), { '3,4': ['cleansing'] });
    s = { ...s, pieces: s.pieces.map((p) => (p.type === 'guardian' ? { ...p, statuses: [{ kind: 'slowed', until: null }] } : p)) };
    s = act(s, 3, 4, 'cleansing', 4, 4);
    expect(at(s, 4, 4)?.statuses).toHaveLength(0);
  });

  it('Healing on Capture heals the attacker', () => {
    covers('healing_on_capture');
    const s = play(hurt(make(B({ 4: '...p....', 6: '...R....' }), { '3,6': ['reinforced_body', 'healing_on_capture'] }), 3, 6), 3, 6, 3, 4);
    expect(at(s, 3, 4)?.hp).toBe(2);
  });

  it('Defensive Formation keeps neighbours in place', () => {
    covers('defensive_formation');
    const s = play(make(B({ 4: '..bg....', 6: '...R....' }), { '2,4': ['defensive_formation'], '3,6': ['heavy_impact'] }), 3, 6, 3, 4);
    expect(at(s, 3, 4)?.type).toBe('guardian');
  });

  it('Sanctuary protects allies in the zone', () => {
    covers('sanctuary');
    let s = act(make(B({ 4: '...BG...', 1: '....r...' }), { '3,4': ['sanctuary'] }), 3, 4, 'sanctuary');
    s = play(s, 4, 1, 4, 4);
    expect(at(s, 4, 4)?.type).toBe('guardian');
  });
});

describe('Status & control upgrades', () => {
  // Player Bishop at (3,4) targets enemies nearby.
  const target = (ups: string[], upgrade: string, rows: Record<number, string>, tx: number, ty: number) =>
    act(make(B({ 4: '...B....', ...rows }), { '3,4': ups }), 3, 4, upgrade, tx, ty);

  it('Bind, Extended Bind and Chain Bind stop enemies moving', () => {
    covers('bind', 'extended_bind', 'chain_bind');
    const s = target(['bind'], 'bind', { 3: '...r....' }, 3, 3);
    expect(legalMoves(s).filter((m) => m.pieceId === at(s, 3, 3)!.id)).toHaveLength(0);
    const far = make(B({ 2: '...r....', 4: '...B....' }), { '3,4': ['bind', 'extended_bind'] });
    expect(hasAction(far, 3, 4, 'bind')).toBe(true);
    const chain = target(['bind', 'chain_bind'], 'bind', { 3: '...rr...' }, 3, 3);
    expect(status(at(chain, 4, 3), 'bound')).toBe(true);
  });

  it('Silence, Slow, Disarm, Blind, Cripple, Confusion and Pacify', () => {
    covers('silence', 'slow', 'disarm', 'blind', 'cripple', 'confusion', 'pacify');
    const mage = target(['silence'], 'silence', { 3: '...m....' }, 3, 3);
    expect(legalMoves(mage).some((m) => m.action === 'teleport')).toBe(false);
    const slow = target(['slow'], 'slow', { 2: '.....m..' }, 5, 2);
    expect(dests(legalMoves(slow).filter((m) => m.pieceId === at(slow, 5, 2)!.id && !m.action))).not.toContain('7,4');
    const disarm = target(['disarm'], 'disarm', { 3: '...r....' }, 3, 3);
    expect(legalMoves(disarm).some((m) => m.pieceId === at(disarm, 3, 3)!.id && m.targets?.length)).toBe(false);
    const blind = target(['blind'], 'blind', { 2: '...a....' }, 3, 2);
    expect(legalMoves(blind).some((m) => m.action === 'shoot')).toBe(false);
    const cripple = target(['cripple'], 'cripple', { 2: '...n....' }, 3, 2);
    expect(legalMoves(cripple).some((m) => m.pieceId === at(cripple, 3, 2)!.id)).toBe(false);
    const conf = target(['confusion'], 'confusion', { 2: '.....r..' }, 5, 2);
    expect(dests(legalMoves(conf).filter((m) => m.pieceId === at(conf, 5, 2)!.id))).not.toContain('5,6');
    const pac = target(['pacify'], 'pacify', { 3: '...r....' }, 3, 3);
    expect(legalMoves(pac).some((m) => m.pieceId === at(pac, 3, 3)!.id && m.targets?.length)).toBe(false);
  });

  it('Mark, Vulnerability and Permanent Mark add damage taken', () => {
    covers('mark', 'vulnerability', 'permanent_mark');
    // A marked 2 HP Guardian dies to one Rook hit; an unmarked one survives.
    for (const up of ['mark', 'vulnerability', 'permanent_mark']) {
      let s = make(B({ 2: '...g....', 4: '..B.....', 6: '...R....' }), { '2,4': [up] });
      s = wait(act(s, 2, 4, up, 3, 2));
      s = play(s, 3, 6, 3, 2);
      expect(s.pieces.some((p) => p.type === 'guardian'), up).toBe(false);
    }
    const plain = play(make(B({ 2: '...g....', 6: '...R....' })), 3, 6, 3, 2);
    expect(plain.pieces.some((p) => p.type === 'guardian')).toBe(true);
  });

  it('Weakening Strike weakens a survivor; Curse lowers max HP', () => {
    covers('weakening_strike', 'curse');
    const w = play(make(B({ 4: '...g....', 6: '...R....' }), { '3,6': ['weakening_strike'] }), 3, 6, 3, 4);
    expect(status(w.pieces.find((p) => p.type === 'guardian'), 'weakened')).toBe(true);
    const c = target(['curse'], 'curse', { 3: '...g....' }, 3, 3);
    expect(at(c, 3, 3)?.maxHp).toBe(1);
  });

  it('Exhaust lengthens cooldowns; Root stops pushes; Fear drives an enemy back', () => {
    covers('exhaust', 'root', 'fear');
    let e = make(B({ 3: '...b....', 4: '...B....' }), { '3,4': ['exhaust'] });
    e = { ...e, pieces: e.pieces.map((p) => (p.type === 'bishop' && p.side === 'enemy' ? { ...p, counters: { royalCommandCd: 1 } } : p)) };
    e = act(e, 3, 4, 'exhaust', 3, 3);
    expect(at(e, 3, 3)?.counters.royalCommandCd).toBe(3);
    const r = act(make(B({ 4: '...BR...' }), { '3,4': ['root'] }), 3, 4, 'root', 4, 4);
    expect(status(at(r, 4, 4), 'rooted')).toBe(true);
    const f = act(make(B({ 4: '...Br...' }), { '3,4': ['fear'] }), 3, 4, 'fear', 4, 4);
    expect(at(f, 4, 4)).toBeUndefined();
  });

  it('Suppression and Absolute Silence switch off abilities', () => {
    covers('suppression', 'absolute_silence');
    const s = wait(make(B({ 4: '...Bm...' }), { '3,4': ['suppression'] }));
    expect(legalMoves(s).some((m) => m.action === 'teleport')).toBe(false);
    const a = act(make(B({ 4: '...B.m..' }), { '3,4': ['absolute_silence'] }), 3, 4, 'absolute_silence', 5, 4);
    expect(status(at(a, 5, 4), 'silenced')).toBe(true);
  });
});

describe('Summoning upgrades', () => {
  const summoned = (s: GameState) => s.pieces.filter((p) => p.temp);

  it('Pawn Summon, Double Pawn Summon and Pawn Swarm', () => {
    covers('pawn_summon', 'double_pawn_summon', 'pawn_swarm');
    expect(summoned(act(make(B({ 4: '...B....' }), { '3,4': ['pawn_summon'] }), 3, 4, 'pawn_summon', 3, 3))).toHaveLength(1);
    expect(summoned(act(make(B({ 4: '...B....' }), { '3,4': ['double_pawn_summon'] }), 3, 4, 'double_pawn_summon'))).toHaveLength(2);
    expect(summoned(act(make(B({ 4: '...B....' }), { '3,4': ['pawn_swarm'] }), 3, 4, 'pawn_swarm'))).toHaveLength(3);
  });

  it('Decoy cannot attack; Copy Movement lets it move like its summoner', () => {
    covers('decoy', 'copy_movement');
    const s = wait(act(make(B({ 4: '...R....', 2: '...p....' }), { '3,4': ['decoy'] }), 3, 4, 'decoy', 3, 3));
    expect(movesAt(s, 3, 3).some((m) => m.targets?.length)).toBe(false);
    const c = wait(act(make(B({ 4: '...R....' }), { '3,4': ['decoy', 'copy_movement'] }), 3, 4, 'decoy', 3, 3));
    expect(dests(movesAt(c, 3, 3))).toContain('3,1');
  });

  it('Mirror Image, Army of One and Perfect Clone copy the summoner', () => {
    covers('mirror_image', 'army_of_one', 'perfect_clone');
    const m = summoned(act(make(B({ 4: '...G....' }), { '3,4': ['mirror_image'] }), 3, 4, 'mirror_image', 3, 3));
    expect(m[0].type).toBe('guardian');
    expect(m[0].maxHp).toBe(1);
    expect(summoned(act(make(B({ 4: '...G....' }), { '3,4': ['army_of_one'] }), 3, 4, 'army_of_one'))).toHaveLength(2);
    const p = summoned(act(make(B({ 4: '...G....' }), { '3,4': ['perfect_clone'] }), 3, 4, 'perfect_clone', 3, 3));
    expect(p[0].maxHp).toBe(2);
  });

  it('Temporary Knight expires; Summon Extension and Lasting Reinforcements extend it', () => {
    covers('temporary_knight', 'summon_extension', 'lasting_reinforcements');
    const run = (ups: string[]) => {
      let s = act(make(B({ 4: '...B....' }), { '3,4': ups }), 3, 4, 'temporary_knight', 3, 3);
      for (let i = 0; i < 6; i++) s = wait(s);
      return summoned(s).length;
    };
    expect(run(['temporary_knight'])).toBe(0);
    expect(run(['temporary_knight', 'summon_extension'])).toBe(1);
    expect(run(['temporary_knight', 'lasting_reinforcements'])).toBe(1);
  });

  it("Summoner's Range and Summon Shield", () => {
    covers('summoners_range', 'summon_shield');
    const r = make(B({ 4: '...B....' }), { '3,4': ['pawn_summon', 'summoners_range'] });
    expect(movesAt(r, 3, 4).some((m) => m.upgrade === 'pawn_summon' && m.to.y === 2)).toBe(true);
    const sh = summoned(act(make(B({ 4: '...B....' }), { '3,4': ['pawn_summon', 'summon_shield'] }), 3, 4, 'pawn_summon', 3, 3));
    expect(shields(sh[0])).toBe(1);
  });

  it('Sacrificial Summon, Summon Swap, Summon Recall and Summon Conversion', () => {
    covers('sacrificial_summon', 'summon_swap', 'summon_recall', 'summon_conversion');
    const base = (ups: string[]) => wait(act(hurt(make(B({ 4: '...G....' }), { '3,4': ['pawn_summon', ...ups] }), 3, 4), 3, 4, 'pawn_summon', 3, 3));
    const sac = act(base(['sacrificial_summon']), 3, 4, 'sacrificial_summon', 3, 3);
    expect(summoned(sac)).toHaveLength(0);
    expect(at(sac, 3, 4)?.hp).toBe(2);
    const swap = act(base(['summon_swap']), 3, 4, 'summon_swap', 3, 3);
    expect(at(swap, 3, 3)?.type).toBe('guardian');
    const recall = act(base(['summon_recall']), 3, 4, 'summon_recall', 2, 4);
    expect(at(recall, 2, 4)?.temp).toBeDefined();
    const conv = act(base(['summon_conversion']), 3, 4, 'summon_conversion', 3, 3, (m) => m.param === 'knight');
    expect(at(conv, 3, 3)?.type).toBe('knight');
  });

  it('Explosive Decoy blasts adjacent enemies when destroyed', () => {
    covers('explosive_decoy');
    let s = make(B({ 1: '...r....', 4: '....s...', 6: '...R....' }), { '3,6': ['decoy', 'explosive_decoy'] });
    s = act(s, 3, 6, 'decoy', 3, 5);
    s = play(s, 3, 1, 3, 5);
    expect(at(s, 4, 4)?.hp).toBe(1);
  });

  it('Summoned Guard lets a summon intercept for an ally', () => {
    covers('summoned_guard');
    // The enemy Rook attacks the Bishop; the summoned Pawn beside it takes the hit.
    let t = make(B({ 1: '..r.....', 4: '..B.....' }), { '2,4': ['pawn_summon', 'summoned_guard'] });
    t = act(t, 2, 4, 'pawn_summon', 3, 4);
    t = play(t, 2, 1, 2, 4);
    expect(t.pieces.some((p) => p.type === 'bishop' && p.side === 'player')).toBe(true);
  });

  it('Echo Summon recreates the first summon lost', () => {
    covers('echo_summon');
    let s = make(B({ 1: '...r....', 6: '...B....' }), { '3,6': ['pawn_summon', 'echo_summon'] });
    s = act(s, 3, 6, 'pawn_summon', 3, 5);
    s = play(s, 3, 1, 3, 5);
    expect(summoned(s).length).toBe(1);
  });

  it("Summoner's Reward shields the summoner when a summon captures", () => {
    covers('summoners_reward');
    let s = make(B({ 4: '..p.....', 6: '...B....' }), { '3,6': ['pawn_summon', 'summoners_reward'] });
    s = wait(act(s, 3, 6, 'pawn_summon', 3, 5));
    s = applyMove(s, movesAt(s, 3, 5).find((m) => m.targets?.length)!);
    expect(shields(at(s, 3, 6))).toBe(1);
  });
});
