/**
 * Boxing Arena v4 - Robust Detection & Smoothing
 * 
 * FIXES:
 * - Hands disappearing during fast punches (Added position smoothing)
 * - Improved Fist detection (Distance based + Y check)
 * - Added a "Trail" effect for fists during punches
 * - Fixed Hook hit zone to be even more forgiving
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
        this.frameCount = 0;
        this.hitEffects = [];
        this.video = null;

        this.currentPad = null;
        this.isGuarding = false;

        // Smoothing for hands
        this.smoothHands = [
            { x: 0, y: 0, active: false, type: 'fist', trail: [] },
            { x: 0, y: 0, active: false, type: 'fist', trail: [] }
        ];

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

    get slideSpeed() { return 3.5 + Math.floor(this.score / 20) * 0.8; }
    get holdFrames() { return Math.max(45, 100 - Math.floor(this.score / 12) * 8); }

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
            startX = -150; startY = H * 0.45;
            endX = W * 0.25; endY = H * 0.45;
        } else if (type === 'right') {
            startX = W + 150; startY = H * 0.45;
            endX = W * 0.75; endY = H * 0.45;
        } else if (type === 'hook') {
            startX = W * 0.5; startY = -150;
            endX = W * 0.5;   endY = H * 0.35; // Forgiving Hook zone
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

    // More robust fist detection: Tip must be close to Knuckle or PIP
    isFist(hand) {
        const fingerIndices = [8, 12, 16, 20];
        const pipIndices = [6, 10, 14, 18];
        const knuckleIndices = [5, 9, 13, 17];
        
        // Count how many fingers are "curled"
        let curled = 0;
        for (let i = 0; i < 4; i++) {
            const tip = hand[fingerIndices[i]];
            const pip = hand[pipIndices[i]];
            const knu = hand[knuckleIndices[i]];
            
            // If tip is below PIP or very close to knuckle, it's curled
            if (tip.y > pip.y || Math.hypot(tip.x - knu.x, tip.y - knu.y) < 0.06) {
                curled++;
            }
        }
        return curled >= 3; // 3 or 4 fingers curled = fist
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
        this.frameCount++;

        const results = this.gameState.results;
        const landmarks = results?.landmarks || [];
        
        // Update Smooth Hands
        this.smoothHands.forEach((sh, i) => {
            if (landmarks[i]) {
                const fc = this.getFistCenter(landmarks[i]);
                const fist = this.isFist(landmarks[i]);
                
                if (!sh.active) { sh.x = fc.x; sh.y = fc.y; sh.active = true; }
                else {
                    // Smooth follow
                    sh.x += (fc.x - sh.x) * 0.4;
                    sh.y += (fc.y - sh.y) * 0.4;
                }
                sh.type = fist ? 'fist' : 'palm';
                
                // Add to trail
                sh.trail.push({ x: sh.x, y: sh.y, life: 10 });
                if (sh.trail.length > 8) sh.trail.shift();
            } else {
                // Decay trail
                if (sh.trail.length > 0) sh.trail.shift();
                else sh.active = false;
            }
        });

        this.isGuarding = landmarks.length >= 2 && 
            Math.hypot(this.smoothHands[0].x - this.smoothHands[1].x, this.smoothHands[0].y - this.smoothHands[1].y) < 180 &&
            this.smoothHands[0].y < this.canvas.height * 0.7;

        const pad = this.currentPad;
        if (pad) {
            if (pad.phase === 'entering') {
                const dx = pad.endX - pad.x, dy = pad.endY - pad.y;
                const dist = Math.hypot(dx, dy);
                if (dist < this.slideSpeed + 2) {
                    pad.x = pad.endX; pad.y = pad.endY;
                    pad.phase = 'hold'; pad.scale = 1.3;
                } else {
                    pad.x += (dx / dist) * this.slideSpeed;
                    pad.y += (dy / dist) * this.slideSpeed;
                }
            } else if (pad.phase === 'hold') {
                pad.scale += (1 - pad.scale) * 0.2;
                pad.holdTimer++;

                if (pad.type === 'block') {
                    if (this.isGuarding) this.registerHit(pad, 'BLOCK!', '#00ff88');
                } else {
                    this.smoothHands.forEach(sh => {
                        if (!sh.active || sh.type !== 'fist') return;
                        const dist = Math.hypot(sh.x - pad.x, sh.y - pad.y);
                        const hitRange = pad.width * 0.75;
                        if (dist < hitRange) this.registerHit(pad, pad.type.toUpperCase() + '!', '#00f2ff');
                    });
                }

                if (pad.holdTimer > this.holdFrames && !pad.hit) {
                    this.health -= 20; this.combo = 0;
                    this.hitEffects.push({ x: pad.x, y: pad.y, text: 'MISS! -20HP', life: 45, color: '#ff3e3e' });
                    sound.play('crash');
                    if (this.health <= 0) { this.health = 0; this.gameOver(); return; }
                    pad.phase = 'exiting';
                }
            } else if (pad.phase === 'exiting') {
                pad.alpha -= 0.1; pad.scale += 0.05;
                if (pad.alpha <= 0) {
                    this.currentPad = null;
                    setTimeout(() => { if (this.isRunning) this.spawnNextPad(); }, 500);
                }
            }
        }

        // Hit effects
        for (let i = this.hitEffects.length - 1; i >= 0; i--) {
            this.hitEffects[i].life--;
            if (this.hitEffects[i].life <= 0) this.hitEffects.splice(i, 1);
        }
    }

    registerHit(pad, text, color) {
        if (pad.hit) return;
        pad.hit = true;
        pad.phase = 'exiting';
        this.combo++;
        const pts = 15 * (this.combo > 3 ? 2 : 1);
        this.score += pts;
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
        
        // Background Tint
        this.ctx.fillStyle = this.isGuarding ? 'rgba(0,242,255,0.15)' : 'rgba(0,0,0,0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.currentPad) this.drawPad(this.currentPad);

        // Draw Smooth Hands with Trails
        this.smoothHands.forEach(sh => {
            if (!sh.active && sh.trail.length === 0) return;
            
            // Draw Trail
            sh.trail.forEach((t, i) => {
                this.ctx.globalAlpha = (i / sh.trail.length) * 0.4;
                this.ctx.fillStyle = sh.type === 'fist' ? '#ff3e3e' : '#00f2ff';
                this.ctx.beginPath();
                this.ctx.arc(t.x, t.y, 25 + i * 2, 0, Math.PI * 2);
                this.ctx.fill();
            });
            this.ctx.globalAlpha = 1.0;

            if (sh.active) {
                const color = this.isGuarding ? '#00f2ff' : (sh.type === 'fist' ? '#ff3e3e' : '#ffffff');
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = color;
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 4;
                this.ctx.beginPath();
                this.ctx.arc(sh.x, sh.y, sh.type === 'fist' ? 45 : 30, 0, Math.PI * 2);
                this.ctx.stroke();
                if (sh.type === 'fist') {
                    this.ctx.fillStyle = color + '22';
                    this.ctx.fill();
                }
                this.ctx.shadowBlur = 0;
            }
        });

        // HUD & Instructions
        this.drawHUD();
        
        // Hit Effects
        this.hitEffects.forEach(fx => {
            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, fx.life / 50);
            this.ctx.fillStyle = fx.color;
            this.ctx.shadowBlur = 10; this.ctx.shadowColor = fx.color;
            this.ctx.font = 'bold 28px Orbitron';
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
        this.ctx.shadowBlur = 30; this.ctx.shadowColor = color;
        this.ctx.strokeStyle = color; this.ctx.lineWidth = 6;
        
        this.ctx.beginPath();
        if (pad.type === 'block') {
            this.ctx.moveTo(-60, -60); this.ctx.lineTo(60, -60);
            this.ctx.lineTo(40, 60); this.ctx.lineTo(-40, 60);
            this.ctx.closePath();
        } else {
            this.ctx.roundRect(-pad.width/2, -pad.height/2, pad.width, pad.height, 12);
        }
        this.ctx.stroke();
        this.ctx.fillStyle = `${color}22`; this.ctx.fill();

        // Timer
        const pct = 1 - pad.holdTimer / this.holdFrames;
        this.ctx.lineWidth = 8;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 40, -Math.PI/2, -Math.PI/2 + (pct * Math.PI * 2));
        this.ctx.stroke();

        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(pad.type.toUpperCase(), 0, 5);
        this.ctx.restore();
    }

    drawHUD() {
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(20, 20, 200, 15);
        this.ctx.fillStyle = this.health > 40 ? '#00ff88' : '#ff3e3e';
        this.ctx.fillRect(20, 20, this.health * 2, 15);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Orbitron';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`HP: ${this.health}`, 20, 50);
        
        if (this.currentPad?.phase === 'hold') {
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 24px Orbitron';
            this.ctx.textAlign = 'center';
            const tip = this.currentPad.type === 'block' ? "🛡️ HANDS TOGETHER!" : "PUNCH!";
            this.ctx.fillText(tip, this.canvas.width/2, this.canvas.height - 60);
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
