// File: backend/cmd/server/main.go
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	// PGX Pool Import
	"github.com/jackc/pgx/v5/pgxpool" // <<< ADDED IMPORT

	// OTel Imports (ensure log related ones are uncommented)
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/log/global"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.25.0"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"go.opentelemetry.io/contrib/bridges/otelslog"

	// Gin Instrumentation
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	// HTTP Client Instrumentation
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	// Other imports
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/ewag/gen-erics/backend/internal/api"
	"github.com/ewag/gen-erics/backend/internal/config"
	"github.com/ewag/gen-erics/backend/internal/orthanc"
	"github.com/ewag/gen-erics/backend/internal/storage" // <<< Import storage package
)

// --- initOtelProvider function remains the same (with logging enabled) ---
// ... (paste the full initOtelProvider function here) ...
func initOtelProvider(ctx context.Context, serviceName, serviceVersion, otelEndpoint string) (shutdown func(context.Context) error, err error) {
    res, err := resource.New(ctx, resource.WithAttributes(semconv.ServiceName(serviceName), semconv.ServiceVersion(serviceVersion)))
	if err != nil { return nil, fmt.Errorf("failed to create OTel resource: %w", err) }
	conn, err := grpc.NewClient(otelEndpoint, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil { return nil, fmt.Errorf("failed to create gRPC connection to OTLP endpoint %s: %w", otelEndpoint, err) }
	traceExporter, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
	if err != nil { return nil, fmt.Errorf("failed to create OTLP trace exporter: %w", err) }
	bsp := trace.NewBatchSpanProcessor(traceExporter)
	tracerProvider := trace.NewTracerProvider(trace.WithResource(res), trace.WithSpanProcessor(bsp))
	metricExporter, err := otlpmetricgrpc.New(ctx, otlpmetricgrpc.WithGRPCConn(conn))
	if err != nil { return nil, fmt.Errorf("failed to create OTLP metric exporter: %w", err) }
	meterProvider := metric.NewMeterProvider(metric.WithResource(res), metric.WithReader(metric.NewPeriodicReader(metricExporter)))
	logExporter, err := otlploggrpc.New(ctx, otlploggrpc.WithGRPCConn(conn))
	if err != nil { return nil, fmt.Errorf("failed to create OTLP log exporter: %w", err) }
	loggerProvider := sdklog.NewLoggerProvider(sdklog.WithResource(res), sdklog.WithProcessor(sdklog.NewBatchProcessor(logExporter)))
	otel.SetTracerProvider(tracerProvider)
	otel.SetMeterProvider(meterProvider)
	global.SetLoggerProvider(loggerProvider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
	shutdown = func(ctx context.Context) error {
		var shutdownErr error
		if err := tracerProvider.Shutdown(ctx); err != nil { shutdownErr = errors.Join(shutdownErr, fmt.Errorf("tracer provider shutdown failed: %w", err)) }
		if err := meterProvider.Shutdown(ctx); err != nil { shutdownErr = errors.Join(shutdownErr, fmt.Errorf("meter provider shutdown failed: %w", err)) }
		if err := loggerProvider.Shutdown(ctx); err != nil { shutdownErr = errors.Join(shutdownErr, fmt.Errorf("logger provider shutdown failed: %w", err)) }
		if err := conn.Close(); err != nil { shutdownErr = errors.Join(shutdownErr, fmt.Errorf("grpc connection close failed: %w", err)) }
		return shutdownErr
	}
	return shutdown, nil
}


// --- Main Function ---
func main() {
	// Set basic slog handler temporarily for startup/config loading issues
	baseHandlerOptions := &slog.HandlerOptions{Level: slog.LevelDebug}
	baseSlogHandler := slog.NewTextHandler(os.Stderr, baseHandlerOptions)
	slog.SetDefault(slog.New(baseSlogHandler))

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// Load configuration (includes DB details)
	cfg, err := config.Load()
	if err != nil {
		slog.Error("Failed to load configuration", "error", err)
		os.Exit(1)
	}

	// --- Initialize Database Connection Pool (NEW BLOCK) ---
	// Construct DSN (Data Source Name) using config values
	// Format: postgres://username:password@host:port/database_name
	dbConnString := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName)

	slog.Info("Attempting to connect to PostgreSQL", "host", cfg.DBHost, "db", cfg.DBName)
	dbPool, err := pgxpool.New(ctx, dbConnString) // Use app context
	if err != nil {
		slog.Error("Unable to create connection pool", "error", err)
		os.Exit(1) // Exit if DB connection fails on startup
	}
	// Ping the database to verify immediate connectivity
	if err := dbPool.Ping(ctx); err != nil {
		slog.Error("Unable to ping database on startup", "error", err)
		dbPool.Close() // Close pool even if ping fails
		os.Exit(1)
	}
	slog.Info("Successfully connected to PostgreSQL database")
	// dbPool variable is now available
	// --- End Database Init ---

	// --- Initialize OTel ---
	otelEndpoint := cfg.OtelEndpoint // Uses port 4317 from config default
	serviceName := cfg.OtelServiceName
	serviceVersion := cfg.OtelServiceVersion

	otelShutdown, err := initOtelProvider(ctx, serviceName, serviceVersion, otelEndpoint)
	if err != nil {
		slog.Error("Failed to initialize OTel provider", "error", err)
		dbPool.Close() // Close DB pool if OTel fails
		os.Exit(1)
	}
	// --- End OTel Init ---

	// --- Configure Slog to use OTel Bridge (Corrected) ---
	loggerProvider := global.GetLoggerProvider()        // Get the globally set provider

	// Create the slog handler using the OTel bridge
	otelHandler := otelslog.NewHandler(
		serviceName,
		otelslog.WithLoggerProvider(loggerProvider), // Pass necessary options
		// otelslog.WithLeveler(slog.LevelDebug),
	)

	// Set this OTel handler as the default for slog
	slog.SetDefault(slog.New(otelHandler))
	slog.Info("OTel logging initialized and set as slog default (using OTLP/gRPC)")
	// --- End Slog Setup ---

	// Handle graceful shutdown for OTel AND DB Pool
	defer func() {
		// Use a separate context for shutdown in case the main one is canceled early
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second) // Slightly longer timeout
		defer cancel()

		slog.Info("Shutting down OTel providers...")
		if err := otelShutdown(shutdownCtx); err != nil {
			slog.Error("OTel shutdown failed", "error", err)
		} else {
			slog.Info("OTel providers shut down successfully.")
		}

		slog.Info("Closing database connection pool...")
		dbPool.Close() // <-- ADDED: Close the pool
		slog.Info("Database connection pool closed.")
	}()

	// --- Initialize Dependencies ---
	// TODO: Move struct definitions (LocationStatus) to a shared place like internal/models
	// TODO: Create storage layer (internal/storage) that takes dbPool
	// --- Create Storage instance ---
    store := storage.NewStore(dbPool) // <<< Create store

    // --- Pass storage instance to API Handler ---
	
    

	orthancBaseClient := &http.Client{Timeout: cfg.HttpClientTimeout}
	instrumentedTransport := otelhttp.NewTransport(orthancBaseClient.Transport)
	instrumentedClient := &http.Client{Transport: instrumentedTransport, Timeout: cfg.HttpClientTimeout}
	orthancClient := orthanc.NewClientWithHttpClient(cfg.OrthancURL, instrumentedClient)
	handler := api.NewAPIHandler(orthancClient, store) // <<< Update constructor call
	// --- Setup Gin Router ---
	router := gin.Default()
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = []string{"*"}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
	router.Use(cors.New(corsConfig))
	router.Use(otelgin.Middleware(serviceName))
	api.RegisterRoutes(router, handler)


	// --- Start Server ---
	slog.Info("Starting HTTP server", "address", cfg.ListenAddress)
	srv := &http.Server{
		Addr:    cfg.ListenAddress,
		Handler: router,
	}
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("Server listen failed", "error", err)
			// Attempt a clean shutdown of DB/OTel before exiting
			// Cannot call the main defer directly, maybe trigger cancellation?
			// For now, just exit. Consider more robust shutdown on listen failure later.
			os.Exit(1)
		}
	}()

	// --- Graceful HTTP Server Shutdown ---
	<-ctx.Done() // Wait for interrupt
	stop()
	slog.Info("Shutting down HTTP server gracefully...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("Server forced to shutdown", "error", err)
		// OTel/DB shutdown defer will still run
		os.Exit(1)
	}
	slog.Info("HTTP Server stopped.")
	// OTel/DB shutdown runs via defer after this point
}
