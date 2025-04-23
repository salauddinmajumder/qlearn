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
    // Algorithm Params ... (keep references)
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
     // Persistence ... (keep references)
     const saveQTableBtn = document.getElementById('saveQTableBtn');
     const loadQTableBtn = document.getElementById('loadQTableBtn');
    // Main Controls ... (keep references)
    const speedSlider = document.getElementById('speed');
    const speedValueSpan = document.getElementById('speedValue');
    const startTrainingBtn = document.getElementById('startTrainingBtn');
    const pauseTrainingBtn = document.getElementById('pauseTrainingBtn');
    const stopTrainingBtn = document.getElementById('stopTrainingBtn');
    const showRouteBtn = document.getElementById('showRouteBtn'); // Renamed from runGreedyBtn
    // Visualization ... (keep references)
    const showCurrentPathCheckbox = document.getElementById('showCurrentPath');
    const showTruckCheckbox = document.getElementById('showTruck');
    const showFinalRouteCheckbox = document.getElementById('showFinalRoute');
    // Info Panel ... (keep references)
    const statusDisplay = document.getElementById('statusDisplay');
    const episodeDisplay = document.getElementById('episodeDisplay');
    const totalEpisodesDisplay = document.getElementById('totalEpisodesDisplay');
    const destLeftDisplay = document.getElementById('destLeftDisplay');
    const epsilonDisplay = document.getElementById('epsilonDisplay');
    const rewardDisplay = document.getElementById('rewardDisplay');
    const avgRewardDisplay = document.getElementById('avgRewardDisplay');
    const bestRouteCostDisplay = document.getElementById('bestRouteCostDisplay');
    const qTableSizeDisplay = document.getElementById('qTableSizeDisplay');
    // Chart ... (keep reference)
    const rewardChartCanvas = document.getElementById('rewardChart');

    // --- Configuration & Constants ---
    let GRID_SIZE = 10;
    let NUM_DELIVERIES = 0; // Start with 0, set by placement or generate
    const MAX_ALLOWED_DELIVERIES = 7; // Limit for performance
    let CELL_SIZE = 0;
    const REWARD_SUCCESSFUL_RETURN = 200;
    const COST_PER_DISTANCE_UNIT = 1;
    const REWARD_WALL_HIT = -5; // Not used in this version but kept

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
    // ... (Keep getCssVar, isValid, manhattanDistance, resizeCanvas, getStateString) ...
    function resizeCanvas() { /* ... (Keep previous robust resizeCanvas) ... */
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

    // --- Initialization ---
    function init(generateNewMap = true, resetLearning = true) {
        console.log(`--- Init (Generate: ${generateNewMap}, ResetLearn: ${resetLearning}) ---`);
        setStatus('Initializing...', 'initializing');
        stopSimulationLoop();

        // 1. Read Grid Size & Params
        GRID_SIZE = parseInt(gridSizeSelect.value);
        updateAlgorithmParamsFromUI(); // Read learning params

        // 2. Resize Canvas & Calc CELL_SIZE
        if (!resizeCanvas() && (CELL_SIZE <= 0 || canvas.width === 0)) {
             console.warn("Forcing CELL_SIZE calculation in init.");
             if (canvas.width > 0 && GRID_SIZE > 0) { CELL_SIZE = canvas.width / GRID_SIZE; }
             else { canvas.width = 300; canvas.height = 300; GRID_SIZE = 10; gridSizeSelect.value = GRID_SIZE; CELL_SIZE = canvas.width / GRID_SIZE; }
             if (CELL_SIZE <= 0) { setStatus("Error: Canvas setup failed", "error"); return; }
        }
         console.log(`Init: Grid=${GRID_SIZE}, Cell=${CELL_SIZE.toFixed(2)}`);

        // 3. Setup Locations
        if (generateNewMap) {
            placeLocationsRandomly(); // Place depot and deliveries randomly
        } else {
             // Keep existing locations, just ensure validity and update allLocations
             updateAllLocations();
             if (!depotLocation || deliveryLocations.length === 0) {
                  console.warn("Kept locations, but depot or deliveries missing. Regenerating.");
                  placeLocationsRandomly(); // Fallback to random if kept locations are invalid
             }
        }
         if (!depotLocation || deliveryLocations.length === 0) {
              setStatus("Error: Location setup failed", "error"); simulationState = 'error'; updateButtonStates(); return;
         }
         NUM_DELIVERIES = deliveryLocations.length; // Update based on actual placements
         numDeliveriesDisplay.value = NUM_DELIVERIES;
         nextDeliveryIndexToPlace = NUM_DELIVERIES + 1; // Next index if user adds more


        // 4. Initialize Learning State
        if (resetLearning) { initQTable(); resetSimulationStats(); bestRouteCost = Infinity; bestRoute = []; }
        else { resetSimulationStats(); } // Keep Q-table

        // 5. Final UI Updates & Draw
        updateButtonStates();
        setStatus('Ready.', 'idle');
        requestAnimationFrame(draw); // Draw initial state
        console.log("--- Initialization Complete ---");
    }

    function placeLocationsRandomly() {
        console.log(`Placing ${MAX_ALLOWED_DELIVERIES} max random locations...`); // Aim for max, then adjust NUM_DELIVERIES
        deliveryLocations = []; allLocations = []; const placedCoords = new Set(); depotLocation = null;

        // Place Depot
        depotLocation = findRandomClearCell(null, placedCoords) || {r:0, c:0}; // Find any or default
        if(depotLocation) { placedCoords.add(`${depotLocation.r},${depotLocation.c}`); allLocations.push(depotLocation); }
        else { console.error("Failed to place Depot!"); return false; }
        console.log("Depot placed at:", depotLocation);

        // Place Deliveries (up to max allowed initially)
        let attempts = 0; const maxAttempts = GRID_SIZE * GRID_SIZE * 3;
        while (deliveryLocations.length < MAX_ALLOWED_DELIVERIES && attempts < maxAttempts) {
            const loc = findRandomClearCell(null, placedCoords);
            if (loc) {
                 deliveryLocations.push(loc); allLocations.push(loc); placedCoords.add(`${loc.r},${loc.c}`);
            } else { break; } // No more clear cells
            attempts++;
        }
        console.log(`Placed ${deliveryLocations.length} random deliveries.`);
        resetAgent(); return true;
    }

     function findRandomClearCell(excludePos = null, placedCoordsSet) { /* ... (same as before) ... */
         const clearCells = [];
         for (let r = 0; r < GRID_SIZE; r++) {
             for (let c = 0; c < GRID_SIZE; c++) {
                  const coordString = `${r},${c}`;
                 if (isValid(r, c) && (!excludePos || r !== excludePos.r || c !== excludePos.c) && !placedCoordsSet.has(coordString)) { clearCells.push({ r, c }); }
             }
         }
         return clearCells.length > 0 ? clearCells[Math.floor(Math.random() * clearCells.length)] : null;
     }

     // Update allLocations based on depot and deliveryLocations
     function updateAllLocations() {
         allLocations = [];
         if (depotLocation) allLocations.push(depotLocation);
         allLocations = allLocations.concat(deliveryLocations);
     }

     // Clear placed deliveries for manual placement
     function clearDeliveriesAction() {
         if (simulationState !== 'idle' && simulationState !== 'stopped' && simulationState !== 'error') return;
         depotLocation = null;
         deliveryLocations = [];
         allLocations = [];
         NUM_DELIVERIES = 0;
         numDeliveriesDisplay.value = NUM_DELIVERIES;
         nextDeliveryIndexToPlace = 1;
         initQTable();
         resetSimulationStats();
         bestRoute = []; bestRouteCost = Infinity; // Clear best route too
         setStatus("Cleared locations. Place Depot (D) and Deliveries (1, 2...).", "idle");
         requestAnimationFrame(draw);
     }

    function initQTable() { qTable = {}; globalMinQ = 0; globalMaxQ = 0; }
    function resetSimulationStats() { /* ... (same as before) ... */
        currentEpisode = 0; episodeCost = 0; epsilon = EPSILON_START; recentCosts = [];
        initChart(); resetAgent(); updateInfoDisplay();
    }
    function resetAgent() { /* ... (same as before, handles potentially null depot) ... */
        currentLocationIndex = 0; // Start at depot index
        // Recreate the set based on the *current* number of deliveries
        NUM_DELIVERIES = deliveryLocations.length;
        remainingDeliveries = new Set(Array.from({ length: NUM_DELIVERIES }, (_, i) => i + 1));
        episodeCost = 0;
        episodeRoute = depotLocation ? [0] : [];
        currentStep = 0;
    }


    // --- Drawing Functions ---
    // ... (Keep draw, drawMapBackground, drawLocations, drawMarker, drawTruck, drawRoute - ensure they check validity) ...
     function draw() {
        if (!ctx || CELL_SIZE <= 0 || canvas.width <= 0 || canvas.height <= 0) { return; }
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
        } catch (e) { console.error("Error during drawing:", e); setStatus("Error: Drawing Failed", "error"); stopSimulationLoop(); }
    }

    // --- Q-Learning Logic ---
    // ... (Keep getValidActions, getQValue, chooseAction, updateQTable, getValidActionsFromString) ...

    // --- Simulation Step & Loop ---
    // ... (Keep runSingleStep, handleEpisodeEnd, simulationLoop, stopSimulationLoop) ...
    function handleEpisodeEnd(succeeded) {
        const wasTraining = simulationState === 'training'; const wasStepping = simulationState === 'stepping'; const wasGreedy = simulationState === 'greedy';
        if (succeeded && (wasTraining || wasStepping)) {
             recentCosts.push(episodeCost); if (recentCosts.length > COST_AVERAGE_WINDOW) recentCosts.shift();
             updateChart(); if (epsilon > EPSILON_MIN) epsilon *= EPSILON_DECAY;
        }
        if (succeeded && episodeCost < bestRouteCost) { bestRouteCost = episodeCost; bestRoute = [...episodeRoute]; console.log(`New best: Cost ${bestRouteCost.toFixed(0)}`, bestRoute); }
        if (wasTraining) {
            currentEpisode++; if (currentEpisode >= MAX_EPISODES) {
                setStatus(`Training Finished (Max Ep.). Calculating Best Route...`, 'finished'); // Indicate calculation
                stopSimulationLoop(); // Stop the training loop
                setTimeout(() => { // Calculate after state update
                    bestRoute = findBestRouteFromQTable() || bestRoute; // Calculate and potentially update
                    if(bestRoute?.length > 1) bestRouteCost = calculateRouteCost(bestRoute);
                    setStatus(`Training Finished. Best Cost: ${bestRouteCost === Infinity ? 'N/A' : bestRouteCost.toFixed(0)}`, 'finished');
                    updateInfoDisplay();
                    requestAnimationFrame(draw); // Draw the final route
                }, 10);
            } else { resetAgent(); }
        } else if (wasStepping) { setStatus(`Episode End (${succeeded ? 'Success' : 'Stopped'}). Paused.`, 'paused'); simulationState = 'paused'; updateButtonStates(); resetAgent(); }
        else if (wasGreedy) { if (succeeded) { setStatus(`Route Found. Cost: ${episodeCost.toFixed(0)}.`, 'finished'); bestRoute = [...episodeRoute]; bestRouteCost = episodeCost; } else { setStatus(`Greedy Run Failed/Stopped.`, 'stopped'); } stopSimulationLoop(); }
        else { resetAgent(); }
        if (!wasGreedy) { episodeCost = 0; } updateInfoDisplay();
    }


    // --- Simulation Control Actions ---
    function startTrainingAction() {
         if (simulationState === 'training') return;
         // Ensure depot and at least one delivery exist
         if (!depotLocation || deliveryLocations.length === 0) {
              alert("Please place a Depot (D) and at least one Delivery (1) location on the map first.");
              return;
         }
         const resuming = simulationState === 'paused';
         if (!resuming) { initQTable(); resetSimulationStats(); bestRouteCost = Infinity; bestRoute = []; epsilon = EPSILON_START; setStatus('Training Started...', 'training'); }
         else { setStatus('Training Resumed...', 'training'); }
         simulationState = 'training'; updateButtonStates();
         if (!animationFrameId) { lastTimestamp = performance.now(); timeAccumulator = 0; animationFrameId = requestAnimationFrame(simulationLoop); }
    }
    function pauseTrainingAction() { /* ... (same) ... */ }
    function stopAction() { stopSimulationLoop(); }
    function showRouteAction() { // Renamed from greedyAction
        if (simulationState === 'training' || simulationState === 'greedy') return; // Don't interrupt
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
    // ... (Keep findBestRouteFromQTable, calculateRouteCost) ...

    // --- Charting ---
    // ... (Keep initChart, updateChart) ...

    // --- UI Updates & Event Handlers ---
    function updateButtonStates() { /* ... (same logic, ensure runGreedyBtn renamed to showRouteBtn is handled) ... */
        const isIdle = simulationState === 'idle' || simulationState === 'stopped' || simulationState === 'error';
        const isPaused = simulationState === 'paused';
        const isTrainingActive = simulationState === 'training';
        const isRunning = !isIdle && !isPaused;

        startTrainingBtn.disabled = isTrainingActive || simulationState === 'error';
        startTrainingBtn.innerHTML = (isPaused) ? '▶<span> Resume</span>' : '▶<span> Train</span>';
        pauseTrainingBtn.disabled = !isTrainingActive;
        stopTrainingBtn.disabled = isIdle || simulationState === 'error';
        showRouteBtn.disabled = isRunning || simulationState === 'error';

        const settingsDisabled = !isIdle; // Disable settings unless fully idle/stopped/error
        gridSizeSelect.disabled = settingsDisabled;
        // numDeliveriesDisplay is readonly, no need to disable
        resetEnvBtn.disabled = settingsDisabled; // Generate Button
        clearDeliveriesBtn.disabled = settingsDisabled; // Clear Button
        learningRateSlider.disabled = settingsDisabled; discountFactorSlider.disabled = settingsDisabled;
        epsilonStartSlider.disabled = settingsDisabled; epsilonDecaySlider.disabled = settingsDisabled;
        epsilonMinSlider.disabled = settingsDisabled; maxEpisodesInput.disabled = settingsDisabled;
        resetQTableBtn.disabled = settingsDisabled;
        saveQTableBtn.disabled = isRunning; loadQTableBtn.disabled = isRunning;
        editModeRadios.forEach(radio => radio.disabled = settingsDisabled);
        canvas.classList.toggle('edit-mode-depot', !settingsDisabled && currentEditMode === 'depot');
        canvas.classList.toggle('edit-mode-delivery', !settingsDisabled && currentEditMode === 'delivery');
    }
    function updateInfoDisplay() { /* ... (same logic) ... */
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
    function setStatus(message, className = '') { /* ... (same logic) ... */
        statusDisplay.textContent = message; statusDisplay.className = className;
    }
    function updateUIParameterValues() { /* ... (Read only algorithm params from UI) ... */
         LEARNING_RATE = parseFloat(learningRateSlider.value); learningRateValueSpan.textContent = LEARNING_RATE.toFixed(2);
         DISCOUNT_FACTOR = parseFloat(discountFactorSlider.value); discountFactorValueSpan.textContent = DISCOUNT_FACTOR.toFixed(2);
         EPSILON_START = parseFloat(epsilonStartSlider.value); epsilonStartValueSpan.textContent = EPSILON_START.toFixed(2);
         EPSILON_DECAY = parseFloat(epsilonDecaySlider.value); epsilonDecayValueSpan.textContent = EPSILON_DECAY.toFixed(4);
         EPSILON_MIN = parseFloat(epsilonMinSlider.value); epsilonMinValueSpan.textContent = EPSILON_MIN.toFixed(2);
         MAX_EPISODES = parseInt(maxEpisodesInput.value); totalEpisodesDisplay.textContent = MAX_EPISODES;
         updateSpeedDisplay(speedSlider.value);
    }
     function updateSpeedDisplay(value) { /* ... (same logic) ... */
         const speedVal = parseInt(value); let speedText = 'Medium';
         if (speedVal >= 990) speedText = 'Max'; else if (speedVal > 750) speedText = 'Very Fast'; else if (speedVal > 500) speedText = 'Fast';
         else if (speedVal > 250) speedText = 'Medium'; else if (speedVal > 50) speedText = 'Slow'; else speedText = 'Very Slow';
         speedValueSpan.textContent = speedText; stepDelay = 1000 - speedVal;
     }
     function updateAlgorithmParamsFromUI() { /* ... (same) ... */
          LEARNING_RATE = parseFloat(learningRateSlider.value); DISCOUNT_FACTOR = parseFloat(discountFactorSlider.value);
          EPSILON_START = parseFloat(epsilonStartSlider.value); EPSILON_DECAY = parseFloat(epsilonDecaySlider.value);
          EPSILON_MIN = parseFloat(epsilonMinSlider.value); MAX_EPISODES = parseInt(maxEpisodesInput.value);
     }

    // --- Event Listeners ---
    gridSizeSelect.addEventListener('change', (e) => { init(true); });
    // numDeliveriesSelect removed, using display only
    generateMapBtn.addEventListener('click', () => init(true)); // Use renamed button
    clearDeliveriesBtn.addEventListener('click', clearDeliveriesAction); // Add listener for new button
    editModeRadios.forEach(radio => { radio.addEventListener('change', (e) => {
        currentEditMode = e.target.value;
        // Update canvas cursor class based on mode
        canvas.classList.toggle('edit-mode-depot', currentEditMode === 'depot');
        canvas.classList.toggle('edit-mode-delivery', currentEditMode === 'delivery');
        });
    });

    // ... (Keep listeners for Algorithm Params, Persistence, Main Controls, Visualization Toggles) ...
    resetQTableBtn.addEventListener('click', () => { if (confirm("Reset all learning progress (Q-Table)?")) { initQTable(); resetSimulationStats(); setStatus("Learning Reset.", "idle"); requestAnimationFrame(draw); } });
    saveQTableBtn.addEventListener('click', saveQTable); loadQTableBtn.addEventListener('click', loadQTable);
    speedSlider.addEventListener('input', (e) => { updateSpeedDisplay(e.target.value); });
    startTrainingBtn.addEventListener('click', startTrainingAction); pauseTrainingBtn.addEventListener('click', pauseTrainingAction); stopTrainingBtn.addEventListener('click', stopAction);
    showRouteBtn.addEventListener('click', showRouteAction); // Use renamed button/function
    showCurrentPathCheckbox.addEventListener('change', () => requestAnimationFrame(draw)); showTruckCheckbox.addEventListener('change', () => requestAnimationFrame(draw)); showFinalRouteCheckbox.addEventListener('change', () => requestAnimationFrame(draw));

    // Re-enable Canvas Interaction
    canvas.addEventListener('click', handleCanvasClick);

    // --- Canvas Interaction Logic ---
    function handleCanvasClick(e) {
         if (simulationState !== 'idle' && simulationState !== 'stopped' && simulationState !== 'error') {
              console.log("Map editing disabled while simulation is active."); return;
         }
         if (currentEditMode === 'none') return; // Exit if not in edit mode

         const rect = canvas.getBoundingClientRect();
         const x = e.clientX - rect.left; const y = e.clientY - rect.top;
         const c = Math.floor(x / CELL_SIZE); const r = Math.floor(y / CELL_SIZE);

         if (!isValid(r, c)) return; // Click outside grid

         let locationsChanged = false;
         const clickedCoordString = `${r},${c}`;

         // Check if clicking on an existing location
         let existingIndex = -1;
         if (depotLocation && depotLocation.r === r && depotLocation.c === c) existingIndex = 0;
         else existingIndex = deliveryLocations.findIndex(loc => loc.r === r && loc.c === c) + 1; // +1 to match delivery index

         switch (currentEditMode) {
             case 'depot':
                 if (existingIndex !== -1 && existingIndex !== 0) { // Clicked on a delivery location
                      alert("Cannot place Depot on an existing Delivery location."); return;
                 }
                 depotLocation = { r, c };
                 console.log("Depot manually set to:", depotLocation);
                 locationsChanged = true;
                 break;

             case 'delivery':
                 if (existingIndex === 0) { // Clicked on Depot
                      alert("Cannot place Delivery on the Depot location."); return;
                 }
                 if (existingIndex > 0) { // Clicked on existing delivery - Move it (or delete?) Let's move.
                     // No action needed to move currently, just note it exists
                     console.log(`Clicked on existing Delivery ${existingIndex}. To move, place it elsewhere.`);
                     // OR Implement delete on second click? Simpler to just place new ones.
                 } else { // Clicked on empty cell - Add new delivery
                     if (deliveryLocations.length >= MAX_ALLOWED_DELIVERIES) {
                          alert(`Maximum number of deliveries (${MAX_ALLOWED_DELIVERIES}) reached.`); return;
                     }
                     const newLoc = { r, c };
                     deliveryLocations.push(newLoc);
                     console.log(`Delivery ${deliveryLocations.length} manually placed at:`, newLoc);
                     locationsChanged = true;
                 }
                 break;
         }

         if (locationsChanged) {
             updateAllLocations(); // Rebuild the combined list
             NUM_DELIVERIES = deliveryLocations.length; // Update count
             numDeliveriesDisplay.value = NUM_DELIVERIES; // Update display
             nextDeliveryIndexToPlace = NUM_DELIVERIES + 1;
             initQTable(); // Learning is invalidated
             resetSimulationStats();
             bestRoute = []; bestRouteCost = Infinity; // Clear best route
             setStatus("Locations changed. Learning Reset.", "idle");
             requestAnimationFrame(draw); // Redraw with new locations
         }
     }
     // Remove mousemove/out handlers and cellinfobox update if not needed
     function handleCanvasMouseMove(e) { /* Stub */ }
     function handleCanvasMouseOut() { /* Stub */ }
     function updateCellInfoBox(r, c) { /* Stub */ }

    // --- Persistence ---
    function saveQTable() { /* ... (same, uses v2 key) ... */ }
    function loadQTable() { /* ... (same, uses v2 key, validates gridSize/numDeliveries) ... */ }


    // --- Initial Setup & Resize Handling ---
    console.log("DOM Loaded. Starting initialization...");
    init(true); // Initial call to setup everything
    window.addEventListener('resize', resizeCanvas); // Add resize listener
    console.log("Initial setup complete. Waiting for user interaction or training start.");

}); // End DOMContentLoaded
