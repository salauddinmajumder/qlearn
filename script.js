/* --- Global Styles & Variables --- */
:root {
    --color-primary: #3498db; /* Blue */
    --color-secondary: #95a5a6; /* Gray */
    --color-success: #2ecc71; /* Green */
    --color-danger: #e74c3c; /* Red */
    --color-warning: #f39c12; /* Orange */
    --color-info: #3498db; /* Blue */
    --color-dark: #2c3e50; /* Dark Blue/Gray */
    --color-light: #ecf0f1; /* Light Gray */
    --color-bg: #f8f9fa;
    --color-text: #333;
    --font-family: 'Roboto', sans-serif;

    /* Grid Colors */
    --color-empty: #ffffff;
    --color-obstacle: #596275; /* Darker Gray */
    --color-start: var(--color-primary);
    --color-goal: var(--color-success);
    --color-agent: var(--color-danger);
    --color-path: rgba(231, 76, 60, 0.7); /* Semi-transparent Red */
    --color-q-arrow: var(--color-warning);
    --color-grid-line: #dfe4ea; /* Lighter grid lines */

    /* Heatmap Colors (Example: Blue (low) to Red (high)) */
    --color-heatmap-low: #5fa8d3; /* Light Blue */
    --color-heatmap-mid: #f7d6e0; /* Pinkish */
    --color-heatmap-high: #f85a40; /* Coral Red */
}

body {
    font-family: var(--font-family);
    background-color: var(--color-bg);
    color: var(--color-text);
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.6;
}

header {
    background-color: var(--color-dark);
    color: var(--color-light);
    width: 100%;
    padding: 15px 0;
    text-align: center;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    margin-bottom: 20px;
}

header h1 {
    margin: 0;
    font-weight: 700;
    font-size: 2em;
}
header p {
    margin: 5px 0 0 0;
    font-weight: 300;
}

.container {
    width: 95%;
    max-width: 1200px; /* Limit max width */
    display: flex;
    flex-direction: column;
    align-items: center;
}

/* --- Controls Styling --- */
.controls-panel {
    background-color: #fff;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    margin-bottom: 20px;
    display: flex;
    flex-wrap: wrap; /* Allow wrapping on smaller screens */
    justify-content: center;
    align-items: center;
    gap: 20px; /* Spacing between control groups */
    width: 100%;
    box-sizing: border-box; /* Include padding in width */
}

.control-group {
    display: flex;
    align-items: center;
    gap: 8px; /* Spacing within a group */
}
.control-group label {
    font-weight: 400;
    color: #555;
}

.range-group { /* Specific styling for slider groups */
    min-width: 180px; /* Prevent slider shrinking too much */
}
.range-group input[type="range"] {
    flex-grow: 1; /* Allow slider to take available space */
    cursor: pointer;
}
.range-group span { /* Display slider value */
    font-weight: 700;
    color: var(--color-primary);
    min-width: 50px; /* Ensure space for text */
    text-align: right;
}

.toggle-group input[type="checkbox"] {
    cursor: pointer;
    margin-right: 15px; /* Space out checkboxes */
}

/* Button Styling */
.btn {
    padding: 10px 18px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-weight: 700;
    transition: background-color 0.2s ease, transform 0.1s ease;
    color: #fff;
    font-size: 0.95em;
}
.btn:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
}
.btn:active:not(:disabled) {
    transform: translateY(0px);
    filter: brightness(1.0);
}
.btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    background-color: var(--color-secondary);
}
.btn-primary { background-color: var(--color-primary); }
.btn-secondary { background-color: var(--color-secondary); color: #333; border: 1px solid #ccc;}
.btn-success { background-color: var(--color-success); }
.btn-danger { background-color: var(--color-danger); }


/* Select Box Styling */
select {
    padding: 8px 12px;
    border: 1px solid #ccc;
    border-radius: 5px;
    background-color: #fff;
    cursor: pointer;
}

/* --- Visualization Area --- */
.visualization-area {
    margin-bottom: 20px;
}

canvas {
    border: 3px solid var(--color-dark);
    background-color: #fff;
    display: block; /* Remove extra space below canvas */
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    border-radius: 5px;
}


/* --- Info Panel --- */
#info-panel {
    background-color: var(--color-light);
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 20px;
}
#info-panel h2 {
    margin-top: 0;
    margin-bottom: 15px;
    text-align: center;
    color: var(--color-dark);
    font-weight: 700;
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
}

.info-grid {
    display: grid;
    grid-template-columns: auto 1fr; /* Label column and Value column */
    gap: 8px 15px; /* Row gap and Column gap */
    align-items: center;
}

.info-grid p {
    margin: 0;
}
.info-grid p:nth-child(odd) { /* Style labels */
    font-weight: 400;
    color: #555;
    text-align: right;
}
.info-grid p:nth-child(even) span { /* Style values */
    font-weight: 700;
    color: var(--color-info);
}

/* Status Indicator Colors */
#statusDisplay.training { color: var(--color-warning); }
#statusDisplay.greedy { color: var(--color-success); }
#statusDisplay.stopped { color: var(--color-danger); }
#statusDisplay.finished { color: var(--color-success); }
#statusDisplay.initializing { color: var(--color-secondary); }


/* --- Footer --- */
footer {
    margin-top: 30px;
    padding: 15px;
    width: 100%;
    text-align: center;
    font-size: 0.9em;
    color: #777;
    border-top: 1px solid #eee;
}
