/**
 * Boxing Arena v5 - Ultimate Stability
 * 
 * FIXES:
 * - Robust hand mapping (handles any number of hands)
 * - Safe canvas drawing (fallback for roundRect)
 * - Improved Hit Logic (wider detection for hook/block)
 */
import { sound } from "../sounds.js";

export class GameInstance {
    constructor(canvas, gameState) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameState = gameState;
        this.isRunning = false;
        this.score = 0;
        this.combo = 0;
        this.health = 100;
        this.hitEffects = [];
        this.video = null;

        this.currentPad = null;
        this.isGuarding = false;

        // Persistent hand storage for smoothing
        this.hands = new Map(); // id -> {x, y, type, trail}

        this.sequence = ['left', 'right', 'left', 'right', 'hook', 'right', 'block', 'left'];
        this.seqIndex = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.parentNode.getBoundingClientRect();
        this.canvas.width  = rect.width;
        this.canvas.height = rect.height;
    }

    get slideSpeed() { return 3.5 + Math.floor(this.score / 20) * 1.0; }
    get holdFrames() { return Math.max(40, 110 - Math.floor(this.score / 10) * 10); }

    start() {
        this.isRunning = true;
        this.score = 0;
        this.combo = 0;
        this.health = 100;
        this.currentPad = null;
        this.seqIndex = 0;
        this.video = document.getElementById('webcam-video');
        this.updateScore(0);
        this.spawnNextPad();
        this.loop();
        sound.play('select');
    }

    spawnNextPad() {
        if (!this.isRunning) return;
        const type = this.sequence[this.seqIndex % this.sequence.length];
        this.seqIndex++;

        const W = this.canvas.width;
        const H = this.canvas.height;
        let startX, startY, endX, endY;

        if (type === 'left') {
            startX = -200; startY = H * 0.45;
            endX = W * 0.25; endY = H * 0.45;
        } else if (type === 'right') {
            startX = W + 200; startY = H * 0.45;
            endX = W * 0.75; endY = H * 0.45;
        } else if (type === 'hook') {
            startX = W * 0.5; startY = -200;
            endX = W * 0.5;   endY = H * 0.35;
        } else if (type === 'block') {
            startX = W * 0.5; startY = H * 0.1;
            endX = W * 0.5;   endY = H * 0.5;
        }

        this.currentPad = {
            type, x: startX, y: startY, endX, endY,
            width: 140, height: 160,
            phase: 'entering', holdTimer: 0, hit: false, scale: 1, alpha: 1,
        };
    }

    isFist(hand) {
        const tips = [8, 12, 16, 20];
        const pips = [6, 10, 14, 18];
        let curled = 0;
        for (let i = 0; i < 4; i++) {
            if (hand[tips[i]].y > hand[pips[i]].y) curled++;
        }
        return curled >= 3;
    }

    getFistCenter(hand) {
        const knuckles = [5, 9, 13, 17];
        const avgX = knuckles.reduce((s, i) => s + hand[i].x, 0) / 4;
        const avgY = knuckles.reduce((s, i) => s + hand[i].y, 0) / 4;
        return {
            x: (1 - avgX) * this.canvas.width,
            y: avgY * this.canvas.height
        };
    }

    update() {
        if (!this.isRunning) return;

        const results = this.gameState.results;
        const landmarks = results?.landmarks || [];
        
        // Update hands with smoothing
        const currentIds = new Set();
        landmarks.forEach((landmark, i) => {
            const id = i; // Simplified hand tracking
            currentIds.add(id);
            const pos = this.getFistCenter(landmark);
            const type = this.isFist(landmark) ? 'fist' : 'palm';

            if (!this.hands.has(id)) {
                this.hands.set(id, { x: pos.x, y: pos.y, type, trail: [] });
            } else {
                const h = this.hands.get(id);
                h.x += (pos.x - h.x) * 0.5;
                h.y += (pos.y - h.y) * 0.5;
                h.type = type;
            }
            const h = this.hands.get(id);
            h.trail.push({ x: h.x, y: h.y });
            if (h.trail.length > 6) h.trail.shift();
        });

        // Cleanup missing hands
        for (const id of this.hands.keys()) {
            if (!currentIds.has(id)) {
                const h = this.hands.get(id);
                if (h.trail.length > 0) h.trail.shift();
                else this.hands.delete(id);
            }
        }

        // Guard Check
        if (this.hands.size >= 2) {
            const hArray = Array.from(this.hands.values());
            const d = Math.hypot(hArray[0].x - hArray[1].x, hArray[0].y - hArray[1].y);
            this.isGuarding = d < 200 && hArray[0].y < this.canvas.height * 0.7;
        } else {
            this.isGuarding = false;
        }

        const pad = this.currentPad;
        if (pad) {
            if (pad.phase === 'entering') {
                const dx = pad.endX - pad.x, dy = pad.endY - pad.y;
                const d = Math.hypot(dx, dy);
                if (d < this.slideSpeed + 5) {
                    pad.x = pad.endX; pad.y = pad.endY;
                    pad.phase = 'hold'; pad.scale = 1.3;
                } else {
                    pad.x += (dx / d) * this.slideSpeed;
                    pad.y += (dy / d) * this.slideSpeed;
                }
            } else if (pad.phase === 'hold') {
                pad.scale += (1 - pad.scale) * 0.2;
                pad.holdTimer++;

                if (pad.type === 'block') {
                    if (this.isGuarding) this.registerHit(pad, 'BLOCK!', '#00ff88');
                } else {
                    for (const h of this.hands.values()) {
                        if (h.type !== 'fist') continue;
                        if (Math.hypot(h.x - pad.x, h.y - pad.y) < pad.width * 0.8) {
                            this.registerHit(pad, pad.type.toUpperCase() + '!', '#00f2ff');
                            break;
                        }
                    }
                }

                if (pad.holdTimer > this.holdFrames && !pad.hit) {
                    this.health -= 20;
                    this.combo = 0;
                    this.hitEffects.push({ x: pad.x, y: pad.y, text: 'MISS!', life: 40, color: '#ff3e3e' });
                    sound.play('crash');
                    if (this.health <= 0) this.gameOver();
                    else pad.phase = 'exiting';
                }
            } else if (pad.phase === 'exiting') {
                pad.alpha -= 0.1;
                if (pad.alpha <= 0) {
                    this.currentPad = null;
                    setTimeout(() => { if (this.isRunning) this.spawnNextPad(); }, 400);
                }
            }
        }

        // Age effects
        this.hitEffects.forEach((fx, i) => {
            fx.life--;
            if (fx.life <= 0) this.hitEffects.splice(i, 1);
        });
    }

    registerHit(pad, text, color) {
        if (pad.hit) return;
        pad.hit = true;
        pad.phase = 'exiting';
        this.combo++;
        this.score += 10 * (this.combo > 2 ? 2 : 1);
        this.updateScore(this.score);
        this.hitEffects.push({ x: pad.x, y: pad.y - 40, text, life: 50, color });
        sound.play('point');
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.video && this.video.readyState >= 2) {
            this.ctx.save();
            this.ctx.translate(this.canvas.width, 0); this.ctx.scale(-1, 1);
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
        }
        
        this.ctx.fillStyle = this.isGuarding ? 'rgba(0,242,255,0.15)' : 'rgba(0,0,0,0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.currentPad) this.drawPad(this.currentPad);

        for (const h of this.hands.values()) {
            this.ctx.shadowBlur = h.type === 'fist' ? 20 : 5;
            this.ctx.shadowColor = h.type === 'fist' ? '#ff3e3e' : '#ffffff';
            this.ctx.strokeStyle = this.ctx.shadowColor;
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.arc(h.x, h.y, h.type === 'fist' ? 45 : 30, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.shadowBlur = 0;
        }

        this.drawHUD();

        this.hitEffects.forEach(fx => {
            this.ctx.save();
            this.ctx.globalAlpha = fx.life / 50;
            this.ctx.fillStyle = fx.color;
            this.ctx.font = 'bold 24px Orbitron';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(fx.text, fx.x, fx.y);
            this.ctx.restore();
        });
        this.ctx.globalAlpha = 1.0;
    }

    drawPad(pad) {
        this.ctx.save();
        this.ctx.globalAlpha = pad.alpha;
        this.ctx.translate(pad.x, pad.y);
        this.ctx.scale(pad.scale, pad.scale);

        const color = { left: '#00f2ff', right: '#bc13fe', hook: '#ffa500', block: '#ff3e3e' }[pad.type];
        this.ctx.strokeStyle = color;
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = color;
        this.ctx.lineWidth = 5;
        
        // Manual rounded rect fallback
        this.ctx.beginPath();
        const w = pad.width, h = pad.height, r = 15;
        this.ctx.moveTo(-w/2+r, -h/2);
        this.ctx.lineTo(w/2-r, -h/2);
        this.ctx.quadraticCurveTo(w/2, -h/2, w/2, -h/2+r);
        this.ctx.lineTo(w/2, h/2-r);
        this.ctx.quadraticCurveTo(w/2, h/2, w/2-r, h/2);
        this.ctx.lineTo(-w/2+r, h/2);
        this.ctx.quadraticCurveTo(-w/2, h/2, -w/2, h/2-r);
        this.ctx.lineTo(-w/2, -h/2+r);
        this.ctx.quadraticCurveTo(-w/2, -h/2, -w/2+r, -h/2);
        this.ctx.stroke();
        this.ctx.fillStyle = color + '11';
        this.ctx.fill();

        const pct = 1 - pad.holdTimer / this.holdFrames;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 45, -Math.PI/2, -Math.PI/2 + (pct * Math.PI * 2));
        this.ctx.stroke();

        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(pad.type.toUpperCase(), 0, 5);
        this.ctx.restore();
    }

    drawHUD() {
        this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
        this.ctx.fillRect(20, 20, 200, 10);
        this.ctx.fillStyle = this.health > 40 ? '#00ff88' : '#ff3e3e';
        this.ctx.fillRect(20, 20, this.health * 2, 10);
        
        if (this.currentPad?.phase === 'hold') {
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 20px Orbitron';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(this.currentPad.type === 'block' ? "GUARD!" : "PUNCH!", this.canvas.width/2, this.canvas.height - 40);
        }
    }

    updateScore(s) { document.getElementById('game-score').textContent = s; }

    gameOver() {
        this.isRunning = false;
        sound.play('crash');
        if (this.onGameOver) this.onGameOver(this.score);
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('game-over-overlay').classList.remove('hidden');
    }

    destroy() { this.isRunning = false; }
}
