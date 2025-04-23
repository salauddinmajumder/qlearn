document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('gridCanvas');
    let ctx = null; // Initialize ctx as null
    // ... (Keep all other DOM element references) ...
    const gridSizeSelect = document.getElementById('gridSize');
    const numDeliveriesSelect = document.getElementById('numDeliveries');
    const numDeliveriesDisplay = document.getElementById('numDeliveriesDisplay');
    // ... etc ...

    // --- Configuration & Constants ---
    let GRID_SIZE = 10;
    let NUM_DELIVERIES = 0;
    const MAX_ALLOWED_DELIVERIES = 7;
    let CELL_SIZE = 0; // ** MUST BE CALCULATED LATER **
    const REWARD_SUCCESSFUL_RETURN = 200;
    const COST_PER_DISTANCE_UNIT = 1;

    // --- Q-Learning Parameters ---
    let LEARNING_RATE, DISCOUNT_FACTOR, EPSILON_START, EPSILON_DECAY, EPSILON_MIN, MAX_EPISODES;

    // --- State Variables ---
    let qTable = {};
    let depotLocation = null;
    let deliveryLocations = [];
    let allLocations = [];
    let currentLocationIndex = 0;
    let remainingDeliveries = new Set();
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
    let currentEditMode = 'none';
    let nextDeliveryIndexToPlace = 1;


    // --- Utility Functions ---
    function getCssVar(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }
    function isValid(r, c) { return GRID_SIZE > 0 && r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE; } // Added GRID_SIZE > 0 check
    function manhattanDistance(loc1, loc2) {
        if (!loc1 || !loc2 || typeof loc1.r !== 'number' || typeof loc1.c !== 'number' || typeof loc2.r !== 'number' || typeof loc2.c !== 'number' || !isValid(loc1.r, loc1.c) || !isValid(loc2.r, loc2.c)) {
             return Infinity;
        }
        return Math.abs(loc1.r - loc2.r) + Math.abs(loc1.c - loc2.c);
    }

     // Calculates required canvas size and cell size, returns true if successful
     function setupCanvasDimensions() {
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
         canvas.height = finalSize;

         // **THEN Calculate CELL_SIZE**
         if (GRID_SIZE > 0) {
             CELL_SIZE = canvas.width / GRID_SIZE;
             console.log(`Canvas dimensions set: ${canvas.width}x${canvas.height}, Cell Size: ${CELL_SIZE.toFixed(2)}`);
             if (CELL_SIZE <= 0) {
                 console.error("Error: CELL_SIZE calculation failed!");
                 return false;
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
        if (!(remainingSet instanceof Set)) { console.error("Invalid remainingSet:", remainingSet); return `${locationIndex}-error`; }
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
        if (!ctx) {
            console.error("FATAL: Failed to get canvas context!");
            setStatus("Error: Canvas Context Failed", "error");
            return;
        }
        console.log("Canvas context obtained.");

        // ** 2. Read Settings **
        GRID_SIZE = parseInt(gridSizeSelect.value);
        if (isNaN(GRID_SIZE) || GRID_SIZE <= 1) {
             console.error("Invalid Grid Size selected:", gridSizeSelect.value);
             setStatus("Error: Invalid Grid Size", "error");
             return;
        }
        // Read NUM_DELIVERIES only if generating map, otherwise it's set by placement count
        if (generateNewMap) {
             NUM_DELIVERIES = parseInt(numDeliveriesDisplay.value) || 5; // Use displayed value as target
             if (isNaN(NUM_DELIVERIES) || NUM_DELIVERIES < 1 || NUM_DELIVERIES > MAX_ALLOWED_DELIVERIES) {
                 console.warn(`Invalid number of deliveries (${numDeliveriesDisplay.value}), defaulting to 5.`);
                 NUM_DELIVERIES = 5;
                 numDeliveriesDisplay.value = NUM_DELIVERIES;
             }
        }
        updateAlgorithmParamsFromUI(); // Read learning params
        console.log(`Settings Read: Grid=${GRID_SIZE}x${GRID_SIZE}`);

        // ** 3. Setup Canvas Dimensions & CELL_SIZE (CRITICAL) **
        if (!setupCanvasDimensions()) { // This calculates CELL_SIZE
            setStatus("Error: Canvas Setup Failed", "error");
            return; // Stop if canvas setup fails
        }

        // ** 4. Place Locations (Requires valid GRID_SIZE) **
        if (generateNewMap) {
            if (!placeLocationsRandomly(NUM_DELIVERIES)) return; // Pass target number
        } else {
            updateAllLocations(); // Keep existing, just rebuild array
             if (!depotLocation || deliveryLocations.length === 0) {
                  console.warn("Keep locations failed (depot/deliveries missing). Regenerating.");
                  if (!placeLocationsRandomly(5)) return; // Fallback to 5 deliveries
             }
        }
         // Update display based on *actual* number placed
         NUM_DELIVERIES = deliveryLocations.length;
         numDeliveriesDisplay.value = NUM_DELIVERIES;
         nextDeliveryIndexToPlace = NUM_DELIVERIES + 1;


        // ** 5. Initialize Learning State **
        if (resetLearning) { initQTable(); resetSimulationStats(); bestRouteCost = Infinity; bestRoute = []; }
        else { resetSimulationStats(); } // Keep Q-table

        // ** 6. Final UI Updates & Force Initial Draw **
        updateButtonStates();
        setStatus('Ready.', 'idle');
        console.log("Initialization complete. Forcing initial draw...");
        // ** Direct Draw Call **
        draw();
        console.log("--- Initial Draw Complete ---");
    }

    function placeLocationsRandomly(targetNumDeliveries) {
        console.log(`Placing ${targetNumDeliveries+1} random locations (incl. Depot)...`);
        deliveryLocations = []; allLocations = []; const placedCoords = new Set(); depotLocation = null;

        // Place Depot
        depotLocation = findRandomClearCell(null, placedCoords) || {r:0, c:0};
        if(depotLocation) { placedCoords.add(`${depotLocation.r},${depotLocation.c}`); allLocations.push(depotLocation); }
        else { console.error("Failed to place Depot!"); return false;}
        console.log("Depot placed at:", depotLocation);

        // Place Deliveries
        let attempts = 0; const maxAttempts = GRID_SIZE * GRID_SIZE * 3;
        while (deliveryLocations.length < targetNumDeliveries && attempts < maxAttempts) {
            const loc = findRandomClearCell(null, placedCoords);
            if (loc) { deliveryLocations.push(loc); allLocations.push(loc); placedCoords.add(`${loc.r},${loc.c}`); }
            else { break; }
            attempts++;
        }
        if (deliveryLocations.length < targetNumDeliveries) {
             console.warn(`Could only place ${deliveryLocations.length}/${targetNumDeliveries} deliveries.`);
             // Don't error out, proceed with fewer deliveries if needed
        }
        console.log(`Placed ${deliveryLocations.length} random deliveries.`);
        resetAgent(); return true;
    }

     function findRandomClearCell(excludePos = null, placedCoordsSet) {
         const MAX_FIND_ATTEMPTS = GRID_SIZE * GRID_SIZE * 2; // Limit attempts
         for (let i = 0; i < MAX_FIND_ATTEMPTS; i++) {
              const r = Math.floor(Math.random() * GRID_SIZE);
              const c = Math.floor(Math.random() * GRID_SIZE);
              const coordString = `${r},${c}`;
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
        currentLocationIndex = 0;
        NUM_DELIVERIES = deliveryLocations.length; // Update based on actual deliveries
        remainingDeliveries = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1));
        episodeCost = 0;
        episodeRoute = depotLocation ? [0] : [];
        currentStep = 0;
        // console.log("Agent Reset. Remaining:", remainingDeliveries);
    }


    // --- Drawing Functions ---
    function draw() {
        if (!ctx || CELL_SIZE <= 0 || canvas.width <= 0 || canvas.height <= 0) {
             // console.warn("Draw skip: Invalid context or dimensions."); // Reduce noise
             return;
         }
        // console.log("Draw Call. Cell Size:", CELL_SIZE); // Debugging draw calls

        try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawMapBackground();
            // Draw paths under markers
             if (showCurrentPathCheckbox.checked && (simulationState === 'training' || simulationState === 'paused' || simulationState === 'greedy')) {
                 drawRoute(episodeRoute, getCssVar('--current-path-color'), 2);
             }
             if (showFinalRouteCheckbox.checked && bestRoute.length > 1) {
                 drawRoute(bestRoute, getCssVar('--final-route-color'), 3.5, true);
             }
            drawLocations();
            if (showTruckCheckbox.checked) { drawTruck(); }
        } catch (e) { console.error("Error during drawing:", e); setStatus("Error: Drawing Failed", "error"); stopSimulationLoop(); }
    }

    function drawMapBackground() {
        // console.log("Drawing map background..."); // Debugging
        ctx.fillStyle = getCssVar('--grid-bg'); ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = getCssVar('--grid-line'); ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= GRID_SIZE; i++) {
            const pos = Math.round(i * CELL_SIZE);
             if (pos > canvas.width + 1 || pos > canvas.height + 1) continue; // Avoid drawing way outside bounds for performance
            // Vertical line
            ctx.moveTo(pos, 0); ctx.lineTo(pos, canvas.height);
            // Horizontal line
            ctx.moveTo(0, pos); ctx.lineTo(canvas.width, pos);
        }
        ctx.stroke();
    }
    function drawLocations() {
        // console.log(`Drawing ${deliveryLocations.length + (depotLocation?1:0)} locations...`); // Debugging
         if (depotLocation && isValid(depotLocation.r, depotLocation.c)) { drawMarker(depotLocation, getCssVar('--cell-depot'), 'D'); }
         deliveryLocations.forEach((loc, index) => {
             if (loc && isValid(loc.r, loc.c)) {
                  const deliveryIndex = index + 1; const isRemaining = remainingDeliveries.has(deliveryIndex);
                  const color = getCssVar('--cell-delivery'); ctx.globalAlpha = isRemaining ? 1.0 : 0.3;
                  drawMarker(loc, color, deliveryIndex.toString()); ctx.globalAlpha = 1.0;
             }
         });
    }
    function drawMarker(loc, color, text = '') { /* ... (Keep previous stable version) ... */
         const centerX = loc.c * CELL_SIZE + CELL_SIZE / 2; const centerY = loc.r * CELL_SIZE + CELL_SIZE / 2;
         const radius = Math.max(5, CELL_SIZE * 0.38);
         ctx.fillStyle = color; ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.fill();
         ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
         if (text) {
             ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(9, radius)}px ${getCssVar('--font-family')}`;
             ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, centerX, centerY + 1);
         }
    }
    function drawTruck() { /* ... (Keep previous stable version) ... */
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
    function drawRoute(routeIndices, color, lineWidth, dashed = false) { /* ... (Keep previous stable version) ... */
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
    // ... (Keep getValidActions, getQValue, chooseAction, updateQTable, getValidActionsFromString - ensure robust) ...
    function getValidActions(locationIndex, remainingSet) {
         return remainingSet.size === 0 ? [0] : Array.from(remainingSet);
    }
    function getQValue(stateString, action) {
        try {
            const parts = stateString.split('-'); const remaining = JSON.parse(parts[1] || '[]'); const validActions = remaining.length === 0 ? [0] : [...remaining].sort((a,b)=>a-b);
            if (!qTable[stateString]) return 0; // State not seen, Q is 0
            const qIndex = validActions.indexOf(action);
            return qIndex === -1 ? -Infinity : (qTable[stateString][qIndex] || 0); // Return large negative if action invalid *for this state*
        } catch (e) { console.error("Error getQValue:", e, stateString, action); return 0; }
    }
    function chooseAction(locationIndex, remainingSet) {
        const stateString = getStateString(locationIndex, remainingSet); const validActions = getValidActions(locationIndex, remainingSet);
        if (validActions.length === 0) return -1; if (validActions.length === 1) return validActions[0];
        let chosenAction; const isExploring = (simulationState === 'training') && Math.random() < epsilon; // Note: Stepping removed
        if (isExploring) { chosenAction = validActions[Math.floor(Math.random() * validActions.length)]; }
        else {
             const qValues = validActions.map(a => getQValue(stateString, a));
             const maxQ = Math.max(...qValues);
             // Check if all actions have effectively -Infinity Q value (e.g. invalid actions somehow chosen)
             if(maxQ === -Infinity) {
                  console.warn("All valid actions have -Infinity Q value for state:", stateString);
                  chosenAction = validActions[Math.floor(Math.random() * validActions.length)]; // Fallback random valid action
             } else {
                  const bestActions = validActions.filter((a, i) => Math.abs(qValues[i] - maxQ) < 1e-6);
                  chosenAction = bestActions[Math.floor(Math.random() * bestActions.length)];
             }
        }
        return chosenAction;
    }
     function updateQTable(stateString, action, reward, nextStateString, done) {
        const validActionsCurrent = getValidActionsFromString(stateString); const qIndex = validActionsCurrent.indexOf(action);
        if (qIndex === -1) { console.warn(`Update skip: Action ${action} invalid for state ${stateString}`); return; }
        if (!qTable[stateString]) qTable[stateString] = new Array(validActionsCurrent.length).fill(0);
        const currentQ = qTable[stateString][qIndex]; let maxNextQ = 0;
        if (!done) {
            const validActionsNext = getValidActionsFromString(nextStateString);
            if (validActionsNext.length > 0) { maxNextQ = Math.max(...validActionsNext.map(a => getQValue(nextStateString, a))); }
            // Handle case where all next Qs are -Infinity (e.g., only invalid actions possible from next state?)
            if (maxNextQ === -Infinity) maxNextQ = 0;
        }
        const targetQ = reward + DISCOUNT_FACTOR * maxNextQ; const newQ = currentQ + LEARNING_RATE * (targetQ - currentQ);
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
         const distance = manhattanDistance(currentLocation, nextLocation);
          if (distance === Infinity) { // Should not happen if action is valid, but safety check
               console.error(`Invalid move attempted: ${currentLocationIndex} -> ${action}`);
               handleEpisodeEnd(false); // End episode as failed
               return;
          }
         const cost = distance * COST_PER_DISTANCE_UNIT; const reward = -cost;
         const previousLocationIndex = currentLocationIndex; currentLocationIndex = action; episodeCost += cost;
         let nextRemainingDeliveries = new Set(remainingDeliveries); if (action !== 0) nextRemainingDeliveries.delete(action);
         const done = (currentLocationIndex === 0 && nextRemainingDeliveries.size === 0); let finalReward = reward; if (done) finalReward += REWARD_SUCCESSFUL_RETURN;
         const nextStateString = getStateString(currentLocationIndex, nextRemainingDeliveries);
         if (simulationState === 'training') updateQTable(stateString, action, finalReward, nextStateString, done);
         remainingDeliveries = nextRemainingDeliveries; episodeRoute.push(currentLocationIndex);
         // Agent trail removed
         if (done) handleEpisodeEnd(true);
         currentStep++; // Increment step count
    }
     function handleEpisodeEnd(succeeded) { // Parameter indicates if goal was reached
        const wasTraining = simulationState === 'training'; const wasGreedy = simulationState === 'greedy'; // Stepping removed
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
                    updateInfoDisplay(); requestAnimationFrame(draw); // Show final route automatically
                }, 10);
            } else { resetAgent(); } // Prepare for next episode
        } else if (wasGreedy) { /* Greedy runs instantly now */ }
        else { resetAgent(); } // Reset if stopped manually
        if (!wasGreedy) { episodeCost = 0; } updateInfoDisplay();
    }
    function simulationLoop(timestamp) { /* ... (Keep stable version) ... */
        if (simulationState === 'stopped' || simulationState === 'error') { animationFrameId = null; updateButtonStates(); return; }
        animationFrameId = requestAnimationFrame(simulationLoop); const deltaTime = timestamp - (lastTimestamp || timestamp); lastTimestamp = timestamp;
        if (simulationState === 'training' || simulationState === 'greedy') {
             timeAccumulator += deltaTime; const effectiveDelay = (speedSlider.value >= 990) ? 0 : stepDelay; let stepsToTake = 0;
             if (effectiveDelay <= 1) { stepsToTake = Math.min(10, NUM_DELIVERIES + 2); } // Process more steps at max speed, limit by reasonable route length
             else { stepsToTake = Math.floor(timeAccumulator / effectiveDelay); }
             if (stepsToTake > 0) {
                 timeAccumulator -= stepsToTake * effectiveDelay;
                 for (let i = 0; i < stepsToTake; i++) { if (simulationState !== 'training' && simulationState !== 'greedy') break; runSingleStep(); if (simulationState === 'stopped' || simulationState === 'paused' || simulationState === 'error' || simulationState === 'idle') break; }
                 requestAnimationFrame(draw); updateInfoDisplay();
             }
        }
        updateButtonStates();
    }
    function stopSimulationLoop() { /* ... (Keep stable version) ... */
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
        if (simulationState === 'training' || simulationState === 'greedy') return;
        console.log("Calculating best route from Q-Table..."); setStatus('Calculating Route...', 'stepping'); updateButtonStates();
        setTimeout(() => {
             const route = findBestRouteFromQTable();
             if (route) {
                 bestRoute = route; bestRouteCost = calculateRouteCost(route);
                 setStatus(`Optimal Route Displayed. Cost: ${bestRouteCost.toFixed(0)}.`, 'finished');
                 console.log("Best Route:", route, "Cost:", bestRouteCost);
                 resetAgent(); episodeRoute = [...bestRoute]; // Display the route
             } else {
                 setStatus('Could not determine route (Train more?).', 'error'); bestRoute = []; bestRouteCost = Infinity;
                 resetAgent(); episodeRoute = [0];
             }
             simulationState = 'idle'; updateButtonStates(); updateInfoDisplay();
             requestAnimationFrame(draw);
        }, 10);
    }

    // --- Find Best Route from Q-Table ---
    function findBestRouteFromQTable() { /* ... (Keep stable version with random tie-break) ... */
        let currentLoc = 0; if (!depotLocation) { console.error("Cannot find route, depot not set."); return null; } // Need depot
        let remaining = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1)); const route = [0];
        let safetyBreak = 0; const maxSteps = NUM_DELIVERIES + 5;
        while (remaining.size > 0 && safetyBreak < maxSteps) {
            const stateStr = getStateString(currentLoc, remaining); const validActions = getValidActions(currentLoc, remaining);
            if (validActions.length === 0) { console.error("Route Error: No valid actions from", stateStr); return null; }
            const qValues = validActions.map(a => getQValue(stateStr, a)); const maxQ = Math.max(...qValues);
            let nextLoc;
             // Check if all valid Q-values are effectively the same (e.g., all 0 or all -Infinity)
             const firstQ = qValues[0]; const allSameValue = qValues.every(q => Math.abs(q - firstQ) < 1e-6);
             if (allSameValue && validActions.length > 1) {
                 // If all Q-values are the same (likely untrained state), pick a random valid action
                 nextLoc = validActions[Math.floor(Math.random() * validActions.length)];
                 // console.warn("Choosing random action in findBestRoute due to equal Q-values for state:", stateStr);
             } else if (maxQ === -Infinity && validActions.length > 0) {
                 // If maxQ is -Infinity (only invalid actions were somehow possible?), choose randomly from valid ones
                  console.warn("Choosing random action in findBestRoute because maxQ was -Infinity for state:", stateStr);
                  nextLoc = validActions[Math.floor(Math.random() * validActions.length)];
             }
             else { // Standard greedy choice with random tie-breaking
                 const bestActions = validActions.filter((a, i) => Math.abs(qValues[i] - maxQ) < 1e-6);
                 nextLoc = bestActions[Math.floor(Math.random() * bestActions.length)];
             }
            if (nextLoc === undefined) { console.error("Route Error: Undefined nextLoc", stateStr, validActions, qValues); return null; }
            route.push(nextLoc); currentLoc = nextLoc; remaining.delete(nextLoc); safetyBreak++;
        }
        if (remaining.size === 0) { route.push(0); }
        else { console.error("Route Error: Did not visit all locations.", route, remaining); return null; }
        return route;
    }
      function calculateRouteCost(routeIndices) { /* ... (Keep stable version) ... */
         let totalCost = 0; if (!routeIndices || routeIndices.length < 2) return 0;
         for (let i = 0; i < routeIndices.length - 1; i++) {
             const loc1 = allLocations[routeIndices[i]]; const loc2 = allLocations[routeIndices[i+1]];
             const dist = manhattanDistance(loc1, loc2); if (dist === Infinity) return Infinity; totalCost += dist * COST_PER_DISTANCE_UNIT;
         }
         return totalCost;
      }

    // --- Charting ---
    function initChart() { /* ... (Keep stable version) ... */
        if (rewardChart) rewardChart.destroy();
        const ctxChart = rewardChartCanvas.getContext('2d'); if (!ctxChart) { console.error("Chart context failed"); return; }
        rewardChart = new Chart(ctxChart, { type: 'line', data: { labels: [], datasets: [{ label: `Avg Route Cost (Last ${COST_AVERAGE_WINDOW})`, data: [], borderColor: getCssVar('--primary-color'), backgroundColor: 'rgba(13, 110, 253, 0.1)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: true }] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Episode' } }, y: { title: { display: true, text: 'Average Cost (-Reward)' }, beginAtZero: false } }, plugins: { legend: { display: false }, tooltip: { enabled: true, intersect: false, mode: 'index', } }, animation: { duration: 100 } } });
    }
    function updateChart() { /* ... (Keep stable version) ... */
        if (!rewardChart || recentCosts.length === 0) return;
        const updateFrequency = Math.max(10, Math.floor(MAX_EPISODES / 200)); if (currentEpisode > 0 && currentEpisode % updateFrequency === 0) { const avgCost = recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length; const label = currentEpisode; rewardChart.data.labels.push(label); rewardChart.data.datasets[0].data.push(avgCost); const maxChartPoints = 500; while (rewardChart.data.labels.length > maxChartPoints) { rewardChart.data.labels.shift(); rewardChart.data.datasets[0].data.shift(); } rewardChart.update('none'); }
    }

    // --- UI Updates & Event Handlers ---
    function updateButtonStates() { /* ... (Keep stable version) ... */
        const isIdle = simulationState === 'idle' || simulationState === 'stopped' || simulationState === 'error'; const isPaused = simulationState === 'paused'; const isTrainingActive = simulationState === 'training'; const isRunning = !isIdle && !isPaused;
        startTrainingBtn.disabled = isTrainingActive || simulationState === 'error' || !depotLocation || deliveryLocations.length === 0; startTrainingBtn.innerHTML = (isPaused) ? '▶<span> Resume</span>' : '▶<span> Train</span>';
        pauseTrainingBtn.disabled = !isTrainingActive; stopTrainingBtn.disabled = isIdle || simulationState === 'error'; showRouteBtn.disabled = isRunning || simulationState === 'error' || Object.keys(qTable).length === 0;
        const settingsDisabled = !isIdle;
        gridSizeSelect.disabled = settingsDisabled; generateMapBtn.disabled = settingsDisabled; clearDeliveriesBtn.disabled = settingsDisabled;
        learningRateSlider.disabled = settingsDisabled; discountFactorSlider.disabled = settingsDisabled; epsilonStartSlider.disabled = settingsDisabled; epsilonDecaySlider.disabled = settingsDisabled; epsilonMinSlider.disabled = settingsDisabled; maxEpisodesInput.disabled = settingsDisabled; resetQTableBtn.disabled = settingsDisabled;
        saveQTableBtn.disabled = isRunning; loadQTableBtn.disabled = isRunning; editModeRadios.forEach(radio => radio.disabled = settingsDisabled);
        canvas.classList.toggle('edit-mode-depot', !settingsDisabled && currentEditMode === 'depot'); canvas.classList.toggle('edit-mode-delivery', !settingsDisabled && currentEditMode === 'delivery');
    }
    function updateInfoDisplay() { /* ... (Keep stable version) ... */
        episodeDisplay.textContent = currentEpisode; totalEpisodesDisplay.textContent = MAX_EPISODES;
        destLeftDisplay.textContent = remainingDeliveries?.size ?? 'N/A';
        epsilonDisplay.textContent = (simulationState === 'training' || simulationState === 'paused') ? epsilon.toFixed(4) : 'N/A';
        rewardDisplay.textContent = episodeCost?.toFixed(0) ?? '0';
        if (recentCosts.length > 0) { const avg = recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length; avgRewardDisplay.textContent = avg.toFixed(2); } else { avgRewardDisplay.textContent = "N/A"; }
        bestRouteCostDisplay.textContent = bestRouteCost === Infinity ? "N/A" : bestRouteCost.toFixed(0);
        qTableSizeDisplay.textContent = `${Object.keys(qTable).length}`;
        numDeliveriesDisplay.value = deliveryLocations.length; // Update display based on actual deliveries
    }
    function setStatus(message, className = '') { /* ... (Keep stable version) ... */
        statusDisplay.textContent = message; statusDisplay.className = className;
    }
    function updateUIParameterValues() { /* ... (Keep stable version) ... */
         // Update display only, read happens in updateAlgorithmParamsFromUI
         gridSizeSelect.value = GRID_SIZE; numDeliveriesDisplay.value = NUM_DELIVERIES;
         learningRateValueSpan.textContent = LEARNING_RATE.toFixed(2); learningRateSlider.value = LEARNING_RATE;
         discountFactorValueSpan.textContent = DISCOUNT_FACTOR.toFixed(2); discountFactorSlider.value = DISCOUNT_FACTOR;
         epsilonStartValueSpan.textContent = EPSILON_START.toFixed(2); epsilonStartSlider.value = EPSILON_START;
         epsilonDecayValueSpan.textContent = EPSILON_DECAY.toFixed(4); epsilonDecaySlider.value = EPSILON_DECAY;
         epsilonMinValueSpan.textContent = EPSILON_MIN.toFixed(2); epsilonMinSlider.value = EPSILON_MIN;
         totalEpisodesDisplay.textContent = MAX_EPISODES; maxEpisodesInput.value = MAX_EPISODES;
         updateSpeedDisplay(speedSlider.value);
    }
     function updateSpeedDisplay(value) { /* ... (Keep stable version) ... */
         const speedVal = parseInt(value); let speedText = 'Medium'; if (speedVal >= 990) speedText = 'Max'; else if (speedVal > 750) speedText = 'Very Fast'; else if (speedVal > 500) speedText = 'Fast'; else if (speedVal > 250) speedText = 'Medium'; else if (speedVal > 50) speedText = 'Slow'; else speedText = 'Very Slow'; speedValueSpan.textContent = speedText; stepDelay = 1000 - speedVal;
     }
    function updateAlgorithmParamsFromUI() { /* ... (Keep stable version) ... */
         LEARNING_RATE = parseFloat(learningRateSlider.value); DISCOUNT_FACTOR = parseFloat(discountFactorSlider.value);
         EPSILON_START = parseFloat(epsilonStartSlider.value); EPSILON_DECAY = parseFloat(epsilonDecaySlider.value);
         EPSILON_MIN = parseFloat(epsilonMinSlider.value); MAX_EPISODES = parseInt(maxEpisodesInput.value);
         console.log("Algorithm Params Updated from UI");
    }

    // --- Event Listeners ---
    gridSizeSelect.addEventListener('change', () => { init(true); }); // Force regenerate map on grid size change
    generateMapBtn.addEventListener('click', () => init(true));
    clearDeliveriesBtn.addEventListener('click', clearDeliveriesAction);
    editModeRadios.forEach(radio => { radio.addEventListener('change', (e) => {
        currentEditMode = e.target.value; updateButtonStates(); /* Update cursor potentially */
        });
    });
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
         if (simulationState !== 'idle' && simulationState !== 'stopped' && simulationState !== 'error') return;
         if (currentEditMode === 'none') return;
         const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top;
         const c = Math.floor(x / CELL_SIZE); const r = Math.floor(y / CELL_SIZE);
         if (!isValid(r, c)) return;
         let locationsChanged = false; const clickedCoordString = `${r},${c}`;
         const isExistingDepot = depotLocation && depotLocation.r === r && depotLocation.c === c;
         const existingDeliveryIndex = deliveryLocations.findIndex(loc => loc.r === r && loc.c === c);
         switch (currentEditMode) {
             case 'depot':
                 if (existingDeliveryIndex !== -1) { alert("Depot cannot be on a Delivery location."); return; }
                 depotLocation = { r, c }; locationsChanged = true; console.log("Depot set:", depotLocation); break;
             case 'delivery':
                 if (isExistingDepot) { alert("Delivery cannot be on the Depot."); return; }
                 if (existingDeliveryIndex !== -1) { deliveryLocations.splice(existingDeliveryIndex, 1); locationsChanged = true; console.log(`Delivery removed.`); }
                 else { if (deliveryLocations.length >= MAX_ALLOWED_DELIVERIES) { alert(`Max ${MAX_ALLOWED_DELIVERIES} deliveries.`); return; } deliveryLocations.push({ r, c }); locationsChanged = true; console.log(`Delivery added.`); }
                 break;
         }
         if (locationsChanged) {
             updateAllLocations(); NUM_DELIVERIES = deliveryLocations.length; numDeliveriesDisplay.value = NUM_DELIVERIES; nextDeliveryIndexToPlace = NUM_DELIVERIES + 1;
             initQTable(); resetSimulationStats(); bestRoute = []; bestRouteCost = Infinity; setStatus("Locations changed. Learning Reset.", "idle"); requestAnimationFrame(draw);
         }
     }

    // --- Persistence ---
    function saveQTable() {
         try {
             const dataToSave = {
                 gridSize: GRID_SIZE, numDeliveries: NUM_DELIVERIES, // Save config
                 qTable: qTable, bestRoute: bestRoute, bestRouteCost: bestRouteCost,
                 depotLocation: depotLocation, deliveryLocations: deliveryLocations // Save locations too
             };
             localStorage.setItem('deliveryQLearning_v3', JSON.stringify(dataToSave)); // Use new key
             setStatus("State Saved.", "idle");
         } catch (e) { console.error("Save failed:", e); setStatus("Error saving.", "error"); alert("Could not save state."); }
    }
    function loadQTable() {
         try {
             const savedData = localStorage.getItem('deliveryQLearning_v3');
             if (!savedData) { alert("No saved state found."); return; }
             const loadedData = JSON.parse(savedData);

             // **Restore settings and locations FIRST**
             GRID_SIZE = loadedData.gridSize || 12;
             NUM_DELIVERIES = loadedData.numDeliveries || 5;
             depotLocation = loadedData.depotLocation || null;
             deliveryLocations = loadedData.deliveryLocations || [];
             updateAllLocations(); // Rebuild combined list

             // Update UI to match loaded settings
             gridSizeSelect.value = GRID_SIZE;
             numDeliveriesDisplay.value = NUM_DELIVERIES;

             // **Re-initialize the map visuals based on loaded locations**
             init(false, false); // generateNewMap=false, resetLearning=false (keep Q-table logic below)

             // **Load Q-table and best route info**
             qTable = loadedData.qTable || {};
             bestRoute = loadedData.bestRoute || [];
             bestRouteCost = loadedData.bestRouteCost === undefined ? Infinity : loadedData.bestRouteCost;

             // **Reset stats and apply loaded state**
             resetSimulationStats(); // Reset episode, epsilon etc.
             epsilon = EPSILON_MIN; // Assume loaded is trained
             setStatus("State Loaded. Epsilon low.", "idle");
             updateInfoDisplay(); // Update display with loaded stats
             requestAnimationFrame(draw); // Draw the loaded map & best route

         } catch (e) { console.error("Load failed:", e); setStatus("Error loading state.", "error"); alert("Could not load state."); }
    }


    // --- Initial Setup & Resize Handling ---
    console.log("DOM Loaded. Starting initialization...");
    // Use setTimeout to ensure layout is likely stable before first init
    setTimeout(() => {
        init(true); // Initial call to setup everything
        window.addEventListener('resize', resizeCanvas); // Add resize listener
        console.log("Initial setup complete.");
    }, 100); // Small delay

}); // End DOMContentLoaded
