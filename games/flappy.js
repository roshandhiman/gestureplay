/**
 * Sky Glide - Flappy Bird with Progressive Difficulty
 */
import { sound } from "../sounds.js";

export class GameInstance {
    constructor(canvas, gameState) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameState = gameState;
        this.isRunning = false;
        this.score = 0;
        this.frameCount = 0;

        // Dynamic difficulty
        this.basePipeSpeed = 3;
        this.pipeGap = 175;
        this.pipeWidth = 70;
        this.spawnDistance = 380;

        this.bird = { x: 150, y: 0, radius: 18, velocity: 0, rotation: 0 };
        this.pipes = [];
        this.particles = [];

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    get pipeSpeed()    { return this.basePipeSpeed + Math.floor(this.score / 5) * 0.5; }
    get currentGap()   { return Math.max(100, this.pipeGap - Math.floor(this.score / 10) * 8); }
    get spawnDist()    { return Math.max(200, this.spawnDistance - Math.floor(this.score / 8) * 15); }
    get maxPipesOnScreen() { return 2 + Math.floor(this.score / 15); }

    resize() {
        const rect = this.canvas.parentNode.getBoundingClientRect();
        this.canvas.width  = rect.width;
        this.canvas.height = rect.height;
        this.bird.y = this.canvas.height / 2;
    }

    start() {
        this.isRunning = true;
        this.score = 0;
        this.frameCount = 0;
        this.bird.y = this.canvas.height / 2;
        this.bird.velocity = 0;
        this.pipes = [];
        this.particles = [];
        this.spawnPipe();
        this.updateScore(0);
        this.loop();
        sound.play('select');
    }

    spawnPipe() {
        const gap = this.currentGap;
        const minH = 60;
        const maxH = this.canvas.height - gap - minH;
        const height = Math.random() * (maxH - minH) + minH;
        this.pipes.push({ x: this.canvas.width + 20, topHeight: height, passed: false });
    }

    addParticle(x, y, color) {
        for (let i = 0; i < 6; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                life: 30,
                color
            });
        }
    }

    update() {
        if (!this.isRunning) return;
        this.frameCount++;

        // Hand control
        if (this.gameState.results?.landmarks?.length > 0) {
            const hand = this.gameState.results.landmarks[0];
            const palmY = hand[9].y;
            const targetY = palmY * this.canvas.height;
            const dy = targetY - this.bird.y;
            this.bird.velocity = dy * 0.2;
            this.bird.rotation = Math.atan2(this.bird.velocity, 12);
            if (Math.abs(this.bird.velocity) > 3 && Math.random() < 0.04) sound.play('jump');
        } else {
            this.bird.velocity += 0.3;
            this.bird.rotation += 0.05;
        }

        this.bird.y += this.bird.velocity;
        this.bird.y = Math.max(this.bird.radius, this.bird.y);
        if (this.bird.y > this.canvas.height - this.bird.radius) { this.gameOver(); return; }

        // Pipes
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const p = this.pipes[i];
            p.x -= this.pipeSpeed;

            const bR = this.bird.x + this.bird.radius - 6;
            const bL = this.bird.x - this.bird.radius + 6;
            const bT = this.bird.y - this.bird.radius + 6;
            const bB = this.bird.y + this.bird.radius - 6;

            if (bR > p.x && bL < p.x + this.pipeWidth) {
                const gap = this.currentGap;
                if (bT < p.topHeight || bB > p.topHeight + gap) {
                    this.addParticle(this.bird.x, this.bird.y, '#ff3e3e');
                    this.gameOver(); return;
                }
            }

            if (!p.passed && p.x + this.pipeWidth < this.bird.x) {
                p.passed = true;
                this.score++;
                this.updateScore(this.score);
                sound.play('point');
                this.addParticle(this.bird.x, this.bird.y, '#00f2ff');
            }

            if (p.x + this.pipeWidth < 0) this.pipes.splice(i, 1);
        }

        // Spawn new pipes (can spawn multiple at high scores)
        const lastPipe = this.pipes[this.pipes.length - 1];
        if (!lastPipe || (this.canvas.width - lastPipe.x) > this.spawnDist) {
            this.spawnPipe();
            // At high scores, spawn a second staggered pipe
            if (this.score > 20 && Math.random() < 0.4) {
                setTimeout(() => { if (this.isRunning) this.spawnPipe(); }, 400);
            }
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy; p.life--;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Scrolling stars bg
        this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
        for (let i = 0; i < 30; i++) {
            const sx = ((i * 97 + this.frameCount * 0.5) % this.canvas.width);
            const sy = (i * 53) % this.canvas.height;
            this.ctx.beginPath();
            this.ctx.arc(sx, sy, 1, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Difficulty indicator
        const level = Math.floor(this.score / 5) + 1;
        this.ctx.fillStyle = `rgba(0,242,255,0.3)`;
        this.ctx.font = '12px Orbitron';
        this.ctx.fillText(`LVL ${level} | SPD ${this.pipeSpeed.toFixed(1)} | GAP ${this.currentGap}`, 10, 20);

        // Pipes
        this.pipes.forEach(p => {
            const gap = this.currentGap;
            this.drawPipe(p.x, 0, this.pipeWidth, p.topHeight, true);
            this.drawPipe(p.x, p.topHeight + gap, this.pipeWidth, this.canvas.height - p.topHeight - gap, false);
        });

        // Particles
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life / 30;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;

        // Bird
        this.ctx.save();
        this.ctx.translate(this.bird.x, this.bird.y);
        this.ctx.rotate(this.bird.rotation);
        this.drawBird();
        this.ctx.restore();
    }

    drawPipe(x, y, w, h, isTop) {
        const grad = this.ctx.createLinearGradient(x, y, x + w, y);
        grad.addColorStop(0, '#bc13fe');
        grad.addColorStop(0.5, '#4a00e0');
        grad.addColorStop(1, '#bc13fe');
        this.ctx.fillStyle = grad;
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = '#bc13fe';
        this.ctx.fillRect(x, y, w, h);
        // Cap
        this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        if (isTop) this.ctx.fillRect(x - 6, h - 12, w + 12, 12);
        else this.ctx.fillRect(x - 6, y, w + 12, 12);
        this.ctx.shadowBlur = 0;
    }

    drawBird() {
        this.ctx.fillStyle = '#00f2ff';
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = '#00f2ff';
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI * 2);
        this.ctx.fill();
        // Wing animation
        this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
        this.ctx.beginPath();
        this.ctx.moveTo(-5, 0);
        this.ctx.lineTo(-22, -12 + Math.sin(Date.now() * 0.01) * 7);
        this.ctx.lineTo(-15, 6);
        this.ctx.fill();
        // Eye
        this.ctx.fillStyle = 'black';
        this.ctx.beginPath();
        this.ctx.arc(10, -5, 3, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = 'white';
        this.ctx.beginPath();
        this.ctx.arc(11, -6, 1.2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
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
