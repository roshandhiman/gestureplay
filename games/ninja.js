/**
 * Blade Master (Improved Fruit Ninja)
 */
import { sound } from "../sounds.js";

export class GameInstance {
    constructor(canvas, gameState) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameState = gameState;
        this.isRunning = false;
        this.score = 0;
        
        this.items = [];
        this.slashTrail = [];
        this.lastHandPos = null;
        
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
        this.items = [];
        this.slashTrail = [];
        this.updateScore(0);
        this.spawnLoop();
        this.loop();
        sound.play('select');
    }

    spawnLoop() {
        if (!this.isRunning) return;
        const count = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < count; i++) this.spawnItem();
        setTimeout(() => this.spawnLoop(), 1200 - Math.min(this.score, 600));
    }

    spawnItem() {
        const isBomb = Math.random() < 0.2;
        const x = Math.random() * (this.canvas.width - 200) + 100;
        const vx = (Math.random() - 0.5) * 6;
        const vy = -(Math.random() * 6 + 10);
        
        this.items.push({
            x, y: this.canvas.height + 50,
            vx, vy,
            radius: isBomb ? 35 : 30,
            isBomb,
            isSliced: false,
            color: isBomb ? '#ff3e3e' : `hsl(${Math.random() * 60 + 20}, 100%, 50%)`,
            rot: 0,
            rotV: (Math.random() - 0.5) * 0.2
        });
    }

    update() {
        if (!this.isRunning) return;

        if (this.gameState.results && this.gameState.results.landmarks && this.gameState.results.landmarks.length > 0) {
            const hand = this.gameState.results.landmarks[0];
            const finger = hand[8];
            const cx = (1 - finger.x) * this.canvas.width;
            const cy = finger.y * this.canvas.height;
            
            this.slashTrail.push({ x: cx, y: cy, age: 0 });
            if (this.lastHandPos) this.checkSlice(this.lastHandPos.x, this.lastHandPos.y, cx, cy);
            this.lastHandPos = { x: cx, y: cy };
        } else {
            this.lastHandPos = null;
        }

        this.slashTrail.forEach(p => p.age++);
        this.slashTrail = this.slashTrail.filter(p => p.age < 12);

        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            item.vy += 0.2; // Gravity
            item.x += item.vx;
            item.y += item.vy;
            item.rot += item.rotV;

            if (item.y > this.canvas.height + 100) this.items.splice(i, 1);
        }
    }

    checkSlice(x1, y1, x2, y2) {
        this.items.forEach(item => {
            if (item.isSliced) return;
            const dist = this.distToSegment({ x: item.x, y: item.y }, { x: x1, y: y1 }, { x: x2, y: y2 });
            if (dist < item.radius) {
                item.isSliced = true;
                if (item.isBomb) this.gameOver();
                else {
                    this.score += 10;
                    this.updateScore(this.score);
                    sound.play('slice');
                    this.createJuiceSplash(item.x, item.y, item.color);
                }
            }
        });
    }

    createJuiceSplash(x, y, color) {
        // Juice effect could be added here
    }

    distToSegment(p, v, w) {
        const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
        if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.sqrt((p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Slash Trail
        if (this.slashTrail.length > 1) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            this.ctx.lineWidth = 8;
            this.ctx.lineCap = 'round';
            this.ctx.moveTo(this.slashTrail[0].x, this.slashTrail[0].y);
            for (let i = 1; i < this.slashTrail.length; i++) this.ctx.lineTo(this.slashTrail[i].x, this.slashTrail[i].y);
            this.ctx.stroke();
        }

        // Items
        this.items.forEach(item => {
            this.ctx.save();
            this.ctx.translate(item.x, item.y);
            this.ctx.rotate(item.rot);
            
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = item.color;
            this.ctx.fillStyle = item.color;

            if (item.isSliced && !item.isBomb) {
                // Draw Sliced Halves
                this.ctx.beginPath();
                this.ctx.arc(-15, 0, item.radius, Math.PI * 0.5, Math.PI * 1.5);
                this.ctx.fill();
                this.ctx.beginPath();
                this.ctx.arc(15, 10, item.radius, Math.PI * 1.5, Math.PI * 0.5);
                this.ctx.fill();
            } else {
                this.ctx.beginPath();
                this.ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
                this.ctx.fill();
                
                if (item.isBomb) {
                    this.ctx.fillStyle = 'black';
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, item.radius * 0.7, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.fillStyle = 'red';
                    this.ctx.font = 'bold 12px Orbitron';
                    this.ctx.fillText('BOMB', -18, 5);
                }
            }
            this.ctx.restore();
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
        sound.play('crash');
        if (this.onGameOver) this.onGameOver(this.score);
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('game-over-overlay').classList.remove('hidden');
    }

    destroy() { this.isRunning = false; }
}
