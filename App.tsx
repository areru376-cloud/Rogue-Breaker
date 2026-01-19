
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameStatus, Vector2, Block, Item, Ball } from './types';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  GRID_COLS, 
  GRID_ROWS, 
  BLOCK_SIZE, 
  BLOCK_PADDING, 
  BALL_RADIUS, 
  BALL_SPEED, 
  FIRE_INTERVAL,
  PLAYER_Y 
} from './constants';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [ballCount, setBallCount] = useState(1);
  const [status, setStatus] = useState<GameStatus>(GameStatus.HOME);
  const [bestScore, setBestScore] = useState(() => {
    return parseInt(localStorage.getItem('bestScore') || '0', 10);
  });

  // Game Engine Refs
  const ballsRef = useRef<Ball[]>([]);
  const blocksRef = useRef<Block[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const playerPosRef = useRef<number>(CANVAS_WIDTH / 2);
  const dragStartRef = useRef<Vector2 | null>(null);
  const dragCurrentRef = useRef<Vector2 | null>(null);
  const firingVectorRef = useRef<Vector2 | null>(null);
  const nextBallPosRef = useRef<number>(CANVAS_WIDTH / 2);
  
  const ballsToFireThisTurnRef = useRef(0);
  const ballsFiredCountRef = useRef(0);
  const lastFireTimeRef = useRef(0);
  const isFirstBallReturnedRef = useRef(false);
  const turnStartTimeRef = useRef(0);
  const [isSpeedUp, setIsSpeedUp] = useState(false);
  
  // Mobile specific: Screen shake
  const shakeRef = useRef(0);

  // Updated triggerVibrate to support number arrays for vibration patterns
  const triggerVibrate = (pattern: number | number[]) => {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  };

  const createParticles = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 1.0,
        color,
        size: Math.random() * 3 + 1
      });
    }
  };

  const spawnBlocks = useCallback((currentLevel: number, currentBallCount: number): boolean => {
    // 境界チェック: GRID_ROWS - 1 行目にブロックが到達したらゲームオーバー
    if (blocksRef.current.some(b => b.gridY >= GRID_ROWS - 2)) {
      setStatus(GameStatus.GAMEOVER);
      triggerVibrate([100, 50, 100]);
      return false;
    }

    const newBlocks: Block[] = [];
    const newItems: Item[] = [];
    const itemIdx = Math.floor(Math.random() * GRID_COLS);
    
    newItems.push({
      id: Math.random().toString(36).substr(2, 9),
      gridX: itemIdx,
      gridY: 0,
      type: 'ADD_BALL'
    });

    const spawnProbability = Math.min(0.8, 0.45 + currentLevel / 100);

    for (let x = 0; x < GRID_COLS; x++) {
      if (x === itemIdx) continue;
      if (Math.random() < spawnProbability) {
        const hpValue = currentBallCount + 1;
        newBlocks.push({
          id: Math.random().toString(36).substr(2, 9),
          gridX: x,
          gridY: 0,
          hp: hpValue,
          maxHp: hpValue
        });
      }
    }
    
    blocksRef.current.forEach(b => b.gridY++);
    itemsRef.current.forEach(i => i.gridY++);
    blocksRef.current = [...blocksRef.current, ...newBlocks];
    itemsRef.current = [...itemsRef.current, ...newItems];
    return true;
  }, []);

  const initGame = () => {
    setScore(0);
    setLevel(1);
    setBallCount(1);
    blocksRef.current = [];
    itemsRef.current = [];
    ballsRef.current = [];
    particlesRef.current = [];
    playerPosRef.current = CANVAS_WIDTH / 2;
    nextBallPosRef.current = CANVAS_WIDTH / 2;
    spawnBlocks(1, 1);
    setStatus(GameStatus.AIMING);
    setIsSpeedUp(false);
  };

  useEffect(() => {
    if (status === GameStatus.START) initGame();
  }, [status]);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem('bestScore', score.toString());
    }
  }, [score, bestScore]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const update = (timestamp: number) => {
      if (status === GameStatus.HOME) {
        render();
        animationId = requestAnimationFrame(update);
        return;
      }

      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
      });
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);

      if (shakeRef.current > 0) shakeRef.current *= 0.9;

      if (status === GameStatus.FIRING) {
        if (ballsFiredCountRef.current < ballsToFireThisTurnRef.current) {
          if (timestamp - lastFireTimeRef.current > FIRE_INTERVAL) {
            if (firingVectorRef.current) {
              ballsRef.current.push({
                x: playerPosRef.current,
                y: PLAYER_Y,
                vx: firingVectorRef.current.x,
                vy: firingVectorRef.current.y,
                active: true,
                returning: false
              });
              ballsFiredCountRef.current++;
              lastFireTimeRef.current = timestamp;
            }
          }
        }
        if (ballsFiredCountRef.current >= ballsToFireThisTurnRef.current) {
          setStatus(GameStatus.BOUNCING);
          turnStartTimeRef.current = timestamp;
        }
      }

      if (status === GameStatus.BOUNCING || status === GameStatus.FIRING) {
        const timeInTurn = timestamp - turnStartTimeRef.current;
        const autoSpeedUp = timeInTurn > 10000; 
        const currentSpeedMultiplier = (isSpeedUp || autoSpeedUp) ? 3.0 : 1.0;
        const steps = (isSpeedUp || autoSpeedUp) ? 3 : 1;

        for (let s = 0; s < steps; s++) {
          ballsRef.current.forEach(ball => {
            if (!ball.active || ball.returning) return;

            ball.x += (ball.vx / steps) * (currentSpeedMultiplier > 1 ? currentSpeedMultiplier/steps : 1);
            ball.y += (ball.vy / steps) * (currentSpeedMultiplier > 1 ? currentSpeedMultiplier/steps : 1);

            if (Math.abs(ball.vy) < 0.5) ball.vy += ball.vy >= 0 ? 0.2 : -0.2;

            if (ball.x < BALL_RADIUS) { ball.x = BALL_RADIUS; ball.vx = Math.abs(ball.vx); }
            else if (ball.x > CANVAS_WIDTH - BALL_RADIUS) { ball.x = CANVAS_WIDTH - BALL_RADIUS; ball.vx = -Math.abs(ball.vx); }
            if (ball.y < BALL_RADIUS) { ball.y = BALL_RADIUS; ball.vy = Math.abs(ball.vy); }

            itemsRef.current = itemsRef.current.filter(item => {
              const ix = item.gridX * BLOCK_SIZE + BLOCK_SIZE / 2;
              const iy = item.gridY * BLOCK_SIZE + BLOCK_SIZE / 2;
              const dist = Math.hypot(ball.x - ix, ball.y - iy);
              if (dist < BALL_RADIUS + BLOCK_SIZE / 3) {
                setBallCount(prev => prev + 1);
                createParticles(ix, iy, '#00ffcc', 10);
                triggerVibrate(10);
                return false;
              }
              return true;
            });

            for (const block of blocksRef.current) {
              const bx = block.gridX * BLOCK_SIZE + BLOCK_PADDING;
              const by = block.gridY * BLOCK_SIZE + BLOCK_PADDING;
              const bw = BLOCK_SIZE - BLOCK_PADDING * 2;
              const bh = BLOCK_SIZE - BLOCK_PADDING * 2;

              const closestX = Math.max(bx, Math.min(ball.x, bx + bw));
              const closestY = Math.max(by, Math.min(ball.y, by + bh));
              const distanceX = ball.x - closestX;
              const distanceY = ball.y - closestY;
              const distSq = (distanceX * distanceX) + (distanceY * distanceY);

              if (distSq < (BALL_RADIUS * BALL_RADIUS)) {
                block.hp--;
                setScore(prev => prev + 1);
                shakeRef.current = 2;
                
                const hue = (180 + block.hp * 5) % 360;
                createParticles(ball.x, ball.y, `hsl(${hue}, 80%, 60%)`, block.hp <= 0 ? 15 : 3);
                if (block.hp <= 0) triggerVibrate(15);

                if (closestX === bx || closestX === bx + bw) {
                   if (closestY === by || closestY === by + bh) {
                      const nx = ball.x - closestX, ny = ball.y - closestY;
                      const len = Math.sqrt(nx * nx + ny * ny);
                      if (len > 0) {
                        const d = (ball.vx * nx/len + ball.vy * ny/len);
                        ball.vx -= 2 * d * nx/len; ball.vy -= 2 * d * ny/len;
                      }
                   } else { ball.vx *= -1; }
                } else { ball.vy *= -1; }
                ball.x += ball.vx * 0.1; ball.y += ball.vy * 0.1;
                break; 
              }
            }
            blocksRef.current = blocksRef.current.filter(b => b.hp > 0);

            if (ball.y > PLAYER_Y) {
              if (!isFirstBallReturnedRef.current) {
                nextBallPosRef.current = Math.max(BALL_RADIUS, Math.min(CANVAS_WIDTH - BALL_RADIUS, ball.x));
                isFirstBallReturnedRef.current = true;
              }
              ball.returning = true; ball.active = false; ball.y = PLAYER_Y;
            }
          });
        }

        const allDone = ballsRef.current.every(b => !b.active);
        if (allDone && ballsFiredCountRef.current >= ballsToFireThisTurnRef.current) {
          setStatus(GameStatus.NEXT_TURN);
        }
      }

      if (status === GameStatus.NEXT_TURN) {
        playerPosRef.current = nextBallPosRef.current;
        isFirstBallReturnedRef.current = false;
        ballsFiredCountRef.current = 0;
        ballsRef.current = [];
        firingVectorRef.current = null;
        setIsSpeedUp(false);
        const nextLv = level + 1;
        setLevel(nextLv);
        if (spawnBlocks(nextLv, ballCount)) setStatus(GameStatus.AIMING);
      }

      render();
      animationId = requestAnimationFrame(update);
    };

    const render = () => {
      ctx.save();
      if (shakeRef.current > 0.1) {
        ctx.translate((Math.random() - 0.5) * shakeRef.current, (Math.random() - 0.5) * shakeRef.current);
      }

      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (status === GameStatus.HOME) {
        ctx.restore();
        return;
      }

      // デッドラインの描画 (境界線)
      const deadLineY = (GRID_ROWS - 1) * BLOCK_SIZE;
      ctx.beginPath();
      ctx.setLineDash([10, 10]);
      ctx.strokeStyle = 'rgba(255, 0, 50, 0.6)';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'red';
      ctx.moveTo(0, deadLineY);
      ctx.lineTo(CANVAS_WIDTH, deadLineY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // グリッド線の描画
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      for (let i = 0; i <= GRID_COLS; i++) {
        ctx.beginPath(); ctx.moveTo(i * BLOCK_SIZE, 0); ctx.lineTo(i * BLOCK_SIZE, CANVAS_HEIGHT); ctx.stroke();
      }

      blocksRef.current.forEach(b => {
        const x = b.gridX * BLOCK_SIZE + BLOCK_PADDING, y = b.gridY * BLOCK_SIZE + BLOCK_PADDING;
        const size = BLOCK_SIZE - BLOCK_PADDING * 2;
        const hue = (180 + b.hp * 5) % 360; 
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
        ctx.shadowBlur = Math.min(15, 5 + b.hp / 2); ctx.shadowColor = `hsl(${hue}, 80%, 50%)`;
        ctx.fillRect(x, y, size, size); ctx.shadowBlur = 0;
        ctx.fillStyle = 'white';
        const fontSize = b.hp > 99 ? 14 : 18;
        ctx.font = `bold ${fontSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.hp.toString(), x + size / 2, y + size / 2);
      });

      itemsRef.current.forEach(item => {
        const x = item.gridX * BLOCK_SIZE + BLOCK_SIZE / 2, y = item.gridY * BLOCK_SIZE + BLOCK_SIZE / 2;
        ctx.beginPath(); ctx.arc(x, y, BLOCK_SIZE / 4, 0, Math.PI * 2); ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#00ffcc'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', x, y);
      });

      particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      });
      ctx.globalAlpha = 1.0;

      ctx.fillStyle = '#fff'; ctx.shadowBlur = 12; ctx.shadowColor = '#fff';
      ctx.beginPath(); ctx.arc(playerPosRef.current, PLAYER_Y, 9, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

      if (status === GameStatus.AIMING && dragStartRef.current && dragCurrentRef.current) {
        const dx = dragStartRef.current.x - dragCurrentRef.current.x, dy = dragStartRef.current.y - dragCurrentRef.current.y;
        if (dy < -20) {
          const angle = Math.atan2(dy, dx);
          ctx.setLineDash([8, 12]); ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(playerPosRef.current, PLAYER_Y);
          ctx.lineTo(playerPosRef.current + Math.cos(angle) * 400, PLAYER_Y + Math.sin(angle) * 400);
          ctx.stroke(); ctx.setLineDash([]);
        }
      }

      ballsRef.current.forEach(ball => {
        if (!ball.active && !ball.returning) return;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2); ctx.fill();
      });

      if (status === GameStatus.AIMING) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`x${ballCount}`, playerPosRef.current, PLAYER_Y + 30);
      }
      ctx.restore();
    };

    animationId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationId);
  }, [status, ballCount, level, spawnBlocks, score, bestScore, isSpeedUp]);

  const getEventPos = (e: React.MouseEvent | React.TouchEvent): Vector2 => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (status !== GameStatus.AIMING) return;
    dragStartRef.current = getEventPos(e);
    dragCurrentRef.current = dragStartRef.current;
  };
  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragStartRef.current) return;
    dragCurrentRef.current = getEventPos(e);
  };
  const handleMouseUp = () => {
    if (!dragStartRef.current || !dragCurrentRef.current) return;
    const dx = dragStartRef.current.x - dragCurrentRef.current.x, dy = dragStartRef.current.y - dragCurrentRef.current.y;
    if (dy < -20) {
      let angle = Math.atan2(dy, dx);
      if (angle > -0.15) angle = -0.15;
      if (angle < -Math.PI + 0.15) angle = -Math.PI + 0.15;
      firingVectorRef.current = { x: Math.cos(angle) * BALL_SPEED, y: Math.sin(angle) * BALL_SPEED };
      ballsToFireThisTurnRef.current = ballCount;
      ballsFiredCountRef.current = 0;
      ballsRef.current = [];
      setStatus(GameStatus.FIRING);
      lastFireTimeRef.current = performance.now();
      turnStartTimeRef.current = performance.now();
      triggerVibrate(20);
    }
    dragStartRef.current = null; dragCurrentRef.current = null;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black font-sans text-white select-none overflow-hidden touch-none">
      {status !== GameStatus.HOME && (
        <div className="flex justify-between w-full max-w-[400px] p-6 absolute top-0 z-10 bg-gradient-to-b from-black to-transparent">
          <div className="bg-black/40 backdrop-blur-sm p-2 rounded-xl">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Score</p>
            <p className="text-3xl font-black tabular-nums leading-none">{score}</p>
          </div>
          <div className="text-right bg-black/40 backdrop-blur-sm p-2 rounded-xl">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Best</p>
            <p className="text-3xl font-black text-amber-400 tabular-nums leading-none">{bestScore}</p>
          </div>
        </div>
      )}

      <div className="relative shadow-[0_0_50px_rgba(59,130,246,0.15)] rounded-2xl overflow-hidden border border-white/5 bg-[#050505] w-full max-w-[400px]">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-auto max-h-[90vh] block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        />

        {status === GameStatus.HOME && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-30 p-8 text-center backdrop-blur-lg">
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-full px-8 flex justify-between items-start">
               <div className="text-left">
                  <p className="text-[10px] text-blue-400 font-black tracking-widest uppercase opacity-70">Global Records</p>
                  <p className="text-2xl font-black text-white">{bestScore}</p>
               </div>
               <div className="text-right">
                  <p className="text-[10px] text-gray-500 font-black tracking-tighter uppercase opacity-70">Build</p>
                  <p className="text-xs font-mono text-gray-400">v2.1.0</p>
               </div>
            </div>

            <h1 className="text-5xl sm:text-6xl font-black italic tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 leading-none py-2 px-2">
              NEON<br/>ROGUE<br/>BREAKER
            </h1>
            <p className="text-gray-400 text-xs mb-10 uppercase tracking-[0.4em] font-bold">High Stakes Physics Rogue</p>
            
            <div className="space-y-4 mb-12 text-left w-full bg-white/5 p-6 rounded-[32px] border border-white/10">
              <div className="flex items-center gap-4">
                <div className="bg-blue-500/20 text-blue-400 text-[12px] font-black w-8 h-8 rounded-2xl flex items-center justify-center">1</div>
                <p className="text-sm text-gray-200">下に引っ張って狙い、離して射撃</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-purple-500/20 text-purple-400 text-[12px] font-black w-8 h-8 rounded-2xl flex items-center justify-center">2</div>
                <p className="text-sm text-gray-200">赤ライン到達でゲームオーバー</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-[#00ffcc]/20 text-[#00ffcc] text-[12px] font-black w-8 h-8 rounded-2xl flex items-center justify-center">+</div>
                <p className="text-sm text-gray-200">「<span className="text-[#00ffcc] font-bold">+</span>」で火力を強化せよ</p>
              </div>
            </div>

            <button
              onClick={() => { setStatus(GameStatus.START); triggerVibrate(30); }}
              className="w-full py-6 bg-gradient-to-br from-blue-600 to-purple-700 text-white font-black text-2xl rounded-[32px] hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-blue-500/40 uppercase tracking-widest"
            >
              Start Mission
            </button>
            
            <p className="mt-8 text-[9px] text-gray-700 font-black tracking-[0.3em] uppercase">Sector-9 Tactical Interface Active</p>
          </div>
        )}

        {(status === GameStatus.BOUNCING || status === GameStatus.FIRING) && (
           <button 
             onClick={() => { setIsSpeedUp(!isSpeedUp); triggerVibrate(10); }}
             className={`absolute bottom-24 right-6 px-6 py-4 rounded-[24px] font-black text-sm uppercase tracking-widest transition-all ${isSpeedUp ? 'bg-amber-500 text-black scale-110 shadow-[0_0_20px_rgba(245,158,11,0.5)]' : 'bg-white/10 text-gray-400 backdrop-blur-md border border-white/10'}`}
           >
             {isSpeedUp ? '⚡ Fast' : 'Speed Up'}
           </button>
        )}

        {status === GameStatus.GAMEOVER && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-40 backdrop-blur-3xl p-8">
            <h1 className="text-5xl sm:text-6xl font-black text-red-600 mb-2 italic tracking-tighter drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]">TERMINATED</h1>
            <div className="bg-white/5 p-10 rounded-[48px] border border-white/10 w-full max-w-xs text-center mb-10">
               <p className="text-xs text-gray-500 uppercase tracking-widest mb-2 font-bold">Final Score</p>
               <p className="text-7xl font-black text-white leading-tight">{score}</p>
               <div className="mt-8 pt-6 border-t border-white/10 flex justify-between items-center">
                 <p className="text-xs text-amber-500 font-black tracking-widest">BEST</p>
                 <p className="text-2xl font-black text-amber-400">{bestScore}</p>
               </div>
            </div>
            <button
              onClick={() => { setStatus(GameStatus.START); triggerVibrate(30); }}
              className="w-full py-6 bg-white text-black font-black text-2xl rounded-[32px] active:scale-95 transition-all uppercase tracking-widest shadow-2xl"
            >
              Reboot
            </button>
            <button
              onClick={() => setStatus(GameStatus.HOME)}
              className="mt-8 text-gray-600 hover:text-white uppercase tracking-widest text-xs font-bold p-2"
            >
              Main Menu
            </button>
          </div>
        )}

        {status === GameStatus.AIMING && score === 0 && level === 1 && !dragStartRef.current && (
          <div className="absolute bottom-48 left-1/2 -translate-x-1/2 text-center pointer-events-none w-full px-4">
            <div className="animate-bounce inline-block">
              <p className="text-blue-400 uppercase tracking-[0.4em] text-xs font-black mb-4">Drag down to aim</p>
              <div className="w-1 h-20 bg-gradient-to-t from-blue-400/80 to-transparent mx-auto rounded-full"></div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 text-center px-4 opacity-40">
        <p className="text-[10px] text-gray-500 uppercase tracking-[0.6em] font-black">Engine v2.1.0 • No Gap Matrix</p>
      </div>
    </div>
  );
};

export default App;
