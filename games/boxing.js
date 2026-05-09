/**
 * Boxing Arena v2 - Clear Sequential Boxing
 *
 * HOW IT WORKS:
 * - ONE pad at a time slides in from a clear direction
 * - LEFT JAB pad → slides in from LEFT side
 * - RIGHT JAB pad → slides in from RIGHT side
 * - HOOK pad → drops from TOP
 * - DODGE pad → a punch COMES AT YOU, move your head sideways to avoid
 * - Make a FIST and PUNCH the pad when it reaches the hit zone
 * - Webcam background so you see yourself boxing
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

        // Current active pad (only ONE at a time)
        this.currentPad = null;
        this.waitingForNext = false;

        // The sequence of pads that come in order (loops)
        this.sequence = ['left', 'right', 'left', 'right', 'hook', 'right', 'dodge', 'left'];
        this.seqIndex = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.parentNode.getBoundingClientRect();
        this.canvas.width  = rect.width;
        this.canvas.height = rect.height;
    }

    // How fast pad slides in — increases with score
    get slideSpeed() { return 3 + Math.floor(this.score / 15) * 0.8; }
    // How long the pad stays in the hit zone before it counts as missed
    get holdFrames() { return Math.max(40, 90 - Math.floor(this.score / 10) * 8); }

    start() {
        this.isRunning = true;
        this.score = 0;
        this.combo = 0;
        this.health = 100;
        this.frameCount = 0;
        this.hitEffects = [];
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

        // Hit zone = center target area
        const hitX = W / 2;
        const hitY = H * 0.42;

        let startX, startY, endX, endY;

        if (type === 'left') {
            // Pad comes from the LEFT
            startX = -120; startY = H * 0.42;
            endX = W * 0.28; endY = H * 0.42;
        } else if (type === 'right') {
            // Pad comes from the RIGHT
            startX = W + 120; startY = H * 0.42;
            endX = W * 0.72; endY = H * 0.42;
        } else if (type === 'hook') {
            // Pad drops from TOP
            startX = W * 0.5; startY = -120;
            endX = W * 0.5;   endY = H * 0.28;
        } else if (type === 'dodge') {
            // A punch comes AT the player — appear center, move TOWARD camera
            startX = W * 0.5; startY = H * 0.1;
            endX = W * 0.5;   endY = H * 0.55;
        }

        this.currentPad = {
            type,
            x: startX, y: startY,
            endX, endY,
            startX, startY,
            width: 110, height: 130,
            phase: 'entering', // 'entering' → 'hold' → 'exiting' / 'missed'
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

    // Estimate head center (nose/face) from available hand data.
    // We use the wrist position of both hands averaged and offset upward.
    getHeadX(landmarks) {
        if (!landmarks || !landmarks.length) return this.canvas.width / 2;
        let avgX = landmarks.reduce((s, hand) => s + (1 - hand[0].x), 0) / landmarks.length;
        return avgX * this.canvas.width;
    }

    update() {
        if (!this.isRunning) return;
        this.frameCount++;

        const pad = this.currentPad;
        if (!pad) return;

        // ─── Phase: ENTERING ───────────────────────────────────────────
        if (pad.phase === 'entering') {
            const dx = pad.endX - pad.x;
            const dy = pad.endY - pad.y;
            const dist = Math.hypot(dx, dy);

            if (dist < this.slideSpeed + 1) {
                pad.x = pad.endX;
                pad.y = pad.endY;
                pad.phase = 'hold';
                pad.holdTimer = 0;
                // Scale-pop effect
                pad.scale = 1.2;
            } else {
                const spd = this.slideSpeed;
                pad.x += (dx / dist) * spd;
                pad.y += (dy / dist) * spd;
            }
        }

        // ─── Phase: HOLD ───────────────────────────────────────────────
        else if (pad.phase === 'hold') {
            // Ease scale back to 1
            pad.scale += (1 - pad.scale) * 0.2;
            pad.holdTimer++;

            const results = this.gameState.results;
            const landmarks = results?.landmarks || [];

            if (pad.type === 'dodge') {
                // DODGE: player must move head to the side
                const headX = this.getHeadX(landmarks);
                const centerX = this.canvas.width / 2;
                const dodge = Math.abs(headX - centerX) > this.canvas.width * 0.15;

                if (dodge) {
                    this.registerHit(pad, 'DODGE!', '#00ff88');
                }
            } else {
                // HIT: player must make a fist and reach the pad
                for (const hand of landmarks) {
                    if (!this.isFist(hand)) continue;
                    const fc = this.getFistCenter(hand);
                    const dist = Math.hypot(fc.x - pad.x, fc.y - pad.y);

                    // For left pad → prefer right hand (mirrored), vice versa
                    const handedness = results.handedness;
                    // Accept any fist within range
                    if (dist < pad.width * 0.7) {
                        // Check fist speed (detect punch, not just touching)
                        const prevKey = `prev_${landmarks.indexOf(hand)}`;
                        const prev = this[prevKey] || fc;
                        const speed = Math.hypot(fc.x - prev.x, fc.y - prev.y);
                        this[prevKey] = { ...fc };
                        if (speed > 8) {
                            this.registerHit(pad, pad.type.toUpperCase() + ' HIT!', '#00f2ff');
                            break;
                        }
                    } else {
                        this[`prev_${landmarks.indexOf(hand)}`] = { ...fc };
                    }
                }
            }

            // Missed?
            if (pad.holdTimer > this.holdFrames && !pad.hit) {
                pad.phase = 'missed';
                this.health -= 20;
                this.combo = 0;
                this.hitEffects.push({ x: pad.x, y: pad.y - 30, text: 'MISS! -20HP', life: 50, color: '#ff3e3e' });
                sound.play('crash');
                if (this.health <= 0) { this.health = 0; this.gameOver(); return; }
                pad.phase = 'exiting';
            }
        }

        // ─── Phase: EXITING ────────────────────────────────────────────
        else if (pad.phase === 'exiting') {
            pad.alpha -= 0.07;
            pad.scale += 0.04;
            if (pad.alpha <= 0) {
                this.currentPad = null;
                // Wait a beat, then spawn next
                const delay = Math.max(400, 1200 - this.score * 10);
                setTimeout(() => { if (this.isRunning) this.spawnNextPad(); }, delay);
            }
        }

        // Age hit effects
        for (let i = this.hitEffects.length - 1; i >= 0; i--) {
            this.hitEffects[i].life--;
            this.hitEffects[i].y -= 0.6;
            if (this.hitEffects[i].life <= 0) this.hitEffects.splice(i, 1);
        }

        // Pulse dodge pad toward camera (grow to show "coming at you")
        if (pad && pad.type === 'dodge' && pad.phase === 'hold') {
            pad.scale = 1 + (pad.holdTimer / this.holdFrames) * 0.6;
        }
    }

    registerHit(pad, text, color) {
        if (pad.hit) return;
        pad.hit = true;
        pad.phase = 'exiting';
        this.combo++;
        const pts = 10 * (this.combo > 3 ? 2 : 1);
        this.score += pts;
        this.updateScore(this.score);
        this.hitEffects.push({
            x: pad.x, y: pad.y - 20,
            text: `${text} +${pts}${this.combo > 3 ? ' COMBO!' : ''}`,
            life: 55, color
        });
        sound.play('point');
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // ── Webcam background ──
        if (this.video && this.video.readyState >= 2) {
            this.ctx.save();
            this.ctx.translate(this.canvas.width, 0);
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
            this.ctx.fillStyle = 'rgba(0,0,0,0.35)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = '#0a0010';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        // ── Draw the active pad ──
        const pad = this.currentPad;
        if (pad) this.drawPad(pad);

        // ── Draw fist indicators from hands ──
        const landmarks = this.gameState.results?.landmarks || [];
        landmarks.forEach(hand => {
            const fist = this.isFist(hand);
            const fc = this.getFistCenter(hand);
            this.ctx.shadowBlur = fist ? 30 : 10;
            this.ctx.shadowColor = fist ? '#ff3e3e' : '#00f2ff';
            this.ctx.strokeStyle = fist ? '#ff3e3e' : '#00f2ff';
            this.ctx.lineWidth = fist ? 4 : 2;
            this.ctx.beginPath();
            this.ctx.arc(fc.x, fc.y, fist ? 45 : 28, 0, Math.PI * 2);
            this.ctx.stroke();
            if (fist) {
                this.ctx.fillStyle = 'rgba(255,62,62,0.15)';
                this.ctx.fill();
                this.ctx.fillStyle = 'white';
                this.ctx.font = 'bold 14px Orbitron';
                this.ctx.textAlign = 'center';
                this.ctx.fillText('FIST', fc.x, fc.y + 5);
            }
            this.ctx.shadowBlur = 0;
        });

        // ── Instructions overlay for current pad type ──
        if (pad && pad.phase === 'hold') {
            const tip = {
                left:  '← PUNCH LEFT PAD',
                right: 'PUNCH RIGHT PAD →',
                hook:  '↑ PUNCH THE HOOK',
                dodge: '← DODGE YOUR HEAD →',
            }[pad.type] || '';
            this.ctx.fillStyle = pad.type === 'dodge' ? '#ff3e3e' : '#ffffff';
            this.ctx.font = `bold ${pad.type === 'dodge' ? '26' : '20'}px Orbitron`;
            this.ctx.textAlign = 'center';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = pad.type === 'dodge' ? '#ff3e3e' : '#00f2ff';
            this.ctx.fillText(tip, this.canvas.width / 2, this.canvas.height - 40);
            this.ctx.shadowBlur = 0;
        }

        // ── Hit effects ──
        this.hitEffects.forEach(fx => {
            this.ctx.globalAlpha = Math.min(1, fx.life / 30);
            this.ctx.fillStyle = fx.color;
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = fx.color;
            this.ctx.font = 'bold 22px Orbitron';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(fx.text, fx.x, fx.y);
        });
        this.ctx.globalAlpha = 1;
        this.ctx.textAlign = 'left';
        this.ctx.shadowBlur = 0;

        // ── HUD ──
        this.drawHUD();
    }

    drawPad(pad) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, pad.alpha);
        this.ctx.translate(pad.x, pad.y);
        this.ctx.scale(pad.scale, pad.scale);

        const configs = {
            left:  { color: '#00f2ff', label: 'JAB\n←',   shape: 'rect' },
            right: { color: '#bc13fe', label: 'JAB\n→',   shape: 'rect' },
            hook:  { color: '#ffa500', label: 'HOOK\n↑',  shape: 'rect' },
            dodge: { color: '#ff3e3e', label: 'DODGE\n!', shape: 'circle' },
        };
        const cfg = configs[pad.type];
        const W = pad.width / 2;
        const H = pad.height / 2;

        this.ctx.shadowBlur = 25;
        this.ctx.shadowColor = cfg.color;

        if (cfg.shape === 'circle') {
            // Incoming punch circle
            this.ctx.strokeStyle = cfg.color;
            this.ctx.lineWidth = 5;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, W, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(255,62,62,0.15)`;
            this.ctx.fill();
            this.ctx.stroke();

            // Inner ring
            this.ctx.beginPath();
            this.ctx.arc(0, 0, W * 0.6, 0, Math.PI * 2);
            this.ctx.strokeStyle = 'rgba(255,62,62,0.6)';
            this.ctx.stroke();

            // Progress ring showing time left
            if (pad.phase === 'hold') {
                const pct = 1 - pad.holdTimer / this.holdFrames;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, W + 10, -Math.PI/2, -Math.PI/2 + pct * Math.PI * 2);
                this.ctx.strokeStyle = '#ff3e3e';
                this.ctx.lineWidth = 6;
                this.ctx.stroke();
            }
        } else {
            // Boxing pad rectangle
            this.ctx.fillStyle = `${cfg.color}22`;
            this.ctx.beginPath();
            this.roundRect(-W, -H, pad.width, pad.height, 16);
            this.ctx.fill();

            this.ctx.strokeStyle = cfg.color;
            this.ctx.lineWidth = 4;
            this.ctx.stroke();

            // Hit zone circle in center
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 30, 0, Math.PI * 2);
            this.ctx.strokeStyle = cfg.color;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Progress ring showing time left
            if (pad.phase === 'hold') {
                const pct = 1 - pad.holdTimer / this.holdFrames;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, W + 8, -Math.PI/2, -Math.PI/2 + pct * Math.PI * 2);
                this.ctx.strokeStyle = cfg.color;
                this.ctx.lineWidth = 7;
                this.ctx.stroke();
            }
        }

        // Label
        const lines = cfg.label.split('\n');
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Orbitron';
        this.ctx.textAlign = 'center';
        lines.forEach((line, i) => {
            this.ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * 20);
        });

        // Arrow hint during entering phase
        if (pad.phase === 'entering') {
            this.ctx.fillStyle = `${cfg.color}88`;
            this.ctx.font = '28px Arial';
            const arrowMap = { left: '→', right: '←', hook: '↓', dodge: '⚡' };
            this.ctx.fillText(arrowMap[pad.type] || '', 0, H + 30);
        }

        this.ctx.restore();
    }

    roundRect(x, y, w, h, r) {
        this.ctx.beginPath();
        this.ctx.moveTo(x+r, y);
        this.ctx.lineTo(x+w-r, y);
        this.ctx.quadraticCurveTo(x+w, y, x+w, y+r);
        this.ctx.lineTo(x+w, y+h-r);
        this.ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
        this.ctx.lineTo(x+r, y+h);
        this.ctx.quadraticCurveTo(x, y+h, x, y+h-r);
        this.ctx.lineTo(x, y+r);
        this.ctx.quadraticCurveTo(x, y, x+r, y);
        this.ctx.closePath();
    }

    drawHUD() {
        const W = this.canvas.width;
        // Health bar
        this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
        this.ctx.beginPath();
        this.roundRect(10, this.canvas.height - 44, 210, 26, 4);
        this.ctx.fill();
        const hColor = this.health > 60 ? '#00ff88' : this.health > 30 ? '#ffa500' : '#ff3e3e';
        this.ctx.fillStyle = hColor;
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = hColor;
        this.ctx.beginPath();
        this.roundRect(12, this.canvas.height - 42, Math.max(0, this.health * 2.06), 22, 3);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 11px Orbitron';
        this.ctx.fillText(`HP ${this.health}`, 16, this.canvas.height - 24);

        // Speed tag
        this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
        this.ctx.font = '11px Orbitron';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`SPD x${this.slideSpeed.toFixed(1)}`, W - 10, this.canvas.height - 24);
        this.ctx.textAlign = 'left';

        // Combo
        if (this.combo > 2) {
            this.ctx.fillStyle = '#ffd700';
            this.ctx.shadowBlur = 12;
            this.ctx.shadowColor = '#ffd700';
            this.ctx.font = `bold ${Math.min(36, 18 + this.combo * 2)}px Orbitron`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${this.combo}x COMBO!`, W / 2, 40);
            this.ctx.shadowBlur = 0;
            this.ctx.textAlign = 'left';
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
