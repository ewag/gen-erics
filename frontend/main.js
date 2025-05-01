// File: frontend/main.js
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

// Import specific classes and constants
import { 
    RenderingEngine, 
    Enums 
} from '@cornerstonejs/core';

import {
    PanTool,
    WindowLevelTool,
    ZoomTool,
    ToolGroupManager,
} from '@cornerstonejs/tools';

// Import DICOM parser and DICOM Image Loader
import dicomParser from 'dicom-parser';
import * as cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

// --- Configuration ---
const API_BASE_URL = '/api/v1';
const studiesListElement = document.getElementById('studies-list');
const renderingEngineId = 'myRenderingEngine';
const toolGroupId = "STACK_TOOL_GROUP_ID";

// Helper to check if a byteArray is a valid DICOM file
function isValidDicom(byteArray) {
    // Check for DICOM magic number (DICM) at offset 128
    if (byteArray.length <= 132) return false;
    
    // Check for the DICM prefix at offset 128
    return (
        byteArray[128] === 68 && // D
        byteArray[129] === 73 && // I
        byteArray[130] === 67 && // C
        byteArray[131] === 77    // M
    );
}

// Simplified initialization that focuses on just making it work
async function initializeCornerstone() {
    try {
        console.log('Initializing Cornerstone...');
        
        // Initialize Core first
        await cornerstone.init();
        console.log('Cornerstone Core initialized.');
        
        // Initialize Tools second
        await cornerstoneTools.init();
        console.log('Cornerstone Tools initialized.');
        
        console.log('DICOM Image Loader imported.');
        
        // Register the external dependencies required by cornerstoneDICOMImageLoader
        if (cornerstoneDICOMImageLoader.external) {
            cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
            cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;
        }
        
        // Try to set default settings to be more forgiving of malformed DICOM files
        if (cornerstoneDICOMImageLoader.wadouri) {
            // Try to set options for more forgiving parsing
            if (typeof cornerstoneDICOMImageLoader.wadouri.dataSetCacheManager?.setOptions === 'function') {
                cornerstoneDICOMImageLoader.wadouri.dataSetCacheManager.setOptions({
                    strict: false,  // Don't be strict about DICOM conformance
                });
            }
        }
        
        // Register the WADO-URI image loader
        if (cornerstoneDICOMImageLoader.wadouri && 
            typeof cornerstoneDICOMImageLoader.wadouri.loadImage === 'function') {
            cornerstone.imageLoader.registerImageLoader('wadouri', 
                cornerstoneDICOMImageLoader.wadouri.loadImage);
            console.log('WADO-URI loader registered.');
        }
        
        // Add tools
        cornerstoneTools.addTool(PanTool);
        cornerstoneTools.addTool(WindowLevelTool);
        cornerstoneTools.addTool(ZoomTool);
        
        // Create tool group
        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
        if (toolGroup) {
            // Add tools to the group
            toolGroup.addTool(PanTool.toolName);
            toolGroup.addTool(WindowLevelTool.toolName);
            toolGroup.addTool(ZoomTool.toolName);
            
            // Set tool modes
            toolGroup.setToolActive(WindowLevelTool.toolName, { mouseButtonMask: 1 });
            toolGroup.setToolActive(PanTool.toolName, { mouseButtonMask: 4 });
            toolGroup.setToolActive(ZoomTool.toolName, { mouseButtonMask: 2 });
        }
        
        console.log('Cornerstone initialization complete.');
        return true;
    } catch (error) {
        console.error('Error initializing Cornerstone:', error);
        return false;
    }
}

// --- API Fetch Functions ---
async function fetchLocation(studyUID) {
    try {
        const response = await fetch(`${API_BASE_URL}/studies/${studyUID}/location`);
        if (!response.ok) { 
            throw new Error(`HTTP error! status: ${response.status}`); 
        }
        return await response.json();
    } catch (error) { 
        console.error(`Error fetching location for ${studyUID}:`, error); 
        return { tier: 'error', locationType: `Error: ${error.message}` }; 
    }
}

async function moveStudy(studyUID, targetTier, targetLocation = '') {
    console.log(`Requesting move for ${studyUID} to ${targetTier}`);
    try {
        const moveData = { 
            targetTier: targetTier,
            targetLocation: targetLocation
        };
        
        const response = await fetch(`${API_BASE_URL}/studies/${studyUID}/move`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(moveData) 
        });
        
        if (!response.ok) { 
            throw new Error(`HTTP error! status: ${response.status}`); 
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

// Fetch preview image instead of trying to load full DICOM
async function fetchInstancePreview(studyUID, instanceUID) {
    try {
        // Use preview endpoint instead of file endpoint
        const response = await fetch(`${API_BASE_URL}/studies/${studyUID}/instances/${instanceUID}/preview`);
        
        // Special handling for 412 Precondition Failed (study not in hot tier)
        if (response.status === 412) {
            console.log(`Preview not available for instance ${instanceUID} due to tier status`);
            return { error: 'tier', message: 'Preview not available for this tier' };
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Get blob from response
        const imageBlob = await response.blob();
        
        // Create object URL for the image
        return { url: URL.createObjectURL(imageBlob) };
    } catch (error) {
        console.error(`Error fetching preview for instance ${instanceUID}:`, error);
        return { error: 'general', message: error.message };
    }
}

// Global rendering engine reference to avoid recreation
let globalRenderingEngine = null;

// Get or create a rendering engine - simplified to use global reference
async function getRenderingEngine() {
    if (!globalRenderingEngine) {
        try {
            globalRenderingEngine = new RenderingEngine(renderingEngineId);
        } catch (error) {
            console.error('Error creating rendering engine:', error);
            return null;
        }
    }
    return globalRenderingEngine;
}

// Function to update a single study element based on status
async function updateStudyDisplay(study, studyElement) {
    // Get the elements within this specific study card
    const statusElement = studyElement.querySelector('.status-text');
    const actionButton = studyElement.querySelector('.action-button');
    const previewElement = studyElement.querySelector('.preview-area'); // The div for cornerstone

    // Make sure cornerstone rendering engine is available
    const renderingEngine = await getRenderingEngine(); // Use await here
    if (!renderingEngine) {
        previewElement.textContent = 'Error: Could not initialize rendering engine';
        return;
    }
    
    const viewportId = `viewport-${study.ID}`; // Use Orthanc Study ID for uniqueness

    // Default state
    statusElement.textContent = `Tier: ${study.LocationStatus.tier || 'N/A'}, Location: ${study.LocationStatus.locationType || 'N/A'}${study.LocationStatus.edgeId ? ' ('+study.LocationStatus.edgeId+')' : ''}`;
    statusElement.className = `status-text status ${study.LocationStatus.tier || 'unknown'}`;
    
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

        // --- Load DICOM using Cornerstone with fallback ---
        if (!study.SampleInstanceID) {
            previewElement.textContent = 'No instance available for this study';
            return;
        }

        // Show loading state
        previewElement.textContent = 'Loading DICOM...';
        previewElement.style.width = "256px";
        previewElement.style.height = "256px";
        
        try {
            // Try to use a simple image approach first
            const preview = await fetchInstancePreview(study.ID, study.SampleInstanceID);
            if (preview.url) {
                // Display preview image as fallback
                previewElement.innerHTML = '';
                const img = document.createElement('img');
                img.src = preview.url;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '100%';
                previewElement.appendChild(img);
                console.log('Displayed preview image as fallback');
                return; // Exit early, we have a working preview
            }
        } catch (previewError) {
            console.warn('Preview failed, trying Cornerstone:', previewError);
            // Continue to Cornerstone approach
        }

        // Try Cornerstone approach
        try {
            // Construct the image ID using wadouri scheme
            const imageId = `wadouri:${window.location.origin}${API_BASE_URL}/studies/${study.ID}/instances/${study.SampleInstanceID}/file`;
            console.log("Attempting to load imageId:", imageId);

            // Clear the element for cornerstone
            previewElement.innerHTML = '';

            const viewportInput = {
                viewportId: viewportId,
                element: previewElement,
                type: Enums.ViewportType.STACK,
            };

            // Enable the element for cornerstone
            renderingEngine.enableElement(viewportInput);

            // Add the viewport to the tool group
            const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
            if (!toolGroup) {
                throw new Error('Tool group not initialized');
            }
            
            toolGroup.addViewport(viewportId, renderingEngineId);

            // Get the viewport object
            const viewport = renderingEngine.getViewport(viewportId);

            // Load the DICOM image via its ID with a timeout
            const loadPromise = viewport.setStack([imageId], 0);
            
            // Add a timeout to avoid UI freezing if loading takes too long
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Loading timeout')), 5000);
            });
            
            await Promise.race([loadPromise, timeoutPromise]);

            // Render the loaded image
            viewport.render();

            console.log(`Cornerstone DICOM loaded for ${viewportId}`);
        } catch (error) {
            console.error(`Error loading/displaying DICOM for study ${study.ID}:`, error);
            
            // Display error message and try alternate approach
            try { 
                renderingEngine.disableElement(viewportId); 
            } catch(e) { /* ignore */ }
            
            // Create a simple visual representation
            previewElement.innerHTML = '';
            previewElement.textContent = 'DICOM Viewer Error: Using placeholder';
            
            // Add a placeholder image or canvas
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');
            
            // Draw a placeholder image
            if (ctx) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, 256, 256);
                ctx.font = '14px Arial';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText('Error: ' + error.message, 128, 128);
                ctx.fillText('Study: ' + study.ID, 128, 150);
                ctx.fillText('Instance: ' + study.SampleInstanceID, 128, 170);
                previewElement.innerHTML = '';
                previewElement.appendChild(canvas);
            }
        }
        // --- End DICOM Loading ---
    } else if (study.LocationStatus.tier === 'cold') {
        actionButton.textContent = 'Move to Hot';
        actionButton.onclick = () => moveStudy(study.ID, 'hot', 'dev-k3d-node'); // Use Orthanc ID, provide edge ID
        previewElement.textContent = 'Status: Cold (Preview N/A)';
        previewElement.className = 'preview-area cold';
    } else if (study.LocationStatus.tier === 'archive') {
        actionButton.textContent = 'Retrieve'; // Or Restore
        actionButton.onclick = () => moveStudy(study.ID, 'cold', ''); // Move to cold first? Or directly to hot? Define workflow.
        previewElement.textContent = 'Status: Archive (Preview N/A)';
        previewElement.className = 'preview-area archive';
    } else {
        actionButton.textContent = 'Unknown State';
        actionButton.disabled = true;
        previewElement.textContent = 'Status: Unknown';
        previewElement.className = 'preview-area unknown';
    }
}

// Function to fetch studies and instances
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
                    }
                } else { 
                    study.SampleInstanceID = null;
                }
            } catch (instanceError) { 
                study.SampleInstanceID = null;
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

    // --- Patient Information ---
    const patientName = study.PatientMainTags?.PatientName || 'Unknown';
    const patientID = study.PatientMainTags?.PatientID || 'Unknown';
    
    const title = document.createElement('h3');
    title.textContent = `Patient: ${patientName} (${patientID})`;
    item.appendChild(title);

    // --- Study Information ---
    const studyDescription = study.MainTags?.StudyDescription || 'Unknown';
    const studyDate = study.MainTags?.StudyDate || '';
    const studyTime = study.MainTags?.StudyTime || '';
    
    // Format date and time if available
    let dateTimeStr = 'Unknown Date';
    if (studyDate) {
        // Convert YYYYMMDD to YYYY-MM-DD format
        if (studyDate.length === 8) {
            const year = studyDate.substring(0, 4);
            const month = studyDate.substring(4, 6);
            const day = studyDate.substring(6, 8);
            dateTimeStr = `${year}-${month}-${day}`;
            
            // Add time if available (HHMMSS to HH:MM:SS)
            if (studyTime && studyTime.length >= 6) {
                const hour = studyTime.substring(0, 2);
                const minute = studyTime.substring(2, 4);
                const second = studyTime.substring(4, 6);
                dateTimeStr += ` ${hour}:${minute}:${second}`;
            }
        } else {
            dateTimeStr = studyDate;
        }
    }

    const studyInfo = document.createElement('p');
    studyInfo.textContent = `Study: ${studyDescription} (${dateTimeStr})`;
    studyInfo.style.fontSize = '0.9em';
    item.appendChild(studyInfo);

    // Add accession number if available
    if (study.MainTags?.AccessionNumber) {
        const accessionInfo = document.createElement('p');
        accessionInfo.textContent = `Accession: ${study.MainTags.AccessionNumber}`;
        accessionInfo.style.fontSize = '0.85em';
        accessionInfo.style.color = '#666';
        item.appendChild(accessionInfo);
    }

    // Status text
    const statusPara = document.createElement('p');
    statusPara.innerHTML = 'Status: <span class="status-text">loading...</span>';
    item.appendChild(statusPara);

    // Preview container
    const previewDiv = document.createElement('div');
    previewDiv.className = 'preview-area';
    previewDiv.style.width = "256px";
    previewDiv.style.height = "256px";
    previewDiv.style.backgroundColor = "black";
    previewDiv.style.display = "flex";
    previewDiv.style.alignItems = "center";
    previewDiv.style.justifyContent = "center";
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
    
    // Add download button if we have an instance ID
    if (study.SampleInstanceID) {
        const downloadLink = document.createElement('a');
        downloadLink.href = `${API_BASE_URL}/studies/${study.ID}/instances/${study.SampleInstanceID}/file`;
        downloadLink.download = `${study.ID}-${study.SampleInstanceID}.dcm`;
        downloadLink.className = 'download-button';
        downloadLink.style.marginLeft = '10px';
        downloadLink.textContent = 'Download DICOM';
        controlsDiv.appendChild(downloadLink);
    }
    
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