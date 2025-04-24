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
    WindowLevelTool,
    ZoomTool,
    ToolGroupManager,
} from '@cornerstonejs/tools';

// --- Configuration ---
const API_BASE_URL = '/api/v1'; // Use relative path via Ingress
const studiesListElement = document.getElementById('studies-list');
const renderingEngineId = 'myRenderingEngine'; // ID for the main rendering engine
const toolGroupId = "STACK_TOOL_GROUP_ID"; // ID for our tool group

// Initialize Cornerstone and DICOM tools
// Fix for DICOM Image Loader initialization
async function initializeCornerstone() {
    console.log('Initializing Cornerstone Rendering...');
    await csRenderInit();
    
    console.log('Initializing Cornerstone Tools...');
    await csToolsInit();

    // Initialize DICOM Image Loader - FIX: Use correct object structure
    console.log('DICOM Image Loader structure:');
    console.log(dicomImageLoader); // Log the entire object to debug its structure
    
    // Check if dicomImageLoader is properly loaded
    if (!dicomImageLoader) {
        console.error('dicomImageLoader is undefined or null');
        return;
    }
    
    // Try different approaches to configure the loader based on the object structure
    console.log('Configuring DICOM Image Loader...');
    try {
        if (typeof dicomImageLoader.configure === 'function') {
            // Direct configure method
            dicomImageLoader.configure({
                useWebWorkers: false,
                decodeConfig: { convertFloatPixelDataToInt: false },
            });
            console.log('Successfully configured dicomImageLoader directly');
        } else if (dicomImageLoader.wadouri && typeof dicomImageLoader.wadouri.configure === 'function') {
            // Configure via wadouri
            dicomImageLoader.wadouri.configure({
                useWebWorkers: false,
                decodeConfig: { convertFloatPixelDataToInt: false },
            });
            console.log('Successfully configured dicomImageLoader.wadouri');
        } else {
            console.warn('Could not find a valid configure method on dicomImageLoader. Will attempt to use default configuration.');
        }
    } catch (configError) {
        console.error('Error during dicomImageLoader configuration:', configError);
        // Continue anyway, may still work with default configuration
    }

    // Register the Loader with Cornerstone Core - use appropriate method based on structure
    console.log('Registering DICOM image loaders with Cornerstone...');
    try {
        // Try wadouri.loadImage first if available
        if (dicomImageLoader.wadouri && typeof dicomImageLoader.wadouri.loadImage === 'function') {
            cornerstone.imageLoader.registerImageLoader('wadouri', dicomImageLoader.wadouri.loadImage);
            console.log('Registered WADO-URI loader via dicomImageLoader.wadouri.loadImage');
        } 
        // Try main loadImage method if available
        else if (typeof dicomImageLoader.loadImage === 'function') {
            cornerstone.imageLoader.registerImageLoader('wadouri', dicomImageLoader.loadImage);
            console.log('Registered WADO-URI loader via dicomImageLoader.loadImage');
        }
        // Try cornerstoneWADOImageLoader if it's globally available
        else if (window.cornerstoneWADOImageLoader && typeof window.cornerstoneWADOImageLoader.wadouri.loadImage === 'function') {
            cornerstone.imageLoader.registerImageLoader('wadouri', window.cornerstoneWADOImageLoader.wadouri.loadImage);
            console.log('Registered WADO-URI loader via global cornerstoneWADOImageLoader');
        }
        else {
            console.error('Could not find a suitable loadImage function. DICOM loading will not work.');
            // Create a dummy loader for debugging that will log the attempt but fail gracefully
            cornerstone.imageLoader.registerImageLoader('wadouri', function(imageId) {
                console.error(`Attempted to load ${imageId} but no proper DICOM loader is configured.`);
                return {
                    promise: Promise.reject(new Error('No DICOM loader configured')),
                    cancelFn: () => {}
                };
            });
        }
    } catch (regError) {
        console.error('Error during image loader registration:', regError);
    }

    // Add tools
    console.log('Adding Cornerstone tools...');
    try {
        cornerstoneTools.addTool(PanTool);
        cornerstoneTools.addTool(WindowLevelTool);
        cornerstoneTools.addTool(ZoomTool);

        // Define tool group
        // If the toolGroup already exists, get a reference to it instead of creating a new one
        let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (!toolGroup) {
            console.log(`Creating new tool group with ID: ${toolGroupId}`);
            toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
            if (!toolGroup) throw new Error('Failed to create tool group');

            // Only add tools if we're creating a new group
            toolGroup.addTool(PanTool.toolName);
            toolGroup.addTool(WindowLevelTool.toolName);
            toolGroup.addTool(ZoomTool.toolName);

            // Set tool bindings
            toolGroup.setToolActive(WindowLevelTool.toolName, { mouseButtonMask: 1 }); // Left click
            toolGroup.setToolActive(PanTool.toolName, { mouseButtonMask: 4 });         // Middle click
            toolGroup.setToolActive(ZoomTool.toolName, { mouseButtonMask: 2 });        // Right click
        } else {
            console.log(`Tool group ${toolGroupId} already exists, using existing group`);
        }

        console.log('Cornerstone tools initialized and configured.');
    } catch (toolError) {
        console.error('Error setting up Cornerstone tools:', toolError);
    }

    console.log('Cornerstone base initialization complete.');
}

// Helper to safely disable a viewport before trying to recreate it
async function safelyDisableViewport(renderingEngine, viewportId) {
    if (!renderingEngine) return;
    
    try {
        // Check if the viewport exists first
        const viewport = renderingEngine.getViewport(viewportId);
        if (viewport) {
            console.log(`Disabling existing viewport: ${viewportId}`);
            renderingEngine.disableElement(viewportId);
        } else {
            console.log(`Viewport ${viewportId} not found, no need to disable`);
        }
    } catch (error) {
        // Ignore errors about non-existent viewports
        if (error.message && error.message.includes('does not exist')) {
            console.log(`Viewport ${viewportId} does not exist, no need to disable`);
        } else {
            console.warn(`Error while trying to disable viewport ${viewportId}:`, error);
        }
    }
}

// Function to safely create and initialize a viewport
async function createViewport(element, viewportId) {
    try {
        // Make sure rendering engine exists
        const renderingEngine = await getRenderingEngine();
        
        // First try to safely disable any existing viewport with this ID
        await safelyDisableViewport(renderingEngine, viewportId);
        
        // Set up the viewport configuration
        const viewportInput = {
            viewportId: viewportId,
            element: element,
            type: csEnums.ViewportType.STACK,
        };
        
        // Create the viewport
        console.log(`Enabling viewport ${viewportId}`);
        renderingEngine.enableElement(viewportInput);
        
        // Get the tool group
        const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (!toolGroup) {
            throw new Error(`Tool group ${toolGroupId} not found. Has it been created?`);
        }
        
        // Add viewport to tool group
        console.log(`Adding viewport ${viewportId} to tool group ${toolGroupId}`);
        toolGroup.addViewport(viewportId, renderingEngineId);
        
        // Return the viewport object
        return renderingEngine.getViewport(viewportId);
    } catch (error) {
        console.error(`Error creating viewport ${viewportId}:`, error);
        throw error; // Re-throw to allow calling code to handle specific errors
    }
}
// 3. Improved fetchStudyInstances with better error handling
async function fetchStudyInstances(studyUID) {
    console.log(`Fetching instances for study ${studyUID}`);
    try {
        const response = await fetch(`${API_BASE_URL}/studies/${studyUID}/instances`);
        
        // Handle HTTP errors with detailed logging
        if (!response.ok) { 
            let errorMsg = `HTTP error! status: ${response.status}`; 
            let errorData = null;
            
            try { 
                errorData = await response.json(); 
                errorMsg = errorData.error || errorData.message || errorMsg; 
            } catch(e) {
                console.warn('Could not parse error response as JSON', e);
            }
            
            // Special handling for 412 status (study not in hot tier)
            if (response.status === 412) {
                console.warn(`Study ${studyUID} is not in 'hot' tier, cannot fetch instances`);
                return []; // Return empty array for not-hot studies
            }
            
            console.error(`Failed to fetch instances for ${studyUID}:`, errorMsg, errorData);
            throw new Error(errorMsg); 
        }
        
        // Parse response
        const instances = await response.json();
        
        // Validate response format
        if (!Array.isArray(instances)) {
            console.error(`Invalid response format for study ${studyUID} instances:`, instances);
            throw new Error('Invalid response: expected an array of instances');
        }
        
        console.log(`Successfully fetched ${instances.length} instances for study ${studyUID}`);
        return instances;
    } catch (error) { 
        console.error(`Error in fetchStudyInstances for ${studyUID}:`, error); 
        return []; // Return empty array on error
    }
}
//
// 2. Improved moveStudy function with better error and UI feedback
async function moveStudy(studyUID, targetTier, edgeId) {
    console.log(`Requesting move for ${studyUID} to ${targetTier}${edgeId ? ' at ' + edgeId : ''}`);
    
    // Get the study element to update UI
    const studyElement = document.getElementById(`study-${studyUID}`);
    let originalButtonText = 'Move Study';
    let originalPreviewContent = '';
    
    // Update UI to show pending status
    if (studyElement) {
        const actionButton = studyElement.querySelector('.action-button');
        const previewElement = studyElement.querySelector('.preview-area');
        
        if (actionButton) {
            originalButtonText = actionButton.textContent;
            actionButton.textContent = `Moving to ${targetTier}...`;
            actionButton.disabled = true;
        }
        
        if (previewElement) {
            originalPreviewContent = previewElement.innerHTML;
            previewElement.innerHTML = `
                <div style="text-align: center;">
                    <p>Processing move request...</p>
                    <div class="loading-spinner" style="
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #3498db;
                        border-radius: 50%;
                        width: 24px;
                        height: 24px;
                        animation: spin 1s linear infinite;
                        margin: 10px auto;
                    "></div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                </div>
            `;
        }
    }
    
    try {
        // Prepare request body
        const requestBody = {
            targetTier: targetTier,
            targetLocation: edgeId || ''
        };
        
        console.log(`Move request payload:`, requestBody);
        
        // Make API call
        const response = await fetch(`${API_BASE_URL}/studies/${studyUID}/move`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(requestBody) 
        });
        
        // Handle HTTP errors with detailed logging
        if (!response.ok) { 
            let errorMsg = `HTTP error! status: ${response.status}`; 
            let errorData = null;
            
            try { 
                errorData = await response.json(); 
                errorMsg = errorData.error || errorData.message || errorMsg; 
            } catch (e) {
                console.warn('Could not parse error response as JSON', e);
            } 
            
            console.error(`Move request failed:`, errorMsg, errorData);
            throw new Error(errorMsg); 
        }
        
        // Parse response
        const result = await response.json();
        console.log('Move request successful:', result);
        
        // Refresh status and update UI after successful move
        if (studyElement) {
            const status = result.currentStatus || { tier: targetTier };
            console.log(`Updating UI with new status:`, status);
            
            // Store current study data
            const currentStudy = {
                ID: studyUID,
                LocationStatus: status,
                // Preserve other properties if they exist in element data
                PatientMainTags: studyElement._study?.PatientMainTags,
                MainTags: studyElement._study?.MainTags,
                SampleInstanceID: studyElement._study?.SampleInstanceID
            };
            
            // Store updated study data in element
            studyElement._study = currentStudy;
            
            // Update display with new status
            updateStudyDisplay(currentStudy, studyElement);
            
            // Flash status to indicate successful update
            const statusElement = studyElement.querySelector('.status-text');
            if (statusElement) {
                statusElement.classList.add('status-updated');
                setTimeout(() => {
                    statusElement.classList.remove('status-updated');
                }, 3000);
            }
        }
        
        return result;
    } catch (error) { 
        console.error(`Error moving study ${studyUID}:`, error); 
        
        // Restore UI on error
        if (studyElement) {
            const actionButton = studyElement.querySelector('.action-button');
            const previewElement = studyElement.querySelector('.preview-area');
            
            if (actionButton) {
                actionButton.textContent = originalButtonText;
                actionButton.disabled = false;
            }
            
            if (previewElement) {
                previewElement.innerHTML = `
                    <div style="color: #ff6b6b; text-align: center;">
                        <p>Move failed</p>
                        <p style="font-size: 0.8em;">${error.message || 'Unknown error'}</p>
                        <p style="margin-top: 10px;">
                            <button id="retry-move-${studyUID}" style="padding: 5px 10px; cursor: pointer;">
                                Retry
                            </button>
                        </p>
                    </div>
                `;
                
                // Add retry functionality
                setTimeout(() => {
                    const retryButton = document.getElementById(`retry-move-${studyUID}`);
                    if (retryButton) {
                        retryButton.onclick = () => moveStudy(studyUID, targetTier, edgeId);
                    }
                }, 0);
                
                // After 5 seconds, refresh status to ensure UI is up-to-date
                setTimeout(() => {
                    fetchLocation(studyUID).then(status => {
                        if (status) {
                            // Refresh study data
                            const refreshedStudy = {
                                ID: studyUID,
                                LocationStatus: status,
                                PatientMainTags: studyElement._study?.PatientMainTags,
                                MainTags: studyElement._study?.MainTags,
                                SampleInstanceID: studyElement._study?.SampleInstanceID
                            };
                            studyElement._study = refreshedStudy;
                            updateStudyDisplay(refreshedStudy, studyElement);
                        }
                    }).catch(e => {
                        console.error(`Failed to refresh status after move error:`, e);
                    });
                }, 5000);
            }
        }
        
        // Show alert for error
        alert(`Failed to move study: ${error.message}`);
        return null; 
    }
}

// Helper to get or create rendering engine
async function getRenderingEngine() {
    let renderingEngine = cornerstone.getRenderingEngine(renderingEngineId);
    if (!renderingEngine) {
        renderingEngine = new RenderingEngine(renderingEngineId);
    }
    return renderingEngine;
}

// Function to update a single study element based on status
async function updateStudyDisplay(study, studyElement, toolGroup) {
    // Get the elements within this specific study card
    const statusElement = studyElement.querySelector('.status-text');
    const actionButton = studyElement.querySelector('.action-button');
    const previewElement = studyElement.querySelector('.preview-area'); // The div for cornerstone

    // Make sure cornerstone rendering engine is available
    const renderingEngine = await getRenderingEngine(); // Use await here
    const viewportId = `viewport-${study.ID}`; // Use Orthanc Study ID for uniqueness

    // Default state
    statusElement.textContent = `Tier: ${study.LocationStatus.tier || 'N/A'}, Location: ${study.LocationStatus.locationType || 'N/A'}${study.LocationStatus.edgeId ? ' ('+study.LocationStatus.edgeId+')' : ''}`;
    actionButton.textContent = 'Move Study'; // Or determine based on status
    actionButton.disabled = false;
    previewElement.textContent = ''; // Clear previous content
    previewElement.innerHTML = ''; // Clear any old img tags too
    
    try {
        // Attempt to disable element first in case it was previously enabled
        renderingEngine.disableElement(viewportId);
    } catch (e) { 
        /* Ignore errors if element wasn't enabled */ 
    }

    if (study.LocationStatus.tier === 'hot') {
        actionButton.textContent = 'Move to Cold';
        actionButton.onclick = () => moveStudy(study.ID, 'cold', ''); // Use Orthanc ID

        // --- Load DICOM using Cornerstone ---
        try {
            previewElement.textContent = 'Loading DICOM...'; // Placeholder text

            // Check if we have a sample instance ID
            if (!study.SampleInstanceID) {
                throw new Error('Sample Instance ID not available for study ' + study.ID);
            }

            // Construct the image ID using wadouri scheme
            const imageId = `wadouri:${window.location.origin}${API_BASE_URL}/studies/${study.ID}/instances/${study.SampleInstanceID}/file`;
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

            // Add the viewport to the tool group if toolGroup is available
            if (toolGroup) {
                toolGroup.addViewport(viewportId, renderingEngineId);
            }

            // Get the viewport object
            const viewport = renderingEngine.getViewport(viewportId);

            // Load the DICOM image via its ID
            await viewport.setStack([imageId], 0); // Set the stack with our single imageId

            // Render the loaded image
            viewport.render();

            // Activate tools for this viewport if toolGroup is available
            if (toolGroup) {
                toolGroup.setToolActive(WindowLevelTool.toolName, { mouseButtonMask: 1 }); // Left click
                toolGroup.setToolActive(PanTool.toolName, { mouseButtonMask: 4 });       // Middle click
                toolGroup.setToolActive(ZoomTool.toolName, { mouseButtonMask: 2 });      // Right click
            }

            console.log(`Cornerstone DICOM loaded for ${viewportId}`);

        } catch (error) {
            console.error(`Error loading/displaying DICOM for study ${study.ID}:`, error);
            previewElement.textContent = `Error loading image: ${error.message}`;
            // Attempt to disable the element if loading failed
            try { 
                renderingEngine.disableElement(viewportId); 
            } catch(e) { 
                /* ignore */ 
            }
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

    // Store the toolGroup for later use
    let toolGroup;
    
    try {
        // Initialize Cornerstone Engines and Tools FIRST
        toolGroup = await initializeCornerstone();
        
        // Now fetch the actual study data from the backend
        studiesListElement.innerHTML = '<p>Loading studies from API...</p>';
        fetchStudies(toolGroup); // Pass toolGroup to fetchStudies
    } catch (error) {
        console.error('Failed to initialize application:', error);
        studiesListElement.innerHTML = `<p>Error initializing application: ${error.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);

// Function to fetch studies and their first instance ID
async function fetchStudies(toolGroup) {
    console.log('Fetching studies from backend...');
    let workspaceStudies = []; // Define locally or globally if needed elsewhere
    try {
        // Fetch studies from /studies endpoint
        const studiesResponse = await fetch(`${API_BASE_URL}/studies`);
        if (!studiesResponse.ok) throw new Error(`Studies fetch failed: ${studiesResponse.status}`);
        const studiesData = await studiesResponse.json();
        if (!Array.isArray(studiesData)) throw new Error('Invalid study data received');

        // Enrich studies with SampleInstanceID using Promise.all
        const enrichedStudiesPromises = studiesData.map(async (study) => {
            if (!study.ID) { return study; }
            try {
                const instancesResponse = await fetch(`${API_BASE_URL}/studies/${study.ID}/instances`);
                if (instancesResponse.ok) {
                    const instancesData = await instancesResponse.json();
                    if (Array.isArray(instancesData) && instancesData.length > 0 && instancesData[0].ID) {
                        study.SampleInstanceID = instancesData[0].ID; // Add first instance ID
                    } else { 
                        study.SampleInstanceID = null; 
                    }
                } else { 
                    study.SampleInstanceID = null; 
                }
            } catch (instanceError) { 
                study.SampleInstanceID = null; 
            }
            return study;
        });
        
        workspaceStudies = await Promise.all(enrichedStudiesPromises);

        // Render the UI with the toolGroup
        renderUI(workspaceStudies, toolGroup); 

    } catch (error) {
        console.error('Failed to fetch or process studies:', error);
        if (studiesListElement) {
            studiesListElement.textContent = `Error loading studies: ${error.message}`;
        }
    }
}

// Function to render the list of study items
function renderUI(studiesToRender, toolGroup) {
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
            updateStudyDisplay(study, studyElement, toolGroup); // Pass toolGroup to updateStudyDisplay
        }).catch(error => {
            console.error(`Failed to get initial location for study ${study.ID}:`, error);
            study.LocationStatus = { tier: 'unknown', locationType: 'error' };
            const studyElement = renderStudyItem(study); // Still render item, show error status
            studiesListElement.appendChild(studyElement);
            updateStudyDisplay(study, studyElement, toolGroup); // Pass toolGroup to updateStudyDisplay
        });
    });
}

function renderStudyItem(study) { // Receives enriched study object
    const item = document.createElement('div');
    item.className = 'study-item';
    item.id = `study-${study.ID}`; // Use Orthanc Study ID

    const title = document.createElement('h3');
    title.textContent = `Patient: ${study.PatientMainTags?.PatientName || 'N/A'} (${study.PatientMainTags?.PatientID || 'N/A'})`;
    item.appendChild(title);

    const studyInfo = document.createElement('p');
    studyInfo.textContent = `Study: ${study.MainTags?.StudyDescription || 'N/A'} (${study.MainTags?.StudyDate || 'N/A'})`;
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
// 1. Improved fetchLocation function
async function fetchLocation(studyUID) {
    console.log(`Fetching location for study ${studyUID}`);
    try {
        const response = await fetch(`${API_BASE_URL}/studies/${studyUID}/location`);
        
        // Handle HTTP errors with detailed logging
        if (!response.ok) { 
            let errorMsg = `HTTP error! status: ${response.status}`; 
            let errorData = null;
            
            try { 
                errorData = await response.json(); 
                errorMsg = errorData.error || errorData.message || errorMsg; 
            } catch(e) {
                console.warn('Could not parse error response as JSON', e);
            }
            
            console.error(`Failed to fetch location for ${studyUID}:`, errorMsg, errorData);
            throw new Error(errorMsg); 
        }
        
        const locationData = await response.json();
        console.log(`Successfully fetched location for study ${studyUID}:`, locationData);
        return locationData;
    } catch (error) { 
        console.error(`Error in fetchLocation for ${studyUID}:`, error); 
        return { tier: 'error', locationType: `Error: ${error.message}` }; 
    }
}
// 4. Function to refresh all study data
async function refreshAllStudies() {
    const studiesContainer = document.getElementById('studies-list');
    if (!studiesContainer) return;
    
    // Show loading indicator
    studiesContainer.innerHTML = '<p>Refreshing studies...</p>';
    
    try {
        await fetchStudies();
        console.log('All studies refreshed successfully');
    } catch (error) {
        console.error('Error refreshing studies:', error);
        studiesContainer.innerHTML = `
            <p style="color: #ff6b6b;">Error refreshing studies: ${error.message}</p>
            <button id="retry-refresh" style="margin-top: 10px; padding: 5px 10px;">Retry</button>
        `;
        
        // Add retry functionality
        const retryButton = document.getElementById('retry-refresh');
        if (retryButton) {
            retryButton.onclick = refreshAllStudies;
        }
    }
}

// 5. Add a refresh button to the UI
function addRefreshButton() {
    const header = document.querySelector('h1');
    if (!header) return;
    
    const refreshButton = document.createElement('button');
    refreshButton.textContent = 'Refresh All';
    refreshButton.id = 'refresh-all-button';
    refreshButton.style.marginLeft = '15px';
    refreshButton.style.padding = '5px 15px';
    refreshButton.style.fontSize = '14px';
    refreshButton.style.cursor = 'pointer';
    refreshButton.onclick = refreshAllStudies;
    
    header.appendChild(refreshButton);
}

// Add refresh button when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    addRefreshButton();
    // Initialize other UI elements...
});