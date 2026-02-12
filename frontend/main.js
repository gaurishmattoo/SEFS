/**
 * SEFS Main — Entry point. Initializes all modules, connects WebSocket.
 */

import { initParticles } from './particles.js';
import { initGraph, updateGraph } from './graph.js';
import { renderClusters, initUploadZone } from './sidebar.js';

// --- State ---
let state = { clusters: {}, files: [], unclustered: [] };
let ws = null;
let reconnectTimer = null;

// --- API ---
const API_BASE = '';

async function fetchState() {
    try {
        const resp = await fetch(`${API_BASE}/api/state`);
        if (resp.ok) {
            state = await resp.json();
            onStateUpdate();
        }
    } catch (e) {
        console.warn('[SEFS] Failed to fetch state:', e);
    }
}

async function uploadFiles(fileList) {
    for (const file of fileList) {
        const fd = new FormData();
        fd.append('file', file);
        try {
            const resp = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: fd });
            const result = await resp.json();
            console.log('[SEFS] Uploaded:', result.filename);
        } catch (e) {
            console.error('[SEFS] Upload failed:', e);
        }
    }
}

function openFile(fileInfo) {
    // Try to open the file via backend
    const name = typeof fileInfo === 'string' ? fileInfo.split(/[\\/]/).pop() : fileInfo.name;
    window.open(`${API_BASE}/api/open/${encodeURIComponent(name)}`, '_blank');
}

// --- WebSocket ---
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.addEventListener('open', () => {
        console.log('[WS] Connected');
        setConnectionStatus(true);
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
    });

    ws.addEventListener('message', (evt) => {
        try {
            state = JSON.parse(evt.data);
            onStateUpdate();
        } catch (e) {
            console.warn('[WS] Bad message:', e);
        }
    });

    ws.addEventListener('close', () => {
        console.log('[WS] Disconnected');
        setConnectionStatus(false);
        // Auto-reconnect
        if (!reconnectTimer) {
            reconnectTimer = setInterval(() => {
                console.log('[WS] Reconnecting...');
                connectWebSocket();
            }, 3000);
        }
    });

    ws.addEventListener('error', () => {
        ws.close();
    });
}

function setConnectionStatus(connected) {
    const badge = document.getElementById('status-badge');
    if (!badge) return;
    const text = badge.querySelector('.status-text');
    if (connected) {
        badge.classList.add('connected');
        if (text) text.textContent = 'Live';
    } else {
        badge.classList.remove('connected');
        if (text) text.textContent = 'Reconnecting…';
    }
}

// --- State Update Handler ---
function onStateUpdate() {
    renderClusters(state, openFile);
    updateGraph(state, openFile);
}

// --- Re-cluster button ---
function initReclusterBtn() {
    const btn = document.getElementById('btn-recluster');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('recluster');
            btn.classList.add('spinning');
            setTimeout(() => btn.classList.remove('spinning'), 1500);
        }
    });
}

// --- Init ---
function init() {
    console.log('[SEFS] Initializing...');

    // Background particles
    initParticles();

    // D3 graph
    initGraph();

    // Sidebar upload
    initUploadZone(uploadFiles);

    // Recluster button
    initReclusterBtn();

    // Connect WebSocket
    connectWebSocket();

    // Fallback: fetch via REST
    fetchState();
}

// Boot
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
