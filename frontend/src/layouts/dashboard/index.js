import { useEffect, useMemo, useState } from "react";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import MiniStatisticsCard from "examples/Cards/StatisticsCards/MiniStatisticsCard";
import LineChart from "examples/Charts/LineCharts/LineChart";
import VuiAlert from "components/VuiAlert";
import VuiBox from "components/VuiBox";
import VuiTypography from "components/VuiTypography";
import { IoBuild, IoCloudOffline, IoPeople, IoPulse } from "react-icons/io5";

import {
  getDashboardSummary,
  getSystemHealth,
  getTrafficHistory,
} from "services/apiClient";
import { formatBytes, formatDateTime, formatDuration, formatPercent } from "utils/formatters";

function buildStatsSourceSummary(statsSource, xrayApiReachable, lastStatsError) {
  if (statsSource === "xray_api" && xrayApiReachable) {
    return {
      label: "Xray API",
      color: "#01B574",
      detail: "Using real traffic counters from Xray.",
    };
  }

  return {
    label: "Mock",
    color: "#F6AD55",
    detail: lastStatsError || "Real traffic is unavailable, so dashboard numbers are simulated.",
  };
}

function SystemMetricCard({ title, value, detail }) {
  return (
    <Card>
      <VuiBox p={3}>
        <VuiTypography variant="button" color="text">
          {title}
        </VuiTypography>
        <VuiTypography variant="h5" color="white" fontWeight="bold" mt={0.5}>
          {value}
        </VuiTypography>
        <VuiTypography variant="caption" color="text" fontWeight="regular" mt={0.75}>
          {detail}
        </VuiTypography>
      </VuiBox>
    </Card>
  );
}

function CPUUsageCard({ systemHealth }) {
  const cpuCoreUsagePercentList = systemHealth?.cpu_core_usage_percent || [];

  return (
    <Card sx={{ height: "100%" }}>
      <VuiBox p={3}>
        <VuiTypography variant="button" color="text">
          CPU usage
        </VuiTypography>
        <VuiTypography variant="h5" color="white" fontWeight="bold" mt={0.5}>
          {formatPercent(systemHealth?.cpu_usage_percent)}
        </VuiTypography>
        <VuiTypography variant="caption" color="text" fontWeight="regular" mt={0.75}>
          {systemHealth?.cpu_core_count || 0} cores
        </VuiTypography>
        <VuiBox
          sx={{
            mt: 2.5,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: 1.5,
          }}
        >
          {cpuCoreUsagePercentList.map((coreUsagePercent, coreIndex) => (
            <VuiBox key={`cpu-core-${coreIndex}`}>
              <VuiBox display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                <VuiTypography variant="caption" color="text">
                  Core {coreIndex + 1}
                </VuiTypography>
                <VuiTypography variant="caption" color="white" fontWeight="bold">
                  {formatPercent(coreUsagePercent)}
                </VuiTypography>
              </VuiBox>
              <LinearProgress
                variant="determinate"
                value={Math.max(0, Math.min(100, Number(coreUsagePercent) || 0))}
                sx={{
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 999,
                    background: "linear-gradient(90deg, #0075FF 0%, #01B574 100%)",
                  },
                }}
              />
            </VuiBox>
          ))}
        </VuiBox>
      </VuiBox>
    </Card>
  );
}

function Dashboard() {
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [trafficHistory, setTrafficHistory] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        const [summaryResponse, historyResponse, healthResponse] = await Promise.all([
          getDashboardSummary(),
          getTrafficHistory(),
          getSystemHealth(),
        ]);

        if (!isMounted) {
          return;
        }

        setDashboardSummary(summaryResponse);
        setTrafficHistory(historyResponse);
        setSystemHealth(healthResponse);
        setErrorMessage("");
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error.message || "Unable to load dashboard.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDashboardData();
    const refreshInterval = window.setInterval(() => {
      loadDashboardData();
    }, 30000);

    const websocketProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const websocketConnection = new WebSocket(
      `${websocketProtocol}://${window.location.host}/ws/dashboard`
    );

    websocketConnection.onmessage = (event) => {
      const dashboardEvent = JSON.parse(event.data);
      if (dashboardEvent.type === "dashboard") {
        setDashboardSummary(dashboardEvent.summary);
        setTrafficHistory(dashboardEvent.traffic);
      }
    };

    return () => {
      isMounted = false;
      window.clearInterval(refreshInterval);
      websocketConnection.close();
    };
  }, []);

  const hasTrafficSamples = trafficHistory.length > 0;
  const lineChartSeries = useMemo(
    () => [
      {
        name: "Uplink",
        data: trafficHistory.map((point) => point.uplink_bytes),
      },
      {
        name: "Downlink",
        data: trafficHistory.map((point) => point.downlink_bytes),
      },
    ],
    [trafficHistory]
  );

  const lineChartOptions = useMemo(
    () => ({
      chart: {
        toolbar: { show: false },
      },
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 3 },
      xaxis: {
        categories: trafficHistory.map((point) =>
          new Date(point.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        ),
        labels: { style: { colors: "#A0AEC0" } },
      },
      yaxis: {
        labels: {
          style: { colors: "#A0AEC0" },
          formatter: (value) => formatBytes(value),
        },
      },
      tooltip: {
        theme: "dark",
        y: {
          formatter: (value) => formatBytes(value),
        },
      },
      legend: {
        labels: { colors: "#FFFFFF" },
      },
      grid: {
        borderColor: "#2D3748",
      },
      noData: {
        text: "No traffic samples yet",
        align: "center",
        verticalAlign: "middle",
        style: {
          color: "#A0AEC0",
        },
      },
    }),
    [trafficHistory]
  );

  const statsSourceSummary = useMemo(
    () =>
      buildStatsSourceSummary(
        systemHealth?.stats_source,
        systemHealth?.xray_api_reachable,
        systemHealth?.last_stats_error
      ),
    [systemHealth]
  );

  const systemMetricCardList = useMemo(
    () => [
      {
        title: "Memory",
        value: `${formatBytes(systemHealth?.memory_used_bytes || 0)} / ${formatBytes(
          systemHealth?.memory_total_bytes || 0
        )}`,
        detail: formatPercent(systemHealth?.memory_used_percent),
      },
      {
        title: "Disk",
        value: `${formatBytes(systemHealth?.disk_used_bytes || 0)} / ${formatBytes(
          systemHealth?.disk_total_bytes || 0
        )}`,
        detail: formatPercent(systemHealth?.disk_used_percent),
      },
      {
        title: "System load",
        value: `${systemHealth?.load_average_1m ?? 0} / ${systemHealth?.load_average_5m ?? 0}`,
        detail: `15m ${systemHealth?.load_average_15m ?? 0}`,
      },
      {
        title: "Uptime",
        value: formatDuration(systemHealth?.system_uptime_seconds || 0),
        detail: "Host runtime",
      },
      {
        title: "ZRAM",
        value: systemHealth?.zram_enabled
          ? `${formatBytes(systemHealth?.zram_used_bytes || 0)} / ${formatBytes(
              systemHealth?.zram_total_bytes || 0
            )}`
          : "Unavailable",
        detail: systemHealth?.zram_enabled
          ? `${systemHealth?.zram_device_count || 0} device(s)`
          : "Not enabled on this host",
      },
    ],
    [systemHealth]
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <VuiBox py={3}>
        <VuiBox mb={3}>
          <VuiTypography variant="h4" color="white" fontWeight="bold">
            ProgenUI Dashboard
          </VuiTypography>
          <VuiTypography variant="button" color="text">
            Live traffic, node health, and control plane overview.
          </VuiTypography>
          {errorMessage ? (
            <VuiBox mt={2}>
              <VuiAlert color="error">{errorMessage}</VuiAlert>
            </VuiBox>
          ) : null}
          {isLoading ? <LinearProgress sx={{ mt: 2 }} /> : null}
        </VuiBox>
        <VuiBox mb={3}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6} xl={3}>
              <MiniStatisticsCard
                title={{ text: "total inbounds", fontWeight: "regular" }}
                count={dashboardSummary?.total_inbounds || 0}
                percentage={{ color: "success", text: "configured" }}
                icon={{ color: "info", component: <IoBuild size="22px" color="white" /> }}
              />
            </Grid>
            <Grid item xs={12} md={6} xl={3}>
              <MiniStatisticsCard
                title={{ text: "total clients" }}
                count={dashboardSummary?.total_clients || 0}
                percentage={{ color: "success", text: "registered" }}
                icon={{ color: "info", component: <IoPeople size="22px" color="white" /> }}
              />
            </Grid>
            <Grid item xs={12} md={6} xl={3}>
              <MiniStatisticsCard
                title={{ text: "active clients" }}
                count={dashboardSummary?.active_clients || 0}
                percentage={{ color: "success", text: "enabled now" }}
                icon={{ color: "info", component: <IoPulse size="22px" color="white" /> }}
              />
            </Grid>
            <Grid item xs={12} md={6} xl={3}>
              <MiniStatisticsCard
                title={{ text: "node status" }}
                count={systemHealth?.xray_running ? "Running" : "Stopped"}
                percentage={{
                  color: systemHealth?.xray_running ? "success" : "error",
                  text: "xray",
                }}
                icon={{ color: "info", component: <IoCloudOffline size="20px" color="white" /> }}
              />
            </Grid>
          </Grid>
        </VuiBox>
        <VuiBox mb={3}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Card>
                <VuiBox p={3} sx={{ height: "100%" }}>
                  <VuiTypography variant="lg" color="white" fontWeight="bold" mb="5px">
                    Traffic History
                  </VuiTypography>
                  <VuiBox display="flex" alignItems="center" mb="20px">
                    <VuiTypography variant="button" color="text" fontWeight="regular">
                      Polled from bridge stats and streamed by WebSocket.
                    </VuiTypography>
                  </VuiBox>
                  {!hasTrafficSamples ? (
                    <VuiBox mb={2}>
                      <VuiAlert color="info">No traffic samples have been recorded yet.</VuiAlert>
                    </VuiBox>
                  ) : null}
                  <VuiBox sx={{ height: "310px" }}>
                    <LineChart
                      lineChartData={lineChartSeries}
                      lineChartOptions={lineChartOptions}
                    />
                  </VuiBox>
                </VuiBox>
              </Card>
            </Grid>
          </Grid>
        </VuiBox>
        <VuiBox mb={3}>
          <Grid container spacing={3}>
            <Grid item xs={12} xl={7}>
              <Card>
                <VuiBox p={3}>
                  <VuiTypography variant="lg" color="white" fontWeight="bold" mb="5px">
                    Node Health
                  </VuiTypography>
                  <Stack spacing={2} mt={3}>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Xray process
                      </VuiTypography>
                      <VuiTypography variant="h5" color="white" fontWeight="bold">
                        {systemHealth?.xray_running ? "Running" : "Stopped"}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Runtime mode
                      </VuiTypography>
                      <VuiTypography variant="h5" color="white" fontWeight="bold">
                        {systemHealth?.runtime_mode || "unknown"}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Xray binary
                      </VuiTypography>
                      <VuiTypography variant="h5" color="white" fontWeight="bold">
                        {systemHealth?.binary_detected ? "Detected" : "Missing"}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Xray API
                      </VuiTypography>
                      <VuiTypography variant="h5" color="white" fontWeight="bold">
                        {systemHealth?.xray_api_reachable ? "Reachable" : "Unavailable"}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        API port
                      </VuiTypography>
                      <VuiTypography variant="h5" color="white" fontWeight="bold">
                        {systemHealth?.api_port || "Unknown"}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Stats source
                      </VuiTypography>
                      <VuiBox
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          px: 1.25,
                          py: 0.5,
                          mt: 1,
                          borderRadius: "999px",
                          background: `${statsSourceSummary.color}22`,
                          border: `1px solid ${statsSourceSummary.color}44`,
                        }}
                      >
                        <VuiTypography
                          variant="caption"
                          sx={{ color: statsSourceSummary.color, fontWeight: 700 }}
                        >
                          {statsSourceSummary.label}
                        </VuiTypography>
                      </VuiBox>
                      <VuiTypography variant="caption" color="text" fontWeight="regular" mt={0.75}>
                        {statsSourceSummary.detail}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Runtime inbounds
                      </VuiTypography>
                      <VuiTypography variant="h5" color="white" fontWeight="bold">
                        {systemHealth?.inbound_count || 0}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Runtime active clients
                      </VuiTypography>
                      <VuiTypography variant="h5" color="white" fontWeight="bold">
                        {systemHealth?.active_client_count || 0}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Xray version
                      </VuiTypography>
                      <VuiTypography variant="caption" color="white" fontWeight="regular">
                        {systemHealth?.xray_version || "Unavailable"}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Binary path
                      </VuiTypography>
                      <VuiTypography variant="caption" color="white" fontWeight="regular">
                        {systemHealth?.binary_path || "Unavailable"}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Last traffic sample
                      </VuiTypography>
                      <VuiTypography variant="caption" color="white" fontWeight="regular">
                        {trafficHistory.length
                          ? formatDateTime(trafficHistory[trafficHistory.length - 1].timestamp)
                          : "No samples yet"}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Last health check
                      </VuiTypography>
                      <VuiTypography variant="caption" color="white" fontWeight="regular">
                        {systemHealth?.last_health_check_at
                          ? formatDateTime(systemHealth.last_health_check_at)
                          : "No check yet"}
                      </VuiTypography>
                    </Card>
                    <Card sx={{ p: 2 }}>
                      <VuiTypography variant="button" color="text">
                        Last stats sync
                      </VuiTypography>
                      <VuiTypography variant="caption" color="white" fontWeight="regular">
                        {systemHealth?.last_stats_sync_at
                          ? formatDateTime(systemHealth.last_stats_sync_at)
                          : "No sync yet"}
                      </VuiTypography>
                    </Card>
                    {systemHealth?.last_stats_error ? (
                      <Card sx={{ p: 2 }}>
                        <VuiTypography variant="button" color="text">
                          Last stats error
                        </VuiTypography>
                        <VuiTypography variant="caption" color="warning" fontWeight="regular">
                          {systemHealth.last_stats_error}
                        </VuiTypography>
                      </Card>
                    ) : null}
                    {systemHealth?.last_error ? (
                      <Card sx={{ p: 2 }}>
                        <VuiTypography variant="button" color="text">
                          Last bridge error
                        </VuiTypography>
                        <VuiTypography variant="caption" color="error" fontWeight="regular">
                          {systemHealth.last_error}
                        </VuiTypography>
                      </Card>
                    ) : null}
                  </Stack>
                </VuiBox>
              </Card>
            </Grid>
            <Grid item xs={12} xl={5}>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <CPUUsageCard systemHealth={systemHealth} />
                </Grid>
                {systemMetricCardList.map((metricCard) => (
                  <Grid key={metricCard.title} item xs={12} md={6}>
                    <SystemMetricCard
                      title={metricCard.title}
                      value={metricCard.value}
                      detail={metricCard.detail}
                    />
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </VuiBox>
      </VuiBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Dashboard;
