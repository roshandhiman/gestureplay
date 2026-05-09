/**
 * Shadow Strike (New Rhythm/Reflex Game)
 */
import { sound } from "../sounds.js";

export class GameInstance {
    constructor(canvas, gameState) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameState = gameState;
        this.isRunning = false;
        this.score = 0;
        this.targets = [];
        this.combo = 0;
        this.timeLeft = 60;
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.parentNode.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    start() {
        this.isRunning = true;
        this.score = 0;
        this.combo = 0;
        this.timeLeft = 60;
        this.targets = [];
        this.spawnTarget();
        this.updateScore(0);
        this.loop();
        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            if (this.timeLeft <= 0) this.gameOver();
        }, 1000);
        sound.play('select');
    }

    spawnTarget() {
        if (!this.isRunning) return;
        const x = Math.random() * (this.canvas.width - 100) + 50;
        const y = Math.random() * (this.canvas.height - 100) + 50;
        this.targets.push({
            x, y,
            radius: 40,
            life: 100,
            color: `hsl(${Math.random() * 360}, 70%, 50%)`,
            spawnTime: Date.now()
        });
        
        const nextSpawn = Math.max(300, 1000 - this.score);
        setTimeout(() => this.spawnTarget(), nextSpawn);
    }

    update() {
        if (!this.isRunning) return;

        // Collision Detection with ALL detected hands
        if (this.gameState.results && this.gameState.results.landmarks) {
            this.gameState.results.landmarks.forEach(hand => {
                const indexTip = hand[8];
                const hx = (1 - indexTip.x) * this.canvas.width;
                const hy = indexTip.y * this.canvas.height;
                
                this.targets.forEach((target, i) => {
                    if (!target.hit) {
                        const dist = Math.hypot(hx - target.x, hy - target.y);
                        if (dist < target.radius + 10) {
                            this.hitTarget(i);
                        }
                    }
                });
            });
        }

        // Target Aging
        for (let i = this.targets.length - 1; i >= 0; i--) {
            this.targets[i].life -= 1.5;
            if (this.targets[i].life <= 0) {
                this.targets.splice(i, 1);
                this.combo = 0; // Reset combo on miss
            }
        }
    }

    hitTarget(index) {
        const target = this.targets[index];
        target.hit = true;
        this.score += 10 + this.combo;
        this.combo++;
        this.updateScore(this.score);
        sound.play('point');
        this.targets.splice(index, 1);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw HUD
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Orbitron';
        this.ctx.fillText(`TIME: ${this.timeLeft}s`, 20, 40);
        this.ctx.fillText(`COMBO: ${this.combo}`, 20, 70);

        // Draw Targets
        this.targets.forEach(t => {
            const opacity = t.life / 100;
            this.ctx.globalAlpha = opacity;
            
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = t.color;
            this.ctx.strokeStyle = t.color;
            this.ctx.lineWidth = 4;
            
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
            this.ctx.stroke();
            
            // Pulse effect
            const pulse = Math.sin(Date.now() * 0.01) * 5;
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius - 10 + pulse, 0, Math.PI * 2);
            this.ctx.stroke();
            
            this.ctx.globalAlpha = 1;
        });
        
        this.ctx.shadowBlur = 0;
    }

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    updateScore(s) {
        document.getElementById('game-score').textContent = s;
    }

    gameOver() {
        this.isRunning = false;
        clearInterval(this.timerInterval);
        sound.play('crash');
        if (this.onGameOver) this.onGameOver(this.score);
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('game-over-overlay').classList.remove('hidden');
    }

    destroy() {
        this.isRunning = false;
        clearInterval(this.timerInterval);
    }
}
