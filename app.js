// Mapbox Access Token - loaded from config.js or localStorage
const storedToken = localStorage.getItem('mapbox_token');
mapboxgl.accessToken = storedToken || (typeof CONFIG !== 'undefined' ? CONFIG.MAPBOX_TOKEN : '');

// Global State
let venues = [];
let reviews = [];
let map = null;
let markers = [];
let currentView = 'list';

// DOM Elements
const listView = document.getElementById('listView');
const mapView = document.getElementById('mapView');
const venueGrid = document.getElementById('venueGrid');
const searchInput = document.getElementById('searchInput');
const categoryFilters = document.getElementById('categoryFilters');
const modalOverlay = document.getElementById('modalOverlay');
const modalContent = document.getElementById('modalContent');
const modalClose = document.getElementById('modalClose');

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    renderCategories();
    renderVenues();
    updateStats();
    initMap();
    setupEventListeners();
});

// Load CSV and JSON Data
async function loadData() {
    // Load venues from JSON
    try {
        const venuesResponse = await fetch('data/venues.json');
        const venuesData = await venuesResponse.json();
        venues = venuesData.venues;
    } catch (e) {
        console.error('Error loading venues:', e);
    }

    // Load reviews from CSV
    try {
        const csvResponse = await fetch('Digital Marketing Lunch Reviews(Reviews).csv');
        const csvText = await csvResponse.text();
        reviews = parseCSV(csvText);
    } catch (e) {
        console.error('Error loading reviews:', e);
    }

    // Merge review data with venues
    venues = venues.map(venue => {
        const venueReviews = reviews.filter(r => r.venue.toLowerCase() === venue.name.toLowerCase());
        const scores = venueReviews.map(r => r.total);
        const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
        
        // Calculate category averages
        const avgProximity = average(venueReviews.map(r => r.proximity));
        const avgTaste = average(venueReviews.map(r => r.taste));
        const avgValue = average(venueReviews.map(r => r.value));
        const avgService = average(venueReviews.map(r => r.service));
        const avgVibe = average(venueReviews.map(r => r.vibe));

        return {
            ...venue,
            reviews: venueReviews,
            reviewCount: venueReviews.length,
            avgScore: parseFloat(avgScore),
            chosenBy: venueReviews[0]?.chosenBy || '',
            avgProximity,
            avgTaste,
            avgValue,
            avgService,
            avgVibe
        };
    });

    // Sort by average score descending
    venues.sort((a, b) => b.avgScore - a.avgScore);
}

// Parse CSV
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length >= 11) {
            results.push({
                venueNumber: parseInt(values[0]) || 0,
                venue: values[1] || '',
                chosenBy: values[2] || '',
                reviewer: values[3] || '',
                proximity: parseInt(values[4]) || 0,
                taste: parseInt(values[5]) || 0,
                value: parseInt(values[6]) || 0,
                service: parseInt(values[7]) || 0,
                vibe: parseInt(values[8]) || 0,
                total: parseInt(values[9]) || 0,
                comment: values[10] || ''
            });
        }
    }

    return results;
}

// Parse CSV line handling quoted values
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// Calculate average
function average(arr) {
    if (arr.length === 0) return 0;
    return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
}

// Render Category Filters
function renderCategories() {
    const categories = [...new Set(venues.map(v => v.category))].sort();
    categories.forEach(category => {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.dataset.category = category;
        chip.textContent = category;
        categoryFilters.appendChild(chip);
    });
}

// Render Venues
function renderVenues(filter = '') {
    const searchTerm = searchInput.value.toLowerCase();
    const activeCategory = document.querySelector('.chip.active')?.dataset.category || 'all';

    const filtered = venues.filter(venue => {
        const matchesSearch = venue.name.toLowerCase().includes(searchTerm) ||
                            venue.category.toLowerCase().includes(searchTerm);
        const matchesCategory = activeCategory === 'all' || venue.category === activeCategory;
        return matchesSearch && matchesCategory;
    });

    if (filtered.length === 0) {
        venueGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <h3>No venues found</h3>
                <p>Try adjusting your search or filters</p>
            </div>
        `;
        return;
    }

    venueGrid.innerHTML = filtered.map(venue => {
        const scoreClass = venue.avgScore >= 4 ? 'excellent' : venue.avgScore >= 3 ? 'good' : 'average';
        const atdwBadge = venue.inATDW === false ? '<span class="not-atdw-badge">Not in ATDW</span>' : '';
        
        return `
            <div class="venue-card" data-id="${venue.id}">
                <div class="venue-image-wrapper">
                    <img src="${venue.image}" alt="${venue.name}" class="venue-image" loading="lazy" 
                         onerror="this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop'">
                    <span class="venue-category-badge">${venue.category}</span>
                    ${atdwBadge}
                </div>
                <div class="venue-info">
                    <h3 class="venue-name">${venue.name}</h3>
                    <p class="venue-address">${venue.address}</p>
                    <div class="venue-score ${scoreClass}">⭐ ${venue.avgScore}</div>
                </div>
                <div class="venue-meta">
                    <span class="meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                        </svg>
                        ${venue.reviewCount} reviews
                    </span>
                    <span class="meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                        ${venue.chosenBy ? `Picked by ${venue.chosenBy}` : 'Team pick'}
                    </span>
                </div>
            </div>
        `;
    }).join('');

    // Update map markers
    if (map) {
        updateMapMarkers(filtered);
    }
}

// Update Stats
function updateStats() {
    document.getElementById('venueCount').textContent = venues.length;
    document.getElementById('reviewCount').textContent = reviews.length;
    
    const allScores = venues.filter(v => v.avgScore > 0).map(v => v.avgScore);
    const avgScore = allScores.length > 0 
        ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1) 
        : '0';
    document.getElementById('avgScore').textContent = avgScore;

    const topVenue = venues.reduce((max, v) => v.avgScore > (max?.avgScore || 0) ? v : max, null);
    document.getElementById('topVenue').textContent = topVenue?.name || '-';
}

// Initialize Map
function initMap() {
    const tokenPrompt = document.getElementById('tokenPrompt');
    const tokenInput = document.getElementById('tokenInput');
    const tokenSubmit = document.getElementById('tokenSubmit');

    // Check if we have a valid token
    if (!mapboxgl.accessToken || mapboxgl.accessToken === 'YOUR_MAPBOX_TOKEN_HERE' || mapboxgl.accessToken === '') {
        tokenPrompt.classList.remove('hidden');
        
        tokenSubmit.addEventListener('click', () => {
            const token = tokenInput.value.trim();
            if (token && token.startsWith('pk.')) {
                localStorage.setItem('mapbox_token', token);
                mapboxgl.accessToken = token;
                tokenPrompt.classList.add('hidden');
                createMap();
            }
        });

        tokenInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                tokenSubmit.click();
            }
        });
    } else {
        tokenPrompt.classList.add('hidden');
        createMap();
    }
}

function createMap() {
    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [138.6007, -34.9245],
        zoom: 14
    });

    map.addControl(new mapboxgl.NavigationControl());
    
    map.on('load', () => {
        updateMapMarkers(venues);
    });
}

// Update Map Markers
function updateMapMarkers(venueList) {
    // Clear existing markers
    markers.forEach(m => m.remove());
    markers = [];

    venueList.forEach(venue => {
        if (!venue.latitude || !venue.longitude) return;

        // Create custom marker
        const el = document.createElement('div');
        el.className = 'map-marker';
        el.textContent = Math.round(venue.avgScore);

        const marker = new mapboxgl.Marker(el)
            .setLngLat([venue.longitude, venue.latitude])
            .setPopup(
                new mapboxgl.Popup({ offset: 25, closeButton: true })
                    .setHTML(`
                        <div class="popup-content">
                            <img src="${venue.image}" alt="${venue.name}" class="popup-image"
                                 onerror="this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop'">
                            <div class="popup-info">
                                <h4 class="popup-name">${venue.name}</h4>
                                <p class="popup-category">${venue.category}</p>
                                <span class="popup-score">⭐ ${venue.avgScore} (${venue.reviewCount} reviews)</span>
                            </div>
                        </div>
                    `)
            )
            .addTo(map);

        el.addEventListener('click', () => {
            showVenueModal(venue);
        });

        markers.push(marker);
    });

    // Fit bounds if we have markers
    if (venueList.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        venueList.forEach(v => {
            if (v.latitude && v.longitude) {
                bounds.extend([v.longitude, v.latitude]);
            }
        });
        
        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
        }
    }
}

// Show Venue Modal
function showVenueModal(venue) {
    modalContent.innerHTML = `
        <img src="${venue.image}" alt="${venue.name}" class="modal-image"
             onerror="this.src='https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop'">
        <div class="modal-body">
            <div class="modal-header">
                <div>
                    <h2 class="modal-title">${venue.name}</h2>
                    <p class="modal-category">${venue.category} • ${venue.address}</p>
                </div>
                <div class="modal-score-big">
                    <span class="modal-score-value">${venue.avgScore}</span>
                    <span class="modal-score-label">avg score</span>
                </div>
            </div>
            
            <div class="modal-stats">
                <div class="modal-stat">
                    <div class="modal-stat-value">${venue.avgProximity}</div>
                    <div class="modal-stat-label">Proximity</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-value">${venue.avgTaste}</div>
                    <div class="modal-stat-label">Taste</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-value">${venue.avgValue}</div>
                    <div class="modal-stat-label">Value</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-value">${venue.avgService}</div>
                    <div class="modal-stat-label">Service</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-value">${venue.avgVibe}</div>
                    <div class="modal-stat-label">Vibe</div>
                </div>
            </div>

            <div class="reviews-section">
                <h3>Reviews (${venue.reviewCount})</h3>
                <div class="review-list">
                    ${venue.reviews.map(review => `
                        <div class="review-item">
                            <div class="review-header">
                                <span class="reviewer-name">${review.reviewer}</span>
                                <span class="review-score">${review.total}</span>
                            </div>
                            ${review.comment ? `<p class="review-comment">"${review.comment}"</p>` : ''}
                            <p class="chosen-by">Chosen by: ${review.chosenBy}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close Modal
function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

// Setup Event Listeners
function setupEventListeners() {
    // View Toggle
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const view = btn.dataset.view;
            currentView = view;
            
            if (view === 'list') {
                listView.classList.add('active');
                mapView.classList.remove('active');
            } else {
                listView.classList.remove('active');
                mapView.classList.add('active');
                setTimeout(() => map.resize(), 100);
            }
        });
    });

    // Search
    searchInput.addEventListener('input', () => {
        renderVenues();
    });

    // Category Filters
    categoryFilters.addEventListener('click', (e) => {
        if (e.target.classList.contains('chip')) {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            renderVenues();
        }
    });

    // Venue Card Click
    venueGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.venue-card');
        if (card) {
            const venueId = parseInt(card.dataset.id);
            const venue = venues.find(v => v.id === venueId);
            if (venue) {
                showVenueModal(venue);
            }
        }
    });

    // Modal Close
    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}
