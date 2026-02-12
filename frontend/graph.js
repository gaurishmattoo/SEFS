/**
 * SEFS Graph — D3.js force-directed graph visualization.
 * Files are glowing nodes, clusters are color-coded with convex hulls.
 */

import * as d3 from 'd3';
import { getClusterColor } from './sidebar.js';

let svg, gLinks, gHulls, gNodes, gLabels;
let simulation;
let currentNodes = [];
let currentLinks = [];
let tooltip;
let width, height;

// File extension icon map
const EXT_ICONS = {
    '.pdf': '📄',
    '.txt': '📝',
};

export function initGraph() {
    svg = d3.select('#graph-svg');
    const viewport = document.getElementById('graph-viewport');
    tooltip = document.getElementById('tooltip');

    width = viewport.clientWidth;
    height = viewport.clientHeight;

    svg.attr('viewBox', [0, 0, width, height]);

    // Layer order: hulls → links → nodes → labels
    gHulls = svg.append('g').attr('class', 'hulls-layer');
    gLinks = svg.append('g').attr('class', 'links-layer');
    gNodes = svg.append('g').attr('class', 'nodes-layer');
    gLabels = svg.append('g').attr('class', 'labels-layer');

    // Simulation
    simulation = d3.forceSimulation()
        .force('charge', d3.forceManyBody().strength(-180))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(30))
        .force('x', d3.forceX(width / 2).strength(0.04))
        .force('y', d3.forceY(height / 2).strength(0.04))
        .alphaDecay(0.02)
        .on('tick', ticked);

    // Handle resize
    window.addEventListener('resize', () => {
        width = viewport.clientWidth;
        height = viewport.clientHeight;
        svg.attr('viewBox', [0, 0, width, height]);
        simulation.force('center', d3.forceCenter(width / 2, height / 2));
        simulation.force('x', d3.forceX(width / 2).strength(0.04));
        simulation.force('y', d3.forceY(height / 2).strength(0.04));
        simulation.alpha(0.3).restart();
    });
}

/**
 * Update graph with new state from backend.
 */
export function updateGraph(state, onFileClick) {
    const clusters = state.clusters || {};
    const clusterNames = Object.keys(clusters);
    const allFiles = state.files || [];

    // Toggle empty state
    const emptyEl = document.getElementById('empty-state');
    if (emptyEl) {
        emptyEl.classList.toggle('hidden', allFiles.length > 0);
    }

    if (allFiles.length === 0) {
        currentNodes = [];
        currentLinks = [];
        simulation.nodes([]);
        simulation.force('link', null);
        gNodes.selectAll('*').remove();
        gLinks.selectAll('*').remove();
        gHulls.selectAll('*').remove();
        gLabels.selectAll('*').remove();
        return;
    }

    // Build cluster index
    const clusterIndex = {};
    clusterNames.forEach((name, i) => {
        clusterIndex[name] = i;
    });

    // Build nodes
    const newNodes = allFiles.map(f => {
        const existing = currentNodes.find(n => n.id === f.path);
        return {
            id: f.path,
            name: f.name,
            folder: f.folder,
            ext: f.ext,
            size: f.size,
            clusterIdx: f.folder ? (clusterIndex[f.folder] ?? 0) : -1,
            // Preserve positions if file already existed
            x: existing ? existing.x : width / 2 + (Math.random() - 0.5) * 200,
            y: existing ? existing.y : height / 2 + (Math.random() - 0.5) * 200,
            vx: existing ? existing.vx : 0,
            vy: existing ? existing.vy : 0,
        };
    });

    // Build links (files in same cluster are linked)
    const newLinks = [];
    for (const name of clusterNames) {
        const files = clusters[name] || [];
        for (let i = 0; i < files.length; i++) {
            for (let j = i + 1; j < files.length; j++) {
                newLinks.push({
                    source: files[i].path,
                    target: files[j].path,
                });
            }
        }
    }

    currentNodes = newNodes;
    currentLinks = newLinks;

    // --- Links ---
    const linkSel = gLinks.selectAll('.link-line')
        .data(currentLinks, d => d.source + '-' + d.target);

    linkSel.exit().transition().duration(300).attr('opacity', 0).remove();

    linkSel.enter()
        .append('line')
        .attr('class', 'link-line')
        .attr('opacity', 0)
        .transition().duration(500)
        .attr('opacity', 1);

    // --- Nodes ---
    const nodeSel = gNodes.selectAll('.node-group')
        .data(currentNodes, d => d.id);

    nodeSel.exit().transition().duration(400)
        .attr('opacity', 0)
        .attr('transform', d => `translate(${d.x},${d.y}) scale(0)`)
        .remove();

    const nodeEnter = nodeSel.enter()
        .append('g')
        .attr('class', 'node-group')
        .attr('opacity', 0)
        .call(drag(simulation));

    // Outer glow
    nodeEnter.append('circle')
        .attr('class', 'node-glow')
        .attr('r', 20)
        .attr('fill', d => {
            const c = d.clusterIdx >= 0 ? getClusterColor(d.clusterIdx) : '#666';
            return c;
        })
        .attr('opacity', 0.1)
        .attr('filter', 'blur(6px)');

    // Main circle
    nodeEnter.append('circle')
        .attr('class', 'node-circle')
        .attr('r', 8)
        .attr('fill', d => d.clusterIdx >= 0 ? getClusterColor(d.clusterIdx) : '#888')
        .attr('stroke', 'rgba(255,255,255,0.15)')
        .attr('stroke-width', 1.5);

    // Label
    nodeEnter.append('text')
        .attr('class', 'node-label')
        .attr('dy', 22)
        .text(d => truncate(d.name, 18));

    // Animate in
    nodeEnter.transition().duration(600)
        .attr('opacity', 1);

    // Merge update + enter
    const allNodes = gNodes.selectAll('.node-group');

    // Update colors for existing nodes that changed clusters
    allNodes.select('.node-circle')
        .transition().duration(500)
        .attr('fill', d => d.clusterIdx >= 0 ? getClusterColor(d.clusterIdx) : '#888');

    allNodes.select('.node-glow')
        .transition().duration(500)
        .attr('fill', d => d.clusterIdx >= 0 ? getClusterColor(d.clusterIdx) : '#666');

    // Events
    allNodes
        .on('mouseover', (event, d) => showTooltip(event, d))
        .on('mousemove', (event) => moveTooltip(event))
        .on('mouseout', () => hideTooltip())
        .on('click', (event, d) => {
            if (onFileClick) onFileClick(d);
        });

    // Cluster hulls
    renderHulls(clusters, clusterNames, currentNodes);

    // Update simulation
    simulation.nodes(currentNodes);
    simulation.force('link', d3.forceLink(currentLinks).id(d => d.id).distance(60).strength(0.4));

    // Add cluster gravity: nodes in the same cluster attract
    simulation.force('cluster', clusterForce(currentNodes, clusterNames.length));

    simulation.alpha(0.6).restart();
}

/**
 * Custom cluster force to group nodes together.
 */
function clusterForce(nodes, numClusters) {
    const strength = 0.15;
    return function (alpha) {
        // Compute cluster centroids
        const centroids = {};
        const counts = {};
        for (const node of nodes) {
            const ci = node.clusterIdx;
            if (ci < 0) continue;
            if (!centroids[ci]) {
                centroids[ci] = { x: 0, y: 0 };
                counts[ci] = 0;
            }
            centroids[ci].x += node.x;
            centroids[ci].y += node.y;
            counts[ci]++;
        }
        for (const ci in centroids) {
            centroids[ci].x /= counts[ci];
            centroids[ci].y /= counts[ci];
        }

        // Apply force toward centroid
        for (const node of nodes) {
            const ci = node.clusterIdx;
            if (ci < 0 || !centroids[ci]) continue;
            node.vx += (centroids[ci].x - node.x) * strength * alpha;
            node.vy += (centroids[ci].y - node.y) * strength * alpha;
        }
    };
}

/**
 * Render convex hulls around clusters.
 */
function renderHulls(clusters, clusterNames, nodes) {
    const hullData = [];

    clusterNames.forEach((name, idx) => {
        const clusterNodes = nodes.filter(n => n.folder === name);
        if (clusterNodes.length >= 2) {
            hullData.push({
                name,
                idx,
                nodes: clusterNodes,
            });
        }
    });

    const hullSel = gHulls.selectAll('.cluster-hull')
        .data(hullData, d => d.name);

    hullSel.exit().transition().duration(400).attr('opacity', 0).remove();

    hullSel.enter()
        .append('path')
        .attr('class', 'cluster-hull')
        .attr('fill', d => getClusterColor(d.idx))
        .attr('stroke', d => getClusterColor(d.idx))
        .attr('opacity', 0)
        .transition().duration(500)
        .attr('opacity', 1);

    // Cluster labels in graph
    const labelData = hullData.filter(d => d.nodes.length >= 2);
    const labelSel = gLabels.selectAll('.cluster-graph-label')
        .data(labelData, d => d.name);

    labelSel.exit().remove();

    labelSel.enter()
        .append('text')
        .attr('class', 'cluster-graph-label')
        .attr('fill', d => getClusterColor(d.idx))
        .text(d => d.name.replace(/_/g, ' '));
}

/**
 * Tick handler — update positions each frame.
 */
function ticked() {
    // Links
    gLinks.selectAll('.link-line')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

    // Nodes
    gNodes.selectAll('.node-group')
        .attr('transform', d => `translate(${d.x},${d.y})`);

    // Hulls
    gHulls.selectAll('.cluster-hull')
        .attr('d', d => {
            const points = d.nodes.map(n => [n.x, n.y]);
            if (points.length < 2) return '';
            if (points.length === 2) {
                // Draw an ellipse between the two points
                const [a, b] = points;
                return `M${a[0]},${a[1]} L${b[0]},${b[1]}`;
            }
            const hull = d3.polygonHull(points);
            if (!hull) return '';
            // Expand hull slightly
            const cx = d3.mean(hull, p => p[0]);
            const cy = d3.mean(hull, p => p[1]);
            const expanded = hull.map(([x, y]) => {
                const dx = x - cx;
                const dy = y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const scale = (dist + 25) / dist;
                return [cx + dx * scale, cy + dy * scale];
            });
            return 'M' + expanded.map(p => p.join(',')).join('L') + 'Z';
        });

    // Cluster labels
    gLabels.selectAll('.cluster-graph-label')
        .attr('x', d => d3.mean(d.nodes, n => n.x))
        .attr('y', d => d3.mean(d.nodes, n => n.y) - 35);
}

/**
 * Drag behavior for nodes.
 */
function drag(sim) {
    return d3.drag()
        .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        })
        .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
        })
        .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        });
}

/**
 * Tooltip helpers.
 */
function showTooltip(event, d) {
    if (!tooltip) return;
    tooltip.querySelector('.tooltip-icon').textContent = EXT_ICONS[d.ext] || '📄';
    tooltip.querySelector('.tooltip-name').textContent = d.name;
    tooltip.querySelector('.tooltip-cluster').textContent = d.folder ? d.folder.replace(/_/g, ' ') : 'Unclustered';
    tooltip.querySelector('.tooltip-size').textContent = formatSize(d.size);
    tooltip.querySelector('.tooltip-type').textContent = (d.ext || '').replace('.', '').toUpperCase() || '—';
    tooltip.classList.add('visible');
    moveTooltip(event);
}

function moveTooltip(event) {
    if (!tooltip) return;
    const x = event.clientX + 16;
    const y = event.clientY - 10;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

function hideTooltip() {
    if (tooltip) tooltip.classList.remove('visible');
}

/**
 * Utility helpers.
 */
function truncate(str, len) {
    return str.length > len ? str.slice(0, len - 2) + '…' : str;
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}
