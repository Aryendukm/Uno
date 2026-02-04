
export type Color = 'red' | 'blue' | 'green' | 'yellow' | 'black';
export type Value = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

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
  direction: 1 | -1; // 1 for clockwise, -1 for counter-clockwise
  status: 'lobby' | 'playing' | 'ended';
  winner: string | null;
  currentColor: Color; // For wild cards mainly
  lastAction: string | null;
}

import { v4 as uuidv4 } from 'uuid';

export const COLORS: Color[] = ['red', 'blue', 'green', 'yellow'];
export const VALUES: Value[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  
  COLORS.forEach(color => {
    // One 0
    deck.push({ id: uuidv4(), color, value: '0' });
    
    // Two of each 1-9 and special cards
    for (let i = 0; i < 2; i++) {
      VALUES.slice(1).forEach(value => {
        deck.push({ id: uuidv4(), color, value });
      });
    }
  });

  // 4 Wild and 4 Wild Draw 4
  for (let i = 0; i < 4; i++) {
    deck.push({ id: uuidv4(), color: 'black', value: 'wild' });
    deck.push({ id: uuidv4(), color: 'black', value: 'wild4' });
  }

  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
  return [...deck].sort(() => Math.random() - 0.5);
}

export function isValidPlay(card: Card, topCard: Card, activeColor: Color): boolean {
  if (card.color === 'black') return true; // Wild cards
  if (card.color === activeColor) return true; // Color match
  if (card.value === topCard.value) return true; // Value match
  return false;
}

export function getNextPlayerIndex(currentIndex: number, direction: number, playerCount: number): number {
  let nextIndex = (currentIndex + direction) % playerCount;
  if (nextIndex < 0) nextIndex += playerCount;
  return nextIndex;
}
