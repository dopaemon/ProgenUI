package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

type ApplicationConfiguration struct {
	Port                  string
	XrayBinaryPath        string
	XrayConfigurationPath string
	XrayAPIPort           int
}

type ClientPayload struct {
	ID                int     `json:"id"`
	InboundID         int     `json:"inbound_id"`
	Email             string  `json:"email"`
	UUID              string  `json:"uuid"`
	TrafficLimitBytes int64   `json:"traffic_limit_bytes"`
	UsedBytes         int64   `json:"used_bytes"`
	ExpiryAt          *string `json:"expiry_at"`
	Enabled           bool    `json:"enabled"`
}

type InboundPayload struct {
	ID          int             `json:"id"`
	Name        string          `json:"name"`
	Protocol    string          `json:"protocol"`
	ListenPort  int             `json:"listen_port"`
	Transport   string          `json:"transport"`
	Security    string          `json:"security"`
	SettingsRaw string          `json:"settings_json"`
	Enabled     bool            `json:"enabled"`
	Clients     []ClientPayload `json:"clients"`
}

type InboundApplyRequest struct {
	Inbound InboundPayload `json:"inbound"`
}

type InboundRemoveRequest struct {
	InboundID int `json:"inbound_id"`
}

type ClientRemoveRequest struct {
	UUID string `json:"uuid"`
}

type ClientStats struct {
	UUID          string `json:"uuid"`
	UplinkBytes   int64  `json:"uplink_bytes"`
	DownlinkBytes int64  `json:"downlink_bytes"`
}

type XrayStatsQueryResponse struct {
	Stat []XrayStatEntry `json:"stat"`
}

type XrayStatEntry struct {
	Name  string          `json:"name"`
	Value json.RawMessage `json:"value"`
}

type BridgeState struct {
	mutex               sync.Mutex
	inboundsByID        map[int]InboundPayload
	clientTrafficByUUID map[string]int64
}

func NewBridgeState() *BridgeState {
	return &BridgeState{
		inboundsByID:        map[int]InboundPayload{},
		clientTrafficByUUID: map[string]int64{},
	}
}

func (bridgeState *BridgeState) UpsertInbound(inbound InboundPayload) {
	bridgeState.mutex.Lock()
	defer bridgeState.mutex.Unlock()

	bridgeState.inboundsByID[inbound.ID] = inbound
	bridgeState.cleanupUnknownTrafficCounters()
}

func (bridgeState *BridgeState) RemoveInbound(inboundID int) {
	bridgeState.mutex.Lock()
	defer bridgeState.mutex.Unlock()

	delete(bridgeState.inboundsByID, inboundID)
	bridgeState.cleanupUnknownTrafficCounters()
}

func (bridgeState *BridgeState) RemoveClient(clientUUID string) {
	bridgeState.mutex.Lock()
	defer bridgeState.mutex.Unlock()

	for inboundID, inbound := range bridgeState.inboundsByID {
		filteredClients := make([]ClientPayload, 0, len(inbound.Clients))
		for _, client := range inbound.Clients {
			if client.UUID != clientUUID {
				filteredClients = append(filteredClients, client)
			}
		}
		inbound.Clients = filteredClients
		bridgeState.inboundsByID[inboundID] = inbound
	}

	delete(bridgeState.clientTrafficByUUID, clientUUID)
}

func (bridgeState *BridgeState) SnapshotInbounds() []InboundPayload {
	bridgeState.mutex.Lock()
	defer bridgeState.mutex.Unlock()

	inboundList := make([]InboundPayload, 0, len(bridgeState.inboundsByID))
	for _, inbound := range bridgeState.inboundsByID {
		inboundList = append(inboundList, inbound)
	}
	return inboundList
}

func (bridgeState *BridgeState) BuildClientStats(requestedUUIDs []string) []ClientStats {
	bridgeState.mutex.Lock()
	defer bridgeState.mutex.Unlock()

	knownClients := bridgeState.collectClientsByUUID()
	clientUUIDs := requestedUUIDs
	if len(clientUUIDs) == 0 {
		clientUUIDs = make([]string, 0, len(knownClients))
		for clientUUID := range knownClients {
			clientUUIDs = append(clientUUIDs, clientUUID)
		}
	}

	clientStats := make([]ClientStats, 0, len(clientUUIDs))
	for index, clientUUID := range clientUUIDs {
		client, exists := knownClients[clientUUID]
		if !exists || !client.Enabled {
			continue
		}

		bridgeState.clientTrafficByUUID[clientUUID] += int64(1024 * (index + 1))
		clientStats = append(clientStats, ClientStats{
			UUID:          clientUUID,
			UplinkBytes:   bridgeState.clientTrafficByUUID[clientUUID],
			DownlinkBytes: bridgeState.clientTrafficByUUID[clientUUID] * 2,
		})
	}

	return clientStats
}

func (bridgeState *BridgeState) CountActiveClients() int {
	bridgeState.mutex.Lock()
	defer bridgeState.mutex.Unlock()

	activeClientCount := 0
	for _, inbound := range bridgeState.inboundsByID {
		for _, client := range inbound.Clients {
			if client.Enabled {
				activeClientCount += 1
			}
		}
	}
	return activeClientCount
}

func (bridgeState *BridgeState) FindClientByEmail(email string) (ClientPayload, bool) {
	bridgeState.mutex.Lock()
	defer bridgeState.mutex.Unlock()

	for _, inbound := range bridgeState.inboundsByID {
		for _, client := range inbound.Clients {
			if client.Email == email {
				return client, true
			}
		}
	}

	return ClientPayload{}, false
}

func (bridgeState *BridgeState) cleanupUnknownTrafficCounters() {
	knownClients := bridgeState.collectClientsByUUID()
	for clientUUID := range bridgeState.clientTrafficByUUID {
		if _, exists := knownClients[clientUUID]; !exists {
			delete(bridgeState.clientTrafficByUUID, clientUUID)
		}
	}
}

func (bridgeState *BridgeState) collectClientsByUUID() map[string]ClientPayload {
	clientMap := map[string]ClientPayload{}
	for _, inbound := range bridgeState.inboundsByID {
		for _, client := range inbound.Clients {
			clientMap[client.UUID] = client
		}
	}
	return clientMap
}

type XraySupervisor struct {
	mutex              sync.Mutex
	processCommand     *exec.Cmd
	lastError          string
	lastStatsError     string
	lastStatsSource    string
	lastStatsSyncAt    string
	xrayBinaryVersion  string
	xrayBinaryDetected bool
	xrayAPIReachable   bool
	lastHealthCheckAt  string
	systemMetrics      SystemMetrics
	previousCPUIdle    uint64
	previousCPUTotal   uint64
	hasPreviousCPUSnap bool
	configuration      ApplicationConfiguration
	bridgeState        *BridgeState
}

type SystemMetrics struct {
	CPUCoreCount        int
	CPUUsagePercent     float64
	LoadAverage1m       float64
	LoadAverage5m       float64
	LoadAverage15m      float64
	MemoryTotalBytes    uint64
	MemoryAvailableBytes uint64
	MemoryUsedBytes     uint64
	MemoryUsedPercent   float64
	DiskTotalBytes      uint64
	DiskFreeBytes       uint64
	DiskUsedBytes       uint64
	DiskUsedPercent     float64
	SystemUptimeSeconds float64
	ZRAMEnabled         bool
	ZRAMDeviceCount     int
	ZRAMTotalBytes      uint64
	ZRAMUsedBytes       uint64
}

func NewXraySupervisor(configuration ApplicationConfiguration, bridgeState *BridgeState) *XraySupervisor {
	supervisor := &XraySupervisor{
		configuration:   configuration,
		bridgeState:     bridgeState,
		lastStatsSource: "mock",
	}
	supervisor.refreshBinaryMetadata()
	supervisor.refreshSystemMetrics()
	return supervisor
}

func (supervisor *XraySupervisor) Start() {
	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()

	if supervisor.processCommand != nil && supervisor.processCommand.Process != nil {
		return
	}

	if errorValue := supervisor.refreshBinaryMetadataLocked(); errorValue != nil {
		supervisor.lastError = "xray binary not found; bridge running in stub mode"
		return
	}

	if errorValue := supervisor.writeConfigurationFile(); errorValue != nil {
		supervisor.lastError = errorValue.Error()
		return
	}

	processCommand := exec.CommandContext(
		context.Background(),
		supervisor.configuration.XrayBinaryPath,
		"run",
		"-config",
		supervisor.configuration.XrayConfigurationPath,
	)
	processCommand.Stdout = os.Stdout
	processCommand.Stderr = os.Stderr
	if errorValue := processCommand.Start(); errorValue != nil {
		supervisor.lastError = errorValue.Error()
		return
	}

	supervisor.lastError = ""
	supervisor.processCommand = processCommand
	go supervisor.waitForProcessExit(processCommand)
}

func (supervisor *XraySupervisor) waitForProcessExit(processCommand *exec.Cmd) {
	errorValue := processCommand.Wait()

	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()

	if errorValue != nil {
		supervisor.lastError = errorValue.Error()
	}

	if supervisor.processCommand == processCommand {
		supervisor.processCommand = nil
	}
}

func (supervisor *XraySupervisor) Restart() error {
	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()

	if errorValue := supervisor.refreshBinaryMetadataLocked(); errorValue != nil {
		supervisor.lastError = "xray binary not found; configuration file updated in stub mode"
	}

	if errorValue := supervisor.writeConfigurationFile(); errorValue != nil {
		supervisor.lastError = errorValue.Error()
		return errorValue
	}

	if supervisor.processCommand == nil || supervisor.processCommand.Process == nil {
		if !supervisor.xrayBinaryDetected {
			supervisor.lastError = "xray binary not found; configuration file updated in stub mode"
			return nil
		}

		go supervisor.Start()
		return nil
	}

	if errorValue := supervisor.processCommand.Process.Signal(syscall.SIGTERM); errorValue != nil {
		supervisor.lastError = errorValue.Error()
		return errorValue
	}

	supervisor.processCommand = nil
	go supervisor.Start()
	return nil
}

func (supervisor *XraySupervisor) Running() bool {
	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()
	return supervisor.processCommand != nil && supervisor.processCommand.Process != nil
}

func (supervisor *XraySupervisor) ReadClientStats(requestedUUIDs []string) []ClientStats {
	if !supervisor.Running() {
		return supervisor.recordMockStatsResult(requestedUUIDs, "xray process is not running")
	}

	clientStats, errorValue := supervisor.queryClientStatsFromXray(requestedUUIDs)
	if errorValue != nil {
		supervisor.mutex.Lock()
		supervisor.lastError = errorValue.Error()
		supervisor.lastStatsError = errorValue.Error()
		supervisor.lastStatsSource = "mock"
		supervisor.lastStatsSyncAt = time.Now().UTC().Format(time.RFC3339)
		supervisor.xrayAPIReachable = false
		supervisor.lastHealthCheckAt = time.Now().UTC().Format(time.RFC3339)
		supervisor.mutex.Unlock()
		return supervisor.bridgeState.BuildClientStats(requestedUUIDs)
	}

	supervisor.mutex.Lock()
	supervisor.lastStatsError = ""
	supervisor.lastStatsSource = "xray_api"
	supervisor.lastStatsSyncAt = time.Now().UTC().Format(time.RFC3339)
	supervisor.xrayAPIReachable = true
	supervisor.lastHealthCheckAt = time.Now().UTC().Format(time.RFC3339)
	supervisor.mutex.Unlock()
	return clientStats
}

func (supervisor *XraySupervisor) recordMockStatsResult(requestedUUIDs []string, reason string) []ClientStats {
	supervisor.mutex.Lock()
	supervisor.lastStatsError = reason
	supervisor.lastStatsSource = "mock"
	supervisor.lastStatsSyncAt = time.Now().UTC().Format(time.RFC3339)
	supervisor.xrayAPIReachable = false
	supervisor.lastHealthCheckAt = time.Now().UTC().Format(time.RFC3339)
	supervisor.mutex.Unlock()
	return supervisor.bridgeState.BuildClientStats(requestedUUIDs)
}

func (supervisor *XraySupervisor) Status() gin.H {
	supervisor.refreshRuntimeHealth()
	supervisor.refreshSystemMetrics()

	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()

	inboundList := supervisor.bridgeState.SnapshotInbounds()
	runtimeMode := "stub"
	if supervisor.xrayBinaryDetected {
		runtimeMode = "managed"
	}

	return gin.H{
		"xray_running":         supervisor.processCommand != nil && supervisor.processCommand.Process != nil,
		"api_port":             supervisor.configuration.XrayAPIPort,
		"binary_path":          supervisor.configuration.XrayBinaryPath,
		"xray_version":         supervisor.xrayBinaryVersion,
		"binary_detected":      supervisor.xrayBinaryDetected,
		"xray_api_reachable":   supervisor.xrayAPIReachable,
		"last_health_check_at": supervisor.lastHealthCheckAt,
		"runtime_mode":         runtimeMode,
		"config_path":          supervisor.configuration.XrayConfigurationPath,
		"last_error":           supervisor.lastError,
		"stats_source":         supervisor.lastStatsSource,
		"last_stats_error":     supervisor.lastStatsError,
		"last_stats_sync_at":   supervisor.lastStatsSyncAt,
		"inbound_count":        len(inboundList),
		"active_client_count":  supervisor.bridgeState.CountActiveClients(),
		"cpu_core_count":       supervisor.systemMetrics.CPUCoreCount,
		"cpu_usage_percent":    supervisor.systemMetrics.CPUUsagePercent,
		"load_average_1m":      supervisor.systemMetrics.LoadAverage1m,
		"load_average_5m":      supervisor.systemMetrics.LoadAverage5m,
		"load_average_15m":     supervisor.systemMetrics.LoadAverage15m,
		"memory_total_bytes":   supervisor.systemMetrics.MemoryTotalBytes,
		"memory_available_bytes": supervisor.systemMetrics.MemoryAvailableBytes,
		"memory_used_bytes":    supervisor.systemMetrics.MemoryUsedBytes,
		"memory_used_percent":  supervisor.systemMetrics.MemoryUsedPercent,
		"disk_total_bytes":     supervisor.systemMetrics.DiskTotalBytes,
		"disk_free_bytes":      supervisor.systemMetrics.DiskFreeBytes,
		"disk_used_bytes":      supervisor.systemMetrics.DiskUsedBytes,
		"disk_used_percent":    supervisor.systemMetrics.DiskUsedPercent,
		"system_uptime_seconds": supervisor.systemMetrics.SystemUptimeSeconds,
		"zram_enabled":         supervisor.systemMetrics.ZRAMEnabled,
		"zram_device_count":    supervisor.systemMetrics.ZRAMDeviceCount,
		"zram_total_bytes":     supervisor.systemMetrics.ZRAMTotalBytes,
		"zram_used_bytes":      supervisor.systemMetrics.ZRAMUsedBytes,
	}
}

func (supervisor *XraySupervisor) refreshRuntimeHealth() {
	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()

	if errorValue := supervisor.refreshBinaryMetadataLocked(); errorValue != nil {
		supervisor.lastHealthCheckAt = time.Now().UTC().Format(time.RFC3339)
		supervisor.xrayAPIReachable = false
		return
	}

	supervisor.lastHealthCheckAt = time.Now().UTC().Format(time.RFC3339)
	if supervisor.processCommand == nil || supervisor.processCommand.Process == nil {
		supervisor.xrayAPIReachable = false
		return
	}

	_, errorValue := supervisor.queryClientStatsFromXray(nil)
	supervisor.xrayAPIReachable = errorValue == nil
	if errorValue != nil {
		supervisor.lastStatsError = errorValue.Error()
	}
}

func (supervisor *XraySupervisor) refreshBinaryMetadata() {
	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()
	_ = supervisor.refreshBinaryMetadataLocked()
}

func (supervisor *XraySupervisor) refreshSystemMetrics() {
	cpuUsagePercent, currentIdle, currentTotal, hasCPUSnapshot := supervisor.readCPUUsagePercent()
	loadAverage1m, loadAverage5m, loadAverage15m := readLoadAverage()
	memoryTotalBytes, memoryAvailableBytes, memoryUsedBytes, memoryUsedPercent := readMemoryMetrics()
	diskTotalBytes, diskFreeBytes, diskUsedBytes, diskUsedPercent := readDiskMetrics(supervisor.configuration.XrayConfigurationPath)
	systemUptimeSeconds := readSystemUptimeSeconds()
	zramEnabled, zramDeviceCount, zramTotalBytes, zramUsedBytes := readZRAMMetrics()

	supervisor.mutex.Lock()
	defer supervisor.mutex.Unlock()

	supervisor.systemMetrics = SystemMetrics{
		CPUCoreCount:         runtime.NumCPU(),
		CPUUsagePercent:      cpuUsagePercent,
		LoadAverage1m:        loadAverage1m,
		LoadAverage5m:        loadAverage5m,
		LoadAverage15m:       loadAverage15m,
		MemoryTotalBytes:     memoryTotalBytes,
		MemoryAvailableBytes: memoryAvailableBytes,
		MemoryUsedBytes:      memoryUsedBytes,
		MemoryUsedPercent:    memoryUsedPercent,
		DiskTotalBytes:       diskTotalBytes,
		DiskFreeBytes:        diskFreeBytes,
		DiskUsedBytes:        diskUsedBytes,
		DiskUsedPercent:      diskUsedPercent,
		SystemUptimeSeconds:  systemUptimeSeconds,
		ZRAMEnabled:          zramEnabled,
		ZRAMDeviceCount:      zramDeviceCount,
		ZRAMTotalBytes:       zramTotalBytes,
		ZRAMUsedBytes:        zramUsedBytes,
	}

	if hasCPUSnapshot {
		supervisor.previousCPUIdle = currentIdle
		supervisor.previousCPUTotal = currentTotal
		supervisor.hasPreviousCPUSnap = true
	}
}

func (supervisor *XraySupervisor) readCPUUsagePercent() (float64, uint64, uint64, bool) {
	currentIdle, currentTotal, errorValue := readCPUStatSnapshot()
	if errorValue != nil {
		return 0, 0, 0, false
	}

	supervisor.mutex.Lock()
	previousIdle := supervisor.previousCPUIdle
	previousTotal := supervisor.previousCPUTotal
	hasPreviousSnapshot := supervisor.hasPreviousCPUSnap
	supervisor.mutex.Unlock()

	if !hasPreviousSnapshot || currentTotal <= previousTotal {
		return 0, currentIdle, currentTotal, true
	}

	idleDelta := currentIdle - previousIdle
	totalDelta := currentTotal - previousTotal
	if totalDelta == 0 {
		return 0, currentIdle, currentTotal, true
	}

	usagePercent := 100 * (1 - (float64(idleDelta) / float64(totalDelta)))
	return roundToTwoDecimals(usagePercent), currentIdle, currentTotal, true
}

func readCPUStatSnapshot() (uint64, uint64, error) {
	cpuStatLine, errorValue := readFirstLine("/proc/stat")
	if errorValue != nil {
		return 0, 0, errorValue
	}

	cpuFields := strings.Fields(cpuStatLine)
	if len(cpuFields) < 8 || cpuFields[0] != "cpu" {
		return 0, 0, errors.New("invalid /proc/stat cpu line")
	}

	var total uint64
	values := make([]uint64, 0, len(cpuFields)-1)
	for _, cpuField := range cpuFields[1:] {
		parsedValue, parseError := strconv.ParseUint(cpuField, 10, 64)
		if parseError != nil {
			return 0, 0, parseError
		}
		values = append(values, parsedValue)
		total += parsedValue
	}

	idle := values[3]
	if len(values) > 4 {
		idle += values[4]
	}

	return idle, total, nil
}

func readLoadAverage() (float64, float64, float64) {
	loadAverageLine, errorValue := readFirstLine("/proc/loadavg")
	if errorValue != nil {
		return 0, 0, 0
	}

	loadAverageFields := strings.Fields(loadAverageLine)
	if len(loadAverageFields) < 3 {
		return 0, 0, 0
	}

	loadAverage1m, _ := strconv.ParseFloat(loadAverageFields[0], 64)
	loadAverage5m, _ := strconv.ParseFloat(loadAverageFields[1], 64)
	loadAverage15m, _ := strconv.ParseFloat(loadAverageFields[2], 64)
	return roundToTwoDecimals(loadAverage1m), roundToTwoDecimals(loadAverage5m), roundToTwoDecimals(loadAverage15m)
}

func readMemoryMetrics() (uint64, uint64, uint64, float64) {
	memInfoMap, errorValue := readMemInfo()
	if errorValue != nil {
		return 0, 0, 0, 0
	}

	totalBytes := memInfoMap["MemTotal"] * 1024
	availableBytes := memInfoMap["MemAvailable"] * 1024
	if availableBytes == 0 {
		availableBytes = memInfoMap["MemFree"] * 1024
	}
	usedBytes := uint64(0)
	usedPercent := 0.0
	if totalBytes >= availableBytes {
		usedBytes = totalBytes - availableBytes
	}
	if totalBytes > 0 {
		usedPercent = roundToTwoDecimals((float64(usedBytes) / float64(totalBytes)) * 100)
	}

	return totalBytes, availableBytes, usedBytes, usedPercent
}

func readMemInfo() (map[string]uint64, error) {
	memInfoFile, errorValue := os.Open("/proc/meminfo")
	if errorValue != nil {
		return nil, errorValue
	}
	defer memInfoFile.Close()

	memInfoMap := map[string]uint64{}
	scanner := bufio.NewScanner(memInfoFile)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}

		fields := strings.Fields(strings.TrimSpace(parts[1]))
		if len(fields) == 0 {
			continue
		}

		parsedValue, parseError := strconv.ParseUint(fields[0], 10, 64)
		if parseError != nil {
			continue
		}

		memInfoMap[parts[0]] = parsedValue
	}

	return memInfoMap, scanner.Err()
}

func readDiskMetrics(referencePath string) (uint64, uint64, uint64, float64) {
	var fileSystemStat syscall.Statfs_t
	pathToCheck := filepath.Dir(referencePath)
	if pathToCheck == "." || pathToCheck == "" {
		pathToCheck = "/"
	}

	if errorValue := syscall.Statfs(pathToCheck, &fileSystemStat); errorValue != nil {
		if errorValue = syscall.Statfs("/", &fileSystemStat); errorValue != nil {
			return 0, 0, 0, 0
		}
	}

	totalBytes := fileSystemStat.Blocks * uint64(fileSystemStat.Bsize)
	freeBytes := fileSystemStat.Bavail * uint64(fileSystemStat.Bsize)
	usedBytes := totalBytes - freeBytes
	usedPercent := 0.0
	if totalBytes > 0 {
		usedPercent = roundToTwoDecimals((float64(usedBytes) / float64(totalBytes)) * 100)
	}

	return totalBytes, freeBytes, usedBytes, usedPercent
}

func readSystemUptimeSeconds() float64 {
	uptimeLine, errorValue := readFirstLine("/proc/uptime")
	if errorValue != nil {
		return 0
	}

	uptimeFields := strings.Fields(uptimeLine)
	if len(uptimeFields) == 0 {
		return 0
	}

	uptimeSeconds, parseError := strconv.ParseFloat(uptimeFields[0], 64)
	if parseError != nil {
		return 0
	}

	return roundToTwoDecimals(uptimeSeconds)
}

func readZRAMMetrics() (bool, int, uint64, uint64) {
	zramDevicePaths, errorValue := filepath.Glob("/sys/block/zram*")
	if errorValue != nil || len(zramDevicePaths) == 0 {
		return false, 0, 0, 0
	}

	totalBytes := uint64(0)
	usedBytes := uint64(0)
	deviceCount := 0

	for _, zramDevicePath := range zramDevicePaths {
		deviceCount += 1
		totalBytes += readUintFromFile(filepath.Join(zramDevicePath, "disksize"))

		memoryUsedTotal := readUintFromFile(filepath.Join(zramDevicePath, "mem_used_total"))
		if memoryUsedTotal > 0 {
			usedBytes += memoryUsedTotal
			continue
		}

		mmStatLine, readError := readFirstLine(filepath.Join(zramDevicePath, "mm_stat"))
		if readError != nil {
			continue
		}

		mmStatFields := strings.Fields(mmStatLine)
		if len(mmStatFields) >= 3 {
			parsedUsedBytes, parseError := strconv.ParseUint(mmStatFields[2], 10, 64)
			if parseError == nil {
				usedBytes += parsedUsedBytes
			}
		}
	}

	return deviceCount > 0, deviceCount, totalBytes, usedBytes
}

func readUintFromFile(path string) uint64 {
	fileContents, errorValue := os.ReadFile(path)
	if errorValue != nil {
		return 0
	}

	parsedValue, parseError := strconv.ParseUint(strings.TrimSpace(string(fileContents)), 10, 64)
	if parseError != nil {
		return 0
	}

	return parsedValue
}

func readFirstLine(path string) (string, error) {
	fileContents, errorValue := os.ReadFile(path)
	if errorValue != nil {
		return "", errorValue
	}

	lines := strings.Split(strings.TrimSpace(string(fileContents)), "\n")
	if len(lines) == 0 || lines[0] == "" {
		return "", fmt.Errorf("file %s is empty", path)
	}

	return lines[0], nil
}

func roundToTwoDecimals(value float64) float64 {
	return math.Round(value*100) / 100
}

func (supervisor *XraySupervisor) refreshBinaryMetadataLocked() error {
	versionOutput, errorValue := exec.Command(supervisor.configuration.XrayBinaryPath, "version").Output()
	if errorValue != nil {
		supervisor.xrayBinaryVersion = ""
		supervisor.xrayBinaryDetected = false
		return errorValue
	}

	supervisor.xrayBinaryVersion = parseXrayVersionOutput(versionOutput)
	supervisor.xrayBinaryDetected = true
	return nil
}

func (supervisor *XraySupervisor) writeConfigurationFile() error {
	configurationDirectory := filepath.Dir(supervisor.configuration.XrayConfigurationPath)
	if errorValue := os.MkdirAll(configurationDirectory, 0o755); errorValue != nil {
		return errorValue
	}

	xrayConfiguration, errorValue := BuildXrayConfiguration(
		supervisor.bridgeState.SnapshotInbounds(),
		supervisor.configuration.XrayAPIPort,
	)
	if errorValue != nil {
		return errorValue
	}

	configurationBytes, errorValue := json.MarshalIndent(xrayConfiguration, "", "  ")
	if errorValue != nil {
		return errorValue
	}

	return os.WriteFile(supervisor.configuration.XrayConfigurationPath, configurationBytes, 0o644)
}

func (supervisor *XraySupervisor) queryClientStatsFromXray(requestedUUIDs []string) ([]ClientStats, error) {
	commandOutput, errorValue := exec.Command(
		supervisor.configuration.XrayBinaryPath,
		"api",
		"statsquery",
		"--server=127.0.0.1:"+strconv.Itoa(supervisor.configuration.XrayAPIPort),
		"--pattern=user>>>",
	).Output()
	if errorValue != nil {
		return nil, errorValue
	}

	return parseClientStatsQueryResponse(commandOutput, supervisor.bridgeState, requestedUUIDs)
}

func parseClientStatsQueryResponse(
	commandOutput []byte,
	bridgeState *BridgeState,
	requestedUUIDs []string,
) ([]ClientStats, error) {
	var statsQueryResponse XrayStatsQueryResponse
	if errorValue := json.Unmarshal(commandOutput, &statsQueryResponse); errorValue != nil {
		return nil, errorValue
	}

	requestedUUIDMap := map[string]bool{}
	for _, requestedUUID := range requestedUUIDs {
		requestedUUIDMap[requestedUUID] = true
	}

	statsByUUID := map[string]*ClientStats{}
	for _, statEntry := range statsQueryResponse.Stat {
		statParts := strings.Split(statEntry.Name, ">>>")
		if len(statParts) != 4 {
			continue
		}
		if statParts[0] != "user" || statParts[2] != "traffic" {
			continue
		}

		client, exists := bridgeState.FindClientByEmail(statParts[1])
		if !exists {
			continue
		}
		if len(requestedUUIDMap) > 0 && !requestedUUIDMap[client.UUID] {
			continue
		}

		statValue, errorValue := parseXrayStatValue(statEntry.Value)
		if errorValue != nil {
			return nil, errorValue
		}

		if _, exists := statsByUUID[client.UUID]; !exists {
			statsByUUID[client.UUID] = &ClientStats{UUID: client.UUID}
		}

		switch statParts[3] {
		case "uplink":
			statsByUUID[client.UUID].UplinkBytes = statValue
		case "downlink":
			statsByUUID[client.UUID].DownlinkBytes = statValue
		}
	}

	clientStats := make([]ClientStats, 0, len(statsByUUID))
	for _, clientStat := range statsByUUID {
		clientStats = append(clientStats, *clientStat)
	}

	return clientStats, nil
}

func parseXrayStatValue(rawValue json.RawMessage) (int64, error) {
	var numericValue int64
	if errorValue := json.Unmarshal(rawValue, &numericValue); errorValue == nil {
		return numericValue, nil
	}

	var stringValue string
	if errorValue := json.Unmarshal(rawValue, &stringValue); errorValue == nil {
		return strconv.ParseInt(stringValue, 10, 64)
	}

	return 0, errors.New("unsupported Xray stat value format")
}

func parseXrayVersionOutput(commandOutput []byte) string {
	versionLines := strings.Split(strings.TrimSpace(string(commandOutput)), "\n")
	if len(versionLines) == 0 {
		return ""
	}

	return strings.TrimSpace(versionLines[0])
}

func BuildXrayConfiguration(inboundList []InboundPayload, apiPort int) (map[string]any, error) {
	runtimeInbounds := make([]map[string]any, 0, len(inboundList)+1)
	runtimeInbounds = append(runtimeInbounds, buildAPIInbound(apiPort))

	routingRules := []map[string]any{
		{
			"type":        "field",
			"inboundTag":  []string{"api"},
			"outboundTag": "api",
		},
	}

	for _, inbound := range inboundList {
		if !inbound.Enabled {
			continue
		}

		runtimeInbound, errorValue := buildRuntimeInbound(inbound)
		if errorValue != nil {
			return nil, errorValue
		}
		runtimeInbounds = append(runtimeInbounds, runtimeInbound)
	}

	return map[string]any{
		"log": map[string]any{
			"loglevel": "warning",
		},
		"api": map[string]any{
			"tag": "api",
			"services": []string{
				"HandlerService",
				"StatsService",
				"LoggerService",
			},
		},
		"policy": map[string]any{
			"levels": map[string]any{
				"0": map[string]any{
					"statsUserUplink":   true,
					"statsUserDownlink": true,
				},
			},
			"system": map[string]any{
				"statsInboundUplink":   true,
				"statsInboundDownlink": true,
			},
		},
		"stats":    map[string]any{},
		"inbounds": runtimeInbounds,
		"outbounds": []map[string]any{
			{
				"protocol": "freedom",
				"tag":      "direct",
			},
			{
				"protocol": "blackhole",
				"tag":      "blocked",
			},
		},
		"routing": map[string]any{
			"domainStrategy": "AsIs",
			"rules":          routingRules,
		},
	}, nil
}

func buildAPIInbound(apiPort int) map[string]any {
	return map[string]any{
		"listen":   "127.0.0.1",
		"port":     apiPort,
		"protocol": "dokodemo-door",
		"tag":      "api",
		"settings": map[string]any{
			"address": "127.0.0.1",
		},
	}
}

func buildRuntimeInbound(inbound InboundPayload) (map[string]any, error) {
	switch inbound.Protocol {
	case "vless":
		return buildVLESSInbound(inbound)
	case "trojan":
		return buildTrojanInbound(inbound)
	default:
		return nil, errors.New("unsupported inbound protocol")
	}
}

func isClientActiveForRuntime(client ClientPayload) bool {
	if !client.Enabled {
		return false
	}

	if client.TrafficLimitBytes > 0 && client.UsedBytes >= client.TrafficLimitBytes {
		return false
	}

	if client.ExpiryAt != nil && *client.ExpiryAt != "" {
		expiryTime, errorValue := time.Parse(time.RFC3339, *client.ExpiryAt)
		if errorValue == nil && !expiryTime.After(time.Now().UTC()) {
			return false
		}
	}

	return true
}

func buildVLESSInbound(inbound InboundPayload) (map[string]any, error) {
	clientList := make([]map[string]any, 0, len(inbound.Clients))
	for _, client := range inbound.Clients {
		if !isClientActiveForRuntime(client) {
			continue
		}

		clientList = append(clientList, map[string]any{
			"id":    client.UUID,
			"email": client.Email,
			"level": 0,
		})
	}

	streamSettings, errorValue := buildStreamSettings(inbound)
	if errorValue != nil {
		return nil, errorValue
	}

	return map[string]any{
		"tag":      buildInboundTag(inbound),
		"listen":   "0.0.0.0",
		"port":     inbound.ListenPort,
		"protocol": "vless",
		"settings": map[string]any{
			"clients":    clientList,
			"decryption": "none",
		},
		"streamSettings": streamSettings,
		"sniffing": map[string]any{
			"enabled":      true,
			"destOverride": []string{"http", "tls"},
		},
	}, nil
}

func buildTrojanInbound(inbound InboundPayload) (map[string]any, error) {
	clientList := make([]map[string]any, 0, len(inbound.Clients))
	for _, client := range inbound.Clients {
		if !isClientActiveForRuntime(client) {
			continue
		}

		clientList = append(clientList, map[string]any{
			"password": client.UUID,
			"email":    client.Email,
			"level":    0,
		})
	}

	streamSettings, errorValue := buildStreamSettings(inbound)
	if errorValue != nil {
		return nil, errorValue
	}

	return map[string]any{
		"tag":      buildInboundTag(inbound),
		"listen":   "0.0.0.0",
		"port":     inbound.ListenPort,
		"protocol": "trojan",
		"settings": map[string]any{
			"clients": clientList,
		},
		"streamSettings": streamSettings,
		"sniffing": map[string]any{
			"enabled":      true,
			"destOverride": []string{"http", "tls"},
		},
	}, nil
}

func buildStreamSettings(inbound InboundPayload) (map[string]any, error) {
	streamSettings := map[string]any{
		"network": inbound.Transport,
	}

	if inbound.Security == "tls" {
		streamSettings["security"] = "tls"
		streamSettings["tlsSettings"] = map[string]any{
			"certificates": []map[string]any{},
		}
	} else {
		streamSettings["security"] = "none"
	}

	if inbound.SettingsRaw != "" && inbound.SettingsRaw != "{}" {
		var extraSettings map[string]any
		if errorValue := json.Unmarshal([]byte(inbound.SettingsRaw), &extraSettings); errorValue != nil {
			return nil, errorValue
		}
		for key, value := range extraSettings {
			streamSettings[key] = value
		}
	}

	return streamSettings, nil
}

func buildInboundTag(inbound InboundPayload) string {
	return "inbound-" + strconv.Itoa(inbound.ID) + "-" + inbound.Protocol
}

func main() {
	gin.SetMode(gin.ReleaseMode)

	apiPort, _ := strconv.Atoi(getEnvironmentValue("XRAY_API_PORT", "10085"))
	configuration := ApplicationConfiguration{
		Port:                  getEnvironmentValue("PORT", "8081"),
		XrayBinaryPath:        getEnvironmentValue("XRAY_BINARY", "/usr/local/bin/xray"),
		XrayConfigurationPath: getEnvironmentValue("XRAY_CONFIG_PATH", "/etc/xray/config.json"),
		XrayAPIPort:           apiPort,
	}

	bridgeState := NewBridgeState()
	supervisor := NewXraySupervisor(configuration, bridgeState)
	supervisor.Start()

	router := gin.Default()
	router.GET("/health", func(context *gin.Context) {
		context.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	router.GET("/runtime/status", func(context *gin.Context) {
		context.JSON(http.StatusOK, supervisor.Status())
	})
	router.GET("/runtime/config", func(context *gin.Context) {
		xrayConfiguration, errorValue := BuildXrayConfiguration(
			bridgeState.SnapshotInbounds(),
			configuration.XrayAPIPort,
		)
		if errorValue != nil {
			context.JSON(http.StatusBadRequest, gin.H{"error": errorValue.Error()})
			return
		}
		context.JSON(http.StatusOK, gin.H{"config": xrayConfiguration})
	})
	router.POST("/inbounds/apply", func(context *gin.Context) {
		var request InboundApplyRequest
		if errorValue := context.BindJSON(&request); errorValue != nil {
			context.JSON(http.StatusBadRequest, gin.H{"error": errorValue.Error()})
			return
		}

		bridgeState.UpsertInbound(request.Inbound)
		if errorValue := supervisor.Restart(); errorValue != nil {
			context.JSON(http.StatusInternalServerError, gin.H{"error": errorValue.Error()})
			return
		}

		context.JSON(http.StatusOK, gin.H{
			"status":         "applied",
			"inbound_id":     request.Inbound.ID,
			"active_clients": bridgeState.CountActiveClients(),
			"configuration":  configuration.XrayConfigurationPath,
		})
	})
	router.POST("/inbounds/remove", func(context *gin.Context) {
		var request InboundRemoveRequest
		if errorValue := context.BindJSON(&request); errorValue != nil {
			context.JSON(http.StatusBadRequest, gin.H{"error": errorValue.Error()})
			return
		}

		bridgeState.RemoveInbound(request.InboundID)
		if errorValue := supervisor.Restart(); errorValue != nil {
			context.JSON(http.StatusInternalServerError, gin.H{"error": errorValue.Error()})
			return
		}

		context.JSON(http.StatusOK, gin.H{"status": "removed", "inbound_id": request.InboundID})
	})
	router.POST("/clients/remove", func(context *gin.Context) {
		var request ClientRemoveRequest
		if errorValue := context.BindJSON(&request); errorValue != nil {
			context.JSON(http.StatusBadRequest, gin.H{"error": errorValue.Error()})
			return
		}

		bridgeState.RemoveClient(request.UUID)
		if errorValue := supervisor.Restart(); errorValue != nil {
			context.JSON(http.StatusInternalServerError, gin.H{"error": errorValue.Error()})
			return
		}

		context.JSON(http.StatusOK, gin.H{"status": "removed", "uuid": request.UUID})
	})
	router.GET("/stats/system", func(context *gin.Context) {
		context.JSON(http.StatusOK, gin.H{
			"xray_running":        supervisor.Running(),
			"inbound_count":       len(bridgeState.SnapshotInbounds()),
			"active_client_count": bridgeState.CountActiveClients(),
			"uptime_seconds":      time.Now().Unix(),
		})
	})
	router.GET("/stats/clients", func(context *gin.Context) {
		clientUUIDs := context.QueryArray("uuid")
		context.JSON(http.StatusOK, gin.H{"clients": supervisor.ReadClientStats(clientUUIDs)})
	})

	log.Fatal(router.Run(":" + configuration.Port))
}

func getEnvironmentValue(key string, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
