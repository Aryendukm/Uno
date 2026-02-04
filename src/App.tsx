import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';

const GameContainer: React.FC = () => {
  const { gameState } = useGame();

  if (gameState && gameState.status !== 'lobby') {
    return <GameTable />;
  }

  return <Lobby />;
};

export function App() {
  return (
    <GameProvider>
      <GameContainer />
    </GameProvider>
  );
}
