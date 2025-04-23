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
    let GRID_SIZE = 10; // Default value before reading from select
    let NUM_DELIVERIES = 5; // Default value
    let CELL_SIZE = 0; // Initialize to 0, calculate properly in init/resize

    const REWARD_SUCCESSFUL_RETURN = 200;
    const COST_PER_DISTANCE_UNIT = 1;

    const ACTIONS = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 }; // Not used directly for actions, but maybe later
    const ACTION_DELTAS = [ { r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 } ];
    const ACTION_NAMES = ['UP', 'DOWN', 'LEFT', 'RIGHT']; // Not used currently
    const ACTION_ARROWS = ['↑', '↓', '←', '→']; // Not used currently

    // --- Q-Learning Parameters ---
    let LEARNING_RATE, DISCOUNT_FACTOR, EPSILON_START, EPSILON_DECAY, EPSILON_MIN, MAX_EPISODES; // Will be set in init

    // --- State Variables ---
    let grid = []; // Not visually used, but can hold metadata if needed
    let qTable = {};
    let depotLocation = null; // Use null initially
    let deliveryLocations = [];
    let allLocations = []; // [depot, deliv1, deliv2, ...]
    let currentLocationIndex = 0;
    let remainingDeliveries = new Set();
    let epsilon = 1.0;
    let currentEpisode = 0;
    let currentStep = 0; // Added step counter
    let episodeCost = 0;
    let episodeRoute = [];
    let simulationState = 'idle';
    let animationFrameId = null;
    let lastTimestamp = 0;
    let stepDelay = 500; // Default value
    let timeAccumulator = 0;
    let recentCosts = [];
    const COST_AVERAGE_WINDOW = 100;
    let bestRouteCost = Infinity;
    let bestRoute = [];
    let rewardChart;


    // --- Utility Functions ---
    function getCssVar(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }
    function isValid(r, c) { return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE; }
    function manhattanDistance(loc1, loc2) {
        if (!loc1 || !loc2 || typeof loc1.r !== 'number' || typeof loc1.c !== 'number' || typeof loc2.r !== 'number' || typeof loc2.c !== 'number' || !isValid(loc1.r, loc1.c) || !isValid(loc2.r, loc2.c)) {
             // console.warn("Invalid input to manhattanDistance:", loc1, loc2);
             return Infinity; // Return infinity for invalid inputs
        }
        return Math.abs(loc1.r - loc2.r) + Math.abs(loc1.c - loc2.c);
    }

     function resizeCanvas() {
         const container = document.querySelector('.canvas-container');
         if (!container) { console.error("Canvas container not found!"); return false; }

         const containerStyle = getComputedStyle(container);
         const containerPaddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
         const containerPaddingY = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);

         const availableWidth = container.clientWidth - containerPaddingX;
         // More accurate height calculation needed if layout is complex
         // For now, assume width constraint is primary, or use aspect ratio
         // Estimate available height - this might need adjustment based on other elements
         const headerHeight = document.querySelector('.app-header')?.offsetHeight || 60;
         const controlsHeight = document.querySelector('.main-controls')?.offsetHeight || 60;
         const chartHeight = document.querySelector('.chart-container')?.offsetHeight || 220;
         const verticalPadding = 60; // Approximation for overall padding/gaps
         let availableHeight = window.innerHeight - headerHeight - controlsHeight - chartHeight - verticalPadding;
         if(availableHeight < 200) availableHeight = 200; // Minimum height

         // Use Math.min to constrain by both width and estimated height
         const canvasSize = Math.max(200, Math.min(availableWidth, availableHeight)); // Base size on width, constrain by height, min 200px

         // Limit max size if needed
         const maxSize = 600;
         const finalSize = Math.min(canvasSize, maxSize);

         if (Math.abs(canvas.width - finalSize) > 1 || CELL_SIZE <= 0 || canvas.width === 0) { // Resize if size changed or cell size invalid
             canvas.width = finalSize;
             canvas.height = finalSize; // Keep it square
             // *** Crucial: Calculate CELL_SIZE *after* setting canvas dimensions ***
             // Check GRID_SIZE validity before division
             if (GRID_SIZE > 0) {
                 CELL_SIZE = canvas.width / GRID_SIZE;
             } else {
                  console.error("GRID_SIZE is invalid during resize!");
                  CELL_SIZE = 0; // Prevent NaN or Infinity
                  return false; // Indicate failure
             }

             console.log(`Canvas resized to ${canvas.width.toFixed(0)}x${canvas.height.toFixed(0)}, Cell Size: ${CELL_SIZE.toFixed(2)}`);
             if (CELL_SIZE <= 0) {
                 console.error("FATAL: CELL_SIZE calculation resulted in non-positive value!");
                 return false; // Indicate failure
             }
             // Trigger redraw ONLY if simulation is idle/paused/stopped
             if (simulationState === 'idle' || simulationState === 'paused' || simulationState === 'stopped' || simulationState === 'error') {
                requestAnimationFrame(draw);
             }
             return true;
         }
         return false;
     }


    // --- State Representation ---
    function getStateString(locationIndex, remainingSet) {
        // Ensure remainingSet is a Set before proceeding
        if (!(remainingSet instanceof Set)) {
            console.error("Invalid remainingSet passed to getStateString:", remainingSet);
            // Try to recover if it's an array-like object
            if (Array.isArray(remainingSet)) {
                 remainingSet = new Set(remainingSet);
            } else {
                 return `${locationIndex}-error`; // Return error state string
            }
        }
        const sortedRemaining = Array.from(remainingSet).sort((a, b) => a - b);
        return `${locationIndex}-${JSON.stringify(sortedRemaining)}`;
    }

    // --- Initialization ---
    function init(resetLearning = true) {
        console.log("--- Running Initialization ---");
        setStatus('Initializing...', 'initializing');
        stopSimulationLoop(); // Stop previous run

        // 1. Read and Validate Core Settings
        GRID_SIZE = parseInt(gridSizeSelect.value);
        NUM_DELIVERIES = parseInt(numDeliveriesSelect.value);
        if (isNaN(GRID_SIZE) || GRID_SIZE <= 1 || isNaN(NUM_DELIVERIES) || NUM_DELIVERIES < 1) {
             console.error("Invalid Grid Size or Number of Deliveries selected.");
             setStatus("Error: Invalid Settings", "error");
             return;
        }
        updateAlgorithmParamsFromUI(); // Read algorithm params from UI
        console.log(`Settings: Grid=${GRID_SIZE}x${GRID_SIZE}, Deliveries=${NUM_DELIVERIES}`);

        // 2. Ensure Canvas Size and CELL_SIZE are valid (CRITICAL)
        if (!resizeCanvas() && (CELL_SIZE <= 0 || canvas.width === 0)) {
             console.log("Forcing CELL_SIZE calculation after initial resize attempt.");
              if (canvas.width > 0 && GRID_SIZE > 0) {
                   CELL_SIZE = canvas.width / GRID_SIZE;
                   console.log(`Forced CELL_SIZE calculation: ${CELL_SIZE.toFixed(2)}`);
              } else {
                   console.warn("Canvas width or GRID_SIZE is invalid during fallback calculation. Using default.");
                   // Fallback if canvas width is still 0 (shouldn't happen after DOMContentLoaded)
                   canvas.width = 300; canvas.height = 300; // Default size
                   GRID_SIZE = 10; // Default grid size if invalid
                   gridSizeSelect.value = GRID_SIZE; // Update UI
                   CELL_SIZE = canvas.width / GRID_SIZE;
              }

             if (CELL_SIZE <= 0) {
                  console.error("FATAL: Cell size calculation failed even after fallback!", canvas.width, GRID_SIZE);
                  setStatus("Error: Canvas setup failed", "error");
                  return;
             }
        }
        console.log(`Canvas: ${canvas.width}x${canvas.height}, CELL_SIZE: ${CELL_SIZE.toFixed(2)}`);


        // 3. Place Locations (Needs valid GRID_SIZE)
        if (!placeLocations()) {
            console.error("Initialization failed: Could not place locations.");
             setStatus("Error: Location Placement Failed", "error");
             simulationState = 'error'; updateButtonStates();
            return; // Stop init
        }

        // 4. Initialize Learning State
        if (resetLearning) {
            initQTable(); resetSimulationStats(); bestRouteCost = Infinity; bestRoute = [];
        } else {
            resetSimulationStats(); // Keep Q-table
        }

        // 5. Final UI Updates & Initial Draw
        updateButtonStates();
        setStatus('Ready.', 'idle');
        console.log("Requesting initial draw...");
        requestAnimationFrame(draw); // Ensure draw happens *after* all setup
        console.log("--- Initialization Complete ---");
    }

     function placeLocations() {
         console.log(`Placing ${NUM_DELIVERIES+1} locations (incl. Depot) on ${GRID_SIZE}x${GRID_SIZE}...`);
         deliveryLocations = []; allLocations = []; const placedCoords = new Set(); depotLocation = null;

         // Place Depot
         let depotPlaced = false; let attempts = 0; const maxPlacementAttempts = GRID_SIZE * GRID_SIZE * 5;
         while(!depotPlaced && attempts < maxPlacementAttempts) {
              const r = Math.floor(Math.random() * GRID_SIZE); const c = Math.floor(Math.random() * GRID_SIZE);
              if(isValid(r,c)) { // Only need validity check here
                   depotLocation = {r,c}; placedCoords.add(`${r},${c}`); allLocations.push(depotLocation); depotPlaced = true;
                   console.log("Depot placed at:", depotLocation);
              }
              attempts++;
         }
         if(!depotPlaced) { console.error("Failed to place Depot!"); return false;}

         // Place Deliveries
         attempts = 0; // Reset attempts for deliveries
         while (deliveryLocations.length < NUM_DELIVERIES && attempts < maxPlacementAttempts) {
             const r = Math.floor(Math.random() * GRID_SIZE); const c = Math.floor(Math.random() * GRID_SIZE);
             const coordString = `${r},${c}`;
             if (isValid(r, c) && !placedCoords.has(coordString)) {
                 const newLoc = { r, c }; deliveryLocations.push(newLoc); allLocations.push(newLoc); placedCoords.add(coordString);
             }
             attempts++;
         }

         if (deliveryLocations.length < NUM_DELIVERIES) {
              console.error(`Could only place ${deliveryLocations.length}/${NUM_DELIVERIES} deliveries.`);
              setStatus(`Error: Map too small?`, "error");
              simulationState = 'error'; updateButtonStates(); return false;
         }
         console.log(`Placed ${deliveryLocations.length} deliveries.`);
         resetAgent(); return true;
     }

    function initQTable() { qTable = {}; globalMinQ = 0; globalMaxQ = 0; }
    function recalculateGlobalMinMaxQ() { /* Not used */ }
    function resetSimulationStats() {
        currentEpisode = 0; episodeCost = 0; epsilon = EPSILON_START; recentCosts = [];
        initChart(); resetAgent(); updateInfoDisplay(); // Update info after resetting agent
    }
    function resetAgent() {
        currentLocationIndex = 0; // Start at depot index
        remainingDeliveries = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1));
        episodeCost = 0;
        episodeRoute = depotLocation ? [0] : []; // Start route only if depot exists
        currentStep = 0;
    }


    // --- Drawing Functions ---
    function draw() {
        if (!ctx || CELL_SIZE <= 0 || canvas.width <= 0 || canvas.height <= 0) {
             console.warn("Draw skip: Invalid context or dimensions.", {ctx, CELL_SIZE, w: canvas.width, h: canvas.height});
             return;
         }
        try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawMapBackground(); // Base layer (grid lines)
            // Draw paths before locations so markers are on top
            if (showCurrentPathCheckbox.checked && (simulationState === 'training' || simulationState === 'paused' || simulationState === 'greedy')) {
                 drawRoute(episodeRoute, getCssVar('--current-path-color'), 2);
            }
            if (showFinalRouteCheckbox.checked && bestRoute.length > 1) {
                drawRoute(bestRoute, getCssVar('--final-route-color'), 3.5, true);
            }
            drawLocations();     // Depot and delivery markers
            if (showTruckCheckbox.checked) {
                drawTruck();
            }
        } catch (e) {
            console.error("Error during drawing:", e);
            setStatus("Error: Drawing Failed", "error");
            stopSimulationLoop(); // Stop simulation if drawing crashes
        }
    }

    function drawMapBackground() {
        ctx.fillStyle = getCssVar('--grid-bg'); ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = getCssVar('--grid-line'); ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= GRID_SIZE; i++) {
            const pos = Math.round(i * CELL_SIZE);
            if (pos > canvas.width + 1 || pos > canvas.height + 1) continue;
            ctx.moveTo(pos, 0); ctx.lineTo(pos, canvas.height); // Vertical
            ctx.moveTo(0, pos); ctx.lineTo(canvas.width, pos); // Horizontal
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
        let firstLoc = allLocations[routeIndices[0]];
        if (!firstLoc || !isValid(firstLoc.r, firstLoc.c)) { ctx.setLineDash([]); console.warn("Invalid start loc in route"); return; }
        ctx.moveTo(firstLoc.c * CELL_SIZE + CELL_SIZE / 2, firstLoc.r * CELL_SIZE + CELL_SIZE / 2);

        for (let i = 1; i < routeIndices.length; i++) {
            let nextLocIndex = routeIndices[i];
            if(nextLocIndex === undefined || nextLocIndex === null || nextLocIndex < 0 || nextLocIndex >= allLocations.length) {
                console.warn(`Invalid index ${nextLocIndex} in route at step ${i}`); continue;
            }
            let nextLoc = allLocations[nextLocIndex];
            if (!nextLoc || !isValid(nextLoc.r, nextLoc.c)) {
                 console.warn(`Invalid location data for index ${nextLocIndex} in route at step ${i}`); continue;
            }
            ctx.lineTo(nextLoc.c * CELL_SIZE + CELL_SIZE / 2, nextLoc.r * CELL_SIZE + CELL_SIZE / 2);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }


    // --- Q-Learning Logic ---
    function getValidActions(locationIndex, remainingSet) {
         return remainingSet.size === 0 ? [0] : Array.from(remainingSet);
    }
    function getQValue(stateString, action) {
        try {
            const parts = stateString.split('-');
            const remaining = JSON.parse(parts[1] || '[]');
            const validActions = remaining.length === 0 ? [0] : [...remaining].sort((a,b)=>a-b);
            if (!qTable[stateString]) qTable[stateString] = new Array(validActions.length).fill(0);
            const qIndex = validActions.indexOf(action);
            // Return 0 if action is not valid for this state (should ideally not happen if called correctly)
            // or if the Q-value hasn't been set yet (defaults to 0).
            return qIndex === -1 ? 0 : (qTable[stateString][qIndex] || 0);
        } catch (e) {
             console.error("Error in getQValue:", e, "State:", stateString, "Action:", action);
             return 0; // Default Q value on error
        }
    }
    function chooseAction(locationIndex, remainingSet) {
        const stateString = getStateString(locationIndex, remainingSet);
        const validActions = getValidActions(locationIndex, remainingSet);
        if (validActions.length === 0) return -1;
        if (validActions.length === 1) return validActions[0];
        let chosenAction;
        const isExploring = (simulationState === 'training' || simulationState === 'stepping') && Math.random() < epsilon;
        if (isExploring) {
            chosenAction = validActions[Math.floor(Math.random() * validActions.length)];
        } else {
             const qValues = validActions.map(a => getQValue(stateString, a));
             // Check if all Q-values are effectively the same (e.g., all zero)
             const firstQ = qValues[0];
             const allSame = qValues.every(q => Math.abs(q - firstQ) < 1e-6);
             if(allSame) {
                 // If all Q-values are the same, pick a random valid action
                 chosenAction = validActions[Math.floor(Math.random() * validActions.length)];
             } else {
                  // Otherwise, find the max Q and choose among the best
                 const maxQ = Math.max(...qValues);
                 const bestActions = validActions.filter((a, i) => Math.abs(qValues[i] - maxQ) < 1e-6);
                 chosenAction = bestActions[Math.floor(Math.random() * bestActions.length)];
             }
        }
        return chosenAction;
    }
    function updateQTable(stateString, action, reward, nextStateString, done) {
        const validActionsCurrent = getValidActionsFromString(stateString);
        const qIndex = validActionsCurrent.indexOf(action);
        if (qIndex === -1) { console.warn(`Update skip: Action ${action} invalid for state ${stateString}`); return; }
        if (!qTable[stateString]) qTable[stateString] = new Array(validActionsCurrent.length).fill(0);
        const currentQ = qTable[stateString][qIndex]; let maxNextQ = 0;
        if (!done) {
            const validActionsNext = getValidActionsFromString(nextStateString);
            if (validActionsNext.length > 0) {
                // Ensure next state is initialized in Q-table if needed before getting max Q
                if (!qTable[nextStateString]) {
                     qTable[nextStateString] = new Array(validActionsNext.length).fill(0);
                }
                 maxNextQ = Math.max(...validActionsNext.map(a => getQValue(nextStateString, a)));
            }
        }
        const targetQ = reward + DISCOUNT_FACTOR * maxNextQ;
        const newQ = currentQ + LEARNING_RATE * (targetQ - currentQ);
        qTable[stateString][qIndex] = newQ;
    }
    function getValidActionsFromString(stateString) {
         try {
            const parts = stateString.split('-'); const remaining = JSON.parse(parts[1] || '[]');
            return remaining.length === 0 ? [0] : [...remaining].sort((a,b)=>a-b);
         } catch (e) { console.error("Error parsing state string:", stateString, e); return []; }
    }

    // --- Simulation Step & Loop ---
    function runSingleStep() {
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
         remainingDeliveries = nextRemainingDeliveries; // Update main state *after* using old value for Q update
         episodeRoute.push(currentLocationIndex);
         // Agent trail removed
         if (done) handleEpisodeEnd(true);
         currentStep++; // Increment step count
    }
    function handleEpisodeEnd(succeeded) {
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
        else { resetAgent(); } // Reset if stopped manually
        if (!wasGreedy) { episodeCost = 0; } // Reset cost for next run, unless greedy just finished
        updateInfoDisplay();
    }
    function simulationLoop(timestamp) {
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
         updateButtonStates();
    }
    function stopSimulationLoop() {
         if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
         const wasRunning = simulationState !== 'idle' && simulationState !== 'stopped' && simulationState !== 'error';
         simulationState = 'stopped'; updateButtonStates();
         if (wasRunning) { setStatus('Simulation Stopped.', 'stopped'); requestAnimationFrame(draw); }
         lastTimestamp = 0; timeAccumulator = 0;
    }

    // --- Simulation Control Actions ---
    function startTrainingAction() {
         if (simulationState === 'training') return;
         const resuming = simulationState === 'paused';
         if (!resuming) { initQTable(); resetSimulationStats(); bestRouteCost = Infinity; bestRoute = []; epsilon = EPSILON_START; setStatus('Training Started...', 'training'); }
         else { setStatus('Training Resumed...', 'training'); }
         simulationState = 'training'; updateButtonStates();
         if (!animationFrameId) { lastTimestamp = performance.now(); timeAccumulator = 0; animationFrameId = requestAnimationFrame(simulationLoop); }
    }
    function pauseTrainingAction() {
         if (simulationState === 'training') { simulationState = 'paused'; setStatus('Training Paused.', 'paused'); updateButtonStates(); }
    }
    function stopAction() { stopSimulationLoop(); }
    function greedyAction() { // Show Route button action
        if (simulationState === 'training' || simulationState === 'greedy') return;
        console.log("Calculating best route from Q-Table..."); setStatus('Calculating Route...', 'stepping'); updateButtonStates();
        setTimeout(() => {
             const route = findBestRouteFromQTable();
             if (route) {
                 bestRoute = route; bestRouteCost = calculateRouteCost(route);
                 setStatus(`Optimal Route Found. Cost: ${bestRouteCost.toFixed(0)}.`, 'finished');
                 console.log("Best Route:", route, "Cost:", bestRouteCost);
                 resetAgent(); // Reset agent state for visual clarity
                 episodeRoute = [...bestRoute]; // Set current path to best path for drawing
             } else {
                 setStatus('Could not determine route (Train more?).', 'error'); bestRoute = []; bestRouteCost = Infinity;
                 resetAgent(); episodeRoute = [0]; // Reset to start if failed
             }
             simulationState = 'idle'; updateButtonStates(); updateInfoDisplay();
             requestAnimationFrame(draw); // Draw the final route
        }, 10);
    }


    // --- Find Best Route from Q-Table ---
    function findBestRouteFromQTable() {
         let currentLoc = 0; let remaining = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1)); const route = [0];
         let safetyBreak = 0; const maxSteps = NUM_DELIVERIES + 5; // Safety break slightly larger
         while (remaining.size > 0 && safetyBreak < maxSteps) {
             const stateStr = getStateString(currentLoc, remaining); const validActions = getValidActions(currentLoc, remaining);
             if (validActions.length === 0) { console.error("Route Error: No valid actions from", stateStr); return null; }
             const qValues = validActions.map(a => getQValue(stateStr, a));
             // Check if Q-values are all effectively zero (or the same initial value)
             const firstQ = qValues[0]; const allSameOrZero = qValues.every(q => Math.abs(q - firstQ) < 1e-6);
             let nextLoc;
             if (allSameOrZero && qValues.length > 1) {
                 // If all Q-values are the same (untrained state?), pick a random valid action *other than current* if possible
                 let possibleNext = validActions.filter(a => a !== currentLoc);
                 if (possibleNext.length === 0) possibleNext = validActions; // Fallback if only current is possible (shouldn't happen here)
                 nextLoc = possibleNext[Math.floor(Math.random() * possibleNext.length)];
                 console.warn("Choosing random action in findBestRoute due to equal Q-values for state:", stateStr);
             } else {
                  // Standard greedy choice
                 const maxQ = Math.max(...qValues);
                 const bestActions = validActions.filter((a, idx) => Math.abs(qValues[idx] - maxQ) < 1e-6);
                 nextLoc = bestActions[Math.floor(Math.random() * bestActions.length)]; // Use random tie-breaking
             }
             if (nextLoc === undefined) { console.error("Route Error: Undefined nextLoc", stateStr, validActions, qValues); return null; }
             route.push(nextLoc); currentLoc = nextLoc; remaining.delete(nextLoc); safetyBreak++;
         }
         if (remaining.size === 0) { route.push(0); } // Add return to depot
         else { console.error("Route Error: Did not visit all locations.", route, remaining); return null; }
         return route;
     }
      function calculateRouteCost(routeIndices) {
         let totalCost = 0; if (!routeIndices || routeIndices.length < 2) return 0;
         for (let i = 0; i < routeIndices.length - 1; i++) {
             const loc1 = allLocations[routeIndices[i]]; const loc2 = allLocations[routeIndices[i+1]];
             const dist = manhattanDistance(loc1, loc2);
             if (dist === Infinity) return Infinity; totalCost += dist * COST_PER_DISTANCE_UNIT;
         }
         return totalCost;
      }

    // --- Charting ---
    function initChart() {
        if (rewardChart) rewardChart.destroy();
        const ctxChart = rewardChartCanvas.getContext('2d');
        if (!ctxChart) { console.error("Chart context failed"); return; }
        rewardChart = new Chart(ctxChart, {
            type: 'line', data: { labels: [], datasets: [{ label: `Avg Route Cost (Last ${COST_AVERAGE_WINDOW})`, data: [], borderColor: getCssVar('--primary-color'), backgroundColor: 'rgba(13, 110, 253, 0.1)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: true }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Episode' }, grid: { display: false } }, y: { title: { display: true, text: 'Average Cost (-Reward)' }, grid: { color: '#e9ecef' } } }, plugins: { legend: { display: false }, tooltip: { enabled: true, intersect: false, mode: 'index', } }, animation: { duration: 100 } }
        });
    }
    function updateChart() {
         if (!rewardChart || recentCosts.length === 0) return;
         const updateFrequency = Math.max(10, Math.floor(MAX_EPISODES / 200));
         if (currentEpisode > 0 && currentEpisode % updateFrequency === 0) {
             const avgCost = recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length;
             const label = currentEpisode;
             rewardChart.data.labels.push(label);
             rewardChart.data.datasets[0].data.push(avgCost);
             const maxChartPoints = 500;
             while (rewardChart.data.labels.length > maxChartPoints) { rewardChart.data.labels.shift(); rewardChart.data.datasets[0].data.shift(); }
             rewardChart.update('none');
         }
    }

    // --- UI Updates & Event Handlers ---
    function updateButtonStates() {
        const isIdle = simulationState === 'idle' || simulationState === 'stopped' || simulationState === 'error';
        const isPaused = simulationState === 'paused';
        const isTrainingActive = simulationState === 'training';
        const isRunning = !isIdle && !isPaused;

        startTrainingBtn.disabled = isTrainingActive || simulationState === 'error';
        startTrainingBtn.innerHTML = (isPaused) ? '▶<span> Resume</span>' : '▶<span> Train</span>';
        pauseTrainingBtn.disabled = !isTrainingActive;
        stopTrainingBtn.disabled = isIdle || simulationState === 'error';
        runGreedyBtn.disabled = isRunning || simulationState === 'error';

        const settingsDisabled = !isIdle;
        gridSizeSelect.disabled = settingsDisabled; numDeliveriesSelect.disabled = settingsDisabled;
        resetEnvBtn.disabled = settingsDisabled; learningRateSlider.disabled = settingsDisabled;
        discountFactorSlider.disabled = settingsDisabled; epsilonStartSlider.disabled = settingsDisabled;
        epsilonDecaySlider.disabled = settingsDisabled; epsilonMinSlider.disabled = settingsDisabled;
        maxEpisodesInput.disabled = settingsDisabled; resetQTableBtn.disabled = settingsDisabled;
        saveQTableBtn.disabled = isRunning; loadQTableBtn.disabled = isRunning;
    }
    function updateInfoDisplay() {
        episodeDisplay.textContent = currentEpisode;
        totalEpisodesDisplay.textContent = MAX_EPISODES;
        destLeftDisplay.textContent = remainingDeliveries?.size ?? 'N/A';
        epsilonDisplay.textContent = (simulationState === 'training' || simulationState === 'paused') ? epsilon.toFixed(4) : 'N/A';
        rewardDisplay.textContent = episodeCost?.toFixed(0) ?? '0';
        if (recentCosts.length > 0) { const avg = recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length; avgRewardDisplay.textContent = avg.toFixed(2); }
        else { avgRewardDisplay.textContent = "N/A"; }
        bestRouteCostDisplay.textContent = bestRouteCost === Infinity ? "N/A" : bestRouteCost.toFixed(0);
        qTableSizeDisplay.textContent = `${Object.keys(qTable).length}`;
    }
    function setStatus(message, className = '') {
        statusDisplay.textContent = message; statusDisplay.className = className;
    }
    function updateUIParameterValues() {
         gridSizeSelect.value = GRID_SIZE; numDeliveriesSelect.value = NUM_DELIVERIES;
         // obstacleProbValueSpan removed
         learningRateSlider.value = LEARNING_RATE; learningRateValueSpan.textContent = LEARNING_RATE.toFixed(2);
         discountFactorSlider.value = DISCOUNT_FACTOR; discountFactorValueSpan.textContent = DISCOUNT_FACTOR.toFixed(2);
         epsilonStartSlider.value = EPSILON_START; epsilonStartValueSpan.textContent = EPSILON_START.toFixed(2);
         epsilonDecaySlider.value = EPSILON_DECAY; epsilonDecayValueSpan.textContent = EPSILON_DECAY.toFixed(4);
         epsilonMinSlider.value = EPSILON_MIN; epsilonMinValueSpan.textContent = EPSILON_MIN.toFixed(2);
         maxEpisodesInput.value = MAX_EPISODES; totalEpisodesDisplay.textContent = MAX_EPISODES;
         updateSpeedDisplay(speedSlider.value);
    }
     function updateSpeedDisplay(value) {
         const speedVal = parseInt(value); let speedText = 'Medium';
         if (speedVal >= 990) speedText = 'Max'; else if (speedVal > 750) speedText = 'Very Fast'; else if (speedVal > 500) speedText = 'Fast';
         else if (speedVal > 250) speedText = 'Medium'; else if (speedVal > 50) speedText = 'Slow'; else speedText = 'Very Slow';
         speedValueSpan.textContent = speedText; stepDelay = 1000 - speedVal;
     }
    function updateAlgorithmParamsFromUI() { // Read params from UI into JS variables
         LEARNING_RATE = parseFloat(learningRateSlider.value);
         DISCOUNT_FACTOR = parseFloat(discountFactorSlider.value);
         EPSILON_START = parseFloat(epsilonStartSlider.value);
         EPSILON_DECAY = parseFloat(epsilonDecaySlider.value);
         EPSILON_MIN = parseFloat(epsilonMinSlider.value);
         MAX_EPISODES = parseInt(maxEpisodesInput.value);
         console.log("Algorithm Params Updated from UI");
    }

    // --- Event Listeners ---
    gridSizeSelect.addEventListener('change', (e) => { init(true); });
    numDeliveriesSelect.addEventListener('change', (e) => { init(true); });
    resetEnvBtn.addEventListener('click', () => init(true));
    // Param slider listeners
    learningRateSlider.addEventListener('input', (e) => { LEARNING_RATE = parseFloat(e.target.value); learningRateValueSpan.textContent = LEARNING_RATE.toFixed(2); });
    discountFactorSlider.addEventListener('input', (e) => { DISCOUNT_FACTOR = parseFloat(e.target.value); discountFactorValueSpan.textContent = DISCOUNT_FACTOR.toFixed(2); });
    epsilonStartSlider.addEventListener('input', (e) => { EPSILON_START = parseFloat(e.target.value); epsilonStartValueSpan.textContent = EPSILON_START.toFixed(2); if (simulationState === 'idle' || simulationState === 'stopped' || simulationState === 'paused') { epsilon = EPSILON_START; updateInfoDisplay();} });
    epsilonDecaySlider.addEventListener('input', (e) => { EPSILON_DECAY = parseFloat(e.target.value); epsilonDecayValueSpan.textContent = EPSILON_DECAY.toFixed(4); });
    epsilonMinSlider.addEventListener('input', (e) => { EPSILON_MIN = parseFloat(e.target.value); epsilonMinValueSpan.textContent = EPSILON_MIN.toFixed(2); });
    maxEpisodesInput.addEventListener('change', (e) => { MAX_EPISODES = parseInt(e.target.value) || 10000; totalEpisodesDisplay.textContent = MAX_EPISODES; });
    // Reset/Persistence/Controls listeners
    resetQTableBtn.addEventListener('click', () => { if (confirm("Reset all learning progress (Q-Table)?")) { initQTable(); resetSimulationStats(); setStatus("Learning Reset.", "idle"); requestAnimationFrame(draw); } });
    saveQTableBtn.addEventListener('click', saveQTable);
    loadQTableBtn.addEventListener('click', loadQTable);
    speedSlider.addEventListener('input', (e) => { updateSpeedDisplay(e.target.value); });
    startTrainingBtn.addEventListener('click', startTrainingAction);
    pauseTrainingBtn.addEventListener('click', pauseTrainingAction);
    stopTrainingBtn.addEventListener('click', stopAction);
    runGreedyBtn.addEventListener('click', greedyAction);
    // Visualization toggles
    showCurrentPathCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
    showTruckCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
    showFinalRouteCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
    // Canvas Interaction listeners removed

    // --- Persistence ---
    function saveQTable() {
         try {
             const dataToSave = { gridSize: GRID_SIZE, numDeliveries: NUM_DELIVERIES, qTable: qTable, bestRoute: bestRoute, bestRouteCost: bestRouteCost };
             localStorage.setItem('deliveryQLearning_v2', JSON.stringify(dataToSave));
             setStatus("Policy & Best Route Saved.", "idle");
         } catch (e) { console.error("Save failed:", e); setStatus("Error saving.", "error"); alert("Could not save."); }
    }
    function loadQTable() {
         try {
             const savedData = localStorage.getItem('deliveryQLearning_v2');
             if (!savedData) { alert("No saved data found."); return; }
             const loadedData = JSON.parse(savedData);
             if (loadedData.gridSize !== GRID_SIZE || loadedData.numDeliveries !== NUM_DELIVERIES) {
                  if (!confirm(`Saved data is for ${loadedData.numDeliveries} deliveries on ${loadedData.gridSize}x${loadedData.gridSize}. Current is ${NUM_DELIVERIES} on ${GRID_SIZE}x${GRID_SIZE}. Load anyway and regenerate map?`)) return;
                  GRID_SIZE = loadedData.gridSize; NUM_DELIVERIES = loadedData.numDeliveries;
                  gridSizeSelect.value = GRID_SIZE; numDeliveriesSelect.value = NUM_DELIVERIES;
                  init(false); // Re-init map but keep loaded Q-table logic below
             }
             qTable = loadedData.qTable || {}; bestRoute = loadedData.bestRoute || []; bestRouteCost = loadedData.bestRouteCost === undefined ? Infinity : loadedData.bestRouteCost;
             // recalculateGlobalMinMaxQ(); // Removed
             resetSimulationStats(); epsilon = EPSILON_MIN; // Assume loaded is trained
             setStatus("Policy Loaded. Epsilon low.", "idle"); updateInfoDisplay(); requestAnimationFrame(draw);
         } catch (e) { console.error("Load failed:", e); setStatus("Error loading.", "error"); alert("Could not load policy."); }
    }


    // --- Initial Setup & Resize Handling ---
    console.log("DOM Loaded. Starting initialization...");
    init(true); // Initial call to setup everything
    window.addEventListener('resize', resizeCanvas); // Add resize listener
    console.log("Initial setup complete. Waiting for user interaction or training start.");

}); // End DOMContentLoaded
