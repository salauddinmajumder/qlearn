document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('gridCanvas');
    const ctx = canvas.getContext('2d');
    const gridSizeSelect = document.getElementById('gridSize');
    const obstacleProbSlider = document.getElementById('obstacleProb');
    const obstacleProbValueSpan = document.getElementById('obstacleProbValue');
    const resetEnvBtn = document.getElementById('resetEnvBtn');
    const speedSlider = document.getElementById('speed');
    const speedValueSpan = document.getElementById('speedValue');
    const startTrainingBtn = document.getElementById('startTrainingBtn');
    const stopTrainingBtn = document.getElementById('stopTrainingBtn');
    const runGreedyBtn = document.getElementById('runGreedyBtn');
    const showQArrowsCheckbox = document.getElementById('showQArrows');
    const showHeatmapCheckbox = document.getElementById('showHeatmap');
    const showPathCheckbox = document.getElementById('showPath');
    const statusDisplay = document.getElementById('statusDisplay');
    const episodeDisplay = document.getElementById('episodeDisplay');
    const totalEpisodesDisplay = document.getElementById('totalEpisodesDisplay');
    const stepsDisplay = document.getElementById('stepsDisplay');
    const rewardDisplay = document.getElementById('rewardDisplay');
    const epsilonDisplay = document.getElementById('epsilonDisplay');
    const avgRewardDisplay = document.getElementById('avgRewardDisplay');
    const globalMaxQDisplay = document.getElementById('globalMaxQDisplay');
    const globalMinQDisplay = document.getElementById('globalMinQDisplay');


    // --- Configuration ---
    let GRID_SIZE = parseInt(gridSizeSelect.value);
    let OBSTACLE_PROB = parseInt(obstacleProbSlider.value) / 100;
    let CELL_SIZE = canvas.width / GRID_SIZE;
    const START_COLOR = getCssVar('--color-start');
    const GOAL_COLOR = getCssVar('--color-goal');
    const OBSTACLE_COLOR = getCssVar('--color-obstacle');
    const EMPTY_COLOR = getCssVar('--color-empty');
    const AGENT_COLOR = getCssVar('--color-agent');
    const PATH_COLOR = getCssVar('--color-path');
    const Q_ARROW_COLOR = getCssVar('--color-q-arrow');
    const GRID_LINE_COLOR = getCssVar('--color-grid-line');
    const HEATMAP_LOW = getCssVar('--color-heatmap-low');
    const HEATMAP_MID = getCssVar('--color-heatmap-mid');
    const HEATMAP_HIGH = getCssVar('--color-heatmap-high');

    // Environment Rewards
    const REWARD_GOAL = 50; // Increased goal reward
    const REWARD_OBSTACLE = -50; // Increased obstacle penalty
    const REWARD_STEP = -1; // Cost of living

    const ACTIONS = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 };
    const ACTION_DELTAS = {
        [ACTIONS.UP]: { r: -1, c: 0 },
        [ACTIONS.DOWN]: { r: 1, c: 0 },
        [ACTIONS.LEFT]: { r: 0, c: -1 },
        [ACTIONS.RIGHT]: { r: 0, c: 1 },
    };
    const ACTION_NAMES = ['UP', 'DOWN', 'LEFT', 'RIGHT']; // For debugging/display

    // --- Q-Learning Parameters ---
    const LEARNING_RATE = 0.1; // Alpha
    const DISCOUNT_FACTOR = 0.98; // Gamma - slightly higher emphasis on future
    let epsilon = 1.0;
    const EPSILON_DECAY = 0.999; // Slower decay for more exploration initially
    const MIN_EPSILON = 0.02; // Lower minimum epsilon
    const MAX_EPISODES = 1500; // Increased episodes for potentially complex envs
    let MAX_STEPS_PER_EPISODE = GRID_SIZE * GRID_SIZE * 2; // Allow more steps

    // --- State Variables ---
    let grid = []; // 0: empty, -1: obstacle
    let qTable = {}; // { stateIndex: [qUp, qDown, qLeft, qRight] }
    let startPos = { r: 0, c: 0 };
    let goalPos = { r: GRID_SIZE - 1, c: GRID_SIZE - 1 };
    let agentPos = { r: 0, c: 0 };
    let currentEpisode = 0;
    let currentStep = 0;
    let episodeReward = 0;
    let episodePath = [];
    let isTraining = false;
    let isRunning = false;
    let animationFrameId = null; // Store the animation frame request ID
    let stepDelay = 1000 - parseInt(speedSlider.value);
    let recentRewards = [];
    const REWARD_AVERAGE_WINDOW = 50;
    let globalMaxQ = -Infinity; // Track max Q seen for heatmap normalization
    let globalMinQ = Infinity;  // Track min Q seen

    // --- Utility Functions ---
    function getCssVar(varName) {
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    }

    function stateToIndex(state) {
        // Ensure state is valid before calculating index
        if (state && typeof state.r === 'number' && typeof state.c === 'number') {
             return state.r * GRID_SIZE + state.c;
        }
        console.error("Invalid state object:", state);
        return -1; // Return an invalid index
    }


    function isValid(r, c) {
        return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
    }

    function sleep(ms) {
        // Use a minimum sleep time to allow rendering even at max speed
        return new Promise(resolve => setTimeout(resolve, Math.max(ms, 5)));
    }

    function updateSpeedDisplay(value) {
        const speedVal = parseInt(value);
        if (speedVal > 900) speedValueSpan.textContent = 'Max';
        else if (speedVal > 700) speedValueSpan.textContent = 'Very Fast';
        else if (speedVal > 500) speedValueSpan.textContent = 'Fast';
        else if (speedVal > 300) speedValueSpan.textContent = 'Medium';
        else if (speedVal > 100) speedValueSpan.textContent = 'Slow';
        else speedValueSpan.textContent = 'Very Slow';
        stepDelay = 1000 - speedVal;
    }

    // Linear interpolation
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // Color interpolation (simple RGB)
    function lerpColor(colorA, colorB, t) {
        const rA = parseInt(colorA.slice(1, 3), 16);
        const gA = parseInt(colorA.slice(3, 5), 16);
        const bA = parseInt(colorA.slice(5, 7), 16);
        const rB = parseInt(colorB.slice(1, 3), 16);
        const gB = parseInt(colorB.slice(3, 5), 16);
        const bB = parseInt(colorB.slice(5, 7), 16);

        const r = Math.round(lerp(rA, rB, t)).toString(16).padStart(2, '0');
        const g = Math.round(lerp(gA, gB, t)).toString(16).padStart(2, '0');
        const b = Math.round(lerp(bA, bB, t)).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
     // Get heatmap color based on value (normalized) - using 3 points
    function getHeatmapColor(value) {
        if (value <= 0.5) {
            // Interpolate between low and mid
            return lerpColor(HEATMAP_LOW, HEATMAP_MID, value * 2);
        } else {
            // Interpolate between mid and high
            return lerpColor(HEATMAP_MID, HEATMAP_HIGH, (value - 0.5) * 2);
        }
    }


    // --- Environment Initialization ---
     function initializeEnvironment(forceRegen = true) {
        setStatus('Initializing...', 'initializing');
        if (animationFrameId) cancelAnimationFrame(animationFrameId); // Stop any previous animation
        isRunning = false; // Ensure simulation stops

        if (forceRegen) {
            grid = [];
             qTable = {}; // Reset Q-table only when regenerating obstacles
             globalMaxQ = -Infinity;
             globalMinQ = Infinity;
             epsilon = 1.0; // Reset exploration only when fully regenerating
             currentEpisode = 0; // Reset episode count
             recentRewards = []; // Reset rewards tracking

            for (let r = 0; r < GRID_SIZE; r++) {
                grid[r] = [];
                for (let c = 0; c < GRID_SIZE; c++) {
                    grid[r][c] = Math.random() < OBSTACLE_PROB ? -1 : 0;
                }
            }

            // Define default start/goal - ensure they are different
            startPos = { r: 0, c: 0 };
            goalPos = { r: GRID_SIZE - 1, c: GRID_SIZE - 1 };

            // Ensure start and goal are clear and not the same
             let tries = 0;
             const maxTries = GRID_SIZE * GRID_SIZE;

             // Find clear start pos
            while(grid[startPos.r][startPos.c] === -1 && tries < maxTries) {
                 startPos = {r: Math.floor(Math.random() * GRID_SIZE), c: Math.floor(Math.random() * GRID_SIZE)};
                 tries++;
            }
             if (grid[startPos.r][startPos.c] === -1) { // If still couldn't find clear start
                 console.warn("Could not find a clear start position!");
                 // Force clear 0,0 if possible
                 if (isValid(0,0)) grid[0][0] = 0;
                 startPos = { r: 0, c: 0 };
             } else {
                 grid[startPos.r][startPos.c] = 0; // Ensure it's marked clear
             }


            // Find clear goal pos, different from start
             tries = 0;
             while((grid[goalPos.r][goalPos.c] === -1 || (goalPos.r === startPos.r && goalPos.c === startPos.c)) && tries < maxTries) {
                 goalPos = {r: Math.floor(Math.random() * GRID_SIZE), c: Math.floor(Math.random() * GRID_SIZE)};
                 tries++;
             }
            if (grid[goalPos.r][goalPos.c] === -1 || (goalPos.r === startPos.r && goalPos.c === startPos.c)) { // If couldn't find clear, different goal
                 console.warn("Could not find a clear, distinct goal position!");
                 // Try bottom right as fallback if clear and different
                  if (isValid(GRID_SIZE-1, GRID_SIZE-1) && grid[GRID_SIZE-1][GRID_SIZE-1] === 0 && (GRID_SIZE-1 !== startPos.r || GRID_SIZE-1 !== startPos.c)) {
                      goalPos = {r: GRID_SIZE-1, c: GRID_SIZE-1};
                  } else { // Final fallback: find *any* clear non-start cell
                      for(let r=GRID_SIZE-1; r>=0; r--) for(let c=GRID_SIZE-1; c>=0; c--) {
                           if(grid[r][c] === 0 && (r !== startPos.r || c !== startPos.c)) {
                               goalPos = {r,c};
                               tries = maxTries; // Break outer loop
                               break;
                           }
                      }
                  }
            }
             grid[goalPos.r][goalPos.c] = 0; // Ensure it's marked clear
        }


        resetAgent(); // Reset agent position and episode stats
        updateInfoDisplay(); // Update UI text
        drawGrid(); // Initial draw
        setStatus('Initialized. Ready.');
    }

    function resetAgent() {
        agentPos = { ...startPos };
        currentStep = 0;
        episodeReward = 0;
        episodePath = [ { ...agentPos } ];
    }

    // --- Drawing Functions ---
    function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const showHeatmap = showHeatmapCheckbox.checked;
        const rangeQ = (globalMaxQ > globalMinQ) ? globalMaxQ - globalMinQ : 1; // Avoid division by zero

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const stateIdx = stateToIndex({ r, c });
                const maxQ = getMaxQValue(stateIdx);
                let cellColor = EMPTY_COLOR;

                // 1. Draw Heatmap Background (if enabled)
                if (showHeatmap && grid[r][c] !== -1 && qTable[stateIdx]) {
                     // Normalize maxQ to 0-1 range based on global min/max
                     const normalizedValue = (maxQ - globalMinQ) / rangeQ;
                     cellColor = getHeatmapColor(Math.max(0, Math.min(1, normalizedValue))); // Clamp between 0 and 1
                }

                // 2. Draw Base Cell Color (overwrites heatmap if start/goal/obstacle)
                 if (r === startPos.r && c === startPos.c) cellColor = START_COLOR;
                 else if (r === goalPos.r && c === goalPos.c) cellColor = GOAL_COLOR;
                 else if (grid[r][c] === -1) cellColor = OBSTACLE_COLOR;

                ctx.fillStyle = cellColor;
                ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);

                 // 3. Draw Grid Lines
                ctx.strokeStyle = GRID_LINE_COLOR;
                ctx.lineWidth = 1;
                ctx.strokeRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);

                // 4. Draw Q-value indicators (if enabled)
                if (showQArrowsCheckbox.checked && grid[r][c] !== -1) {
                   drawQArrows(r, c, maxQ, rangeQ); // Pass maxQ and range for context
                }
            }
        }

        // 5. Draw Path (if enabled)
        if (showPathCheckbox.checked) {
             drawPath();
        }

        // 6. Draw Agent (always on top)
        drawAgent();
    }

    function drawAgent() {
        ctx.fillStyle = AGENT_COLOR;
        const centerX = agentPos.c * CELL_SIZE + CELL_SIZE / 2;
        const centerY = agentPos.r * CELL_SIZE + CELL_SIZE / 2;
        const radius = CELL_SIZE * 0.3; // Slightly smaller agent
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        // Add a subtle border
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function drawPath() {
        if (episodePath.length < 2) return;
        ctx.strokeStyle = PATH_COLOR;
        ctx.lineWidth = Math.max(2, CELL_SIZE * 0.1); // Path thickness relative to cell size
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(episodePath[0].c * CELL_SIZE + CELL_SIZE / 2, episodePath[0].r * CELL_SIZE + CELL_SIZE / 2);
        for (let i = 1; i < episodePath.length; i++) {
             ctx.lineTo(episodePath[i].c * CELL_SIZE + CELL_SIZE / 2, episodePath[i].r * CELL_SIZE + CELL_SIZE / 2);
        }
        ctx.stroke();
    }

    function drawQArrows(r, c, cellMaxQ, qRange) {
        const stateIdx = stateToIndex({ r, c });
        const qValues = qTable[stateIdx] || [0, 0, 0, 0];

        // Don't draw if all Qs are effectively zero or the same
        if (qRange < 0.01 || Math.abs(cellMaxQ - globalMinQ) < 0.01) return;

        const centerX = c * CELL_SIZE + CELL_SIZE / 2;
        const centerY = r * CELL_SIZE + CELL_SIZE / 2;
        const baseSize = CELL_SIZE * 0.08; // Base width of the arrow triangle
        const maxLen = CELL_SIZE * 0.4; // Max length from center

        ctx.fillStyle = Q_ARROW_COLOR;

        for (let action = 0; action < 4; action++) {
            const q = qValues[action];
            // Normalize Q relative to the *global* range for consistent length
            const normalizedQ = (q - globalMinQ) / qRange;
            const len = maxLen * Math.max(0, Math.min(1, normalizedQ)); // Clamp length

            if (len < 2) continue; // Don't draw tiny arrows

            ctx.beginPath();
            const delta = ACTION_DELTAS[action];
            const tipX = centerX + delta.c * len;
            const tipY = centerY + delta.r * len;

            // Vector perpendicular to arrow direction for base calculation
            const perpDx = -delta.r;
            const perpDy = delta.c;

            // Calculate base points - move base slightly away from center
            const baseCenterX = centerX + delta.c * (len * 0.2);
            const baseCenterY = centerY + delta.r * (len * 0.2);

            const base1X = baseCenterX + perpDx * baseSize;
            const base1Y = baseCenterY + perpDy * baseSize;
            const base2X = baseCenterX - perpDx * baseSize;
            const base2Y = baseCenterY - perpDy * baseSize;

            ctx.moveTo(tipX, tipY);
            ctx.lineTo(base1X, base1Y);
            ctx.lineTo(base2X, base2Y);
            ctx.closePath();
            ctx.fill();
        }
    }

    // --- Q-Learning Logic ---
    function getQValue(stateIdx, action) {
         // Initialize state in Q-table if it doesn't exist
        if (!qTable[stateIdx]) {
            qTable[stateIdx] = [0, 0, 0, 0];
        }
        return qTable[stateIdx][action];
    }

    function getMaxQValue(stateIdx) {
         if (!qTable[stateIdx]) {
            return 0; // If state hasn't been visited, its value is 0
        }
        return Math.max(...qTable[stateIdx]);
    }

     function chooseAction(stateIdx) {
        const qValues = qTable[stateIdx] || [0, 0, 0, 0]; // Default if state is new

        if (isTraining && Math.random() < epsilon) {
            return Math.floor(Math.random() * 4); // Explore
        } else {
            // Exploit
            const maxQ = Math.max(...qValues);
            const bestActions = [];
            for (let i = 0; i < qValues.length; i++) {
                // Use a small tolerance for comparing floating point numbers
                if (Math.abs(qValues[i] - maxQ) < 1e-6) {
                    bestActions.push(i);
                }
            }
            // Randomly select among the best actions in case of a tie
            return bestActions[Math.floor(Math.random() * bestActions.length)];
        }
    }

    function updateQTable(stateIdx, action, reward, nextStateIdx, done) {
        const currentQ = getQValue(stateIdx, action); // Ensures state exists in Q-table
        const maxNextQ = done ? 0 : getMaxQValue(nextStateIdx);
        const targetQ = reward + DISCOUNT_FACTOR * maxNextQ;
        const newQ = currentQ + LEARNING_RATE * (targetQ - currentQ);

        qTable[stateIdx][action] = newQ;

        // Update global min/max Q seen
        if (newQ > globalMaxQ) globalMaxQ = newQ;
        if (newQ < globalMinQ) globalMinQ = newQ;
    }

    // --- Simulation Step ---
    function takeStep(runMode) {
        isTraining = (runMode === 'training');

        const currentState = { ...agentPos };
        const currentStateIdx = stateToIndex(currentState);
        if (currentStateIdx < 0) return { done: true }; // Invalid state check

        const action = chooseAction(currentStateIdx);
        const delta = ACTION_DELTAS[action];

        let nextPos = { r: currentState.r + delta.r, c: currentState.c + delta.c };
        let reward = REWARD_STEP;
        let done = false;
        let event = 'move'; // 'goal', 'obstacle', 'wall'

        if (!isValid(nextPos.r, nextPos.c)) {
            nextPos = { ...currentState }; // Hit wall
            // Keep reward as REWARD_STEP (penalty for trying invalid move)
             event = 'wall';
        } else if (grid[nextPos.r][nextPos.c] === -1) {
            reward = REWARD_OBSTACLE; // Hit obstacle
            done = true;
            nextPos = { ...currentState }; // Agent doesn't move into obstacle
             event = 'obstacle';
        } else if (nextPos.r === goalPos.r && nextPos.c === goalPos.c) {
            reward = REWARD_GOAL; // Reached goal
            done = true;
            agentPos = { ...nextPos }; // Move to goal state
             event = 'goal';
        } else {
            agentPos = { ...nextPos }; // Valid move
        }

        const nextStateIdx = stateToIndex(agentPos);
         if (nextStateIdx < 0) return { done: true }; // Invalid next state check

        if (isTraining) {
            updateQTable(currentStateIdx, action, reward, nextStateIdx, done);
        }

        episodeReward += reward;
        currentStep++;
         if(episodePath.length === 0 || agentPos.r !== episodePath[episodePath.length-1].r || agentPos.c !== episodePath[episodePath.length-1].c) {
             episodePath.push({ ...agentPos }); // Add new position only if it changed
         }

        return { done, event };
    }

    // --- Simulation Loops ---
    function runEpisode(runMode) {
        return new Promise(async (resolve) => {
            resetAgent();
            let stepResult = {};
            let localStep = 0; // Use local step counter for max step check

            while (localStep < MAX_STEPS_PER_EPISODE) {
                if (!isRunning) {
                    setStatus('Stopped.', 'stopped');
                    resolve({ finished: false, totalReward: episodeReward });
                    return;
                }

                stepResult = takeStep(runMode);
                localStep++; // Increment local counter

                drawGrid(); // Update visuals every step
                updateInfoDisplay(); // Update text info

                if (stepResult.done) break;

                await sleep(stepDelay);
            }

            // Episode finished
            resolve({ finished: true, totalReward: episodeReward });
        });
    }

    async function simulationLoop(runMode) {
         setStatus(runMode === 'training' ? 'Training...' : 'Running Greedy...', runMode);
         startTrainingBtn.disabled = true;
         stopTrainingBtn.disabled = (runMode === 'greedy'); // Can't stop greedy
         runGreedyBtn.disabled = true;
         resetEnvBtn.disabled = true;
         isRunning = true;
         isTraining = (runMode === 'training'); // Set global flag

         if (runMode === 'training') {
             while (currentEpisode < MAX_EPISODES && isRunning) {
                 currentEpisode++;
                 const result = await runEpisode('training');

                 if (!result.finished) break; // Loop was stopped externally

                 if (epsilon > MIN_EPSILON) {
                     epsilon *= EPSILON_DECAY;
                 }

                 recentRewards.push(result.totalReward);
                 if (recentRewards.length > REWARD_AVERAGE_WINDOW) {
                     recentRewards.shift();
                 }
                 updateInfoDisplay();
                 await sleep(1); // Tiny pause between episodes
             }
             setStatus(isRunning ? 'Training Finished.' : 'Stopped.', isRunning ? 'finished' : 'stopped');

         } else { // Greedy Mode
              const result = await runEpisode('greedy');
              setStatus('Greedy Policy Run Finished.', 'finished');
         }


         // Cleanup after loop finishes or stops
         isRunning = false;
         startTrainingBtn.disabled = false;
         stopTrainingBtn.disabled = true;
         runGreedyBtn.disabled = false;
         resetEnvBtn.disabled = false;
         updateInfoDisplay(); // Final UI update
    }


    function stopSimulation() {
        isRunning = false; // Signal loops to stop
        if (animationFrameId) cancelAnimationFrame(animationFrameId); // Stop rendering loop if any
        setStatus('Stopping...', 'stopped');
        stopTrainingBtn.disabled = true; // Disable stop button immediately
        // Other buttons will be re-enabled when the loop actually exits
    }


    // --- UI Updates ---
    function updateInfoDisplay() {
        // Status is set by setStatus function
        episodeDisplay.textContent = currentEpisode;
        totalEpisodesDisplay.textContent = MAX_EPISODES;
        stepsDisplay.textContent = currentStep;
        rewardDisplay.textContent = episodeReward.toFixed(0);
        epsilonDisplay.textContent = isTraining ? epsilon.toFixed(3) : 'N/A (Greedy)';

        if (recentRewards.length > 0) {
            const avg = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;
            avgRewardDisplay.textContent = avg.toFixed(2);
        } else {
             avgRewardDisplay.textContent = "N/A";
        }

        globalMaxQDisplay.textContent = globalMaxQ === -Infinity ? 'N/A' : globalMaxQ.toFixed(3);
        globalMinQDisplay.textContent = globalMinQ === Infinity ? 'N/A' : globalMinQ.toFixed(3);
    }

    function setStatus(message, className = '') {
        statusDisplay.textContent = message;
        statusDisplay.className = className;
    }


    // --- Event Listeners ---
    gridSizeSelect.addEventListener('change', (e) => {
        GRID_SIZE = parseInt(e.target.value);
        CELL_SIZE = canvas.width / GRID_SIZE;
        MAX_STEPS_PER_EPISODE = GRID_SIZE * GRID_SIZE * 2; // Adjust max steps
        initializeEnvironment(true); // Force full regeneration
    });

    obstacleProbSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        OBSTACLE_PROB = value / 100;
        obstacleProbValueSpan.textContent = `${value}%`;
        // Does not auto-reset - user must click button
    });

    resetEnvBtn.addEventListener('click', () => {
        if (isRunning) return; // Prevent reset during run
        initializeEnvironment(true);
    });

    speedSlider.addEventListener('input', (e) => {
        updateSpeedDisplay(e.target.value);
    });

    startTrainingBtn.addEventListener('click', () => simulationLoop('training'));
    stopTrainingBtn.addEventListener('click', stopSimulation);
    runGreedyBtn.addEventListener('click', () => simulationLoop('greedy'));

    // Listeners for visualization toggles - just redraw immediately
    showQArrowsCheckbox.addEventListener('change', drawGrid);
    showHeatmapCheckbox.addEventListener('change', drawGrid);
    showPathCheckbox.addEventListener('change', drawGrid);


    // --- Initial Setup ---
    updateSpeedDisplay(speedSlider.value);
    obstacleProbValueSpan.textContent = `${obstacleProbSlider.value}%`;
    totalEpisodesDisplay.textContent = MAX_EPISODES; // Set max episodes display
    initializeEnvironment(true); // Initial setup
});
