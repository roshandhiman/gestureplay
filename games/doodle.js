/**
 * Air Canvas Pro v3 - Precise Gesture Drawing
 * - Index only extended = DRAW
 * - All fingers open (palm) = ERASE
 * - Fist = move freely (no action)
 */
import { sound } from "../sounds.js";

export class GameInstance {
    constructor(canvas, gameState) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gameState = gameState;
        this.isRunning = false;

        this.strokes = [];
        this.currentColor = '#00f2ff';
        this.brushSize = 5;
        this.mode = 'FIST'; // 'DRAW' | 'ERASE' | 'FIST'
        this.wasDrawing = false;

        this.setupUI();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    setupUI() {
        if (document.getElementById('doodle-toolbar')) document.getElementById('doodle-toolbar').remove();

        const toolbar = document.createElement('div');
        toolbar.id = 'doodle-toolbar';
        toolbar.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-family:Orbitron;font-size:0.7rem;color:#aaa">COLOR:</span>
                ${['#00f2ff','#bc13fe','#ff00e6','#ffff00','#ff6600','#00ff88'].map(c =>
                    `<button class="color-btn" data-color="${c}" style="background:${c};width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;transition:all 0.2s"></button>`
                ).join('')}
                <span style="font-family:Orbitron;font-size:0.7rem;color:#aaa;margin-left:8px">SIZE:</span>
                <input type="range" id="brush-size" min="2" max="20" value="5" style="width:80px">
                <button id="clear-canvas" style="font-family:Orbitron;font-size:0.65rem;background:none;border:1px solid #bc13fe;color:#bc13fe;padding:5px 10px;border-radius:4px;cursor:pointer">CLEAR</button>
                <button id="save-canvas" style="font-family:Orbitron;font-size:0.65rem;background:#00f2ff;border:none;color:black;padding:5px 10px;border-radius:4px;cursor:pointer">SAVE</button>
            </div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:12px">
                <div style="font-family:Orbitron;font-size:0.7rem;color:white">MODE: <span id="draw-mode" style="color:#00f2ff">FIST</span></div>
                <div style="font-family:Orbitron;font-size:0.6rem;color:#666">
                    ☝ Index only = DRAW &nbsp;|&nbsp; ✋ Open palm = ERASE &nbsp;|&nbsp; ✊ Fist = FREE
                </div>
            </div>
        `;
        toolbar.style.cssText = `
            position:absolute;top:12px;left:50%;transform:translateX(-50%);
            z-index:20;background:rgba(0,0,0,0.85);padding:12px 16px;
            border-radius:12px;backdrop-filter:blur(10px);
            border:1px solid rgba(0,242,255,0.4);min-width:500px;
        `;
        this.canvas.parentNode.appendChild(toolbar);
        this.toolbar = toolbar;

        toolbar.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                toolbar.querySelectorAll('.color-btn').forEach(b => b.style.border = '2px solid transparent');
                btn.style.border = '2px solid white';
                this.currentColor = btn.dataset.color;
                sound.play('select');
            });
        });

        toolbar.querySelector('.color-btn').style.border = '2px solid white';

        document.getElementById('brush-size').addEventListener('input', e => {
            this.brushSize = parseInt(e.target.value);
        });

        document.getElementById('clear-canvas').addEventListener('click', () => {
            this.strokes = [];
            sound.play('crash');
        });

        document.getElementById('save-canvas').addEventListener('click', () => {
            // Composite on white bg for save
            const offCanvas = document.createElement('canvas');
            offCanvas.width = this.canvas.width;
            offCanvas.height = this.canvas.height;
            const offCtx = offCanvas.getContext('2d');
            offCtx.fillStyle = '#000';
            offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
            offCtx.drawImage(this.canvas, 0, 0);
            const link = document.createElement('a');
            link.download = 'air-art.png';
            link.href = offCanvas.toDataURL();
            link.click();
            sound.play('point');
        });
    }

    resize() {
        const rect = this.canvas.parentNode.getBoundingClientRect();
        this.canvas.width  = rect.width;
        this.canvas.height = rect.height;
    }

    start() {
        this.isRunning = true;
        this.strokes = [];
        this.loop();
    }

    // ---- Gesture Detection ----

    // Returns how many fingers are extended (excluding thumb)
    getExtendedFingers(hand) {
        // Each finger: tip is index 4,8,12,16,20; pip is 2,6,10,14,18
        // Finger extended if tip.y < pip.y (in normalized coords, y=0 is top)
        const fingers = [
            { tip: 8,  pip: 6  }, // index
            { tip: 12, pip: 10 }, // middle
            { tip: 16, pip: 14 }, // ring
            { tip: 20, pip: 18 }, // pinky
        ];
        return fingers.map(f => hand[f.tip].y < hand[f.pip].y);
    }

    isIndexOnlyExtended(hand) {
        const extended = this.getExtendedFingers(hand);
        // Index extended, others NOT extended
        return extended[0] && !extended[1] && !extended[2] && !extended[3];
    }

    isAllFingersOpen(hand) {
        const extended = this.getExtendedFingers(hand);
        return extended[0] && extended[1] && extended[2] && extended[3];
    }

    isFist(hand) {
        const extended = this.getExtendedFingers(hand);
        return !extended[0] && !extended[1] && !extended[2] && !extended[3];
    }

    eraseAt(x, y, radius = 40) {
        this.strokes = this.strokes.map(stroke =>
            stroke.filter(p => Math.hypot(p.x - x, p.y - y) > radius)
        ).filter(s => s.length > 0);
    }

    update() {
        if (!this.isRunning) return;

        const results = this.gameState.results;
        if (results?.landmarks?.length > 0) {
            const hand = results.landmarks[0];
            const tip = hand[8]; // Index fingertip
            const x = (1 - tip.x) * this.canvas.width;
            const y = tip.y * this.canvas.height;

            if (this.isIndexOnlyExtended(hand)) {
                this.mode = 'DRAW';
                if (!this.wasDrawing) {
                    this.strokes.push([]);
                    sound.play('select');
                }
                this.strokes[this.strokes.length - 1].push({
                    x, y,
                    color: this.currentColor,
                    size: this.brushSize
                });
                this.wasDrawing = true;
            } else if (this.isAllFingersOpen(hand)) {
                this.mode = 'ERASE';
                this.wasDrawing = false;
                // Erase where palm center is
                const palmX = (1 - hand[9].x) * this.canvas.width;
                const palmY = hand[9].y * this.canvas.height;
                this.eraseAt(palmX, palmY, 50);
            } else if (this.isFist(hand)) {
                this.mode = 'FIST';
                this.wasDrawing = false;
            } else {
                this.mode = 'IDLE';
                this.wasDrawing = false;
            }
        } else {
            this.mode = 'NO HAND';
            this.wasDrawing = false;
        }

        const modeEl = document.getElementById('draw-mode');
        if (modeEl) {
            const colors = { 'DRAW': '#00f2ff', 'ERASE': '#ff3e3e', 'FIST': '#aaa', 'IDLE': '#666', 'NO HAND': '#444' };
            modeEl.textContent = this.mode;
            modeEl.style.color = colors[this.mode] || '#fff';
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw all strokes
        this.strokes.forEach(stroke => {
            if (stroke.length < 2) return;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.shadowBlur = 12;
            this.ctx.strokeStyle = stroke[0].color;
            this.ctx.shadowColor = stroke[0].color;
            this.ctx.lineWidth = stroke[0].size;
            this.ctx.beginPath();
            this.ctx.moveTo(stroke[0].x, stroke[0].y);
            for (let i = 1; i < stroke.length; i++) {
                // Smooth using midpoint
                const mx = (stroke[i-1].x + stroke[i].x) / 2;
                const my = (stroke[i-1].y + stroke[i].y) / 2;
                this.ctx.quadraticCurveTo(stroke[i-1].x, stroke[i-1].y, mx, my);
            }
            this.ctx.stroke();
        });

        // Cursor
        const results = this.gameState.results;
        if (results?.landmarks?.length > 0) {
            const hand = results.landmarks[0];
            const x = (1 - hand[8].x) * this.canvas.width;
            const y = hand[8].y * this.canvas.height;

            this.ctx.shadowBlur = 0;
            if (this.mode === 'DRAW') {
                this.ctx.fillStyle = this.currentColor;
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = this.currentColor;
                this.ctx.beginPath();
                this.ctx.arc(x, y, this.brushSize, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (this.mode === 'ERASE') {
                const px = (1 - hand[9].x) * this.canvas.width;
                const py = hand[9].y * this.canvas.height;
                this.ctx.strokeStyle = 'rgba(255,100,100,0.7)';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(px, py, 50, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.fillStyle = 'rgba(255,100,100,0.1)';
                this.ctx.fill();
            } else {
                // Idle cursor dot
                this.ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.arc(x, y, 8, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }

        this.ctx.shadowBlur = 0;
    }

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    destroy() {
        this.isRunning = false;
        if (this.toolbar) this.toolbar.remove();
    }
}
