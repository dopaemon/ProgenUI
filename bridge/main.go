package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

type Config struct {
	Port        string
	XrayBinary  string
	XrayConfig  string
	XrayAPIPort int
}

type ClientStats struct {
	UUID          string `json:"uuid"`
	UplinkBytes   int64  `json:"uplink_bytes"`
	DownlinkBytes int64  `json:"downlink_bytes"`
}

type Supervisor struct {
	mutex             sync.Mutex
	processCommand    *exec.Cmd
	lastError         string
	mockTrafficByUser map[string]int64
	configuration     Config
}

func NewSupervisor(configuration Config) *Supervisor {
	return &Supervisor{
		configuration:     configuration,
		mockTrafficByUser: map[string]int64{},
	}
}

func (supervisor *Supervisor) Start() {
	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()

	if supervisor.processCommand != nil && supervisor.processCommand.Process != nil {
		return
	}

	if _, errorValue := os.Stat(supervisor.configuration.XrayBinary); errorValue != nil {
		supervisor.lastError = "xray binary not found; bridge running in stub mode"
		return
	}

	processCommand := exec.CommandContext(
		context.Background(),
		supervisor.configuration.XrayBinary,
		"run",
		"-config",
		supervisor.configuration.XrayConfig,
	)
	processCommand.Stdout = os.Stdout
	processCommand.Stderr = os.Stderr
	if errorValue := processCommand.Start(); errorValue != nil {
		supervisor.lastError = errorValue.Error()
		return
	}
	supervisor.processCommand = processCommand
	go func() {
		errorValue := processCommand.Wait()
		supervisor.mutex.Lock()
		defer supervisor.mutex.Unlock()
		if errorValue != nil {
			supervisor.lastError = errorValue.Error()
		}
		supervisor.processCommand = nil
	}()
}

func (supervisor *Supervisor) Running() bool {
	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()
	return supervisor.processCommand != nil && supervisor.processCommand.Process != nil
}

func (supervisor *Supervisor) Status() gin.H {
	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()
	return gin.H{
		"xray_running": supervisor.processCommand != nil && supervisor.processCommand.Process != nil,
		"api_port":     supervisor.configuration.XrayAPIPort,
		"binary_path":  supervisor.configuration.XrayBinary,
		"config_path":  supervisor.configuration.XrayConfig,
		"last_error":   supervisor.lastError,
	}
}

func (supervisor *Supervisor) Stop() error {
	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()
	if supervisor.processCommand == nil || supervisor.processCommand.Process == nil {
		return nil
	}
	errorValue := supervisor.processCommand.Process.Signal(syscall.SIGTERM)
	supervisor.processCommand = nil
	return errorValue
}

func (supervisor *Supervisor) BuildClientStats(clientIdentifiers []string) []ClientStats {
	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()

	clientStats := make([]ClientStats, 0, len(clientIdentifiers))
	for index, clientIdentifier := range clientIdentifiers {
		supervisor.mockTrafficByUser[clientIdentifier] += int64(1024 * (index + 1))
		clientStats = append(clientStats, ClientStats{
			UUID:          clientIdentifier,
			UplinkBytes:   supervisor.mockTrafficByUser[clientIdentifier],
			DownlinkBytes: supervisor.mockTrafficByUser[clientIdentifier] * 2,
		})
	}
	return clientStats
}

func main() {
	gin.SetMode(gin.ReleaseMode)

	apiPort, _ := strconv.Atoi(getEnvironmentValue("XRAY_API_PORT", "10085"))
	configuration := Config{
		Port:        getEnvironmentValue("PORT", "8081"),
		XrayBinary:  getEnvironmentValue("XRAY_BINARY", "/usr/local/bin/xray"),
		XrayConfig:  getEnvironmentValue("XRAY_CONFIG_PATH", "/etc/xray/config.json"),
		XrayAPIPort: apiPort,
	}
	supervisor := NewSupervisor(configuration)
	supervisor.Start()

	router := gin.Default()
	router.GET("/health", func(context *gin.Context) {
		context.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	router.GET("/runtime/status", func(context *gin.Context) {
		context.JSON(http.StatusOK, supervisor.Status())
	})
	router.POST("/inbounds/apply", func(context *gin.Context) {
		var payload map[string]any
		if errorValue := context.BindJSON(&payload); errorValue != nil {
			context.JSON(http.StatusBadRequest, gin.H{"error": errorValue.Error()})
			return
		}
		context.JSON(http.StatusOK, gin.H{"status": "applied", "payload": payload})
	})
	router.POST("/clients/add", func(context *gin.Context) {
		var payload map[string]any
		if errorValue := context.BindJSON(&payload); errorValue != nil {
			context.JSON(http.StatusBadRequest, gin.H{"error": errorValue.Error()})
			return
		}
		context.JSON(http.StatusOK, gin.H{"status": "added", "payload": payload})
	})
	router.POST("/clients/update", func(context *gin.Context) {
		var payload map[string]any
		if errorValue := context.BindJSON(&payload); errorValue != nil {
			context.JSON(http.StatusBadRequest, gin.H{"error": errorValue.Error()})
			return
		}
		context.JSON(http.StatusOK, gin.H{"status": "updated", "payload": payload})
	})
	router.POST("/clients/remove", func(context *gin.Context) {
		var payload map[string]any
		if errorValue := context.BindJSON(&payload); errorValue != nil {
			context.JSON(http.StatusBadRequest, gin.H{"error": errorValue.Error()})
			return
		}
		context.JSON(http.StatusOK, gin.H{"status": "removed", "payload": payload})
	})
	router.GET("/stats/system", func(context *gin.Context) {
		uptimeSeconds := time.Now().Unix()
		context.JSON(http.StatusOK, gin.H{"uptime_seconds": uptimeSeconds, "xray_running": supervisor.Running()})
	})
	router.GET("/stats/clients", func(context *gin.Context) {
		clientIdentifiers := context.QueryArray("uuid")
		if len(clientIdentifiers) == 0 {
			clientIdentifiers = []string{"demo-client-1", "demo-client-2"}
		}
		context.JSON(http.StatusOK, gin.H{"clients": supervisor.BuildClientStats(clientIdentifiers)})
	})

	log.Fatal(router.Run(":" + configuration.Port))
}

func getEnvironmentValue(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
