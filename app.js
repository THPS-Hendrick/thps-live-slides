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
    deckList.innerHTML = `<button class="deck-select bg-blue-600 hover:bg-blue-500 transition p-4 rounded text-white text-xl font-bold w-full" data-url="/decks/speak-without-a-script.json">🎤 Speak Without A Script</button>`;
    
    document.querySelectorAll('.deck-select').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            // 1. Fetch JSON
            const url = e.target.getAttribute('data-url');
            const res = await fetch(url);
            currentDeck = await res.json();
            
            // 2. Preload Images (Show loading state on button)
            const originalText = e.target.innerText;
            e.target.innerText = "Loading assets...";
            await preloadImages(currentDeck.slides);
            e.target.innerText = originalText;
            
            // 3. Start Presentation
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

// ==========================================
// IMAGE PRELOADER
// ==========================================
async function preloadImages(slides) {
    const promises = slides.map(slide => {
        return new Promise((resolve) => {
            // Find any key in the slide JSON that contains the word "image"
            const imgKeys = Object.keys(slide).filter(k => k.includes('image'));
            if (imgKeys.length === 0) {
                resolve();
                return;
            }
            
            let loaded = 0;
            imgKeys.forEach(key => {
                if (slide[key]) {
                    const img = new Image();
                    img.onload = () => { loaded++; if (loaded === imgKeys.length) resolve(); };
                    img.onerror = () => { loaded++; if (loaded === imgKeys.length) resolve(); };
                    img.src = slide[key];
                } else {
                    loaded++; if (loaded === imgKeys.length) resolve();
                }
            });
        });
    });
    await Promise.all(promises);
    console.log("All images preloaded.");
}

// ==========================================
// HOST RENDERING LOGIC (18 Templates)
// ==========================================
function createNerdZone(l3_term, l4_exp, l5_src) {
    if (!l3_term && !l4_exp) return '';
    return `
        <div class="nerd-zone inline-flex items-center gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm" 
             data-l3="${l3_term || ''}" data-l4="${l4_exp || ''}" data-l5="${l5_src || ''}">
            <span class="text-2xl font-bold text-blue-700">${l3_term || 'Interact'}</span> 
            <span class="w-10 h-10 bg-yellow-400 text-yellow-900 flex items-center justify-center rounded-full shadow font-bold text-lg animate-pulse">A</span>
        </div>
    `;
}

function renderHTMLSlide() {
    const s = currentDeck.slides[slideIndex];
    const layer = document.getElementById('html-slide-layer');
    
    // Helper to render an H1 (Text or Image)
    const renderH1 = (text, img, classes = "text-6xl font-black text-gray-900 uppercase tracking-tight") => {
        if (img && text) return `<div class="relative w-full h-full min-h-[300px] bg-cover bg-center rounded-xl overflow-hidden shadow-lg" style="background-image: url('${img}')"><div class="absolute inset-0 bg-black/40 flex items-center justify-center p-8"><h1 class="${classes} text-white text-center">${text}</h1></div></div>`;
        if (img) return `<div class="w-full h-full min-h-[300px] bg-cover bg-center rounded-xl shadow-lg" style="background-image: url('${img}')"></div>`;
        return `<h1 class="${classes}">${text || ''}</h1>`;
    };

    // Helper to render an H2
    const renderH2 = (text, img) => {
        let html = `<div class="flex flex-col gap-4">`;
        if (img) html += `<img src="${img}" class="w-32 h-32 object-cover rounded-lg shadow" />`;
        if (text) html += `<h2 class="text-3xl text-gray-700 font-medium leading-relaxed border-l-8 border-blue-500 pl-4">${text}</h2>`;
        html += `</div>`;
        return html;
    };

    // Helper for visible H3/H4 (Non-hidden)
    const renderH3 = (term) => term ? `<div class="inline-block bg-blue-100 text-blue-800 text-2xl font-bold px-6 py-3 rounded-full">${term}</div>` : '';
    const renderH4 = (exp) => exp ? `<div class="text-xl text-gray-600 bg-gray-100 p-6 rounded-lg border border-gray-300">${exp}</div>` : '';

    let content = `<div class="p-12 w-full h-full flex flex-col justify-center bg-white gap-8">`;

    // THE 18 TEMPLATE ROUTER
    switch (s.template.split('_')[0]) { 
        
        // --- FAMILIAR INFO (1-4 Bits) ---
        case 'S1-H1': 
            content += `<div class="flex-1 flex items-center justify-center text-center">${renderH1(s.layer1_text, s.layer1_image, "text-8xl font-black text-gray-900 uppercase tracking-tighter")}</div>`;
            break;
            
        case 'S2-H1s': 
            content += `<div class="flex-1 grid grid-cols-2 gap-8 h-full">
                ${renderH1(s.layer1_text_a, s.layer1_image_a)}
                ${renderH1(s.layer1_text_b, s.layer1_image_b)}
            </div>`;
            break;
            
        case 'S3-H1-H2': 
            content += `
                ${renderH1(s.layer1_text, s.layer1_image)}
                <div class="mt-8">${renderH2(s.layer2_text, s.layer2_image)}</div>`;
            break;

        case 'S4-H1-H1-H1': 
            content += `<div class="flex-1 grid grid-cols-3 gap-6 h-full">
                ${renderH1(s.layer1_text_a, s.layer1_image_a)}
                ${renderH1(s.layer1_text_b, s.layer1_image_b)}
                ${renderH1(s.layer1_text_c, s.layer1_image_c)}
            </div>`;
            break;

        case 'S5-H1s-H2': 
            content += `
                <div class="grid grid-cols-2 gap-8 h-1/2 mb-8">
                    ${renderH1(s.layer1_text_a, s.layer1_image_a)}
                    ${renderH1(s.layer1_text_b, s.layer1_image_b)}
                </div>
                ${renderH2(s.layer2_text, null)}`;
            break;

        case 'S6-H1-H2s': 
            content += `<div class="grid grid-cols-2 gap-12 h-full items-center">
                ${renderH1(s.layer1_text, s.layer1_image)}
                <div class="flex flex-col gap-12">
                    ${renderH2(s.layer2_text_a, s.layer2_image_a)}
                    ${renderH2(s.layer2_text_b, s.layer2_image_b)}
                </div>
            </div>`;
            break;

        case 'S7-H1s-H2s': 
            content += `<div class="grid grid-cols-2 gap-12 h-full">
                <div class="flex flex-col gap-6">${renderH1(s.layer1_text_a, s.layer1_image_a)} ${renderH2(s.layer2_text_a)}</div>
                <div class="flex flex-col gap-6">${renderH1(s.layer1_text_b, s.layer1_image_b)} ${renderH2(s.layer2_text_b)}</div>
            </div>`;
            break;

        // --- SIMPLE INFO (3-4 Bits) ---
        case 'S8-H1-H2-H3': 
        case 'S9-H1-H2-H3': 
        case 'S10-H1-H2-H3': 
        case 'S11-H1-H2-H3': 
            content += `
                ${renderH1(s.layer1_text, s.layer1_image)}
                ${renderH2(s.layer2_text, s.layer2_image)}
                <div class="mt-auto">${renderH3(s.layer3_term)}</div>
            `;
            break;

        case 'S12-H1-H2-H3-H4': 
            content += `
                ${renderH1(s.layer1_text, s.layer1_image)}
                ${renderH2(s.layer2_text, s.layer2_image)}
                <div class="grid grid-cols-2 gap-8 mt-auto items-center">
                    ${renderH3(s.layer3_term)}
                    ${renderH4(s.layer4_explanation)}
                </div>
            `;
            break;

        // --- COMPLEX INFO (5 Bits - Nerd Zones Required) ---
        case 'S13-H1s-H2s-H3z': 
            content += `<div class="grid grid-cols-2 gap-12 h-full relative">
                <div class="flex flex-col gap-4">${renderH1(s.layer1_text_a, s.layer1_image_a)} ${renderH2(s.layer2_text_a)}</div>
                <div class="flex flex-col gap-4">${renderH1(s.layer1_text_b, s.layer1_image_b)} ${renderH2(s.layer2_text_b)}</div>
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div class="pointer-events-auto bg-white p-2 rounded-xl shadow-2xl">
                        ${createNerdZone(s.layer3_term, s.layer4_explanation, s.layer5_excerpt)}
                    </div>
                </div>
            </div>`;
            break;

        case 'S14-H1-H2s-H3s': 
            content += `
                ${renderH1(s.layer1_text, s.layer1_image)}
                <div class="grid grid-cols-2 gap-12 mt-6 flex-1">
                    <div class="flex flex-col justify-between">${renderH2(s.layer2_text_a)} ${renderH3(s.layer3_term_a)}</div>
                    <div class="flex flex-col justify-between">${renderH2(s.layer2_text_b)} 
                        <div class="self-start">${createNerdZone("Missing Concept", s.layer3_term_b, s.layer5_excerpt)}</div>
                    </div>
                </div>
            `;
            break;

        case 'S15-H1s-H2-H3-H4z': 
            content += `
                <div class="grid grid-cols-2 gap-8 h-1/3 mb-6">
                    ${renderH1(s.layer1_text_a, s.layer1_image_a)}
                    ${renderH1(s.layer1_text_b, s.layer1_image_b)}
                </div>
                ${renderH2(s.layer2_text)}
                <div class="mt-auto self-start">${createNerdZone(s.layer3_term, s.layer4_explanation, s.layer5_excerpt)}</div>
            `;
            break;

        case 'S16-H1-H2s-H3-H4z': 
            content += `<div class="grid grid-cols-2 gap-12 h-full items-center">
                ${renderH1(s.layer1_text, s.layer1_image)}
                <div class="flex flex-col gap-8">
                    ${renderH2(s.layer2_text_a)}
                    ${renderH2(s.layer2_text_b)}
                    ${createNerdZone(s.layer3_term, s.layer4_explanation, s.layer5_excerpt)}
                </div>
            </div>`;
            break;

        case 'S17-H1-H2-H3s-H4z': 
            content += `
                ${renderH1(s.layer1_text, s.layer1_image)}
                ${renderH2(s.layer2_text)}
                <div class="grid grid-cols-2 gap-8 mt-auto">
                    ${renderH3(s.layer3_term_a)}
                    <div class="self-start">${createNerdZone(s.layer3_term_b, s.layer4_explanation, s.layer5_excerpt)}</div>
                </div>
            `;
            break;

        case 'S18-H1-H2-H3-H4-H5z': 
            content += `
                ${renderH1(s.layer1_text, s.layer1_image)}
                ${renderH2(s.layer2_text)}
                <div class="grid grid-cols-2 gap-8 mt-4 items-center flex-1">
                    <div>${renderH3(s.layer3_term)}</div>
                    <div>${renderH4(s.layer4_explanation)}</div>
                </div>
                <div class="mt-4 self-end">${createNerdZone("Source / Excerpt", "Read the technical excerpt.", s.layer5_excerpt)}</div>
            `;
            break;

        default:
            content += `<h1 class="text-4xl text-red-500">Template ${s.template} not recognized.</h1>`;
    }

    content += `</div>`;
    layer.innerHTML = content;
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

// ==========================================
// 60FPS HOST RENDER LOOP
// ==========================================
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
            // Very simple distance check to trigger Nerd Zone
            const activeZone = document.querySelector('.nerd-zone');
            if (activeZone) {
                // In a production app, we would calculate actual bounding box overlap here.
                // For now, if the zone exists and A is pressed, trigger the modal.
                update(ref(db, `rooms/${currentRoom}/players/${pid}/modal`), {
                    title: activeZone.getAttribute('data-l3'),
                    body: activeZone.getAttribute('data-l4'),
                    excerpt: activeZone.getAttribute('data-l5')
                });
            }
            // Debounce the button in DB so it doesn't spam
            update(ref(db, `rooms/${currentRoom}/players/${pid}`), { btn_a: null });
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
                    document.getElementById('modal-term').innerText = data.title || '';
                    document.getElementById('modal-explanation').innerText = data.body || '';
                    document.getElementById('modal-excerpt').innerText = data.excerpt || '';
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
