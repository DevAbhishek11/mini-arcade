import type {
  CheckersState,
  ConnectFourState,
  DotsState,
  GameId,
  GomokuState,
  HexState,
  MancalaState,
  PongState,
  ReversiState,
  Seat,
  SnakeState,
  TicTacToeState,
  UltimateTicTacToeState,
} from '@mini-arcade/shared';
import { CheckersBoard } from './CheckersBoard';
import { ConnectFourBoard } from './ConnectFourBoard';
import { DotsAndBoxesBoard } from './DotsAndBoxesBoard';
import { GomokuBoard } from './GomokuBoard';
import { HexBoard } from './HexBoard';
import { MancalaBoard } from './MancalaBoard';
import { PongCanvas } from './PongCanvas';
import { ReversiBoard } from './ReversiBoard';
import { SnakeDuelCanvas } from './SnakeDuelCanvas';
import { TicTacToeBoard } from './TicTacToeBoard';
import { UltimateTicTacToeBoard } from './UltimateTicTacToeBoard';

interface Props {
  gameId: GameId;
  state: unknown;
  /** Seat the board is rendered from. */
  seat: Seat;
  /** Whether the local player may act right now. */
  yourTurn: boolean;
  onAction: (action: unknown) => void;
}

/**
 * One switch, used by both the online match page and offline solo play, so a
 * new cabinet only ever needs wiring up in a single place.
 */
export function GameBoard({ gameId, state, seat, yourTurn, onAction }: Props) {
  switch (gameId) {
    case 'tic-tac-toe':
      return (
        <TicTacToeBoard
          state={state as TicTacToeState}
          seat={seat}
          yourTurn={yourTurn}
          onPlay={(index) => onAction({ type: 'place', index })}
        />
      );
    case 'connect-four':
      return (
        <ConnectFourBoard
          state={state as ConnectFourState}
          seat={seat}
          yourTurn={yourTurn}
          onPlay={(column) => onAction({ type: 'drop', column })}
        />
      );
    case 'gomoku':
      return (
        <GomokuBoard
          state={state as GomokuState}
          seat={seat}
          yourTurn={yourTurn}
          onPlay={(index) => onAction({ type: 'place', index })}
        />
      );
    case 'reversi':
      return (
        <ReversiBoard
          state={state as ReversiState}
          seat={seat}
          yourTurn={yourTurn}
          onPlay={(index) => onAction({ type: 'place', index })}
          onPass={() => onAction({ type: 'pass' })}
        />
      );
    case 'dots-and-boxes':
      return (
        <DotsAndBoxesBoard
          state={state as DotsState}
          seat={seat}
          yourTurn={yourTurn}
          onPlay={(edge) => onAction({ type: 'draw', edge })}
        />
      );
    case 'pong':
      return (
        <PongCanvas state={state as PongState} seat={seat} onInput={(dir) => onAction({ type: 'move', dir })} />
      );
    case 'snake-duel':
      return (
        <SnakeDuelCanvas
          state={state as SnakeState}
          seat={seat}
          onTurn={(dir) => onAction({ type: 'turn', dir })}
        />
      );
    case 'ultimate-tic-tac-toe':
      return (
        <UltimateTicTacToeBoard
          state={state as UltimateTicTacToeState}
          seat={seat}
          yourTurn={yourTurn}
          onPlay={(index) => onAction({ type: 'place', index })}
        />
      );
    case 'checkers':
      return (
        <CheckersBoard
          state={state as CheckersState}
          seat={seat}
          yourTurn={yourTurn}
          onPlay={(from, to) => onAction({ type: 'move', from, to })}
        />
      );
    case 'mancala':
      return (
        <MancalaBoard
          state={state as MancalaState}
          seat={seat}
          yourTurn={yourTurn}
          onPlay={(pit) => onAction({ type: 'sow', pit })}
        />
      );
    case 'hex':
      return (
        <HexBoard
          state={state as HexState}
          seat={seat}
          yourTurn={yourTurn}
          onPlay={(index) => onAction({ type: 'place', index })}
          onSwap={() => onAction({ type: 'swap' })}
        />
      );
    default:
      return null;
  }
}
