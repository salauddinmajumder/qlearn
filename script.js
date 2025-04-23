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
    const statusDisplay = document.getElementById('statusDisplay');
    const episodeDisplay = document.getElementById('episodeDisplay');
    const totalEpisodesDisplay = document.getElementById('totalEpisodesDisplay');
    const stepsDisplay = document.getElementById('stepsDisplay');
    const rewardDisplay = document.getElementById('rewardDisplay');
    const epsilonDisplay = document.getElementById('epsilonDisplay');
    const avgRewardDisplay = document.getElementById('avgRewardDisplay');

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

    const REWARD_GOAL = 20;
    const REWARD_OBSTACLE = -20;
    const REWARD_STEP = -1;

    const ACTIONS = { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 };
    const ACTION_DELTAS = {
        [ACTIONS.UP]: { r: -1, c: 0 },
        [ACTIONS.DOWN]: { r: 1, c: 0 },
        [ACTIONS.LEFT]: { r: 0, c: -1 },
        [ACTIONS.RIGHT]: { r: 0, c: 1 },
    };

    // --- Q-Learning Parameters ---
    const LEARNING_RATE = 0.1; // Alpha
    const DISCOUNT_FACTOR = 0.95; // Gamma
    let epsilon = 1.0;
    const EPSILON_DECAY = 0.998; // Decay per episode
    const MIN_EPSILON = 0.05;
    const MAX_EPISODES = 1000;
    let MAX_STEPS_PER_EPISODE = GRID_SIZE * GRID_SIZE * 1.5; // Heuristic

    // --- State Variables ---
    let grid = []; // 0: empty, -1: obstacle
    let qTable = {}; // { stateIndex: [qUp, qDown, qLeft, qRight] }
    let startPos = { r: 0, c: 0 };
    let goalPos = { r: GRID_SIZE - 1, c: GRID_SIZE - 1 };
    let agentPos = { r: 0, c: 0 };
    let currentEpisode = 0;
    let currentStep = 0;
    let episodeReward = 0;
    let episodePath = []; // Store agent's path in the episode
    let isTraining = false;
    let isRunning = false; // General flag for any active process
    let animationFrameId = null;
    let stepDelay = 1000 - parseInt(speedSlider.value); // Inverse relationship: higher slider value = faster speed
    let recentRewards = []; // For calculating average reward
    const REWARD_AVERAGE_WINDOW = 50;


    // --- Utility Functions ---
    function getCssVar(varName) {
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    }

    function stateToIndex(state) {
        return state.r * GRID_SIZE + state.c;
    }

    function isValid(r, c) {
        return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Update speed display text
    function updateSpeedDisplay(value) {
        if (value > 900) speedValueSpan.textContent = 'Very Fast';
        else if (value > 600) speedValueSpan.textContent = 'Fast';
        else if (value > 300) speedValueSpan.textContent = 'Medium';
        else if (value > 50) speedValueSpan.textContent = 'Slow';
        else speedValueSpan.textContent = 'Very Slow';
        stepDelay = 1000 - value; // Update delay
    }

    // --- Environment Initialization ---
    function initializeEnvironment() {
        grid = [];
        qTable = {}; // Reset Q-table
        epsilon = 1.0; // Reset exploration
        currentEpisode = 0;
        recentRewards = [];
        updateInfoDisplay(); // Reset display


        for (let r = 0; r < GRID_SIZE; r++) {
            grid[r] = [];
            for (let c = 0; c < GRID_SIZE; c++) {
                grid[r][c] = Math.random() < OBSTACLE_PROB ? -1 : 0;
            }
        }

        // Ensure start and goal are clear and different
        startPos = { r: 0, c: 0 };
        goalPos = { r: GRID_SIZE - 1, c: GRID_SIZE - 1 };
        grid[startPos.r][startPos.c] = 0; // Clear start
        grid[goalPos.r][goalPos.c] = 0; // Clear goal

        // Try to find random clear spots if default are blocked (simple approach)
        if (grid[startPos.r][startPos.c] === -1) {
             for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) if (grid[r][c] === 0) { startPos = {r, c}; break; }
        }
         if (grid[goalPos.r][goalPos.c] === -1 || (goalPos.r === startPos.r && goalPos.c === startPos.c)) {
             for (let r = GRID_SIZE-1; r >= 0; r--) for (let c = GRID_SIZE-1; c >= 0; c--) if (grid[r][c] === 0 && (r !== startPos.r || c !== startPos.c)) { goalPos = {r, c}; break; }
        }


        resetAgent();
        drawGrid();
        setStatus('Initialized. Ready to train.');
    }

    function resetAgent() {
        agentPos = { ...startPos };
        currentStep = 0;
        episodeReward = 0;
        episodePath = [ { ...agentPos } ]; // Start path trace
    }


    // --- Drawing Functions ---
     function drawGrid() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = GRID_LINE_COLOR; // Light lines for the grid

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                let color = EMPTY_COLOR;
                if (r === startPos.r && c === startPos.c) color = START_COLOR;
                else if (r === goalPos.r && c === goalPos.c) color = GOAL_COLOR;
                else if (grid[r][c] === -1) color = OBSTACLE_COLOR;

                ctx.fillStyle = color;
                ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                ctx.strokeRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE); // Draw cell border

                // Draw Q-value indicators (arrows)
                if (grid[r][c] !== -1) {
                   drawQArrows(r, c);
                }
            }
        }
        drawPath(); // Draw trace after grid
        drawAgent(); // Draw agent on top
    }

     function drawAgent() {
        ctx.fillStyle = AGENT_COLOR;
        // Draw a circle slightly smaller than the cell
        const centerX = agentPos.c * CELL_SIZE + CELL_SIZE / 2;
        const centerY = agentPos.r * CELL_SIZE + CELL_SIZE / 2;
        const radius = CELL_SIZE * 0.35;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
    }

    function drawPath() {
        if (episodePath.length < 2) return;
        ctx.fillStyle = PATH_COLOR;
        for (const pos of episodePath) {
            ctx.fillRect(pos.c * CELL_SIZE + CELL_SIZE * 0.25, pos.r * CELL_SIZE + CELL_SIZE * 0.25, CELL_SIZE * 0.5, CELL_SIZE * 0.5);
        }
        // Optional: Draw lines connecting path centers
        /*
        ctx.strokeStyle = PATH_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(episodePath[0].c * CELL_SIZE + CELL_SIZE / 2, episodePath[0].r * CELL_SIZE + CELL_SIZE / 2);
        for (let i = 1; i < episodePath.length; i++) {
             ctx.lineTo(episodePath[i].c * CELL_SIZE + CELL_SIZE / 2, episodePath[i].r * CELL_SIZE + CELL_SIZE / 2);
        }
        ctx.stroke();
        */
    }

     function drawQArrows(r, c) {
        const stateIdx = stateToIndex({ r, c });
        const qValues = qTable[stateIdx] || [0, 0, 0, 0]; // Default to 0 if state not visited

        // Find max Q-value for normalization (avoid division by zero)
        let maxQ = -Infinity;
        let minQ = Infinity;
         qValues.forEach(q => {
             if (q > maxQ) maxQ = q;
             if (q < minQ) minQ = q;
         });

        // Avoid drawing if all Qs are zero or range is tiny
         if (maxQ === minQ || Math.abs(maxQ - minQ) < 0.01) {
             return;
         }

        const centerX = c * CELL_SIZE + CELL_SIZE / 2;
        const centerY = r * CELL_SIZE + CELL_SIZE / 2;
        const arrowBaseSize = CELL_SIZE * 0.1; // Base size of the arrow triangle
        const maxArrowLength = CELL_SIZE * 0.35; // Max length from center

        ctx.fillStyle = Q_ARROW_COLOR;
        ctx.strokeStyle = Q_ARROW_COLOR;
        ctx.lineWidth = 1;


        for (let action = 0; action < 4; action++) {
            const q = qValues[action];
            // Normalize Q-value to range [0, 1] for length scaling
            const normalizedQ = (maxQ === minQ) ? 0.5 : (q - minQ) / (maxQ - minQ);
            const arrowLength = maxArrowLength * normalizedQ;

            if (arrowLength < 1) continue; // Don't draw tiny arrows

            ctx.beginPath();
            let arrowTipX, arrowTipY;
            const delta = ACTION_DELTAS[action];

            // Calculate arrow tip position based on action direction
            arrowTipX = centerX + delta.c * arrowLength;
            arrowTipY = centerY + delta.r * arrowLength;

            // Base points perpendicular to the arrow direction
            const perpDx = -delta.r; // Perpendicular vector component x
            const perpDy = delta.c;  // Perpendicular vector component y

            const base1X = centerX + delta.c * (arrowLength * 0.5) + perpDx * arrowBaseSize;
            const base1Y = centerY + delta.r * (arrowLength * 0.5) + perpDy * arrowBaseSize;
            const base2X = centerX + delta.c * (arrowLength * 0.5) - perpDx * arrowBaseSize;
            const base2Y = centerY + delta.r * (arrowLength * 0.5) - perpDy * arrowBaseSize;


            ctx.moveTo(arrowTipX, arrowTipY);
            ctx.lineTo(base1X, base1Y);
            ctx.lineTo(base2X, base2Y);
            ctx.closePath();
            ctx.fill();
        }
    }

    // --- Q-Learning Logic ---
    function getQValue(stateIdx, action) {
        return (qTable[stateIdx] || [0, 0, 0, 0])[action];
    }

    function getMaxQValue(stateIdx) {
        return Math.max(...(qTable[stateIdx] || [0, 0, 0, 0]));
    }

     function chooseAction(stateIdx) {
        if (isTraining && Math.random() < epsilon) {
            return Math.floor(Math.random() * 4); // Explore: random action
        } else {
            // Exploit: choose best action
            const qValues = qTable[stateIdx] || [0, 0, 0, 0];
            const maxQ = Math.max(...qValues);
            // Handle ties by randomly choosing among the best actions
            const bestActions = [];
            for (let i = 0; i < qValues.length; i++) {
                if (qValues[i] === maxQ) {
                    bestActions.push(i);
                }
            }
            return bestActions[Math.floor(Math.random() * bestActions.length)];
        }
    }

    function updateQTable(stateIdx, action, reward, nextStateIdx, done) {
        const currentQ = getQValue(stateIdx, action);
        const maxNextQ = done ? 0 : getMaxQValue(nextStateIdx); // No future reward if done
        const targetQ = reward + DISCOUNT_FACTOR * maxNextQ;
        const newQ = currentQ + LEARNING_RATE * (targetQ - currentQ);

        if (!qTable[stateIdx]) {
            qTable[stateIdx] = [0, 0, 0, 0];
        }
        qTable[stateIdx][action] = newQ;
    }

    // --- Simulation Step ---
    function takeStep(runMode) { // runMode: 'training' or 'greedy'
        isTraining = (runMode === 'training'); // Ensure isTraining flag is correct

        const currentState = { ...agentPos };
        const currentStateIdx = stateToIndex(currentState);

        const action = chooseAction(currentStateIdx);
        const delta = ACTION_DELTAS[action];

        let nextPos = { r: currentState.r + delta.r, c: currentState.c + delta.c };
        let reward = REWARD_STEP;
        let done = false;

        if (!isValid(nextPos.r, nextPos.c)) {
            // Hit wall, stay in place
            nextPos = { ...currentState };
            // reward remains REWARD_STEP (or could add extra penalty)
        } else if (grid[nextPos.r][nextPos.c] === -1) {
            // Hit obstacle
            reward = REWARD_OBSTACLE;
            done = true;
            // Optional: agent stays in current pos or moves to obstacle briefly? Let's keep it in current pos
            nextPos = { ...currentState };
        } else if (nextPos.r === goalPos.r && nextPos.c === goalPos.c) {
            // Reached goal
            reward = REWARD_GOAL;
            done = true;
            agentPos = { ...nextPos }; // Move agent to goal
        } else {
            // Normal move
            agentPos = { ...nextPos };
        }

        const nextStateIdx = stateToIndex(agentPos); // Use agentPos after potential update

        if (isTraining) {
             updateQTable(currentStateIdx, action, reward, nextStateIdx, done);
        }

        episodeReward += reward;
        currentStep++;
        episodePath.push({ ...agentPos }); // Add new position to path


        // --- Return step result ---
        return { done, hitObstacle: (reward === REWARD_OBSTACLE), reachedGoal: (reward === REWARD_GOAL) };
    }


    // --- Simulation Loops ---
    function runEpisode(runMode) {
        return new Promise(async (resolve) => {
            resetAgent();
            let stepResult = {};

            while (currentStep < MAX_STEPS_PER_EPISODE) {
                if (!isRunning) { // Check if stop button was pressed
                     setStatus('Stopped.');
                     resolve({ finished: false, totalReward: episodeReward });
                     return;
                }

                stepResult = takeStep(runMode);

                drawGrid();
                updateInfoDisplay();

                if (stepResult.done) break; // Goal reached or obstacle hit

                await sleep(stepDelay); // Pause for visualization
            }

            // Episode finished (done or max steps)
            resolve({ finished: true, totalReward: episodeReward });
        });
    }


     async function startTrainingLoop() {
        if (isRunning) return; // Prevent multiple loops
        isRunning = true;
        isTraining = true; // Make sure this is set
        setStatus('Training...', 'training');
        startTrainingBtn.disabled = true;
        stopTrainingBtn.disabled = false;
        runGreedyBtn.disabled = true;
        resetEnvBtn.disabled = true;


        while (currentEpisode < MAX_EPISODES && isRunning) {
            currentEpisode++;
            const result = await runEpisode('training');

            if (!result.finished) break; // Loop was stopped

            // Decay epsilon after each episode
            if (epsilon > MIN_EPSILON) {
                epsilon *= EPSILON_DECAY;
            }

            // Track average rewards
            recentRewards.push(result.totalReward);
            if(recentRewards.length > REWARD_AVERAGE_WINDOW) {
                recentRewards.shift(); // Remove oldest
            }

            updateInfoDisplay(); // Update display after episode ends

             // Yield slightly between episodes to keep browser responsive
            await sleep(1);
        }

        if (isRunning) { // If loop finished naturally
            setStatus('Training Finished.', 'finished');
        }
        isRunning = false;
        startTrainingBtn.disabled = false;
        stopTrainingBtn.disabled = true;
        runGreedyBtn.disabled = false;
        resetEnvBtn.disabled = false;
    }

     async function runGreedyPolicy() {
        if (isRunning) return; // Prevent overlap
        isRunning = true;
        isTraining = false; // Ensure we use greedy actions
        setStatus('Running Greedy Policy...', 'greedy');
        startTrainingBtn.disabled = true;
        stopTrainingBtn.disabled = true; // Cannot stop greedy run
        runGreedyBtn.disabled = true;
        resetEnvBtn.disabled = true;

        await runEpisode('greedy'); // Run one episode greedily

        setStatus('Greedy Policy Run Finished.', 'finished');
        isRunning = false;
        startTrainingBtn.disabled = false;
        stopTrainingBtn.disabled = true;
        runGreedyBtn.disabled = false;
        resetEnvBtn.disabled = false;
    }

    function stopTraining() {
        isRunning = false; // Signal loops to stop
        setStatus('Stopping...', 'stopped');
        stopTrainingBtn.disabled = true; // Should be re-enabled when loop actually exits
    }


    // --- UI Updates ---
    function updateInfoDisplay() {
        statusDisplay.textContent = statusDisplay.textContent; // Keep current status text
        episodeDisplay.textContent = currentEpisode;
        totalEpisodesDisplay.textContent = MAX_EPISODES;
        stepsDisplay.textContent = currentStep;
        rewardDisplay.textContent = episodeReward.toFixed(0);
        epsilonDisplay.textContent = epsilon.toFixed(3);

        if (recentRewards.length > 0) {
            const avg = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;
            avgRewardDisplay.textContent = avg.toFixed(2);
        } else {
             avgRewardDisplay.textContent = "N/A";
        }
    }

    function setStatus(message, className = '') {
        statusDisplay.textContent = message;
        statusDisplay.className = className; // Apply CSS class for color
    }


    // --- Event Listeners ---
    gridSizeSelect.addEventListener('change', (e) => {
        GRID_SIZE = parseInt(e.target.value);
        CELL_SIZE = canvas.width / GRID_SIZE;
        MAX_STEPS_PER_EPISODE = GRID_SIZE * GRID_SIZE * 1.5;
        initializeEnvironment(); // Re-init everything
    });

    obstacleProbSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        OBSTACLE_PROB = value / 100;
        obstacleProbValueSpan.textContent = `${value}%`;
        // Note: Doesn't auto-reset env. User clicks reset button.
    });

    resetEnvBtn.addEventListener('click', () => {
        if (isRunning) {
            alert("Cannot reset while training or running!");
            return;
        }
        initializeEnvironment();
    });

    speedSlider.addEventListener('input', (e) => {
        updateSpeedDisplay(parseInt(e.target.value));
    });

    startTrainingBtn.addEventListener('click', startTrainingLoop);
    stopTrainingBtn.addEventListener('click', stopTraining);
    runGreedyBtn.addEventListener('click', runGreedyPolicy);

    // --- Initial Setup ---
    updateSpeedDisplay(parseInt(speedSlider.value)); // Set initial speed text
    obstacleProbValueSpan.textContent = `${obstacleProbSlider.value}%`; // Set initial obstacle text
    initializeEnvironment();
});
