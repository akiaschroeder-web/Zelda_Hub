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
| `assets/pieces/` | Processed piece sprites (`<type>_player.png`, `<type>_enemy.png`). |
| `art/source/` | Original artwork as delivered. |
| `art/process_pieces.py` | Cuts sprites out of the source art and makes the enemy colour variant. |

## Rules implemented so far

- Boards of any width/height with **gaps**, **solid walls** and **cracked walls**.
- Sliding pieces stop at gaps and walls. Knights jump gaps but are blocked by any wall
  inside the 2×3 rectangle of their jump.
- Castling (any unmoved Rook on the King's row, ≥3 squares away, clear normal squares between),
  en passant, promotion on the far back row or on special promotion squares.
- Check, checkmate, stalemate, fifty-move rule, threefold repetition, insufficient material.
- Encounter rules: **Royal Duel** (check rules on) and **Extermination** (no check; Kings can be captured).
- Losing the player's King ends the game in every mode.
