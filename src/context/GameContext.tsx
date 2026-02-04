import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import { v4 as uuidv4 } from 'uuid';
import { 
  GameState, Card, ChatMessage, createDeck, isValidPlay, 
  getNextPlayerIndex, Color, shuffleDeck
} from '../utils/gameLogic';

type GameAction = 
  | { type: 'JOIN'; payload: { name: string } }
  | { type: 'START_GAME' }
  | { type: 'PLAY_CARD'; payload: { cardId: string; chosenColor?: Color } }
  | { type: 'DRAW_CARD' }
  | { type: 'CHAT'; payload: { text: string } }
  | { type: 'SYNC_STATE'; payload: GameState }
  | { type: 'SYNC_CHAT'; payload: ChatMessage[] }
  | { type: 'ERROR'; payload: { message: string } };

interface GameContextType {
  gameState: GameState | null;
  chatMessages: ChatMessage[];
  myPlayerId: string;
  isHost: boolean;
  roomId: string | null;
  createGame: (name: string) => Promise<string>;
  joinGame: (roomId: string, name: string) => Promise<void>;
  startGame: () => void;
  playCard: (cardId: string, chosenColor?: Color) => void;
  drawCard: () => void;
  sendMessage: (text: string) => void;
  error: string | null;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<{ [key: string]: DataConnection }>({});
  
  // Host-only state
  const hostStateRef = useRef<GameState | null>(null);
  const hostChatRef = useRef<ChatMessage[]>([]);

  // Initialize Peer
  const initializePeer = useCallback(() => {
    const id = uuidv4();
    setMyPlayerId(id);
    // Explicitly configure STUN servers for better Internet reliability
    const peer = new Peer(id, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });
    peerRef.current = peer;
    
    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'peer-unavailable') {
         setError('Room not found. Please check the ID.');
      } else if (err.type === 'disconnected') {
         setError('Disconnected from server.');
      } else {
         setError('Connection error: ' + err.type);
      }
    });

    return peer;
  }, []);

  const broadcastState = (state: GameState) => {
    Object.values(connectionsRef.current).forEach(conn => {
      conn.send({ type: 'SYNC_STATE', payload: state });
    });
    setGameState(state);
    hostStateRef.current = state;
  };

  const broadcastChat = (messages: ChatMessage[]) => {
    Object.values(connectionsRef.current).forEach(conn => {
      conn.send({ type: 'SYNC_CHAT', payload: messages });
    });
    setChatMessages(messages);
    hostChatRef.current = messages;
  };

  // Host Logic: Process Actions
  const handleHostAction = (action: GameAction, senderId: string) => {
    if (!hostStateRef.current) return;
    
    let newState = { ...hostStateRef.current };
    
    switch (action.type) {
      case 'JOIN':
        if (newState.status !== 'lobby') return; // Cannot join if game started
        if (newState.players.some(p => p.id === senderId)) return; // Already joined
        newState.players.push({
            id: senderId,
            name: action.payload.name,
            hand: [],
            isHost: false,
            isReady: true
        });
        broadcastState(newState);
        // Send chat history to new player
        const conn = connectionsRef.current[senderId];
        if (conn) conn.send({ type: 'SYNC_CHAT', payload: hostChatRef.current });
        break;

      case 'START_GAME':
        if (senderId !== newState.players[0].id) return; // Only host can start
        if (newState.players.length < 2) return; // Need at least 2 players
        
        const deck = createDeck();
        const players = newState.players.map(p => ({ ...p, hand: [] as Card[] }));
        
        // Deal 7 cards
        players.forEach(p => {
            for (let i = 0; i < 7; i++) {
                const card = deck.pop();
                if (card) p.hand.push(card);
            }
        });

        // Start discard pile
        let firstCard = deck.pop();
        while (firstCard && firstCard.color === 'black') {
             // If first card is Wild, put it back and reshuffle (simple rule variation)
             deck.push(firstCard);
             shuffleDeck(deck);
             firstCard = deck.pop();
        }
        
        newState = {
            ...newState,
            deck,
            discardPile: firstCard ? [firstCard] : [],
            players,
            status: 'playing',
            currentPlayerIndex: 0,
            direction: 1,
            currentColor: firstCard ? firstCard.color : 'red', // Fallback
            winner: null,
            lastAction: 'Game Started'
        };
        broadcastState(newState);
        break;

      case 'PLAY_CARD': {
        if (newState.status !== 'playing') return;
        const playerIndex = newState.players.findIndex(p => p.id === senderId);
        if (playerIndex !== newState.currentPlayerIndex) return; // Not turn

        const player = newState.players[playerIndex];
        const cardIndex = player.hand.findIndex(c => c.id === action.payload.cardId);
        if (cardIndex === -1) return; // Card not in hand

        const card = player.hand[cardIndex];
        const topCard = newState.discardPile[newState.discardPile.length - 1];

        if (!isValidPlay(card, topCard, newState.currentColor)) return;

        // Execute Play
        player.hand.splice(cardIndex, 1);
        newState.discardPile.push(card);
        newState.currentColor = card.color === 'black' ? (action.payload.chosenColor || 'red') : card.color;
        newState.lastAction = `${player.name} played ${card.color} ${card.value}`;

        // Check Win
        if (player.hand.length === 0) {
            newState.status = 'ended';
            newState.winner = player.name;
            newState.lastAction = `${player.name} Won!`;
            broadcastState(newState);
            return;
        }

        // Handle Special Cards
        let nextIndex = getNextPlayerIndex(newState.currentPlayerIndex, newState.direction, newState.players.length);
        
        if (card.value === 'skip') {
             nextIndex = getNextPlayerIndex(nextIndex, newState.direction, newState.players.length);
             newState.lastAction += ' (Skipped)';
        } else if (card.value === 'reverse') {
            if (newState.players.length === 2) {
                // Reverse acts like skip in 2 player
                nextIndex = getNextPlayerIndex(nextIndex, newState.direction, newState.players.length);
            } else {
                newState.direction *= -1;
                // Re-calculate next index with new direction from CURRENT player
                nextIndex = getNextPlayerIndex(newState.currentPlayerIndex, newState.direction, newState.players.length);
            }
            newState.lastAction += ' (Reversed)';
        } else if (card.value === 'draw2') {
             const victim = newState.players[nextIndex];
             for(let i=0; i<2; i++) {
                 const c = newState.deck.pop();
                 if(c) victim.hand.push(c);
                 else {
                     // Reshuffle discard if empty deck (simplified: just ignore for now or implement reshuffle)
                 }
             }
             nextIndex = getNextPlayerIndex(nextIndex, newState.direction, newState.players.length); // Victim skips turn
             newState.lastAction += ' (Draw 2)';
        } else if (card.value === 'wild4') {
             const victim = newState.players[nextIndex];
             for(let i=0; i<4; i++) {
                 const c = newState.deck.pop();
                 if(c) victim.hand.push(c);
             }
             nextIndex = getNextPlayerIndex(nextIndex, newState.direction, newState.players.length); // Victim skips turn
             newState.lastAction += ' (Wild Draw 4)';
        }

        newState.currentPlayerIndex = nextIndex;
        broadcastState(newState);
        break;
      }

      case 'DRAW_CARD': {
        if (newState.status !== 'playing') return;
        const pIndex = newState.players.findIndex(p => p.id === senderId);
        if (pIndex !== newState.currentPlayerIndex) return;

        const p = newState.players[pIndex];
        const drawnCard = newState.deck.pop();
        
        if (drawnCard) {
            p.hand.push(drawnCard);
            newState.lastAction = `${p.name} drew a card`;
            // Check if playable immediately? Uno rules vary. Let's say turn passes for simplicity or allow play.
            // Standard Uno: if playable, can play. Here: simplest implementation -> Turn passes.
            newState.currentPlayerIndex = getNextPlayerIndex(newState.currentPlayerIndex, newState.direction, newState.players.length);
        } else {
            // Deck empty, reshuffle discard into deck
            if (newState.discardPile.length > 1) {
                const top = newState.discardPile.pop();
                const newDeck = shuffleDeck(newState.discardPile);
                newState.deck = newDeck;
                newState.discardPile = top ? [top] : [];
                
                // Try draw again
                const retryCard = newState.deck.pop();
                if (retryCard) {
                    p.hand.push(retryCard);
                    newState.currentPlayerIndex = getNextPlayerIndex(newState.currentPlayerIndex, newState.direction, newState.players.length);
                    newState.lastAction = `${p.name} drew a card (Reshuffled)`;
                }
            } else {
                newState.lastAction = "Deck empty!";
                newState.currentPlayerIndex = getNextPlayerIndex(newState.currentPlayerIndex, newState.direction, newState.players.length);
            }
        }
        broadcastState(newState);
        break;
      }

      case 'CHAT': {
        const newMsg: ChatMessage = {
            id: uuidv4(),
            senderId: senderId,
            senderName: newState.players.find(p => p.id === senderId)?.name || 'Unknown',
            text: action.payload.text,
            timestamp: Date.now()
        };
        const newChat = [...hostChatRef.current, newMsg];
        broadcastChat(newChat);
        break;
      }
    }
  };

  const createGame = async (name: string) => {
    const peer = initializePeer();
    return new Promise<string>((resolve) => {
        peer.on('open', (id) => {
            setIsHost(true);
            setRoomId(id);
            const initialState: GameState = {
                deck: [],
                discardPile: [],
                players: [{
                    id: id,
                    name: name,
                    hand: [],
                    isHost: true,
                    isReady: true
                }],
                currentPlayerIndex: 0,
                direction: 1,
                status: 'lobby',
                winner: null,
                currentColor: 'red',
                lastAction: null
            };
            hostStateRef.current = initialState;
            setGameState(initialState);
            
            peer.on('connection', (conn) => {
                connectionsRef.current[conn.peer] = conn;
                conn.on('data', (data: any) => {
                    handleHostAction(data as GameAction, conn.peer);
                });
                conn.on('close', () => {
                    delete connectionsRef.current[conn.peer];
                    // Handle disconnect logic if needed (remove player)
                });
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
                if (action.type === 'SYNC_STATE') {
                    setGameState(action.payload);
                } else if (action.type === 'SYNC_CHAT') {
                    setChatMessages(action.payload);
                }
            });
            conn.on('error', (err) => {
                reject(err);
            });
            // Send connection to ref
            connectionsRef.current['HOST'] = conn; 
        });
    });
  };

  const startGame = () => {
    if (isHost) {
        handleHostAction({ type: 'START_GAME' }, myPlayerId);
    }
  };

  const playCard = (cardId: string, chosenColor?: Color) => {
    if (isHost) {
        handleHostAction({ type: 'PLAY_CARD', payload: { cardId, chosenColor } }, myPlayerId);
    } else {
        connectionsRef.current['HOST']?.send({ type: 'PLAY_CARD', payload: { cardId, chosenColor } });
    }
  };

  const drawCard = () => {
     if (isHost) {
        handleHostAction({ type: 'DRAW_CARD' }, myPlayerId);
     } else {
        connectionsRef.current['HOST']?.send({ type: 'DRAW_CARD' });
     }
  };

  const sendMessage = (text: string) => {
    if (isHost) {
        handleHostAction({ type: 'CHAT', payload: { text } }, myPlayerId);
    } else {
        connectionsRef.current['HOST']?.send({ type: 'CHAT', payload: { text } });
    }
  };

  return (
    <GameContext.Provider value={{
        gameState,
        chatMessages,
        myPlayerId,
        isHost,
        roomId,
        createGame,
        joinGame,
        startGame,
        playCard,
        drawCard,
        sendMessage,
        error
    }}>
      {children}
    </GameContext.Provider>
  );
};
