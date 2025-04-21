// File: frontend/app.js

// --- Configuration ---
// Use Kubernetes Service DNS name and port for backend API when running inside K8s
// IMPORTANT: Verify 'derp-gen-erics-backend' is the correct service name
//            and '80' is the correct service port using 'kubectl get svc --namespace default'
const API_BASE_URL = 'http://derp-gen-erics-backend.default.svc.cluster.local:80/api/v1';
// NOTE: For production, make this configurable (e.g., via injected config)

// Mock data - *** REPLACE THESE WITH ACTUAL UIDs FROM YOUR UPLOADED TEST DATA ***
const studies = [
  { studyUID: "STUDY_UID_1_HOT", instanceUID: "INSTANCE_UID_FOR_STUDY_1_HOT" },
  { studyUID: "STUDY_UID_2_COLD", instanceUID: "INSTANCE_UID_FOR_STUDY_2_COLD" },
  { studyUID: "STUDY_UID_3_ARCHIVE", instanceUID: "INSTANCE_UID_FOR_STUDY_3_ARCHIVE" },
  { studyUID: "STUDY_UID_4_UNKNOWN", instanceUID: "INSTANCE_UID_FOR_STUDY_4" }, // Example without initial state
];

const studiesListElement = document.getElementById('studies-list');

// --- API Fetch Functions ---

async function fetchLocation(studyUID) {
    try {
        const response = await fetch(`<span class="math-inline">\{API\_BASE\_URL\}/studies/</span>{studyUID}/location`);
        if (!response.ok) {
             // Try to parse error json from backend
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
        return { tier: 'error', locationType: `Error: ${error.message}` }; // Return error status
    }
}

async function moveStudy(studyUID, targetTier) {
    console.log(`Requesting move for ${studyUID} to ${targetTier}`);
    try {
        const response = await fetch(`<span class="math-inline">\{API\_BASE\_URL\}/studies/</span>{studyUID}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetTier: targetTier })
        });
        if (!response.ok) {
            let errorMsg = `HTTP error! status: ${response.status}`;
            try {
                const errData = await response.json();
                errorMsg = errData.error || errData.message || errorMsg;
            } catch (e) {}
            throw new Error(errorMsg);
        }
        return await response.json(); // Contains { message, currentStatus }
    } catch (error) {
        console.error(`Error moving study ${studyUID}:`, error);
        alert(`Failed to move study: ${error.message}`);
        return null;
    }
}

// --- UI Rendering Functions ---

async function updateStudyDisplay(studyElement, study) {
    const statusSpan = studyElement.querySelector('.status');
    const previewDiv = studyElement.querySelector('.preview');
    statusSpan.textContent = 'loading...';
    statusSpan.className = 'status unknown'; // Reset class
    previewDiv.innerHTML = ''; // Clear previous preview

    const statusData = await fetchLocation(study.studyUID);

    if (statusData) {
        let statusText = `${statusData.tier || 'unknown'}`;
        statusSpan.className = `status ${statusData.tier || 'unknown'}`; // Set class for styling
        if (statusData.locationType === 'edge' && statusData.edgeId) {
            statusText += ` @ ${statusData.edgeId}`;
        } else if (statusData.locationType && statusData.locationType !== 'unknown') {
            statusText += ` @ ${statusData.locationType}`;
        }
         if (statusData.tier === 'error') {
            statusText = statusData.locationType; // Display error message
        }
        statusSpan.textContent = statusText;

        // Show preview if hot and instance UID is valid
        if (statusData.tier === 'hot') {
            if (study.instanceUID && !study.instanceUID.startsWith("INSTANCE_UID_FOR_")) {
                const img = document.createElement('img');
                // Construct the absolute URL for the image source
                const previewUrl = `<span class="math-inline">\{API\_BASE\_URL\}/studies/</span>{study.studyUID}/instances/${study.instanceUID}/preview`;
                img.src = previewUrl;
                img.alt = `Preview for instance ${study.instanceUID}`;
                img.onerror = () => { previewDiv.textContent = 'Preview load failed.'; };
                previewDiv.appendChild(img);
            } else {
                previewDiv.textContent = 'Preview N/A (Instance UID not set/valid).';
            }
        } else if (statusData.tier !== 'error'){
             previewDiv.textContent = `Preview N/A (Tier: ${statusData.tier || 'unknown'}).`;
        } else {
            previewDiv.textContent = 'Preview N/A (Error loading status).';
        }
    } else {
        // This case should ideally be handled by the error status from fetchLocation
        statusSpan.textContent = 'Error';
        statusSpan.className = 'status unknown';
    }
}

function renderStudyItem(study) {
    const item = document.createElement('div');
    item.className = 'study-item';
    item.id = `study-${study.studyUID}`;

    const title = document.createElement('h3');
    title.textContent = `Study UID: ${study.studyUID}`;
    item.appendChild(title);

    const statusPara = document.createElement('p');
    // Add placeholder span for status, updateStudyDisplay will fill it
    statusPara.innerHTML = 'Status: <span class="status unknown">loading...</span>';
    item.appendChild(statusPara);

    const previewDiv = document.createElement('div');
    previewDiv.className = 'preview';
    item.appendChild(previewDiv);

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'controls';
    item.appendChild(controlsDiv);


    // --- Move Buttons ---
    const tiers = ['hot', 'warm', 'cold', 'archive'];
    tiers.forEach(tier => {
        const button = document.createElement('button');
        button.textContent = `Move to ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
        button.onclick = async () => {
            // Disable all buttons for this study during request
            controlsDiv.querySelectorAll('button').forEach(btn => btn.disabled = true);
            const result = await moveStudy(study.studyUID, tier);
            if (result) {
                // Re-fetch location data to ensure UI consistency
                await updateStudyDisplay(item, study);
            }
             // Re-enable all buttons
            controlsDiv.querySelectorAll('button').forEach(btn => btn.disabled = false);
        };
        controlsDiv.appendChild(button);
    });

    return item;
}

// --- Initial Load ---
function initializeApp() {
    if (!studiesListElement) {
        console.error("Could not find #studies-list element!");
        return;
    }
    studiesListElement.innerHTML = ''; // Clear "Loading..." message

    if (!studies || studies.length === 0) {
         studiesListElement.innerHTML = '<p>No studies defined in app.js</p>';
         return;
    }

    studies.forEach(study => {
        if (!study || !study.studyUID) return; // Skip invalid entries
        const studyElement = renderStudyItem(study);
        studiesListElement.appendChild(studyElement);
        // Fetch initial status for each study
        updateStudyDisplay(studyElement, study);
    });
}

document.addEventListener('DOMContentLoaded', initializeApp);