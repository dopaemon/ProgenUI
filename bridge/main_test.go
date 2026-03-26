package main

import "testing"

func TestBuildXrayConfigurationIncludesEnabledInboundAndClients(t *testing.T) {
	inboundList := []InboundPayload{
		{
			ID:         1,
			Name:       "primary-vless",
			Protocol:   "vless",
			ListenPort: 8443,
			Transport:  "tcp",
			Security:   "none",
			Enabled:    true,
			Clients: []ClientPayload{
				{
					ID:        10,
					InboundID: 1,
					Email:     "alice@example.com",
					UUID:      "11111111-1111-1111-1111-111111111111",
					Enabled:   true,
				},
				{
					ID:        11,
					InboundID: 1,
					Email:     "bob@example.com",
					UUID:      "22222222-2222-2222-2222-222222222222",
					Enabled:   false,
				},
			},
		},
		{
			ID:         2,
			Name:       "disabled-trojan",
			Protocol:   "trojan",
			ListenPort: 9443,
			Transport:  "tcp",
			Security:   "none",
			Enabled:    false,
		},
	}

	configuration, errorValue := BuildXrayConfiguration(inboundList, 10085)
	if errorValue != nil {
		t.Fatalf("expected configuration build to succeed, got error: %v", errorValue)
	}

	inbounds := configuration["inbounds"].([]map[string]any)
	if len(inbounds) != 2 {
		t.Fatalf("expected api inbound plus one enabled inbound, got %d", len(inbounds))
	}

	vlessInbound := inbounds[1]
	settings := vlessInbound["settings"].(map[string]any)
	clients := settings["clients"].([]map[string]any)
	if len(clients) != 1 {
		t.Fatalf("expected only enabled client to be included, got %d", len(clients))
	}
	if clients[0]["email"] != "alice@example.com" {
		t.Fatalf("expected enabled client email to be preserved, got %v", clients[0]["email"])
	}
}

func TestBuildXrayConfigurationExcludesExpiredAndQuotaExceededClients(t *testing.T) {
	expiredAt := "2020-01-01T00:00:00Z"
	futureExpiryAt := "2099-01-01T00:00:00Z"

	inboundList := []InboundPayload{
		{
			ID:         1,
			Name:       "quota-vless",
			Protocol:   "vless",
			ListenPort: 8443,
			Transport:  "tcp",
			Security:   "none",
			Enabled:    true,
			Clients: []ClientPayload{
				{
					ID:                10,
					InboundID:         1,
					Email:             "active@example.com",
					UUID:              "11111111-1111-1111-1111-111111111111",
					TrafficLimitBytes: 1000,
					UsedBytes:         500,
					ExpiryAt:          &futureExpiryAt,
					Enabled:           true,
				},
				{
					ID:                11,
					InboundID:         1,
					Email:             "quota@example.com",
					UUID:              "22222222-2222-2222-2222-222222222222",
					TrafficLimitBytes: 1000,
					UsedBytes:         1000,
					Enabled:           true,
				},
				{
					ID:        12,
					InboundID: 1,
					Email:     "expired@example.com",
					UUID:      "33333333-3333-3333-3333-333333333333",
					ExpiryAt:  &expiredAt,
					Enabled:   true,
				},
			},
		},
	}

	configuration, errorValue := BuildXrayConfiguration(inboundList, 10085)
	if errorValue != nil {
		t.Fatalf("expected configuration build to succeed, got error: %v", errorValue)
	}

	inbounds := configuration["inbounds"].([]map[string]any)
	vlessInbound := inbounds[1]
	settings := vlessInbound["settings"].(map[string]any)
	clients := settings["clients"].([]map[string]any)
	if len(clients) != 1 {
		t.Fatalf("expected only one runtime-eligible client, got %d", len(clients))
	}
	if clients[0]["email"] != "active@example.com" {
		t.Fatalf("expected active client to remain in config, got %v", clients[0]["email"])
	}
}

func TestBuildXrayConfigurationRejectsInvalidSettingsJSON(t *testing.T) {
	inboundList := []InboundPayload{
		{
			ID:          1,
			Name:        "broken-inbound",
			Protocol:    "vless",
			ListenPort:  8443,
			Transport:   "tcp",
			Security:    "none",
			SettingsRaw: "{invalid json}",
			Enabled:     true,
		},
	}

	_, errorValue := BuildXrayConfiguration(inboundList, 10085)
	if errorValue == nil {
		t.Fatal("expected invalid JSON settings to return an error")
	}
}

func TestBridgeStateRemovesClientTrafficCounterWhenClientDisappears(t *testing.T) {
	bridgeState := NewBridgeState()
	bridgeState.UpsertInbound(InboundPayload{
		ID:         1,
		Name:       "stateful-vless",
		Protocol:   "vless",
		ListenPort: 8443,
		Transport:  "tcp",
		Security:   "none",
		Enabled:    true,
		Clients: []ClientPayload{
			{
				ID:      10,
				Email:   "alice@example.com",
				UUID:    "11111111-1111-1111-1111-111111111111",
				Enabled: true,
			},
		},
	})

	firstStats := bridgeState.BuildClientStats(nil)
	if len(firstStats) != 1 {
		t.Fatalf("expected one client stat, got %d", len(firstStats))
	}

	bridgeState.RemoveClient("11111111-1111-1111-1111-111111111111")
	secondStats := bridgeState.BuildClientStats(nil)
	if len(secondStats) != 0 {
		t.Fatalf("expected no client stats after removal, got %d", len(secondStats))
	}
}

func TestParseClientStatsQueryResponseMapsEmailBackToUUID(t *testing.T) {
	bridgeState := NewBridgeState()
	bridgeState.UpsertInbound(InboundPayload{
		ID:         1,
		Name:       "stats-vless",
		Protocol:   "vless",
		ListenPort: 8443,
		Transport:  "tcp",
		Security:   "none",
		Enabled:    true,
		Clients: []ClientPayload{
			{
				ID:      10,
				Email:   "alice@example.com",
				UUID:    "11111111-1111-1111-1111-111111111111",
				Enabled: true,
			},
		},
	})

	commandOutput := []byte(`{
		"stat": [
			{"name": "user>>>alice@example.com>>>traffic>>>uplink", "value": "123"},
			{"name": "user>>>alice@example.com>>>traffic>>>downlink", "value": "456"}
		]
	}`)

	clientStats, errorValue := parseClientStatsQueryResponse(commandOutput, bridgeState, nil)
	if errorValue != nil {
		t.Fatalf("expected parser to succeed, got error: %v", errorValue)
	}
	if len(clientStats) != 1 {
		t.Fatalf("expected one mapped client stat, got %d", len(clientStats))
	}
	if clientStats[0].UUID != "11111111-1111-1111-1111-111111111111" {
		t.Fatalf("expected UUID to match bridge state, got %s", clientStats[0].UUID)
	}
	if clientStats[0].UplinkBytes != 123 || clientStats[0].DownlinkBytes != 456 {
		t.Fatalf("expected parsed traffic values 123/456, got %d/%d", clientStats[0].UplinkBytes, clientStats[0].DownlinkBytes)
	}
}

func TestParseClientStatsQueryResponseAcceptsNumericValues(t *testing.T) {
	bridgeState := NewBridgeState()
	bridgeState.UpsertInbound(InboundPayload{
		ID:         1,
		Name:       "numeric-stats-vless",
		Protocol:   "vless",
		ListenPort: 8443,
		Transport:  "tcp",
		Security:   "none",
		Enabled:    true,
		Clients: []ClientPayload{
			{
				ID:      10,
				Email:   "alice@example.com",
				UUID:    "11111111-1111-1111-1111-111111111111",
				Enabled: true,
			},
		},
	})

	commandOutput := []byte(`{
		"stat": [
			{"name": "user>>>alice@example.com>>>traffic>>>uplink", "value": 123},
			{"name": "user>>>alice@example.com>>>traffic>>>downlink", "value": 456}
		]
	}`)

	clientStats, errorValue := parseClientStatsQueryResponse(commandOutput, bridgeState, nil)
	if errorValue != nil {
		t.Fatalf("expected parser to accept numeric values, got error: %v", errorValue)
	}
	if len(clientStats) != 1 {
		t.Fatalf("expected one mapped client stat, got %d", len(clientStats))
	}
	if clientStats[0].UplinkBytes != 123 || clientStats[0].DownlinkBytes != 456 {
		t.Fatalf("expected parsed numeric traffic values 123/456, got %d/%d", clientStats[0].UplinkBytes, clientStats[0].DownlinkBytes)
	}
}

func TestParseXrayVersionOutputReturnsFirstLine(t *testing.T) {
	commandOutput := []byte("Xray 26.1.13 (Xray, Penetrates Everything.) Custom (go1.24.0 linux/amd64)\nA unified platform for anti-censorship.")

	versionLine := parseXrayVersionOutput(commandOutput)

	if versionLine != "Xray 26.1.13 (Xray, Penetrates Everything.) Custom (go1.24.0 linux/amd64)" {
		t.Fatalf("expected first version line to be returned, got %q", versionLine)
	}
}
