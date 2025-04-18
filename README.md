# gen-erics

- g go
- e engine
- n network for
- e edge
- r retrieval
- i interface and
- c cloud
- s storage

## project layout

gen-erics/
├── .github/
│   └── workflows/
│       ├── build-deploy-dev.yaml    # GitHub Action for dev environment
│       └── build-deploy-prod.yaml   # GitHub Action for prod environments (future)
│
├── backend/                     # Go Gin application (API, business logic)
│   ├── cmd/server/              # Main application package
│   │   └── main.go
│   ├── internal/                # Private application code
│   │   ├── api/                 # Gin handlers and routing
│   │   │   ├── handlers.go
│   │   │   └── routes.go
│   │   ├── config/              # Configuration loading
│   │   │   └── config.go
│   │   └── orthanc/             # Client for Orthanc API
│   │       └── client.go
│   │   # Add other internal packages (e.g., fhir, auth) later
│   ├── go.mod                   # Go module definition
│   ├── go.sum                   # Dependency checksums
│   └── Dockerfile               # Multi-stage Dockerfile for Go backend
│
├── frontend/                    # JavaScript DICOM Viewer (e.g., based on Cyclops) (unsure of this)
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── Dockerfile               # For serving the frontend app
│
├── infrastructure/
│   ├── helm/
│   │   ├── pacs-app/            # Helm chart for the entire application stack
│   │   │   ├── Chart.yaml
│   │   │   ├── values.yaml
│   │   │   ├── templates/
│   │   │   │   ├── backend-deployment.yaml
│   │   │   │   ├── backend-service.yaml
│   │   │   │   ├── frontend-deployment.yaml
│   │   │   │   ├── frontend-service.yaml
│   │   │   │   ├── orthanc-statefulset.yaml # Or Deployment
│   │   │   │   ├── orthanc-service.yaml
│   │   │   │   ├── orthanc-configmap.yaml # Orthanc configuration
│   │   │   │   └── ingress.yaml         # (Optional) Kubernetes Ingress
│   │   │   └── ... (other helper templates)
│   │   └── ... (potentially subcharts for orthanc, backend, etc.)
│   │
│   └── orthanc/                 # Orthanc specific configurations, plugins
│       └── orthanc.json         # Base Orthanc configuration file (used for Helm chart)
│
├── docs/                        # Project documentation
│   ├── architecture.md
│   └── setup.md
│
└── README.md                    # Project overview, setup instructions


# update go modules

Navigate to the backend dir. Run:

```bash
go mod tidy
```

# GitHub Container Registry



```bash
# get ready to push images
export CR_PAT=<github token classic>
echo $CR_PAT | docker login ghcr.io -u <user>> --password-stdin

# create an image tag
export IMAGE_NAME="ewag/gen-erics:k3d-test-0.1"
docker build -t $IMAGE_NAME .

```