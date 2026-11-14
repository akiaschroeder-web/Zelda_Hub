# Chess Roguelike

A turn-based chess roguelike for mobile (Expo / React Native, TypeScript).

## Run it on your phone

1. Install **Expo Go** from the App Store / Play Store.
2. On a computer with Node 20+:
   ```bash
   npm install
   npx expo start
   ```
3. Scan the QR code with your phone's camera (iOS) or the Expo Go app (Android).

`npx expo start --web` runs it in a browser instead.

## How a run works

1. **Menu → New run.** You start with the roster, Army Points and gold in `src/run/config.ts`
   (placeholders: a standard chess army, 24 AP, 40 gold).
2. **Map.** Three acts, each six floors of branching nodes ending in a boss. Tap a glowing node:
   ⚔️ battle · 💀 elite · 🛡️ recruit · 🛒 shop · ❓ event · 💰 treasure · 👑 boss.
3. **Battles** are generated: a board template, Royal Duel or Extermination rules, and an enemy army
   bought from a point budget that grows with act and floor, styled by an archetype (Swarm, Cavalry,
   Fortress, Royal Guard, Unorthodox). Elites have bigger budgets and can field a Juggernaut.
4. **Deploy** on the blue squares within your Army Points; the King must deploy; reserves are safe.
   A setup that attacks the enemy King before the battle starts is rejected.
5. **After a battle** captured pieces are gone for good, survivors earn ★, promotions stick, and you
   get gold plus a choice of pieces or Army Points. Losing the King ends the run; a draw is survived
   with a small reward. Beat the act 3 boss to win.
6. Shops sell pieces and Army Points; recruit and treasure nodes give free pieces; events offer trades.

The run is saved after every action (including each battle move), and is reproducible from its seed.
Bosses are placeholder armies of existing pieces until the Boss Pieces are implemented.

## Boss Pieces

| Boss | Size / HP | Pts | Movement | Abilities |
|---|---|---|---|---|
| The Colossus | 3×3 · 6 | 28 | 1 orthogonal | Crushing Advance: 2 damage to every enemy under its new footprint. Siege Breaker: smashes cracked walls in its path. |
| The Empress | 1×1 · 3 | 25 | Queen + Knight | Royal Command: an ally makes an immediate extra move (every 3 turns). Imperial Guard: the first attack on her is absorbed by an adjacent ally. |
| The Necromancer | 1×1 · 3 | 23 | Up to 2 diagonal | Raise Fallen: every 3 turns a captured ally rises on a deployment square. Death Harvest: heals 1 whenever an enemy is captured. |
| The Stormbringer | 1×1 · 4 | 24 | Up to 3 orthogonal | Chain Lightning (every 4 turns): 1 damage to an enemy within 3, arcing to up to 2 neighbours. Charged Ground: the square it leaves hurts the first enemy to stop there. |
| The Watcher | 2×2 · 4 | 26 | 1 diagonal | All-Seeing / Judgment: marks every open line from its footprint; the first enemy to stop on one takes 1. Walls and gaps block its sight. |
| The Worldbreaker | 2×2 · 5 | 27 | 1 orthogonal | Earthquake (every 4 turns): shatters cracked walls within 2. Rupture: turns an adjacent empty square into a gap. Cannot cross gaps. |
| The Phantom King | 1×1 · 3 | 24 | Up to 3 any direction through walls and pieces, not gaps | Ethereal Escape: dodges the first attack by teleporting. Haunting Presence: adjacent enemies can't use abilities. |
| The Doppelganger | 1×1 · 4 | 25 | 1 any direction + every enemy 1×1 piece's movement | Stolen Talent (every 4 turns): uses an enemy piece's ability once. |
| The Hive Mother | 2×2 · 5 | 26 | 1 orthogonal | Spawn: a temporary Pawn every 3 turns. Swarm Command: adjacent friendly Pawns may advance an extra square. |
| The Chronarch | 1×1 · 4 | 30 | Up to 2 any direction | Rewind (once): undoes the enemy's last move. Temporal Acceleration (every 4 turns): two Chronarch actions in a row. |

Bosses are immune to pushes, pulls, status effects, conversion and cloning. Each act's boss is drawn
from a pool (act 1: Necromancer, Stormbringer, Phantom King; act 2: Empress, Doppelganger, Watcher,
Hive Mother; act 3: Worldbreaker, Colossus, Chronarch) and fought in its own arena; checkmating the
King or defeating the boss wins. A defeated boss is unlocked for the run: it may be offered as a
reward (30% from its own fight, occasionally from later elites) and can turn up in later elite
battles with a smaller escort. All ten arenas are playable from the sandbox.

## Upgrades

All 240 upgrades from the compendium are in `src/engine/upgrades/catalog.ts`; 234 are in play.
Six are held back because they need systems that don't exist yet (no piece facing, no objective
squares, no wall HP, no slowing terrain, and Gap Sense duplicates what the board already shows):
Free Rotation, Anchor Feet, Gap Sense, Terrain Adaptation, Wall Breaker, Board Dominion.

- **Slots:** every piece has 3; Legendary upgrades take 2. A piece can't take the same upgrade twice.
- **Cost:** each upgrade adds Army Points when the piece deploys — Common +0, Uncommon/Rare +1,
  Epic +2, Legendary +3.
- **Eligibility** (`eligibility.ts`): upgrades are only offered for pieces they make sense on
  (heavy upgrades for multi-square pieces, Extended Healing only for healers, summon modifiers only
  for summoners, the King only takes defensive upgrades plus Royal Resilience/Resurrection...).
- **Getting them:** battle/elite/boss rewards, treasure and shops offer upgrades; you pick which
  piece receives one. Enemy armies get upgrades too from act 2 on (elites and bosses earlier).
- **In battle:** tap a piece to see its upgrades and statuses. Gold rings mark upgrade actions on
  target squares; tap the piece again for actions that target itself. Bonus moves (Chain Capture,
  Unstoppable March, Royal Command, ...) keep the turn with you and can be skipped.

Interpretation notes for upgrades whose wording left room:
- Shields gained at battle start last until used; shields gained during battle expire at the end
  of their owner's next turn unless the piece has Lasting Guard. A piece holds at most 2 shields.
- Status actions (Silence, Slow, Mark, ...) are actions with range 2; Bind and Fear are adjacent.
- Pushing a piece into a gap or off the board makes it fall and be lost (Void Anchor/Immunity stop it).
- "Behind" (Backstab) means attacking from the target's own back-row side.
- Royal-class (Royal Hunter) currently means the Queen.

## Project layout

| Path | What it is |
|---|---|
| `src/engine/` | Pure TypeScript rules engine (no React). Boards of any size, terrain, all chess rules, AI. |
| `src/engine/__tests__/` | Engine tests (`npm test`). Perft checks, combat, every piece, every upgrade (a coverage test fails if any offerable upgrade has no test), and AI self-play. |
| `src/engine/upgrades/` | Upgrade catalog and eligibility rules. Effects live in `core.ts` (damage, pushes, summons, terrain), `movement.ts`, `actions.ts` and `moves.ts`. |
| `src/app/` | Screens (Expo Router): menu, map, deploy, battle, reward, shop, event, army, sandbox. |
| `src/run/` | Run logic: map generation, battle generation, rewards/shop/events, deployment, casualties, save/load. `config.ts` holds the placeholder starting numbers. |
| `src/ui/` | Shared components: board renderer, battle view, piece tiles, buttons. |
| `assets/pieces/` | Processed piece sprites (`<type>_player.png`, `<type>_enemy.png`) for all 39 pieces in the art so far. |
| `art/source/` | Original artwork as delivered. |
| `art/process_pieces.py` | Cuts sprites out of the source art (including the labelled sheets) and makes the enemy colour variant. |

## Rules implemented so far

- Boards of any width/height with **gaps**, **solid walls** and **cracked walls**.
- Sliding pieces stop at gaps and walls. Knights jump gaps but are blocked by any wall
  inside the 2×3 rectangle of their jump.
- Castling (any unmoved Rook on the King's row, ≥3 squares away, clear normal squares between),
  en passant, promotion on the far back row or on special promotion squares.
- Check, checkmate, stalemate, fifty-move rule, threefold repetition, insufficient material.
- Encounter rules: **Royal Duel** (check rules on) and **Extermination** (no check; Kings can be captured).
- Losing the player's King ends the game in every mode.

### Combat (HP, shields, bounceback)

- Every piece has HP (standard pieces 1) and can carry shields; each shield absorbs one damage first.
- An attack deals the attacker's damage. A target reduced to 0 HP is captured and the attacker takes its square.
- If a target survives, the attacker **bounces back**: half the distance it travelled, rounded up
  (minimum 1), measured back from the target along its approach. Leapers (Knights) return to the
  square they jumped from.
- A large piece hit on several of its squares by one attack still only takes one hit.

### Juggernaut (2×2, 3 HP, 12 points)

- Moves one square orthogonally; all four squares of its new footprint must be open, normal terrain
  with no friendly piece.
- Every enemy under its new footprint is hit at once. If any survives, the Juggernaut bounces back to
  where it started.
- It can check and capture Kings; it never castles or promotes.

Encounter layouts use `J`/`j` for a Juggernaut (top-left square of its footprint).

### First collection of new pieces

| Piece | HP | Pts | Movement | Special |
|---|---|---|---|---|
| Archer `A` | 1 | 4 | 1 diagonal, never captures by moving | Shoots an enemy exactly 2 squares away orthogonally; doesn't move or bounce. Walls between block the shot. |
| Guardian `G` | 2 | 5 | 1 any direction | Once per battle, automatically takes a single-target hit meant for an adjacent ally (never the King). If it falls, the attacker takes its square. |
| Lancer `L` | 1 | 4 | Leaps exactly 2 or 3 orthogonally over pieces and gaps, not walls | — |
| Siege Engine `S` | 2 | 6 | 1 orthogonal | Instead of moving, demolishes an adjacent cracked wall (it becomes a normal square). |
| Mage `M` | 1 | 6 | Up to 2 diagonal | Once per battle, teleports to an empty square within 3 (King-distance), ignoring pieces, gaps and walls. |
| Switcher `W` | 1 | 5 | 1 any direction | Once per battle, swaps places with a 1×1 ally within 2 squares (not the King). |
| Chancellor `C` | 1 | 10 | Rook + Knight | — |
| Medic `H` | 1 | 5 | 1 diagonal or sideways | Instead of moving, heals an adjacent wounded ally 1 HP (not the King). |

### Expanded collection

| Piece | HP | Pts | Movement | Special |
|---|---|---|---|---|
| Hopper `O` | 1 | 3 | Jumps exactly 2 diagonally over the square between | Crosses a single gap; walls block it. |
| Magnet `T` | 1 | 5 | 1 orthogonal | Instead of moving, pulls an enemy exactly 2 squares away (in a line) one square closer. Not Kings or large pieces. |
| Pusher `U` | 2 | 6 | Up to 2 orthogonal | Instead of capturing, shoves an adjacent enemy one square away. Fails into a wall or piece; into a gap the target falls. |
| Mimic `I` | 1 | 7 | Movement of every adjacent friendly 1×1 piece (a copied Pawn has no double step) | Alone: 1 diagonal. Copies movement only. |
| Anchor `V` | 2 | 5 | 1 diagonal | Adjacent allies can't be pushed, pulled or forcibly moved. |
| Reaper `X` | 1 | 7 | Up to 3 diagonal | On a capture, enemies next to the captured piece take 1 damage. |
| Bastion `F` | 3 | 8 | 1 orthogonal | If it neither moves nor acts in your turn, gains a shield (max one). |
| Pathfinder `Z` | 1 | 5 | Up to 2 any direction | Once per battle, bridges an adjacent gap for three rounds. |
| Sentinel `Y` | 1 | 6 | 1 orthogonal | Instead of moving, watches a line of up to 4 squares; the first enemy to stop on it takes 1 damage. Ends at the start of its next turn. |
| Splitter `D` | 1 | 6 | Up to 2 diagonal | Once per battle, makes a temporary 1 HP copy on an adjacent square (the copy can't split). |
| Jailer `E` | 1 | 7 | Up to 2 orthogonal | Instead of moving, binds an adjacent enemy 1×1 (not the King) so it can't move next turn. |
| Phoenix `@`/`&` | 1 | 8 | Up to 3 orthogonal | The first time it would be captured, it's reborn on a free friendly deployment square at the start of your next turn. |

The Jailer uses the Trapper artwork and the Phoenix the Revenant artwork.

### Special pieces

| Piece | HP | Pts | Movement | Abilities |
|---|---|---|---|---|
| Engineer | 2 | 4 | 1 any direction | Construct a cracked wall (every 3 turns), Demolish an adjacent cracked wall, Repair 1 HP of an adjacent multi-HP ally (once). |
| Assassin | 1 | 5 | Up to 3 diagonal | Backstab: 2 damage to an enemy still on the square it started its last turn on. Shadow Step behind an enemy within 3 (every 4 turns). Execution: after a capture, a free non-capturing move of up to 2. |
| Illusionist | 1 | 5 | Up to 2 in any straight line | Mirage: a 1 HP illusion that moves 1 and can't capture (every 4 turns). Enemy illusions look like Illusionists unless your Oracle is within 3. Misdirection: swap with an illusion (once). |
| Summoner | 2 | 6 | 1 diagonal | Summon a temporary Pawn (every 3 turns) or Knight (once); at most 3 summons at a time. |
| Converter | 1 | 7 | Up to 2 orthogonal | Once per battle, converts an adjacent 1 HP enemy (not King/boss/large) for the battle. A roster piece converted by the enemy is lost. |
| Displacer | 2 | 5 | Leaps exactly 2 orthogonally | Swap with an enemy within 2 (every 3 turns); Repulsion pushes all adjacent enemies (once); can't be swapped by enemies. |
| Oracle | 1 | 6 | Up to 3 diagonal | Foresight shows the enemy's intended move; Revelation exposes illusions within 3; Prophecy negates the next attack on an ally (every 4 turns). |
| Clone | 1 | 6 | 1 any direction | Once per battle, copies an adjacent ally's movement and abilities (not upgrades or HP); reverts after battle. |
| Bomber | 1 | 4 | 1 orthogonal | Detonate: 2 damage to all 8 neighbours (allies too, never Kings), destroying itself. If captured, 1 damage to neighbours. |
| Slayer | 2 | 7 | Up to 3 orthogonal or 1 diagonal | 2 damage to multi-HP enemies (3 to bosses), bounces only 1 square, heals after felling a multi-HP enemy. |
| Warden | 3 | 6 | 1 orthogonal | Adjacent allies take 1 less from hits of 2+; immovable; intercepts one hit for an adjacent ally (not the King). |
| Harvester | 2 | 5 | Up to 2 any direction | A Soul per capture (max 5, kept between battles). Spend 2 to heal 1 or 3 for +1 damage. Reaching 5 Souls: +1 max HP once per run. |

"Every N turns" abilities are cooldowns counted in the owner's turns and are ready at the start of a battle.
