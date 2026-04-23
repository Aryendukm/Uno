import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { v4 as uuidv4 } from 'uuid';
import {
  GameState, Card, ChatMessage,
  createDeck, isValidPlay, canPlayMultipleCards,
  getNextPlayerIndex, computeMultiCardEffect,
  drawOneCard, drawCardsForPlayer, swapHands,
  Color, shuffleDeck,
} from '../utils/gameLogic';

// ─── Action Types ─────────────────────────────────────────────────────────────

type GameAction =
  | { type: 'JOIN'; payload: { name: string } }
  | { type: 'START_GAME' }
  /**
   * PLAY_CARDS (replaces PLAY_CARD) – plays one or more cards in a single turn.
   * For wild/shuffle cards, payload carries additional context.
   */
  | {
      type: 'PLAY_CARDS';
      payload: {
        cardIds: string[];
        chosenColor?: Color;
        // Rule 4 – Shuffle Hand choice
        shuffleAction?: 'swap_with' | 'swap_two';
        targetPlayerIds?: string[]; // 1 id for swap_with, 2 ids for swap_two
      };
    }
  /**
   * DRAW_CARD – the current player draws one card.
   * Used both for normal draw and when there is a pending +4 stack they must accept.
   */
  | { type: 'DRAW_CARD' }
  /**
   * Rule 3 – After drawing, player can play the drawn card immediately.
   * playDrawnCard=true means they want to play it; false means they pass.
   */
  | { type: 'PLAY_DRAWN_CARD'; payload: { play: boolean; chosenColor?: Color } }
  | { type: 'CHAT'; payload: { text: string } }
  | { type: 'APPLY_RULE'; payload: { rule: string } }
  | { type: 'SYNC_STATE'; payload: GameState }
  | { type: 'SYNC_CHAT'; payload: ChatMessage[] }
  | { type: 'ERROR'; payload: { message: string } };

// ─── Context Shape ────────────────────────────────────────────────────────────

interface GameContextType {
  gameState: GameState | null;
  chatMessages: ChatMessage[];
  myPlayerId: string;
  isHost: boolean;
  roomId: string | null;
  createGame: (name: string) => Promise<string>;
  joinGame: (roomId: string, name: string) => Promise<void>;
  startGame: () => void;
  /** Play one or more cards (multi-play). Supply chosenColor for wild cards. */
  playCards: (
    cardIds: string[],
    chosenColor?: Color,
    shuffleAction?: 'swap_with' | 'swap_two',
    targetPlayerIds?: string[]
  ) => void;
  /** Draw a card from the deck (or accept a +4 stack penalty). */
  drawCard: () => void;
  /** After drawing, decide whether to play the drawn card or pass. */
  playDrawnCard: (play: boolean, chosenColor?: Color) => void;
  sendMessage: (text: string) => void;
  applyRule: (rule: string) => void;
  error: string | null;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<{ [key: string]: DataConnection }>({});

  // Host-only canonical state lives in refs to avoid stale closures
  const hostStateRef = useRef<GameState | null>(null);
  const hostChatRef = useRef<ChatMessage[]>([]);

  // ── Peer setup ──────────────────────────────────────────────────────────────

  const initializePeer = useCallback(() => {
    const id = uuidv4();
    setMyPlayerId(id);
    const peer = new Peer(id, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ],
      },
    });
    peerRef.current = peer;

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'peer-unavailable') setError('Room not found. Please check the ID.');
      else if (err.type === 'disconnected') setError('Disconnected from server.');
      else setError('Connection error: ' + err.type);
    });

    return peer;
  }, []);

  // ── Broadcast helpers ───────────────────────────────────────────────────────

  const broadcastState = (state: GameState) => {
    Object.values(connectionsRef.current).forEach(conn =>
      conn.send({ type: 'SYNC_STATE', payload: state })
    );
    setGameState(state);
    hostStateRef.current = state;
  };

  const broadcastChat = (messages: ChatMessage[]) => {
    Object.values(connectionsRef.current).forEach(conn =>
      conn.send({ type: 'SYNC_CHAT', payload: messages })
    );
    setChatMessages(messages);
    hostChatRef.current = messages;
  };

  // ── Host Action Processor ───────────────────────────────────────────────────

  const handleHostAction = (action: GameAction, senderId: string) => {
    if (!hostStateRef.current) return;

    // Work on a deep copy of players so mutations are safe
    let s: GameState = {
      ...hostStateRef.current,
      players: hostStateRef.current.players.map(p => ({ ...p, hand: [...p.hand] })),
      deck: [...hostStateRef.current.deck],
      discardPile: [...hostStateRef.current.discardPile],
    };

    switch (action.type) {

      // ── JOIN ───────────────────────────────────────────────────────────────
      case 'JOIN': {
        if (s.status !== 'lobby') return;
        if (s.players.some(p => p.id === senderId)) return;
        s.players.push({ id: senderId, name: action.payload.name, hand: [], isHost: false, isReady: true });
        broadcastState(s);
        // Send chat history to the new player
        const conn = connectionsRef.current[senderId];
        if (conn) conn.send({ type: 'SYNC_CHAT', payload: hostChatRef.current });
        break;
      }

      // ── START_GAME ─────────────────────────────────────────────────────────
      case 'START_GAME': {
        if (senderId !== s.players[0].id) return;
        if (s.players.length < 2) return;

        const deck = createDeck();
        const players = s.players.map(p => ({ ...p, hand: [] as Card[] }));

        // Deal 7 cards to each player
        players.forEach(p => {
          for (let i = 0; i < 7; i++) {
            const card = deck.pop();
            if (card) p.hand.push(card);
          }
        });

        // Ensure first discard card is not a black/wild card
        let firstCard = deck.pop();
        while (firstCard && firstCard.color === 'black') {
          deck.unshift(firstCard); // Put it back at the bottom
          shuffleDeck(deck);
          firstCard = deck.pop();
        }

        const unoCalledBy: { [id: string]: boolean } = {};
        players.forEach(p => { unoCalledBy[p.id] = false; });

        s = {
          ...s,
          deck,
          discardPile: firstCard ? [firstCard] : [],
          players,
          status: 'playing',
          currentPlayerIndex: 0,
          direction: 1,
          currentColor: firstCard ? firstCard.color : 'red',
          winner: null,
          lastAction: 'Game Started',
          unoCalledBy,
          activeRule: null,
          pendingWild4Stack: 0,
          drawnCardId: null,
          pendingShuffleCardId: null,
        };
        broadcastState(s);
        break;
      }

      // ── PLAY_CARDS ─────────────────────────────────────────────────────────
      case 'PLAY_CARDS': {
        if (s.status !== 'playing') return;

        const playerIndex = s.players.findIndex(p => p.id === senderId);
        if (playerIndex !== s.currentPlayerIndex) return; // Not this player's turn

        const player = s.players[playerIndex];
        const { cardIds, chosenColor, shuffleAction, targetPlayerIds } = action.payload;

        // Locate all specified cards in the player's hand
        const cardsToPlay = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean) as Card[];
        if (cardsToPlay.length !== cardIds.length) return; // Some cards not found

        const topCard = s.discardPile[s.discardPile.length - 1];

        // ── Rule 5: If there is a pending +4 stack, only a +4 card may respond ──
        if (s.pendingWild4Stack > 0) {
          // The player must either play a wild4 to stack, or accept the penalty via DRAW_CARD
          const allWild4 = cardsToPlay.every(c => c.value === 'wild4');
          if (!allWild4 || cardsToPlay.length !== 1) return; // Must play exactly one +4 to stack
        } else {
          // ── Rule 1: Multi-card validation ───────────────────────────────────
          if (!canPlayMultipleCards(cardsToPlay, topCard, s.currentColor)) return;
        }

        // ── Remove played cards from player's hand ────────────────────────────
        const playedIds = new Set(cardIds);
        player.hand = player.hand.filter(c => !playedIds.has(c.id));

        // ── Move cards to discard pile ────────────────────────────────────────
        cardsToPlay.forEach(c => s.discardPile.push(c));

        // Update active color (wild cards let the player choose)
        const lastPlayed = cardsToPlay[cardsToPlay.length - 1];
        s.currentColor = lastPlayed.color === 'black'
          ? (chosenColor || 'red')
          : lastPlayed.color;

        const names = cardsToPlay.map(c => `${c.color} ${c.value}`).join(', ');
        s.lastAction = `${player.name} played: ${names}`;

        // ── Check Win ─────────────────────────────────────────────────────────
        if (player.hand.length === 0) {
          s.status = 'ended';
          s.winner = player.name;
          s.lastAction = `🎉 ${player.name} Won!`;
          broadcastState(s);
          return;
        }

        // Track UNO call (1 card left)
        if (player.hand.length === 1) {
          s.unoCalledBy[player.id] = true;
          s.lastAction += ' — UNO!';
        }

        // ── Compute cumulative effects (Rule 1 + Rule 5) ──────────────────────
        const isWild4Play = cardsToPlay.every(c => c.value === 'wild4');

        // Rule 5: Stack wild4 on existing penalty
        if (isWild4Play) {
          s.pendingWild4Stack += cardsToPlay.length * 4;
          s.lastAction += ` (+4 Stacked → total ${s.pendingWild4Stack} pending)`;
          // Advance turn without drawing; the next player must respond
          s.currentPlayerIndex = getNextPlayerIndex(s.currentPlayerIndex, s.direction, s.players.length);
          s.drawnCardId = null;
          broadcastState(s);
          return;
        }

        // Reset wild4 stack for non-wild4 plays
        s.pendingWild4Stack = 0;

        const { drawPenalty, skipCount, reversed } = computeMultiCardEffect(cardsToPlay);

        // Apply direction reversal
        if (reversed) {
          s.direction = s.direction === 1 ? -1 : 1;
          s.lastAction += ' (Reversed)';
        }

        // Determine base next player
        let nextIndex = getNextPlayerIndex(s.currentPlayerIndex, s.direction, s.players.length);

        // Apply draw penalty to the next player
        if (drawPenalty > 0) {
          s = drawCardsForPlayer(s, nextIndex, drawPenalty);
          s.lastAction += ` (${s.players[nextIndex].name} draws ${drawPenalty})`;
        }

        // Apply skip(s) — each skip advances the turn one more step
        for (let i = 0; i < skipCount; i++) {
          nextIndex = getNextPlayerIndex(nextIndex, s.direction, s.players.length);
        }

        // ── Rule 4: Shuffle Hand ──────────────────────────────────────────────
        if (lastPlayed.value === 'shuffle') {
          if (shuffleAction === 'swap_with' && targetPlayerIds?.length === 1) {
            const targetIdx = s.players.findIndex(p => p.id === targetPlayerIds[0]);
            if (targetIdx !== -1) {
              s.players = swapHands(s.players, playerIndex, targetIdx);
              s.lastAction += ` (Swapped hands with ${s.players[playerIndex].name})`;
            }
          } else if (shuffleAction === 'swap_two' && targetPlayerIds?.length === 2) {
            const idxA = s.players.findIndex(p => p.id === targetPlayerIds[0]);
            const idxB = s.players.findIndex(p => p.id === targetPlayerIds[1]);
            if (idxA !== -1 && idxB !== -1) {
              s.players = swapHands(s.players, idxA, idxB);
              s.lastAction += ` (Made ${s.players[idxA].name} and ${s.players[idxB].name} swap hands)`;
            }
          }
          // Turn order is NOT broken by shuffle hand
        }

        s.currentPlayerIndex = nextIndex;
        s.drawnCardId = null;
        broadcastState(s);
        break;
      }

      // ── DRAW_CARD ──────────────────────────────────────────────────────────
      case 'DRAW_CARD': {
        if (s.status !== 'playing') return;
        const pIdx = s.players.findIndex(p => p.id === senderId);
        if (pIdx !== s.currentPlayerIndex) return;

        const player = s.players[pIdx];

        // ── Rule 5: Accept the stacked +4 penalty ────────────────────────────
        if (s.pendingWild4Stack > 0) {
          const penalty = s.pendingWild4Stack;
          s = drawCardsForPlayer(s, pIdx, penalty);
          s.pendingWild4Stack = 0;
          s.lastAction = `${player.name} drew ${penalty} cards (Wild +4 stack)`;
          s.currentPlayerIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);
          s.drawnCardId = null;
          broadcastState(s);
          return;
        }

        // ── Rule 3: Normal draw ───────────────────────────────────────────────
        let drawnCard: Card | null;
        [s, drawnCard] = drawOneCard(s);

        if (drawnCard) {
          s.players[pIdx].hand.push(drawnCard);
          s.lastAction = `${player.name} drew a card`;
          // Rule 3: Expose the drawn card id so the UI can offer play-or-pass
          s.drawnCardId = drawnCard.id;
        } else {
          // No cards anywhere — pass turn silently
          s.lastAction = `${player.name} tried to draw (deck empty!)`;
          s.drawnCardId = null;
          s.currentPlayerIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);
        }

        broadcastState(s);
        break;
      }

      // ── PLAY_DRAWN_CARD ────────────────────────────────────────────────────
      case 'PLAY_DRAWN_CARD': {
        // Rule 3: After drawing, the player decides to play or skip
        if (s.status !== 'playing') return;
        const pIdx = s.players.findIndex(p => p.id === senderId);
        if (pIdx !== s.currentPlayerIndex) return;
        if (!s.drawnCardId) return; // No drawn card to play

        const player = s.players[pIdx];
        const { play, chosenColor } = action.payload;

        if (!play) {
          // Player chooses to pass — advance turn
          s.lastAction = `${player.name} passed (kept drawn card)`;
          s.drawnCardId = null;
          s.currentPlayerIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);
          broadcastState(s);
          return;
        }

        // Player wants to play the drawn card immediately
        const drawnCard = player.hand.find(c => c.id === s.drawnCardId);
        if (!drawnCard) return;

        const topCard = s.discardPile[s.discardPile.length - 1];
        if (!isValidPlay(drawnCard, topCard, s.currentColor)) {
          // Drawn card is not playable (shouldn't happen if UI validates, but guard anyway)
          s.lastAction = `${player.name} passed (drawn card not playable)`;
          s.drawnCardId = null;
          s.currentPlayerIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);
          broadcastState(s);
          return;
        }

        // Remove from hand, add to discard
        player.hand = player.hand.filter(c => c.id !== drawnCard.id);
        s.discardPile.push(drawnCard);
        s.currentColor = drawnCard.color === 'black' ? (chosenColor || 'red') : drawnCard.color;
        s.lastAction = `${player.name} played drawn card: ${drawnCard.color} ${drawnCard.value}`;
        s.drawnCardId = null;

        // Check win
        if (player.hand.length === 0) {
          s.status = 'ended';
          s.winner = player.name;
          s.lastAction = `🎉 ${player.name} Won!`;
          broadcastState(s);
          return;
        }

        if (player.hand.length === 1) {
          s.unoCalledBy[player.id] = true;
          s.lastAction += ' — UNO!';
        }

        // Apply the single drawn card's effect
        const { drawPenalty, skipCount, reversed } = computeMultiCardEffect([drawnCard]);
        if (reversed) s.direction = s.direction === 1 ? -1 : 1;

        let nextIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);
        if (drawPenalty > 0) {
          s = drawCardsForPlayer(s, nextIndex, drawPenalty);
        }
        for (let i = 0; i < skipCount; i++) {
          nextIndex = getNextPlayerIndex(nextIndex, s.direction, s.players.length);
        }

        // Handle wild4 stacking for the drawn card
        if (drawnCard.value === 'wild4') {
          s.pendingWild4Stack = 4;
        }

        s.currentPlayerIndex = nextIndex;
        broadcastState(s);
        break;
      }

      // ── CHAT ───────────────────────────────────────────────────────────────
      case 'CHAT': {
        const newMsg: ChatMessage = {
          id: uuidv4(),
          senderId,
          senderName: s.players.find(p => p.id === senderId)?.name ?? 'Unknown',
          text: action.payload.text,
          timestamp: Date.now(),
        };
        broadcastChat([...hostChatRef.current, newMsg]);
        break;
      }

      // ── APPLY_RULE (blank wild) ────────────────────────────────────────────
      case 'APPLY_RULE': {
        s.activeRule = action.payload.rule;
        s.lastAction = `Rule Activated: ${action.payload.rule}`;
        broadcastState(s);
        break;
      }

      default:
        break;
    }
  };

  // ── Public API ──────────────────────────────────────────────────────────────

  const createGame = async (name: string) => {
    const peer = initializePeer();
    return new Promise<string>((resolve) => {
      peer.on('open', (id) => {
        setIsHost(true);
        setRoomId(id);
        const initialState: GameState = {
          deck: [],
          discardPile: [],
          players: [{ id, name, hand: [], isHost: true, isReady: true }],
          currentPlayerIndex: 0,
          direction: 1,
          status: 'lobby',
          winner: null,
          currentColor: 'red',
          lastAction: null,
          unoCalledBy: {},
          activeRule: null,
          pendingWild4Stack: 0,
          drawnCardId: null,
          pendingShuffleCardId: null,
        };
        hostStateRef.current = initialState;
        setGameState(initialState);

        peer.on('connection', (conn) => {
          connectionsRef.current[conn.peer] = conn;
          conn.on('data', (data: any) => handleHostAction(data as GameAction, conn.peer));
          conn.on('close', () => { delete connectionsRef.current[conn.peer]; });
        });
        resolve(id);
      });
    });
  };

  const joinGame = async (hostId: string, name: string) => {
    const peer = initializePeer();
    return new Promise<void>((resolve, reject) => {
      peer.on('open', () => {
        setRoomId(hostId);
        const conn = peer.connect(hostId);
        conn.on('open', () => {
          connectionsRef.current[hostId] = conn;
          conn.send({ type: 'JOIN', payload: { name } });
          resolve();
        });
        conn.on('data', (data: any) => {
          const action = data as GameAction;
          if (action.type === 'SYNC_STATE') setGameState(action.payload);
          else if (action.type === 'SYNC_CHAT') setChatMessages(action.payload);
        });
        conn.on('error', reject);
        connectionsRef.current['HOST'] = conn;
      });
    });
  };

  const startGame = () => {
    if (isHost) handleHostAction({ type: 'START_GAME' }, myPlayerId);
  };

  const playCards = (
    cardIds: string[],
    chosenColor?: Color,
    shuffleAction?: 'swap_with' | 'swap_two',
    targetPlayerIds?: string[]
  ) => {
    const action: GameAction = {
      type: 'PLAY_CARDS',
      payload: { cardIds, chosenColor, shuffleAction, targetPlayerIds },
    };
    if (isHost) handleHostAction(action, myPlayerId);
    else connectionsRef.current['HOST']?.send(action);
  };

  const drawCard = () => {
    if (isHost) handleHostAction({ type: 'DRAW_CARD' }, myPlayerId);
    else connectionsRef.current['HOST']?.send({ type: 'DRAW_CARD' });
  };

  const playDrawnCard = (play: boolean, chosenColor?: Color) => {
    const action: GameAction = { type: 'PLAY_DRAWN_CARD', payload: { play, chosenColor } };
    if (isHost) handleHostAction(action, myPlayerId);
    else connectionsRef.current['HOST']?.send(action);
  };

  const sendMessage = (text: string) => {
    const action: GameAction = { type: 'CHAT', payload: { text } };
    if (isHost) handleHostAction(action, myPlayerId);
    else connectionsRef.current['HOST']?.send(action);
  };

  const applyRule = (rule: string) => {
    const action: GameAction = { type: 'APPLY_RULE', payload: { rule } };
    if (isHost) handleHostAction(action, myPlayerId);
    else connectionsRef.current['HOST']?.send(action);
  };

  return (
    <GameContext.Provider
      value={{
        gameState,
        chatMessages,
        myPlayerId,
        isHost,
        roomId,
        createGame,
        joinGame,
        startGame,
        playCards,
        drawCard,
        playDrawnCard,
        sendMessage,
        applyRule,
        error,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};
