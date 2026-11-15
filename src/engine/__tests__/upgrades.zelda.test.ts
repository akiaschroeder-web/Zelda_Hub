import { describe, expect, it } from 'vitest';
import { terrainAt } from '../board';
import { hasStatus } from '../core';
import { legalMoves, applyMove } from '../moves';
import { PieceType, Side } from '../types';
import { act, at, covers, dests, hasAction, make, movesAt, play, shields, wait } from './upgradeHelpers';

/** Extra layout symbols for these tests. */
const L: Record<string, [PieceType, Side]> = {
  Ω: ['necromancer', 'enemy'],
  ζ: ['zora', 'enemy'],
  λ: ['link', 'enemy'],
  Λ: ['link', 'player'],
  ρ: ['redead', 'enemy'],
  ι: ['illusion', 'enemy'],
};
const opts = (terrain?: string[]) => ({ legend: L, terrain });

describe('Zelda Pack upgrades: weapons & equipment', () => {
  it('Kokiri Sword: after a capture, step one square in any direction', () => {
    covers('kokiri_sword');
    let s = make(['k.......', '........', 'p.......', '........', 'R.......', '........', '........', '.......K'], { '0,4': ['kokiri_sword'] }, opts());
    s = play(s, 0, 4, 0, 2);
    expect(s.turn).toBe('player');
    expect(dests(movesAt(s, 0, 2))).toContain('1,1'); // a diagonal step, even for a Rook
    s = play(s, 0, 2, 1, 1);
    expect(s.turn).toBe('enemy');
  });

  it('Master Sword: 2 damage against Boss Pieces', () => {
    covers('master_sword');
    let s = make(['k.......', '........', '...Ω....', '........', '...R....', '........', '........', '.......K'], { '3,4': ['master_sword'] }, opts());
    s = play(s, 3, 4, 3, 2);
    expect(s.pieces.find((p) => p.type === 'necromancer')!.hp).toBe(1);
  });

  it("Biggoron's Sword: also hits the enemy right behind the target", () => {
    covers('biggorons_sword');
    let s = make(['k.......', '........', 'p.......', 'p.......', '........', '........', 'R.......', '.......K'], { '0,6': ['biggorons_sword'] }, opts());
    s = play(s, 0, 6, 0, 3);
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(0);
  });

  it('Deku Shield: starts the battle with one shield point', () => {
    covers('deku_shield');
    const s = make(['k.......', '........', '........', '........', '...R....', '........', '........', '.......K'], { '3,4': ['deku_shield'] }, opts());
    expect(shields(at(s, 3, 4))).toBe(1);
  });

  it('Hylian Shield: the first attack is negated', () => {
    covers('hylian_shield');
    let s = make(['k.......', '........', '...r....', '........', '........', '...R....', '........', '.......K'], { '3,2': ['hylian_shield'] }, opts());
    s = play(s, 3, 5, 3, 2);
    const rook = s.pieces.find((p) => p.type === 'rook' && p.side === 'enemy');
    expect(rook?.hp).toBe(1);
  });

  it('Mirror Shield: reflects a shot back at the archer', () => {
    covers('mirror_shield');
    let s = make(['k.......', '........', '........', '...p....', '........', '...A....', '........', '.......K'], { '3,3': ['mirror_shield'] }, opts());
    const shot = movesAt(s, 3, 5).find((m) => m.action === 'shoot' && m.to.x === 3 && m.to.y === 3)!;
    s = applyMove(s, shot);
    expect(at(s, 3, 3)?.type).toBe('pawn');
    expect(s.pieces.some((p) => p.type === 'archer')).toBe(false);
  });

  it('Fairy Bow: shoots 3 squares without moving, then recharges for 3 turns', () => {
    covers('fairy_bow');
    let s = make(['k.......', '........', '........', 'p.......', '..p.....', '........', 'R.......', '.......K'], { '0,6': ['fairy_bow'] }, opts());
    s = act(s, 0, 6, 'fairy_bow', 0, 3);
    expect(at(s, 0, 6)?.type).toBe('rook');
    expect(at(s, 0, 3)).toBeUndefined();
    s = wait(s);
    expect(hasAction(s, 0, 6, 'fairy_bow')).toBe(false);
  });

  it('Fairy Slingshot: stuns an enemy within 2 so it cannot move', () => {
    covers('fairy_slingshot');
    let s = make(['k.......', '........', '........', '..r.....', '........', '..N.....', '........', '.......K'], { '2,5': ['fairy_slingshot'] }, opts());
    s = act(s, 2, 5, 'fairy_slingshot', 2, 3);
    expect(hasStatus(at(s, 2, 3)!, 'bound')).toBe(true);
    expect(legalMoves(s).filter((m) => m.pieceId === at(s, 2, 3)!.id && !m.action)).toHaveLength(0);
  });

  it('Boomerang: 1 damage to an enemy 2 squares away in a clear line', () => {
    covers('boomerang');
    let s = make(['k.......', '........', '........', '....p...', '........', '..B.....', '........', '.......K'], { '2,5': ['boomerang'] }, opts());
    s = act(s, 2, 5, 'boomerang', 4, 3);
    expect(at(s, 4, 3)).toBeUndefined();
    expect(at(s, 2, 5)?.type).toBe('bishop');
  });

  it('Megaton Hammer: smashes a cracked wall and the enemy behind it', () => {
    covers('megaton_hammer');
    const terrain = ['........', '........', '........', '........', '...+....', '........', '........', '........'];
    let s = make(['k.......', '........', '........', '...p....', '........', '...R....', '........', '.......K'], { '3,5': ['megaton_hammer'] }, opts(terrain));
    s = act(s, 3, 5, 'megaton_hammer', 3, 4);
    expect(terrainAt(s.board, { x: 3, y: 4 })).toBe('normal');
    expect(at(s, 3, 3)).toBeUndefined();
  });
});

describe('Zelda Pack upgrades: tools', () => {
  it('Hookshot and Longshot: pull to the square in front of a wall, over gaps', () => {
    covers('hookshot', 'longshot');
    const terrain = ['#.......', '........', '........', '........', '........', '_.......', '........', '........'];
    const rows = ['.......k', '........', '........', '........', '........', '........', '........', 'N......K'];
    const hook = make(rows, { '0,7': ['hookshot'] }, opts(terrain));
    expect(hasAction(hook, 0, 7, 'hookshot')).toBe(false); // the wall is 7 squares away
    const long = make(rows, { '0,7': ['longshot'] }, opts(terrain));
    const s = act(long, 0, 7, 'longshot', 0, 1);
    expect(at(s, 0, 1)?.type).toBe('knight');

    const near = make(['.......k', '........', '........', '........', '.......K', '........', '........', 'N.......'], { '0,7': ['hookshot'] }, opts(['........', '........', '........', '#.......', '........', '_.......', '........', '........']));
    expect(hasAction(near, 0, 7, 'hookshot')).toBe(true);
  });

  it('Bombs: blow up a cracked wall, hurting every piece next to it', () => {
    covers('bombs');
    const terrain = ['........', '........', '........', '...+....', '........', '........', '........', '........'];
    let s = make(['k.......', '........', '........', '....p...', '..P.....', '...R....', '........', '.......K'], { '3,5': ['bombs'] }, opts(terrain));
    s = act(s, 3, 5, 'bombs', 3, 3);
    expect(terrainAt(s.board, { x: 3, y: 3 })).toBe('normal');
    expect(at(s, 4, 3)).toBeUndefined();
    expect(at(s, 2, 4)).toBeUndefined(); // allies too
  });

  it('Bombchu: runs over gaps and hits the first piece in line', () => {
    covers('bombchu');
    const terrain = ['........', '........', '........', '........', '........', '_.......', '........', '........'];
    let s = make(['.......k', '........', '........', 'p.......', '........', '........', '........', 'N......K'], { '0,7': ['bombchu'] }, opts(terrain));
    s = act(s, 0, 7, 'bombchu', 0, 3);
    expect(at(s, 0, 3)).toBeUndefined();
  });

  it('Hover Boots: a slide may cross one gap square', () => {
    covers('hover_boots');
    const terrain = ['........', '........', '........', '........', '_.......', '........', '........', '........'];
    const rows = ['.......k', '........', '........', '........', '........', '........', 'R.......', '.......K'];
    expect(dests(movesAt(make(rows, {}, opts(terrain)), 0, 6))).not.toContain('0,3');
    expect(dests(movesAt(make(rows, { '0,6': ['hover_boots'] }, opts(terrain)), 0, 6))).toContain('0,3');
  });

  it("Golden Gauntlets shove into gaps and walls; Iron Boots can't be moved", () => {
    covers('golden_gauntlets', 'iron_boots');
    const terrain = ['........', '........', '........', '..._#...', '........', '........', '........', '........'];
    let s = make(['k.......', '........', '........', '........', '...pp...', '...R....', '........', '.......K'], { '3,5': ['golden_gauntlets'] }, opts(terrain));
    s = act(s, 3, 5, 'golden_gauntlets', 3, 4);
    expect(s.pieces.filter((p) => p.type === 'pawn')).toHaveLength(1); // into the gap
    const iron = make(['k.......', '........', '........', '........', '...p....', '...R....', '........', '.......K'], { '3,5': ['golden_gauntlets'], '3,4': ['iron_boots'] }, opts(terrain));
    expect(hasAction(iron, 3, 5, 'golden_gauntlets')).toBe(false);
  });

  it('Lens of Truth: attacks ignore a Zora’s evasion', () => {
    covers('lens_of_truth');
    const rows = ['k.......', '........', '...ζ....', '........', '........', '...R....', '........', '.......K'];
    const plain = play(make(rows, {}, opts()), 3, 5, 3, 2);
    expect(plain.pieces.some((p) => p.type === 'zora')).toBe(true);
    const lens = play(make(rows, { '3,5': ['lens_of_truth'] }, opts()), 3, 5, 3, 2);
    expect(lens.pieces.some((p) => p.type === 'zora')).toBe(false);
  });

  it('Deku Nut: stuns every adjacent enemy', () => {
    covers('deku_nut');
    let s = make(['k.......', '........', '........', '...pp...', '...N....', '........', '........', '.......K'], { '3,4': ['deku_nut'] }, opts());
    s = act(s, 3, 4, 'deku_nut');
    expect(hasStatus(at(s, 3, 3)!, 'stunned')).toBe(true);
    expect(hasStatus(at(s, 4, 3)!, 'stunned')).toBe(true);
    s = wait(s);
    expect(hasAction(s, 3, 4, 'deku_nut')).toBe(false); // once per battle
  });
});

describe('Zelda Pack upgrades: magic', () => {
  it("Din's Fire: 1 damage to enemies within 2, blocked by walls", () => {
    covers('dins_fire');
    const terrain = ['........', '........', '........', '........', '........', '....#...', '........', '........'];
    let s = make(['k.......', '........', '........', '...p....', '........', '...N.p..', '........', '.......K'], { '3,5': ['dins_fire'] }, opts(terrain));
    s = act(s, 3, 5, 'dins_fire');
    expect(at(s, 3, 3)).toBeUndefined();
    expect(at(s, 5, 5)?.type).toBe('pawn'); // behind the wall
  });

  it("Farore's Wind: teleport to any empty square once per battle", () => {
    covers('farores_wind');
    let s = make(['k.......', '........', '........', '........', '........', '........', '........', 'N......K'], { '0,7': ['farores_wind'] }, opts());
    s = act(s, 0, 7, 'farores_wind', 6, 0);
    expect(at(s, 6, 0)?.type).toBe('knight');
  });

  it("Nayru's Love: immune to damage through the enemy's turn", () => {
    covers('nayrus_love');
    let s = make(['k..r....', '........', '........', '........', '........', '...N....', '........', '.......K'], { '3,5': ['nayrus_love'] }, opts());
    s = act(s, 3, 5, 'nayrus_love');
    s = play(s, 3, 0, 3, 5);
    expect(at(s, 3, 5)?.type).toBe('knight');
  });

  it('Fire Arrows: the target burns for 1 at the end of its next turn', () => {
    covers('fire_arrows');
    let s = make(['k.......', '........', '...λ....', '........', '........', '...R....', '........', '.......K'], { '3,5': ['fire_arrows'] }, opts());
    s = play(s, 3, 5, 3, 2);
    const link = s.pieces.find((p) => p.type === 'link')!;
    expect(link.hp).toBe(1);
    expect(hasStatus(link, 'burned')).toBe(true);
    s = wait(s);
    expect(s.pieces.some((p) => p.type === 'link')).toBe(false);
  });

  it('Ice Arrows: the target is frozen on its next turn', () => {
    covers('ice_arrows');
    let s = make(['k.......', '........', '...λ....', '........', '........', '...R....', '........', '.......K'], { '3,5': ['ice_arrows'] }, opts());
    s = play(s, 3, 5, 3, 2);
    const link = s.pieces.find((p) => p.type === 'link')!;
    expect(legalMoves(s).filter((m) => m.pieceId === link.id && !m.action)).toHaveLength(0);
  });

  it('Light Arrows: ignore shields', () => {
    covers('light_arrows');
    const s = make(['k.......', '........', '...p....', '........', '........', '...R....', '........', '.......K'], { '3,5': ['light_arrows'] }, opts());
    at(s, 3, 2)!.shields.push({ strength: 2, expires: null });
    const after = play(s, 3, 5, 3, 2);
    expect(after.pieces.some((p) => p.type === 'pawn')).toBe(false);
  });
});

describe('Zelda Pack upgrades: songs & relics', () => {
  it('Song of Time: back to where the previous turn began, with lost HP restored', () => {
    covers('song_of_time');
    let s = make(['.......k', '........', '........', '........', 'r.......', '........', '...Λ....', '.......K'], { '3,6': ['song_of_time'] }, opts());
    s = play(s, 3, 6, 3, 4);
    s = play(s, 0, 4, 3, 4); // the enemy Rook hits Link and bounces
    const link = () => s.pieces.find((p) => p.type === 'link')!;
    expect(link().hp).toBe(1);
    s = act(s, 3, 4, 'song_of_time', 3, 6);
    expect(link().pos).toEqual({ x: 3, y: 6 });
    expect(link().hp).toBe(2);
  });

  it("Sun's Song: stuns every enemy undead, or one adjacent enemy", () => {
    covers('suns_song');
    let s = make(['k.....ρ.', '........', '........', '...p....', '...N....', '........', '........', '.......K'], { '3,4': ['suns_song'] }, opts());
    const undead = act(s, 3, 4, 'suns_song', 3, 4);
    expect(hasStatus(undead.pieces.find((p) => p.type === 'redead')!, 'stunned')).toBe(true);
    s = act(s, 3, 4, 'suns_song', 3, 3);
    expect(hasStatus(at(s, 3, 3)!, 'stunned')).toBe(true);
  });

  it('Song of Storms: pieces in the 3x3 storm move one square less', () => {
    covers('song_of_storms');
    let s = make(['k.......', '........', '...r....', '........', '...N....', '........', '........', '.......K'], { '3,4': ['song_of_storms'] }, opts());
    s = act(s, 3, 4, 'song_of_storms', 3, 2);
    expect(hasStatus(at(s, 3, 2)!, 'slowed')).toBe(true);
  });

  it('Bottled Fairy: survives the first capture with 1 HP', () => {
    covers('bottled_fairy');
    let s = make(['k.......', '........', '...p....', '........', '........', '...R....', '........', '.......K'], { '3,2': ['bottled_fairy'] }, opts());
    s = play(s, 3, 5, 3, 2);
    expect(at(s, 3, 2)?.type).toBe('pawn');
    expect(at(s, 3, 2)?.hp).toBe(1);
  });

  it('Stone of Agony: reveals an adjacent illusion', () => {
    covers('stone_of_agony');
    let s = make(['k.......', '........', '...ι....', '........', '...N....', '........', '........', '.......K'], { '3,4': ['stone_of_agony'] }, opts());
    s = play(s, 3, 4, 4, 2 + 0);
    expect(s.pieces.find((p) => p.type === 'illusion')!.counters.revealed).toBe(1);
  });
});
