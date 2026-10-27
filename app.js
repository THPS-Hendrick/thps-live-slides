import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, onDisconnect, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCqcVmes8Ie-u_cQ0uP8T3KGqTMinxPwK0",
  authDomain: "thps-live-slides.firebaseapp.com",
  databaseURL: "https://thps-live-slides-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "thps-live-slides",
  storageBucket: "thps-live-slides.firebasestorage.app",
  messagingSenderId: "559550645484",
  appId: "1:559550645484:web:419bc6be49c309a1fb91c9"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// State
let currentRoom = null;
let myPlayerId = `p_${Math.random().toString(36).substr(2, 9)}`;
let players = {}; 
let currentDeck = null;
let slideIndex = 0;

// Host Slide Geometry (Normalized 0 to 1000 scale)
const LOGICAL_WIDTH = 1000;
const LOGICAL_HEIGHT = 562; // 16:9

// ==========================================
// HOST ENGINE
// ==========================================
document.getElementById('host-btn').addEventListener('click', async () => {
    currentRoom = Math.floor(1000 + Math.random() * 9000).toString();
    set(ref(db, `rooms/${currentRoom}`), { created: Date.now(), player_count: 0, players: {} });
    onDisconnect(ref(db, `rooms/${currentRoom}`)).remove();

    document.getElementById('lobby-ui').classList.add('hidden');
    document.getElementById('host-dashboard').classList.remove('hidden');
    document.getElementById('dash-room-code').innerText = currentRoom;

    // Fetch Available Decks
    const deckList = document.getElementById('deck-list');
    deckList.innerHTML = `<button class="deck-select bg-blue-600 p-4 rounded text-white text-xl font-bold" data-url="/decks/speak-without-a-script.json">🎤 Speak Without A Script</button>`;
    
    document.querySelectorAll('.deck-select').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const url = e.target.getAttribute('data-url');
            const res = await fetch(url);
            currentDeck = await res.json();
            
            document.getElementById('host-dashboard').classList.add('hidden');
            document.getElementById('host-ui').classList.remove('hidden');
            document.getElementById('display-room-code').innerText = currentRoom;
            
            onValue(ref(db, `rooms/${currentRoom}/players`), (snapshot) => {
                players = snapshot.val() || {};
            });

            initCanvas();
            renderHTMLSlide();
            setupClicker();
        });
    });
});

function renderHTMLSlide() {
    const slide = currentDeck.slides[slideIndex];
    const layer = document.getElementById('html-slide-layer');
    
    // DIFFERENT TEMPLATES FOR DIFFERENT INFORMATION LAYERS
    if (slide.template === "hero-image") {
        layer.innerHTML = `
            <div class="h-1/2 w-full bg-cover bg-center" style="background-image: url('${slide.layer1_image}')"></div>
            <div class="p-10 flex flex-col justify-center flex-1 bg-white">
                <h2 class="text-3xl text-gray-700 font-medium border-l-8 border-blue-500 pl-4 mb-6">${slide.layer2_text}</h2>
                <!-- Layer 3 Hitbox (Host draws the magnifying glass on canvas over this area) -->
                <div class="nerd-zone" data-l3="${slide.layer3_term}" data-l4="${slide.layer4_explanation}" data-l5="${slide.layer5_excerpt}">
                    <span class="text-2xl font-bold text-blue-700">${slide.layer3_term}</span> 
                    <span class="inline-block w-8 h-8 bg-yellow-400 text-center rounded-full ml-2">🔍</span>
                </div>
            </div>
        `;
    } else if (slide.template === "hero-text") {
        layer.innerHTML = `
            <div class="p-12 flex flex-col justify-center flex-1 bg-white">
                <h1 class="text-6xl font-black text-gray-900 mb-6 tracking-tight uppercase">${slide.layer1_text}</h1>
                <h2 class="text-3xl text-gray-700 font-medium border-l-8 border-blue-500 pl-4 mb-12">${slide.layer2_text}</h2>
                <div class="nerd-zone" data-l3="${slide.layer3_term}" data-l4="${slide.layer4_explanation}" data-l5="${slide.layer5_excerpt}">
                    <span class="text-2xl font-bold text-blue-700">${slide.layer3_term}</span> 
                    <span class="inline-block w-8 h-8 bg-yellow-400 text-center rounded-full ml-2">🔍</span>
                </div>
            </div>
        `;
    }
}

function setupClicker() {
    window.addEventListener('keydown', (e) => {
        if (['ArrowRight', 'PageDown', ' '].includes(e.key) && slideIndex < currentDeck.slides.length - 1) {
            slideIndex++; renderHTMLSlide();
        } else if (['ArrowLeft', 'PageUp'].includes(e.key) && slideIndex > 0) {
            slideIndex--; renderHTMLSlide();
        }
    });
}

// 60FPS HOST RENDER LOOP
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
function initCanvas() {
    const layer = document.getElementById('html-slide-layer');
    canvas.width = layer.clientWidth;
    canvas.height = layer.clientHeight;
    requestAnimationFrame(hostLoop);
}

function hostLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / LOGICAL_WIDTH;
    const scaleY = canvas.height / LOGICAL_HEIGHT;

    Object.keys(players).forEach(pid => {
        const p = players[pid];
        if(!p.x) return;
        
        // Host interprets Player's 'A' button to trigger their phone modal
        if (p.btn_a) {
            // (In a full build, we calculate X/Y overlap with .nerd-zone here)
            const activeZone = document.querySelector('.nerd-zone');
            if (activeZone) {
                update(ref(db, `rooms/${currentRoom}/players/${pid}/modal`), {
                    title: activeZone.getAttribute('data-l3'),
                    body: activeZone.getAttribute('data-l4'),
                    excerpt: activeZone.getAttribute('data-l5')
                });
            }
            // Debounce the button in DB so it doesn't spam
            update(ref(db, `rooms/${currentRoom}/players/${pid}`), { btn_a: false });
        }

        // Draw Domino
        const realX = p.x * scaleX;
        const realY = p.y * scaleY;
        ctx.fillStyle = p.color;
        ctx.fillRect(realX - 18, realY - 27, 36, 54);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(realX - 18, realY - 27, 36, 54);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.initials, realX, realY - 5);
        ctx.fillText(p.number, realX, realY + 15);
    });
    requestAnimationFrame(hostLoop);
}

// ==========================================
// PLAYER CONTROLLER
// ==========================================
let localX = 500;
let localY = 500;
const keys = { up: false, down: false, left: false, right: false };
let btnA = false;

document.getElementById('join-btn').addEventListener('click', () => {
    const code = document.getElementById('room-code').value.toUpperCase();
    const initials = document.getElementById('player-initials').value.toUpperCase();
    
    onValue(ref(db, `rooms/${code}/created`), (snapshot) => {
        if (!snapshot.exists()) return alert("Room not found!");
        currentRoom = code;

        runTransaction(ref(db, `rooms/${currentRoom}/player_count`), (count) => (count || 0) + 1)
        .then((result) => {
            const num = (result.snapshot.val() - 1).toString().padStart(2, '0');
            const color = `hsl(${(num * 137.5) % 360}, 70%, 50%)`;

            const playerRef = ref(db, `rooms/${currentRoom}/players/${myPlayerId}`);
            set(playerRef, { x: localX, y: localY, color, initials: initials.substring(0,2), number: num });
            onDisconnect(playerRef).remove();

            // Listen for Modal Push from Host
            onValue(ref(db, `rooms/${currentRoom}/players/${myPlayerId}/modal`), (snap) => {
                if(snap.exists()) {
                    const data = snap.val();
                    document.getElementById('modal-term').innerText = data.title;
                    document.getElementById('modal-explanation').innerText = data.body;
                    document.getElementById('modal-excerpt').innerText = data.excerpt;
                    document.getElementById('mobile-modal').classList.remove('hidden');
                }
            });

            document.getElementById('lobby-ui').classList.add('hidden');
            document.getElementById('player-ui').classList.remove('hidden');
            document.getElementById('player-room-display').innerText = currentRoom;
            
            setupMobileControls();
        });
    }, { onlyOnce: true });
});

function setupMobileControls() {
    const bindBtn = (id, action) => {
        const el = document.getElementById(id);
        el.addEventListener('touchstart', (e) => { e.preventDefault(); action(true); });
        el.addEventListener('touchend', (e) => { e.preventDefault(); action(false); });
        el.addEventListener('mousedown', () => action(true));
        el.addEventListener('mouseup', () => action(false));
    };

    bindBtn('btn-up', v => keys.up = v);
    bindBtn('btn-down', v => keys.down = v);
    bindBtn('btn-left', v => keys.left = v);
    bindBtn('btn-right', v => keys.right = v);
    
    bindBtn('btn-a', v => { if(v) btnA = true; }); // Send true pulse
    bindBtn('btn-b', v => { if(v) document.getElementById('mobile-modal').classList.add('hidden'); });

    // Local 60FPS physics
    setInterval(() => {
        let dx = 0, dy = 0;
        if(keys.up) dy -= 1;
        if(keys.down) dy += 1;
        if(keys.left) dx -= 1;
        if(keys.right) dx += 1;

        if(dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx*dx + dy*dy);
            localX = Math.max(0, Math.min(LOGICAL_WIDTH, localX + (dx/len) * 5));
            localY = Math.max(0, Math.min(LOGICAL_HEIGHT, localY + (dy/len) * 5));
        }
    }, 1000/60);

    // 10Hz Firebase Sync (Saves Database Quota)
    setInterval(() => {
        let updates = { x: localX, y: localY };
        if(btnA) { updates.btn_a = true; btnA = false; }
        update(ref(db, `rooms/${currentRoom}/players/${myPlayerId}`), updates);
    }, 100);
}
