document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const app = document.getElementById('app');
    const uploadArea = document.getElementById('upload-area');
    const audioFileInput = document.getElementById('audio-file-input');
    const uploadButton = document.getElementById('upload-button');
    const fileInfo = document.getElementById('file-info');
    const fileNameEl = document.getElementById('file-name');
    const fileDurationEl = document.getElementById('file-duration');
    const fileSizeEl = document.getElementById('file-size');
    const fileSampleRateEl = document.getElementById('file-sample-rate');
    const dialectSelect = document.getElementById('dialect-select');
    const saveProjectButton = document.getElementById('save-project-button');
    const projectFileInput = document.getElementById('project-file-input');
    const loadProjectButton = document.getElementById('load-project-button');

    const editorSection = document.getElementById('editor-section');
    const waveformControls = document.getElementById('waveform-controls');
    const playPauseButton = document.getElementById('play-pause-button');
    const zoomInButton = document.getElementById('zoom-in-button');
    const zoomOutButton = document.getElementById('zoom-out-button');
    const currentTimeDisplay = document.getElementById('current-time-display');
    const waveformContainer = document.getElementById('waveform-container');
    const waveformCanvas = document.getElementById('waveform-canvas');
    const playhead = document.getElementById('playhead');
    const selectionOverlay = document.getElementById('selection-overlay');

    const segmentationControls = document.getElementById('segmentation-controls');
    const newActorNameInput = document.getElementById('new-actor-name');
    const addActorButton = document.getElementById('add-actor-button');
    const assignSegmentControls = document.getElementById('assign-segment-controls');
    const selectionTimeDisplay = document.getElementById('selection-time');
    const actorAssignmentDropdown = document.getElementById('actor-assignment-dropdown');
    const assignSegmentButton = document.getElementById('assign-segment-button');
    const clearSelectionButton = document.getElementById('clear-selection-button');

    const actorsPanel = document.getElementById('actors-panel');
    const actorListContainer = document.getElementById('actor-list');

    const statusMessage = document.getElementById('status-message');
    const progressIndicator = document.getElementById('progress-indicator');

    // --- Web Audio API Setup ---
    let audioContext;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.error("Web Audio API is not supported in this browser", e);
        updateStatus("Error: Web Audio API is not supported.", true);
        // Disable relevant parts of the UI
        uploadButton.disabled = true;
        // ... disable other controls ...
        return; // Stop initialization
    }

    // --- Application State ---
    let originalAudioBuffer = null;
    let actors = {}; // { actorId: { name: 'Actor 1', color: '#...', segments: [segmentId1, segmentId2] } }
    let segments = {}; // { segmentId: { id: 'seg-1', actorId: 'actor-1', start: 10.5, end: 15.2, regionalText: '', standardText: '' } }
    let selectedSegmentId = null; // ID of the currently selected segment for editing
    let selectedActorIdForSubtitle = null; // Track which actor's subtitle editor is open

    let segmentIdCounter = 0;
    let actorIdCounter = 0;
    let zoomLevel = 1; // Higher value = more zoomed in
    const MAX_ZOOM = 20;
    const MIN_ZOOM = 0.1;
    let isPlaying = false;
    let playbackSourceNode = null;
    let playbackStartTime = 0; // Context time when playback started
    let playbackStartOffset = 0; // Offset within the buffer where playback started

    let currentSelection = { start: null, end: null }; // In seconds
    let isDraggingSelection = false;
    let isDraggingHandle = null; // { segmentId, handleType: 'left' | 'right' }
    let dragStartX = 0;
    let initialSegmentTimes = { start: 0, end: 0 };

    const actorColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
    let nextColorIndex = 0;

    // --- IndexedDB Setup ---
    const DB_NAME = 'RegionalBanglaEditorDB';
    const DB_VERSION = 1;
    const PROJECT_STORE_NAME = 'projects';
    let db;

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.errorCode);
                updateStatus("Error initializing local database.", true);
                reject("IndexedDB error");
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                console.log("IndexedDB initialized successfully.");
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(PROJECT_STORE_NAME)) {
                    db.createObjectStore(PROJECT_STORE_NAME, { keyPath: 'id', autoIncrement:true });
                    console.log(`Object store '${PROJECT_STORE_NAME}' created.`);
                }
            };
        });
    }

    // --- Utility Functions ---
    function updateStatus(message, isError = false) {
        statusMessage.textContent = `Status: ${message}`;
        statusMessage.style.color = isError ? 'red' : '#555';
        console.log(`Status: ${message}`);
        if (isError) console.error(message);
    }

    function showProgress(message) {
        progressIndicator.textContent = message;
        progressIndicator.style.display = 'block';
    }

    function hideProgress() {
        progressIndicator.style.display = 'none';
    }

    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0.000";
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = (seconds % 60).toFixed(3);
        return `${minutes}:${remainingSeconds.padStart(6, '0')}`; // MM:SS.sss
    }

     function formatSRTTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "00:00:00,000";
        const date = new Date(0);
        date.setSeconds(seconds);
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const secs = String(date.getUTCSeconds()).padStart(2, '0');
        const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
        return `${hours}:${minutes}:${secs},${ms}`;
    }

    function pixelsToSeconds(pixelX) {
        const scrollOffsetSeconds = waveformContainer.scrollLeft / (waveformCanvas.width / originalAudioBuffer.duration);
        const totalSeconds = originalAudioBuffer.duration;
        const canvasWidth = waveformCanvas.width;
        return ((pixelX / canvasWidth) * totalSeconds) + scrollOffsetSeconds;
    }

    function secondsToPixels(seconds) {
        if (!originalAudioBuffer) return 0;
        const totalSeconds = originalAudioBuffer.duration;
        const canvasWidth = waveformCanvas.width;
        const scrollOffsetSeconds = waveformContainer.scrollLeft / (canvasWidth / totalSeconds);
         // Calculate pixel position relative to the *start* of the scrollable canvas
        const absolutePixel = (seconds / totalSeconds) * canvasWidth;
         // Adjust for current scroll position
        return absolutePixel - waveformContainer.scrollLeft;
    }

    function getNextColor() {
        const color = actorColors[nextColorIndex % actorColors.length];
        nextColorIndex++;
        return color;
    }

    function generateUUID() { // Simple unique ID generator
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    // --- File Handling ---
    function handleFileSelect(file) {
        if (!file) return;

        if (!file.type.match('audio/wav') && !file.type.match('audio/mpeg')) {
            updateStatus("Error: Invalid file type. Please upload WAV or MP3.", true);
            return;
        }

        updateStatus(`Loading file: ${file.name}...`);
        showProgress(`Decoding ${file.name}...`);
        resetAppState(); // Clear previous state

        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target.result;
            audioContext.decodeAudioData(arrayBuffer)
                .then(decodedBuffer => {
                    originalAudioBuffer = decodedBuffer;
                    displayFileInfo(file);
                    updateStatus("Audio loaded successfully. Ready to segment.");
                    editorSection.style.display = 'block';
                    actorsPanel.style.display = 'block';
                    saveProjectButton.disabled = false; // Enable saving
                    setInitialZoom();
                    drawWaveform();
                    hideProgress();
                })
                .catch(err => {
                    console.error("Error decoding audio data:", err);
                    updateStatus(`Error decoding audio file: ${err.message}`, true);
                    resetAppState();
                    hideProgress();
                });
        };
        reader.onerror = (e) => {
            console.error("FileReader error:", e);
            updateStatus("Error reading file.", true);
            resetAppState();
             hideProgress();
        };
        reader.readAsArrayBuffer(file);
    }

     function displayFileInfo(file) {
        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = (file.size / 1024 / 1024).toFixed(2);
        fileDurationEl.textContent = originalAudioBuffer.duration.toFixed(3);
        fileSampleRateEl.textContent = originalAudioBuffer.sampleRate;
        fileInfo.style.display = 'block';
    }

    function setInitialZoom() {
        // Adjust zoom so the entire waveform initially fits (or up to a certain width)
        const desiredWidth = waveformContainer.clientWidth * 2; // Example: fit in 2 screens
        const requiredCanvasWidth = (originalAudioBuffer.duration / 5) * 100; // Arbitrary scaling factor (adjust)
        zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, waveformContainer.clientWidth / (originalAudioBuffer.duration * 10))); // Simplified initial zoom
        applyZoom();
    }

     function resetAppState() {
        stopAudio(); // Stop any playback
        originalAudioBuffer = null;
        actors = {};
        segments = {};
        selectedSegmentId = null;
        selectedActorIdForSubtitle = null;
        segmentIdCounter = 0;
        actorIdCounter = 0;
        zoomLevel = 1;
        currentSelection = { start: null, end: null };
        isDraggingSelection = false;
        isDraggingHandle = null;

        fileInfo.style.display = 'none';
        editorSection.style.display = 'none';
        actorsPanel.style.display = 'none';
        actorListContainer.innerHTML = ''; // Clear actors UI
        actorAssignmentDropdown.innerHTML = ''; // Clear dropdown
        assignSegmentControls.style.display = 'none';
        waveformCanvas.getContext('2d').clearRect(0, 0, waveformCanvas.width, waveformCanvas.height); // Clear canvas
        playhead.style.display = 'none';
        selectionOverlay.style.display = 'none';
        saveProjectButton.disabled = true;
        updateStatus("Ready. Upload an audio file.");
    }

    // --- Waveform Rendering & Interaction ---
    function applyZoom() {
         if (!originalAudioBuffer) return;
         const baseWidth = waveformContainer.clientWidth * 1.5; // Base width relative to container
         const newWidth = Math.max(waveformContainer.clientWidth, baseWidth * zoomLevel);
         waveformCanvas.width = newWidth;
         waveformCanvas.height = waveformContainer.clientHeight; // Match container height
         drawWaveform(); // Redraw with new width
    }

    function drawWaveform() {
        if (!originalAudioBuffer) return;

        const ctx = waveformCanvas.getContext('2d');
        const width = waveformCanvas.width;
        const height = waveformCanvas.height;
        const channelData = originalAudioBuffer.getChannelData(0); // Use first channel
        const samplesPerPixel = Math.floor(channelData.length / width);

        ctx.clearRect(0, 0, width, height);

        // Draw waveform
        ctx.fillStyle = '#282c34'; // Background
        ctx.fillRect(0, 0, width, height);

        ctx.lineWidth = 1;
        ctx.strokeStyle = '#87ceeb'; // Waveform color (light blue)

        ctx.beginPath();
        ctx.moveTo(0, height / 2);

        for (let x = 0; x < width; x++) {
            const startIndex = Math.min(channelData.length - 1, Math.floor(x * samplesPerPixel));
            // Guard against accessing beyond buffer length
            const endIndex = Math.min(channelData.length, startIndex + samplesPerPixel);
            if (startIndex >= endIndex) continue; // Skip if range is invalid

            let min = 1.0;
            let max = -1.0;

            for (let i = startIndex; i < endIndex; i++) {
                const sample = channelData[i];
                if (sample < min) min = sample;
                if (sample > max) max = sample;
            }

            const yMin = ((min + 1) / 2) * height;
            const yMax = ((max + 1) / 2) * height;

            // Draw a vertical line for the min/max range
            ctx.moveTo(x + 0.5, yMin); // +0.5 for sharper lines
            ctx.lineTo(x + 0.5, yMax);
        }
        ctx.stroke();

        // Draw segments
        drawSegmentsOnWaveform();

        // Draw selection overlay if active
        drawSelectionOverlay();

        // Draw playhead if playing
        updatePlayheadPosition();
    }

    function drawSegmentsOnWaveform() {
        // Remove existing segment highlights/handles first
        const existingHighlights = waveformContainer.querySelectorAll('.segment-highlight, .segment-handle');
        existingHighlights.forEach(el => el.remove());

        const containerRect = waveformContainer.getBoundingClientRect();

        for (const segmentId in segments) {
            const segment = segments[segmentId];
            const actor = actors[segment.actorId];
            if (!actor) continue; // Skip if actor not found

            const startPxRaw = (segment.start / originalAudioBuffer.duration) * waveformCanvas.width;
            const endPxRaw = (segment.end / originalAudioBuffer.duration) * waveformCanvas.width;

            // Check if segment is within the visible scrolled area
            const visibleStart = waveformContainer.scrollLeft;
            const visibleEnd = visibleStart + waveformContainer.clientWidth;

             if (endPxRaw < visibleStart || startPxRaw > visibleEnd) {
                 continue; // Segment is not visible, skip drawing
             }

            // Calculate position relative to the container's *visible* area
            const startPx = startPxRaw - visibleStart;
            const endPx = endPxRaw - visibleStart;
            const segmentWidthPx = endPx - startPx;

            if (segmentWidthPx <= 0) continue; // Skip zero or negative width segments


            // Create highlight div
            const highlight = document.createElement('div');
            highlight.className = 'segment-highlight';
            highlight.dataset.segmentId = segmentId;
            highlight.style.left = `${startPx}px`;
            highlight.style.width = `${segmentWidthPx}px`;
            highlight.style.backgroundColor = hexToRgba(actor.color, 0.3); // Use actor color with alpha
            highlight.style.borderColor = actor.color;
            highlight.title = `${actor.name}: ${formatTime(segment.start)} - ${formatTime(segment.end)}`;

            // Add drag handles
            const leftHandle = document.createElement('div');
            leftHandle.className = 'segment-handle left';
            leftHandle.dataset.segmentId = segmentId;
            leftHandle.dataset.handleType = 'left';

            const rightHandle = document.createElement('div');
            rightHandle.className = 'segment-handle right';
            rightHandle.dataset.segmentId = segmentId;
            rightHandle.dataset.handleType = 'right';

            highlight.appendChild(leftHandle);
            highlight.appendChild(rightHandle);
            waveformContainer.appendChild(highlight); // Append to container, not canvas

            // Add event listeners for dragging handles
            leftHandle.addEventListener('mousedown', handleSegmentHandleMouseDown);
            rightHandle.addEventListener('mousedown', handleSegmentHandleMouseDown);
             // Add click listener to the highlight itself to select the segment
             highlight.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent triggering canvas click
                selectSegmentForEditing(segmentId);
             });
        }
    }

    function handleSegmentHandleMouseDown(e) {
        e.stopPropagation(); // Prevent canvas selection
        isDraggingHandle = {
            segmentId: e.target.dataset.segmentId,
            handleType: e.target.dataset.handleType
        };
        dragStartX = e.clientX; // Store initial mouse X
        const segment = segments[isDraggingHandle.segmentId];
        initialSegmentTimes = { start: segment.start, end: segment.end }; // Store initial times
        document.addEventListener('mousemove', handleSegmentHandleMouseMove);
        document.addEventListener('mouseup', handleSegmentHandleMouseUp);
        waveformContainer.style.cursor = 'col-resize'; // Change cursor
    }

    function handleSegmentHandleMouseMove(e) {
        if (!isDraggingHandle) return;
        e.preventDefault(); // Prevent text selection during drag

        const currentX = e.clientX;
        const deltaX = currentX - dragStartX;

        // Convert pixel delta to time delta
        const deltaTime = (deltaX / waveformCanvas.width) * originalAudioBuffer.duration;

        const segment = segments[isDraggingHandle.segmentId];
        let newStart = segment.start;
        let newEnd = segment.end;

        if (isDraggingHandle.handleType === 'left') {
            newStart = Math.max(0, initialSegmentTimes.start + deltaTime); // Clamp at 0
            newStart = Math.min(newStart, segment.end - 0.01); // Prevent crossing end handle (add small buffer)
        } else { // 'right' handle
            newEnd = Math.min(originalAudioBuffer.duration, initialSegmentTimes.end + deltaTime); // Clamp at duration
            newEnd = Math.max(newEnd, segment.start + 0.01); // Prevent crossing start handle
        }

        // Update segment times (temporarily for visual feedback)
        segment.start = newStart;
        segment.end = newEnd;

        // Redraw segments immediately for feedback
        drawSegmentsOnWaveform();
        // Update time display in the segment list if the segment is selected
        if (selectedSegmentId === isDraggingHandle.segmentId) {
            updateSegmentListItem(segment.id);
        }
    }

    function handleSegmentHandleMouseUp(e) {
        if (!isDraggingHandle) return;
        e.stopPropagation();

        document.removeEventListener('mousemove', handleSegmentHandleMouseMove);
        document.removeEventListener('mouseup', handleSegmentHandleMouseUp);

        // Final update to the segment data store
        const segment = segments[isDraggingHandle.segmentId];
        // Snapping or validation could happen here if needed

        updateStatus(`Segment ${isDraggingHandle.segmentId} boundary adjusted.`);
        // Persist changes (if using IndexedDB for segments)
        // maybe updateProjectInDB();

        isDraggingHandle = null;
        waveformContainer.style.cursor = 'crosshair'; // Reset cursor
        drawWaveform(); // Final redraw
    }

    function hexToRgba(hex, alpha = 1) {
        const bigint = parseInt(hex.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }


    function drawSelectionOverlay() {
        if (currentSelection.start === null || currentSelection.end === null || !originalAudioBuffer) {
            selectionOverlay.style.display = 'none';
            return;
        }

        const startPxRaw = (currentSelection.start / originalAudioBuffer.duration) * waveformCanvas.width;
        const endPxRaw = (currentSelection.end / originalAudioBuffer.duration) * waveformCanvas.width;

        // Calculate relative to scrolled view
        const scrollLeftPx = waveformContainer.scrollLeft;
        const startPx = startPxRaw - scrollLeftPx;
        const endPx = endPxRaw - scrollLeftPx;

        selectionOverlay.style.left = `${Math.min(startPx, endPx)}px`;
        selectionOverlay.style.width = `${Math.abs(endPx - startPx)}px`;
        selectionOverlay.style.display = 'block';
    }

    function updatePlayheadPosition() {
        if (!isPlaying || !playbackSourceNode || !originalAudioBuffer) {
            playhead.style.display = 'none';
            return;
        }

        const elapsedTime = audioContext.currentTime - playbackStartTime;
        const currentPlaybackTime = playbackStartOffset + elapsedTime;

        // Ensure time stays within bounds (e.g., if segment ends)
        const displayTime = Math.min(originalAudioBuffer.duration, currentPlaybackTime);

        currentTimeDisplay.textContent = formatTime(displayTime) + 's';

        // Calculate pixel position relative to the *start* of the scrollable canvas
        const absolutePixel = (displayTime / originalAudioBuffer.duration) * waveformCanvas.width;

        // Adjust for current scroll position to get position within the visible container
        const relativePixel = absolutePixel - waveformContainer.scrollLeft;

        // Only display if within the visible area of the container
        if (relativePixel >= 0 && relativePixel <= waveformContainer.clientWidth) {
            playhead.style.left = `${relativePixel}px`;
            playhead.style.display = 'block';
        } else {
            playhead.style.display = 'none'; // Hide if scrolled out of view
        }

        // Loop the update using requestAnimationFrame
        if (isPlaying) {
            requestAnimationFrame(updatePlayheadPosition);
        }
    }

    function startSelection(e) {
        if (!originalAudioBuffer || isDraggingHandle) return; // Don't start selection if dragging handle
         // Check if the click is on a segment handle - if so, don't start a new selection
         if (e.target.classList.contains('segment-handle')) {
            return;
         }
        isDraggingSelection = true;
        const rect = waveformCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const scrollOffsetSeconds = waveformContainer.scrollLeft / (waveformCanvas.width / originalAudioBuffer.duration);
        currentSelection.start = ((clickX / waveformCanvas.width) * originalAudioBuffer.duration * (waveformCanvas.width / waveformContainer.clientWidth)) + scrollOffsetSeconds;
        currentSelection.start = Math.max(0, Math.min(originalAudioBuffer.duration, pixelsToSeconds(clickX + waveformContainer.scrollLeft))); // Adjusted calculation
        currentSelection.end = currentSelection.start; // Initialize end time
        selectionOverlay.style.left = `${clickX}px`;
        selectionOverlay.style.width = '0px';
        selectionOverlay.style.display = 'block';

        document.addEventListener('mousemove', dragSelection);
        document.addEventListener('mouseup', endSelection);
    }

    function dragSelection(e) {
        if (!isDraggingSelection || !originalAudioBuffer) return;
        const rect = waveformCanvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
         currentSelection.end = Math.max(0, Math.min(originalAudioBuffer.duration, pixelsToSeconds(currentX + waveformContainer.scrollLeft))); // Adjusted calculation

        drawSelectionOverlay(); // Update visual overlay
        updateAssignSegmentUI(); // Update time display
    }

    function endSelection(e) {
        if (!isDraggingSelection) return;
        isDraggingSelection = false;
        document.removeEventListener('mousemove', dragSelection);
        document.removeEventListener('mouseup', endSelection);

        // Ensure start is always less than end
        if (currentSelection.start > currentSelection.end) {
            [currentSelection.start, currentSelection.end] = [currentSelection.end, currentSelection.start];
        }

        // Prevent tiny accidental selections
        if (Math.abs(currentSelection.end - currentSelection.start) < 0.05) { // Threshold of 50ms
            clearSelection();
            return;
        }

        updateAssignSegmentUI(); // Show the assignment controls
    }

     function clearSelection() {
        currentSelection = { start: null, end: null };
        selectionOverlay.style.display = 'none';
        assignSegmentControls.style.display = 'none';
     }

    // --- Actor & Segment Management ---
    function addActor() {
        const name = newActorNameInput.value.trim();
        if (!name) {
            updateStatus("Please enter a name for the new actor.", true);
            return;
        }
        if (Object.values(actors).some(actor => actor.name === name)) {
             updateStatus(`Actor with name "${name}" already exists.`, true);
             return;
        }

        const newActorId = `actor-${actorIdCounter++}`;
        const newColor = getNextColor();
        actors[newActorId] = {
            id: newActorId,
            name: name,
            color: newColor,
            segments: [], // Store segment IDs associated with this actor
        };

        newActorNameInput.value = ''; // Clear input
        updateActorDropdown();
        renderActorSection(newActorId);
        updateStatus(`Actor "${name}" added.`);
    }

    function updateActorDropdown() {
        actorAssignmentDropdown.innerHTML = '<option value="">Select Actor...</option>';
        for (const actorId in actors) {
            const option = document.createElement('option');
            option.value = actorId;
            option.textContent = actors[actorId].name;
            actorAssignmentDropdown.appendChild(option);
        }
         assignSegmentButton.disabled = true; // Disable until an actor is chosen
    }

    function updateAssignSegmentUI() {
        if (currentSelection.start !== null && currentSelection.end !== null && Object.keys(actors).length > 0) {
            const start = Math.min(currentSelection.start, currentSelection.end);
            const end = Math.max(currentSelection.start, currentSelection.end);
            selectionTimeDisplay.textContent = `${formatTime(start)} - ${formatTime(end)}`;
            assignSegmentControls.style.display = 'block';
            // Reset dropdown selection
            actorAssignmentDropdown.value = "";
            assignSegmentButton.disabled = true;
        } else {
            assignSegmentControls.style.display = 'none';
        }
    }

     actorAssignmentDropdown.addEventListener('change', () => {
         assignSegmentButton.disabled = actorAssignmentDropdown.value === "";
     });

    function assignSegment() {
        const selectedActorId = actorAssignmentDropdown.value;
        if (!selectedActorId) {
            updateStatus("Please select an actor to assign the segment.", true);
            return;
        }
        if (currentSelection.start === null || currentSelection.end === null) {
            updateStatus("No selection available to assign.", true);
            return;
        }

        const start = Math.min(currentSelection.start, currentSelection.end);
        const end = Math.max(currentSelection.start, currentSelection.end);

        // Basic overlap check (can be made more sophisticated)
        // for (const segId in segments) {
        //     const seg = segments[segId];
        //     if (Math.max(start, seg.start) < Math.min(end, seg.end)) {
        //          // This simplistic check flags any overlap. More complex logic might allow overlaps
        //          // or require user confirmation, or automatically split/adjust.
        //          // For now, we just warn but allow it.
        //          console.warn(`Warning: New segment overlaps with existing segment ${segId}.`);
        //          // updateStatus(`Warning: New segment overlaps with existing segment ${segId}. Consider adjusting boundaries.`, false);
        //     }
        // }


        const newSegmentId = `seg-${segmentIdCounter++}`;
        segments[newSegmentId] = {
            id: newSegmentId,
            actorId: selectedActorId,
            start: start,
            end: end,
            regionalText: '',
            standardText: '',
        };

        // Add segment ID to the actor's list
        actors[selectedActorId].segments.push(newSegmentId);

        updateStatus(`Segment ${formatTime(start)}-${formatTime(end)} assigned to ${actors[selectedActorId].name}.`);
        clearSelection(); // Clear visual selection
        drawWaveform(); // Redraw waveform with the new segment highlight
        addSegmentToList(newSegmentId); // Update the actor's UI list
    }

    function renderActorSection(actorId) {
        const actor = actors[actorId];
        if (!actor) return;

        const section = document.createElement('div');
        section.className = 'actor-section';
        section.id = `actor-section-${actorId}`;
        section.style.borderColor = actor.color; // Use actor color for border

        section.innerHTML = `
            <div class="actor-header">
                <h3>
                    <span class="actor-color-swatch" style="background-color: ${actor.color};"></span>
                    ${actor.name}
                </h3>
                <div>
                    <button class="preview-merged-button" data-actor-id="${actorId}" title="Preview Merged Audio">Preview Merged</button>
                    <button class="download-actor-button" data-actor-id="${actorId}" title="Download All Data for ${actor.name}">Download Actor Data</button>
                     <button class="delete-actor-button" data-actor-id="${actorId}" title="Delete Actor (and segments)">Delete Actor</button>
                </div>
            </div>
            <h4>Segments</h4>
            <ul class="segment-list" id="segment-list-${actorId}">
                <!-- Segments will be added here -->
            </ul>
            <div class="subtitle-editor" id="subtitle-editor-${actorId}" style="display: none;">
                <h4>Edit Subtitles for Segment: <span class="subtitle-segment-time"></span></h4>
                <label for="regional-text-${actorId}">Regional Text (${dialectSelect.options[dialectSelect.selectedIndex].text}):</label>
                <textarea id="regional-text-${actorId}" placeholder="Enter regional dialect text..."></textarea>
                <label for="standard-text-${actorId}">Standard Bangla Text:</label>
                <textarea id="standard-text-${actorId}" placeholder="Enter standard Bangla text..."></textarea>
                <button class="save-subtitles-button" data-actor-id="${actorId}">Save Subtitles</button>
                <button class="close-subtitles-button" data-actor-id="${actorId}">Close Editor</button>
            </div>
        `;

        actorListContainer.appendChild(section);

        // Add event listeners for the new buttons
        section.querySelector('.preview-merged-button').addEventListener('click', () => previewMergedAudio(actorId));
        section.querySelector('.download-actor-button').addEventListener('click', () => exportActorData(actorId));
        section.querySelector('.delete-actor-button').addEventListener('click', () => deleteActor(actorId));
         section.querySelector('.save-subtitles-button').addEventListener('click', saveSubtitles);
         section.querySelector('.close-subtitles-button').addEventListener('click', closeSubtitleEditor);


        // Populate existing segments for this actor if any (e.g., when loading a project)
        actor.segments.forEach(segmentId => {
            if (segments[segmentId]) {
                addSegmentToList(segmentId);
            }
        });
    }

    function addSegmentToList(segmentId) {
        const segment = segments[segmentId];
        const actorId = segment.actorId;
        const list = document.getElementById(`segment-list-${actorId}`);
        if (!list) return; // Actor section might not be rendered yet

        const listItem = document.createElement('li');
        listItem.id = `segment-item-${segmentId}`;
        listItem.dataset.segmentId = segmentId;

        listItem.innerHTML = `
            <span class="segment-time">${formatTime(segment.start)} - ${formatTime(segment.end)}</span>
            <span class="segment-summary">${segment.regionalText.substring(0, 20)}...</span>
            <div class="segment-actions">
                <button class="play-segment-button" title="Play Segment">▶</button>
                <button class="edit-segment-button" title="Edit Subtitles">✎</button>
                <button class="delete-segment-button" title="Delete Segment">🗑</button>
            </div>
        `;

        list.appendChild(listItem);

        // Add event listeners
        listItem.querySelector('.play-segment-button').addEventListener('click', (e) => {
            e.stopPropagation();
            playSegment(segmentId);
        });
        listItem.querySelector('.edit-segment-button').addEventListener('click', (e) => {
            e.stopPropagation();
            openSubtitleEditor(segmentId);
        });
        listItem.querySelector('.delete-segment-button').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSegment(segmentId);
        });

        // Allow clicking the list item itself to select/highlight
        listItem.addEventListener('click', () => selectSegmentForEditing(segmentId));
    }

    function updateSegmentListItem(segmentId) {
         const segment = segments[segmentId];
         const listItem = document.getElementById(`segment-item-${segmentId}`);
         if (!listItem || !segment) return;

         listItem.querySelector('.segment-time').textContent = `${formatTime(segment.start)} - ${formatTime(segment.end)}`;
         listItem.querySelector('.segment-summary').textContent = `${segment.regionalText.substring(0, 20)}...`;

          // Update subtitle editor if this segment is currently being edited
          if (selectedSegmentId === segmentId) {
                const actorId = segment.actorId;
                const editor = document.getElementById(`subtitle-editor-${actorId}`);
                if (editor && editor.style.display !== 'none') {
                   editor.querySelector('.subtitle-segment-time').textContent = `${formatTime(segment.start)} - ${formatTime(segment.end)}`;
                }
          }
    }

     function selectSegmentForEditing(segmentId) {
         // Remove highlight from previously selected item
         const previouslySelected = actorListContainer.querySelector('.segment-list li.selected');
         if (previouslySelected) {
             previouslySelected.classList.remove('selected');
         }

         // Add highlight to newly selected item
         const listItem = document.getElementById(`segment-item-${segmentId}`);
         if (listItem) {
             listItem.classList.add('selected');
         }

         // Open subtitle editor for this segment
         openSubtitleEditor(segmentId);
     }

    function openSubtitleEditor(segmentId) {
        const segment = segments[segmentId];
        if (!segment) return;

        // Close any previously open editor
        closeSubtitleEditor();

        selectedSegmentId = segmentId;
        selectedActorIdForSubtitle = segment.actorId; // Store which actor's editor is open

        const editor = document.getElementById(`subtitle-editor-${segment.actorId}`);
        const regionalTextarea = document.getElementById(`regional-text-${segment.actorId}`);
        const standardTextarea = document.getElementById(`standard-text-${segment.actorId}`);

        if (!editor || !regionalTextarea || !standardTextarea) {
            console.error("Subtitle editor elements not found for actor:", segment.actorId);
            return;
        }

        editor.querySelector('.subtitle-segment-time').textContent = `${formatTime(segment.start)} - ${formatTime(segment.end)}`;
        regionalTextarea.value = segment.regionalText || '';
        standardTextarea.value = segment.standardText || '';

        // Update label for regional text based on selected dialect
        editor.querySelector(`label[for='regional-text-${segment.actorId}']`).textContent = `Regional Text (${dialectSelect.options[dialectSelect.selectedIndex].text}):`;

        editor.style.display = 'block';
        regionalTextarea.focus(); // Focus the first textarea

        // Highlight the corresponding list item
        const listItem = document.getElementById(`segment-item-${segmentId}`);
        if (listItem) {
             // Ensure only one is selected
             actorListContainer.querySelectorAll('.segment-list li.selected').forEach(li => li.classList.remove('selected'));
             listItem.classList.add('selected');
        }
    }

    function saveSubtitles() {
        if (!selectedSegmentId || !selectedActorIdForSubtitle) return;

        const segment = segments[selectedSegmentId];
        const regionalTextarea = document.getElementById(`regional-text-${selectedActorIdForSubtitle}`);
        const standardTextarea = document.getElementById(`standard-text-${selectedActorIdForSubtitle}`);

        segment.regionalText = regionalTextarea.value.trim();
        segment.standardText = standardTextarea.value.trim();

        updateStatus(`Subtitles saved for segment ${selectedSegmentId}.`);
        updateSegmentListItem(selectedSegmentId); // Update summary in list
        // maybe updateProjectInDB(); // Persist changes if needed
    }

    function closeSubtitleEditor() {
        if (!selectedActorIdForSubtitle) return; // No editor was open

        const editor = document.getElementById(`subtitle-editor-${selectedActorIdForSubtitle}`);
        if (editor) {
            editor.style.display = 'none';
        }
        // Remove highlight from list item
         if (selectedSegmentId) {
            const listItem = document.getElementById(`segment-item-${selectedSegmentId}`);
            if (listItem) {
                 listItem.classList.remove('selected');
            }
         }

        selectedSegmentId = null;
        selectedActorIdForSubtitle = null;
    }

    function deleteSegment(segmentId) {
        if (!segments[segmentId]) return;

        if (!confirm(`Are you sure you want to delete segment ${formatTime(segments[segmentId].start)} - ${formatTime(segments[segmentId].end)}? This cannot be undone.`)) {
             return;
         }

        const segment = segments[segmentId];
        const actorId = segment.actorId;

        // Remove from actor's list
        if (actors[actorId]) {
            actors[actorId].segments = actors[actorId].segments.filter(id => id !== segmentId);
        }

        // Remove from global segments object
        delete segments[segmentId];

        // Remove from UI list
        const listItem = document.getElementById(`segment-item-${segmentId}`);
        if (listItem) {
            listItem.remove();
        }

         // Close subtitle editor if this segment was being edited
         if (selectedSegmentId === segmentId) {
            closeSubtitleEditor();
         }

        updateStatus(`Segment ${segmentId} deleted.`);
        drawWaveform(); // Remove highlight from waveform
        // maybe updateProjectInDB();
    }

     function deleteActor(actorId) {
         if (!actors[actorId]) return;
         const actor = actors[actorId];

         if (!confirm(`Are you sure you want to delete actor "${actor.name}" and all associated segments? This cannot be undone.`)) {
             return;
         }

         // Delete all segments associated with this actor
         // Iterate backwards to avoid issues with modifying the array while looping
         const segmentsToDelete = [...actor.segments]; // Create a copy
         for (let i = segmentsToDelete.length - 1; i >= 0; i--) {
             const segmentId = segmentsToDelete[i];
              // No confirmation needed here as the actor deletion was confirmed
              const segment = segments[segmentId];
              if (segment) {
                   // Remove from global segments object
                   delete segments[segmentId];
                   // Remove from UI list
                   const listItem = document.getElementById(`segment-item-${segmentId}`);
                   if (listItem) listItem.remove();
                    // Close subtitle editor if this segment was being edited
                    if (selectedSegmentId === segmentId) {
                        closeSubtitleEditor();
                    }
              }
         }


         // Remove actor section from UI
         const actorSection = document.getElementById(`actor-section-${actorId}`);
         if (actorSection) {
             actorSection.remove();
         }

         // Remove actor from state
         delete actors[actorId];

         updateStatus(`Actor "${actor.name}" and associated segments deleted.`);
         updateActorDropdown(); // Update assignment dropdown
         drawWaveform(); // Remove highlights for deleted segments
         // maybe updateProjectInDB();
     }


    // --- Audio Playback ---
    function playAudio(startTime = 0, endTime = originalAudioBuffer.duration) {
        if (!originalAudioBuffer) return;
        if (isPlaying) {
            stopAudio(); // Stop current playback before starting new
        }

        playbackSourceNode = audioContext.createBufferSource();
        playbackSourceNode.buffer = originalAudioBuffer;
        playbackSourceNode.connect(audioContext.destination);

        const duration = endTime - startTime;
        playbackStartOffset = startTime; // Store where playback starts in the buffer
        playbackStartTime = audioContext.currentTime; // Store context time

        playbackSourceNode.onended = () => {
            if (playbackSourceNode) { // Check if it wasn't stopped manually
                 stopAudio(); // Ensure state is cleaned up
            }
        };

        try {
             playbackSourceNode.start(0, startTime, duration); // Play the specified segment
             isPlaying = true;
             playPauseButton.textContent = '❚❚ Pause';
             playPauseButton.title = 'Pause (Space)';
             updatePlayheadPosition(); // Start playhead animation
        } catch (e) {
             console.error("Error starting playback:", e);
             updateStatus(`Error starting playback: ${e.message}`, true);
             stopAudio(); // Clean up on error
        }

    }

    function stopAudio() {
        if (playbackSourceNode) {
            try {
                playbackSourceNode.stop(0); // Stop immediately
                playbackSourceNode.disconnect(); // Disconnect from destination
            } catch (e) {
                // Ignore errors like "invalid state" if already stopped
                // console.warn("Error stopping playback source node:", e);
            } finally {
                 playbackSourceNode = null;
            }
        }
        isPlaying = false;
        playPauseButton.textContent = '▶ Play';
        playPauseButton.title = 'Play (Space)';
        playhead.style.display = 'none'; // Hide playhead immediately
        // Do not clear playbackStartTime/Offset here, might be needed for pause/resume logic if implemented
    }

     function togglePlayback() {
         if (!originalAudioBuffer) return;

         if (isPlaying) {
             stopAudio();
         } else {
             // Determine what to play: selected segment, current view, or full track?
             // For simplicity, let's play from the current playhead position or start
             // Or, better, play the currently selected segment if one is active in editor, else play from start
             let playStart = 0;
             let playEnd = originalAudioBuffer.duration;

             if (selectedSegmentId && segments[selectedSegmentId]) {
                 playStart = segments[selectedSegmentId].start;
                 playEnd = segments[selectedSegmentId].end;
                  updateStatus(`Playing selected segment for ${actors[segments[selectedSegmentId].actorId].name}`);
             } else {
                 // Basic: play from current view start or 0
                 playStart = Math.max(0, pixelsToSeconds(waveformContainer.scrollLeft));
                 updateStatus(`Playing from ${formatTime(playStart)}s`);
             }

             playAudio(playStart, playEnd);
         }
     }


    function playSegment(segmentId) {
        const segment = segments[segmentId];
        if (segment && originalAudioBuffer) {
            updateStatus(`Playing segment for ${actors[segment.actorId].name}: ${formatTime(segment.start)} - ${formatTime(segment.end)}`);
            playAudio(segment.start, segment.end);
        }
    }

    async function previewMergedAudio(actorId) {
        if (!actors[actorId] || actors[actorId].segments.length === 0) {
            updateStatus("No segments to preview for this actor.", true);
            return;
        }

        updateStatus(`Merging audio for ${actors[actorId].name} preview...`);
        showProgress(`Merging audio for ${actors[actorId].name}...`);

        try {
            // Use setTimeout to allow UI update before blocking potentially long merge operation
             await new Promise(resolve => setTimeout(resolve, 50));

            const mergedBuffer = await mergeActorAudio(actorId);
            if (!mergedBuffer) {
                 throw new Error("Merging failed.");
            }
            hideProgress();
            updateStatus(`Previewing merged audio for ${actors[actorId].name}.`);

            // Play the merged buffer directly (different from playing segments of original)
            stopAudio(); // Stop any other playback
            playbackSourceNode = audioContext.createBufferSource();
            playbackSourceNode.buffer = mergedBuffer; // Use the newly created buffer
            playbackSourceNode.connect(audioContext.destination);
            playbackSourceNode.onended = () => {
                if (playbackSourceNode) stopAudio();
            };
            playbackStartOffset = 0; // Merged buffer starts at 0
            playbackStartTime = audioContext.currentTime;
            playbackSourceNode.start(0);
            isPlaying = true;
            playPauseButton.textContent = '❚❚ Pause'; // Keep consistent UI state
            playPauseButton.title = 'Pause (Space)';
            // Note: Playhead logic needs adjustment for merged preview playback as it's not tied to the main waveform timescale.
            // For simplicity, we might disable the main playhead during merged preview or show a simple progress bar elsewhere.
            // Here, we just update the status. A dedicated preview player could be better.
             // Clear playhead for now during merged preview
            playhead.style.display = 'none';
            currentTimeDisplay.textContent = 'Merged Preview';

        } catch (error) {
            console.error("Error merging or playing preview:", error);
            updateStatus(`Error during preview: ${error.message}`, true);
            hideProgress();
            stopAudio();
        }
    }

    // --- Audio Processing (Merging) ---
    async function mergeActorAudio(actorId) {
        const actor = actors[actorId];
        if (!actor || !originalAudioBuffer) return null;

        const actorSegments = actor.segments
            .map(id => segments[id])
            .filter(Boolean) // Ensure segments exist
            .sort((a, b) => a.start - b.start); // Sort segments chronologically

        if (actorSegments.length === 0) return null;

        // Calculate total length needed for the new buffer
        let totalLength = 0;
        actorSegments.forEach(segment => {
            const segmentLength = Math.floor((segment.end - segment.start) * originalAudioBuffer.sampleRate);
            totalLength += segmentLength;
        });

        if (totalLength <= 0) return null;

        try {
             const mergedBuffer = audioContext.createBuffer(
                 originalAudioBuffer.numberOfChannels,
                 totalLength,
                 originalAudioBuffer.sampleRate
             );

             let offset = 0; // Track position in the destination buffer

             // Process each channel
             for (let channel = 0; channel < originalAudioBuffer.numberOfChannels; channel++) {
                 const originalChannelData = originalAudioBuffer.getChannelData(channel);
                 const mergedChannelData = mergedBuffer.getChannelData(channel);
                 offset = 0; // Reset offset for each channel

                 for (const segment of actorSegments) {
                      const startSample = Math.floor(segment.start * originalAudioBuffer.sampleRate);
                      const endSample = Math.floor(segment.end * originalAudioBuffer.sampleRate);
                      const segmentLength = endSample - startSample;

                      if (segmentLength <= 0) continue; // Skip empty segments

                      // Extract segment data from the original buffer for this channel
                      const segmentData = originalChannelData.subarray(startSample, endSample);

                      // Copy the segment data into the merged buffer at the current offset
                      mergedChannelData.set(segmentData, offset);

                      offset += segmentLength; // Move the offset for the next segment
                 }
             }
             return mergedBuffer;

        } catch(e) {
             console.error(`Error creating or merging buffer for actor ${actorId}:`, e);
             updateStatus(`Failed to merge audio for ${actor.name}. Possibly out of memory.`, true);
             return null; // Return null on error
        }

    }


    // --- WAV Encoding ---
    // Function to encode AudioBuffer to WAV Blob
    function encodeWav(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;

        let dataLength = 0;
        const channelData = [];
        for (let i = 0; i < numChannels; i++) {
            channelData.push(audioBuffer.getChannelData(i));
             dataLength += channelData[i].length;
        }

        const totalDataLength = dataLength * bytesPerSample;
        const fileSize = 44 + totalDataLength; // 44 bytes for header

        const buffer = new ArrayBuffer(fileSize);
        const view = new DataView(buffer);

        let offset = 0;

        function writeString(str) {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset++, str.charCodeAt(i));
            }
        }

        function writeUint32(val) {
            view.setUint32(offset, val, true); // Little endian
            offset += 4;
        }

        function writeUint16(val) {
            view.setUint16(offset, val, true); // Little endian
            offset += 2;
        }

        function writeInt16(val) {
            view.setInt16(offset, val, true); // Little endian
            offset += 2;
        }

        // RIFF header
        writeString('RIFF');
        writeUint32(fileSize - 8); // File size - 8 bytes (RIFF type and size field)
        writeString('WAVE');

        // fmt subchunk
        writeString('fmt ');
        writeUint32(16); // Subchunk size for PCM
        writeUint16(format); // Audio format (PCM)
        writeUint16(numChannels);
        writeUint32(sampleRate);
        writeUint32(byteRate);
        writeUint16(blockAlign);
        writeUint16(bitDepth);

        // data subchunk
        writeString('data');
        writeUint32(totalDataLength);

        // Write interleaved audio data
        const numSamples = channelData[0].length;
         for (let i = 0; i < numSamples; i++) {
            for (let channel = 0; channel < numChannels; channel++) {
                let sample = channelData[channel][i];
                // Clamp and convert to 16-bit PCM
                sample = Math.max(-1, Math.min(1, sample));
                sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF; // 32767 or -32768
                writeInt16(sample);
            }
        }

        return new Blob([view], { type: 'audio/wav' });
    }


    // --- Exporting ---
    async function exportActorData(actorId) {
        const actor = actors[actorId];
        if (!actor || !originalAudioBuffer) {
            updateStatus("Cannot export: Actor data or audio buffer missing.", true);
            return;
        }

        const dialect = dialectSelect.value;
        const baseFilename = `${dialect}_${actor.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`; // Sanitize name

        updateStatus(`Exporting data for ${actor.name}...`);
        showProgress(`Exporting ${actor.name}...`);

        try {
            // 1. Merge Audio Buffer
            const mergedBuffer = await mergeActorAudio(actorId);
            if (!mergedBuffer) {
                throw new Error("Failed to merge audio. No segments or memory issue.");
            }

            // 2. Encode Merged Audio to WAV
            const wavBlob = encodeWav(mergedBuffer);
            if (!wavBlob) {
                throw new Error("Failed to encode WAV file.");
            }
            triggerDownload(wavBlob, `${baseFilename}.wav`);
             updateStatus(`Exported ${baseFilename}.wav`);
             await new Promise(resolve => setTimeout(resolve, 100)); // Small delay


            // 3. Prepare and Download Metadata JSON
             const metadata = {
                 actorId: actor.id,
                 actorName: actor.name,
                 dialect: dialect,
                 originalFileSampleRate: originalAudioBuffer.sampleRate,
                 mergedAudioDuration: mergedBuffer.duration,
                 segments: actor.segments.map(segId => {
                     const seg = segments[segId];
                     return {
                         id: seg.id,
                         start: seg.start,
                         end: seg.end,
                         duration: seg.end - seg.start,
                         regionalText: seg.regionalText,
                         standardText: seg.standardText
                     };
                 }).sort((a, b) => a.start - b.start) // Ensure sorted order
             };
             const metadataJson = JSON.stringify(metadata, null, 2); // Pretty print JSON
             const metadataBlob = new Blob([metadataJson], { type: 'application/json' });
             triggerDownload(metadataBlob, `${baseFilename}_metadata.json`);
             updateStatus(`Exported ${baseFilename}_metadata.json`);
             await new Promise(resolve => setTimeout(resolve, 100));


             // 4. Prepare and Download Subtitles (SRT format)
             let srtContent = '';
             let subtitleIndex = 1;
             let currentTimeOffset = 0; // Time offset in the merged audio file

             const sortedSegments = actor.segments
                 .map(id => segments[id])
                 .filter(Boolean)
                 .sort((a, b) => a.start - b.start);

             sortedSegments.forEach(segment => {
                if (segment.regionalText || segment.standardText) { // Only include segments with text
                    const segmentDuration = segment.end - segment.start;
                    const srtStart = currentTimeOffset;
                    const srtEnd = currentTimeOffset + segmentDuration;

                    srtContent += `${subtitleIndex}\n`;
                    srtContent += `${formatSRTTime(srtStart)} --> ${formatSRTTime(srtEnd)}\n`;
                     // Include both texts if available, separated by a clear marker or newline
                     if (segment.regionalText) {
                        srtContent += `[${dialect.toUpperCase()}] ${segment.regionalText}\n`;
                     }
                      if (segment.standardText) {
                         srtContent += `[STANDARD] ${segment.standardText}\n`;
                      }
                    srtContent += '\n'; // Blank line separator

                    subtitleIndex++;
                }
                 // Update the time offset for the next segment in the merged file
                currentTimeOffset += (segment.end - segment.start);
             });


             if (srtContent) {
                const srtBlob = new Blob([srtContent], { type: 'application/x-subrip' });
                triggerDownload(srtBlob, `${baseFilename}_subtitles.srt`);
                updateStatus(`Exported ${baseFilename}_subtitles.srt`);
             } else {
                 updateStatus(`No subtitles to export for ${actor.name}.`);
             }


            // 5. (Optional) Prepare and Download Subtitles (JSON format)
            // const subtitleJsonData = sortedSegments.map(segment => ({
            //     start: segment.start, // Use original times or merged times depending on need
            //     end: segment.end,
            //     regionalText: segment.regionalText,
            //     standardText: segment.standardText
            // }));
            // const subtitleJson = JSON.stringify(subtitleJsonData, null, 2);
            // const subtitleJsonBlob = new Blob([subtitleJson], { type: 'application/json' });
            // triggerDownload(subtitleJsonBlob, `${baseFilename}_subtitles.json`);
            // updateStatus(`Exported ${baseFilename}_subtitles.json`);


            updateStatus(`Successfully exported all data for ${actor.name}.`);

        } catch (error) {
            console.error(`Error exporting data for actor ${actorId}:`, error);
            updateStatus(`Error exporting data for ${actor.name}: ${error.message}`, true);
        } finally {
            hideProgress();
        }
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    // --- Project Save/Load ---

    function saveProjectState() {
        if (!originalAudioBuffer) {
             updateStatus("Cannot save: No audio loaded.", true);
             return;
         }

        const projectState = {
            version: 1,
            dialect: dialectSelect.value,
            audioFileName: fileNameEl.textContent, // Reference to the audio file
            audioDuration: originalAudioBuffer.duration, // Verify against loaded audio later
            actors: actors,
            segments: segments,
            segmentIdCounter: segmentIdCounter,
            actorIdCounter: actorIdCounter,
            nextColorIndex: nextColorIndex,
        };

        const projectJson = JSON.stringify(projectState, null, 2);
        const blob = new Blob([projectJson], { type: 'application/json' });
        const filename = `bangla_audio_project_${Date.now()}.json`;
        triggerDownload(blob, filename);
        updateStatus(`Project state saved as ${filename}. Remember to keep the original audio file!`);

        // Optional: Save to IndexedDB as well for persistence
        // saveProjectToDB(projectState);
    }

    function loadProjectState(file) {
        if (!file) return;
         if (!originalAudioBuffer) {
            updateStatus("Error: Please load the corresponding audio file *before* loading the project state.", true);
             return;
         }

         updateStatus(`Loading project state from ${file.name}...`);
         showProgress("Loading project state...");

         const reader = new FileReader();
         reader.onload = (e) => {
             try {
                 const projectState = JSON.parse(e.target.result);

                 // --- Validation ---
                 if (!projectState || projectState.version !== 1) {
                     throw new Error("Invalid or incompatible project file format.");
                 }
                 // Optional: More robust check if the project matches the loaded audio
                 if (Math.abs(projectState.audioDuration - originalAudioBuffer.duration) > 0.1) {
                    console.warn(`Project file duration (${projectState.audioDuration}s) doesn't precisely match loaded audio duration (${originalAudioBuffer.duration}s). Loading anyway.`);
                     // updateStatus(`Warning: Project file duration doesn't match loaded audio. Loading anyway.`, false);
                 }
                 // if (projectState.audioFileName !== fileNameEl.textContent) {
                 //     updateStatus(`Warning: Project file might be for a different audio (${projectState.audioFileName}). Proceed with caution.`, false);
                 // }

                 // --- Restore State ---
                 resetAppState(); // Clear current state *before* loading new one, but keep audio buffer!
                 const tempAudioBuffer = originalAudioBuffer; // Keep buffer reference
                 const tempFileInfo = { // Keep file info
                    name: fileNameEl.textContent,
                    size: fileSizeEl.textContent,
                    duration: fileDurationEl.textContent,
                    sampleRate: fileSampleRateEl.textContent
                 };

                 // Restore state variables
                 dialectSelect.value = projectState.dialect || 'chittagong';
                 actors = projectState.actors || {};
                 segments = projectState.segments || {};
                 segmentIdCounter = projectState.segmentIdCounter || 0;
                 actorIdCounter = projectState.actorIdCounter || 0;
                 nextColorIndex = projectState.nextColorIndex || 0;

                 // Restore the audio buffer and file info
                 originalAudioBuffer = tempAudioBuffer;
                 fileNameEl.textContent = tempFileInfo.name;
                 fileSizeEl.textContent = tempFileInfo.size;
                 fileDurationEl.textContent = tempFileInfo.duration;
                 fileSampleRateEl.textContent = tempFileInfo.sampleRate;
                 fileInfo.style.display = 'block';


                 // --- Re-render UI ---
                 updateActorDropdown(); // Populate dropdown first

                  // Clear existing UI elements before re-rendering
                 actorListContainer.innerHTML = '';

                 // Render actors and their segments
                 for (const actorId in actors) {
                     renderActorSection(actorId); // This will call addSegmentToList internally
                 }

                 editorSection.style.display = 'block';
                 actorsPanel.style.display = 'block';
                 saveProjectButton.disabled = false;
                 setInitialZoom(); // Re-apply zoom/draw based on loaded audio
                 drawWaveform(); // Draw waveform with loaded segments

                 updateStatus(`Project state loaded successfully from ${file.name}.`);

             } catch (error) {
                 console.error("Error loading project state:", error);
                 updateStatus(`Error loading project state: ${error.message}`, true);
                  // Optionally reset state if loading fails midway
                  // resetAppState();
             } finally {
                 hideProgress();
                 // Clear the file input value so the same file can be loaded again if needed
                 projectFileInput.value = '';
             }
         };
         reader.onerror = (e) => {
             console.error("FileReader error:", e);
             updateStatus("Error reading project file.", true);
             hideProgress();
             projectFileInput.value = '';
         };
         reader.readAsText(file);
    }

    // --- IndexedDB Functions (Example for saving/loading project state) ---
    // function saveProjectToDB(projectState) {
    //     if (!db) {
    //         console.warn("IndexedDB not ready, skipping save.");
    //         return;
    //     }
    //     const transaction = db.transaction([PROJECT_STORE_NAME], 'readwrite');
    //     const store = transaction.objectStore(PROJECT_STORE_NAME);
    //     // Use a fixed key or timestamp for simplicity, or allow multiple saved projects
    //     projectState.id = 'currentProject'; // Overwrite previous save
    //     const request = store.put(projectState);

    //     request.onsuccess = () => {
    //         console.log("Project state saved to IndexedDB.");
    //     };
    //     request.onerror = (event) => {
    //         console.error("Error saving project state to IndexedDB:", event.target.error);
    //     };
    // }

    // function loadProjectFromDB() {
    //     // Implementation would involve getting 'currentProject' from IndexedDB
    //     // and then calling the same state restoration logic as loadProjectState uses.
    //     // Needs careful handling if audio isn't loaded yet.
    //     updateStatus("Loading from IndexedDB not fully implemented yet.");
    // }


    // --- Event Listeners ---
    uploadButton.addEventListener('click', () => audioFileInput.click());
    audioFileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

    // Drag and Drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        handleFileSelect(file);
    });
     uploadArea.addEventListener('click', () => audioFileInput.click()); // Allow click on drop area too


    // Waveform Controls
    playPauseButton.addEventListener('click', togglePlayback);
    zoomInButton.addEventListener('click', () => {
        if (!originalAudioBuffer) return;
        zoomLevel = Math.min(MAX_ZOOM, zoomLevel * 1.5);
        applyZoom();
    });
    zoomOutButton.addEventListener('click', () => {
         if (!originalAudioBuffer) return;
        zoomLevel = Math.max(MIN_ZOOM, zoomLevel / 1.5);
        applyZoom();
    });

     waveformContainer.addEventListener('scroll', () => {
        // Redrawing segments on every scroll event can be performance-intensive.
        // Redrawing only segments/playhead might be better.
        // Debouncing this could be useful for very long files.
        drawSegmentsOnWaveform(); // Need to reposition segment divs on scroll
        updatePlayheadPosition(); // Playhead position depends on scroll
        drawSelectionOverlay(); // Selection overlay depends on scroll
     });


    // Segmentation Controls
    addActorButton.addEventListener('click', addActor);
    assignSegmentButton.addEventListener('click', assignSegment);
    clearSelectionButton.addEventListener('click', clearSelection);

    // Waveform Interaction
    waveformCanvas.addEventListener('mousedown', startSelection);
    // Mouse move/up listeners are added dynamically during selection/drag


    // Project Management
    saveProjectButton.addEventListener('click', saveProjectState);
    loadProjectButton.addEventListener('click', () => projectFileInput.click());
    projectFileInput.addEventListener('change', (e) => loadProjectState(e.target.files[0]));

     // Keyboard Shortcuts
     document.addEventListener('keydown', (e) => {
         // Don't trigger shortcuts if focus is inside a text input/textarea
         if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT') {
            // Exception: Allow space for play/pause? Maybe not, could type space.
            return;
         }

         switch (e.code) {
             case 'Space':
                 e.preventDefault(); // Prevent page scroll
                 togglePlayback();
                 break;
             case 'NumpadAdd':
             case 'Equal': // Often corresponds to '+' key
                 if(e.ctrlKey || e.metaKey) { // Ctrl/Cmd + '+' for zoom
                     e.preventDefault();
                     zoomInButton.click();
                 }
                 break;
             case 'NumpadSubtract':
             case 'Minus':
                  if(e.ctrlKey || e.metaKey) { // Ctrl/Cmd + '-' for zoom
                     e.preventDefault();
                     zoomOutButton.click();
                  }
                 break;
            // Add more shortcuts as needed (e.g., Ctrl+S for save, arrow keys for navigation)
            // case 'KeyS':
            //     if (e.ctrlKey || e.metaKey) {
            //         e.preventDefault();
            //         if (!saveProjectButton.disabled) saveProjectState();
            //     }
            //     break;
         }
     });

    // Window Resize
    window.addEventListener('resize', () => {
        // Optional: Debounce this for performance
         if (originalAudioBuffer) {
            applyZoom(); // Re-apply zoom to adjust canvas width relative to new container size
         }
    });


    // --- Initialization ---
    updateStatus("Initializing...");
    initDB().then(() => {
         updateStatus("Ready. Upload an audio file.");
         // loadProjectFromDB(); // Optional: Try loading last saved state
     }).catch(err => {
         updateStatus("IndexedDB could not be initialized. Project auto-saving disabled.", true);
     });
    updateActorDropdown(); // Initialize dropdown state


}); // End DOMContentLoaded