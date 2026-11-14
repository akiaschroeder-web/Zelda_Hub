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

## Project layout

| Path | What it is |
|---|---|
| `src/engine/` | Pure TypeScript rules engine (no React). Boards of any size, terrain, all chess rules, AI. |
| `src/engine/__tests__/` | Engine tests (`npm test`). Perft checks against known chess positions, combat, every new piece, and AI self-play on every encounter. |
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
