/**
 * Boxing Arena v3 - With Guard & Block System
 * 
 * UPDATES:
 * - Added GUARD gesture (both fists close together near face)
 * - Removed HEAD DODGE in favor of GUARD/BLOCK
 * - Improved HOOK hit zone (lower and wider)
 * - Enhanced fist visibility
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
            // Lowered endY for Hook so it's easier to hit (was 0.28, now 0.35)
            endX = W * 0.5;   endY = H * 0.35;
        } else if (type === 'block') {
            startX = W * 0.5; startY = H * 0.1;
            endX = W * 0.5;   endY = H * 0.5;
        }

        this.currentPad = {
            type,
            x: startX, y: startY,
            endX, endY,
            width: 130, height: 150,
            phase: 'entering',
            holdTimer: 0,
            hit: false,
            scale: 1,
            alpha: 1,
        };
    }

    isFist(hand) {
        const pairs = [[8,6],[12,10],[16,14],[20,18]];
        return pairs.every(([tip, pip]) => hand[tip].y > hand[pip].y);
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

    checkGuard(landmarks) {
        if (landmarks.length < 2) return false;
        
        const f1 = this.getFistCenter(landmarks[0]);
        const f2 = this.getFistCenter(landmarks[1]);
        
        const dist = Math.hypot(f1.x - f2.x, f1.y - f2.y);
        // If fists are close and in the upper half of the screen
        return dist < 180 && f1.y < this.canvas.height * 0.6 && f2.y < this.canvas.height * 0.6;
    }

    update() {
        if (!this.isRunning) return;
        this.frameCount++;

        const results = this.gameState.results;
        const landmarks = results?.landmarks || [];
        
        // Update Guard state
        this.isGuarding = this.checkGuard(landmarks);

        const pad = this.currentPad;
        if (pad) {
            if (pad.phase === 'entering') {
                const dx = pad.endX - pad.x;
                const dy = pad.endY - pad.y;
                const dist = Math.hypot(dx, dy);
                if (dist < this.slideSpeed + 2) {
                    pad.x = pad.endX; pad.y = pad.endY;
                    pad.phase = 'hold';
                    pad.scale = 1.3;
                } else {
                    pad.x += (dx / dist) * this.slideSpeed;
                    pad.y += (dy / dist) * this.slideSpeed;
                }
            } else if (pad.phase === 'hold') {
                pad.scale += (1 - pad.scale) * 0.2;
                pad.holdTimer++;

                if (pad.type === 'block') {
                    if (this.isGuarding) {
                        this.registerHit(pad, 'PERFECT BLOCK!', '#00ff88');
                    }
                } else {
                    for (const hand of landmarks) {
                        if (!this.isFist(hand)) continue;
                        const fc = this.getFistCenter(hand);
                        const dist = Math.hypot(fc.x - pad.x, fc.y - pad.y);
                        
                        // Larger hit area for Hook and Jabs
                        const hitRange = pad.type === 'hook' ? pad.width * 0.9 : pad.width * 0.7;
                        
                        if (dist < hitRange) {
                            this.registerHit(pad, pad.type.toUpperCase() + '!', '#00f2ff');
                            break;
                        }
                    }
                }

                if (pad.holdTimer > this.holdFrames && !pad.hit) {
                    this.health -= 20;
                    this.combo = 0;
                    this.hitEffects.push({ x: pad.x, y: pad.y, text: 'OOF! -20HP', life: 45, color: '#ff3e3e' });
                    sound.play('crash');
                    if (this.health <= 0) { this.health = 0; this.gameOver(); return; }
                    pad.phase = 'exiting';
                }
            } else if (pad.phase === 'exiting') {
                pad.alpha -= 0.1;
                pad.scale += 0.05;
                if (pad.alpha <= 0) {
                    this.currentPad = null;
                    setTimeout(() => { if (this.isRunning) this.spawnNextPad(); }, 600);
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
            this.ctx.translate(this.canvas.width, 0);
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
            // Dynamic tint if guarding
            this.ctx.fillStyle = this.isGuarding ? 'rgba(0,242,255,0.1)' : 'rgba(0,0,0,0.3)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        if (this.currentPad) this.drawPad(this.currentPad);

        // Hands/Fists
        const landmarks = this.gameState.results?.landmarks || [];
        landmarks.forEach(hand => {
            const fist = this.isFist(hand);
            const fc = this.getFistCenter(hand);
            this.ctx.shadowBlur = fist ? 25 : 5;
            this.ctx.shadowColor = this.isGuarding ? '#00f2ff' : (fist ? '#ff3e3e' : '#ffffff');
            this.ctx.strokeStyle = this.ctx.shadowColor;
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.arc(fc.x, fc.y, fist ? 45 : 30, 0, Math.PI * 2);
            this.ctx.stroke();
            if (fist) {
                this.ctx.fillStyle = this.isGuarding ? 'rgba(0,242,255,0.2)' : 'rgba(255,62,62,0.2)';
                this.ctx.fill();
            }
        });

        // Instructions
        if (this.currentPad?.phase === 'hold') {
            let tip = "";
            if (this.currentPad.type === 'block') tip = "🛡️ PUT HANDS TOGETHER TO BLOCK!";
            else if (this.currentPad.type === 'hook') tip = "↑ HOOK! REACH UP!";
            else tip = `PUNCH THE ${this.currentPad.type.toUpperCase()}!`;

            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 24px Orbitron';
            this.ctx.textAlign = 'center';
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = '#00f2ff';
            this.ctx.fillText(tip, this.canvas.width/2, this.canvas.height - 60);
        }

        // Effects
        this.hitEffects.forEach(fx => {
            this.ctx.globalAlpha = fx.life / 50;
            this.ctx.fillStyle = fx.color;
            this.ctx.font = 'bold 28px Orbitron';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(fx.text, fx.x, fx.y);
        });
        
        this.drawHUD();
    }

    drawPad(pad) {
        this.ctx.save();
        this.ctx.globalAlpha = pad.alpha;
        this.ctx.translate(pad.x, pad.y);
        this.ctx.scale(pad.scale, pad.scale);

        const colors = { left: '#00f2ff', right: '#bc13fe', hook: '#ffa500', block: '#ff3e3e' };
        const color = colors[pad.type];

        this.ctx.shadowBlur = 30;
        this.ctx.shadowColor = color;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 6;
        
        if (pad.type === 'block') {
            this.ctx.beginPath();
            this.ctx.moveTo(-60, -60); this.ctx.lineTo(60, -60);
            this.ctx.lineTo(40, 60);   this.ctx.lineTo(-40, 60);
            this.ctx.closePath();
            this.ctx.stroke();
            this.ctx.fillStyle = 'rgba(255,62,62,0.2)';
            this.ctx.fill();
        } else {
            this.ctx.beginPath();
            this.ctx.roundRect(-pad.width/2, -pad.height/2, pad.width, pad.height, 12);
            this.ctx.stroke();
            this.ctx.fillStyle = `${color}22`;
            this.ctx.fill();
        }

        // Timer bar on pad
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
        // Simple health bar
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(20, 20, 200, 15);
        this.ctx.fillStyle = this.health > 40 ? '#00ff88' : '#ff3e3e';
        this.ctx.fillRect(20, 20, this.health * 2, 15);
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Orbitron';
        this.ctx.fillText(`HP: ${this.health}`, 20, 50);
        
        if (this.combo > 2) {
            this.ctx.fillStyle = '#ffd700';
            this.ctx.font = 'bold 30px Orbitron';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${this.combo}x COMBO`, this.canvas.width/2, 50);
        }
    }

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
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
