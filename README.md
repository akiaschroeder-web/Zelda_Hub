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

## Project layout

| Path | What it is |
|---|---|
| `src/engine/` | Pure TypeScript rules engine (no React). Boards of any size, terrain, all chess rules, AI. |
| `src/engine/__tests__/` | Engine tests (`npx vitest run`). Includes perft checks against known chess positions. |
| `src/ui/` | Screens and components. |
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
