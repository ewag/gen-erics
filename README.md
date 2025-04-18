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


## update go modules

Navigate to the backend dir. Run:

```bash
go mod tidy
```

## GitHub Container Registry

```bash
# get ready to push images
export CR_PAT=<github token classic>
echo $CR_PAT | docker login ghcr.io -u <user>> --password-stdin

# create an image tag

docker build -t ghcr.io/ewag/gen-erics:k3d-test-0.1
docker push ghcr.io/ewag/gen-erics:k3d-test-0.1
```

## K8s pull secret

```bash
# Replace placeholders below!
export K8S_NAMESPACE="pacs-dev" # Or your target namespace
export GITHUB_USERNAME="YOUR_GITHUB_USERNAME" # Your GitHub username
export GITHUB_PAT="YOUR_GENERATED_PAT" # The PAT you just created
export SECRET_NAME="ghcr-pull-secret" # Name for your k8s secret

kubectl create secret docker-registry $SECRET_NAME \
  --namespace $K8S_NAMESPACE \
  --docker-server=ghcr.io \
  --docker-username=$GITHUB_USERNAME \
  --docker-password=$GITHUB_PAT \
  --docker-email=your.email@example.com # Email is usually required but can be anything valid
```

## Add some demo dicom images for testing

I grabbed these [7 test cases](https://www.visus.com/en/downloads/jivex-dicom-viewer.html) and put them in the test_dicom folder.

## testing the locations with the mocks

```bash
curl http://localhost:8080/api/v1/studies/STUDY_UID_1_HOT/location
curl http://localhost:8080/api/v1/studies/STUDY_UID_2_COLD/location
curl -X POST -H "Content-Type: application/json" -d '{"targetTier": "warm"}' http://localhost:8080/api/v1/studies/STUDY_UID_1_HOT/move
curl http://localhost:8080/api/v1/studies/STUDY_UID_1_HOT/location

```