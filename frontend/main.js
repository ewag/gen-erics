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
    console.log('Initializing Cornerstone...');

    try {
        // Initialize Cornerstone core
        await csRenderInit();
        
        // Initialize Cornerstone tools
        await csToolsInit();
    
        // Configure DICOM image loader
        dicomImageLoader.configure({
            useWebWorkers: false, // Disable web workers for simplicity
            decodeConfig: { convertFloatPixelDataToInt: false },
        });
    
        // Register DICOM image loader with Cornerstone
        if (dicomImageLoader.wadouri && typeof dicomImageLoader.wadouri.loadImage === 'function') {
            cornerstone.imageLoader.registerImageLoader('wadouri', dicomImageLoader.wadouri.loadImage);
            console.log('Registered WADO-URI loader scheme.');
        } else if (dicomImageLoader.loadImage && typeof dicomImageLoader.loadImage === 'function') {
             cornerstone.imageLoader.registerImageLoader('wadouri', dicomImageLoader.loadImage);
             console.log('Registered WADO-URI loader scheme (direct).');
        } else {
            console.error('Could not find suitable loadImage function on dicomImageLoader to register.');
        }
    
        // Add tools and set up tool group
        cornerstoneTools.addTool(PanTool);
        cornerstoneTools.addTool(WindowLevelTool);
        cornerstoneTools.addTool(ZoomTool);
    
        // Create a tool group for all viewports
        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
        if (!toolGroup) throw new Error('Failed to create tool group');
    
        toolGroup.addTool(PanTool.toolName);
        toolGroup.addTool(WindowLevelTool.toolName);
        toolGroup.addTool(ZoomTool.toolName);
    
        // Set default tool interactions
        toolGroup.setToolActive(WindowLevelTool.toolName, { mouseButtonMask: 1 }); // Left click
        toolGroup.setToolActive(PanTool.toolName, { mouseButtonMask: 4 });       // Middle click
        toolGroup.setToolActive(ZoomTool.toolName, { mouseButtonMask: 2 });      // Right click
    
        console.log('Cornerstone initialization complete.');
        return true;
    } catch (error) {
        console.error('Error initializing Cornerstone:', error);
        return false;
    }
}

// Helper to get or create the rendering engine
async function getRenderingEngine() {
    let renderingEngine = cornerstone.getRenderingEngine(renderingEngineId);
    if (!renderingEngine) {
        renderingEngine = new RenderingEngine(renderingEngineId);
    }
    return renderingEngine;
}

// --- API Fetch Functions ---
async function fetchLocation(studyUID) {
    try {
        const response = await fetch(`${API_BASE_URL}/studies/${studyUID}/location`);
        if (!response.ok) { 
            let errorMsg = `HTTP error! status: ${response.status}`; 
            try { 
                const errData = await response.json(); 
                errorMsg = errData.error || errData.message || errorMsg; 
            } catch(e) {} 
            throw new Error(errorMsg); 
        }
        return await response.json();
    } catch (error) { 
        console.error(`Error fetching location for ${studyUID}:`, error); 
        return { tier: 'error', locationType: `Error: ${error.message}` }; 
    }
}

async function moveStudy(studyUID, targetTier, targetLocation = '') {
    console.log(`Requesting move for ${studyUID} to ${targetTier} ${targetLocation ? 'at ' + targetLocation : ''}`);
    try {
        const moveData = { targetTier: targetTier };
        if (targetLocation) {
            moveData.targetLocation = targetLocation;
        }
        
        const response = await fetch(`${API_BASE_URL}/studies/${studyUID}/move`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(moveData) 
        });
        
        if (!response.ok) { 
            let errorMsg = `HTTP error! status: ${response.status}`; 
            try { 
                const errData = await response.json(); 
                errorMsg = errData.error || errData.message || errorMsg; 
            } catch (e) {} 
            throw new Error(errorMsg); 
        }
        
        const result = await response.json();
        alert(`Study successfully moved to ${targetTier} tier`);
        return result;
    } catch (error) { 
        console.error(`Error moving study ${studyUID}:`, error); 
        alert(`Failed to move study: ${error.message}`); 
        return null; 
    }
}

// Function to update a single study element based on status
async function updateStudyDisplay(study, studyElement) {
    // Get the elements within this specific study card
    const statusElement = studyElement.querySelector('.status-text');
    const actionButton = studyElement.querySelector('.action-button');
    const previewElement = studyElement.querySelector('.preview-area');

    // Make sure cornerstone rendering engine is available
    const renderingEngine = await getRenderingEngine();
    const viewportId = `viewport-${study.ID}`; // Use Orthanc Study ID for uniqueness

    // Default state - set initial status display
    statusElement.textContent = `Tier: ${study.LocationStatus.tier || 'N/A'}, Location: ${study.LocationStatus.locationType || 'N/A'}${study.LocationStatus.edgeId ? ' ('+study.LocationStatus.edgeId+')' : ''}`;
    
    // Clear previous content
    previewElement.textContent = ''; 
    previewElement.innerHTML = '';
    
    try {
        // Try to disable element if it was previously enabled
        renderingEngine.disableElement(viewportId);
    } catch (e) { /* Ignore errors if element wasn't enabled */ }

    // Configure button and preview based on tier status
    if (study.LocationStatus.tier === 'hot') {
        // Hot tier - can view images, offer to move to cold
        actionButton.textContent = 'Move to Cold';
        actionButton.className = 'action-button hot';
        actionButton.disabled = false;
        actionButton.onclick = () => moveStudy(study.ID, 'cold').then(() => {
            // After move, refresh the study status
            fetchLocation(study.ID).then(status => {
                study.LocationStatus = status;
                updateStudyDisplay(study, studyElement);
            });
        });

        // --- Load DICOM Preview ---
        try {
            previewElement.textContent = 'Loading DICOM...';

            // Check if we have an instance ID to load
            if (!study.SampleInstanceID) {
                throw new Error('No instance available for preview');
            }

            // Set up the preview container
            previewElement.style.width = "256px";
            previewElement.style.height = "256px";
            previewElement.innerHTML = '';

            // Construct the image ID using wadouri scheme
            const imageId = `wadouri:${window.location.origin}${API_BASE_URL}/studies/${study.ID}/instances/${study.SampleInstanceID}/file`;
            console.log("Loading DICOM from:", imageId);

            // Create viewport configuration
            const viewportInput = {
                viewportId: viewportId,
                element: previewElement,
                type: csEnums.ViewportType.STACK,
            };

            // Enable viewport in rendering engine
            renderingEngine.enableElement(viewportInput);

            // Connect viewport to tool group
            const toolGroupInstance = ToolGroupManager.getToolGroup(toolGroupId);
            if (toolGroupInstance) {
                toolGroupInstance.addViewport(viewportId, renderingEngineId);
            }

            // Get viewport and load image
            const viewport = renderingEngine.getViewport(viewportId);
            
            // Use setStack for STACK viewports with an array of image IDs (just one in this case)
            viewport.setStack([imageId], 0).then(() => {
                viewport.render();
                console.log(`DICOM loaded for ${viewportId}`);
            }).catch(error => {
                console.error(`Error loading DICOM for viewport ${viewportId}:`, error);
                previewElement.textContent = `Error loading image: ${error.message}`;
            });

        } catch (error) {
            console.error(`Error setting up DICOM preview for study ${study.ID}:`, error);
            previewElement.textContent = `Error: ${error.message}`;
            try { renderingEngine.disableElement(viewportId); } catch(e) { /* ignore */ }
        }

    } else if (study.LocationStatus.tier === 'cold') {
        // Cold tier - no preview, offer to move to hot
        actionButton.textContent = 'Move to Hot';
        actionButton.className = 'action-button cold';
        actionButton.disabled = false;
        actionButton.onclick = () => moveStudy(study.ID, 'hot', 'dev-k3d-node').then(() => {
            // After move, refresh the study status
            fetchLocation(study.ID).then(status => {
                study.LocationStatus = status;
                updateStudyDisplay(study, studyElement);
            });
        });
        previewElement.textContent = 'Status: Cold (Preview not available)';
        
    } else if (study.LocationStatus.tier === 'archive') {
        // Archive tier - no preview, offer to retrieve
        actionButton.textContent = 'Retrieve from Archive';
        actionButton.className = 'action-button archive';
        actionButton.disabled = false;
        actionButton.onclick = () => moveStudy(study.ID, 'cold').then(() => {
            // After move, refresh the study status
            fetchLocation(study.ID).then(status => {
                study.LocationStatus = status;
                updateStudyDisplay(study, studyElement);
            });
        });
        previewElement.textContent = 'Status: Archive (Preview not available)';
        
    } else {
        // Unknown or error state
        actionButton.textContent = 'Unknown State';
        actionButton.className = 'action-button';
        actionButton.disabled = true;
        previewElement.textContent = `Status: ${study.LocationStatus.tier || 'Unknown'}`;
    }
}

// Function to fetch studies and their first instance ID
async function fetchStudies() {
    console.log('Fetching studies from backend...');
    try {
        // Fetch list of studies
        const studiesResponse = await fetch(`${API_BASE_URL}/studies`);
        if (!studiesResponse.ok) {
            throw new Error(`Studies fetch failed: ${studiesResponse.status}`);
        }
        
        const studiesData = await studiesResponse.json();
        if (!Array.isArray(studiesData)) {
            throw new Error('Invalid study data received');
        }

        // For each study, fetch a sample instance ID
        const enrichedStudiesPromises = studiesData.map(async (study) => {
            if (!study.ID) { 
                console.warn('Study missing ID:', study);
                return study; 
            }
            
            try {
                const instancesResponse = await fetch(`${API_BASE_URL}/studies/${study.ID}/instances`);
                if (instancesResponse.ok) {
                    const instancesData = await instancesResponse.json();
                    if (Array.isArray(instancesData) && instancesData.length > 0 && instancesData[0].ID) {
                        study.SampleInstanceID = instancesData[0].ID;
                    } else { 
                        study.SampleInstanceID = null;
                        console.log(`No valid instances found for study ${study.ID}`);
                    }
                } else { 
                    study.SampleInstanceID = null;
                    console.warn(`Failed to fetch instances for study ${study.ID}: ${instancesResponse.status}`);
                }
            } catch (instanceError) { 
                study.SampleInstanceID = null;
                console.error(`Error fetching instances for study ${study.ID}:`, instanceError);
            }
            
            return study;
        });
        
        const workspaceStudies = await Promise.all(enrichedStudiesPromises);
        renderUI(workspaceStudies);

    } catch (error) {
        console.error('Failed to fetch or process studies:', error);
        if (studiesListElement) {
            studiesListElement.innerHTML = `<p>Error loading studies: ${error.message}</p>`;
        }
    }
}

// Function to render the list of study items
function renderUI(studiesToRender) {
    if (!studiesListElement) return;
    studiesListElement.innerHTML = ''; // Clear loading message

    if (!studiesToRender || studiesToRender.length === 0) {
        studiesListElement.innerHTML = '<p>No studies found.</p>';
        return;
    }

    studiesToRender.forEach(study => {
        if (!study || !study.ID) return; // Skip invalid studies

        // Fetch initial location status before creating element
        fetchLocation(study.ID).then(status => {
            study.LocationStatus = status || { tier: 'unknown', locationType: 'error' };
            const studyElement = renderStudyItem(study);
            studiesListElement.appendChild(studyElement);
            updateStudyDisplay(study, studyElement);
        }).catch(error => {
            console.error(`Failed to get location for study ${study.ID}:`, error);
            study.LocationStatus = { tier: 'unknown', locationType: 'error' };
            const studyElement = renderStudyItem(study);
            studiesListElement.appendChild(studyElement);
            updateStudyDisplay(study, studyElement);
        });
    });
}

// Create a DOM element for a single study
function renderStudyItem(study) {
    const item = document.createElement('div');
    item.className = 'study-item';
    item.id = `study-${study.ID}`;

    // Patient info
    const title = document.createElement('h3');
    title.textContent = `Patient: ${study.PatientMainTags?.PatientName || 'N/A'} (${study.PatientMainTags?.PatientID || 'N/A'})`;
    item.appendChild(title);

    // Study info
    const studyInfo = document.createElement('p');
    studyInfo.textContent = `Study: ${study.MainTags?.StudyDescription || 'N/A'} (${study.MainTags?.StudyDate || 'N/A'})`;
    item.appendChild(studyInfo);

    // Status text
    const statusPara = document.createElement('p');
    statusPara.innerHTML = 'Status: <span class="status-text">loading...</span>';
    item.appendChild(statusPara);

    // Cornerstone viewport container
    const previewDiv = document.createElement('div');
    previewDiv.className = 'preview-area';
    previewDiv.id = `viewport-${study.ID}`;
    previewDiv.style.width = "256px";
    previewDiv.style.height = "256px";
    previewDiv.style.backgroundColor = "black";
    previewDiv.textContent = 'Loading...';
    item.appendChild(previewDiv);

    // Action button
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'controls';
    const actionButton = document.createElement('button');
    actionButton.className = 'action-button';
    actionButton.textContent = 'Loading...';
    actionButton.disabled = true;
    controlsDiv.appendChild(actionButton);
    item.appendChild(controlsDiv);

    return item;
}

// Main app initialization
async function initializeApp() {
    console.log('Initializing App...');
    if (!studiesListElement) {
        console.error("Could not find #studies-list element!");
        return;
    }
    
    studiesListElement.innerHTML = '<p>Initializing Cornerstone...</p>';

    // Initialize Cornerstone first
    const cornerStoneInitialized = await initializeCornerstone();
    if (!cornerStoneInitialized) {
        studiesListElement.innerHTML = '<p>Error initializing Cornerstone. Check console for details.</p>';
        return;
    }

    // Now fetch studies and render the UI
    studiesListElement.innerHTML = '<p>Loading studies from API...</p>';
    fetchStudies();
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);