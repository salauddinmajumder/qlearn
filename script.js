document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');
    // Settings
    const gridSizeSelect = document.getElementById('gridSize');
    const numDeliveriesSelect = document.getElementById('numDeliveries');
    const resetEnvBtn = document.getElementById('resetEnvBtn');
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
    // Step button removed
    const runGreedyBtn = document.getElementById('runGreedyBtn');
    // Visualization
    const showCurrentPathCheckbox = document.getElementById('showCurrentPath');
    const showTruckCheckbox = document.getElementById('showTruck');
    const showFinalRouteCheckbox = document.getElementById('showFinalRoute');
    // Info Panel
    const statusDisplay = document.getElementById('statusDisplay');
    const episodeDisplay = document.getElementById('episodeDisplay');
    const totalEpisodesDisplay = document.getElementById('totalEpisodesDisplay');
    const destLeftDisplay = document.getElementById('destLeftDisplay'); // New
    const epsilonDisplay = document.getElementById('epsilonDisplay');
    const rewardDisplay = document.getElementById('rewardDisplay'); // Now shows Cost
    const avgRewardDisplay = document.getElementById('avgRewardDisplay'); // Now shows Avg Cost
    const bestRouteCostDisplay = document.getElementById('bestRouteCostDisplay'); // New
    const qTableSizeDisplay = document.getElementById('qTableSizeDisplay');
    // Chart
    const rewardChartCanvas = document.getElementById('rewardChart');

    // --- Configuration & Constants ---
    let GRID_SIZE = parseInt(gridSizeSelect.value);
    let NUM_DELIVERIES = parseInt(numDeliveriesSelect.value);
    let CELL_SIZE = canvas.width / GRID_SIZE;

    const REWARD_SUCCESSFUL_RETURN = 200;
    const COST_PER_DISTANCE_UNIT = 1;

    const ACTIONS = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 }; // Not used directly for actions, but maybe later
    const ACTION_DELTAS = [ { r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 } ];
    const ACTION_NAMES = ['UP', 'DOWN', 'LEFT', 'RIGHT']; // Not used currently
    const ACTION_ARROWS = ['↑', '↓', '←', '→']; // Not used currently

    // --- Q-Learning Parameters ---
    let LEARNING_RATE = parseFloat(learningRateSlider.value);
    let DISCOUNT_FACTOR = parseFloat(discountFactorSlider.value);
    let EPSILON_START = parseFloat(epsilonStartSlider.value);
    let EPSILON_DECAY = parseFloat(epsilonDecaySlider.value);
    let EPSILON_MIN = parseFloat(epsilonMinSlider.value);
    let MAX_EPISODES = parseInt(maxEpisodesInput.value);

    // --- State Variables ---
    let depotLocation = { r: -1, c: -1 };
    let deliveryLocations = [];
    let allLocations = []; // [depot, deliv1, deliv2, ...]
    let currentLocationIndex = 0; // Index in allLocations
    let remainingDeliveries = new Set(); // Set of delivery indices (1 to N)

    let qTable = {};

    let epsilon = 1.0;
    let currentEpisode = 0;
    let episodeCost = 0;
    let episodeRoute = []; // Indices from allLocations

    let simulationState = 'idle';
    let animationFrameId = null;
    let lastTimestamp = 0;
    let stepDelay = 1000 - parseInt(speedSlider.value);
    let timeAccumulator = 0;

    let recentCosts = [];
    const COST_AVERAGE_WINDOW = 100;
    let bestRouteCost = Infinity;
    let bestRoute = []; // Indices from allLocations

    let rewardChart;


    // --- Utility Functions ---
    function getCssVar(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }
    function isValid(r, c) { return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE; }
    function manhattanDistance(loc1, loc2) {
        if (!loc1 || !loc2 || !isValid(loc1.r, loc1.c) || !isValid(loc2.r, loc2.c)) return Infinity;
        return Math.abs(loc1.r - loc2.r) + Math.abs(loc1.c - loc2.c);
    }
     function resizeCanvas() {
         const container = document.querySelector('.canvas-container');
         if (!container) return;
         // Prioritize width, calculate height based on aspect ratio, constrained by viewport height
         const containerPadding = parseFloat(getComputedStyle(container).paddingLeft) * 2;
         const availableWidth = container.clientWidth - containerPadding;
         let canvasSize = Math.max(200, availableWidth); // Start with width

          // Constrain by height (consider header, controls, chart, padding)
         const headerHeight = document.querySelector('.app-header')?.offsetHeight || 60;
         const controlsHeight = document.querySelector('.main-controls')?.offsetHeight || 60;
         const chartHeight = document.querySelector('.chart-container')?.offsetHeight || 220;
         const verticalPadding = 60; // Approximation for overall padding/gaps
         const maxHeight = window.innerHeight - headerHeight - controlsHeight - chartHeight - verticalPadding;
         canvasSize = Math.min(canvasSize, maxHeight, 600); // Limit max size and by height

         if (Math.abs(canvas.width - canvasSize) > 1) {
             canvas.width = canvasSize;
             canvas.height = canvasSize;
             CELL_SIZE = canvas.width / GRID_SIZE;
             console.log(`Canvas resized to ${canvas.width.toFixed(0)}x${canvas.height.toFixed(0)}, Cell Size: ${CELL_SIZE.toFixed(2)}`);
             requestAnimationFrame(draw);
         }
     }

    // --- State Representation ---
    function getStateString(locationIndex, remainingSet) {
        const sortedRemaining = Array.from(remainingSet).sort((a, b) => a - b);
        return `${locationIndex}-${JSON.stringify(sortedRemaining)}`;
    }

    // --- Initialization ---
    function init(resetLearning = true) {
        console.log("Initializing Simulation...");
        setStatus('Initializing...', 'initializing');
        stopSimulationLoop();

        GRID_SIZE = parseInt(gridSizeSelect.value);
        NUM_DELIVERIES = parseInt(numDeliveriesSelect.value);
        resizeCanvas(); // Recalculate CELL_SIZE based on new grid size and container

        MAX_EPISODES = parseInt(maxEpisodesInput.value);
        totalEpisodesDisplay.textContent = MAX_EPISODES;

        if (!placeLocations()) { return; } // Stop if locations can't be placed

        if (resetLearning) {
            initQTable(); resetSimulationStats(); bestRouteCost = Infinity; bestRoute = [];
        } else {
            resetSimulationStats(); recalculateGlobalMinMaxQ();
        }

        updateUIParameterValues(); updateButtonStates();
        setStatus('Ready.', 'idle');
        requestAnimationFrame(draw);
        console.log("Initialization Complete.");
    }

    function placeLocations() { /* ... (Keep the robust version from previous response) ... */
        console.log(`Placing locations on ${GRID_SIZE}x${GRID_SIZE} grid.`);
        deliveryLocations = []; allLocations = []; const placedCoords = new Set();
        let depotR = Math.floor(GRID_SIZE / 2) -1; let depotC = Math.floor(GRID_SIZE / 2) -1;
        if (!isValid(depotR, depotC)) { depotR = 0; depotC = 0; }
        depotLocation = { r: depotR, c: depotC };
        placedCoords.add(`${depotR},${depotC}`); allLocations.push(depotLocation);
        console.log("Depot placed at:", depotLocation);
        let attempts = 0; const maxAttempts = GRID_SIZE * GRID_SIZE * 3;
        while (deliveryLocations.length < NUM_DELIVERIES && attempts < maxAttempts) {
            const r = Math.floor(Math.random() * GRID_SIZE); const c = Math.floor(Math.random() * GRID_SIZE);
            const coordString = `${r},${c}`;
            if (isValid(r, c) && !placedCoords.has(coordString)) {
                const newLoc = { r, c }; deliveryLocations.push(newLoc); allLocations.push(newLoc); placedCoords.add(coordString);
            }
            attempts++;
        }
        if (deliveryLocations.length < NUM_DELIVERIES) {
             console.error(`Could only place ${deliveryLocations.length}/${NUM_DELIVERIES} deliveries after ${attempts} attempts.`);
             setStatus(`Error: Map too small?`, "error"); simulationState = 'error'; updateButtonStates(); return false;
        }
        console.log(`Placed ${deliveryLocations.length} deliveries.`);
        resetAgent(); return true;
    }

    function initQTable() { qTable = {}; globalMinQ = 0; globalMaxQ = 0; }
    function recalculateGlobalMinMaxQ() { /* Still not critical for this viz */ }
    function resetSimulationStats() { /* ... (same as before) ... */
        currentEpisode = 0; episodeReward = 0; epsilon = EPSILON_START; recentCosts = [];
        initChart(); resetAgent(); updateInfoDisplay();
    }
    function resetAgent() { /* ... (same as before, ensure startPos is valid) ... */
        currentLocationIndex = 0; remainingDeliveries = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1));
        episodeCost = 0; episodeRoute = [0]; // Start at depot
    }


    // --- Drawing Functions ---
    function draw() { /* ... (Keep structure: clear, map bg, locations, paths, truck) ... */
        if (!ctx || CELL_SIZE <= 0) { console.error("Draw skip: Invalid context/cell size"); return; }
        try { ctx.clearRect(0, 0, canvas.width, canvas.height); }
        catch (e) { console.error("Clear canvas error:", e); return; }
        drawMapBackground();
        drawLocations();
        // Draw current path only if running and enabled
        if (showCurrentPathCheckbox.checked && (simulationState === 'training' || simulationState === 'paused' || simulationState === 'greedy')) {
             drawRoute(episodeRoute, getCssVar('--current-path-color'), 2);
        }
        // Draw final best route if found and enabled
        if (showFinalRouteCheckbox.checked && bestRoute.length > 1) {
            drawRoute(bestRoute, getCssVar('--final-route-color'), 3.5, true);
        }
        if (showTruckCheckbox.checked) drawTruck();
    }

    function drawMapBackground() { /* ... (Keep grid drawing from previous response) ... */
        ctx.fillStyle = getCssVar('--grid-bg'); ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = getCssVar('--grid-line'); ctx.lineWidth = 1;
        for (let i = 0; i <= GRID_SIZE; i++) {
            const pos = Math.round(i * CELL_SIZE);
            ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, canvas.height); ctx.stroke(); // Vertical
            ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(canvas.width, pos); ctx.stroke(); // Horizontal
        }
    }
    function drawLocations() { /* ... (Keep location drawing with alpha fade from previous response) ... */
        if (depotLocation && isValid(depotLocation.r, depotLocation.c)) { drawMarker(depotLocation, getCssVar('--cell-depot'), 'D'); }
        else { console.warn("Depot invalid for drawing:", depotLocation); }
        deliveryLocations.forEach((loc, index) => {
            if (loc && isValid(loc.r, loc.c)) {
                 const deliveryIndex = index + 1; const isRemaining = remainingDeliveries.has(deliveryIndex);
                 const color = getCssVar('--cell-delivery'); ctx.globalAlpha = isRemaining ? 1.0 : 0.4;
                 drawMarker(loc, color, deliveryIndex.toString()); ctx.globalAlpha = 1.0;
            } else { console.warn(`Delivery ${index+1} invalid for drawing:`, loc); }
        });
    }
    function drawMarker(loc, color, text = '') { /* ... (Keep marker drawing from previous response) ... */
        const centerX = loc.c * CELL_SIZE + CELL_SIZE / 2; const centerY = loc.r * CELL_SIZE + CELL_SIZE / 2;
        const radius = Math.max(4, CELL_SIZE * 0.35);
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
        if (text) {
            ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(8, radius * 0.9)}px ${getCssVar('--font-family')}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, centerX, centerY + 1);
        }
    }
    function drawTruck() { /* ... (Keep truck drawing from previous response) ... */
        if (currentLocationIndex < 0 || currentLocationIndex >= allLocations.length) return;
        const truckLoc = allLocations[currentLocationIndex];
        if (!truckLoc || !isValid(truckLoc.r, truckLoc.c)) return;
        const centerX = truckLoc.c * CELL_SIZE + CELL_SIZE / 2; const centerY = truckLoc.r * CELL_SIZE + CELL_SIZE / 2;
        const truckSize = Math.max(6, CELL_SIZE * 0.55);
        ctx.fillStyle = getCssVar('--truck-color'); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
        ctx.fillRect(centerX - truckSize * 0.4, centerY - truckSize * 0.4, truckSize * 0.8, truckSize * 0.8);
        ctx.strokeRect(centerX - truckSize * 0.4, centerY - truckSize * 0.4, truckSize * 0.8, truckSize * 0.8);
    }
    function drawRoute(routeIndices, color, lineWidth, dashed = false) { /* ... (Keep route drawing from previous response) ... */
        if (!routeIndices || routeIndices.length < 2) return;
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, lineWidth); ctx.lineCap = "round"; ctx.lineJoin = "round";
        if (dashed) ctx.setLineDash([Math.max(2, CELL_SIZE * 0.1), Math.max(2, CELL_SIZE * 0.1)]);
        ctx.beginPath();
        let firstLoc = allLocations[routeIndices[0]]; if (!firstLoc || !isValid(firstLoc.r, firstLoc.c)) return;
        ctx.moveTo(firstLoc.c * CELL_SIZE + CELL_SIZE / 2, firstLoc.r * CELL_SIZE + CELL_SIZE / 2);
        for (let i = 1; i < routeIndices.length; i++) {
            let nextLoc = allLocations[routeIndices[i]]; if (!nextLoc || !isValid(nextLoc.r, nextLoc.c)) continue;
            ctx.lineTo(nextLoc.c * CELL_SIZE + CELL_SIZE / 2, nextLoc.r * CELL_SIZE + CELL_SIZE / 2);
        }
        ctx.stroke(); ctx.setLineDash([]);
    }

    // --- Q-Learning Logic ---
    function getValidActions(locationIndex, remainingSet) { /* ... (same) ... */
         return remainingSet.size === 0 ? [0] : Array.from(remainingSet);
    }
    function getQValue(stateString, action) { /* ... (same lazy init and index mapping) ... */
        const parts = stateString.split('-'); const currentLoc = parseInt(parts[0]); const remaining = JSON.parse(parts[1] || '[]');
        const validActions = remaining.length === 0 ? [0] : [...remaining].sort((a,b)=>a-b); // Ensure sorted
        if (!qTable[stateString]) qTable[stateString] = new Array(validActions.length).fill(0); // Lazy init
        const qIndex = validActions.indexOf(action);
        return qIndex === -1 ? 0 : (qTable[stateString][qIndex] || 0); // Return 0 if action invalid for state or Q not set
    }
    function chooseAction(locationIndex, remainingSet) { /* ... (same epsilon-greedy with valid actions) ... */
        const stateString = getStateString(locationIndex, remainingSet); const validActions = getValidActions(locationIndex, remainingSet);
        if (validActions.length === 0) return -1; if (validActions.length === 1) return validActions[0];
        let chosenAction; const isExploring = (simulationState === 'training' || simulationState === 'stepping') && Math.random() < epsilon;
        if (isExploring) { chosenAction = validActions[Math.floor(Math.random() * validActions.length)]; }
        else {
             const qValues = validActions.map(a => getQValue(stateString, a)); const maxQ = Math.max(...qValues);
             const bestActions = validActions.filter((a, i) => Math.abs(qValues[i] - maxQ) < 1e-6);
             chosenAction = bestActions[Math.floor(Math.random() * bestActions.length)];
        }
        return chosenAction;
    }
    function updateQTable(stateString, action, reward, nextStateString, done) { /* ... (same update logic) ... */
        const validActionsCurrent = getValidActionsFromString(stateString); const qIndex = validActionsCurrent.indexOf(action);
        if (qIndex === -1) { console.warn(`Update skip: Action ${action} invalid for state ${stateString}`); return; }
        if (!qTable[stateString]) qTable[stateString] = new Array(validActionsCurrent.length).fill(0);
        const currentQ = qTable[stateString][qIndex]; let maxNextQ = 0;
        if (!done) {
            const validActionsNext = getValidActionsFromString(nextStateString);
            if (validActionsNext.length > 0) { maxNextQ = Math.max(...validActionsNext.map(a => getQValue(nextStateString, a))); }
        }
        const targetQ = reward + DISCOUNT_FACTOR * maxNextQ; const newQ = currentQ + LEARNING_RATE * (targetQ - currentQ);
        qTable[stateString][qIndex] = newQ;
        // Global min/max update removed for simplicity
    }
    function getValidActionsFromString(stateString) { /* ... (same helper) ... */
         try {
            const parts = stateString.split('-'); const remaining = JSON.parse(parts[1] || '[]');
            return remaining.length === 0 ? [0] : [...remaining].sort((a,b)=>a-b); // Ensure sorted
         } catch (e) { console.error("Error parsing state string:", stateString, e); return []; }
    }

    // --- Simulation Step & Loop ---
    function runSingleStep() { /* ... (same as previous correct version) ... */
         if (currentLocationIndex < 0 || currentLocationIndex >= allLocations.length) { console.error("Invalid location:", currentLocationIndex); setStatus("Error", "error"); stopSimulationLoop(); return; }
         const stateString = getStateString(currentLocationIndex, remainingDeliveries); const action = chooseAction(currentLocationIndex, remainingDeliveries);
         if (action === -1) { setStatus("Error: Choose action failed", "error"); stopSimulationLoop(); return; }
         const currentLocation = allLocations[currentLocationIndex]; const nextLocation = allLocations[action];
         const distance = manhattanDistance(currentLocation, nextLocation); const cost = distance * COST_PER_DISTANCE_UNIT; const reward = -cost;
         const previousLocationIndex = currentLocationIndex; currentLocationIndex = action; episodeCost += cost;
         let nextRemainingDeliveries = new Set(remainingDeliveries); if (action !== 0) nextRemainingDeliveries.delete(action);
         const done = (currentLocationIndex === 0 && nextRemainingDeliveries.size === 0); let finalReward = reward; if (done) finalReward += REWARD_SUCCESSFUL_RETURN;
         const nextStateString = getStateString(currentLocationIndex, nextRemainingDeliveries);
         if (simulationState === 'training' || simulationState === 'stepping') updateQTable(stateString, action, finalReward, nextStateString, done);
         remainingDeliveries = nextRemainingDeliveries;
         // Update paths
         episodeRoute.push(currentLocationIndex);
         if (simulationState === 'greedy') { finalGreedyPath.push(currentLocationIndex); }
         // Agent trail update removed for simplicity, can be added back if needed
         if (done) handleEpisodeEnd(true);
    }
    function handleEpisodeEnd(succeeded) { /* ... (same logic, including best route update) ... */
        const wasTraining = simulationState === 'training'; const wasStepping = simulationState === 'stepping'; const wasGreedy = simulationState === 'greedy';
        if (succeeded && (wasTraining || wasStepping)) {
             recentCosts.push(episodeCost); if (recentCosts.length > COST_AVERAGE_WINDOW) recentCosts.shift();
             updateChart(); if (epsilon > EPSILON_MIN) epsilon *= EPSILON_DECAY;
        }
        if (succeeded && episodeCost < bestRouteCost) { bestRouteCost = episodeCost; bestRoute = [...episodeRoute]; console.log(`New best: Cost ${bestRouteCost.toFixed(0)}`, bestRoute); }
        if (wasTraining) {
            currentEpisode++; if (currentEpisode >= MAX_EPISODES) { setStatus(`Training Finished (Max Ep.).`, 'finished'); stopSimulationLoop(); bestRoute = findBestRouteFromQTable() || bestRoute; } else { resetAgent(); }
        } else if (wasStepping) { setStatus(`Episode End (${succeeded ? 'Success' : 'Stopped'}). Paused.`, 'paused'); simulationState = 'paused'; updateButtonStates(); resetAgent(); }
        else if (wasGreedy) { if (succeeded) { setStatus(`Route Found. Cost: ${episodeCost.toFixed(0)}.`, 'finished'); bestRoute = [...episodeRoute]; bestRouteCost = episodeCost; } else { setStatus(`Greedy Run Failed/Stopped.`, 'stopped'); } stopSimulationLoop(); }
        else { resetAgent(); }
        if (!wasGreedy) { episodeCost = 0; } updateInfoDisplay();
    }
    function simulationLoop(timestamp) { /* ... (same timing logic) ... */
         if (simulationState === 'stopped' || simulationState === 'error') { animationFrameId = null; updateButtonStates(); return; }
         animationFrameId = requestAnimationFrame(simulationLoop);
         const deltaTime = timestamp - (lastTimestamp || timestamp); lastTimestamp = timestamp;
         if (simulationState === 'training' || simulationState === 'greedy') {
             timeAccumulator += deltaTime; const effectiveDelay = (speedSlider.value >= 990) ? 0 : stepDelay; let stepsToTake = 0;
             if (effectiveDelay <= 1) { stepsToTake = 5; } else { stepsToTake = Math.floor(timeAccumulator / effectiveDelay); }
             if (stepsToTake > 0) {
                 timeAccumulator -= stepsToTake * effectiveDelay;
                 for (let i = 0; i < stepsToTake; i++) { if (simulationState !== 'training' && simulationState !== 'greedy') break; runSingleStep(); if (simulationState === 'stopped' || simulationState === 'paused' || simulationState === 'error' || simulationState === 'idle') break; }
                 requestAnimationFrame(draw); updateInfoDisplay();
             }
         }
         updateButtonStates(); // Ensure buttons are up-to-date each frame
    }
    function stopSimulationLoop() { /* ... (same stop logic) ... */
         if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
         const wasRunning = simulationState !== 'idle' && simulationState !== 'stopped' && simulationState !== 'error';
         simulationState = 'stopped'; updateButtonStates();
         if (wasRunning) { setStatus('Simulation Stopped.', 'stopped'); requestAnimationFrame(draw); }
         lastTimestamp = 0; timeAccumulator = 0;
    }

    // --- Simulation Control Actions ---
    // ... (Keep startTrainingAction, pauseTrainingAction, stopAction, greedyAction) ...
    // Note: greedyAction now just calculates/shows best route instantly

    // --- Find Best Route from Q-Table ---
    // ... (Keep findBestRouteFromQTable, calculateRouteCost) ...

    // --- Charting ---
    // ... (Keep initChart, updateChart) ...

    // --- UI Updates & Event Handlers ---
    // ... (Keep updateButtonStates, updateInfoDisplay, setStatus, updateUIParameterValues, updateSpeedDisplay) ...

    // --- Event Listeners ---
    // ... (Keep all event listeners, ensure they call init(true) or similar when needed) ...
     gridSizeSelect.addEventListener('change', (e) => { init(true); }); // Full init on grid size change
     numDeliveriesSelect.addEventListener('change', (e) => { init(true); }); // Full init on delivery# change
     resetEnvBtn.addEventListener('click', () => init(true));
     // Clear obstacles button listener removed
     // Reset QTable button listener kept
     resetQTableBtn.addEventListener('click', () => { if (confirm("Reset all learning progress (Q-Table)?")) { initQTable(); resetSimulationStats(); setStatus("Learning Reset.", "idle"); requestAnimationFrame(draw); } });
     // Persistence listeners kept
     saveQTableBtn.addEventListener('click', saveQTable);
     loadQTableBtn.addEventListener('click', loadQTable);
     // Main controls listeners kept
     startTrainingBtn.addEventListener('click', startTrainingAction);
     pauseTrainingBtn.addEventListener('click', pauseTrainingAction);
     stopTrainingBtn.addEventListener('click', stopAction);
     runGreedyBtn.addEventListener('click', greedyAction); // Show Route button
     // Speed slider listener kept
     speedSlider.addEventListener('input', (e) => { updateSpeedDisplay(e.target.value); });
     // Visualization toggles kept
     showCurrentPathCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
     showTruckCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
     showFinalRouteCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
     // Canvas Interaction listeners removed as edit mode is gone

    // --- Persistence ---
    // ... (Keep saveQTable, loadQTable - validation is important here) ...
     function saveQTable() {
         try {
             // Only save relevant data
             const dataToSave = {
                 gridSize: GRID_SIZE, numDeliveries: NUM_DELIVERIES,
                 qTable: qTable, bestRoute: bestRoute, bestRouteCost: bestRouteCost,
                 // Maybe save algorithm params too? learningRate: LEARNING_RATE, discountFactor: DISCOUNT_FACTOR etc.
             };
             localStorage.setItem('deliveryQLearning_v2', JSON.stringify(dataToSave)); // New key
             setStatus("Policy & Best Route Saved.", "idle");
         } catch (e) { console.error("Save failed:", e); setStatus("Error saving.", "error"); alert("Could not save."); }
     }
     function loadQTable() {
         try {
             const savedData = localStorage.getItem('deliveryQLearning_v2');
             if (!savedData) { alert("No saved data found."); return; }
             const loadedData = JSON.parse(savedData);

             // **Crucial Validation** - check if grid/delivery# match
             if (loadedData.gridSize !== GRID_SIZE || loadedData.numDeliveries !== NUM_DELIVERIES) {
                  if (!confirm(`Saved data is for ${loadedData.numDeliveries} deliveries on ${loadedData.gridSize}x${loadedData.gridSize}. Current is ${NUM_DELIVERIES} on ${GRID_SIZE}x${GRID_SIZE}. Load anyway and regenerate map?`)) return;
                  // Update settings from loaded data and re-initialize map
                  GRID_SIZE = loadedData.gridSize;
                  NUM_DELIVERIES = loadedData.numDeliveries;
                  gridSizeSelect.value = GRID_SIZE; // Update UI
                  numDeliveriesSelect.value = NUM_DELIVERIES;
                  init(false); // Re-init map but keep loaded Q-table logic below
             }

             qTable = loadedData.qTable || {};
             bestRoute = loadedData.bestRoute || [];
             bestRouteCost = loadedData.bestRouteCost === undefined ? Infinity : loadedData.bestRouteCost;
             resetSimulationStats(); // Reset episode, etc.
             epsilon = EPSILON_MIN; // Assume loaded is trained
             setStatus("Policy Loaded. Epsilon low.", "idle");
             updateInfoDisplay();
             requestAnimationFrame(draw); // Draw loaded state + best route
         } catch (e) { console.error("Load failed:", e); setStatus("Error loading.", "error"); alert("Could not load policy."); }
     }


    // --- Initial Setup & Resize Handling ---
    init(true);
    window.addEventListener('resize', resizeCanvas);

}); // End DOMContentLoaded
