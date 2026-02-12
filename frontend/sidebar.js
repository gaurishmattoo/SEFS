/**
 * SEFS Sidebar — Cluster cards, upload zone, and stats.
 */

// Cluster color palette
const CLUSTER_COLORS = [
    '#a78bfa', '#6ee7b7', '#f472b6', '#fbbf24',
    '#60a5fa', '#fb7185', '#34d399', '#c084fc',
    '#f59e0b', '#38bdf8',
];

export function getClusterColor(index) {
    return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
}

/**
 * Render cluster cards in the sidebar.
 */
export function renderClusters(state, onFileClick) {
    const container = document.getElementById('clusters-container');
    if (!container) return;

    const clusters = state.clusters || {};
    const clusterNames = Object.keys(clusters);

    if (clusterNames.length === 0) {
        container.innerHTML = '<p style="font-size:12px;color:var(--text-muted);padding:8px 0;">No clusters yet</p>';
        updateStats(0, 0);
        return;
    }

    let totalFiles = 0;
    const html = clusterNames.map((name, idx) => {
        const files = clusters[name] || [];
        totalFiles += files.length;
        const color = getClusterColor(idx);
        const displayName = name.replace(/_/g, ' ');

        const fileItems = files.map(f => `
      <div class="cluster-file-item" data-path="${f.path}" title="${f.name}">
        <span class="file-ext">${(f.ext || '').replace('.', '')}</span>
        <span class="file-name">${f.name}</span>
      </div>
    `).join('');

        return `
      <div class="cluster-card" data-cluster="${name}">
        <div class="cluster-card-header" style="--cluster-color: ${color}">
          <span class="cluster-dot" style="background: ${color}; color: ${color};"></span>
          <span class="cluster-card-title" title="${displayName}">${displayName}</span>
          <span class="cluster-card-count">${files.length}</span>
        </div>
        <div class="cluster-card-files">${fileItems}</div>
      </div>
    `;
    }).join('');

    container.innerHTML = html;
    updateStats(totalFiles + (state.unclustered || []).length, clusterNames.length);

    // Toggle expand
    container.querySelectorAll('.cluster-card-header').forEach(header => {
        header.addEventListener('click', () => {
            header.parentElement.classList.toggle('expanded');
        });
    });

    // File click
    container.querySelectorAll('.cluster-file-item').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.dataset.path;
            if (onFileClick) onFileClick(path);
        });
    });
}

/**
 * Update stats counters.
 */
function updateStats(files, clusters) {
    const fEl = document.getElementById('stat-files');
    const cEl = document.getElementById('stat-clusters');
    if (fEl) fEl.textContent = files;
    if (cEl) cEl.textContent = clusters;
}

/**
 * Set up upload zone interactions.
 */
export function initUploadZone(onUpload) {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) onUpload(files);
    });

    input.addEventListener('change', () => {
        if (input.files.length) onUpload(input.files);
        input.value = '';
    });
}
