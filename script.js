document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');
    // Settings
    const gridSizeSelect = document.getElementById('gridSize');
    const numDeliveriesDisplay = document.getElementById('numDeliveriesDisplay'); // Changed to display input
    const numDeliveriesLabel = document.getElementById('numDeliveriesLabel'); // Label for display
    const editModeRadios = document.querySelectorAll('input[name="editMode"]');
    const generateMapBtn = document.getElementById('generateMapBtn'); // Renamed button
    const clearDeliveriesBtn = document.getElementById('clearDeliveriesBtn'); // New button
    // Algorithm Params
    const learningRateSlider = document.getElementById('learningRate');
    const learningRateValueSpan = document.getElementById('learningRateValue');
    const discountFactorSlider = document.getElementById('discountFactor');
    const discountFactorValueSpan = document.getElementById('discountFactorValue');
    const epsilonStartSlider = document.getElementById('epsilonStart');
    const epsilonStartValueSpan = document.getElementById('epsilonStartValue');
    const epsilonDecaySlider = document.getElementById('epsilonDecay');
    const epsilonDecayValueSpan = document.getElementById('epsilonDecayValue');
    const epsilonMinSlider = document.getElementById('epsilonMin');
    const epsilonMinValueSpan = document.getElementById('epsilonMinValue');
    const maxEpisodesInput = document.getElementById('maxEpisodes');
    const resetQTableBtn = document.getElementById('resetQTableBtn');
     // Persistence
     const saveQTableBtn = document.getElementById('saveQTableBtn');
     const loadQTableBtn = document.getElementById('loadQTableBtn');
    // Main Controls
    const speedSlider = document.getElementById('speed');
    const speedValueSpan = document.getElementById('speedValue');
    const startTrainingBtn = document.getElementById('startTrainingBtn');
    const pauseTrainingBtn = document.getElementById('pauseTrainingBtn');
    const stopTrainingBtn = document.getElementById('stopTrainingBtn');
    const showRouteBtn = document.getElementById('showRouteBtn'); // Renamed from runGreedyBtn
    // Visualization
    const showCurrentPathCheckbox = document.getElementById('showCurrentPath');
    const showTruckCheckbox = document.getElementById('showTruck');
    const showFinalRouteCheckbox = document.getElementById('showFinalRoute');
    // Info Panel
    const statusDisplay = document.getElementById('statusDisplay');
    const episodeDisplay = document.getElementById('episodeDisplay');
    const totalEpisodesDisplay = document.getElementById('totalEpisodesDisplay');
    const destLeftDisplay = document.getElementById('destLeftDisplay');
    const epsilonDisplay = document.getElementById('epsilonDisplay');
    const rewardDisplay = document.getElementById('rewardDisplay');
    const avgRewardDisplay = document.getElementById('avgRewardDisplay');
    const bestRouteCostDisplay = document.getElementById('bestRouteCostDisplay');
    const qTableSizeDisplay = document.getElementById('qTableSizeDisplay');
    // Chart
    const rewardChartCanvas = document.getElementById('rewardChart');

    // --- Configuration & Constants ---
    let GRID_SIZE = 10;
    let NUM_DELIVERIES = 0; // Start with 0, set by placement or generate
    const MAX_ALLOWED_DELIVERIES = 7; // Limit for performance
    let CELL_SIZE = 0;
    const REWARD_SUCCESSFUL_RETURN = 200;
    const COST_PER_DISTANCE_UNIT = 1;
    // const REWARD_WALL_HIT = -5; // Not used

    // --- Q-Learning Parameters ---
    let LEARNING_RATE, DISCOUNT_FACTOR, EPSILON_START, EPSILON_DECAY, EPSILON_MIN, MAX_EPISODES;

    // --- State Variables ---
    let qTable = {};
    let depotLocation = null; // {r, c}
    let deliveryLocations = []; // Array of {r, c}
    let allLocations = []; // Combined: [depot, delivery1, ...]
    let currentLocationIndex = 0; // Index in allLocations
    let remainingDeliveries = new Set(); // Set of delivery indices (1 to N)
    let epsilon = 1.0;
    let currentEpisode = 0;
    let currentStep = 0;
    let episodeCost = 0;
    let episodeRoute = [];
    let simulationState = 'idle';
    let animationFrameId = null;
    let lastTimestamp = 0;
    let stepDelay = 500;
    let timeAccumulator = 0;
    let recentCosts = [];
    const COST_AVERAGE_WINDOW = 100;
    let bestRouteCost = Infinity;
    let bestRoute = [];
    let rewardChart;
    let currentEditMode = 'none'; // 'none', 'depot', 'delivery'
    let nextDeliveryIndexToPlace = 1; // Track which delivery number to place next


    // --- Utility Functions ---
    function getCssVar(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }
    function isValid(r, c) { return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE; }
    function manhattanDistance(loc1, loc2) {
        if (!loc1 || !loc2 || typeof loc1.r !== 'number' || typeof loc1.c !== 'number' || typeof loc2.r !== 'number' || typeof loc2.c !== 'number' || !isValid(loc1.r, loc1.c) || !isValid(loc2.r, loc2.c)) {
             return Infinity;
        }
        return Math.abs(loc1.r - loc2.r) + Math.abs(loc1.c - loc2.c);
    }
     function resizeCanvas() {
         const container = document.querySelector('.canvas-container');
         if (!container) { console.error("Canvas container not found!"); return false; }
         const containerStyle = getComputedStyle(container);
         const containerPaddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
         const availableWidth = container.clientWidth - containerPaddingX;
         const headerHeight = document.querySelector('.app-header')?.offsetHeight || 60;
         const controlsHeight = document.querySelector('.main-controls')?.offsetHeight || 60;
         const chartHeight = document.querySelector('.chart-container')?.offsetHeight || 220;
         const verticalPadding = 60;
         let availableHeight = window.innerHeight - headerHeight - controlsHeight - chartHeight - verticalPadding;
         if(availableHeight < 200) availableHeight = 200;
         const canvasSize = Math.max(200, Math.min(availableWidth, availableHeight));
         const maxSize = 600;
         const finalSize = Math.min(canvasSize, maxSize);
         if (Math.abs(canvas.width - finalSize) > 1 || CELL_SIZE <= 0 || canvas.width === 0) {
             canvas.width = finalSize; canvas.height = finalSize;
             if (GRID_SIZE > 0) { CELL_SIZE = canvas.width / GRID_SIZE; }
             else { console.error("GRID_SIZE is invalid during resize!"); CELL_SIZE = 0; return false; }
             console.log(`Canvas resized to ${canvas.width.toFixed(0)}x${canvas.height.toFixed(0)}, Cell Size: ${CELL_SIZE.toFixed(2)}`);
             if (CELL_SIZE <= 0) { console.error("FATAL: CELL_SIZE calculation failed!"); return false; }
             if (simulationState === 'idle' || simulationState === 'paused' || simulationState === 'stopped' || simulationState === 'error') { requestAnimationFrame(draw); }
             return true;
         }
         return false;
     }

    // --- State Representation ---
    function getStateString(locationIndex, remainingSet) {
        if (!(remainingSet instanceof Set)) { console.error("Invalid remainingSet passed to getStateString:", remainingSet); return `${locationIndex}-error`; }
        const sortedRemaining = Array.from(remainingSet).sort((a, b) => a - b);
        return `${locationIndex}-${JSON.stringify(sortedRemaining)}`;
    }

    // --- Initialization ---
    function init(generateNewMap = true, resetLearning = true) {
        console.log(`--- Init (Generate: ${generateNewMap}, ResetLearn: ${resetLearning}) ---`);
        setStatus('Initializing...', 'initializing');
        stopSimulationLoop();

        GRID_SIZE = parseInt(gridSizeSelect.value);
        updateAlgorithmParamsFromUI();

        if (!resizeCanvas() && (CELL_SIZE <= 0 || canvas.width === 0)) {
             console.warn("Forcing CELL_SIZE calculation in init.");
             if (canvas.width > 0 && GRID_SIZE > 0) { CELL_SIZE = canvas.width / GRID_SIZE; }
             else { canvas.width = 300; canvas.height = 300; GRID_SIZE = 10; gridSizeSelect.value = GRID_SIZE; CELL_SIZE = canvas.width / GRID_SIZE; }
             if (CELL_SIZE <= 0) { setStatus("Error: Canvas setup failed", "error"); return; }
        }
         console.log(`Init: Grid=${GRID_SIZE}, Cell=${CELL_SIZE.toFixed(2)}`);

        if (generateNewMap) { if (!placeLocationsRandomly()) return; }
        else { updateAllLocations(); if (!depotLocation || deliveryLocations.length === 0) { if (!placeLocationsRandomly()) return; } }

         NUM_DELIVERIES = deliveryLocations.length;
         numDeliveriesDisplay.value = NUM_DELIVERIES;
         nextDeliveryIndexToPlace = NUM_DELIVERIES + 1;

        if (resetLearning) { initQTable(); resetSimulationStats(); bestRouteCost = Infinity; bestRoute = []; }
        else { resetSimulationStats(); }

        updateButtonStates();
        setStatus('Ready.', 'idle');
        requestAnimationFrame(draw);
        console.log("--- Initialization Complete ---");
    }

    function placeLocationsRandomly() {
        console.log(`Placing random locations...`);
        deliveryLocations = []; allLocations = []; const placedCoords = new Set(); depotLocation = null;
        const targetNumDeliveries = parseInt(numDeliveriesDisplay.value) || 5; // Use target number

        depotLocation = findRandomClearCell(null, placedCoords) || {r:0, c:0};
        if(depotLocation) { placedCoords.add(`${depotLocation.r},${depotLocation.c}`); allLocations.push(depotLocation); }
        else { console.error("Failed to place Depot!"); return false;}
        console.log("Depot placed at:", depotLocation);

        let attempts = 0; const maxAttempts = GRID_SIZE * GRID_SIZE * 3;
        while (deliveryLocations.length < targetNumDeliveries && attempts < maxAttempts) {
            const loc = findRandomClearCell(null, placedCoords);
            if (loc) { deliveryLocations.push(loc); allLocations.push(loc); placedCoords.add(`${loc.r},${loc.c}`); }
            else { break; }
            attempts++;
        }
        console.log(`Placed ${deliveryLocations.length} random deliveries.`);
        resetAgent(); return true;
    }

     function findRandomClearCell(excludePos = null, placedCoordsSet) {
         const clearCells = [];
         for (let r = 0; r < GRID_SIZE; r++) {
             for (let c = 0; c < GRID_SIZE; c++) {
                  const coordString = `${r},${c}`;
                 if (isValid(r, c) && (!excludePos || r !== excludePos.r || c !== excludePos.c) && !placedCoordsSet.has(coordString)) { clearCells.push({ r, c }); }
             }
         }
         return clearCells.length > 0 ? clearCells[Math.floor(Math.random() * clearCells.length)] : null;
     }

     function updateAllLocations() {
         allLocations = [];
         if (depotLocation && isValid(depotLocation.r, depotLocation.c)) allLocations.push(depotLocation);
         deliveryLocations = deliveryLocations.filter(loc => loc && isValid(loc.r, loc.c));
         allLocations = allLocations.concat(deliveryLocations);
     }

     function clearDeliveriesAction() {
         if (simulationState !== 'idle' && simulationState !== 'stopped' && simulationState !== 'error') return;
         depotLocation = null; deliveryLocations = []; allLocations = []; NUM_DELIVERIES = 0;
         numDeliveriesDisplay.value = NUM_DELIVERIES; nextDeliveryIndexToPlace = 1;
         initQTable(); resetSimulationStats(); bestRoute = []; bestRouteCost = Infinity;
         setStatus("Cleared. Place Depot (D) & Deliveries (1...).", "idle");
         requestAnimationFrame(draw);
     }

    function initQTable() { qTable = {}; globalMinQ = 0; globalMaxQ = 0; }
    function resetSimulationStats() {
        currentEpisode = 0; episodeCost = 0; epsilon = EPSILON_START; recentCosts = [];
        initChart(); resetAgent(); updateInfoDisplay();
    }
    function resetAgent() {
        currentLocationIndex = 0;
        NUM_DELIVERIES = deliveryLocations.length;
        remainingDeliveries = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1));
        episodeCost = 0;
        episodeRoute = depotLocation ? [0] : [];
        currentStep = 0;
    }

    // --- Drawing Functions ---
    function draw() {
        if (!ctx || CELL_SIZE <= 0 || canvas.width <= 0 || canvas.height <= 0) { return; }
        try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawMapBackground();
            // Draw final best route first (dashed)
            if (showFinalRouteCheckbox.checked && bestRoute.length > 1) {
                drawRoute(bestRoute, getCssVar('--final-route-color'), 3.5, true);
            }
            // Draw current path attempt (if running)
            if (showCurrentPathCheckbox.checked && (simulationState === 'training' || simulationState === 'paused' || simulationState === 'greedy')) {
                 drawRoute(episodeRoute, getCssVar('--current-path-color'), 2);
            }
            drawLocations();     // Markers on top of paths
            if (showTruckCheckbox.checked) { drawTruck(); } // Truck on top of everything
        } catch (e) { console.error("Error during drawing:", e); setStatus("Error: Drawing Failed", "error"); stopSimulationLoop(); }
    }
    // ... (Keep drawMapBackground, drawLocations, drawMarker, drawTruck, drawRoute - they seem stable now) ...
     function drawMapBackground() {
        ctx.fillStyle = getCssVar('--grid-bg'); ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = getCssVar('--grid-line'); ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= GRID_SIZE; i++) {
            const pos = Math.round(i * CELL_SIZE);
            if (pos > canvas.width + 1 || pos > canvas.height + 1) continue;
            ctx.moveTo(pos, 0); ctx.lineTo(pos, canvas.height);
            ctx.moveTo(0, pos); ctx.lineTo(canvas.width, pos);
        }
        ctx.stroke();
    }
     function drawLocations() {
         if (depotLocation && isValid(depotLocation.r, depotLocation.c)) { drawMarker(depotLocation, getCssVar('--cell-depot'), 'D'); }
         deliveryLocations.forEach((loc, index) => {
             if (loc && isValid(loc.r, loc.c)) {
                  const deliveryIndex = index + 1; const isRemaining = remainingDeliveries.has(deliveryIndex);
                  const color = getCssVar('--cell-delivery'); ctx.globalAlpha = isRemaining ? 1.0 : 0.3;
                  drawMarker(loc, color, deliveryIndex.toString()); ctx.globalAlpha = 1.0;
             }
         });
    }
     function drawMarker(loc, color, text = '') {
        const centerX = loc.c * CELL_SIZE + CELL_SIZE / 2; const centerY = loc.r * CELL_SIZE + CELL_SIZE / 2;
        const radius = Math.max(5, CELL_SIZE * 0.38);
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        if (text) {
            ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(9, radius)}px ${getCssVar('--font-family')}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, centerX, centerY + 1);
        }
    }
     function drawTruck() {
         if (currentLocationIndex < 0 || currentLocationIndex >= allLocations.length) return;
         const truckLoc = allLocations[currentLocationIndex]; if (!truckLoc || !isValid(truckLoc.r, truckLoc.c)) return;
         const centerX = truckLoc.c * CELL_SIZE + CELL_SIZE / 2; const centerY = truckLoc.r * CELL_SIZE + CELL_SIZE / 2;
         const truckSize = Math.max(7, CELL_SIZE * 0.60);
         ctx.fillStyle = getCssVar('--truck-color'); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1.5;
         ctx.fillRect(centerX - truckSize / 2, centerY - truckSize / 2, truckSize, truckSize);
         ctx.strokeRect(centerX - truckSize / 2, centerY - truckSize / 2, truckSize, truckSize);
         ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
         ctx.fillRect(centerX - truckSize * 0.3, centerY - truckSize * 0.3, truckSize * 0.6, truckSize * 0.2);
    }
     function drawRoute(routeIndices, color, lineWidth, dashed = false) {
        if (!routeIndices || routeIndices.length < 2 || !allLocations || allLocations.length === 0) return;
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, lineWidth); ctx.lineCap = "round"; ctx.lineJoin = "round";
        if (dashed) ctx.setLineDash([Math.max(2, CELL_SIZE * 0.1), Math.max(2, CELL_SIZE * 0.1)]);
        else ctx.setLineDash([]);
        ctx.beginPath();
        let firstLoc = allLocations[routeIndices[0]]; if (!firstLoc || !isValid(firstLoc.r, firstLoc.c)) { ctx.setLineDash([]); console.warn("Invalid start loc in route"); return; }
        ctx.moveTo(firstLoc.c * CELL_SIZE + CELL_SIZE / 2, firstLoc.r * CELL_SIZE + CELL_SIZE / 2);
        for (let i = 1; i < routeIndices.length; i++) {
            let nextLocIndex = routeIndices[i]; if(nextLocIndex === undefined || nextLocIndex === null || nextLocIndex < 0 || nextLocIndex >= allLocations.length) { console.warn(`Invalid index ${nextLocIndex} in route`); continue; }
            let nextLoc = allLocations[nextLocIndex]; if (!nextLoc || !isValid(nextLoc.r, nextLoc.c)) { console.warn(`Invalid location data ${nextLocIndex}`); continue; }
            ctx.lineTo(nextLoc.c * CELL_SIZE + CELL_SIZE / 2, nextLoc.r * CELL_SIZE + CELL_SIZE / 2);
        }
        ctx.stroke(); ctx.setLineDash([]);
    }

    // --- Q-Learning Logic ---
    // ... (Keep getValidActions, getQValue, chooseAction, updateQTable, getValidActionsFromString) ...

    // --- Simulation Step & Loop ---
    // ... (Keep runSingleStep, handleEpisodeEnd, simulationLoop, stopSimulationLoop) ...
     function handleEpisodeEnd(succeeded) {
        const wasTraining = simulationState === 'training'; const wasStepping = false; /* Stepping removed */ const wasGreedy = simulationState === 'greedy';
        if (succeeded && wasTraining) { // Only update stats/epsilon during training completion
             recentCosts.push(episodeCost); if (recentCosts.length > COST_AVERAGE_WINDOW) recentCosts.shift();
             updateChart(); if (epsilon > EPSILON_MIN) epsilon *= EPSILON_DECAY;
             // Update best route if this episode was better
             if (episodeCost < bestRouteCost) { bestRouteCost = episodeCost; bestRoute = [...episodeRoute]; console.log(`New best during train: Cost ${bestRouteCost.toFixed(0)}`, bestRoute); }
        }
        // --- State transition logic ---
        if (wasTraining) {
            currentEpisode++; if (currentEpisode >= MAX_EPISODES) {
                setStatus(`Training Finished (Max Ep.). Calculating Best Route...`, 'finished'); stopSimulationLoop();
                setTimeout(() => {
                    const finalRoute = findBestRouteFromQTable();
                    if (finalRoute) { bestRoute = finalRoute; bestRouteCost = calculateRouteCost(bestRoute); } // Update with potentially better route from final Q-table
                    setStatus(`Training Finished. Best Cost: ${bestRouteCost === Infinity ? 'N/A' : bestRouteCost.toFixed(0)}`, 'finished');
                    updateInfoDisplay(); requestAnimationFrame(draw); // Show final route automatically
                }, 10);
            } else { resetAgent(); } // Prepare for next episode
        } else if (wasGreedy) { /* Greedy runs instantly now */ }
        else { resetAgent(); } // Reset if stopped manually
        if (!wasGreedy) { episodeCost = 0; } updateInfoDisplay();
    }

    // --- Simulation Control Actions ---
    // ... (Keep startTrainingAction, pauseTrainingAction, stopAction, showRouteAction) ...

    // --- Find Best Route from Q-Table ---
    // ... (Keep findBestRouteFromQTable, calculateRouteCost) ...

    // --- Charting ---
    // ... (Keep initChart, updateChart) ...

    // --- UI Updates & Event Handlers ---
    // ... (Keep updateButtonStates, updateInfoDisplay, setStatus, updateUIParameterValues, updateSpeedDisplay, updateAlgorithmParamsFromUI) ...
    function updateButtonStates() {
        const isIdle = simulationState === 'idle' || simulationState === 'stopped' || simulationState === 'error';
        const isPaused = simulationState === 'paused';
        const isTrainingActive = simulationState === 'training';
        const isRunning = !isIdle && !isPaused;

        startTrainingBtn.disabled = isTrainingActive || simulationState === 'error' || !depotLocation || deliveryLocations.length === 0; // Also disable if no locations
        startTrainingBtn.innerHTML = (isPaused) ? '▶<span> Resume</span>' : '▶<span> Train</span>';
        pauseTrainingBtn.disabled = !isTrainingActive;
        stopTrainingBtn.disabled = isIdle || simulationState === 'error';
        showRouteBtn.disabled = isRunning || simulationState === 'error' || Object.keys(qTable).length === 0; // Disable if QTable empty

        const settingsDisabled = !isIdle; // Disable settings unless fully idle/stopped/error
        gridSizeSelect.disabled = settingsDisabled;
        generateMapBtn.disabled = settingsDisabled;
        clearDeliveriesBtn.disabled = settingsDisabled;
        learningRateSlider.disabled = settingsDisabled; discountFactorSlider.disabled = settingsDisabled;
        epsilonStartSlider.disabled = settingsDisabled; epsilonDecaySlider.disabled = settingsDisabled;
        epsilonMinSlider.disabled = settingsDisabled; maxEpisodesInput.disabled = settingsDisabled;
        resetQTableBtn.disabled = settingsDisabled;
        saveQTableBtn.disabled = isRunning; loadQTableBtn.disabled = isRunning;
        editModeRadios.forEach(radio => radio.disabled = settingsDisabled);
        canvas.classList.toggle('edit-mode-depot', !settingsDisabled && currentEditMode === 'depot');
        canvas.classList.toggle('edit-mode-delivery', !settingsDisabled && currentEditMode === 'delivery');
        // Remove edit-mode-none class toggle if not needed explicitly
        // canvas.classList.toggle('edit-mode-none', currentEditMode === 'none');
    }


    // --- Event Listeners ---
    // ... (Keep listeners for controls, persistence, main buttons, viz toggles) ...
    clearDeliveriesBtn.addEventListener('click', clearDeliveriesAction);
    editModeRadios.forEach(radio => { radio.addEventListener('change', (e) => {
        currentEditMode = e.target.value;
        canvas.classList.toggle('edit-mode-depot', currentEditMode === 'depot');
        canvas.classList.toggle('edit-mode-delivery', currentEditMode === 'delivery');
        });
    });
    canvas.addEventListener('click', handleCanvasClick);

    // --- Canvas Interaction Logic ---
     function handleCanvasClick(e) {
         if (simulationState !== 'idle' && simulationState !== 'stopped' && simulationState !== 'error') return;
         if (currentEditMode === 'none') return;

         const rect = canvas.getBoundingClientRect();
         const x = e.clientX - rect.left; const y = e.clientY - rect.top;
         const c = Math.floor(x / CELL_SIZE); const r = Math.floor(y / CELL_SIZE);
         if (!isValid(r, c)) return;

         let locationsChanged = false;
         const clickedCoordString = `${r},${c}`;
         const isExistingDepot = depotLocation && depotLocation.r === r && depotLocation.c === c;
         const existingDeliveryIndex = deliveryLocations.findIndex(loc => loc.r === r && loc.c === c);

         switch (currentEditMode) {
             case 'depot':
                 if (existingDeliveryIndex !== -1) { alert("Depot cannot be placed on a Delivery location."); return; }
                 // If clicking on current depot, maybe remove it? For now, just overwrite/set.
                 depotLocation = { r, c }; locationsChanged = true;
                 console.log("Depot manually set to:", depotLocation);
                 break;
             case 'delivery':
                 if (isExistingDepot) { alert("Delivery cannot be placed on the Depot location."); return; }
                 if (existingDeliveryIndex !== -1) { // Remove existing delivery
                     deliveryLocations.splice(existingDeliveryIndex, 1); locationsChanged = true;
                     console.log(`Delivery ${existingDeliveryIndex+1} removed.`);
                 } else { // Add new delivery if limit not reached
                     if (deliveryLocations.length >= MAX_ALLOWED_DELIVERIES) { alert(`Max ${MAX_ALLOWED_DELIVERIES} deliveries reached.`); return; }
                     deliveryLocations.push({ r, c }); locationsChanged = true;
                     console.log(`Delivery ${deliveryLocations.length} placed at:`, {r,c});
                 }
                 break;
         }

         if (locationsChanged) {
             updateAllLocations(); NUM_DELIVERIES = deliveryLocations.length;
             numDeliveriesDisplay.value = NUM_DELIVERIES; nextDeliveryIndexToPlace = NUM_DELIVERIES + 1;
             initQTable(); resetSimulationStats(); bestRoute = []; bestRouteCost = Infinity;
             setStatus("Locations changed. Learning Reset.", "idle");
             requestAnimationFrame(draw); // Redraw with new locations
         }
     }
     // Removed mousemove/out and cellinfobox logic

    // --- Persistence ---
    // ... (Keep saveQTable, loadQTable) ...

    // --- Initial Setup & Resize Handling ---
    console.log("DOM Loaded. Starting initialization...");
    init(true);
    window.addEventListener('resize', resizeCanvas);
    console.log("Initial setup complete.");

}); // End DOMContentLoaded
