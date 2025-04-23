// File: frontend/main.js
import './style.css'; // Import CSS (Vite handles this)

// Import Cornerstone Core and Tools
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { RenderingEngine, Enums as csEnums } from '@cornerstonejs/core';
import { init as csRenderInit } from '@cornerstonejs/core';
import { init as csToolsInit } from '@cornerstonejs/tools';
import dicomParser from 'dicom-parser';
import * as dicomImageLoader from '@cornerstonejs/dicom-image-loader'; // Use namespace import

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

async function initializeCornerstone() {
    console.log('>>> Checking Imported dicomImageLoader:', dicomImageLoader); // Good log
    console.log('Initializing Cornerstone Rendering...');
    await csRenderInit();
    console.log('Initializing Cornerstone Tools...');
    csToolsInit();

    // --- Initialize DICOM Image Loader & Workers ---
    console.log('Initializing DICOM Image Loader...');
    try {
        // Configure the loader
        dicomImageLoader.configure({
            useWebWorkers: false, // temp change
            decodeConfig: { convertFloatPixelDataToInt: false },
        });
        /*
        // Log objects before worker init
        console.log('dicomImageLoader object (before worker init):', dicomImageLoader);
        console.log('dicomImageLoader.webWorkerManager (before worker init):', dicomImageLoader.webWorkerManager);

        // Initialize workers
        const workerConfig = {
            maxWebWorkers: Math.max(navigator.hardwareConcurrency || 1, 1),
            startWebWorkersOnDemand: true,
            webWorkerPath: '/decodeImageFrameWorker.js', // Path in public/dist
            taskConfiguration: { // Let's try putting taskConfig back now we fixed .external
                decodeTask: {
                    initializeCodecsOnStartup: false,
                    usePDFJS: false,
                    strict: false,
                    codecPath: '/cornerstoneDICOMImageLoaderCodecs.js' // Path in public/dist/codecs maybe? Check actual path. Let's assume root for now.
                },
            },
        };
        dicomImageLoader.webWorkerManager.initialize(workerConfig);
        console.log('DICOM Image Loader web workers initialization attempted.');
        */
    } catch (error) { // Correct variable name here
        console.error('Error initializing DICOM Image Loader web workers:', error);
        // Consider how fatal this error is - should we stop here?
    }
    // --- End DICOM Image Loader Worker Init ---


    // --- Register the Loader with Cornerstone Core (MOVED HERE) ---
    console.log('Registering DICOM image loaders with Cornerstone.');
    try {
        // Ensure necessary imports are at top: import * as cornerstone from '@cornerstonejs/core';
        if (dicomImageLoader.wadouri && typeof dicomImageLoader.wadouri.loadImage === 'function') {
            cornerstone.imageLoader.registerImageLoader('wadouri', dicomImageLoader.wadouri.loadImage);
            console.log('Registered WADO-URI loader scheme.');
        } else if (dicomImageLoader.loadImage && typeof dicomImageLoader.loadImage === 'function') {
             cornerstone.imageLoader.registerImageLoader('wadouri', dicomImageLoader.loadImage);
             console.log('Registered WADO-URI loader scheme (direct).');
        } else {
            console.error('Could not find suitable loadImage function on dicomImageLoader to register.');
        }
    } catch (regError) { // Use a different variable name for clarity
        console.error('Error during image loader registration:', regError);
    }
    // --- End Loader Registration ---


    // Add tools...
    console.log('Adding Cornerstone tools...');
    try { // Add try/catch around tool setup too
        cornerstoneTools.addTool(PanTool);
        cornerstoneTools.addTool(WindowLevelTool);
        cornerstoneTools.addTool(ZoomTool);

        // Define tool group...
        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
        if (!toolGroup) throw new Error('Failed to create tool group'); // Throw error if fails

        toolGroup.addTool(PanTool.toolName);
        toolGroup.addTool(WindowLevelTool.toolName);
        toolGroup.addTool(ZoomTool.toolName);

        // Set tool bindings
        toolGroup.setToolActive(WindowLevelTool.toolName, { mouseButtonMask: 1 });
        toolGroup.setToolActive(PanTool.toolName, { mouseButtonMask: 4 });
        toolGroup.setToolActive(ZoomTool.toolName, { mouseButtonMask: 2 });

        console.log('Cornerstone tools initialized and configured.');
    } catch (toolError) {
        console.error('Error setting up Cornerstone tools:', toolError);
    }

    console.log('Cornerstone base initialization complete.'); // Renamed log
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

console.log('DICOM Image Loader and Web Workers initialized successfully (using updated paths).');

// --- UI Rendering Functions ---

// Helper to get or create rendering engine
async function getRenderingEngine() {
    let renderingEngine = cornerstone.getRenderingEngine(renderingEngineId);
    if (!renderingEngine) {
        renderingEngine = new RenderingEngine(renderingEngineId);
    }
    return renderingEngine;
}

// Function to update a single study element based on status
async function updateStudyDisplay(study, studyElement) {
    // Get the elements within this specific study card
    const statusElement = studyElement.querySelector('.status-text');
    const actionButton = studyElement.querySelector('.action-button');
    const previewElement = studyElement.querySelector('.preview-area'); // The div for cornerstone

    // Make sure cornerstone rendering engine is available
    const renderingEngine = await getRenderingEngine(); // Use await here
    const viewportId = `viewport-${study.ID}`; // Use Orthanc Study ID for uniqueness

    // Default state
    statusElement.textContent = `Tier: ${study.LocationStatus.tier || 'N/A'}, Location: <span class="math-inline">\{study\.LocationStatus\.locationType \|\| 'N/A'\}</span>{study.LocationStatus.edgeId ? ' ('+study.LocationStatus.edgeId+')' : ''}`;
    actionButton.textContent = 'Move Study'; // Or determine based on status
    actionButton.disabled = false;
    previewElement.textContent = ''; // Clear previous content
    previewElement.innerHTML = ''; // Clear any old img tags too
    try {
         // Attempt to disable element first in case it was previously enabled
         renderingEngine.disableElement(viewportId);
    } catch (e) { /* Ignore errors if element wasn't enabled */ }

    if (study.LocationStatus.tier === 'hot') {
        actionButton.textContent = 'Move to Cold';
        actionButton.onclick = () => moveStudy(study.ID, 'cold', ''); // Use Orthanc ID

        // --- Load DICOM using Cornerstone ---
        try {
            previewElement.textContent = 'Loading DICOM...'; // Placeholder text

            // --- IMPORTANT ASSUMPTION ---
            // We need the Orthanc *Instance ID* of at least one instance
            // from this study to fetch the file. Let's assume the data fetched
            // from `/api/v1/studies` now includes a sample InstanceID per study,
            // maybe like study.SampleInstanceID. You might need to adjust your
            // backend /studies endpoint or fetch /instances separately first.
            // If SampleInstanceID is missing, this will fail.
            if (!study.SampleInstanceID) { // Adjust field name as needed
               throw new Error('Sample Instance ID not available for study ' + study.ID);
            }
            // -----------------------------

            // Construct the image ID using wadouri scheme pointing to *our* backend API endpoint
            // window.location.origin gives http://pacs.local:8080 (or http://localhost:5173 in dev)
            // API_BASE_URL is '/api/v1'
            // We need study ID (Orthanc ID) and instance ID (Orthanc ID)
            const imageId = `wadouri:<span class="math-inline">\{window\.location\.origin\}</span>{API_BASE_URL}/studies/<span class="math-inline">\{study\.ID\}/instances/</span>{study.SampleInstanceID}/file`;
            console.log("Attempting to load imageId:", imageId);


            // Ensure the element exists and is ready
            previewElement.style.width = "256px"; // Set explicit size for viewport
            previewElement.style.height = "256px";
            previewElement.innerHTML = ''; // Clear loading text

            const viewportInput = {
              viewportId: viewportId,
              element: previewElement,
              type: csEnums.ViewportType.STACK, // Use STACK viewport for standard 2D images
            };

            // Enable the element *before* loading data into it
            renderingEngine.enableElement(viewportInput);

            // Add the viewport to the tool group
            toolGroup.addViewport(viewportId, renderingEngineId);

            // Get the viewport object
            const viewport = renderingEngine.getViewport(viewportId);

            // Load the DICOM image via its ID - Cornerstone handles fetching via the loader
            // Use setStack for STACK viewports
            await viewport.setStack([imageId], 0); // Set the stack with our single imageId

            // Optionally set initial Window/Level or other properties
            // viewport.setProperties({ voiRange: cs.utilities.windowLevel.getVOIFromDICOMPresets(image, 'CT-Bone') });
            viewport.render(); // Render the loaded image

            // Activate tools for this viewport
            toolGroup.setToolActive(WindowLevelTool.toolName, { mouseButtonMask: 1 }); // Left click
            toolGroup.setToolActive(PanTool.toolName, { mouseButtonMask: 4 });       // Middle click
            toolGroup.setToolActive(ZoomTool.toolName, { mouseButtonMask: 2 });      // Right click
            // toolGroup.setToolActive(StackScrollMouseWheelTool.toolName); // If needed later

            console.log(`Cornerstone DICOM loaded for ${viewportId}`);

        } catch (error) {
            console.error(`Error loading/displaying DICOM for study ${study.ID}:`, error);
            previewElement.textContent = `Error loading image: ${error.message}`;
            // Attempt to disable the element if loading failed
             try { renderingEngine.disableElement(viewportId); } catch(e){ /* ignore */ }
        }
        // --- End DICOM Loading ---

    } else if (study.LocationStatus.tier === 'cold') {
        actionButton.textContent = 'Move to Hot';
        actionButton.onclick = () => moveStudy(study.ID, 'hot', 'dev-k3d-node'); // Use Orthanc ID, provide edge ID
        previewElement.textContent = 'Status: Cold (Preview N/A)';
    } else if (study.LocationStatus.tier === 'archive') {
        actionButton.textContent = 'Retrieve'; // Or Restore
        actionButton.onclick = () => moveStudy(study.ID, 'cold', ''); // Move to cold first? Or directly to hot? Define workflow.
         previewElement.textContent = 'Status: Archive (Preview N/A)';
    } else {
        actionButton.textContent = 'Unknown State';
        actionButton.disabled = true;
        previewElement.textContent = 'Status: Unknown';
    }
}

// --- Initial App Load ---
async function initializeApp() {
    console.log('Initializing App...');
    if (!studiesListElement) {
        console.error("Could not find #studies-list element!");
        return;
    }
    studiesListElement.innerHTML = '<p>Initializing Cornerstone...</p>';

    // Initialize Cornerstone Engines and Tools FIRST
    await initializeCornerstone();

    // Now fetch the actual study data from the backend
    studiesListElement.innerHTML = '<p>Loading studies from API...</p>';
    fetchStudies(); // Trigger the data fetching and rendering process
}

document.addEventListener('DOMContentLoaded', initializeApp);

// Keep track of studies globally or within component state if using React/Vue etc.
let workspaceStudies = []; // Assuming a simple global array for now

// Function to fetch studies and their first instance ID
async function fetchStudies() {
    console.log('Fetching studies from backend...');
    let workspaceStudies = []; // Define locally or globally if needed elsewhere
    try {
        // ... (fetch studies from /studies endpoint) ...
        const studiesResponse = await fetch(`${API_BASE_URL}/studies`);
        if (!studiesResponse.ok) throw new Error(`Studies fetch failed: ${studiesResponse.status}`);
        const studiesData = await studiesResponse.json();
        if (!Array.isArray(studiesData)) throw new Error('Invalid study data received');

        // ... (enrich studies with SampleInstanceID using Promise.all as before) ...
         const enrichedStudiesPromises = studiesData.map(async (study) => {
             if (!study.ID) { /* ... handle missing ID ... */ return study; }
             try {
                 const instancesResponse = await fetch(`<span class="math-inline">\{API\_BASE\_URL\}/studies/</span>{study.ID}/instances`);
                 if (instancesResponse.ok) {
                     const instancesData = await instancesResponse.json();
                     if (Array.isArray(instancesData) && instancesData.length > 0 && instancesData[0].ID) {
                         study.SampleInstanceID = instancesData[0].ID; // Add first instance ID
                     } else { study.SampleInstanceID = null; }
                 } else { study.SampleInstanceID = null; }
             } catch (instanceError) { study.SampleInstanceID = null; }
             return study;
         });
        workspaceStudies = await Promise.all(enrichedStudiesPromises);

        // --- CALL SEPARATE RENDER FUNCTION ---
        renderUI(workspaceStudies); // Pass enriched studies to render function

    } catch (error) {
        console.error('Failed to fetch or process studies:', error);
        if (studiesListElement) {
            studiesListElement.textContent = `Error loading studies: ${error.message}`;
        }
    }
}
// NEW Function to render the list of study items
function renderUI(studiesToRender) {
    if (!studiesListElement) return;
    studiesListElement.innerHTML = ''; // Clear loading message

    if (!studiesToRender || studiesToRender.length === 0) {
        studiesListElement.textContent = 'No studies found in Orthanc.';
        return;
    }

    studiesToRender.forEach(study => {
        if (!study || !study.ID) return; // Check for Orthanc ID

        // Fetch initial location status *before* creating element
        fetchLocation(study.ID).then(status => {
            study.LocationStatus = status || { tier: 'unknown', locationType: 'error' }; // Add status to study object
            const studyElement = renderStudyItem(study); // Create element with study data
            studiesListElement.appendChild(studyElement);
            updateStudyDisplay(study, studyElement); // Update display based on status (fetches location again - slightly redundant but ok)
        }).catch(error => {
             console.error(`Failed to get initial location for study ${study.ID}:`, error);
             study.LocationStatus = { tier: 'unknown', locationType: 'error' };
             const studyElement = renderStudyItem(study); // Still render item, show error status
             studiesListElement.appendChild(studyElement);
             updateStudyDisplay(study, studyElement);
        });
    });
}
function renderStudyItem(study) { // Receives enriched study object
    const item = document.createElement('div');
    item.className = 'study-item';
    item.id = `study-${study.ID}`; // Use Orthanc Study ID

    const title = document.createElement('h3');
    title.textContent = `Patient: <span class="math-inline">\{study\.PatientMainTags?\.PatientName \|\| 'N/A'\} \(</span>{study.PatientMainTags?.PatientID || 'N/A'})`;
    item.appendChild(title);

    const studyInfo = document.createElement('p');
    studyInfo.textContent = `Study: <span class="math-inline">\{study\.MainTags?\.StudyDescription \|\| 'N/A'\} \(</span>{study.MainTags?.StudyDate || 'N/A'})`;
    item.appendChild(studyInfo);

    // Placeholder for status text
    const statusPara = document.createElement('p');
    statusPara.innerHTML = 'Status: <span class="status-text status unknown">loading...</span>'; // Use status-text class
    item.appendChild(statusPara);

    // Div for Cornerstone viewport
    const previewDiv = document.createElement('div');
    previewDiv.className = 'preview-area'; // Use preview-area class
    previewDiv.id = `viewport-${study.ID}`; // Unique ID for Cornerstone
    previewDiv.style.width = "256px"; // Set size here or via CSS
    previewDiv.style.height = "256px";
    previewDiv.style.backgroundColor = "black"; // Set background here or via CSS
    item.appendChild(previewDiv);

    // Container for action buttons
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'controls';
    // Add a placeholder button - updateStudyDisplay adds/modifies it
    const actionButton = document.createElement('button');
    actionButton.className = 'action-button'; // Use action-button class
    actionButton.textContent = 'Loading Actions...';
    actionButton.disabled = true;
    controlsDiv.appendChild(actionButton);
    item.appendChild(controlsDiv);

    return item;
}