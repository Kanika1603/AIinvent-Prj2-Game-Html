const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// UI Elements
const scoreElement = document.getElementById('score');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const finalScoreElement = document.getElementById('final-score');

// Game State
let gameState = 'START';
let score = 0;
let highScore = localStorage.getItem('neonRunnerHighScore') || 0;
let level = 1;
let frameCount = 0;
let gameSpeed = 7;
let targetGameSpeed = 7;
let animationId;
let shake = 0;
let flash = 0;
let pulse = 0;
let levelUpTextTimer = 0;
let timeWarp = 1; // 1 = normal, < 1 = slow mo

// Game Objects
let player = null;
let obstacles = [];
let particles = [];
let gridOffset = 0;
let cityscapeOffset = 0;
let rainDrops = [];
let ambientDust = [];

// Themes
const themes = [
    {   // Level 1 — Electric Violet + Hot Pink skyline
        name: "NEON CITY",
        cyan: '#00f5ff', magenta: '#ff007f', purple: '#8800ff', speed: 7,
        bgStyle: 'CITY', gridColor: '#8800ff', floorGlow: 'rgba(136, 0, 255, 0.28)',
        obstacleTypes: ['BLOCK', 'PYRAMID']
    },
    {   // Level 2 — Toxic Green (matrix) + Deep Cobalt
        name: "THE GRID",
        cyan: '#39ff14', magenta: '#ff1744', purple: '#1565c0', speed: 9,
        bgStyle: 'GRID_CORE', gridColor: '#1565c0', floorGlow: 'rgba(21, 101, 192, 0.28)',
        obstacleTypes: ['DRONE', 'FLOATING_CUBE']
    },
    {   // Level 3 — Molten Gold + Lava Red
        name: "HYPER DRIVE",
        cyan: '#ffd600', magenta: '#ff1a00', purple: '#ff6d00', speed: 11,
        bgStyle: 'PIPES', gridColor: '#ff6d00', floorGlow: 'rgba(255, 109, 0, 0.28)',
        obstacleTypes: ['BLOCK', 'LASER_GATE', 'DRONE']
    },
    {   // Level 4 — Ice White + Electric Teal (ethereal)
        name: "THE VOID",
        cyan: '#e8f8ff', magenta: '#00ffe5', purple: '#1a1a3e', speed: 14,
        bgStyle: 'VOID', gridColor: '#00ffe5', floorGlow: 'rgba(0, 255, 229, 0.12)',
        obstacleTypes: ['GLITCH_SHARD', 'DRONE', 'FLOATING_CUBE']
    }
];
let currentColors = themes[0];

// --- MUSIC MANAGER ---
class MusicManager {
    constructor() { this.ctx = null; this.nextNoteTime = 0; this.isPlaying = false; this.tempo = 120; this.beat = 0; }
    init() { if (this.ctx) return; this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    playNote(freq, time, duration, volume = 0.05) {
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(time); osc.stop(time + duration);
    }
    playPerc(time) {
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.type = 'triangle'; osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
        gain.gain.setValueAtTime(0.15, time); gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(time); osc.stop(time + 0.1);
    }
    update() {
        if (!this.isPlaying || !this.ctx) return;
        const lookahead = 0.1;
        while (this.nextNoteTime < this.ctx.currentTime + lookahead) {
            const duration = 60 / this.tempo / 2;
            const notes = [65.41, 77.78, 87.31, 98.00];
            const noteIdx = Math.floor(this.beat / 4) % notes.length;
            this.playNote(notes[noteIdx], this.nextNoteTime, duration, 0.03);
            if (this.beat % 4 === 0) this.playPerc(this.nextNoteTime);
            this.nextNoteTime += duration; this.beat++;
        }
    }
    start() { this.init(); if (this.ctx.state === 'suspended') this.ctx.resume(); this.isPlaying = true; this.nextNoteTime = this.ctx.currentTime; }
    stop() { this.isPlaying = false; }
}
const music = new MusicManager();

// --- RESIZE ---
function resize() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    if (player) player.groundY = canvas.height - 150;
}
window.addEventListener('resize', resize);
resize();

// --- CLASSES ---

class Player {
    constructor() {
        this.width = 60; this.height = 60; this.x = 150;
        this.groundY = canvas.height - 150; this.y = this.groundY;
        this.vy = 0; this.gravity = 0.6; this.jumpPower = -14;
        this.jumpsLeft = 2; this.isGrounded = true;
        this.scaleX = 1; this.scaleY = 1; this.rotation = 0;
    }
    jump() {
        if (this.jumpsLeft > 0) {
            this.vy = this.jumpPower; this.jumpsLeft--; this.isGrounded = false;
            this.scaleX = 0.6; this.scaleY = 1.4;
            createParticles(this.x + this.width / 2, this.y + this.height, 20, currentColors.cyan);
            pulse = 10;
        }
    }
    update() {
        // Time warp affects physics
        this.y += this.vy * timeWarp;
        this.rotation = this.vy * 0.02;
        if (this.y < this.groundY) {
            this.vy += this.gravity * timeWarp;
            this.isGrounded = false;
        } else {
            if (!this.isGrounded) {
                this.isGrounded = true; shake = 5; pulse = 15;
                this.scaleX = 1.4; this.scaleY = 0.6;
                createParticles(this.x + this.width / 2, this.groundY + this.height, 15, currentColors.cyan);
            }
            this.y = this.groundY; this.vy = 0; this.jumpsLeft = 2;
        }
        this.scaleX += (1 - this.scaleX) * 0.2;
        this.scaleY += (1 - this.scaleY) * 0.2;
        if (frameCount % 2 === 0) particles.push(new Particle(this.x, this.y + this.height/2, currentColors.cyan, true));
    }
    draw() {
        ctx.save();
        // Pivot at character center
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.rotate(this.rotation);
        ctx.scale(this.scaleX * 1.5, this.scaleY * 1.5);

        const c = currentColors.cyan;
        const dark = '#0a0a1a';
        const glow = c;

        // ── Jetpack exhaust trail ──────────────────────────────────────────
        const exhaustCount = 6;
        for (let i = 0; i < exhaustCount; i++) {
            const t = i / exhaustCount;
            const exAlpha = (1 - t) * 0.5;
            const exSize = 6 + t * 12;
            const exX = -22 - t * 18;
            const exY = 4 + Math.sin(frameCount * 0.4 + i) * 3;
            ctx.save();
            ctx.globalAlpha = exAlpha;
            ctx.shadowBlur = 20;
            ctx.shadowColor = c;
            // Gradient exhaust puff
            const grad = ctx.createRadialGradient(exX, exY, 0, exX, exY, exSize);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.4, c);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(exX, exY, exSize, exSize * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Global neon glow for character
        ctx.shadowBlur = 20;
        ctx.shadowColor = glow;

        // ── Legs (animated running stride) ────────────────────────────────
        const stride = this.isGrounded ? Math.sin(frameCount * 0.25) * 10 : 0;
        const legW = 7, legH = 14;
        const legColor = shadeColor(c, -30);

        // Back leg
        ctx.fillStyle = shadeColor(dark, 20);
        ctx.save();
        ctx.translate(-4, 14);
        ctx.rotate(-stride * 0.05);
        ctx.fillStyle = legColor;
        ctx.fillRect(-legW / 2, 0, legW, legH);   // thigh
        ctx.fillStyle = dark;
        ctx.fillRect(-legW / 2, legH - 2, legW + 2, 8); // shin
        // Boot
        ctx.fillStyle = c;
        ctx.shadowBlur = 10;
        ctx.fillRect(-legW / 2, legH + 5, legW + 5, 4);
        ctx.restore();

        // Front leg
        ctx.save();
        ctx.translate(4, 14);
        ctx.rotate(stride * 0.05);
        ctx.fillStyle = legColor;
        ctx.fillRect(-legW / 2, 0, legW, legH);
        ctx.fillStyle = dark;
        ctx.fillRect(-legW / 2, legH - 2, legW + 2, 8);
        ctx.fillStyle = c;
        ctx.shadowBlur = 10;
        ctx.fillRect(-legW / 2, legH + 5, legW + 5, 4);
        ctx.restore();

        // ── Torso / Armour ────────────────────────────────────────────────
        // Main body plate
        ctx.fillStyle = '#111122';
        ctx.shadowBlur = 15;
        ctx.shadowColor = glow;
        ctx.fillRect(-11, -4, 22, 18);

        // Shoulder armour pad (left)
        ctx.fillStyle = shadeColor(c, -25);
        ctx.beginPath();
        ctx.moveTo(-14, -4);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-6, -4);
        ctx.closePath();
        ctx.fill();

        // Shoulder armour pad (right)
        ctx.beginPath();
        ctx.moveTo(14, -4);
        ctx.lineTo(10, -10);
        ctx.lineTo(6, -4);
        ctx.closePath();
        ctx.fill();

        // Chest neon stripe
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 0.9 + Math.sin(frameCount * 0.15) * 0.1;
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(0, 4);
        ctx.lineTo(7, 0);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Core energy cell
        const pulse2 = 0.7 + Math.sin(frameCount * 0.2) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${pulse2})`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffffff';
        ctx.fillRect(-3, 2, 6, 6);

        // ── Arm (right, swinging) ──────────────────────────────────────────
        ctx.save();
        ctx.translate(12, -2);
        ctx.rotate(stride * 0.04);
        ctx.fillStyle = shadeColor(c, -20);
        ctx.shadowBlur = 8;
        ctx.fillRect(0, 0, 6, 12);  // upper arm
        ctx.fillStyle = dark;
        ctx.fillRect(0, 10, 7, 6);  // forearm
        ctx.fillStyle = c;
        ctx.shadowBlur = 15;
        ctx.fillRect(0, 14, 8, 3);  // glowing gauntlet
        ctx.restore();

        // ── Helmet ────────────────────────────────────────────────────────
        // Helmet shell
        ctx.shadowBlur = 15;
        ctx.shadowColor = glow;
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.roundRect(-10, -20, 20, 16, 5);
        ctx.fill();

        // Helmet top ridge
        ctx.fillStyle = shadeColor(c, -15);
        ctx.fillRect(-8, -22, 16, 4);

        // Visor glow fill
        const visorGrad = ctx.createLinearGradient(-8, -18, 8, -8);
        visorGrad.addColorStop(0, `${c}cc`);
        visorGrad.addColorStop(0.5, '#ffffff99');
        visorGrad.addColorStop(1, `${c}66`);
        ctx.fillStyle = visorGrad;
        ctx.shadowBlur = 25;
        ctx.shadowColor = c;
        ctx.fillRect(-8, -18, 16, 10);

        // Visor scanline flicker
        ctx.globalAlpha = 0.3 + Math.abs(Math.sin(frameCount * 0.08)) * 0.4;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        for (let sl = 0; sl < 3; sl++) {
            ctx.beginPath();
            ctx.moveTo(-8, -16 + sl * 3);
            ctx.lineTo(8, -16 + sl * 3);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Helmet side vent
        ctx.fillStyle = c;
        ctx.shadowBlur = 10;
        ctx.fillRect(-12, -16, 3, 6);
        ctx.fillRect(9, -16, 3, 6);

        ctx.restore();
    }
}

class Obstacle {
    constructor(type = 'BLOCK') {
        this.type = type;
        this.x = canvas.width + 100;
        this.color = currentColors.magenta;
        this.speed = targetGameSpeed + (Math.random() * 2);
        this.nearMissChecked = false;
        this.rotation = 0;
        this.groundY = canvas.height - 110;

        // Type specific setup
        switch(type) {
            case 'BLOCK':
                this.width = Math.random() * 40 + 30;
                this.height = Math.random() * 60 + 40;
                this.y = this.groundY - this.height + 40;
                break;
            case 'PYRAMID':
                this.width = 60;
                this.height = 60;
                this.y = this.groundY - this.height + 40;
                break;
            case 'DRONE':
                this.width = 50;
                this.height = 30;
                this.y = this.groundY - 120;
                this.baseY = this.y;
                break;
            case 'FLOATING_CUBE':
                this.width = 40;
                this.height = 40;
                this.y = this.groundY - 180 + Math.random() * 100;
                break;
            case 'LASER_GATE':
                this.width = 30;
                this.height = 150;
                this.y = this.groundY - this.height + 40;
                break;
            case 'GLITCH_SHARD':
                this.width = 50;
                this.height = 50;
                this.y = this.groundY - 100 + Math.random() * 50;
                this.vertices = Array.from({length: 6}, () => ({x: Math.random() * 50, y: Math.random() * 50}));
                break;
        }
    }
    update() {
        this.x -= this.speed * timeWarp;
        
        if (this.type === 'DRONE') {
            this.y = this.baseY + Math.sin(frameCount * 0.1) * 30;
        } else if (this.type === 'FLOATING_CUBE') {
            this.rotation += 0.05 * timeWarp;
        } else if (this.type === 'GLITCH_SHARD') {
            if (frameCount % 5 === 0) {
                this.vertices = Array.from({length: 6}, () => ({x: Math.random() * 50, y: Math.random() * 50}));
            }
        }

        // "Near Miss" Detection for Juice
        if (!this.nearMissChecked && this.x < player.x + player.width && this.x > player.x) {
            const dist = Math.abs(player.y + player.height - this.y);
            if (dist < 40 && !player.isGrounded) {
                triggerNearMiss();
                this.nearMissChecked = true;
            }
        }
    }
    draw() {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        
        const depth = 20;
        
        if (this.type === 'BLOCK') {
            // 3D Pillar
            ctx.fillStyle = shadeColor(this.color, -50);
            ctx.beginPath();
            ctx.moveTo(this.x + this.width, this.y);
            ctx.lineTo(this.x + this.width + depth, this.y - depth);
            ctx.lineTo(this.x + this.width + depth, this.y + this.height - depth);
            ctx.lineTo(this.x + this.width, this.y + this.height);
            ctx.fill();

            ctx.fillStyle = shadeColor(this.color, -25);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x + depth, this.y - depth);
            ctx.lineTo(this.x + this.width + depth, this.y - depth);
            ctx.lineTo(this.x + this.width, this.y);
            ctx.fill();

            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            
        } else if (this.type === 'PYRAMID') {
            // 3D Pyramid
            const hw = this.width / 2;
            const h = this.height;
            
            // Back face
            ctx.fillStyle = shadeColor(this.color, -40);
            ctx.beginPath();
            ctx.moveTo(this.x + hw, this.y);
            ctx.lineTo(this.x + this.width + depth, this.y + h - depth);
            ctx.lineTo(this.x + hw + depth, this.y - depth);
            ctx.fill();

            // Front face
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(this.x + hw, this.y);
            ctx.lineTo(this.x, this.y + h);
            ctx.lineTo(this.x + this.width, this.y + h);
            ctx.fill();

        } else if (this.type === 'DRONE') {
            ctx.translate(this.x + this.width/2, this.y + this.height/2);
            ctx.fillStyle = this.color;
            ctx.fillRect(-this.width/2, -5, this.width, 10);
            const bw = 25, bh = 20;
            ctx.fillStyle = shadeColor(this.color, -30);
            ctx.fillRect(-bw/2 + 5, -bh/2 - 5, bw, bh);
            ctx.fillStyle = this.color;
            ctx.fillRect(-bw/2, -bh/2, bw, bh);
            ctx.fillStyle = '#fff';
            ctx.fillRect(-bw/2 + 4, -4, 4, 4);
            ctx.fillRect(bw/2 - 8, -4, 4, 4);
            ctx.beginPath(); ctx.arc(0, 0, 2 + Math.sin(frameCount * 0.2) * 2, 0, Math.PI * 2); ctx.fill();

        } else if (this.type === 'FLOATING_CUBE') {
            ctx.translate(this.x + this.width/2, this.y + this.height/2);
            ctx.rotate(this.rotation);
            const s = this.width / 2;
            ctx.fillStyle = this.color;
            ctx.fillRect(-s, -s, this.width, this.height);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(-s + 5, -s + 5, this.width - 10, this.height - 10);

        } else if (this.type === 'LASER_GATE') {
            // Two pillars with laser between
            ctx.fillStyle = '#444';
            ctx.fillRect(this.x, this.y, 10, this.height);
            ctx.fillRect(this.x + this.width - 10, this.y, 10, this.height);
            
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ff0000';
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 4 + Math.sin(frameCount * 0.5) * 2;
            ctx.beginPath();
            ctx.moveTo(this.x + 5, this.y + 20);
            ctx.lineTo(this.x + this.width - 5, this.y + 20);
            ctx.moveTo(this.x + 5, this.y + this.height - 20);
            ctx.lineTo(this.x + this.width - 5, this.y + this.height - 20);
            ctx.stroke();

        } else if (this.type === 'GLITCH_SHARD') {
            ctx.fillStyle = this.color;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(this.x + this.vertices[0].x, this.y + this.vertices[0].y);
            for(let i=1; i<this.vertices.length; i++) {
                ctx.lineTo(this.x + this.vertices[i].x, this.y + this.vertices[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.stroke();
        }
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color, isTrail = false) {
        this.x = x; this.y = y; this.color = color; this.size = Math.random() * 6 + 2; this.life = 1;
        if (isTrail) { this.vx = -targetGameSpeed * 0.8; this.vy = (Math.random() - 0.5) * 2; this.decay = 0.05; }
        else { this.vx = (Math.random() - 0.5) * 12; this.vy = (Math.random() - 0.5) * 12; this.decay = Math.random() * 0.02 + 0.01; }
    }
    update() { this.x += this.vx * timeWarp; this.y += this.vy * timeWarp; this.life -= this.decay; }
    draw() {
        if (this.life <= 0) return;
        ctx.save(); ctx.globalAlpha = this.life; ctx.shadowBlur = 10; ctx.shadowColor = this.color;
        ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.size, this.size); ctx.restore();
    }
}

// --- RENDERING HELPERS ---

function triggerNearMiss() {
    timeWarp = 0.2; // Dramatic slow-mo
    shake = 10;
    flash = 0.2;
    setTimeout(() => { timeWarp = 1.0; }, 200);
}

function createParticles(x, y, count, color) { for (let i = 0; i < count; i++) particles.push(new Particle(x, y, color)); }

function shadeColor(color, percent) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);
    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);
    R = (R < 255) ? R : 255; G = (G < 255) ? G : 255; B = (B < 255) ? B : 255;
    const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
    const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
    const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));
    return "#" + RR + GG + BB;
}

// --- ATMOSPHERE SYSTEMS ---

function initRain() {
    const groundY = canvas.height - 110;
    rainDrops = Array.from({ length: 80 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * groundY,
        length: Math.random() * 22 + 8,
        speed: Math.random() * 12 + 7
    }));
}

function initDust() {
    const groundY = canvas.height - 110;
    ambientDust = Array.from({ length: 25 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * groundY,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(Math.random() * 0.5 + 0.1)
    }));
}

function drawRain() {
    const groundY = canvas.height - 110;
    ctx.save();
    ctx.strokeStyle = currentColors.cyan;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.18;
    ctx.shadowBlur = 0;
    ctx.beginPath(); // Single path for ALL drops = 1 stroke call
    for (const drop of rainDrops) {
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.length * 0.18, drop.y + drop.length);
        drop.y += drop.speed * timeWarp;
        drop.x -= drop.speed * 0.18 * timeWarp;
        if (drop.y > groundY || drop.x < 0) {
            drop.x = Math.random() * canvas.width;
            drop.y = -drop.length;
        }
    }
    ctx.stroke();
    ctx.restore();
}

function drawAmbientDust() {
    const groundY = canvas.height - 110;
    ctx.save();
    ctx.fillStyle = currentColors.magenta;
    ctx.globalAlpha = 0.25;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    for (const d of ambientDust) {
        ctx.rect(d.x, d.y, d.r * 2, d.r * 2);
        d.x += d.vx * timeWarp;
        d.y += d.vy * timeWarp;
        if (d.y < 0 || d.y > groundY || d.x < 0 || d.x > canvas.width) {
            d.x = Math.random() * canvas.width;
            d.y = groundY;
            d.vy = -(Math.random() * 0.5 + 0.1);
        }
    }
    ctx.fill();
    ctx.restore();
}

function drawBillboards() {
    const adTexts = ['NETRUNNER', 'SYNTH.EXE', 'JACK IN', 'GHOST DATA', '▲ NEON CITY', 'MEGA CORP', 'UPLOAD NOW', '404: SOUL'];
    const billboardData = [
        { speed: 0.6, y: 55,  alt: false },
        { speed: 0.9, y: 120, alt: true  },
        { speed: 0.7, y: 85,  alt: false },
        { speed: 1.1, y: 45,  alt: true  },
        { speed: 0.5, y: 160, alt: false },
        { speed: 0.8, y: 100, alt: true  }
    ];
    ctx.save();
    ctx.font = 'bold 15px Orbitron';
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 14;
    for (let i = 0; i < billboardData.length; i++) {
        const bd = billboardData[i];
        let x = ((i * 550 - cityscapeOffset * bd.speed) % (6 * 550));
        if (x < -250) x += 3300;
        const col = bd.alt ? currentColors.magenta : currentColors.cyan;
        const text = adTexts[i % adTexts.length];
        const boxW = 160, boxH = 24;
        ctx.shadowColor = col;

        ctx.globalAlpha = 0.12;
        ctx.fillStyle = col;
        ctx.fillRect(x - 6, bd.y - 18, boxW, boxH);

        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = col;
        ctx.strokeRect(x - 6, bd.y - 18, boxW, boxH);

        const blink = Math.sin(frameCount * 0.08 + i) > 0.3;
        if (blink) {
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.9;
            ctx.fillRect(x - 6, bd.y - 18, 4, 4);
            ctx.fillRect(x + boxW - 4, bd.y - 18, 4, 4);
        }

        ctx.globalAlpha = 0.55;
        ctx.fillStyle = col;
        ctx.fillText(text, x, bd.y);
    }
    ctx.restore();
}

function drawSpeeders() {
    const skyBand = canvas.height * 0.55;
    ctx.save();
    ctx.shadowBlur = 0; // No shadow - too expensive per-element
    for (let i = 0; i < 4; i++) { // Reduced from 5 to 4
        let x = ((i * 480 - cityscapeOffset * (1.5 + i * 0.4)) % (4 * 480));
        if (x < -60) x += 1920;
        const y = 40 + (i * 79) % (skyBand - 40);
        const col = i % 2 === 0 ? currentColors.cyan : currentColors.magenta;
        const alpha = 0.18 + (i % 3) * 0.07;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = col;

        // Speeder body
        ctx.beginPath();
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x + 32, y);
        ctx.lineTo(x + 36, y + 5);
        ctx.lineTo(x + 32, y + 10);
        ctx.lineTo(x, y + 7);
        ctx.closePath();
        ctx.fill();

        // Engine glow - simple white rect (no ellipse/gradient)
        ctx.globalAlpha = Math.min(1, alpha * 1.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 6, y + 2, 6, 5);

        // Speed streak - plain color lines (no createLinearGradient)
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.globalAlpha = alpha * 0.5;
        const tailLen = 60 + (i * 27) % 60;
        ctx.beginPath();
        ctx.moveTo(x - tailLen, y + 3);
        ctx.lineTo(x, y + 3);
        ctx.moveTo(x - tailLen * 0.6, y + 7);
        ctx.lineTo(x, y + 7);
        ctx.stroke();
    }
    ctx.restore();
}

function drawCityscape() {
    cityscapeOffset += targetGameSpeed * 0.1 * timeWarp;
    ctx.save();
    
    if (currentColors.bgStyle === 'CITY') {
        ctx.strokeStyle = currentColors.purple; ctx.lineWidth = 2; ctx.globalAlpha = 0.2;
        const count = 12, spacing = 300, groundY = canvas.height - 110;
        for (let i = 0; i < count; i++) {
            let x = ((i * spacing - cityscapeOffset) % (count * spacing));
            if (x < -spacing) x += (count * spacing);
            const h = 250 + (i * 97) % 200;
            const w = 100;
            // Draw 3D-ish building
            ctx.strokeRect(x, groundY - h, w, h);
            ctx.beginPath();
            ctx.moveTo(x + w, groundY - h);
            ctx.lineTo(x + w + 30, groundY - h - 30);
            ctx.lineTo(x + w + 30, groundY - 30);
            ctx.lineTo(x + w, groundY);
            ctx.stroke();
            // Windows
            for(let wy = groundY - h + 20; wy < groundY - 20; wy += 40) {
                ctx.strokeRect(x + 20, wy, 20, 10);
            }
        }
    } else if (currentColors.bgStyle === 'GRID_CORE') {
        ctx.strokeStyle = currentColors.cyan; ctx.lineWidth = 1; ctx.globalAlpha = 0.1;
        for (let i = 0; i < 15; i++) {
            let x = (i * 200 - cityscapeOffset * 2) % (15 * 200);
            if (x < -200) x += 3000;
            ctx.strokeRect(x, 100 + (i * 50) % 300, 150, 150);
            ctx.beginPath();
            ctx.moveTo(x, 100 + (i * 50) % 300);
            ctx.lineTo(x + 200, 100 + (i * 50) % 300 + 100);
            ctx.stroke();
        }
    } else if (currentColors.bgStyle === 'PIPES') {
        ctx.strokeStyle = currentColors.magenta; ctx.lineWidth = 15; ctx.globalAlpha = 0.1;
        for (let i = 0; i < 5; i++) {
            let y = (i * 150 + frameCount) % canvas.height;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y + 200); ctx.stroke();
        }
    } else {
        // VOID - Glitchy squares
        ctx.fillStyle = currentColors.magenta; ctx.globalAlpha = 0.05;
        for (let i = 0; i < 10; i++) {
            const size = 50 + Math.random() * 200;
            ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, size, size);
        }
    }
    ctx.restore();
}

function drawBackground() {
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Ambient glow based on theme
    const ambientGrad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width);
    ambientGrad.addColorStop(0, 'rgba(0,0,0,0)');
    ambientGrad.addColorStop(1, currentColors.floorGlow);
    ctx.fillStyle = ambientGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawCityscape();
    drawBillboards();
    drawSpeeders();
    drawRain();
    drawAmbientDust();

    const groundY = canvas.height - 110;
    
    // Horizon line glow
    ctx.save();
    ctx.shadowBlur = 30; ctx.shadowColor = currentColors.gridColor;
    ctx.strokeStyle = currentColors.gridColor; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(canvas.width, groundY); ctx.stroke();
    ctx.restore();

    // Perspective Grid
    ctx.save(); 
    ctx.strokeStyle = currentColors.gridColor; ctx.globalAlpha = 0.3;
    const gridSize = 80; 
    gridOffset = (gridOffset + targetGameSpeed * timeWarp) % gridSize;
    
    // Vanishing point lines
    const vanishingX = canvas.width / 2;
    const vanishingY = groundY - 50;
    for (let i = -10; i <= 20; i++) {
        ctx.beginPath();
        ctx.moveTo(vanishingX, vanishingY);
        const targetX = (i * (canvas.width / 10)) - (gridOffset * 2);
        ctx.lineTo(targetX, canvas.height);
        ctx.stroke();
    }
    
    // Horizontal lines with perspective scaling
    let curY = groundY, gap = 8;
    for (let i = 0; i < 25; i++) {
        const opacity = Math.max(0, 0.5 - (i * 0.02));
        ctx.globalAlpha = opacity;
        ctx.beginPath(); ctx.moveTo(0, curY); ctx.lineTo(canvas.width, curY); ctx.stroke();
        curY += gap; gap *= 1.15; if (curY > canvas.height) break;
    }
    ctx.restore();
}

function drawLevelUp() {
    if (levelUpTextTimer > 0) {
        ctx.save(); ctx.font = 'bold 70px Orbitron'; ctx.fillStyle = currentColors.cyan; ctx.textAlign = 'center';
        ctx.shadowBlur = 30; ctx.shadowColor = currentColors.cyan; ctx.globalAlpha = Math.min(1, levelUpTextTimer / 50);
        ctx.fillText(themes[level-1].name, canvas.width / 2, canvas.height / 2);
        ctx.font = '20px Orbitron'; ctx.fillText("INITIATING NEW SEQUENCE...", canvas.width / 2, canvas.height / 2 + 60);
        ctx.restore(); levelUpTextTimer--;
    }
}

function drawHighscore() {
    ctx.save(); ctx.font = '14px Orbitron'; ctx.fillStyle = 'rgba(0, 255, 255, 0.5)'; ctx.textAlign = 'left';
    ctx.fillText(`HI: ${Math.floor(highScore / 10)}`, 40, 50); ctx.restore();
}

function checkCollision(r1, r2) {
    const m = 8;
    return r1.x + m < r2.x + r2.width - m && r1.x + r1.width - m > r2.x + m && r1.y + m < r2.y + r2.height - m && r1.y + r1.height - m > r2.y + m;
}

function reset() {
    player = new Player(); obstacles = []; particles = []; score = 0; level = 1; frameCount = 0;
    targetGameSpeed = themes[0].speed; currentColors = themes[0]; scoreElement.innerText = '0';
    levelUpTextTimer = 100; timeWarp = 1;
    initRain(); initDust();
}

function gameOver() {
    gameState = 'GAMEOVER';
    const finalScore = Math.floor(score / 10);
    if (finalScore > highScore / 10) {
        highScore = score;
        localStorage.setItem('neonRunnerHighScore', highScore);
    }
    finalScoreElement.innerText = finalScore;
    gameOverScreen.classList.remove('hidden');
    shake = 30; flash = 1; timeWarp = 1;
    if (player) { createParticles(player.x, player.y, 80, currentColors.cyan); createParticles(player.x, player.y, 80, currentColors.magenta); }
}

function update() {
    if (gameState !== 'PLAYING') return;
    music.update();
    frameCount++; score++;
    if (score % 10 === 0) scoreElement.innerText = Math.floor(score / 10);
    const nL = Math.floor(score / 2000) + 1;
    if (nL !== level && nL <= themes.length) {
        level = nL; currentColors = themes[level - 1]; flash = 0.8; targetGameSpeed = themes[level-1].speed;
        levelUpTextTimer = 120; shake = 15; music.tempo += 5;
    }
    if (player) player.update();
    const sR = Math.max(30, 100 - (level * 15));
    if (frameCount % sR === 0) {
        const types = currentColors.obstacleTypes;
        const type = types[Math.floor(Math.random() * types.length)];
        
        if (level >= 3 && Math.random() > 0.7) {
            obstacles.push(new Obstacle(type));
            setTimeout(() => { 
                if (gameState === 'PLAYING') {
                    const secondType = types[Math.floor(Math.random() * types.length)];
                    obstacles.push(new Obstacle(secondType)); 
                }
            }, 400 / timeWarp);
        } else {
            obstacles.push(new Obstacle(type));
        }
    }
    for (let i = obstacles.length - 1; i >= 0; i--) {
        obstacles[i].update();
        if (player && checkCollision(player, obstacles[i])) gameOver();
        if (obstacles[i].x < -200) obstacles.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(); if (particles[i].life <= 0) particles.splice(i, 1); }
    if (shake > 0) shake *= 0.9; if (flash > 0) flash *= 0.95; if (pulse > 0) pulse *= 0.85;
}

function draw() {
    try {
        ctx.save();
        if (shake > 0.1) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        if (player && gameState === 'PLAYING') {
            const tilt = player.vy * 0.002;
            ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(tilt); ctx.translate(-canvas.width / 2, -canvas.height / 2);
        }
        drawBackground();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < particles.length; i++) particles[i].draw();
        for (let i = 0; i < obstacles.length; i++) obstacles[i].draw();
        if (player && (gameState === 'PLAYING' || gameState === 'START')) player.draw();
        ctx.globalCompositeOperation = 'source-over';
        drawLevelUp();
        drawHighscore();
        if (flash > 0.01) { ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.4})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        if (pulse > 0.1) {
            const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width);
            grad.addColorStop(0, 'transparent'); grad.addColorStop(1, `rgba(0, 255, 255, ${pulse * 0.03})`);
            ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.restore();
    } catch (e) { console.error(e); }
}

function loop() { update(); draw(); animationId = requestAnimationFrame(loop); }

function jumpAction(e) {
    if (e.type === 'keydown' && e.code !== 'Space') return;
    if (gameState === 'PLAYING' && player) player.jump();
    if (e.code === 'Space') e.preventDefault();
}

window.addEventListener('keydown', jumpAction); window.addEventListener('touchstart', jumpAction); window.addEventListener('mousedown', jumpAction);

startBtn.addEventListener('click', (e) => {
    e.stopPropagation(); gameState = 'PLAYING'; startScreen.classList.add('hidden');
    music.start(); reset();
});

restartBtn.addEventListener('click', (e) => {
    e.stopPropagation(); gameState = 'PLAYING'; gameOverScreen.classList.add('hidden');
    music.start(); reset();
});

reset(); loop();
