
export enum GameStatus {
  HOME = 'HOME',
  START = 'START',
  AIMING = 'AIMING',
  FIRING = 'FIRING',
  BOUNCING = 'BOUNCING',
  NEXT_TURN = 'NEXT_TURN',
  GAMEOVER = 'GAMEOVER'
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Block {
  id: string;
  gridX: number;
  gridY: number;
  hp: number;
  maxHp: number;
}

export interface Item {
  id: string;
  gridX: number;
  gridY: number;
  type: 'ADD_BALL';
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  returning: boolean;
}
