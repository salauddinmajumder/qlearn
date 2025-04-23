document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');
    const cellInfoBox = document.getElementById('cellInfoBox');
    // Settings Panel
    const gridSizeSelect = document.getElementById('gridSize');
    const obstacleProbSlider = document.getElementById('obstacleProb');
    const obstacleProbValueSpan = document.getElementById('obstacleProbValue');
    const editModeRadios = document.querySelectorAll('input[name="editMode"]');
    const resetEnvBtn = document.getElementById('resetEnvBtn');
    const clearObstaclesBtn = document.getElementById('clearObstaclesBtn');
    // Algorithm Parameters Panel
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
     // Persistence Panel
     const saveQTableBtn = document.getElementById('saveQTableBtn');
     const loadQTableBtn = document.getElementById('loadQTableBtn');
    // Main Controls
    const speedSlider = document.getElementById('speed');
    const speedValueSpan = document.getElementById('speedValue');
    const startTrainingBtn = document.getElementById('startTrainingBtn');
    const pauseTrainingBtn = document.getElementById('pauseTrainingBtn');
    const stopTrainingBtn = document.getElementById('stopTrainingBtn');
    const stepBtn = document.getElementById('stepBtn');
    const runGreedyBtn = document.getElementById('runGreedyBtn');
    // Visualization Panel
    const showQArrowsCheckbox = document.getElementById('showQArrows');
    const showPolicyArrowsCheckbox = document.getElementById('showPolicyArrows');
    const showHeatmapCheckbox = document.getElementById('showHeatmap');
    const showPathCheckbox = document.getElementById('showPath');
    const showAgentTrailCheckbox = document.getElementById('showAgentTrail');
    // Info Panel
    const statusDisplay = document.getElementById('statusDisplay');
    const episodeDisplay = document.getElementById('episodeDisplay');
    const totalEpisodesDisplay = document.getElementById('totalEpisodesDisplay');
    const stepsDisplay = document.getElementById('stepsDisplay');
    const epsilonDisplay = document.getElementById('epsilonDisplay');
    const rewardDisplay = document.getElementById('rewardDisplay');
    const avgRewardDisplay = document.getElementById('avgRewardDisplay');
    const globalMaxQDisplay = document.getElementById('globalMaxQDisplay');
    const globalMinQDisplay = document.getElementById('globalMinQDisplay');
    const qTableSizeDisplay = document.getElementById('qTableSizeDisplay');
    // Chart
    const rewardChartCanvas = document.getElementById('rewardChart');

    // --- Configuration & Constants ---
    let GRID_SIZE = parseInt(gridSizeSelect.value);
    let OBSTACLE_PROB = parseInt(obstacleProbSlider.value) / 100;
    let CELL_SIZE = canvas.width / GRID_SIZE; // Initial calculation

    const REWARD_GOAL = 100;
    const REWARD_OBSTACLE = -100;
    const REWARD_STEP = -1;
    const REWARD_WALL_HIT = -5;

    const ACTIONS = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 };
    const ACTION_DELTAS = [ { r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 } ];
    const ACTION_NAMES = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const ACTION_ARROWS = ['↑', '↓', '←', '→'];

    // --- Q-Learning Parameters ---
    let LEARNING_RATE = parseFloat(learningRateSlider.value);
    let DISCOUNT_FACTOR = parseFloat(discountFactorSlider.value);
    let EPSILON_START = parseFloat(epsilonStartSlider.value);
    let EPSILON_DECAY = parseFloat(epsilonDecaySlider.value);
    let EPSILON_MIN = parseFloat(epsilonMinSlider.value);
    let MAX_EPISODES = parseInt(maxEpisodesInput.value);
    let MAX_STEPS_PER_EPISODE = GRID_SIZE * GRID_SIZE * 2.5;

    // --- State Variables ---
    let grid = [];
    let qTable = {};
    let startPos = { r: -1, c: -1 };
    let goalPos = { r: -1, c: -1 };
    let agentPos = { r: -1, c: -1 };
    let currentEpisode = 0;
    let currentStep = 0;
    let episodeReward = 0;
    let episodePath = [];
    let agentTrail = [];
    const MAX_TRAIL_LENGTH = 15;

    let simulationState = 'idle'; // idle, training, paused, stepping, greedy, stopped, error
    let animationFrameId = null;
    let lastTimestamp = 0;
    let stepDelay = 1000 - parseInt(speedSlider.value);
    let timeAccumulator = 0;
    let currentEditMode = 'none';

    let recentRewards = [];
    const REWARD_AVERAGE_WINDOW = 100;
    let globalMaxQ = 0; // Initialize to 0
    let globalMinQ = 0;
    let rewardChart;


    // --- Utility Functions ---
    function getCssVar(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }
    function stateToIndex(r, c) { return r * GRID_SIZE + c; }
    function isValid(r, c) { return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpColor(hexA, hexB, t) {
        const rA = parseInt(hexA.slice(1, 3), 16), gA = parseInt(hexA.slice(3, 5), 16), bA = parseInt(hexA.slice(5, 7), 16);
        const rB = parseInt(hexB.slice(1, 3), 16), gB = parseInt(hexB.slice(3, 5), 16), bB = parseInt(hexB.slice(5, 7), 16);
        const r = Math.round(lerp(rA, rB, t)).toString(16).padStart(2, '0');
        const g = Math.round(lerp(gA, gB, t)).toString(16).padStart(2, '0');
        const b = Math.round(lerp(bA, bB, t)).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
    function getHeatmapColor(value) { // 5-point gradient
        const COLORS = [getCssVar('--heatmap-0'), getCssVar('--heatmap-25'), getCssVar('--heatmap-50'), getCssVar('--heatmap-75'), getCssVar('--heatmap-100')];
        value = Math.max(0, Math.min(1, value));
        const scaledValue = value * (COLORS.length - 1);
        const index = Math.floor(scaledValue);
        const t = scaledValue - index;
        return index >= COLORS.length - 1 ? COLORS[COLORS.length - 1] : lerpColor(COLORS[index], COLORS[index + 1], t);
    }
     function resizeCanvas() {
        // Make canvas maintain aspect ratio and fit container
        const container = document.querySelector('.canvas-container');
        const containerWidth = container.clientWidth - 32; // Account for padding
        const containerHeight = container.clientHeight - 32; // Rough estimate

        // Calculate max size based on container, maintaining aspect ratio
        const canvasSize = Math.min(containerWidth, containerHeight, 600); // Max size 600px

        canvas.width = canvasSize;
        canvas.height = canvasSize;
        CELL_SIZE = canvas.width / GRID_SIZE;
        // Redraw after resize if needed
        if (simulationState === 'idle' || simulationState === 'paused' || simulationState === 'stopped') {
            requestAnimationFrame(draw); // Use rAF for potential debouncing
        }
    }


    // --- Initialization ---
    function init(resetLearning = true) {
        console.log("Initializing Simulation...");
        setStatus('Initializing...', 'initializing');
        stopSimulationLoop(); // Stop any existing loop first

        CELL_SIZE = canvas.width / GRID_SIZE; // Recalculate cell size
        MAX_STEPS_PER_EPISODE = GRID_SIZE * GRID_SIZE * 2.5;
        totalEpisodesDisplay.textContent = MAX_EPISODES;

        initGrid(true); // Generate obstacles and place S/G

        if (resetLearning) {
            initQTable();
            resetSimulationStats(); // Resets episode, steps, epsilon, chart
        } else {
             // Keep existing Q-table, just reset stats for new run
             resetSimulationStats();
             // Update global min/max based on existing table
             recalculateGlobalMinMaxQ();
        }

        updateUIParameterValues(); // Sync UI sliders/inputs
        updateButtonStates();
        setStatus('Ready.', 'idle');
        requestAnimationFrame(draw); // Draw initial state
        console.log("Initialization Complete.");
    }

    function initGrid(generateObstacles = true) {
        grid = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(0));
        if (generateObstacles) {
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (Math.random() < OBSTACLE_PROB) grid[r][c] = -1;
                }
            }
        }
        placeStartGoal(); // This also calls resetAgent
    }

    function placeStartGoal() {
        const defaultStart = { r: 0, c: 0 };
        const defaultGoal = { r: GRID_SIZE - 1, c: GRID_SIZE - 1 };
        let foundStart = false, foundGoal = false;

        // Try default Start
        if (isValid(defaultStart.r, defaultStart.c) && grid[defaultStart.r][defaultStart.c] === 0) {
            startPos = defaultStart; foundStart = true;
        } else { // Find random clear start
            startPos = findRandomClearCell();
            if (startPos) foundStart = true;
        }
        if (startPos) grid[startPos.r][startPos.c] = 0;

        // Try default Goal (if different from start)
        if (isValid(defaultGoal.r, defaultGoal.c) && grid[defaultGoal.r][defaultGoal.c] === 0 && (!startPos || defaultGoal.r !== startPos.r || defaultGoal.c !== startPos.c)) {
            goalPos = defaultGoal; foundGoal = true;
        } else { // Find random clear goal (different from start)
            goalPos = findRandomClearCell(startPos);
            if (goalPos) foundGoal = true;
        }
         if (goalPos) grid[goalPos.r][goalPos.c] = 0;


        if (!foundStart || !foundGoal) {
            console.error("FATAL: Could not place Start or Goal position!");
            setStatus("Error: Cannot place S/G", "error");
            simulationState = 'error'; updateButtonStates(); // Halt
            startPos = {r:-1, c:-1}; goalPos = {r:-1, c:-1}; // Invalidate
        }
        resetAgent();
    }

     function findRandomClearCell(excludePos = null) {
         const clearCells = [];
         for (let r = 0; r < GRID_SIZE; r++) {
             for (let c = 0; c < GRID_SIZE; c++) {
                 if (grid[r][c] === 0 && (!excludePos || r !== excludePos.r || c !== excludePos.c)) {
                     clearCells.push({ r, c });
                 }
             }
         }
         return clearCells.length > 0 ? clearCells[Math.floor(Math.random() * clearCells.length)] : null;
     }

    function initQTable() {
        qTable = {};
        globalMinQ = 0;
        globalMaxQ = 0;
    }
     function recalculateGlobalMinMaxQ() {
         globalMinQ = 0; globalMaxQ = 0;
         for (const stateIdx in qTable) {
             qTable[stateIdx].forEach(q => {
                 if (q < globalMinQ) globalMinQ = q;
                 if (q > globalMaxQ) globalMaxQ = q;
             });
         }
         if (Object.keys(qTable).length === 0) { globalMinQ = 0; globalMaxQ = 0; }
     }


    function resetSimulationStats() {
        currentEpisode = 0;
        episodeReward = 0;
        epsilon = EPSILON_START;
        recentRewards = [];
        initChart(); // Reinitialize chart
        resetAgent(); // Resets path, trail, step count, agent position
        updateInfoDisplay();
    }

    function resetAgent() {
         currentStep = 0; // Step within episode
         episodeReward = 0; // Reset reward for the current/next episode run
         if (startPos && isValid(startPos.r, startPos.c)) {
             agentPos = { ...startPos };
         } else {
             // Try to find *any* clear cell if startPos is somehow invalid
             const fallbackStart = findRandomClearCell();
             if (fallbackStart) {
                  startPos = fallbackStart;
                  agentPos = { ...startPos };
                  console.warn("Start position was invalid, reset to a random clear cell.");
             } else {
                  console.error("Cannot reset agent, no valid start or clear cells!");
                  setStatus("Error: Agent reset failed", "error");
                  simulationState = 'error'; updateButtonStates();
                  agentPos = {r:-1, c:-1}; // Invalidate
                  return;
             }
         }
         episodePath = [{ ...agentPos }];
         agentTrail = [];
    }

    // --- Drawing Functions ---
    function draw() {
        // Check if canvas context is valid
        if (!ctx) {
            console.error("Canvas context is not available.");
            return;
        }
        // Clear canvas safely
        try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.error("Error clearing canvas:", e);
            return; // Stop drawing if clear fails
        }

        drawGridBase();
        if (showAgentTrailCheckbox.checked) drawTrail();
        if (showPathCheckbox.checked) drawPath();
        drawAgent();
    }


    function drawGridBase() {
        const showHeatmap = showHeatmapCheckbox.checked;
        const showQ = showQArrowsCheckbox.checked;
        const showPolicy = showPolicyArrowsCheckbox.checked;
        const qRange = (globalMaxQ > globalMinQ + 1e-6) ? globalMaxQ - globalMinQ : 1; // Avoid near-zero range

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (!isValid(r, c)) continue; // Skip invalid cells just in case

                const stateIdx = stateToIndex(r, c);
                const isStart = startPos && r === startPos.r && c === startPos.c;
                const isGoal = goalPos && r === goalPos.r && c === goalPos.c;
                const isObstacle = grid[r][c] === -1;
                const qValues = qTable[stateIdx] || [0, 0, 0, 0];
                const maxQ = Math.max(...qValues);

                // 1. Cell Background
                let cellColor = getCssVar('--cell-empty');
                if (showHeatmap && !isObstacle && qTable[stateIdx]) {
                    const normalizedValue = qRange > 1e-6 ? (maxQ - globalMinQ) / qRange : 0.5;
                    cellColor = getHeatmapColor(Math.max(0, Math.min(1, normalizedValue)));
                }
                ctx.fillStyle = cellColor;
                ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);

                // 2. Obstacles / Start / Goal Markers
                if (isObstacle) { /* ... Draw obstacle ... */
                     ctx.fillStyle = getCssVar('--cell-obstacle');
                     ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                } else if (isStart) { /* ... Draw Start ... */
                     ctx.fillStyle = getCssVar('--cell-start');
                     ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                     drawMarkerText(r, c, 'S');
                } else if (isGoal) { /* ... Draw Goal ... */
                     ctx.fillStyle = getCssVar('--cell-goal');
                     ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                     drawMarkerText(r, c, 'G');
                }

                // 3. Grid Lines (Draw last to be on top)
                ctx.strokeStyle = getCssVar('--grid-line');
                ctx.lineWidth = 1;
                ctx.strokeRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);

                // 4. Visualization Arrows
                if (!isObstacle) {
                    if (showQ) drawQArrows(r, c, qValues, qRange);
                    if (showPolicy) drawPolicyArrow(r, c, qValues);
                }
            }
        }
    }
    function drawMarkerText(r, c, text) {
         ctx.fillStyle = '#fff';
         ctx.font = `bold ${Math.max(10, CELL_SIZE * 0.45)}px ${getCssVar('--font-family')}`; // Relative size
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.fillText(text, c * CELL_SIZE + CELL_SIZE / 2, r * CELL_SIZE + CELL_SIZE / 2 + 1);
     }

    function drawAgent() { /* ... (same as before) ... */
        if (!agentPos || !isValid(agentPos.r, agentPos.c)) return;
        const centerX = agentPos.c * CELL_SIZE + CELL_SIZE / 2;
        const centerY = agentPos.r * CELL_SIZE + CELL_SIZE / 2;
        const radius = CELL_SIZE * 0.30;
        ctx.fillStyle = getCssVar('--cell-agent');
        ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    }
    function drawPath() { /* ... (same as before) ... */
         if (episodePath.length < 2) return;
         ctx.strokeStyle = getCssVar('--path-color');
         ctx.lineWidth = Math.max(1.5, CELL_SIZE * 0.08);
         ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
         ctx.moveTo(episodePath[0].c * CELL_SIZE + CELL_SIZE / 2, episodePath[0].r * CELL_SIZE + CELL_SIZE / 2);
         for (let i = 1; i < episodePath.length; i++) { ctx.lineTo(episodePath[i].c * CELL_SIZE + CELL_SIZE / 2, episodePath[i].r * CELL_SIZE + CELL_SIZE / 2); }
         ctx.stroke();
    }
    function drawTrail() { /* ... (same as before) ... */
         const trailColorBase = getCssVar('--trail-color');
         const match = trailColorBase.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
         if (!match) return;
         const [r, g, b] = [match[1], match[2], match[3]];
         for (let i = 0; i < agentTrail.length; i++) {
             const pos = agentTrail[i];
             if (!isValid(pos.r, pos.c)) continue; // Safety check
             const alpha = 0.4 * (i / agentTrail.length);
             ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
             const trailSize = CELL_SIZE * (0.2 + 0.3 * (i / agentTrail.length));
             ctx.fillRect( pos.c * CELL_SIZE + (CELL_SIZE - trailSize) / 2, pos.r * CELL_SIZE + (CELL_SIZE - trailSize) / 2, trailSize, trailSize);
         }
    }
    function drawQArrows(r, c, qValues, qRange) { /* ... (same as before) ... */
        if (qRange < 1e-6) return;
        const centerX = c * CELL_SIZE + CELL_SIZE / 2, centerY = r * CELL_SIZE + CELL_SIZE / 2;
        const baseSize = CELL_SIZE * 0.06, maxLen = CELL_SIZE * 0.35;
        ctx.fillStyle = getCssVar('--q-arrow-color');
        for (let action = 0; action < 4; action++) {
            const q = qValues[action];
            const normalizedQ = qRange > 1e-6 ? (q - globalMinQ) / qRange : 0.5;
            const len = maxLen * Math.max(0, Math.min(1, normalizedQ));
            if (len < 1) continue;
            ctx.beginPath();
            const delta = ACTION_DELTAS[action]; const tipX = centerX + delta.c * len; const tipY = centerY + delta.r * len;
            const perpDx = -delta.r; const perpDy = delta.c;
            const baseCenterX = centerX + delta.c * (len * 0.1); const baseCenterY = centerY + delta.r * (len * 0.1);
            const base1X = baseCenterX + perpDx * baseSize; const base1Y = baseCenterY + perpDy * baseSize;
            const base2X = baseCenterX - perpDx * baseSize; const base2Y = baseCenterY - perpDy * baseSize;
            ctx.moveTo(tipX, tipY); ctx.lineTo(base1X, base1Y); ctx.lineTo(base2X, base2Y); ctx.closePath(); ctx.fill();
        }
    }
    function drawPolicyArrow(r, c, qValues) { /* ... (same as before, uses characters/lines) ... */
        const maxQ = Math.max(...qValues);
        if (maxQ <= globalMinQ + 1e-6 && maxQ >= globalMaxQ - 1e-6) return; // Skip if no preference or all zero
        const bestActions = [];
        for (let i = 0; i < qValues.length; i++) { if (Math.abs(qValues[i] - maxQ) < 1e-6) bestActions.push(i); }
        if (bestActions.length === 4 || bestActions.length === 0) return; // Skip if all/no actions are best
        const bestAction = bestActions[0]; // Simple tie-breaking: take the first
        // Draw character centered
        ctx.fillStyle = getCssVar('--policy-arrow-color');
        ctx.font = `bold ${Math.max(10, CELL_SIZE * 0.5)}px ${getCssVar('--font-family')}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ACTION_ARROWS[bestAction], c * CELL_SIZE + CELL_SIZE / 2, r * CELL_SIZE + CELL_SIZE / 2);
    }


    // --- Q-Learning Logic (Core functions remain similar, ensure checks) ---
    function getQValue(r, c, action) {
        const stateIdx = stateToIndex(r,c);
        if (!qTable[stateIdx]) qTable[stateIdx] = [0, 0, 0, 0];
        return qTable[stateIdx][action];
    }
    function getMaxQValue(r, c) {
        const stateIdx = stateToIndex(r,c);
        return Math.max(...(qTable[stateIdx] || [0, 0, 0, 0]));
    }
    function chooseAction(r, c) {
        const stateIdx = stateToIndex(r,c);
        const qValues = qTable[stateIdx] || [0, 0, 0, 0];
        let action;
        const isExploring = (simulationState === 'training' || simulationState === 'stepping') && Math.random() < epsilon;

        if (isExploring) {
            action = Math.floor(Math.random() * 4);
        } else {
            const maxQ = Math.max(...qValues);
            const bestActions = qValues.reduce((acc, q, idx) => {
                if (Math.abs(q - maxQ) < 1e-6) acc.push(idx);
                return acc;
            }, []);
            action = bestActions.length > 0 ? bestActions[Math.floor(Math.random() * bestActions.length)] : Math.floor(Math.random() * 4); // Fallback random if error
        }
        return action;
    }
    function updateQTable(r, c, action, reward, next_r, next_c, done) {
        const stateIdx = stateToIndex(r,c);
        if (!qTable[stateIdx]) qTable[stateIdx] = [0, 0, 0, 0];

        const currentQ = qTable[stateIdx][action];
        const maxNextQ = done ? 0 : getMaxQValue(next_r, next_c);
        const targetQ = reward + DISCOUNT_FACTOR * maxNextQ;
        const newQ = currentQ + LEARNING_RATE * (targetQ - currentQ);
        qTable[stateIdx][action] = newQ;

        // Update global min/max Q (only if change is significant to avoid drift)
        if (newQ > globalMaxQ) globalMaxQ = newQ;
        else if (newQ < globalMinQ) globalMinQ = newQ;
        // Optimization: Recalculate min/max less frequently if performance is an issue
        // recalculateGlobalMinMaxQ(); // Call less often? e.g. end of episode
    }

    // --- Simulation Step & Loop ---
    function runSingleStep() {
        if (!agentPos || !isValid(agentPos.r, agentPos.c) || !goalPos || !isValid(goalPos.r, goalPos.c)) {
            console.error("Invalid state before step:", agentPos, goalPos);
            setStatus("Error: Invalid state", "error"); stopSimulationLoop(); return;
        }

        const r = agentPos.r, c = agentPos.c;
        const action = chooseAction(r, c);
        const delta = ACTION_DELTAS[action];
        let next_r = r + delta.r, next_c = c + delta.c;
        let reward = REWARD_STEP;
        let done = false;
        let event = 'move';

        // --- Boundary and Obstacle Checks ---
        if (!isValid(next_r, next_c)) {
            reward = REWARD_WALL_HIT; next_r = r; next_c = c; event = 'wall';
        } else if (grid[next_r][next_c] === -1) {
            reward = REWARD_OBSTACLE; done = true; next_r = r; next_c = c; event = 'obstacle'; // Stay before obstacle
        } else if (next_r === goalPos.r && next_c === goalPos.c) {
            reward = REWARD_GOAL; done = true; agentPos = { r: next_r, c: next_c }; event = 'goal';
        } else {
            agentPos = { r: next_r, c: next_c }; // Valid move
        }

        // --- Update Q-Table (if training/stepping) ---
        if (simulationState === 'training' || simulationState === 'stepping') {
            updateQTable(r, c, action, reward, agentPos.r, agentPos.c, done);
        }

        // --- Update Stats & Visuals ---
        episodeReward += reward;
        currentStep++;
        if (episodePath.length === 0 || agentPos.r !== episodePath[episodePath.length - 1].r || agentPos.c !== episodePath[episodePath.length - 1].c) {
            episodePath.push({ ...agentPos });
            agentTrail.push({ ...agentPos });
            if (agentTrail.length > MAX_TRAIL_LENGTH) agentTrail.shift();
        }

        // --- End of Episode Logic ---
        if (done || currentStep >= MAX_STEPS_PER_EPISODE) {
            handleEpisodeEnd(event);
        }
    }

    function handleEpisodeEnd(event) {
        const wasTraining = (simulationState === 'training');
        const wasStepping = (simulationState === 'stepping');
        const wasGreedy = (simulationState === 'greedy');

        if (wasTraining || wasStepping) {
             recentRewards.push(episodeReward);
             if (recentRewards.length > REWARD_AVERAGE_WINDOW) recentRewards.shift();
             updateChart();
             if (epsilon > EPSILON_MIN) epsilon *= EPSILON_DECAY;
             recalculateGlobalMinMaxQ(); // Recalculate bounds at end of episode
        }

        if (wasTraining) {
            currentEpisode++;
            if (currentEpisode >= MAX_EPISODES) {
                setStatus(`Training Finished (Max Ep.).`, 'finished');
                stopSimulationLoop();
            } else {
                 // Prepare for next episode
                 resetAgent();
                 currentStep = 0;
                 episodeReward = 0;
                 // Continue training automatically in renderLoop
            }
        } else if (wasStepping) {
            setStatus(`Episode End (${event}). Paused.`, 'paused');
            simulationState = 'paused'; // Stop stepping
            updateButtonStates();
             resetAgent(); // Reset agent for next potential step/run
             currentStep = 0;
             episodeReward = 0;
        } else if (wasGreedy) {
            setStatus(`Greedy Run Finished (${event}).`, 'finished');
            stopSimulationLoop();
             resetAgent(); // Reset agent for next interaction
             currentStep = 0;
             episodeReward = 0;
        } else {
             // If ended some other way (e.g. stop button), just reset agent
             resetAgent();
             currentStep = 0;
             episodeReward = 0;
        }
    }

    function simulationLoop(timestamp) {
        if (simulationState === 'stopped' || simulationState === 'error') {
            animationFrameId = null; // Ensure loop stops completely
            updateButtonStates(); // Ensure buttons are correct on stop
            return;
        }

        animationFrameId = requestAnimationFrame(simulationLoop); // Request next frame *first*

        const deltaTime = timestamp - (lastTimestamp || timestamp); // Handle first frame
        lastTimestamp = timestamp;

        // Only run steps if not paused or idle
        if (simulationState === 'training' || simulationState === 'greedy') {
             timeAccumulator += deltaTime;
             const effectiveDelay = (speedSlider.value == 1000) ? 0 : stepDelay; // Max speed = 0 delay
             let stepsToTake = 0;

             if (effectiveDelay <= 1) { // Near max speed
                 stepsToTake = Math.min(5, MAX_STEPS_PER_EPISODE - currentStep); // Process multiple steps, limit by remaining steps
             } else {
                 stepsToTake = Math.floor(timeAccumulator / effectiveDelay);
             }

             if (stepsToTake > 0) {
                 timeAccumulator -= stepsToTake * effectiveDelay;
                 for (let i = 0; i < stepsToTake; i++) {
                     if (simulationState !== 'training' && simulationState !== 'greedy') break; // Check state each sub-step
                     runSingleStep();
                 }
                 requestAnimationFrame(draw); // Draw after processing batch
                 updateInfoDisplay();
             }
        } else if (simulationState === 'paused' || simulationState === 'idle') {
             // Only draw occasionally if needed (e.g., after grid edit)
             // Drawing is requested explicitly elsewhere for these states
        }

        // Ensure UI reflects state changes potentially missed if no steps run
         if (simulationState !== 'training' && simulationState !== 'greedy') {
              updateButtonStates();
         }
    }

    function stopSimulationLoop() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        const wasRunning = simulationState !== 'idle' && simulationState !== 'stopped' && simulationState !== 'error';
        simulationState = 'stopped';
        updateButtonStates();
        if (wasRunning) {
            setStatus('Simulation Stopped.', 'stopped');
            // Optional: Reset agent visual state immediately on stop
             resetAgent();
             requestAnimationFrame(draw); // Draw the stopped state
        }
        lastTimestamp = 0; // Reset timestamp for next start
        timeAccumulator = 0;
    }

    // --- Simulation Control Actions ---
    function startTrainingAction() {
        if (simulationState === 'training') return;
        const resuming = simulationState === 'paused';
        if (!resuming) {
            // Don't reset Q-table on start, only on explicit reset button
            resetSimulationStats(); // Reset episode, steps, epsilon, chart
            epsilon = EPSILON_START; // Ensure epsilon starts correctly
             setStatus('Training Started...', 'training');
        } else {
            setStatus('Training Resumed...', 'training');
        }
        simulationState = 'training';
        updateButtonStates();
        if (!animationFrameId) { // Start the loop if not already running
            lastTimestamp = performance.now();
            timeAccumulator = 0;
            animationFrameId = requestAnimationFrame(simulationLoop);
        }
    }

    function pauseTrainingAction() {
        if (simulationState === 'training') {
            simulationState = 'paused';
            setStatus('Training Paused.', 'paused');
            updateButtonStates();
        }
    }

    function stopAction() {
        stopSimulationLoop(); // Use the loop stopping function
    }

    function stepAction() {
        if (simulationState === 'training' || simulationState === 'greedy') return; // Can't step while running fast

        if (simulationState === 'idle' || simulationState === 'stopped') {
             // If starting from idle/stopped, reset episode stats but keep Q-table
             resetAgent();
             currentStep = 0;
             episodeReward = 0;
             // Check if max episodes was reached and needs full reset
             if (currentEpisode >= MAX_EPISODES) {
                  initQTable(); // Reset learning
                  resetSimulationStats();
                  epsilon = EPSILON_START;
                  setStatus("Max episodes reached. Learning Reset.", "idle");
             }
        }
        simulationState = 'stepping'; // Special state for single step logic
        setStatus('Stepping...', 'stepping');
        updateButtonStates(); // Disable other buttons during step

        runSingleStep(); // Execute the step

        // handleEpisodeEnd will manage state transition if episode finishes
        // If episode didn't end, manually set back to paused
        if (simulationState === 'stepping') {
            simulationState = 'paused';
            setStatus('Paused after step.', 'paused');
        }
        requestAnimationFrame(draw); // Ensure redraw after step
        updateInfoDisplay();
        updateButtonStates(); // Re-enable buttons
    }

    function greedyAction() {
        if (simulationState === 'training' || simulationState === 'greedy') return;
        resetAgent();
        currentStep = 0;
        episodeReward = 0;
        simulationState = 'greedy';
        setStatus('Running Greedy Policy...', 'greedy');
        updateButtonStates();
        if (!animationFrameId) {
            lastTimestamp = performance.now();
            timeAccumulator = 0;
            animationFrameId = requestAnimationFrame(simulationLoop);
        }
    }

    // --- Charting ---
    function initChart() { /* ... (same as before) ... */
        if (rewardChart) rewardChart.destroy();
        const ctxChart = rewardChartCanvas.getContext('2d');
        if (!ctxChart) { console.error("Failed to get chart context"); return; }
        rewardChart = new Chart(ctxChart, {
            type: 'line', data: { labels: [], datasets: [{ label: `Avg Reward (Last ${REWARD_AVERAGE_WINDOW})`, data: [], borderColor: getCssVar('--primary-color'), backgroundColor: 'rgba(13, 110, 253, 0.1)', borderWidth: 1.5, pointRadius: 0, tension: 0.1, fill: true }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Episode' }, grid: { display: false } }, y: { title: { display: true, text: 'Average Reward' }, grid: { color: '#e9ecef' } } }, plugins: { legend: { display: false }, tooltip: { enabled: true } }, animation: { duration: 200 } } // Faster animation
        });
    }
    function updateChart() { /* ... (same as before, updates on episode end) ... */
        if (!rewardChart || recentRewards.length === 0) return;
        // Update less frequently for performance? Maybe only if training?
        // if (simulationState !== 'training' && simulationState !== 'stepping') return;

        const updateFrequency = 5; // Update chart every N episodes
        if (currentEpisode > 0 && currentEpisode % updateFrequency === 0) {
            const avg = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;
            const label = currentEpisode; // Use episode number as label

            rewardChart.data.labels.push(label);
            rewardChart.data.datasets[0].data.push(avg);

            // Limit history
            const maxChartPoints = Math.max(100, MAX_EPISODES / updateFrequency); // Dynamic limit
            while (rewardChart.data.labels.length > maxChartPoints) {
                rewardChart.data.labels.shift();
                rewardChart.data.datasets[0].data.shift();
            }
            rewardChart.update('none'); // Update without animation
        }
    }

    // --- UI Updates & Event Handlers ---
    function updateButtonStates() {
        const isIdle = simulationState === 'idle' || simulationState === 'stopped' || simulationState === 'error';
        const isPaused = simulationState === 'paused';
        const isTrainingActive = simulationState === 'training';
        const isRunning = !isIdle && !isPaused; // Training or Greedy

        startTrainingBtn.disabled = isTrainingActive || simulationState === 'error';
        startTrainingBtn.innerHTML = (isPaused) ? '▶ Resume' : '▶ Train';

        pauseTrainingBtn.disabled = !isTrainingActive;
        stopTrainingBtn.disabled = isIdle || simulationState === 'error';
        stepBtn.disabled = isRunning || simulationState === 'error';
        runGreedyBtn.disabled = isRunning || simulationState === 'error';

        const settingsDisabled = isRunning || isPaused; // Disable settings when paused too
        gridSizeSelect.disabled = settingsDisabled;
        obstacleProbSlider.disabled = settingsDisabled;
        resetEnvBtn.disabled = settingsDisabled;
        clearObstaclesBtn.disabled = settingsDisabled;
        learningRateSlider.disabled = settingsDisabled;
        discountFactorSlider.disabled = settingsDisabled;
        epsilonStartSlider.disabled = settingsDisabled;
        epsilonDecaySlider.disabled = settingsDisabled;
        epsilonMinSlider.disabled = settingsDisabled;
        maxEpisodesInput.disabled = settingsDisabled;
        resetQTableBtn.disabled = settingsDisabled;
        saveQTableBtn.disabled = settingsDisabled;
        loadQTableBtn.disabled = settingsDisabled;
        editModeRadios.forEach(radio => radio.disabled = settingsDisabled);
    }
    function updateInfoDisplay() { /* ... (same as before, ensure checks for undefined) ... */
        episodeDisplay.textContent = currentEpisode;
        stepsDisplay.textContent = currentStep;
        rewardDisplay.textContent = episodeReward?.toFixed(0) ?? '0'; // Handle potential undefined
        epsilonDisplay.textContent = (simulationState === 'training' || simulationState === 'stepping' || simulationState === 'paused') ? epsilon.toFixed(4) : 'N/A';
        if (recentRewards.length > 0) { const avg = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length; avgRewardDisplay.textContent = avg.toFixed(2); }
        else { avgRewardDisplay.textContent = "N/A"; }
        globalMaxQDisplay.textContent = globalMaxQ.toFixed(3);
        globalMinQDisplay.textContent = globalMinQ.toFixed(3);
        qTableSizeDisplay.textContent = `${Object.keys(qTable).length}`;
    }
    function setStatus(message, className = '') {
        statusDisplay.textContent = message;
        statusDisplay.className = className; // Assign class for styling
    }
    function updateUIParameterValues() { /* ... (same as before) ... */
         gridSizeSelect.value = GRID_SIZE;
         obstacleProbSlider.value = OBSTACLE_PROB * 100; obstacleProbValueSpan.textContent = `${Math.round(OBSTACLE_PROB*100)}%`;
         learningRateSlider.value = LEARNING_RATE; learningRateValueSpan.textContent = LEARNING_RATE.toFixed(2);
         discountFactorSlider.value = DISCOUNT_FACTOR; discountFactorValueSpan.textContent = DISCOUNT_FACTOR.toFixed(2);
         epsilonStartSlider.value = EPSILON_START; epsilonStartValueSpan.textContent = EPSILON_START.toFixed(2);
         epsilonDecaySlider.value = EPSILON_DECAY; epsilonDecayValueSpan.textContent = EPSILON_DECAY.toFixed(4);
         epsilonMinSlider.value = EPSILON_MIN; epsilonMinValueSpan.textContent = EPSILON_MIN.toFixed(2);
         maxEpisodesInput.value = MAX_EPISODES; totalEpisodesDisplay.textContent = MAX_EPISODES;
         updateSpeedDisplay(speedSlider.value); // Also update speed display text
    }
     function updateSpeedDisplay(value) { /* ... (same as before) ... */
         const speedVal = parseInt(value);
         if (speedVal >= 990) speedValueSpan.textContent = 'Max';
         else if (speedVal > 750) speedValueSpan.textContent = 'Very Fast';
         else if (speedVal > 500) speedValueSpan.textContent = 'Fast';
         else if (speedVal > 250) speedValueSpan.textContent = 'Medium';
         else if (speedVal > 50) speedValueSpan.textContent = 'Slow';
         else speedValueSpan.textContent = 'Very Slow';
         stepDelay = 1000 - speedVal; // Update delay
     }

    // --- Event Listeners ---
    gridSizeSelect.addEventListener('change', (e) => { GRID_SIZE = parseInt(e.target.value); init(true); resizeCanvas(); });
    obstacleProbSlider.addEventListener('input', (e) => { OBSTACLE_PROB = parseInt(e.target.value) / 100; obstacleProbValueSpan.textContent = `${e.target.value}%`; });
    editModeRadios.forEach(radio => { radio.addEventListener('change', (e) => {
        currentEditMode = e.target.value;
        canvas.classList.toggle('edit-mode', currentEditMode !== 'none'); // Add class for cursor change
        });
    });
    resetEnvBtn.addEventListener('click', () => init(true));
    clearObstaclesBtn.addEventListener('click', () => { initGrid(false); initQTable(); resetSimulationStats(); setStatus("Walls cleared. Learning Reset.", "idle"); requestAnimationFrame(draw); });

    learningRateSlider.addEventListener('input', (e) => { LEARNING_RATE = parseFloat(e.target.value); learningRateValueSpan.textContent = LEARNING_RATE.toFixed(2); });
    discountFactorSlider.addEventListener('input', (e) => { DISCOUNT_FACTOR = parseFloat(e.target.value); discountFactorValueSpan.textContent = DISCOUNT_FACTOR.toFixed(2); });
    epsilonStartSlider.addEventListener('input', (e) => { EPSILON_START = parseFloat(e.target.value); epsilonStartValueSpan.textContent = EPSILON_START.toFixed(2); if (simulationState === 'idle' || simulationState === 'stopped' || simulationState === 'paused') { epsilon = EPSILON_START; updateInfoDisplay();} });
    epsilonDecaySlider.addEventListener('input', (e) => { EPSILON_DECAY = parseFloat(e.target.value); epsilonDecayValueSpan.textContent = EPSILON_DECAY.toFixed(4); });
    epsilonMinSlider.addEventListener('input', (e) => { EPSILON_MIN = parseFloat(e.target.value); epsilonMinValueSpan.textContent = EPSILON_MIN.toFixed(2); });
    maxEpisodesInput.addEventListener('change', (e) => { MAX_EPISODES = parseInt(e.target.value) || 2000; totalEpisodesDisplay.textContent = MAX_EPISODES; });

    resetQTableBtn.addEventListener('click', () => {
         if (confirm("Reset all learning progress (Q-Table)?")) {
              initQTable(); resetSimulationStats(); setStatus("Learning Reset.", "idle"); requestAnimationFrame(draw);
         }
    });

    saveQTableBtn.addEventListener('click', saveQTable);
    loadQTableBtn.addEventListener('click', loadQTable);

    speedSlider.addEventListener('input', (e) => { updateSpeedDisplay(e.target.value); });
    startTrainingBtn.addEventListener('click', startTrainingAction);
    pauseTrainingBtn.addEventListener('click', pauseTrainingAction);
    stopTrainingBtn.addEventListener('click', stopAction);
    stepBtn.addEventListener('click', stepAction);
    runGreedyBtn.addEventListener('click', greedyAction);

    // Visualization Toggles - Request redraw
    showQArrowsCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
    showPolicyArrowsCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
    showHeatmapCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
    showPathCheckbox.addEventListener('change', () => requestAnimationFrame(draw));
    showAgentTrailCheckbox.addEventListener('change', () => requestAnimationFrame(draw));

    // Canvas Interaction
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseleave', handleCanvasMouseOut); // Use mouseleave instead of out
    canvas.addEventListener('click', handleCanvasClick);

    // --- Canvas Interaction Logic ---
    let lastHoveredCell = null;
    function handleCanvasMouseMove(e) { /* ... (same as before, uses updateCellInfoBox) ... */
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        const c = Math.floor(x / CELL_SIZE); const r = Math.floor(y / CELL_SIZE);
        if (isValid(r, c)) {
             if (!lastHoveredCell || lastHoveredCell.r !== r || lastHoveredCell.c !== c) {
                  lastHoveredCell = { r, c }; updateCellInfoBox(r, c);
             }
        } else { handleCanvasMouseOut(); }
    }
    function handleCanvasMouseOut() { /* ... (same as before) ... */
         cellInfoBox.style.opacity = '0'; lastHoveredCell = null;
    }
    function handleCanvasClick(e) { /* ... (same as before, uses currentEditMode) ... */
         if (simulationState !== 'idle' && simulationState !== 'paused' && simulationState !== 'stopped') return;
         const rect = canvas.getBoundingClientRect();
         const x = e.clientX - rect.left; const y = e.clientY - rect.top;
         const c = Math.floor(x / CELL_SIZE); const r = Math.floor(y / CELL_SIZE);
         if (!isValid(r, c)) return;
         const isCurrentlyStart = startPos && r === startPos.r && c === startPos.c;
         const isCurrentlyGoal = goalPos && r === goalPos.r && c === goalPos.c;
         let gridChanged = false;

         switch (currentEditMode) {
             case 'obstacle':
                 if (!isCurrentlyStart && !isCurrentlyGoal) { grid[r][c] = (grid[r][c] === -1) ? 0 : -1; gridChanged = true; } break;
             case 'start':
                 if (grid[r][c] !== -1 && !isCurrentlyGoal) { startPos = { r, c }; resetAgent(); gridChanged = true; } break;
             case 'goal':
                  if (grid[r][c] !== -1 && !isCurrentlyStart) { goalPos = { r, c }; gridChanged = true; } break;
         }
         if (gridChanged) { initQTable(); resetSimulationStats(); setStatus("Grid Edited. Learning Reset.", "idle"); requestAnimationFrame(draw); }
    }
    function updateCellInfoBox(r, c) { /* ... (same as before) ... */
         if (!isValid(r,c)) { cellInfoBox.style.opacity = '0'; return; }
         const stateIdx = stateToIndex(r, c); const qValues = qTable[stateIdx] || [0, 0, 0, 0];
         const maxQ = Math.max(...qValues); let cellType = 'Empty';
         if (grid[r][c] === -1) cellType = 'Wall'; if (startPos && r === startPos.r && c === startPos.c) cellType = 'Start'; if (goalPos && r === goalPos.r && c === goalPos.c) cellType = 'Goal';
         cellInfoBox.innerHTML = `(${r}, ${c}) ${cellType} | MaxQ: ${maxQ.toFixed(3)}<br>` + `U:${qValues[0].toFixed(2)} D:${qValues[1].toFixed(2)} L:${qValues[2].toFixed(2)} R:${qValues[3].toFixed(2)}`;
         cellInfoBox.style.opacity = '1';
    }

    // --- Persistence ---
    function saveQTable() { /* ... (same as before) ... */
         try {
             const dataToSave = { gridSize: GRID_SIZE, qTable: qTable, globalMinQ: globalMinQ, globalMaxQ: globalMaxQ };
             localStorage.setItem('qLearningVisualizer_qTable_v2', JSON.stringify(dataToSave)); // Use new key
             setStatus("Policy Saved.", "idle");
         } catch (e) { console.error("Save failed:", e); setStatus("Error saving policy.", "error"); alert("Could not save policy."); }
    }
    function loadQTable() { /* ... (same as before, includes size check/warning) ... */
        try {
            const savedData = localStorage.getItem('qLearningVisualizer_qTable_v2');
            if (!savedData) { alert("No saved policy found."); return; }
            const loadedData = JSON.parse(savedData);
            if (loadedData.gridSize !== GRID_SIZE) { if (!confirm(`Saved policy is for ${loadedData.gridSize}x${loadedData.gridSize}. Current is ${GRID_SIZE}x${GRID_SIZE}. Load anyway?`)) return; }
            qTable = loadedData.qTable || {}; recalculateGlobalMinMaxQ(); // Use loaded data
            resetSimulationStats(); // Reset episode, steps, etc.
            epsilon = EPSILON_MIN; // Assume loaded policy is trained
            setStatus("Policy Loaded. Epsilon set low.", "idle");
            updateInfoDisplay(); requestAnimationFrame(draw);
        } catch (e) { console.error("Load failed:", e); setStatus("Error loading policy.", "error"); alert("Could not load policy."); }
    }

    // --- Initial Setup & Resize Handling ---
    init(true); // Initialize everything on load
    window.addEventListener('resize', resizeCanvas); // Add resize listener
    resizeCanvas(); // Initial resize check

}); // End DOMContentLoaded
