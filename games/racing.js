/**
 * Neon Racer - Car Racing with Progressive Difficulty
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
        this.baseSpeed = 5;
        this.particles = [];

        this.player = { x: 0, y: 0, w: 48, h: 88, color: '#00f2ff', trail: [] };
        this.obstacles = [];
        this.roadOffset = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    get speed()          { return this.baseSpeed + this.score * 0.04; }
    get maxObstacles()   { return Math.min(3 + Math.floor(this.score / 20), 6); }
    get spawnThreshold() { return Math.max(120, 280 - this.score * 1.5); }

    resize() {
        const rect = this.canvas.parentNode.getBoundingClientRect();
        this.canvas.width  = rect.width;
        this.canvas.height = rect.height;
        this.player.x = this.canvas.width / 2;
        this.player.y = this.canvas.height - 130;
    }

    start() {
        this.isRunning = true;
        this.score = 0;
        this.frameCount = 0;
        this.obstacles = [];
        this.particles = [];
        this.updateScore(0);
        this.loop();
        sound.play('select');
    }

    spawnObstacle() {
        const lW = this.canvas.width / 4;
        const lane = Math.floor(Math.random() * 4);
        const colors = ['#bc13fe','#ff00e6','#f39c12','#e74c3c'];
        const col = colors[Math.floor(Math.random() * colors.length)];

        this.obstacles.push({
            x: lane * lW + lW / 2,
            y: -200 - Math.random() * 200,
            w: 46, h: 86,
            color: col,
            speedMult: 0.9 + Math.random() * 0.4
        });
    }

    addParticle(x, y, color) {
        for (let i = 0; i < 8; i++) {
            this.particles.push({ x, y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 25, color });
        }
    }

    update() {
        if (!this.isRunning) return;
        this.frameCount++;
        this.roadOffset = (this.roadOffset + this.speed) % 80;

        // Steering
        if (this.gameState.results?.landmarks?.length > 0) {
            const hand = this.gameState.results.landmarks[0];
            const palmX = (1 - hand[9].x) * this.canvas.width;
            this.player.x += (palmX - this.player.x) * 0.15;
        }
        this.player.x = Math.max(this.player.w, Math.min(this.canvas.width - this.player.w, this.player.x));

        // Trail
        this.player.trail.push({ x: this.player.x, y: this.player.y });
        if (this.player.trail.length > 12) this.player.trail.shift();

        // Score ticker
        if (this.frameCount % 10 === 0) {
            this.score++;
            this.updateScore(this.score);
        }

        // Spawn obstacles up to max
        if (this.obstacles.length < this.maxObstacles) {
            const last = this.obstacles[this.obstacles.length - 1];
            if (!last || last.y > this.spawnThreshold) this.spawnObstacle();
        }

        // Move obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.y += this.speed * obs.speedMult;

            // Collision
            const hW = (this.player.w + obs.w) / 2 - 8;
            const hH = (this.player.h + obs.h) / 2 - 10;
            if (Math.abs(this.player.x - obs.x) < hW && Math.abs(this.player.y - obs.y) < hH) {
                this.addParticle(this.player.x, this.player.y, '#ff3e3e');
                this.gameOver(); return;
            }

            if (obs.y > this.canvas.height + 150) this.obstacles.splice(i, 1);
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

        // Speed overlay color
        const speedRatio = Math.min(1, (this.speed - 5) / 10);
        this.ctx.fillStyle = `rgba(${Math.floor(speedRatio * 180)}, 0, ${Math.floor((1 - speedRatio) * 100)}, 0.05)`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawRoad();

        // Speed indicator
        this.ctx.fillStyle = 'white';
        this.ctx.font = '13px Orbitron';
        this.ctx.fillText(`SPD ${this.speed.toFixed(1)} | OBS ${this.obstacles.length}`, 10, 25);

        // Particles
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.life / 25;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;

        // Player trail
        this.player.trail.forEach((t, i) => {
            this.ctx.globalAlpha = i / this.player.trail.length * 0.3;
            this.ctx.fillStyle = '#00f2ff';
            this.ctx.fillRect(t.x - 8, t.y, 16, 6);
        });
        this.ctx.globalAlpha = 1;

        // Obstacles
        this.obstacles.forEach(obs => this.drawCar(obs.x, obs.y, obs.w, obs.h, obs.color, true));

        // Player
        this.drawCar(this.player.x, this.player.y, this.player.w, this.player.h, this.player.color, false);
    }

    drawRoad() {
        const lW = this.canvas.width / 4;
        this.ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([40, 40]);
        this.ctx.lineDashOffset = -this.roadOffset;
        for (let i = 1; i < 4; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * lW, 0);
            this.ctx.lineTo(i * lW, this.canvas.height);
            this.ctx.stroke();
        }
        this.ctx.setLineDash([]);
    }

    drawCar(x, y, w, h, color, flip) {
        this.ctx.save();
        this.ctx.translate(x, y);
        if (flip) this.ctx.rotate(Math.PI);
        this.ctx.shadowBlur = 18;
        this.ctx.shadowColor = color;
        this.ctx.fillStyle = color;
        this.roundRect(-w/2, -h/2, w, h, 8);
        this.ctx.fill();
        // Windows
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(-w/2+6, -h/2+18, w-12, 18);
        // Lights
        const lc = flip ? 'red' : 'white';
        this.ctx.fillStyle = lc;
        this.ctx.shadowColor = lc;
        this.ctx.fillRect(-w/2+5, -h/2+5, 10, 5);
        this.ctx.fillRect(w/2-15, -h/2+5, 10, 5);
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
