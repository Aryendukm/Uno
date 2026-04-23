
import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'black';
export type Value =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2'
  | 'wild' | 'wild4'
  | 'shuffle'   // Rule 4: Shuffle Hand special card
  | 'blank_wild';

export interface Card {
  id: string;
  color: Color;
  value: Value;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  isHost: boolean;
  isReady: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface GameState {
  deck: Card[];
  discardPile: Card[];
  players: Player[];
  currentPlayerIndex: number;
  direction: 1 | -1;        // 1 = clockwise, -1 = counter-clockwise
  status: 'lobby' | 'playing' | 'ended';
  winner: string | null;
  currentColor: Color;       // Tracks active color (important for wilds)
  lastAction: string | null;
  unoCalledBy: { [playerId: string]: boolean };
  activeRule?: string | null; // Blank wild custom rule
  // Rule 5 – +4 stacking: accumulated penalty waiting for next player
  pendingWild4Stack: number;
  // Rule 3 – Draw-and-play: card drawn this turn that may be played immediately
  drawnCardId: string | null;
  // Rule 4 – Shuffle hand: pending shuffle choice modal data
  pendingShuffleCardId: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const COLORS: Color[] = ['red', 'blue', 'green', 'yellow'];
export const VALUES: Value[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'skip', 'reverse', 'draw2'
];

// ─── Deck Utilities ───────────────────────────────────────────────────────────

export function createDeck(): Card[] {
  const deck: Card[] = [];

  COLORS.forEach(color => {
    // One zero per color
    deck.push({ id: uuidv4(), color, value: '0' });
    // Two of each 1-9 and action cards per color
    for (let i = 0; i < 2; i++) {
      VALUES.slice(1).forEach(value => {
        deck.push({ id: uuidv4(), color, value });
      });
    }
  });

  // 4 each of Wild, Wild Draw 4, Shuffle Hand, and Blank Wild
  for (let i = 0; i < 4; i++) {
    deck.push({ id: uuidv4(), color: 'black', value: 'wild' });
    deck.push({ id: uuidv4(), color: 'black', value: 'wild4' });
    deck.push({ id: uuidv4(), color: 'black', value: 'shuffle' });
    deck.push({ id: uuidv4(), color: 'black', value: 'blank_wild' });
  }

  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
  // Fisher-Yates shuffle for a fair distribution
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Rule 2 – Draw Pile Exhaustion Handling
 * When the draw deck is empty, reshuffle the discard pile (minus the top card)
 * back into a new draw deck.  Returns the mutated state (no duplication or loss).
 */
export function reshuffleDiscardIntoDeck(state: GameState): GameState {
  if (state.deck.length > 0) return state; // Nothing to do

  const discardCopy = [...state.discardPile];
  const topCard = discardCopy.pop(); // Keep the current top card in place

  if (discardCopy.length === 0) {
    // Edge case: literally no cards left anywhere – can't reshuffle
    return state;
  }

  return {
    ...state,
    deck: shuffleDeck(discardCopy),      // Reshuffled former discard becomes new deck
    discardPile: topCard ? [topCard] : [], // Only the top card remains in discard
    lastAction: (state.lastAction ?? '') + ' (Deck reshuffled from discard pile)'
  };
}

/**
 * Draw a single card from the deck, auto-reshuffling if needed.
 * Returns [updatedState, drawnCard | null].
 */
export function drawOneCard(state: GameState): [GameState, Card | null] {
  let s = state.deck.length === 0 ? reshuffleDiscardIntoDeck(state) : state;
  const card = s.deck.length > 0 ? s.deck[s.deck.length - 1] : null;
  if (card) {
    s = { ...s, deck: s.deck.slice(0, -1) };
  }
  return [s, card];
}

/**
 * Draw `count` cards for a specific player, handling reshuffle mid-draw.
 */
export function drawCardsForPlayer(
  state: GameState,
  playerIndex: number,
  count: number
): GameState {
  let s = { ...state };
  const players = s.players.map(p => ({ ...p, hand: [...p.hand] }));
  s = { ...s, players };

  for (let i = 0; i < count; i++) {
    let drawn: Card | null;
    [s, drawn] = drawOneCard(s);
    if (drawn) {
      s.players[playerIndex].hand.push(drawn);
    }
  }
  return s;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Returns true when a single card is a legal play on top of `topCard`
 * given the active `activeColor`.
 */
export function isValidPlay(card: Card, topCard: Card, activeColor: Color): boolean {
  if (card.color === 'black') return true;       // Wild cards are always playable
  if (card.color === activeColor) return true;    // Color match
  if (card.value === topCard.value) return true;  // Value match
  return false;
}

/**
 * Rule 1 – Multiple Card Play validation.
 * All cards in the array must share the same value AND each must individually
 * be a legal play.  Black (wild) cards cannot be multi-played.
 */
export function canPlayMultipleCards(
  cards: Card[],
  topCard: Card,
  activeColor: Color
): boolean {
  if (cards.length === 0) return false;
  if (cards.length === 1) return isValidPlay(cards[0], topCard, activeColor);

  // Wild / special black cards cannot be stacked with others in multi-play
  if (cards.some(c => c.color === 'black')) return false;

  const firstValue = cards[0].value;
  // All cards must share the same value
  if (!cards.every(c => c.value === firstValue)) return false;
  // At least the first card must be playable; rest match by value
  return isValidPlay(cards[0], topCard, activeColor);
}

// ─── Turn Helpers ─────────────────────────────────────────────────────────────

export function getNextPlayerIndex(
  currentIndex: number,
  direction: number,
  playerCount: number
): number {
  let next = (currentIndex + direction) % playerCount;
  if (next < 0) next += playerCount;
  return next;
}

/**
 * Rule 1 – Compute cumulative card effects for a batch of played cards.
 * Returns { drawPenalty, skipCount, reversed }.
 */
export function computeMultiCardEffect(cards: Card[]): {
  drawPenalty: number;  // Total cards the next player must draw
  skipCount: number;    // How many extra skips to apply
  reversed: boolean;    // Whether direction should flip
} {
  let drawPenalty = 0;
  let skipCount = 0;
  let reversed = false;

  for (const card of cards) {
    switch (card.value) {
      case 'draw2':
        drawPenalty += 2;
        skipCount += 1;  // draw2 also skips the victim
        break;
      case 'wild4':
        drawPenalty += 4;
        skipCount += 1;
        break;
      case 'skip':
        skipCount += 1;
        break;
      case 'reverse':
        reversed = !reversed; // Each reverse flips direction
        break;
      default:
        break;
    }
  }

  return { drawPenalty, skipCount, reversed };
}

// ─── Rule 4 Helper – Shuffle Hand ────────────────────────────────────────────

/**
 * Swap the entire hand of two players by index.
 * Mutates the players array in-place (operates on deep copies in GameContext).
 */
export function swapHands(players: Player[], indexA: number, indexB: number): Player[] {
  const updated = players.map(p => ({ ...p, hand: [...p.hand] }));
  const temp = updated[indexA].hand;
  updated[indexA].hand = updated[indexB].hand;
  updated[indexB].hand = temp;
  return updated;
}
