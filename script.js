// Wait for the DOM to be fully loaded
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
    let CELL_SIZE = canvas.width / GRID_SIZE;

    // Rewards - More configurable? For now, keep constants.
    const REWARD_GOAL = 100;
    const REWARD_OBSTACLE = -100;
    const REWARD_STEP = -1;
    const REWARD_WALL_HIT = -5; // Penalty for hitting walls

    const ACTIONS = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 };
    const ACTION_DELTAS = [ { r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 } ]; // Index matches ACTIONS value
    const ACTION_NAMES = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const ACTION_ARROWS = ['↑', '↓', '←', '→']; // Characters for policy arrows

    // --- Q-Learning Parameters ---
    let LEARNING_RATE = parseFloat(learningRateSlider.value);
    let DISCOUNT_FACTOR = parseFloat(discountFactorSlider.value);
    let EPSILON_START = parseFloat(epsilonStartSlider.value);
    let EPSILON_DECAY = parseFloat(epsilonDecaySlider.value);
    let EPSILON_MIN = parseFloat(epsilonMinSlider.value);
    let MAX_EPISODES = parseInt(maxEpisodesInput.value);
    let MAX_STEPS_PER_EPISODE = GRID_SIZE * GRID_SIZE * 2.5; // Allow more steps

    // --- State Variables ---
    let grid = []; // 0: empty, -1: obstacle
    let qTable = {}; // { stateIndex: [qUp, qDown, qLeft, qRight] }
    let startPos = { r: -1, c: -1 }; // Initialize as invalid
    let goalPos = { r: -1, c: -1 };
    let agentPos = { r: -1, c: -1 };
    let currentEpisode = 0;
    let currentStep = 0;    // Step within the current episode
    let totalSteps = 0;     // Total steps across all episodes if needed
    let episodeReward = 0;
    let episodePath = [];   // For drawing path
    let agentTrail = [];    // For fading trail effect
    const MAX_TRAIL_LENGTH = 15;

    // Simulation Control State Machine
    let simulationState = 'idle'; // idle, training, paused, stepping, greedy, stopped
    let animationFrameId = null;
    let lastTimestamp = 0;
    let stepDelay = 1000 - parseInt(speedSlider.value); // Milliseconds between steps
    let timeAccumulator = 0;

    let currentEditMode = 'none'; // 'none', 'obstacle', 'start', 'goal'

    // Statistics & Charting
    let recentRewards = [];
    const REWARD_AVERAGE_WINDOW = 100;
    let globalMaxQ = -Infinity;
    let globalMinQ = Infinity;
    let rewardChart; // Chart.js instance


    // --- Utility Functions ---
    function getCssVar(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim(); }
    function stateToIndex(r, c) { return r * GRID_SIZE + c; }
    function indexToState(index) { return { r: Math.floor(index / GRID_SIZE), c: index % GRID_SIZE }; }
    function isValid(r, c) { return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpColor(hexA, hexB, t) { /* ... (same as before) ... */
        const rA = parseInt(hexA.slice(1, 3), 16), gA = parseInt(hexA.slice(3, 5), 16), bA = parseInt(hexA.slice(5, 7), 16);
        const rB = parseInt(hexB.slice(1, 3), 16), gB = parseInt(hexB.slice(3, 5), 16), bB = parseInt(hexB.slice(5, 7), 16);
        const r = Math.round(lerp(rA, rB, t)).toString(16).padStart(2, '0');
        const g = Math.round(lerp(gA, gB, t)).toString(16).padStart(2, '0');
        const b = Math.round(lerp(bA, bB, t)).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
    function getHeatmapColor(value) { /* Using 5 points for smoother gradient */
        const HEATMAP_COLORS = [getCssVar('--heatmap-0'), getCssVar('--heatmap-25'), getCssVar('--heatmap-50'), getCssVar('--heatmap-75'), getCssVar('--heatmap-100')];
        value = Math.max(0, Math.min(1, value)); // Clamp value
        const scaledValue = value * (HEATMAP_COLORS.length - 1);
        const index = Math.floor(scaledValue);
        const t = scaledValue - index;
        if (index >= HEATMAP_COLORS.length - 1) return HEATMAP_COLORS[HEATMAP_COLORS.length - 1];
        return lerpColor(HEATMAP_COLORS[index], HEATMAP_COLORS[index + 1], t);
    }

    // --- Initialization ---
    function init() {
        console.log("Initializing Simulation...");
        setStatus('Initializing...', 'initializing');
        stopSimulation(); // Ensure any previous run is stopped
        CELL_SIZE = canvas.width / GRID_SIZE;
        MAX_STEPS_PER_EPISODE = GRID_SIZE * GRID_SIZE * 2.5; // Re-adjust based on grid size
        totalEpisodesDisplay.textContent = MAX_EPISODES;
        initGrid(true); // Generate obstacles
        initQTable();
        initChart();
        resetSimulationState();
        updateUIParameterValues(); // Sync UI sliders/inputs with variables
        updateButtonStates();
        setStatus('Ready.', 'idle');
        requestAnimationFrame(renderLoop); // Start the rendering loop (draws once initially)
        console.log("Initialization Complete.");
    }

    function initGrid(generateObstacles = true) {
        grid = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            grid[r] = new Array(GRID_SIZE).fill(0);
            if (generateObstacles) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (Math.random() < OBSTACLE_PROB) {
                        grid[r][c] = -1; // Obstacle
                    }
                }
            }
        }
        // Place Start and Goal safely
        placeStartGoal();
        resetAgent();
    }

    function placeStartGoal() {
         // Attempt to place S at top-left, G at bottom-right if clear
         const defaultStart = { r: 0, c: 0 };
         const defaultGoal = { r: GRID_SIZE - 1, c: GRID_SIZE - 1 };

         if (isValid(defaultStart.r, defaultStart.c) && grid[defaultStart.r][defaultStart.c] === 0) {
             startPos = defaultStart;
         } else {
             startPos = findRandomClearCell(); // Find any clear cell if default blocked
         }
         if (startPos) grid[startPos.r][startPos.c] = 0; // Ensure start is clear

         if (isValid(defaultGoal.r, defaultGoal.c) && grid[defaultGoal.r][defaultGoal.c] === 0 && !(defaultGoal.r === startPos?.r && defaultGoal.c === startPos?.c)) {
             goalPos = defaultGoal;
         } else {
             goalPos = findRandomClearCell(startPos); // Find any clear cell different from start
         }
         if (goalPos) grid[goalPos.r][goalPos.c] = 0; // Ensure goal is clear

         if (!startPos || !goalPos) {
             console.error("FATAL: Could not place start or goal position!");
             setStatus("Error: Cannot place S/G", "error");
             stopSimulation(); // Halt everything
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
         if (clearCells.length === 0) return null; // No clear cells found
         return clearCells[Math.floor(Math.random() * clearCells.length)];
     }

    function initQTable() {
        qTable = {};
        globalMinQ = 0; // Q values start at 0
        globalMaxQ = 0;
        updateInfoDisplay(); // Reflect reset in UI
    }

    function resetSimulationState() {
        currentEpisode = 0;
        currentStep = 0;
        totalSteps = 0;
        episodeReward = 0;
        epsilon = EPSILON_START;
        recentRewards = [];
        if (rewardChart) { // Clear chart data
             rewardChart.data.labels = [];
             rewardChart.data.datasets[0].data = [];
             rewardChart.update();
        }
        resetAgent();
    }

    function resetAgent() {
         if (!startPos || startPos.r < 0) placeStartGoal(); // Ensure start exists
         if (startPos && startPos.r >= 0) {
             agentPos = { ...startPos };
         } else {
             agentPos = {r: 0, c: 0}; // Fallback
             console.warn("Agent reset to fallback 0,0 as startPos was invalid");
         }
         episodePath = [{ ...agentPos }];
         agentTrail = [];
    }

    // --- Drawing Functions ---
    function renderLoop(timestamp) {
        if (simulationState === 'stopped' && animationFrameId) {
            // Allow one final draw when explicitly stopped, then exit loop
            draw();
            animationFrameId = null;
            return;
        }

        if (simulationState !== 'idle' && simulationState !== 'paused' && simulationState !== 'stepping') {
            const deltaTime = timestamp - lastTimestamp;
            timeAccumulator += deltaTime;

            // Determine how many steps to process based on delay
            let stepsToTake = 0;
            if (stepDelay <= 5) { // Effectively max speed
                stepsToTake = 5; // Process multiple steps per frame for speed
            } else {
                 stepsToTake = Math.floor(timeAccumulator / stepDelay);
            }


            if (stepsToTake > 0) {
                timeAccumulator -= stepsToTake * stepDelay; // Consume time
                for (let i = 0; i < stepsToTake && simulationState !== 'idle' && simulationState !== 'paused'; i++) {
                    runSingleStep();
                    if (simulationState === 'idle' || simulationState === 'paused') break; // Stop if episode ended or paused mid-batch
                }
                draw(); // Draw after processing steps
                updateInfoDisplay(); // Update stats
            }
        } else if (simulationState === 'idle' || simulationState === 'paused') {
            // Draw occasionally even when paused/idle to reflect grid edits etc.
             if (timestamp - lastTimestamp > 100) { // Draw roughly 10fps when idle/paused
                  draw();
                  lastTimestamp = timestamp;
             }
        }


        lastTimestamp = timestamp;
        animationFrameId = requestAnimationFrame(renderLoop); // Continue the loop
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawGridBase();
        if (showAgentTrailCheckbox.checked) drawTrail();
        if (showPathCheckbox.checked) drawPath();
        drawAgent();
    }

    function drawGridBase() {
        const showHeatmap = showHeatmapCheckbox.checked;
        const showQ = showQArrowsCheckbox.checked;
        const showPolicy = showPolicyArrowsCheckbox.checked;
        const qRange = (globalMaxQ > globalMinQ) ? globalMaxQ - globalMinQ : 1;

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const stateIdx = stateToIndex(r, c);
                const isStart = startPos && r === startPos.r && c === startPos.c;
                const isGoal = goalPos && r === goalPos.r && c === goalPos.c;
                const isObstacle = grid[r][c] === -1;
                const qValues = qTable[stateIdx] || [0, 0, 0, 0];
                const maxQ = Math.max(...qValues);

                // 1. Cell Background (Heatmap or Empty)
                let cellColor = getCssVar('--cell-empty');
                if (showHeatmap && !isObstacle && qTable[stateIdx]) {
                    const normalizedValue = qRange > 1e-6 ? (maxQ - globalMinQ) / qRange : 0.5;
                    cellColor = getHeatmapColor(Math.max(0, Math.min(1, normalizedValue)));
                }
                ctx.fillStyle = cellColor;
                ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);

                // 2. Obstacles / Start / Goal Markers (Overlay)
                if (isObstacle) {
                    ctx.fillStyle = getCssVar('--cell-obstacle');
                    ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                } else if (isStart) {
                    ctx.fillStyle = getCssVar('--cell-start');
                    ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    drawMarkerText(r, c, 'S');
                } else if (isGoal) {
                    ctx.fillStyle = getCssVar('--cell-goal');
                    ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    drawMarkerText(r, c, 'G');
                }

                // 3. Grid Lines
                ctx.strokeStyle = getCssVar('--grid-line');
                ctx.lineWidth = 1;
                ctx.strokeRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);

                // 4. Visualization Arrows (Q-Values & Policy)
                if (!isObstacle) {
                     if (showQ) drawQArrows(r, c, qValues, qRange);
                     if (showPolicy) drawPolicyArrow(r, c, qValues);
                }
            }
        }
    }
     function drawMarkerText(r, c, text) {
         ctx.fillStyle = '#fff'; // White text on colored cells
         ctx.font = `bold ${Math.max(10, CELL_SIZE * 0.5)}px ${getCssVar('--font-family')}`;
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.fillText(text, c * CELL_SIZE + CELL_SIZE / 2, r * CELL_SIZE + CELL_SIZE / 2 + 1); // +1 for vertical centering
     }


    function drawAgent() {
         if (!agentPos || agentPos.r < 0) return; // Don't draw if invalid
        const centerX = agentPos.c * CELL_SIZE + CELL_SIZE / 2;
        const centerY = agentPos.r * CELL_SIZE + CELL_SIZE / 2;
        const radius = CELL_SIZE * 0.30;

        ctx.fillStyle = getCssVar('--cell-agent');
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function drawPath() { /* ... (same as before - using lines) ... */
        if (episodePath.length < 2) return;
        ctx.strokeStyle = getCssVar('--path-color');
        ctx.lineWidth = Math.max(1.5, CELL_SIZE * 0.08);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(episodePath[0].c * CELL_SIZE + CELL_SIZE / 2, episodePath[0].r * CELL_SIZE + CELL_SIZE / 2);
        for (let i = 1; i < episodePath.length; i++) {
             ctx.lineTo(episodePath[i].c * CELL_SIZE + CELL_SIZE / 2, episodePath[i].r * CELL_SIZE + CELL_SIZE / 2);
        }
        ctx.stroke();
    }

     function drawTrail() {
         const trailColorBase = getCssVar('--trail-color'); // Get base RGBA
         // Extract RGB from RGBA string (assuming format like 'rgba(r,g,b,a)')
         const match = trailColorBase.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
         if (!match) return; // Invalid color format
         const [r, g, b] = [match[1], match[2], match[3]];

         for (let i = 0; i < agentTrail.length; i++) {
             const pos = agentTrail[i];
             const alpha = 0.4 * (i / agentTrail.length); // Fade out
             ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
             const trailSize = CELL_SIZE * (0.2 + 0.3 * (i / agentTrail.length)); // Shrink trail
             ctx.fillRect(
                 pos.c * CELL_SIZE + (CELL_SIZE - trailSize) / 2,
                 pos.r * CELL_SIZE + (CELL_SIZE - trailSize) / 2,
                 trailSize, trailSize
             );
         }
     }

    function drawQArrows(r, c, qValues, qRange) { /* ... (similar to before, using global range) ... */
         if (qRange < 1e-6) return; // Don't draw if range is negligible

        const centerX = c * CELL_SIZE + CELL_SIZE / 2;
        const centerY = r * CELL_SIZE + CELL_SIZE / 2;
        const baseSize = CELL_SIZE * 0.06; // Smaller base
        const maxLen = CELL_SIZE * 0.35;

        ctx.fillStyle = getCssVar('--q-arrow-color');

        for (let action = 0; action < 4; action++) {
            const q = qValues[action];
            const normalizedQ = (q - globalMinQ) / qRange;
            const len = maxLen * Math.max(0, Math.min(1, normalizedQ));

            if (len < 1) continue;

            ctx.beginPath();
            const delta = ACTION_DELTAS[action];
            const tipX = centerX + delta.c * len;
            const tipY = centerY + delta.r * len;
            const perpDx = -delta.r;
            const perpDy = delta.c;
            const baseCenterX = centerX + delta.c * (len * 0.1); // Move base slightly out
            const baseCenterY = centerY + delta.r * (len * 0.1);
            const base1X = baseCenterX + perpDx * baseSize;
            const base1Y = baseCenterY + perpDy * baseSize;
            const base2X = baseCenterX - perpDx * baseSize;
            const base2Y = baseCenterY - perpDy * baseSize;

            ctx.moveTo(tipX, tipY); ctx.lineTo(base1X, base1Y); ctx.lineTo(base2X, base2Y); ctx.closePath(); ctx.fill();
        }
    }

     function drawPolicyArrow(r, c, qValues) {
          // Find the best action(s) - greedy policy
         const maxQ = Math.max(...qValues);
         // Only draw if there's a meaningful preference (Q > minQ slightly)
         if (maxQ <= globalMinQ + 1e-6 && maxQ >= globalMaxQ - 1e-6) return;

         const bestActions = [];
         for (let i = 0; i < qValues.length; i++) {
             if (Math.abs(qValues[i] - maxQ) < 1e-6) {
                 bestActions.push(i);
             }
         }

         // Don't draw if all actions are equally good (e.g., all zeros)
         if (bestActions.length === 4 || bestActions.length === 0) return;

         // For simplicity, just draw the first best action found if multiple tie
         const bestAction = bestActions[0];
         const delta = ACTION_DELTAS[bestAction];

         const centerX = c * CELL_SIZE + CELL_SIZE / 2;
         const centerY = r * CELL_SIZE + CELL_SIZE / 2;
         const arrowLength = CELL_SIZE * 0.25;
         const arrowWidth = Math.max(2, CELL_SIZE * 0.06);

         ctx.strokeStyle = getCssVar('--policy-arrow-color');
         ctx.lineWidth = arrowWidth;
         ctx.lineCap = "round";

         ctx.beginPath();
         ctx.moveTo(centerX - delta.c * arrowLength * 0.3, centerY - delta.r * arrowLength * 0.3); // Start slightly off center
         ctx.lineTo(centerX + delta.c * arrowLength * 0.7, centerY + delta.r * arrowLength * 0.7); // End point
         ctx.stroke();

         // Arrowhead (simple lines)
         const headLength = arrowLength * 0.4;
         const headAngle = Math.PI / 6; // 30 degrees
         const angle = Math.atan2(delta.r, delta.c); // Angle of the main line

         const arrowX = centerX + delta.c * arrowLength * 0.7;
         const arrowY = centerY + delta.r * arrowLength * 0.7;

         ctx.beginPath();
         ctx.moveTo(arrowX, arrowY);
         ctx.lineTo(arrowX - headLength * Math.cos(angle - headAngle), arrowY - headLength * Math.sin(angle - headAngle));
         ctx.moveTo(arrowX, arrowY);
         ctx.lineTo(arrowX - headLength * Math.cos(angle + headAngle), arrowY - headLength * Math.sin(angle + headAngle));
         ctx.stroke();
     }


    // --- Q-Learning Logic ---
    function getQValue(r, c, action) { /* ... (same as before, ensures initialization) ... */
         const stateIdx = stateToIndex(r,c);
         if (!qTable[stateIdx]) qTable[stateIdx] = [0, 0, 0, 0];
         return qTable[stateIdx][action];
    }
    function getMaxQValue(r, c) { /* ... (same as before) ... */
         const stateIdx = stateToIndex(r,c);
         return Math.max(...(qTable[stateIdx] || [0, 0, 0, 0]));
    }
     function chooseAction(r, c) { /* ... (same as before, uses epsilon, handles ties) ... */
          const stateIdx = stateToIndex(r,c);
          const qValues = qTable[stateIdx] || [0, 0, 0, 0];
          let action;

          if ((simulationState === 'training' || simulationState === 'stepping') && Math.random() < epsilon) {
               action = Math.floor(Math.random() * 4); // Explore
          } else { // Exploit (or greedy run)
               const maxQ = Math.max(...qValues);
               const bestActions = [];
               for (let i = 0; i < qValues.length; i++) {
                    if (Math.abs(qValues[i] - maxQ) < 1e-6) bestActions.push(i);
               }
               action = bestActions[Math.floor(Math.random() * bestActions.length)];
          }
          return action;
    }

    function updateQTable(r, c, action, reward, next_r, next_c, done) { /* ... (same as before, updates global min/max) ... */
        const stateIdx = stateToIndex(r,c);
        const nextStateIdx = stateToIndex(next_r, next_c); // Use index of where agent landed

         // Ensure state exists in Q-table
         if (!qTable[stateIdx]) qTable[stateIdx] = [0, 0, 0, 0];

        const currentQ = qTable[stateIdx][action];
        const maxNextQ = done ? 0 : getMaxQValue(next_r, next_c); // Use agent's actual next pos
        const targetQ = reward + DISCOUNT_FACTOR * maxNextQ;
        const newQ = currentQ + LEARNING_RATE * (targetQ - currentQ);

        qTable[stateIdx][action] = newQ;

        if (newQ > globalMaxQ) globalMaxQ = newQ;
        if (newQ < globalMinQ) globalMinQ = newQ;
    }

    // --- Simulation Step ---
    function runSingleStep() {
        if (!agentPos || agentPos.r < 0 || !goalPos || goalPos.r < 0) {
             console.error("Cannot step: Agent or Goal position invalid.");
             setStatus("Error: Invalid Agent/Goal", "error");
             stopSimulation();
             return;
        }

        const r = agentPos.r;
        const c = agentPos.c;

        const action = chooseAction(r, c);
        const delta = ACTION_DELTAS[action];

        let next_r = r + delta.r;
        let next_c = c + delta.c;
        let reward = REWARD_STEP;
        let done = false;
        let event = 'move';

        if (!isValid(next_r, next_c)) {
            reward = REWARD_WALL_HIT;
            next_r = r; // Stay in place
            next_c = c;
            event = 'wall';
        } else if (grid[next_r][next_c] === -1) {
            reward = REWARD_OBSTACLE;
            done = true;
            next_r = r; // Stay in place before obstacle
            next_c = c;
            event = 'obstacle';
        } else if (next_r === goalPos.r && next_c === goalPos.c) {
            reward = REWARD_GOAL;
            done = true;
            agentPos = { r: next_r, c: next_c }; // Move onto goal
             event = 'goal';
        } else {
            agentPos = { r: next_r, c: next_c }; // Valid move
        }

        if (simulationState === 'training' || simulationState === 'stepping') {
             updateQTable(r, c, action, reward, agentPos.r, agentPos.c, done);
        }

        episodeReward += reward;
        currentStep++;
        totalSteps++; // Could be useful later

         // Update path and trail
         if(episodePath.length === 0 || agentPos.r !== episodePath[episodePath.length-1].r || agentPos.c !== episodePath[episodePath.length-1].c) {
             episodePath.push({ ...agentPos });
             agentTrail.push({ ...agentPos });
             if (agentTrail.length > MAX_TRAIL_LENGTH) {
                 agentTrail.shift(); // Keep trail length limited
             }
         }


        // --- Check End of Episode ---
        if (done || currentStep >= MAX_STEPS_PER_EPISODE) {
            if (simulationState === 'training' || simulationState === 'stepping') {
                // Record stats for training mode
                 recentRewards.push(episodeReward);
                 if (recentRewards.length > REWARD_AVERAGE_WINDOW) recentRewards.shift();
                 updateChart();

                 if (epsilon > EPSILON_MIN) epsilon *= EPSILON_DECAY;
                 currentEpisode++;
            }

            // Prepare for next episode or stop if max episodes reached
            if (simulationState === 'training' && currentEpisode < MAX_EPISODES) {
                resetAgent(); // Reset for next episode
                currentStep = 0;
                episodeReward = 0;
            } else if (simulationState === 'training' && currentEpisode >= MAX_EPISODES) {
                 setStatus('Training Finished (Max Episodes).', 'finished');
                 stopSimulation(); // Stop automatically
            } else if (simulationState === 'stepping') {
                // If stepping and episode ends, switch to paused state
                 setStatus(`Episode End (${event}). Paused.`, 'paused');
                 simulationState = 'paused';
                 updateButtonStates();
            } else if (simulationState === 'greedy') {
                 setStatus(`Greedy Run Finished (${event}).`, 'finished');
                 stopSimulation(); // Stop after greedy run completes
            }
            resetAgent(); // Reset agent visual/path for next interaction
            currentStep = 0;
            episodeReward = 0;
        }
    }

    // --- Simulation Control ---
    function startTraining() {
        if (simulationState === 'training') return; // Already training
        if (simulationState === 'paused') { // Resume
             simulationState = 'training';
             setStatus('Training Resumed...', 'training');
        } else { // Start fresh or after stop/idle
             initQTable(); // Reset learning progress when starting fresh
             resetSimulationState();
             simulationState = 'training';
             setStatus('Training Started...', 'training');
             epsilon = EPSILON_START; // Reset epsilon
        }
         updateButtonStates();
         lastTimestamp = performance.now(); // Reset timer for smooth start
         timeAccumulator = 0;
         if (!animationFrameId) requestAnimationFrame(renderLoop); // Ensure render loop is running
    }

    function pauseTraining() {
         if (simulationState === 'training') {
             simulationState = 'paused';
             setStatus('Training Paused.', 'paused');
             updateButtonStates();
             // No need to cancel animationFrameId, renderLoop handles paused state
         }
    }

    function stopSimulation() { // Can stop training, greedy, stepping
        const previousState = simulationState;
        simulationState = 'stopped'; // Signal loop to exit cleanly
        updateButtonStates();
        if (previousState !== 'idle' && previousState !== 'stopped') {
            setStatus('Simulation Stopped.', 'stopped');
        }
        // animationFrameId will be cleared by the renderLoop itself on 'stopped' state
    }

     function stepOnce() {
         if (simulationState === 'idle' || simulationState === 'paused' || simulationState === 'stepping' || simulationState === 'stopped') {
              if (simulationState === 'idle' || simulationState === 'stopped') {
                  // If starting stepping from idle/stopped, treat it like starting training but pausing after one step
                  resetAgent(); // Start episode fresh
                  currentStep = 0;
                  episodeReward = 0;
                   if (currentEpisode >= MAX_EPISODES) { // Reset if max episodes was hit
                        initQTable();
                        resetSimulationState();
                        epsilon = EPSILON_START;
                   }
              }
              simulationState = 'stepping'; // Set mode for runSingleStep logic
              setStatus('Stepping...', 'stepping');
              runSingleStep(); // Execute one step
              // runSingleStep will transition to 'paused' if the episode ends
              // If not ended, we manually set to paused
              if (simulationState === 'stepping') {
                   simulationState = 'paused';
                   setStatus('Paused after step.', 'paused');
              }
              draw(); // Ensure immediate redraw after step
              updateInfoDisplay();
              updateButtonStates();
         }
     }

    function runGreedy() {
         if (simulationState !== 'idle' && simulationState !== 'paused' && simulationState !== 'stopped') return;
         resetAgent(); // Start fresh from S
         currentStep = 0;
         episodeReward = 0;
         simulationState = 'greedy';
         setStatus('Running Greedy Policy...', 'greedy');
         updateButtonStates();
         lastTimestamp = performance.now();
         timeAccumulator = 0;
        if (!animationFrameId) requestAnimationFrame(renderLoop);
    }

    // --- Charting ---
    function initChart() {
        if (rewardChart) rewardChart.destroy(); // Destroy previous chart if exists

        const ctxChart = rewardChartCanvas.getContext('2d');
        rewardChart = new Chart(ctxChart, {
            type: 'line',
            data: {
                labels: [], // Episode numbers
                datasets: [{
                    label: `Avg Reward (Last ${REWARD_AVERAGE_WINDOW})`,
                    data: [], // Average rewards
                    borderColor: getCssVar('--primary-color'),
                    backgroundColor: 'rgba(52, 152, 219, 0.1)', // Light blue fill
                    borderWidth: 1.5,
                    pointRadius: 0, // No points on line
                    tension: 0.1, // Slight curve
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: 'Episode' },
                        grid: { display: false }
                    },
                    y: {
                        title: { display: true, text: 'Average Reward' },
                        grid: { color: '#e0e0e0' } // Lighter grid lines
                    }
                },
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: { enabled: false } // Keep tooltip off for performance maybe
                },
                animation: { duration: 0 } // Disable animation for performance
            }
        });
    }

    function updateChart() {
        if (!rewardChart || recentRewards.length === 0) return;

        // Add data point only every few episodes to prevent chart lag
        if (currentEpisode % 5 === 0 || simulationState === 'stopped' || simulationState === 'finished') {
            const avg = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;
            rewardChart.data.labels.push(currentEpisode);
            rewardChart.data.datasets[0].data.push(avg);

            // Limit chart history (e.g., last 500 points) for performance
            const maxChartPoints = 500;
            if (rewardChart.data.labels.length > maxChartPoints) {
                rewardChart.data.labels.shift();
                rewardChart.data.datasets[0].data.shift();
            }

            rewardChart.update('none'); // Update without animation
        }
    }


    // --- UI Updates & Event Handlers ---
    function updateButtonStates() {
        const isIdle = simulationState === 'idle' || simulationState === 'stopped';
        const isPaused = simulationState === 'paused';
        const isTrainingActive = simulationState === 'training';
        const isStepping = simulationState === 'stepping'; // Currently unused but could be

        startTrainingBtn.disabled = isTrainingActive;
        startTrainingBtn.innerHTML = (isPaused || isStepping) ? '▶ Resume' : '▶ Train';

        pauseTrainingBtn.disabled = !isTrainingActive;
        stopTrainingBtn.disabled = isIdle;
        stepBtn.disabled = isTrainingActive || simulationState === 'greedy'; // Allow step from idle/paused
        runGreedyBtn.disabled = !isIdle && !isPaused; // Allow greedy from idle/paused

        // Disable settings while running
        const settingsDisabled = !isIdle && !isPaused;
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

    function updateInfoDisplay() {
        // Status is set elsewhere
        episodeDisplay.textContent = currentEpisode;
        stepsDisplay.textContent = currentStep;
        rewardDisplay.textContent = episodeReward.toFixed(0);
        epsilonDisplay.textContent = (simulationState === 'training' || simulationState === 'stepping' || simulationState === 'paused') ? epsilon.toFixed(4) : 'N/A'; // Show epsilon if potentially training/stepping

        if (recentRewards.length > 0) {
            const avg = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;
            avgRewardDisplay.textContent = avg.toFixed(2);
        } else {
            avgRewardDisplay.textContent = "N/A";
        }

        globalMaxQDisplay.textContent = globalMaxQ === -Infinity ? '0.0' : globalMaxQ.toFixed(3);
        globalMinQDisplay.textContent = globalMinQ === Infinity ? '0.0' : globalMinQ.toFixed(3);
        qTableSizeDisplay.textContent = `${Object.keys(qTable).length} states`;
    }

    function setStatus(message, className = '') {
        statusDisplay.textContent = message;
        statusDisplay.className = className;
    }

    function updateUIParameterValues() {
         // Sync sliders/inputs with current variable values (useful after loading)
         gridSizeSelect.value = GRID_SIZE;
         obstacleProbSlider.value = OBSTACLE_PROB * 100;
         obstacleProbValueSpan.textContent = `${Math.round(OBSTACLE_PROB*100)}%`;
         learningRateSlider.value = LEARNING_RATE;
         learningRateValueSpan.textContent = LEARNING_RATE.toFixed(2);
         discountFactorSlider.value = DISCOUNT_FACTOR;
         discountFactorValueSpan.textContent = DISCOUNT_FACTOR.toFixed(2);
         epsilonStartSlider.value = EPSILON_START;
         epsilonStartValueSpan.textContent = EPSILON_START.toFixed(2);
         epsilonDecaySlider.value = EPSILON_DECAY;
         epsilonDecayValueSpan.textContent = EPSILON_DECAY.toFixed(4);
         epsilonMinSlider.value = EPSILON_MIN;
         epsilonMinValueSpan.textContent = EPSILON_MIN.toFixed(2);
         maxEpisodesInput.value = MAX_EPISODES;
         totalEpisodesDisplay.textContent = MAX_EPISODES;
    }


    // --- Event Listeners ---
    gridSizeSelect.addEventListener('change', (e) => {
        GRID_SIZE = parseInt(e.target.value); init(); });
    obstacleProbSlider.addEventListener('input', (e) => {
        OBSTACLE_PROB = parseInt(e.target.value) / 100;
        obstacleProbValueSpan.textContent = `${e.target.value}%`;
        // Note: Does not auto-reset, user clicks button
    });
     editModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => { currentEditMode = e.target.value; });
     });
     resetEnvBtn.addEventListener('click', () => init());
     clearObstaclesBtn.addEventListener('click', () => {
          initGrid(false); // Regenerate grid without obstacles
          initQTable(); // Reset Q-table as env changed significantly
          resetSimulationState();
          setStatus("Obstacles cleared. Ready.", "idle");
          // No need to call draw() here, renderLoop handles it
     });

    learningRateSlider.addEventListener('input', (e) => { LEARNING_RATE = parseFloat(e.target.value); learningRateValueSpan.textContent = LEARNING_RATE.toFixed(2); });
    discountFactorSlider.addEventListener('input', (e) => { DISCOUNT_FACTOR = parseFloat(e.target.value); discountFactorValueSpan.textContent = DISCOUNT_FACTOR.toFixed(2); });
    epsilonStartSlider.addEventListener('input', (e) => { EPSILON_START = parseFloat(e.target.value); epsilonStartValueSpan.textContent = EPSILON_START.toFixed(2); if (simulationState === 'idle' || simulationState === 'stopped') epsilon = EPSILON_START; updateInfoDisplay(); }); // Update current epsilon if idle
    epsilonDecaySlider.addEventListener('input', (e) => { EPSILON_DECAY = parseFloat(e.target.value); epsilonDecayValueSpan.textContent = EPSILON_DECAY.toFixed(4); });
    epsilonMinSlider.addEventListener('input', (e) => { EPSILON_MIN = parseFloat(e.target.value); epsilonMinValueSpan.textContent = EPSILON_MIN.toFixed(2); });
    maxEpisodesInput.addEventListener('change', (e) => { MAX_EPISODES = parseInt(e.target.value) || 1000; totalEpisodesDisplay.textContent = MAX_EPISODES; }); // Update display

    resetQTableBtn.addEventListener('click', () => {
         if (confirm("This will reset all learning progress. Are you sure?")) {
              initQTable();
              resetSimulationState(); // Reset episode count, etc.
              setStatus("Q-Table & Training Reset.", "idle");
              // No need to call draw() here, renderLoop handles it
         }
    });

     saveQTableBtn.addEventListener('click', saveQTable);
     loadQTableBtn.addEventListener('click', loadQTable);


    speedSlider.addEventListener('input', (e) => { updateSpeedDisplay(e.target.value); });
    startTrainingBtn.addEventListener('click', startTraining);
    pauseTrainingBtn.addEventListener('click', pauseTraining);
    stopTrainingBtn.addEventListener('click', stopSimulation);
    stepBtn.addEventListener('click', stepOnce);
    runGreedyBtn.addEventListener('click', runGreedy);

    // Visualization Toggles (just need redraw)
    showQArrowsCheckbox.addEventListener('change', () => { if(!isRunning) draw() });
    showPolicyArrowsCheckbox.addEventListener('change', () => { if(!isRunning) draw() });
    showHeatmapCheckbox.addEventListener('change', () => { if(!isRunning) draw() });
    showPathCheckbox.addEventListener('change', () => { if(!isRunning) draw() });
    showAgentTrailCheckbox.addEventListener('change', () => { if(!isRunning) draw() });

    // Canvas Interaction
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseout', handleCanvasMouseOut);
    canvas.addEventListener('click', handleCanvasClick);

    // --- Canvas Interaction Logic ---
    let lastHoveredCell = null;
    function handleCanvasMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = Math.floor(x / CELL_SIZE);
        const r = Math.floor(y / CELL_SIZE);

        if (isValid(r, c)) {
             if (!lastHoveredCell || lastHoveredCell.r !== r || lastHoveredCell.c !== c) {
                  lastHoveredCell = { r, c };
                  updateCellInfoBox(r, c);
                  // Could add a visual hover effect here by redrawing, but might be slow
             }
        } else {
            handleCanvasMouseOut(); // Clear info if mouse moves off grid
        }
    }

    function handleCanvasMouseOut() {
        cellInfoBox.style.opacity = '0';
        lastHoveredCell = null;
        // Could remove hover effect here if implemented
    }

    function handleCanvasClick(e) {
         if (simulationState !== 'idle' && simulationState !== 'paused' && simulationState !== 'stopped') return; // No editing while running

         const rect = canvas.getBoundingClientRect();
         const x = e.clientX - rect.left;
         const y = e.clientY - rect.top;
         const c = Math.floor(x / CELL_SIZE);
         const r = Math.floor(y / CELL_SIZE);

         if (!isValid(r, c)) return;

         const isStartCell = startPos && r === startPos.r && c === startPos.c;
         const isGoalCell = goalPos && r === goalPos.r && c === goalPos.c;

         switch (currentEditMode) {
             case 'obstacle':
                 if (!isStartCell && !isGoalCell) {
                     grid[r][c] = (grid[r][c] === -1) ? 0 : -1; // Toggle obstacle
                     initQTable(); // Obstacles changed, reset Q-table
                     resetSimulationState();
                     setStatus("Obstacle Toggled. Learning Reset.", "idle");
                 }
                 break;
             case 'start':
                 if (grid[r][c] !== -1 && (!goalPos || r !== goalPos.r || c !== goalPos.c)) {
                     startPos = { r, c };
                     resetAgent();
                     initQTable(); // Start changed, reset Q-table
                     resetSimulationState();
                      setStatus("Start Position Set. Learning Reset.", "idle");
                 }
                 break;
             case 'goal':
                  if (grid[r][c] !== -1 && (!startPos || r !== startPos.r || c !== startPos.c)) {
                     goalPos = { r, c };
                     initQTable(); // Goal changed, reset Q-table
                     resetSimulationState();
                     setStatus("Goal Position Set. Learning Reset.", "idle");
                 }
                 break;
         }
         // No need to call draw() here, renderLoop handles it
    }

     function updateCellInfoBox(r, c) {
         if (!isValid(r,c)) {
             cellInfoBox.style.opacity = '0';
             return;
         }
         const stateIdx = stateToIndex(r, c);
         const qValues = qTable[stateIdx] || [0, 0, 0, 0];
         const maxQ = Math.max(...qValues);
         let cellType = 'Empty';
         if (grid[r][c] === -1) cellType = 'Obstacle';
         if (startPos && r === startPos.r && c === startPos.c) cellType = 'Start';
         if (goalPos && r === goalPos.r && c === goalPos.c) cellType = 'Goal';

         cellInfoBox.innerHTML = `Cell: (${r}, ${c}) | Idx: ${stateIdx} | ${cellType}<br>MaxQ: ${maxQ.toFixed(3)}<br>` +
            `Q(U): ${qValues[0].toFixed(3)} | Q(D): ${qValues[1].toFixed(3)}<br>` +
            `Q(L): ${qValues[2].toFixed(3)} | Q(R): ${qValues[3].toFixed(3)}`;
         cellInfoBox.style.opacity = '1';
     }


    // --- Persistence ---
     function saveQTable() {
         try {
             const dataToSave = {
                 gridSize: GRID_SIZE, // Save grid size for validation on load
                 qTable: qTable,
                 globalMinQ: globalMinQ,
                 globalMaxQ: globalMaxQ
             };
             localStorage.setItem('qLearningVisualizer_qTable', JSON.stringify(dataToSave));
             setStatus("Q-Table Saved to LocalStorage.", "idle");
         } catch (e) {
             console.error("Error saving Q-Table:", e);
             setStatus("Error saving Q-Table.", "error");
             alert("Could not save Q-Table. LocalStorage might be full or disabled.");
         }
     }

    function loadQTable() {
         try {
             const savedData = localStorage.getItem('qLearningVisualizer_qTable');
             if (!savedData) {
                 alert("No saved Q-Table found in LocalStorage.");
                 return;
             }
             const loadedData = JSON.parse(savedData);

             if (loadedData.gridSize !== GRID_SIZE) {
                  if (!confirm(`Saved Q-Table is for a ${loadedData.gridSize}x${loadedData.gridSize} grid. Current grid is ${GRID_SIZE}x${GRID_SIZE}. Load anyway? (Environment layout might not match)`)) {
                      return;
                  }
                  // If they proceed, we might want to resize the grid or just warn them
                  console.warn(`Loading Q-Table from different grid size (${loadedData.gridSize} vs ${GRID_SIZE})`);
             }

             qTable = loadedData.qTable || {};
             globalMinQ = loadedData.globalMinQ || 0;
             globalMaxQ = loadedData.globalMaxQ || 0;

             // Reset simulation state but keep loaded Q-table
             resetSimulationState();
             epsilon = EPSILON_MIN; // Assume loaded table is trained, set epsilon low
             setStatus("Q-Table Loaded. Epsilon set low.", "idle");
             updateInfoDisplay(); // Update UI with loaded values
             // No need to call draw() here, renderLoop handles it

         } catch (e) {
             console.error("Error loading Q-Table:", e);
             setStatus("Error loading Q-Table.", "error");
             alert("Could not load Q-Table. Data might be corrupted or incompatible.");
         }
     }

    // --- Initial Setup ---
    init();

}); // End DOMContentLoaded
