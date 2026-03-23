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
