document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('gridCanvas');
    let ctx = null; // Initialize ctx as null, get it in init
    const gridSizeSelect = document.getElementById('gridSize');
    const numDeliveriesDisplay = document.getElementById('numDeliveriesDisplay');
    const numDeliveriesLabel = document.getElementById('numDeliveriesLabel');
    const editModeRadios = document.querySelectorAll('input[name="editMode"]');
    const generateMapBtn = document.getElementById('generateMapBtn');
    const clearDeliveriesBtn = document.getElementById('clearDeliveriesBtn');
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
    const saveQTableBtn = document.getElementById('saveQTableBtn');
    const loadQTableBtn = document.getElementById('loadQTableBtn');
    const speedSlider = document.getElementById('speed');
    const speedValueSpan = document.getElementById('speedValue');
    const startTrainingBtn = document.getElementById('startTrainingBtn');
    const pauseTrainingBtn = document.getElementById('pauseTrainingBtn');
    const stopTrainingBtn = document.getElementById('stopTrainingBtn');
    const showRouteBtn = document.getElementById('showRouteBtn');
    const showCurrentPathCheckbox = document.getElementById('showCurrentPath');
    const showTruckCheckbox = document.getElementById('showTruck');
    const showFinalRouteCheckbox = document.getElementById('showFinalRoute');
    const statusDisplay = document.getElementById('statusDisplay');
    const episodeDisplay = document.getElementById('episodeDisplay');
    const totalEpisodesDisplay = document.getElementById('totalEpisodesDisplay');
    const destLeftDisplay = document.getElementById('destLeftDisplay');
    const epsilonDisplay = document.getElementById('epsilonDisplay');
    const rewardDisplay = document.getElementById('rewardDisplay');
    const avgRewardDisplay = document.getElementById('avgRewardDisplay');
    const bestRouteCostDisplay = document.getElementById('bestRouteCostDisplay');
    const qTableSizeDisplay = document.getElementById('qTableSizeDisplay');
    const rewardChartCanvas = document.getElementById('rewardChart');

    // --- Configuration & Constants ---
    let GRID_SIZE = 10; // Default value before reading from select
    let NUM_DELIVERIES = 0; // Start with 0, set by placement or generate
    const MAX_ALLOWED_DELIVERIES = 7; // Limit for performance
    let CELL_SIZE = 0; // ** CRITICAL: Must be calculated after canvas setup **
    const REWARD_SUCCESSFUL_RETURN = 200;
    const COST_PER_DISTANCE_UNIT = 1;

    // --- Q-Learning Parameters ---
    let LEARNING_RATE = 0.1; // Default
    let DISCOUNT_FACTOR = 0.9; // Default
    let EPSILON_START = 1.0; // Default
    let EPSILON_DECAY = 0.9995; // Default
    let EPSILON_MIN = 0.05; // Default
    let MAX_EPISODES = 10000; // Default

    // --- State Variables ---
    let qTable = {};
    let depotLocation = null;
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
    let currentEditMode = 'none';
    let nextDeliveryIndexToPlace = 1;


    // --- Utility Functions ---
    function getCssVar(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }
    function isValid(r, c) {
        // Add check for GRID_SIZE being positive
        return GRID_SIZE > 0 && r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
    }
    function manhattanDistance(loc1, loc2) {
        if (!loc1 || !loc2 || typeof loc1.r !== 'number' || typeof loc1.c !== 'number' || typeof loc2.r !== 'number' || typeof loc2.c !== 'number' || !isValid(loc1.r, loc1.c) || !isValid(loc2.r, loc2.c)) {
             // console.warn("Invalid input to manhattanDistance:", loc1, loc2);
             return Infinity; // Return infinity for invalid inputs
        }
        return Math.abs(loc1.r - loc2.r) + Math.abs(loc1.c - loc2.c);
    }

     // Calculates required canvas size and cell size, returns true if successful
     function setupCanvasDimensions() {
         console.log("Running setupCanvasDimensions...");
         const container = document.querySelector('.canvas-container');
         if (!container) { console.error("Canvas container not found!"); return false; }

         const containerStyle = getComputedStyle(container);
         const containerPaddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
         const availableWidth = container.clientWidth - containerPaddingX;

         // Use a fixed or width-based size for simplicity, ensure minimum
         const desiredSize = Math.max(200, availableWidth);
         const maxSize = 600;
         const finalSize = Math.min(desiredSize, maxSize);

         // **Set canvas dimensions FIRST**
         canvas.width = finalSize;
         canvas.height = finalSize; // Keep it square

         // **THEN Calculate CELL_SIZE**
         if (GRID_SIZE > 0) {
             CELL_SIZE = canvas.width / GRID_SIZE;
             console.log(`Canvas dimensions set: ${canvas.width}x${canvas.height}, Cell Size: ${CELL_SIZE.toFixed(2)}`);
             if (CELL_SIZE <= 0) {
                 console.error("Error: CELL_SIZE calculation failed (<= 0)!");
                 return false; // Indicate failure
             }
             return true; // Success
         } else {
             console.error("Error: GRID_SIZE invalid for CELL_SIZE calculation!");
             CELL_SIZE = 0;
             return false; // Failure
         }
     }

    // --- State Representation ---
    function getStateString(locationIndex, remainingSet) {
        if (!(remainingSet instanceof Set)) { console.error("Invalid remainingSet passed to getStateString:", remainingSet); return `${locationIndex}-error`; }
        const sortedRemaining = Array.from(remainingSet).sort((a, b) => a - b);
        return `${locationIndex}-${JSON.stringify(sortedRemaining)}`;
    }

    // --- Initialization ---
    function init(generateNewMap = true, resetLearning = true) {
        console.log(`--- Running Initialization (Generate: ${generateNewMap}, ResetLearn: ${resetLearning}) ---`);
        setStatus('Initializing...', 'initializing');
        stopSimulationLoop(); // Stop previous run

        // ** 1. Get Context **
        ctx = canvas.getContext('2d');
        if (!ctx) { console.error("FATAL: Failed to get canvas context!"); setStatus("Error: Canvas Context Failed", "error"); return; }
        console.log("Canvas context obtained.");

        // ** 2. Read Settings **
        GRID_SIZE = parseInt(gridSizeSelect.value);
        if (isNaN(GRID_SIZE) || GRID_SIZE <= 1) { GRID_SIZE = 10; gridSizeSelect.value = 10; console.warn("Invalid Grid Size, defaulting to 10"); }
        // Read NUM_DELIVERIES target only if generating map
        let targetNumDeliveries = NUM_DELIVERIES; // Keep current if not generating
        if (generateNewMap) {
             targetNumDeliveries = parseInt(numDeliveriesDisplay.value) || 5; // Use displayed value as target
             if (isNaN(targetNumDeliveries) || targetNumDeliveries < 1 || targetNumDeliveries > MAX_ALLOWED_DELIVERIES) {
                 targetNumDeliveries = 5;
                 console.warn(`Invalid target deliveries (${numDeliveriesDisplay.value}), defaulting to ${targetNumDeliveries}.`);
             }
             numDeliveriesDisplay.value = targetNumDeliveries; // Ensure display matches target
        }
        updateAlgorithmParamsFromUI(); // Read learning params
        console.log(`Settings Read: Grid=${GRID_SIZE}x${GRID_SIZE}`);

        // ** 3. Setup Canvas Dimensions & CELL_SIZE (CRITICAL) **
        if (!setupCanvasDimensions()) { // This calculates CELL_SIZE
            setStatus("Error: Canvas Setup Failed", "error");
            return; // Stop if canvas setup fails
        }

        // ** 4. Place Locations (Requires valid GRID_SIZE & CELL_SIZE implicitly if checks use it) **
        if (generateNewMap) {
            if (!placeLocationsRandomly(targetNumDeliveries)) return; // Generate random map
        } else {
            updateAllLocations(); // Keep existing, just rebuild array
             if (!depotLocation || deliveryLocations.length === 0) {
                  console.warn("Keep locations failed (depot/deliveries missing). Regenerating with 5 deliveries.");
                  if (!placeLocationsRandomly(5)) return; // Fallback to 5 deliveries
             }
        }
         // Update NUM_DELIVERIES based on *actual* number placed
         NUM_DELIVERIES = deliveryLocations.length;
         numDeliveriesDisplay.value = NUM_DELIVERIES;
         nextDeliveryIndexToPlace = NUM_DELIVERIES + 1;
         if (!depotLocation || deliveryLocations.length < 1) { // Final check after placement
              setStatus("Error: Need Depot & >=1 Delivery", "error");
              simulationState = 'error'; updateButtonStates(); return;
         }

        // ** 5. Initialize Learning State **
        if (resetLearning) { initQTable(); resetSimulationStats(); bestRouteCost = Infinity; bestRoute = []; }
        else { resetSimulationStats(); } // Keep Q-table

        // ** 6. Final UI Updates & Force Initial Draw **
        updateButtonStates();
        setStatus('Ready.', 'idle');
        console.log("Initialization complete. Requesting initial draw...");
        requestAnimationFrame(draw); // Ensure draw happens *after* all setup is verified
        console.log("--- Initial Draw Requested ---");
    }

     function placeLocationsRandomly(targetNumDeliveries) {
         console.log(`Placing ${targetNumDeliveries+1} random locations (incl. Depot)...`);
         deliveryLocations = []; allLocations = []; const placedCoords = new Set(); depotLocation = null;

         // Place Depot
         depotLocation = findRandomClearCell(null, placedCoords) || {r:0, c:0}; // Find any or default
         if(depotLocation) { placedCoords.add(`${depotLocation.r},${depotLocation.c}`); allLocations.push(depotLocation); }
         else { console.error("Failed to place Depot!"); return false;}
         console.log("Depot placed at:", depotLocation);

         // Place Deliveries
         let attempts = 0; const maxAttempts = GRID_SIZE * GRID_SIZE * 3;
         while (deliveryLocations.length < targetNumDeliveries && attempts < maxAttempts) {
             const loc = findRandomClearCell(null, placedCoords);
             if (loc) {
                  deliveryLocations.push(loc); allLocations.push(loc); placedCoords.add(`${loc.r},${loc.c}`);
             } else {
                 console.warn("Could not find a clear cell for the next delivery.");
                 break; // Exit loop if no clear cells left
             }
             attempts++;
         }
         if (deliveryLocations.length < targetNumDeliveries) {
              console.warn(`Could only place ${deliveryLocations.length}/${targetNumDeliveries} deliveries.`);
              // Proceed with the number placed
         }
         console.log(`Placed ${deliveryLocations.length} random deliveries.`);
         resetAgent(); return true;
     }

      // Updated findRandomClearCell to accept the set of already placed coordinates
     function findRandomClearCell(excludePos = null, placedCoordsSet) {
         const MAX_FIND_ATTEMPTS = GRID_SIZE * GRID_SIZE * 2; // Limit attempts
         for (let i = 0; i < MAX_FIND_ATTEMPTS; i++) {
              const r = Math.floor(Math.random() * GRID_SIZE);
              const c = Math.floor(Math.random() * GRID_SIZE);
              const coordString = `${r},${c}`;
              // Check if valid, not excluded, and not already placed
              if (isValid(r, c) &&
                 (!excludePos || r !== excludePos.r || c !== excludePos.c) &&
                 !placedCoordsSet.has(coordString))
              {
                  return { r, c };
              }
         }
          console.warn("Could not find a random clear cell after many attempts.");
          return null; // Return null if failed after many tries
     }


     function updateAllLocations() {
         allLocations = [];
         if (depotLocation && isValid(depotLocation.r, depotLocation.c)) allLocations.push(depotLocation);
         // Ensure delivery locations are valid before adding
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

    function initQTable() { qTable = {}; globalMinQ = 0; globalMaxQ = 0; console.log("Q-Table Initialized."); }
    function resetSimulationStats() {
        currentEpisode = 0; episodeCost = 0; epsilon = EPSILON_START; recentCosts = [];
        initChart(); resetAgent(); updateInfoDisplay(); console.log("Simulation Stats Reset.");
    }
    function resetAgent() {
        currentLocationIndex = 0; // Start at depot index
        NUM_DELIVERIES = deliveryLocations.length; // Update based on actual deliveries
        remainingDeliveries = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1));
        episodeCost = 0;
        episodeRoute = depotLocation ? [0] : []; // Start route only if depot exists
        currentStep = 0;
    }


    // --- Drawing Functions ---
    function draw() {
        if (!ctx || CELL_SIZE <= 0 || canvas.width <= 0 || canvas.height <= 0) {
             // console.warn("Draw skip: Invalid context or dimensions."); // Reduce noise
             return;
         }
        // console.log("Draw Call. Cell Size:", CELL_SIZE); // Debug: uncomment if needed
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
            if (showTruckCheckbox.checked) { drawTruck(); } // Truck on top of everything
        } catch (e) { console.error("Error during drawing:", e); setStatus("Error: Drawing Failed", "error"); stopSimulationLoop(); }
    }

    function drawMapBackground() {
        // console.log("Drawing map background..."); // Debugging
        ctx.fillStyle = getCssVar('--grid-bg'); ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = getCssVar('--grid-line'); ctx.lineWidth = 1;
        ctx.beginPath(); // Batch grid lines for potential performance gain
        for (let i = 0; i <= GRID_SIZE; i++) {
            const pos = Math.round(i * CELL_SIZE);
            if (pos > canvas.width + 1 || pos > canvas.height + 1) continue; // Avoid drawing way outside bounds for performance
            // Vertical line
            ctx.moveTo(pos, 0); ctx.lineTo(pos, canvas.height);
            // Horizontal line
            ctx.moveTo(0, pos); ctx.lineTo(canvas.width, pos);
        }
        ctx.stroke(); // Draw all lines at once
    }
    function drawLocations() {
        // console.log(`Drawing ${deliveryLocations.length + (depotLocation?1:0)} locations...`); // Debugging
         if (depotLocation && isValid(depotLocation.r, depotLocation.c)) { drawMarker(depotLocation, getCssVar('--cell-depot'), 'D'); }
         deliveryLocations.forEach((loc, index) => {
             if (loc && isValid(loc.r, loc.c)) {
                  const deliveryIndex = index + 1; const isRemaining = remainingDeliveries.has(deliveryIndex);
                  const color = getCssVar('--cell-delivery'); ctx.globalAlpha = isRemaining ? 1.0 : 0.3; // More fade
                  drawMarker(loc, color, deliveryIndex.toString()); ctx.globalAlpha = 1.0;
             }
         });
    }
    function drawMarker(loc, color, text = '') {
        const centerX = loc.c * CELL_SIZE + CELL_SIZE / 2; const centerY = loc.r * CELL_SIZE + CELL_SIZE / 2;
        const radius = Math.max(5, CELL_SIZE * 0.38); // Slightly larger markers
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke(); // Darker border
        if (text) {
            ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(9, radius)}px ${getCssVar('--font-family')}`; // Larger text relative to radius
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, centerX, centerY + 1); // Slight offset for better centering
        }
    }
    function drawTruck() {
         if (currentLocationIndex < 0 || currentLocationIndex >= allLocations.length) return;
         const truckLoc = allLocations[currentLocationIndex]; if (!truckLoc || !isValid(truckLoc.r, truckLoc.c)) return;
         const centerX = truckLoc.c * CELL_SIZE + CELL_SIZE / 2; const centerY = truckLoc.r * CELL_SIZE + CELL_SIZE / 2;
         const truckSize = Math.max(7, CELL_SIZE * 0.60); // Larger truck
         ctx.fillStyle = getCssVar('--truck-color'); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1.5; // Bolder outline
         // Simple Square Truck
         ctx.fillRect(centerX - truckSize / 2, centerY - truckSize / 2, truckSize, truckSize);
         ctx.strokeRect(centerX - truckSize / 2, centerY - truckSize / 2, truckSize, truckSize);
         // Small 'window'
         ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
         ctx.fillRect(centerX - truckSize * 0.3, centerY - truckSize * 0.3, truckSize * 0.6, truckSize * 0.2);
    }
    function drawRoute(routeIndices, color, lineWidth, dashed = false) {
        if (!routeIndices || routeIndices.length < 2 || !allLocations || allLocations.length === 0) return;
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, lineWidth); ctx.lineCap = "round"; ctx.lineJoin = "round";
        if (dashed) ctx.setLineDash([Math.max(2, CELL_SIZE * 0.1), Math.max(2, CELL_SIZE * 0.1)]); else ctx.setLineDash([]);
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
    function getValidActions(locationIndex, remainingSet) {
         return remainingSet.size === 0 ? [0] : Array.from(remainingSet);
    }
    function getQValue(stateString, action) {
        try {
            const parts = stateString.split('-'); const remaining = JSON.parse(parts[1] || '[]'); const validActions = remaining.length === 0 ? [0] : [...remaining].sort((a,b)=>a-b);
            if (!qTable[stateString]) return 0; // State not seen, Q is 0
            const qIndex = validActions.indexOf(action);
            // Return large negative if action invalid *for this state*
            return qIndex === -1 ? -Infinity : (qTable[stateString][qIndex] || 0);
        } catch (e) { console.error("Error in getQValue:", e, "State:", stateString, "Action:", action); return 0; }
    }
    function chooseAction(locationIndex, remainingSet) {
        const stateString = getStateString(locationIndex, remainingSet); const validActions = getValidActions(locationIndex, remainingSet);
        if (validActions.length === 0) return -1; if (validActions.length === 1) return validActions[0];
        let chosenAction; const isExploring = (simulationState === 'training') && Math.random() < epsilon; // Only explore during training
        if (isExploring) { chosenAction = validActions[Math.floor(Math.random() * validActions.length)]; }
        else {
             const qValues = validActions.map(a => getQValue(stateString, a));
             const maxQ = Math.max(...qValues);
             if(maxQ === -Infinity) { // Handle cases where all valid actions lead to seemingly bad states
                  console.warn("All valid actions have -Infinity Q value for state:", stateString, "Choosing randomly.");
                  chosenAction = validActions[Math.floor(Math.random() * validActions.length)];
             } else {
                  const bestActions = validActions.filter((a, i) => Math.abs(qValues[i] - maxQ) < 1e-6);
                  chosenAction = bestActions[Math.floor(Math.random() * bestActions.length)];
             }
        }
        return chosenAction;
    }
     function updateQTable(stateString, action, reward, nextStateString, done) {
        const validActionsCurrent = getValidActionsFromString(stateString); const qIndex = validActionsCurrent.indexOf(action);
        if (qIndex === -1) { /* console.warn(`Update skip: Action ${action} invalid for state ${stateString}`); */ return; } // Reduce noise
        if (!qTable[stateString]) qTable[stateString] = new Array(validActionsCurrent.length).fill(0);
        const currentQ = qTable[stateString][qIndex]; let maxNextQ = 0;
        if (!done) {
            const validActionsNext = getValidActionsFromString(nextStateString);
            if (validActionsNext.length > 0) { maxNextQ = Math.max(...validActionsNext.map(a => getQValue(nextStateString, a))); }
            if (maxNextQ === -Infinity) maxNextQ = 0; // Don't propagate -Infinity
        }
        const targetQ = reward + DISCOUNT_FACTOR * maxNextQ; const newQ = currentQ + LEARNING_RATE * (targetQ - currentQ);
        qTable[stateString][qIndex] = newQ;
    }
     function getValidActionsFromString(stateString) {
         try { const parts = stateString.split('-'); const remaining = JSON.parse(parts[1] || '[]'); return remaining.length === 0 ? [0] : [...remaining].sort((a,b)=>a-b); }
         catch (e) { console.error("Error parsing state string:", stateString, e); return []; }
     }


    // --- Simulation Step & Loop ---
    function runSingleStep() {
         if (currentLocationIndex < 0 || currentLocationIndex >= allLocations.length) { console.error("Invalid location:", currentLocationIndex); setStatus("Error", "error"); stopSimulationLoop(); return; }
         const stateString = getStateString(currentLocationIndex, remainingDeliveries); const action = chooseAction(currentLocationIndex, remainingDeliveries);
         if (action === -1 || action === undefined) { setStatus("Error: Choose action failed", "error"); stopSimulationLoop(); return; } // Check undefined too
         const currentLocation = allLocations[currentLocationIndex]; const nextLocation = allLocations[action];
         if (!currentLocation || !nextLocation) { console.error("Invalid current or next location object", currentLocation, nextLocation); setStatus("Error: Invalid location data", "error"); stopSimulationLoop(); return;} // Safety check
         const distance = manhattanDistance(currentLocation, nextLocation);
          if (distance === Infinity) { console.error(`Invalid move attempted: ${currentLocationIndex} -> ${action}`); handleEpisodeEnd(false); return; }
         const cost = distance * COST_PER_DISTANCE_UNIT; const reward = -cost;
         const previousLocationIndex = currentLocationIndex; currentLocationIndex = action; episodeCost += cost;
         let nextRemainingDeliveries = new Set(remainingDeliveries); if (action !== 0) nextRemainingDeliveries.delete(action);
         const done = (currentLocationIndex === 0 && nextRemainingDeliveries.size === 0); let finalReward = reward; if (done) finalReward += REWARD_SUCCESSFUL_RETURN;
         const nextStateString = getStateString(currentLocationIndex, nextRemainingDeliveries);
         if (simulationState === 'training') updateQTable(stateString, action, finalReward, nextStateString, done);
         remainingDeliveries = nextRemainingDeliveries; episodeRoute.push(currentLocationIndex);
         if (done) handleEpisodeEnd(true);
         currentStep++;
    }
     function handleEpisodeEnd(succeeded) {
        const wasTraining = simulationState === 'training'; const wasGreedy = simulationState === 'greedy';
        if (succeeded && wasTraining) {
             recentCosts.push(episodeCost); if (recentCosts.length > COST_AVERAGE_WINDOW) recentCosts.shift();
             updateChart(); if (epsilon > EPSILON_MIN) epsilon *= EPSILON_DECAY;
             if (episodeCost < bestRouteCost) { bestRouteCost = episodeCost; bestRoute = [...episodeRoute]; console.log(`New best during train: Cost ${bestRouteCost.toFixed(0)}`, bestRoute); }
        }
        if (wasTraining) {
            currentEpisode++; if (currentEpisode >= MAX_EPISODES) {
                setStatus(`Training Finished (Max Ep.). Calculating Best Route...`, 'finished'); stopSimulationLoop();
                setTimeout(() => {
                    const finalRoute = findBestRouteFromQTable();
                    if (finalRoute) { bestRoute = finalRoute; bestRouteCost = calculateRouteCost(bestRoute); }
                    setStatus(`Training Finished. Best Cost: ${bestRouteCost === Infinity ? 'N/A' : bestRouteCost.toFixed(0)}`, 'finished');
                    updateInfoDisplay(); requestAnimationFrame(draw);
                }, 10);
            } else { resetAgent(); }
        } else if (wasGreedy) { /* Instant */ }
        else { resetAgent(); } // Reset if stopped manually
        if (!wasGreedy) { episodeCost = 0; } updateInfoDisplay();
    }
    function simulationLoop(timestamp) {
         if (simulationState === 'stopped' || simulationState === 'error') { animationFrameId = null; updateButtonStates(); return; }
         animationFrameId = requestAnimationFrame(simulationLoop);
         const deltaTime = timestamp - (lastTimestamp || timestamp); lastTimestamp = timestamp;
         if (simulationState === 'training') { // Only run steps automatically in training mode
             timeAccumulator += deltaTime; const effectiveDelay = (speedSlider.value >= 990) ? 0 : stepDelay; let stepsToTake = 0;
             if (effectiveDelay <= 1) { stepsToTake = Math.min(10, NUM_DELIVERIES + 2); } else { stepsToTake = Math.floor(timeAccumulator / effectiveDelay); }
             if (stepsToTake > 0) {
                 timeAccumulator -= stepsToTake * effectiveDelay;
                 for (let i = 0; i < stepsToTake; i++) { if (simulationState !== 'training') break; runSingleStep(); if (simulationState === 'stopped' || simulationState === 'paused' || simulationState === 'error' || simulationState === 'idle') break; }
                 requestAnimationFrame(draw); updateInfoDisplay();
             }
         } else if (simulationState === 'paused' || simulationState === 'idle') {
             // Maybe draw occasionally? For now, draw is triggered by user actions
         }
         updateButtonStates(); // Keep UI buttons state correct
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
         if (!depotLocation || deliveryLocations.length === 0) { alert("Place Depot (D) and at least one Delivery (1) first."); return; }
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
    function showRouteAction() { // Renamed from greedyAction
        if (simulationState === 'training' || simulationState === 'greedy') return; // Prevent while training
        if (Object.keys(qTable).length === 0) { alert("Please train the agent first or load a saved policy."); return;} // Check if QTable exists
        console.log("Calculating best route from Q-Table..."); setStatus('Calculating Route...', 'stepping'); updateButtonStates();
        setTimeout(() => { // Use timeout for UI update
             const route = findBestRouteFromQTable();
             if (route) {
                 bestRoute = route; bestRouteCost = calculateRouteCost(route);
                 setStatus(`Optimal Route Displayed. Cost: ${bestRouteCost.toFixed(0)}.`, 'finished');
                 console.log("Best Route:", route, "Cost:", bestRouteCost);
                 resetAgent(); episodeRoute = [...bestRoute]; // Display the route visually by setting episodeRoute
             } else {
                 setStatus('Could not determine route (Train more?).', 'error'); bestRoute = []; bestRouteCost = Infinity;
                 resetAgent(); episodeRoute = [0];
             }
             simulationState = 'idle'; updateButtonStates(); updateInfoDisplay();
             requestAnimationFrame(draw);
        }, 10);
    }

    // --- Find Best Route from Q-Table ---
    function findBestRouteFromQTable() {
        let currentLoc = 0; if (!depotLocation) { console.error("Cannot find route, depot not set."); return null; }
        let remaining = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1)); const route = [0];
        let safetyBreak = 0; const maxSteps = NUM_DELIVERIES + 5;
        while (remaining.size > 0 && safetyBreak < maxSteps) {
            const stateStr = getStateString(currentLoc, remaining); const validActions = getValidActions(currentLoc, remaining);
            if (validActions.length === 0) { console.error("Route Error: No valid actions from", stateStr); return null; }
            const qValues = validActions.map(a => getQValue(stateStr, a)); const maxQ = Math.max(...qValues);
            let nextLoc;
             const firstQ = qValues[0]; const allSameValue = qValues.every(q => Math.abs(q - firstQ) < 1e-6);
             if (allSameValue && validActions.length > 1) {
                 let possibleNext = validActions.filter(a => a !== currentLoc); if (possibleNext.length === 0) possibleNext = validActions; nextLoc = possibleNext[Math.floor(Math.random() * possibleNext.length)];
             } else if (maxQ === -Infinity && validActions.length > 0) {
                  console.warn("Choosing random from valid because maxQ was -Infinity for state:", stateStr); nextLoc = validActions[Math.floor(Math.random() * validActions.length)];
             } else { const bestActions = validActions.filter((a, i) => Math.abs(qValues[i] - maxQ) < 1e-6); nextLoc = bestActions[Math.floor(Math.random() * bestActions.length)]; }
            if (nextLoc === undefined) { console.error("Route Error: Undefined nextLoc", stateStr, validActions, qValues); return null; }
            route.push(nextLoc); currentLoc = nextLoc; remaining.delete(nextLoc); safetyBreak++;
        }
        if (remaining.size === 0) { route.push(0); }
        else { console.error("Route Error: Did not visit all locations.", route, remaining); return null; }
        return route;
    }
    function calculateRouteCost(routeIndices) {
        let totalCost = 0; if (!routeIndices || routeIndices.length < 2) return 0;
        for (let i = 0; i < routeIndices.length - 1; i++) { const loc1 = allLocations[routeIndices[i]]; const loc2 = allLocations[routeIndices[i+1]]; const dist = manhattanDistance(loc1, loc2); if (dist === Infinity) return Infinity; totalCost += dist * COST_PER_DISTANCE_UNIT; }
        return totalCost;
    }

    // --- Charting ---
    function initChart() { /* ... (Keep stable version) ... */ }
    function updateChart() { /* ... (Keep stable version) ... */ }

    // --- UI Updates & Event Handlers ---
    function updateButtonStates() { /* ... (Keep stable version) ... */ }
    function updateInfoDisplay() { /* ... (Keep stable version) ... */ }
    function setStatus(message, className = '') { /* ... (Keep stable version) ... */ }
    function updateUIParameterValues() { /* ... (Keep stable version) ... */ }
    function updateSpeedDisplay(value) { /* ... (Keep stable version) ... */ }
    function updateAlgorithmParamsFromUI() { /* ... (Keep stable version) ... */ }

    // --- Event Listeners ---
    gridSizeSelect.addEventListener('change', () => { init(true); });
    generateMapBtn.addEventListener('click', () => init(true));
    clearDeliveriesBtn.addEventListener('click', clearDeliveriesAction);
    editModeRadios.forEach(radio => { radio.addEventListener('change', (e) => { currentEditMode = e.target.value; updateButtonStates(); }); });
    learningRateSlider.addEventListener('input', (e) => { LEARNING_RATE = parseFloat(e.target.value); learningRateValueSpan.textContent = LEARNING_RATE.toFixed(2); });
    discountFactorSlider.addEventListener('input', (e) => { DISCOUNT_FACTOR = parseFloat(e.target.value); discountFactorValueSpan.textContent = DISCOUNT_FACTOR.toFixed(2); });
    epsilonStartSlider.addEventListener('input', (e) => { EPSILON_START = parseFloat(e.target.value); epsilonStartValueSpan.textContent = EPSILON_START.toFixed(2); if (simulationState === 'idle' || simulationState === 'stopped' || simulationState === 'paused') { epsilon = EPSILON_START; updateInfoDisplay();} });
    epsilonDecaySlider.addEventListener('input', (e) => { EPSILON_DECAY = parseFloat(e.target.value); epsilonDecayValueSpan.textContent = EPSILON_DECAY.toFixed(4); });
    epsilonMinSlider.addEventListener('input', (e) => { EPSILON_MIN = parseFloat(e.target.value); epsilonMinValueSpan.textContent = EPSILON_MIN.toFixed(2); });
    maxEpisodesInput.addEventListener('change', (e) => { MAX_EPISODES = parseInt(e.target.value) || 10000; totalEpisodesDisplay.textContent = MAX_EPISODES; });
    resetQTableBtn.addEventListener('click', () => { if (confirm("Reset learning progress?")) { initQTable(); resetSimulationStats(); setStatus("Learning Reset.", "idle"); requestAnimationFrame(draw); } });
    saveQTableBtn.addEventListener('click', saveQTable); loadQTableBtn.addEventListener('click', loadQTable);
    speedSlider.addEventListener('input', (e) => { updateSpeedDisplay(e.target.value); });
    startTrainingBtn.addEventListener('click', startTrainingAction); pauseTrainingBtn.addEventListener('click', pauseTrainingAction); stopTrainingBtn.addEventListener('click', stopAction);
    showRouteBtn.addEventListener('click', showRouteAction);
    showCurrentPathCheckbox.addEventListener('change', () => requestAnimationFrame(draw)); showTruckCheckbox.addEventListener('change', () => requestAnimationFrame(draw)); showFinalRouteCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
    canvas.addEventListener('click', handleCanvasClick);

    // --- Canvas Interaction Logic ---
     function handleCanvasClick(e) {
         if (simulationState !== 'idle' && simulationState !== 'stopped' && simulationState !== 'error') return; if (currentEditMode === 'none') return;
         const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
         // ** Crucial Check: Ensure CELL_SIZE is positive before calculating cell **
         if(CELL_SIZE <= 0) { console.error("Cannot handle click, CELL_SIZE invalid."); return; }
         const c = Math.floor(x / CELL_SIZE); const r = Math.floor(y / CELL_SIZE);
         if (!isValid(r, c)) return;

         let locationsChanged = false; const clickedCoordString = `${r},${c}`; const isExistingDepot = depotLocation && depotLocation.r === r && depotLocation.c === c; const existingDeliveryIndex = deliveryLocations.findIndex(loc => loc.r === r && loc.c === c);
         switch (currentEditMode) {
             case 'depot': if (existingDeliveryIndex !== -1) { alert("Depot cannot be on a Delivery location."); return; } depotLocation = { r, c }; locationsChanged = true; console.log("Depot set:", depotLocation); break;
             case 'delivery': if (isExistingDepot) { alert("Delivery cannot be on the Depot."); return; } if (existingDeliveryIndex !== -1) { deliveryLocations.splice(existingDeliveryIndex, 1); locationsChanged = true; console.log(`Delivery removed.`); } else { if (deliveryLocations.length >= MAX_ALLOWED_DELIVERIES) { alert(`Max ${MAX_ALLOWED_DELIVERIES} deliveries.`); return; } deliveryLocations.push({ r, c }); locationsChanged = true; console.log(`Delivery added.`); } break;
         }
         if (locationsChanged) {
             updateAllLocations(); NUM_DELIVERIES = deliveryLocations.length; numDeliveriesDisplay.value = NUM_DELIVERIES; nextDeliveryIndexToPlace = NUM_DELIVERIES + 1;
             initQTable(); resetSimulationStats(); bestRoute = []; bestRouteCost = Infinity; setStatus("Locations changed. Learning Reset.", "idle"); requestAnimationFrame(draw);
         }
     }

    // --- Persistence ---
    function saveQTable() { /* ... (Keep stable version) ... */ }
    function loadQTable() { /* ... (Keep stable version) ... */ }

    // --- Initial Setup & Resize Handling ---
    console.log("DOM Loaded. Setting up...");
    // Use setTimeout to slightly delay init, allowing browser layout to stabilize first
    setTimeout(() => {
        init(true); // Initial call to setup everything
        window.addEventListener('resize', resizeCanvas); // Add resize listener AFTER first init
        console.log("Initial setup potentially complete.");
    }, 100); // Delay ms

}); // End DOMContentLoaded
