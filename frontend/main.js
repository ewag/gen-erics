// File: frontend/main.js
import './style.css'; // Import CSS (Vite handles this)

// Import Cornerstone Core and Tools
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { RenderingEngine, Enums as csEnums } from '@cornerstonejs/core';
import { init as csRenderInit } from '@cornerstonejs/core';
import { init as csToolsInit } from '@cornerstonejs/tools';

// Basic tools
import {
    PanTool,
    WindowLevelTool, // Might not apply to PNG but good to have
    ZoomTool,
    // StackScrollMouseWheelTool, // For potential future multi-frame previews
    ToolGroupManager,
} from '@cornerstonejs/tools';


// --- Configuration ---
//const API_BASE_URL = 'http://derp-gen-erics-backend.default.svc.cluster.local:80/api/v1'; // K8s Service URL
const API_BASE_URL = '/api/v1'; // Use relative path via Ingress
const studiesListElement = document.getElementById('studies-list');
const renderingEngineId = 'myRenderingEngine'; // ID for the main rendering engine
const toolGroupId = "STACK_TOOL_GROUP_ID"; // ID for our tool group

// --- Mock Data (Replace with actual UIDs) ---
const studies = [
  { studyUID: "STUDY_UID_1_HOT", instanceUID: "INSTANCE_UID_FOR_STUDY_1_HOT" },
  { studyUID: "STUDY_UID_2_COLD", instanceUID: "INSTANCE_UID_FOR_STUDY_2_COLD" },
  { studyUID: "STUDY_UID_3_ARCHIVE", instanceUID: "INSTANCE_UID_FOR_STUDY_3_ARCHIVE" },
  { studyUID: "STUDY_UID_4_UNKNOWN", instanceUID: "INSTANCE_UID_FOR_STUDY_4" },
];


// --- Cornerstone Initialization ---
async function initializeCornerstone() {
    console.log('Initializing Cornerstone Rendering...');
    await csRenderInit();
    console.log('Initializing Cornerstone Tools...');
    csToolsInit();

    // Add tools
    cornerstoneTools.addTool(PanTool);
    cornerstoneTools.addTool(WindowLevelTool);
    cornerstoneTools.addTool(ZoomTool);
    // cornerstoneTools.addTool(StackScrollMouseWheelTool);

    // Define a tool group, planning for stack viewports
    const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
    if (!toolGroup) {
      console.error('Failed to create tool group');
      return;
    }

    // Add tools to the tool group
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(WindowLevelTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    // toolGroup.addTool(StackScrollMouseWheelTool.toolName);

    // Set tool bindings (Primary: W/L, Secondary: Pan, Middle: Zoom, Wheel: Stack Scroll)
    toolGroup.setToolActive(WindowLevelTool.toolName, { mouseButtonMask: 1 });
    toolGroup.setToolActive(PanTool.toolName, { mouseButtonMask: 4 }); // Middle mouse button
    toolGroup.setToolActive(ZoomTool.toolName, { mouseButtonMask: 2 }); // Right mouse button
    // toolGroup.setToolActive(StackScrollMouseWheelTool.toolName); // Mouse Wheel

    console.log('Cornerstone initialized.');
}

// --- API Fetch Functions (Keep as before) ---
async function fetchLocation(studyUID) { /* ... same as before ... */
    try {
        const response = await fetch(`${API_BASE_URL}/studies/${studyUID}/location`);
        if (!response.ok) { let errorMsg = `HTTP error! status: ${response.status}`; try { const errData = await response.json(); errorMsg = errData.error || errData.message || errorMsg; } catch(e) {} throw new Error(errorMsg); }
        return await response.json();
    } catch (error) { console.error(`Error fetching location for ${studyUID}:`, error); return { tier: 'error', locationType: `Error: ${error.message}` }; }
}
async function moveStudy(studyUID, targetTier) { /* ... same as before ... */
    console.log(`Requesting move for ${studyUID} to ${targetTier}`);
    try {
        const response = await fetch(`${API_BASE_URL}/studies/${studyUID}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetTier: targetTier }) });
        if (!response.ok) { let errorMsg = `HTTP error! status: ${response.status}`; try { const errData = await response.json(); errorMsg = errData.error || errData.message || errorMsg; } catch (e) {} throw new Error(errorMsg); }
        return await response.json();
    } catch (error) { console.error(`Error moving study ${studyUID}:`, error); alert(`Failed to move study: ${error.message}`); return null; }
}


// --- UI Rendering Functions ---

// Helper to get or create rendering engine
async function getRenderingEngine() {
    let renderingEngine = cornerstone.getRenderingEngine(renderingEngineId);
    if (!renderingEngine) {
        renderingEngine = new RenderingEngine(renderingEngineId);
    }
    return renderingEngine;
}

async function updateStudyDisplay(studyElement, study) {
    const statusSpan = studyElement.querySelector('.status');
    const previewElement = studyElement.querySelector('.preview'); // This is the div Cornerstone will use
    statusSpan.textContent = 'loading...';
    statusSpan.className = 'status unknown';
    previewElement.innerHTML = ''; // Clear previous content

    const renderingEngine = await getRenderingEngine();
    const viewportId = `viewport-${study.studyUID}`; // Unique ID for this viewport

    // Try to clean up previous viewport if it exists
    try {
        renderingEngine.disableElement(viewportId);
    } catch (e) { /* Likely didn't exist, ignore */ }


    const statusData = await fetchLocation(study.studyUID);

    if (statusData) {
        let statusText = `${statusData.tier || 'unknown'}`;
        statusSpan.className = `status ${statusData.tier || 'unknown'}`;
        if (statusData.locationType === 'edge' && statusData.edgeId) { statusText += ` @ ${statusData.edgeId}`; }
        else if (statusData.locationType && statusData.locationType !== 'unknown') { statusText += ` @ ${statusData.locationType}`; }
        if (statusData.tier === 'error') { statusText = statusData.locationType; }
        statusSpan.textContent = statusText;

        // Show preview using Cornerstone if hot
        if (statusData.tier === 'hot') {
            if (study.instanceUID && !study.instanceUID.startsWith("INSTANCE_UID_FOR_")) {
                previewElement.textContent = 'Loading preview...'; // Placeholder text

                // **Cornerstone Logic**
                try {
                    const imageId = `web:${API_BASE_URL}/studies/${study.studyUID}/instances/${study.instanceUID}/preview`; // Use 'web:' scheme
                    // For 'web:' scheme to work, cornerstone-web-image-loader needs to be installed and registered.
                    // Let's try fetching the blob manually for now as a workaround,
                    // assuming the preview endpoint returns a standard image format (PNG/JPEG)
                    // We'll treat it as a single-image stack.

                    const response = await fetch(`${API_BASE_URL}/studies/${study.studyUID}/instances/${study.instanceUID}/preview`);
                    if (!response.ok) throw new Error(`Failed to fetch preview: ${response.status}`);
                    const imageBlob = await response.blob();

                    // Create a fake imageId that Cornerstone can use (doesn't have to be real URL here)
                    const csImageId = `myCustomLoader:${study.instanceUID}`; // Custom scheme

                    // --- This part is more complex: Need to create an Image object ---
                    // Normally a loader does this. Manually creating involves more steps.
                    // For simplicity **let's revert to the img tag temporarily** while setting up Cornerstone infrastructure.
                    // We can replace this with proper Cornerstone loading later.

                    previewElement.innerHTML = ''; // Clear loading text
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(imageBlob); // Use blob URL
                    img.alt = `Preview for instance ${study.instanceUID}`;
                    img.style.maxWidth = '100%'; // Ensure image fits div
                    img.style.maxHeight = '100%';
                    img.onload = () => URL.revokeObjectURL(img.src); // Clean up blob URL
                    img.onerror = () => { previewElement.textContent = 'Preview load failed (image error).'; };
                    previewElement.appendChild(img);

                    // Even though using <img>, enable the element for tools
                     await renderingEngine.enableElement({
                         viewportId: viewportId,
                         element: previewElement,
                         type: csEnums.ViewportType.STACK, // Treat as stack for now
                     });
                     // Add the viewport to the tool group
                     toolGroup.addViewport(viewportId, renderingEngineId);

                    // Set tools active (might not all work perfectly on a simple img, especially W/L)
                    // toolGroup.setToolActive(WindowLevelTool.toolName, { mouseButtonMask: 1 });
                    // toolGroup.setToolActive(PanTool.toolName, { mouseButtonMask: 4 });
                    // toolGroup.setToolActive(ZoomTool.toolName, { mouseButtonMask: 2 });

                    console.log(`Cornerstone element enabled for ${viewportId}`);


                } catch (error) {
                    console.error(`Error loading preview for ${study.instanceUID}:`, error);
                    previewElement.textContent = `Preview load failed: ${error.message}`;
                }

            } else {
                previewElement.textContent = 'Preview N/A (Instance UID not set/valid).';
            }
        } else if (statusData.tier !== 'error') {
            previewElement.textContent = `Preview N/A (Tier: ${statusData.tier || 'unknown'}).`;
        } else {
            previewElement.textContent = 'Preview N/A (Error loading status).';
        }
    } else {
        // Handled by error status from fetchLocation
    }
}


// --- Render study item (mostly unchanged, ensures preview div exists) ---
function renderStudyItem(study) {
    const item = document.createElement('div');
    item.className = 'study-item';
    item.id = `study-${study.studyUID}`;

    const title = document.createElement('h3');
    title.textContent = `Study UID: ${study.studyUID}`;
    item.appendChild(title);

    const statusPara = document.createElement('p');
    statusPara.innerHTML = 'Status: <span class="status unknown">loading...</span>';
    item.appendChild(statusPara);

    // Div that Cornerstone will use for rendering
    const previewDiv = document.createElement('div');
    previewDiv.className = 'preview';
    // Add specific ID for cornerstone enabling
    previewDiv.id = `preview-${study.studyUID}`;
    item.appendChild(previewDiv);


    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'controls';
    item.appendChild(controlsDiv);

    // Move Buttons
    const tiers = ['hot', 'warm', 'cold', 'archive'];
    tiers.forEach(tier => {
        const button = document.createElement('button');
        button.textContent = `Move to ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
        button.onclick = async () => {
            controlsDiv.querySelectorAll('button').forEach(btn => btn.disabled = true);
            const result = await moveStudy(study.studyUID, tier);
            // Re-fetch status after move request acknowledged
            if (result) {
                await updateStudyDisplay(item, study);
            }
             controlsDiv.querySelectorAll('button').forEach(btn => btn.disabled = false);
        };
        controlsDiv.appendChild(button);
    });

    return item;
}

// --- Initial App Load ---
async function initializeApp() {
    if (!studiesListElement) {
        console.error("Could not find #studies-list element!");
        return;
    }
    studiesListElement.innerHTML = ''; // Clear "Loading..." message

    if (!studies || studies.length === 0) {
         studiesListElement.innerHTML = '<p>No studies defined</p>';
         return;
    }

    // Initialize Cornerstone Engines and Tools
    await initializeCornerstone();

    // Render study items and fetch initial status
    studies.forEach(study => {
        if (!study || !study.studyUID) return;
        const studyElement = renderStudyItem(study);
        studiesListElement.appendChild(studyElement);
        updateStudyDisplay(studyElement, study); // Fetch initial status
    });
}

document.addEventListener('DOMContentLoaded', initializeApp);