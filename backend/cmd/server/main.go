// File: backend/cmd/server/main.go
package main

import (
	"context"
	"errors"
	"fmt" // Keep fmt for Errorf in initOtelProvider
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	// OTel Imports
	"go.opentelemetry.io/otel"
	// Corrected OTLP Exporter Import Paths (Singular)
	// "go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc" // Keep commented out for workaround
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc" // Corrected: singular metric
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc" // Corrected: singular trace

	// Log related imports - Keep commented out for workaround
	// "go.opentelemetry.io/otel/log/global"
	// otelapilog "go.opentelemetry.io/otel/log"
	// sdklog "go.opentelemetry.io/otel/sdk/log"

	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.25.0"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	// OTel Slog Bridge - Keep commented out for workaround
	// "go.opentelemetry.io/contrib/bridges/otelslog"

	// Gin Instrumentation
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	// HTTP Client Instrumentation
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	// Adjust import paths if needed
	"github.com/ewag/gen-erics/backend/internal/api"
	"github.com/ewag/gen-erics/backend/internal/config"
	"github.com/ewag/gen-erics/backend/internal/orthanc"
)

// --- OTel Initialization Function (Corrected - fmt needed, log parts commented) ---
func initOtelProvider(ctx context.Context, serviceName, serviceVersion, otelEndpoint string) (shutdown func(context.Context) error, err error) {
    res, err := resource.New(ctx,
        resource.WithAttributes(
            semconv.ServiceName(serviceName),
            semconv.ServiceVersion(serviceVersion),
        ),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to create OTel resource: %w", err) // Use fmt
    }

    // --- OTLP Exporter Setup (gRPC) ---
    conn, err := grpc.NewClient(otelEndpoint,
        grpc.WithTransportCredentials(insecure.NewCredentials()),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to create gRPC connection to OTLP endpoint %s: %w", otelEndpoint, err) // Use fmt
    }

    // --- Trace Exporter and Provider ---
    traceExporter, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
    if err != nil {
        return nil, fmt.Errorf("failed to create OTLP trace exporter: %w", err) // Use fmt
    }
    bsp := trace.NewBatchSpanProcessor(traceExporter)
    tracerProvider := trace.NewTracerProvider(
        trace.WithResource(res),
        trace.WithSpanProcessor(bsp),
    )

    // --- Metric Exporter and Provider ---
    metricExporter, err := otlpmetricgrpc.New(ctx, otlpmetricgrpc.WithGRPCConn(conn))
    if err != nil {
        return nil, fmt.Errorf("failed to create OTLP metric exporter: %w", err) // Use fmt
    }
    meterProvider := metric.NewMeterProvider(
        metric.WithResource(res),
        metric.WithReader(metric.NewPeriodicReader(metricExporter)),
    )

    // --- Log Exporter and Provider (Keep Commented Out for Workaround) ---
    /* // Start comment block
    logExporter, err := otlploggrpc.New(ctx, otlploggrpc.WithGRPCConn(conn)) // Corrected path (but commented)
    if err != nil {
         return nil, fmt.Errorf("failed to create OTLP log exporter: %w", err)
    }
    loggerProvider := sdklog.NewLoggerProvider(
         sdklog.WithResource(res),
         sdklog.WithProcessor(sdklog.NewBatchProcessor(logExporter)),
    )
    */ // End comment block


    // --- Set Global Providers (Comment out LoggerProvider) ---
    otel.SetTracerProvider(tracerProvider)
    otel.SetMeterProvider(meterProvider)
    // global.SetLoggerProvider(loggerProvider) // Keep Commented Out


    // Set the global Propagator
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

    // Define the shutdown function
    shutdown = func(ctx context.Context) error {
        var shutdownErr error
        if err := tracerProvider.Shutdown(ctx); err != nil {
            shutdownErr = errors.Join(shutdownErr, fmt.Errorf("tracer provider shutdown failed: %w", err)) // Use fmt
        }
        if err := meterProvider.Shutdown(ctx); err != nil {
            shutdownErr = errors.Join(shutdownErr, fmt.Errorf("meter provider shutdown failed: %w", err)) // Use fmt
        }
        /* // Keep Log Provider Shutdown Commented Out
        if err := loggerProvider.Shutdown(ctx); err != nil {
             shutdownErr = errors.Join(shutdownErr, fmt.Errorf("logger provider shutdown failed: %w", err))
        }
        */
        if err := conn.Close(); err != nil {
             shutdownErr = errors.Join(shutdownErr, fmt.Errorf("grpc connection close failed: %w", err)) // Use fmt
        }
        return shutdownErr
    }
    return shutdown, nil
}


// --- Main Function ---
func main() {
    // --- Set Slog default handler to Text Handler ---
    handlerOptions := &slog.HandlerOptions{Level: slog.LevelDebug}
    slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, handlerOptions)))
    slog.Info("Using default slog text handler (OTLP logs disabled temporarily)")
    // ----------------------------------------------

    ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
    defer stop()

    // Load configuration
    cfg, err := config.Load()
    if err != nil {
        slog.Error("Failed to load configuration", "error", err)
        os.Exit(1)
    }

    // --- Initialize OTel (Trace & Metrics only) ---
    // Get values directly from the loaded config struct
	otelEndpoint := cfg.OtelEndpoint
	serviceName := cfg.OtelServiceName
	serviceVersion := cfg.OtelServiceVersion
	// Defaults are now handled within config.Load()

    otelShutdown, err := initOtelProvider(ctx, serviceName, serviceVersion, otelEndpoint)
    if err != nil {
        slog.Error("Failed to initialize OTel provider (Trace/Metrics)", "error", err)
        os.Exit(1)
    }
    // Handle OTel shutdown gracefully
    defer func() {
        shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        defer cancel()
        if err := otelShutdown(shutdownCtx); err != nil {
            slog.Error("OTel shutdown failed", "error", err)
        } else {
            slog.Info("OTel providers shut down successfully.")
        }
    }()
    // ------------------------------------------------

    // --- Initialize Dependencies (Orthanc Client) ---
    orthancBaseClient := &http.Client{Timeout: cfg.HttpClientTimeout}
    instrumentedTransport := otelhttp.NewTransport(orthancBaseClient.Transport)
    instrumentedClient := &http.Client{Transport: instrumentedTransport, Timeout: cfg.HttpClientTimeout}
    orthancClient := orthanc.NewClientWithHttpClient(cfg.OrthancURL, instrumentedClient)

    // --- Setup Gin Router ---
    router := gin.Default()
    // Add CORS middleware (ensure this is still desired)
    corsConfig := cors.DefaultConfig()
    corsConfig.AllowOrigins = []string{"*"} // Adjust for production
    corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}
    corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
    router.Use(cors.New(corsConfig))
    // Add OTel Gin Middleware
    router.Use(otelgin.Middleware(serviceName))
    // Register API routes
    api.RegisterRoutes(router, orthancClient)

    // --- Start Server ---
    slog.Info("Starting server", "address", cfg.ListenAddress)
    srv := &http.Server{
        Addr:    cfg.ListenAddress,
        Handler: router,
    }
    go func() {
        if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
            slog.Error("Server listen failed", "error", err)
            os.Exit(1)
        }
    }()

    // --- Graceful Shutdown ---
    <-ctx.Done()
    stop()
    slog.Info("Shutting down gracefully, press Ctrl+C again to force")
    shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    if err := srv.Shutdown(shutdownCtx); err != nil {
        slog.Error("Server forced to shutdown", "error", err)
        os.Exit(1)
    }
    slog.Info("Server exiting")
    // OTel shutdown runs via defer
    // NO DUPLICATE CODE BLOCK HERE
}