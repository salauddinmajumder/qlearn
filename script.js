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

    // Rewards & Costs
    const REWARD_SUCCESSFUL_RETURN = 200; // Positive reward for finishing correctly
    const COST_PER_DISTANCE_UNIT = 1; // Fuel cost = distance

    // --- Q-Learning Parameters ---
    let LEARNING_RATE = parseFloat(learningRateSlider.value);
    let DISCOUNT_FACTOR = parseFloat(discountFactorSlider.value);
    let EPSILON_START = parseFloat(epsilonStartSlider.value);
    let EPSILON_DECAY = parseFloat(epsilonDecaySlider.value);
    let EPSILON_MIN = parseFloat(epsilonMinSlider.value);
    let MAX_EPISODES = parseInt(maxEpisodesInput.value);
    // No MAX_STEPS needed, episode ends when route is complete

    // --- State Variables ---
    let depotLocation = { r: -1, c: -1 }; // Depot (index 0)
    let deliveryLocations = []; // Array of {r, c} for deliveries (indices 1 to N)
    let allLocations = []; // Combined list: [depot, delivery1, delivery2, ...]
    let currentLocationIndex = 0; // Start at depot (index 0)
    let remainingDeliveries = new Set(); // Set of delivery indices (1 to N)

    let qTable = {}; // Use dictionary: { stateString: [q_values_for_valid_actions] }

    let epsilon = 1.0;
    let currentEpisode = 0;
    let episodeCost = 0; // Tracks total cost (distance) for the episode
    let episodeRoute = []; // Sequence of location indices visited in episode

    let simulationState = 'idle';
    let animationFrameId = null;
    let lastTimestamp = 0;
    let stepDelay = 1000 - parseInt(speedSlider.value); // Delay between *decisions*, not grid steps
    let timeAccumulator = 0;

    let recentCosts = []; // Track costs for averaging
    const COST_AVERAGE_WINDOW = 100;
    let bestRouteCost = Infinity; // Track the minimum cost found so far
    let bestRoute = []; // Store the sequence of the best route

    let rewardChart;


    // --- Utility Functions ---
    function getCssVar(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }
    function isValid(r, c) { return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE; }
    function manhattanDistance(loc1, loc2) {
        if (!loc1 || !loc2) return Infinity; // Handle invalid locations
        return Math.abs(loc1.r - loc2.r) + Math.abs(loc1.c - loc2.c);
    }
    function resizeCanvas() { /* ... (same as before) ... */
        const container = document.querySelector('.canvas-container');
        if (!container) return;
        const containerWidth = container.clientWidth - 16; // Adjust padding
        const containerHeight = container.clientHeight - 16;
        const canvasSize = Math.min(containerWidth, containerHeight, 600);
        canvas.width = canvasSize; canvas.height = canvasSize;
        CELL_SIZE = canvas.width / GRID_SIZE;
        requestAnimationFrame(draw);
    }

    // --- State Representation ---
    // State = (current_location_index, frozenset_of_remaining_delivery_indices)
    // We'll use a string representation for the dictionary key
    function getStateString(locationIndex, remainingSet) {
        // Sort remaining indices for consistent key generation
        const sortedRemaining = Array.from(remainingSet).sort((a, b) => a - b);
        return `${locationIndex}-${JSON.stringify(sortedRemaining)}`;
    }

    // --- Initialization ---
    function init(resetLearning = true) {
        console.log("Initializing Delivery Environment...");
        setStatus('Initializing...', 'initializing');
        stopSimulationLoop();

        GRID_SIZE = parseInt(gridSizeSelect.value);
        NUM_DELIVERIES = parseInt(numDeliveriesSelect.value);
        CELL_SIZE = canvas.width / GRID_SIZE; // Recalculate
        MAX_EPISODES = parseInt(maxEpisodesInput.value);
        totalEpisodesDisplay.textContent = MAX_EPISODES;

        placeLocations(); // Place depot and deliveries

        if (resetLearning) {
            initQTable();
            resetSimulationStats();
            bestRouteCost = Infinity; // Reset best known cost
            bestRoute = [];
        } else {
            resetSimulationStats(); // Keep Q-table, reset stats
            recalculateGlobalMinMaxQ(); // Update display bounds
        }

        updateUIParameterValues();
        updateButtonStates();
        setStatus('Ready.', 'idle');
        requestAnimationFrame(draw);
        console.log("Initialization Complete.");
    }

    function placeLocations() {
         deliveryLocations = [];
         allLocations = [];
         const placedCoords = new Set(); // Keep track of placed coordinates (r,c)

         // Place Depot (try center-ish)
         let depotR = Math.floor(GRID_SIZE / 2);
         let depotC = Math.floor(GRID_SIZE / 2);
         // Simple check, could be more robust (e.g., random if center fails)
         if (!isValid(depotR, depotC)) { depotR = 0; depotC = 0; } // Fallback
         depotLocation = { r: depotR, c: depotC };
         placedCoords.add(`${depotR},${depotC}`);
         allLocations.push(depotLocation);

         // Place Deliveries randomly, ensuring no overlap
         let attempts = 0;
         while (deliveryLocations.length < NUM_DELIVERIES && attempts < GRID_SIZE * GRID_SIZE * 2) {
             const r = Math.floor(Math.random() * GRID_SIZE);
             const c = Math.floor(Math.random() * GRID_SIZE);
             const coordString = `${r},${c}`;

             if (isValid(r, c) && !placedCoords.has(coordString)) {
                 const newLoc = { r, c };
                 deliveryLocations.push(newLoc);
                 allLocations.push(newLoc); // Add to combined list
                 placedCoords.add(coordString);
             }
             attempts++;
         }

         if (deliveryLocations.length < NUM_DELIVERIES) {
              console.error(`Could only place ${deliveryLocations.length}/${NUM_DELIVERIES} deliveries.`);
              setStatus(`Error: Map too small?`, "error");
              // Maybe disable simulation?
         }
         resetAgent();
     }


    function initQTable() { qTable = {}; globalMinQ = 0; globalMaxQ = 0; }
    function recalculateGlobalMinMaxQ() { /* Not really used for this problem's Q-values */ }

    function resetSimulationStats() {
        currentEpisode = 0;
        epsilon = EPSILON_START;
        recentCosts = []; // Use cost now
        initChart();
        resetAgent(); // Resets route, cost, remaining deliveries, position
        updateInfoDisplay();
    }

    function resetAgent() {
        currentLocationIndex = 0; // Start at depot
        remainingDeliveries = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1)); // Indices 1 to N
        episodeCost = 0;
        episodeRoute = [0]; // Start route at depot index
    }

    // --- Drawing Functions ---
    function draw() {
        if (!ctx) return;
        try { ctx.clearRect(0, 0, canvas.width, canvas.height); }
        catch (e) { console.error("Clear canvas error:", e); return; }

        drawMapBackground();
        drawLocations();
        if (showCurrentPathCheckbox.checked && (simulationState === 'training' || simulationState === 'paused' || simulationState === 'stepping' || simulationState === 'greedy')) {
             drawRoute(episodeRoute, getCssVar('--current-path-color'), 2); // Draw current attempt
        }
        if (showFinalRouteCheckbox.checked && bestRoute.length > 1) {
            drawRoute(bestRoute, getCssVar('--final-route-color'), 3.5, true); // Draw best route found
        }
        if (showTruckCheckbox.checked) drawTruck();

    }

    function drawMapBackground() {
        ctx.fillStyle = getCssVar('--grid-bg');
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Optional: Draw grid lines
        // ctx.strokeStyle = getCssVar('--grid-line');
        // ctx.lineWidth = 0.5;
        // for (let i = 0; i <= GRID_SIZE; i++) {
        //     ctx.beginPath();
        //     ctx.moveTo(i * CELL_SIZE, 0); ctx.lineTo(i * CELL_SIZE, canvas.height);
        //     ctx.moveTo(0, i * CELL_SIZE); ctx.lineTo(canvas.width, i * CELL_SIZE);
        //     ctx.stroke();
        // }
    }

    function drawLocations() {
        // Draw Depot
        if (depotLocation.r >= 0) {
            drawMarker(depotLocation, getCssVar('--cell-depot'), 'D');
        }
        // Draw Deliveries
        deliveryLocations.forEach((loc, index) => {
            const deliveryIndex = index + 1; // 1-based index
            const isRemaining = remainingDeliveries.has(deliveryIndex);
            const color = getCssVar('--cell-delivery');
             // Fade out completed deliveries slightly
            ctx.globalAlpha = isRemaining ? 1.0 : 0.5;
            drawMarker(loc, color, deliveryIndex.toString());
            ctx.globalAlpha = 1.0;
        });
    }

    function drawMarker(loc, color, text = '') {
        if (!isValid(loc.r, loc.c)) return;
        const centerX = loc.c * CELL_SIZE + CELL_SIZE / 2;
        const centerY = loc.r * CELL_SIZE + CELL_SIZE / 2;
        const radius = CELL_SIZE * 0.35;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Optional border
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw Text (Depot/Index)
        if (text) {
            ctx.fillStyle = '#fff'; // White text
            ctx.font = `bold ${Math.max(8, CELL_SIZE * 0.35)}px ${getCssVar('--font-family')}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, centerX, centerY + 1);
        }
    }

    function drawTruck() {
        if (currentLocationIndex < 0 || currentLocationIndex >= allLocations.length) return;
        const truckLoc = allLocations[currentLocationIndex];
        if (!isValid(truckLoc.r, truckLoc.c)) return;

        const centerX = truckLoc.c * CELL_SIZE + CELL_SIZE / 2;
        const centerY = truckLoc.r * CELL_SIZE + CELL_SIZE / 2;
        const truckSize = CELL_SIZE * 0.5; // Slightly smaller than markers

        // Simple truck representation (rectangle)
        ctx.fillStyle = getCssVar('--truck-color');
        ctx.fillRect(centerX - truckSize / 2, centerY - truckSize / 2, truckSize, truckSize);
        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(centerX - truckSize / 2, centerY - truckSize / 2, truckSize, truckSize);
    }

    function drawRoute(routeIndices, color, lineWidth, dashed = false) {
        if (!routeIndices || routeIndices.length < 2) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, lineWidth);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (dashed) {
             ctx.setLineDash([5, 5]); // Dashed line style
        }

        ctx.beginPath();
        let firstLoc = allLocations[routeIndices[0]];
        if (!firstLoc || !isValid(firstLoc.r, firstLoc.c)) return; // Check first location validity
        ctx.moveTo(firstLoc.c * CELL_SIZE + CELL_SIZE / 2, firstLoc.r * CELL_SIZE + CELL_SIZE / 2);

        for (let i = 1; i < routeIndices.length; i++) {
            let nextLoc = allLocations[routeIndices[i]];
             if (!nextLoc || !isValid(nextLoc.r, nextLoc.c)) { // Skip invalid points in path
                 console.warn(`Invalid location index ${routeIndices[i]} in route.`);
                 continue;
             }
            ctx.lineTo(nextLoc.c * CELL_SIZE + CELL_SIZE / 2, nextLoc.r * CELL_SIZE + CELL_SIZE / 2);
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
    }


    // --- Q-Learning Logic ---
    function getValidActions(locationIndex, remainingSet) {
        if (remainingSet.size === 0) {
            return [0]; // Only action is return to depot (index 0)
        } else {
            return Array.from(remainingSet); // Actions are indices of remaining deliveries
        }
    }

    function getQValue(stateString, action) {
        if (!qTable[stateString]) {
            // Initialize Q-values for this state lazily if needed
            // Number of actions depends on remaining deliveries in the state represented by stateString
             const parts = stateString.split('-');
             const remaining = JSON.parse(parts[1] || '[]');
             const numValidActions = remaining.length === 0 ? 1 : remaining.length;
             qTable[stateString] = new Array(numValidActions).fill(0); // Initialize with zeros

             // Important: The index in this Q-value array corresponds to the *valid* actions
             // We need a way to map the global delivery index (action) to the local index in the q-value array
             // For now, we assume the q-value array order matches the sorted remaining deliveries + depot(0) if applicable.
        }

         // Map the global action (delivery index or 0 for depot) to the index within the state's Q-array
         const parts = stateString.split('-');
         const currentLoc = parseInt(parts[0]);
         const remaining = JSON.parse(parts[1] || '[]');
         const validActions = remaining.length === 0 ? [0] : remaining.sort((a,b)=>a-b); // Sorted valid actions

         const qIndex = validActions.indexOf(action);

         if (qIndex === -1) {
             // This action is not valid for this state, Q-value is effectively -Infinity
             // Returning 0 for simplicity, but chooseAction should filter this.
              // console.warn(`Accessing Q for invalid action ${action} in state ${stateString}`);
             return 0; // Or a large negative number? Needs care in chooseAction
         }

        return qTable[stateString][qIndex] || 0;
    }

    function chooseAction(locationIndex, remainingSet) {
        const stateString = getStateString(locationIndex, remainingSet);
        const validActions = getValidActions(locationIndex, remainingSet); // e.g., [2, 4] or [0]

        if (validActions.length === 0) {
            console.error("No valid actions found for state:", stateString);
            return -1; // Error case
        }
        if (validActions.length === 1) {
            return validActions[0]; // Only one choice
        }

        let chosenAction;
        const isExploring = (simulationState === 'training' || simulationState === 'stepping') && Math.random() < epsilon;

        if (isExploring) {
            chosenAction = validActions[Math.floor(Math.random() * validActions.length)];
        } else { // Exploit
             // Get Q-values *only* for valid actions
             const qValuesForValidActions = validActions.map(action => getQValue(stateString, action));

             const maxQ = Math.max(...qValuesForValidActions);

             // Find all valid actions that have the max Q-value
             const bestValidActions = validActions.filter((action, index) => {
                 return Math.abs(qValuesForValidActions[index] - maxQ) < 1e-6;
             });

            // Randomly choose among the best valid actions
            chosenAction = bestValidActions[Math.floor(Math.random() * bestValidActions.length)];
        }
        return chosenAction;
    }

    function updateQTable(stateString, action, reward, nextStateString, done) {
        // Get Q-values for the *current* state
        const validActionsCurrent = getValidActionsFromString(stateString);
        const qIndex = validActionsCurrent.indexOf(action);
        if (qIndex === -1) {
             console.error(`Cannot update Q: Action ${action} invalid for state ${stateString}`);
             return; // Should not happen if chosen correctly
        }

        // Ensure Q-array exists for current state
        if (!qTable[stateString]) {
            qTable[stateString] = new Array(validActionsCurrent.length).fill(0);
        }
        const currentQ = qTable[stateString][qIndex];

        // Get max Q-value for the *next* state (considering only its valid actions)
        let maxNextQ = 0;
        if (!done) {
            const validActionsNext = getValidActionsFromString(nextStateString);
            if (validActionsNext.length > 0) {
                const qValuesNext = validActionsNext.map(nextAction => getQValue(nextStateString, nextAction));
                maxNextQ = Math.max(...qValuesNext);
            }
            // If next state hasn't been visited, maxNextQ remains 0, which is correct
        }

        // Q-learning update rule
        const targetQ = reward + DISCOUNT_FACTOR * maxNextQ;
        const newQ = currentQ + LEARNING_RATE * (targetQ - currentQ);
        qTable[stateString][qIndex] = newQ;

        // Update global min/max (less critical here, maybe remove later)
        // if (newQ > globalMaxQ) globalMaxQ = newQ;
        // if (newQ < globalMinQ) globalMinQ = newQ;
    }
     // Helper to parse state string back into valid actions
     function getValidActionsFromString(stateString) {
          try {
             const parts = stateString.split('-');
             const remaining = JSON.parse(parts[1] || '[]');
             return remaining.length === 0 ? [0] : remaining.sort((a,b)=>a-b);
          } catch (e) {
               console.error("Error parsing state string:", stateString, e);
               return []; // Return empty on error
          }
     }

    // --- Simulation Step & Loop ---
    function runSingleStep() {
        if (currentLocationIndex < 0 || currentLocationIndex >= allLocations.length) {
            console.error("Invalid current location:", currentLocationIndex);
            setStatus("Error: Invalid state", "error"); stopSimulationLoop(); return;
        }

        const stateString = getStateString(currentLocationIndex, remainingDeliveries);
        const action = chooseAction(currentLocationIndex, remainingDeliveries); // Action is the index of the *next location* (0 for depot, 1-N for deliveries)

        if (action === -1) { // Error from chooseAction
             setStatus("Error: Choose action failed", "error"); stopSimulationLoop(); return;
        }

        // --- Calculate Cost & Update State ---
        const currentLocation = allLocations[currentLocationIndex];
        const nextLocation = allLocations[action];
        const distance = manhattanDistance(currentLocation, nextLocation);
        const cost = distance * COST_PER_DISTANCE_UNIT;
        const reward = -cost; // Use negative cost as reward

        // Update state variables
        const previousLocationIndex = currentLocationIndex;
        currentLocationIndex = action; // Move to the chosen location
        episodeCost += cost;
        episodeRoute.push(currentLocationIndex);

        // Create a mutable copy to update remaining deliveries
        let nextRemainingDeliveries = new Set(remainingDeliveries);
        if (action !== 0) { // If we moved to a delivery location (not depot)
            nextRemainingDeliveries.delete(action); // Remove this delivery index
        }

        const done = (currentLocationIndex === 0 && nextRemainingDeliveries.size === 0); // Back at depot AND all deliveries done?
        let finalReward = reward;
        if (done) {
            finalReward += REWARD_SUCCESSFUL_RETURN; // Add bonus for successful completion
        }

        const nextStateString = getStateString(currentLocationIndex, nextRemainingDeliveries);

        // --- Update Q-Table (if training/stepping) ---
        if (simulationState === 'training' || simulationState === 'stepping') {
            updateQTable(stateString, action, finalReward, nextStateString, done);
        }

        // --- Update live stats (used by info panel) ---
        remainingDeliveries = nextRemainingDeliveries; // Update the main state variable

        // --- End of Episode Logic ---
        if (done) {
            handleEpisodeEnd(true); // Mark as success
        }
        // No max steps check needed here, episode ends naturally
    }

    function handleEpisodeEnd(succeeded) {
        const wasTraining = (simulationState === 'training');
        const wasStepping = (simulationState === 'stepping');
        const wasGreedy = (simulationState === 'greedy');

        if (succeeded && (wasTraining || wasStepping)) {
             recentCosts.push(episodeCost); // Track cost
             if (recentCosts.length > COST_AVERAGE_WINDOW) recentCosts.shift();
             updateChart(); // Update with cost
             if (epsilon > EPSILON_MIN) epsilon *= EPSILON_DECAY;
        }

        // Update Best Route Found
        if (succeeded && episodeCost < bestRouteCost) {
             bestRouteCost = episodeCost;
             bestRoute = [...episodeRoute]; // Store a copy of the route
             console.log(`New best route found! Cost: ${bestRouteCost.toFixed(0)}`, bestRoute);
        }

        if (wasTraining) {
            currentEpisode++;
            if (currentEpisode >= MAX_EPISODES) {
                setStatus(`Training Finished (Max Ep.).`, 'finished');
                stopSimulationLoop();
                bestRoute = findBestRouteFromQTable(); // Calculate best route after training
            } else {
                 resetAgent(); // Prepare for next episode
            }
        } else if (wasStepping) {
            setStatus(`Episode End (${succeeded ? 'Success' : 'Stopped'}). Paused.`, 'paused');
            simulationState = 'paused';
            updateButtonStates();
            resetAgent(); // Reset for next potential step
        } else if (wasGreedy) {
             if (succeeded) {
                 setStatus(`Route Found. Cost: ${episodeCost.toFixed(0)}.`, 'finished');
                 // Store this as the final route for display
                 bestRoute = [...episodeRoute];
                 bestRouteCost = episodeCost;
             } else {
                  setStatus(`Greedy Run Failed/Stopped.`, 'stopped');
             }
             stopSimulationLoop(); // Stop automatically after greedy run
            // Don't reset agent state - keep final route visible
        } else { // Stopped manually
            resetAgent();
        }

         // Reset counters/cost for the *next* run, unless greedy just finished
         if (!wasGreedy) {
             episodeCost = 0;
         }
         // Update display after handling state transitions
         updateInfoDisplay();
    }

     function simulationLoop(timestamp) { // Manages timing of steps
         if (simulationState === 'stopped' || simulationState === 'error') {
             animationFrameId = null; return;
         }
         animationFrameId = requestAnimationFrame(simulationLoop);
         const deltaTime = timestamp - (lastTimestamp || timestamp);
         lastTimestamp = timestamp;

         if (simulationState === 'training' || simulationState === 'greedy') {
             timeAccumulator += deltaTime;
             const effectiveDelay = (speedSlider.value >= 990) ? 0 : stepDelay; // Near Max speed = 0 delay
             let stepsToTake = 0;
             if (effectiveDelay <= 1) { stepsToTake = 5; } // Batch steps at high speed
             else { stepsToTake = Math.floor(timeAccumulator / effectiveDelay); }

             if (stepsToTake > 0) {
                 timeAccumulator -= stepsToTake * effectiveDelay;
                 for (let i = 0; i < stepsToTake; i++) {
                     if (simulationState !== 'training' && simulationState !== 'greedy') break;
                     runSingleStep(); // Might end the episode and change state
                     if (simulationState === 'stopped' || simulationState === 'paused' || simulationState === 'error' || simulationState === 'idle') break; // Stop if state changed mid-batch
                 }
                 requestAnimationFrame(draw);
                 updateInfoDisplay();
             }
         } else if (simulationState === 'paused' || simulationState === 'idle') {
             // Idling, no steps processed
         }
         updateButtonStates(); // Ensure buttons reflect current state
     }

    function stopSimulationLoop() { /* ... (same as before) ... */
         if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
         const wasRunning = simulationState !== 'idle' && simulationState !== 'stopped' && simulationState !== 'error';
         simulationState = 'stopped';
         updateButtonStates();
         if (wasRunning) { setStatus('Simulation Stopped.', 'stopped'); requestAnimationFrame(draw); }
         lastTimestamp = 0; timeAccumulator = 0;
    }

    // --- Simulation Control Actions ---
    function startTrainingAction() { /* ... (same as before, uses resetSimulationStats) ... */
         if (simulationState === 'training') return;
         const resuming = simulationState === 'paused';
         if (!resuming) {
             initQTable(); // Reset learning on explicit start
             resetSimulationStats();
             bestRouteCost = Infinity; bestRoute = []; // Reset best route too
             epsilon = EPSILON_START;
             setStatus('Training Started...', 'training');
         } else { setStatus('Training Resumed...', 'training'); }
         simulationState = 'training';
         updateButtonStates();
         if (!animationFrameId) { lastTimestamp = performance.now(); timeAccumulator = 0; animationFrameId = requestAnimationFrame(simulationLoop); }
    }
    function pauseTrainingAction() { /* ... (same as before) ... */
         if (simulationState === 'training') { simulationState = 'paused'; setStatus('Training Paused.', 'paused'); updateButtonStates(); }
    }
    function stopAction() { stopSimulationLoop(); }
    // Step Action Removed
    function greedyAction() { /* Renamed to showRouteAction */
        if (simulationState === 'training' || simulationState === 'greedy') return; // Don't interrupt training/greedy
        console.log("Calculating best route from Q-Table...");
        setStatus('Calculating Route...', 'stepping'); // Use stepping state temporarily
        updateButtonStates(); // Disable buttons

        // Use setTimeout to allow UI update before potentially long calculation
        setTimeout(() => {
             const route = findBestRouteFromQTable();
             if (route) {
                 bestRoute = route;
                 bestRouteCost = calculateRouteCost(route);
                 setStatus(`Optimal Route Found. Cost: ${bestRouteCost.toFixed(0)}.`, 'finished');
                 console.log("Best Route:", route, "Cost:", bestRouteCost);
             } else {
                 setStatus('Could not determine route (Insufficient training?).', 'error');
                 bestRoute = []; // Clear display
                 bestRouteCost = Infinity;
             }
             simulationState = 'idle'; // Go back to idle after calculation
             updateButtonStates();
             updateInfoDisplay();
             requestAnimationFrame(draw); // Draw the final route
        }, 10); // Short delay
    }

    // --- Find Best Route from Q-Table ---
    function findBestRouteFromQTable() {
         let currentLoc = 0; // Start at depot
         let remaining = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1));
         const route = [0];
         let safetyBreak = 0;
         const maxSteps = NUM_DELIVERIES + 2; // Max possible steps in a route

         while (remaining.size > 0 && safetyBreak < maxSteps) {
             const stateStr = getStateString(currentLoc, remaining);
             const validActions = getValidActions(currentLoc, remaining);
             if (validActions.length === 0) {
                 console.error("Error finding route: No valid actions from state", stateStr);
                 return null; // Should not happen if logic is correct
             }

             const qValues = validActions.map(a => getQValue(stateStr, a));
             const maxQ = Math.max(...qValues);
             // Find *all* best actions (robust tie-breaking isn't strictly needed here, but good practice)
             const bestActions = validActions.filter((a, idx) => Math.abs(qValues[idx] - maxQ) < 1e-6);
             const nextLoc = bestActions[0]; // Just take the first best action found

             route.push(nextLoc);
             currentLoc = nextLoc;
             remaining.delete(nextLoc); // Remove from remaining
             safetyBreak++;
         }

         // After visiting all, add return to depot
         if (remaining.size === 0) {
             route.push(0); // Add final return to depot
         } else {
             console.error("Error finding route: Did not visit all locations.", route, remaining);
             return null; // Failed to find a complete route
         }

         return route;
     }
      function calculateRouteCost(routeIndices) {
         let totalCost = 0;
         if (!routeIndices || routeIndices.length < 2) return 0;
         for (let i = 0; i < routeIndices.length - 1; i++) {
             const loc1 = allLocations[routeIndices[i]];
             const loc2 = allLocations[routeIndices[i+1]];
             totalCost += manhattanDistance(loc1, loc2) * COST_PER_DISTANCE_UNIT;
         }
         return totalCost;
      }


    // --- Charting ---
    function initChart() { /* ... (Adjust labels for Cost) ... */
         if (rewardChart) rewardChart.destroy();
         const ctxChart = rewardChartCanvas.getContext('2d');
         if (!ctxChart) { console.error("Chart context failed"); return; }
         rewardChart = new Chart(ctxChart, {
             type: 'line', data: { labels: [], datasets: [{ label: `Avg Route Cost (Last ${COST_AVERAGE_WINDOW})`, data: [], borderColor: getCssVar('--primary-color'), backgroundColor: 'rgba(52, 152, 219, 0.1)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: true }] },
             options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Episode' } }, y: { title: { display: true, text: 'Average Cost (-Reward)' } } }, plugins: { legend: { display: false }, tooltip: { enabled: true } }, animation: { duration: 100 } } // Faster anim
         });
    }
    function updateChart() { /* ... (Use recentCosts, plot maybe less frequently) ... */
         if (!rewardChart || recentCosts.length === 0) return;
         const updateFrequency = Math.max(10, Math.floor(MAX_EPISODES / 200)); // Update less often for many episodes
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
    function updateButtonStates() { /* ... (Adjust based on removed Step button) ... */
        const isIdle = simulationState === 'idle' || simulationState === 'stopped' || simulationState === 'error';
        const isPaused = simulationState === 'paused';
        const isTrainingActive = simulationState === 'training';
        const isRunning = !isIdle && !isPaused; // Training or Greedy (greedy now runs instantly)

        startTrainingBtn.disabled = isTrainingActive || simulationState === 'error';
        startTrainingBtn.innerHTML = (isPaused) ? '▶ Resume' : '▶ Train';
        pauseTrainingBtn.disabled = !isTrainingActive;
        stopTrainingBtn.disabled = isIdle || simulationState === 'error';
        // stepBtn removed
        runGreedyBtn.disabled = isRunning || simulationState === 'error'; // Disable while training/paused

        const settingsDisabled = !isIdle; // Disable settings unless fully idle/stopped/error
        gridSizeSelect.disabled = settingsDisabled;
        numDeliveriesSelect.disabled = settingsDisabled; // Disable changing # deliveries while running
        resetEnvBtn.disabled = settingsDisabled;
        // clearObstaclesBtn removed
        learningRateSlider.disabled = settingsDisabled;
        discountFactorSlider.disabled = settingsDisabled;
        epsilonStartSlider.disabled = settingsDisabled;
        epsilonDecaySlider.disabled = settingsDisabled;
        epsilonMinSlider.disabled = settingsDisabled;
        maxEpisodesInput.disabled = settingsDisabled;
        resetQTableBtn.disabled = settingsDisabled;
        saveQTableBtn.disabled = isRunning; // Allow save when paused/idle
        loadQTableBtn.disabled = isRunning; // Allow load when paused/idle
    }
    function updateInfoDisplay() { /* ... (Update new/changed fields) ... */
        episodeDisplay.textContent = currentEpisode;
        destLeftDisplay.textContent = remainingDeliveries.size; // Show remaining deliveries
        // stepsDisplay removed as less relevant
        rewardDisplay.textContent = episodeCost.toFixed(0); // Show current cost
        epsilonDisplay.textContent = (simulationState === 'training' || simulationState === 'paused') ? epsilon.toFixed(4) : 'N/A';
        if (recentCosts.length > 0) { const avg = recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length; avgRewardDisplay.textContent = avg.toFixed(2); }
        else { avgRewardDisplay.textContent = "N/A"; }
        bestRouteCostDisplay.textContent = bestRouteCost === Infinity ? "N/A" : bestRouteCost.toFixed(0); // Show best cost
        qTableSizeDisplay.textContent = `${Object.keys(qTable).length}`;
    }
    // ... (Keep setStatus, updateUIParameterValues, updateSpeedDisplay) ...

    // --- Event Listeners ---
    gridSizeSelect.addEventListener('change', (e) => { GRID_SIZE = parseInt(e.target.value); init(true); resizeCanvas(); });
    numDeliveriesSelect.addEventListener('change', (e) => { NUM_DELIVERIES = parseInt(e.target.value); init(true); resizeCanvas(); }); // Re-init on changing deliveries
    // Obstacle slider listener removed
    // Edit mode listener removed
    resetEnvBtn.addEventListener('click', () => init(true));
    // Clear obstacles button listener removed

    // ... (Keep listeners for Algorithm Params, Persistence, Main Controls, Visualization Toggles) ...
    // StepBtn listener removed
    runGreedyBtn.addEventListener('click', greedyAction); // Renamed target function

    // Canvas Interaction Removed (Edit mode gone)
    canvas.removeEventListener('mousemove', handleCanvasMouseMove);
    canvas.removeEventListener('mouseleave', handleCanvasMouseOut);
    canvas.removeEventListener('click', handleCanvasClick);
    canvas.style.cursor = 'default'; // Ensure default cursor

    // --- Persistence ---
    function saveQTable() { /* ... (Use a different localStorage key) ... */
         try {
             const dataToSave = { gridSize: GRID_SIZE, numDeliveries: NUM_DELIVERIES, qTable: qTable, bestRoute: bestRoute, bestRouteCost: bestRouteCost };
             localStorage.setItem('deliveryQLearning_v1', JSON.stringify(dataToSave));
             setStatus("Policy & Best Route Saved.", "idle");
         } catch (e) { console.error("Save failed:", e); setStatus("Error saving policy.", "error"); alert("Could not save policy."); }
    }
    function loadQTable() { /* ... (Validate NUM_DELIVERIES on load) ... */
        try {
            const savedData = localStorage.getItem('deliveryQLearning_v1');
            if (!savedData) { alert("No saved policy found."); return; }
            const loadedData = JSON.parse(savedData);
            // **Crucial Validation**
            if (loadedData.gridSize !== GRID_SIZE || loadedData.numDeliveries !== NUM_DELIVERIES) {
                 if (!confirm(`Saved data is for ${loadedData.numDeliveries} deliveries on ${loadedData.gridSize}x${loadedData.gridSize}. Current is ${NUM_DELIVERIES} on ${GRID_SIZE}x${GRID_SIZE}. Load anyway? (May require regenerating map & locations)`)) return;
                 // If they proceed, force re-init of map to match saved size potentially
                 // GRID_SIZE = loadedData.gridSize;
                 // NUM_DELIVERIES = loadedData.numDeliveries;
                 // init(false); // Re-init map but keep loaded Q-table logic below
                 // updateUIParameterValues(); // Reflect potential size change
                 console.warn("Loading data from different settings. Map regenerated.");
                 // Force regeneration based on saved settings AFTER confirmation
                  GRID_SIZE = loadedData.gridSize;
                  NUM_DELIVERIES = loadedData.numDeliveries;
                  gridSizeSelect.value = GRID_SIZE; // Update UI dropdowns
                  numDeliveriesSelect.value = NUM_DELIVERIES;
                  init(false); // Re-init map without obstacles, keep q-table false for now
            }

            qTable = loadedData.qTable || {};
            bestRoute = loadedData.bestRoute || [];
            bestRouteCost = loadedData.bestRouteCost === undefined ? Infinity : loadedData.bestRouteCost;
            recalculateGlobalMinMaxQ(); // Not used but keep for consistency
            resetSimulationStats(); // Reset episode, etc. but keep Q-table
            epsilon = EPSILON_MIN; // Assume loaded policy is trained
            setStatus("Policy Loaded. Epsilon set low.", "idle");
            updateInfoDisplay();
            requestAnimationFrame(draw); // Draw the loaded state & best route
        } catch (e) { console.error("Load failed:", e); setStatus("Error loading policy.", "error"); alert("Could not load policy."); }
    }

    // --- Initial Setup & Resize ---
    init(true);
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

}); // End DOMContentLoaded
