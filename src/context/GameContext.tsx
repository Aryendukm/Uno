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
   * PLAY_CARDS – plays one or more cards in a single turn.
   * For wild/shuffle cards, payload carries additional context.
   */
  | {
      type: 'PLAY_CARDS';
      payload: {
        cardIds: string[];
        chosenColor?: Color;
        // Rule 4 – Shuffle Hand
        shuffleAction?: 'swap_with' | 'swap_two';
        targetPlayerIds?: string[];
      };
    }
  /**
   * DRAW_CARD – current player draws one card, or accepts a pending +4 stack penalty.
   */
  | { type: 'DRAW_CARD' }
  /**
   * Rule 3 – After drawing, player decides to play the drawn card or pass.
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
  playCards: (
    cardIds: string[],
    chosenColor?: Color,
    shuffleAction?: 'swap_with' | 'swap_two',
    targetPlayerIds?: string[]
  ) => void;
  drawCard: () => void;
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

  // Host-only canonical state in refs to avoid stale closures
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
        const conn = connectionsRef.current[senderId];
        if (conn) conn.send({ type: 'SYNC_CHAT', payload: hostChatRef.current });
        break;
      }

      // ── START_GAME ─────────────────────────────────────────────────────────
      case 'START_GAME': {
        if (senderId !== s.players[0].id) return;
        if (s.players.length < 2) return;

        let deck = createDeck();
        const players = s.players.map(p => ({ ...p, hand: [] as Card[] }));

        // Deal 7 cards to each player
        players.forEach(p => {
          for (let i = 0; i < 7; i++) {
            const card = deck.pop();
            if (card) p.hand.push(card);
          }
        });

        // FIX: Ensure first discard is not a black/wild card.
        // Previously, shuffleDeck result was discarded in the while loop —
        // the deck was never actually reshuffled between attempts.
        let firstCard = deck.pop();
        while (firstCard && firstCard.color === 'black') {
          deck.push(firstCard);         // Return the black card to the deck
          deck = shuffleDeck(deck);     // FIX: re-assign the shuffled result
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
        const cardsToPlay = cardIds
          .map(id => player.hand.find(c => c.id === id))
          .filter(Boolean) as Card[];
        if (cardsToPlay.length !== cardIds.length) return; // Card(s) not found in hand

        const topCard = s.discardPile[s.discardPile.length - 1];

        // ── Rule 5: Pending +4 stack – only a single wild4 may respond ──────
        if (s.pendingWild4Stack > 0) {
          // The player must play exactly one wild4 to stack, or accept via DRAW_CARD
          const allWild4 = cardsToPlay.every(c => c.value === 'wild4');
          if (!allWild4 || cardsToPlay.length !== 1) return;
        } else {
          // ── Rule 1: Multi-card validation ───────────────────────────────
          if (!canPlayMultipleCards(cardsToPlay, topCard, s.currentColor)) return;
        }

        // Remove played cards from hand
        const playedIds = new Set(cardIds);
        player.hand = player.hand.filter(c => !playedIds.has(c.id));

        // Move cards to top of discard pile
        cardsToPlay.forEach(c => s.discardPile.push(c));

        const lastPlayed = cardsToPlay[cardsToPlay.length - 1];

        // FIX: Always apply chosenColor for wild cards, even when stacking +4.
        // Previously, wild4 stacking early-returned before setting currentColor,
        // leaving the color unchanged from the previous turn.
        s.currentColor = lastPlayed.color === 'black'
          ? (chosenColor ?? 'red')
          : lastPlayed.color;

        const names = cardsToPlay.map(c => `${c.color} ${c.value}`).join(', ');
        s.lastAction = `${player.name} played: ${names}`;

        // ── Check Win ──────────────────────────────────────────────────────
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

        // ── Rule 5: Stack wild4 onto existing penalty ──────────────────────
        const isWild4Play = cardsToPlay.every(c => c.value === 'wild4');
        if (isWild4Play) {
          s.pendingWild4Stack += cardsToPlay.length * 4;
          s.lastAction += ` (+4 Stacked → total ${s.pendingWild4Stack} pending)`;
          // Advance turn — next player must respond or accept the stack
          s.currentPlayerIndex = getNextPlayerIndex(s.currentPlayerIndex, s.direction, s.players.length);
          s.drawnCardId = null;
          broadcastState(s);
          return;
        }

        // Reset stack for all non-wild4 plays
        s.pendingWild4Stack = 0;

        const { drawPenalty, skipTurns, reversed } = computeMultiCardEffect(cardsToPlay);

        if (reversed) {
          s.direction = s.direction === 1 ? -1 : 1;
          s.lastAction += ' (Reversed)';
        }

        // Start at the player immediately after the current one
        let nextIndex = getNextPlayerIndex(s.currentPlayerIndex, s.direction, s.players.length);

        // Apply draw penalty to the immediate next player (the "victim")
        if (drawPenalty > 0) {
          s = drawCardsForPlayer(s, nextIndex, drawPenalty);
          s.lastAction += ` (${s.players[nextIndex].name} draws ${drawPenalty})`;
          // The victim is always skipped exactly once after drawing
          nextIndex = getNextPlayerIndex(nextIndex, s.direction, s.players.length);
        }

        // Apply any extra skips from skip cards (each skips one more player)
        for (let i = 0; i < skipTurns; i++) {
          nextIndex = getNextPlayerIndex(nextIndex, s.direction, s.players.length);
        }

        // ── Rule 4: Shuffle Hand ───────────────────────────────────────────
        if (lastPlayed.value === 'shuffle') {
          if (shuffleAction === 'swap_with' && targetPlayerIds?.length === 1) {
            const targetIdx = s.players.findIndex(p => p.id === targetPlayerIds[0]);
            if (targetIdx !== -1) {
              // Capture names BEFORE the swap for accurate log message
              const myName = s.players[playerIndex].name;
              const theirName = s.players[targetIdx].name;
              s.players = swapHands(s.players, playerIndex, targetIdx);
              s.lastAction += ` (${myName} swapped hands with ${theirName})`;
            }
          } else if (shuffleAction === 'swap_two' && targetPlayerIds?.length === 2) {
            const idxA = s.players.findIndex(p => p.id === targetPlayerIds[0]);
            const idxB = s.players.findIndex(p => p.id === targetPlayerIds[1]);
            if (idxA !== -1 && idxB !== -1) {
              // FIX: Capture names before swap; after swap the hand contents
              // are exchanged but the player objects (including names) stay in
              // their index positions, so names are still accurate post-swap.
              const nameA = s.players[idxA].name;
              const nameB = s.players[idxB].name;
              s.players = swapHands(s.players, idxA, idxB);
              s.lastAction += ` (${nameA} and ${nameB} swapped hands)`;
            }
          }
          // Turn order is NOT affected by a Shuffle Hand play
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

        // ── Rule 5: Accept the stacked +4 penalty ──────────────────────────
        if (s.pendingWild4Stack > 0) {
          const penalty = s.pendingWild4Stack;
          s = drawCardsForPlayer(s, pIdx, penalty);
          s.pendingWild4Stack = 0;
          s.lastAction = `${player.name} drew ${penalty} cards (Wild +4 stack accepted)`;
          s.currentPlayerIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);
          s.drawnCardId = null;
          broadcastState(s);
          return;
        }

        // ── Rule 3: Normal draw ────────────────────────────────────────────
        let drawnCard: Card | null;
        [s, drawnCard] = drawOneCard(s);

        if (drawnCard) {
          s.players[pIdx].hand.push(drawnCard);
          s.lastAction = `${player.name} drew a card`;
          // Expose drawn card id so UI can offer play-or-pass (Rule 3)
          s.drawnCardId = drawnCard.id;
        } else {
          // Deck truly empty (even after reshuffle attempt) — pass turn
          s.lastAction = `${player.name} tried to draw (deck empty!)`;
          s.drawnCardId = null;
          s.currentPlayerIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);
        }

        broadcastState(s);
        break;
      }

      // ── PLAY_DRAWN_CARD ────────────────────────────────────────────────────
      case 'PLAY_DRAWN_CARD': {
        if (s.status !== 'playing') return;
        const pIdx = s.players.findIndex(p => p.id === senderId);
        if (pIdx !== s.currentPlayerIndex) return;
        if (!s.drawnCardId) return; // No drawn card pending

        const player = s.players[pIdx];
        const { play, chosenColor } = action.payload;

        if (!play) {
          // Player passes — advance turn without playing
          s.lastAction = `${player.name} passed (kept drawn card)`;
          s.drawnCardId = null;
          s.currentPlayerIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);
          broadcastState(s);
          return;
        }

        const drawnCard = player.hand.find(c => c.id === s.drawnCardId);
        if (!drawnCard) return;

        const topCard = s.discardPile[s.discardPile.length - 1];
        if (!isValidPlay(drawnCard, topCard, s.currentColor)) {
          // Drawn card turned out not playable — pass turn
          s.lastAction = `${player.name} passed (drawn card not playable)`;
          s.drawnCardId = null;
          s.currentPlayerIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);
          broadcastState(s);
          return;
        }

        // Play the drawn card: remove from hand and add to discard
        player.hand = player.hand.filter(c => c.id !== drawnCard.id);
        s.discardPile.push(drawnCard);
        s.currentColor = drawnCard.color === 'black' ? (chosenColor ?? 'red') : drawnCard.color;
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

        // ── FIX: wild4 drawn card initiates a NEW pending stack ────────────
        // Previously, computeMultiCardEffect was also called for wild4 which
        // produced a double-penalty (immediate draw + pending stack).
        // wild4 is now handled exclusively via pendingWild4Stack.
        if (drawnCard.value === 'wild4') {
          s.pendingWild4Stack = 4; // Start a fresh stack for the next player
          s.lastAction += ` (+4 Stacked → total 4 pending)`;
          s.currentPlayerIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);
          broadcastState(s);
          return;
        }

        // For all non-wild4 cards, compute and apply their effect normally
        const { drawPenalty, skipTurns, reversed } = computeMultiCardEffect([drawnCard]);
        if (reversed) s.direction = s.direction === 1 ? -1 : 1;

        let nextIndex = getNextPlayerIndex(pIdx, s.direction, s.players.length);

        if (drawPenalty > 0) {
          s = drawCardsForPlayer(s, nextIndex, drawPenalty);
          s.lastAction += ` (${s.players[nextIndex].name} draws ${drawPenalty})`;
          // Skip the victim after they draw
          nextIndex = getNextPlayerIndex(nextIndex, s.direction, s.players.length);
        }

        for (let i = 0; i < skipTurns; i++) {
          nextIndex = getNextPlayerIndex(nextIndex, s.direction, s.players.length);
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
