import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import { QRCodeSVG } from "qrcode.react";
import { IoChevronDown, IoCopyOutline, IoQrCodeOutline, IoShareSocialOutline } from "react-icons/io5";

import VuiAlert from "components/VuiAlert";
import VuiBox from "components/VuiBox";
import VuiInput from "components/VuiInput";
import VuiTypography from "components/VuiTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  createClient,
  deleteClient,
  listClients,
  listInbounds,
  updateClient,
} from "services/apiClient";
import { formatBytes, formatDateTime } from "utils/formatters";

const bytesPerGigabyte = 1024 * 1024 * 1024;

function FieldLabel({ children }) {
  return (
    <VuiTypography variant="caption" color="text" fontWeight="regular" mb={0.75}>
      {children}
    </VuiTypography>
  );
}

function SelectField({ value, onChange, optionList, disabled = false }) {
  const [anchorElement, setAnchorElement] = useState(null);
  const selectedOption = optionList.find((optionItem) => optionItem.value === value);

  return (
    <>
      <VuiBox
        component="button"
        type="button"
        disabled={disabled}
        onClick={(event) => {
          if (!disabled) {
            setAnchorElement(event.currentTarget);
          }
        }}
        sx={{
          width: "100%",
          minHeight: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.75,
          py: 1.25,
          color: disabled ? "rgba(255,255,255,0.45)" : "#ffffff",
          borderRadius: "16px",
          background: "rgba(15, 21, 53, 0.92)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          cursor: disabled ? "default" : "pointer",
          transition: "all 150ms ease",
          "&:hover": disabled
            ? {}
            : {
                borderColor: "rgba(255, 255, 255, 0.32)",
                background: "rgba(15, 21, 53, 0.98)",
              },
          "&:disabled": {
            opacity: 1,
          },
        }}
      >
        <VuiTypography variant="button" color={disabled ? "text" : "white"} fontWeight="regular">
          {selectedOption?.label || "Select"}
        </VuiTypography>
        <IoChevronDown size="16px" color={disabled ? "rgba(255,255,255,0.45)" : "#ffffff"} />
      </VuiBox>
      <Menu
        anchorEl={anchorElement}
        open={Boolean(anchorElement)}
        onClose={() => setAnchorElement(null)}
        disableScrollLock
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: anchorElement?.clientWidth || 220,
            background: "#0b1437",
            color: "#ffffff",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "16px",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)",
            p: 0.5,
          },
        }}
      >
        {optionList.map((optionItem) => (
          <MenuItem
            key={optionItem.value}
            selected={optionItem.value === value}
            onClick={() => {
              onChange({ target: { value: optionItem.value } });
              setAnchorElement(null);
            }}
            sx={{
              fontSize: "14px",
              borderRadius: "10px",
              margin: "4px 0",
              color: optionItem.value === value ? "#ffffff" : "#e2e8f0",
              background: optionItem.value === value ? "rgba(0, 117, 255, 0.28)" : "transparent",
              "&:hover": {
                background: "rgba(0, 117, 255, 0.18)",
              },
            }}
          >
            {optionItem.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function ClientInventoryHeader() {
  return (
    <VuiBox
      sx={{
        display: { xs: "none", md: "grid" },
        gridTemplateColumns: "1fr 0.8fr 1.1fr 0.9fr 1fr 1.5fr 1fr",
        gap: 2,
        px: 2,
        py: 1.5,
        borderRadius: "18px",
        background: "rgba(255,255,255,0.05)",
      }}
    >
      {["Email", "Inbound", "Usage", "Expiry", "Status", "Configuration", "Actions"].map((title) => (
        <VuiTypography key={title} variant="caption" color="white" fontWeight="bold">
          {title}
        </VuiTypography>
      ))}
    </VuiBox>
  );
}

function buildUsageSummary(client) {
  if (!client.traffic_limit_bytes) {
    return {
      percentUsed: 0,
      summaryLabel: `${formatBytes(client.used_bytes)} used of unlimited`,
      progressLabel: "Unlimited",
      progressColor: "#01B574",
    };
  }

  const percentUsed = Math.min(100, (client.used_bytes / client.traffic_limit_bytes) * 100);
  const remainingBytes = Math.max(0, client.traffic_limit_bytes - client.used_bytes);

  let progressColor = "#01B574";
  if (percentUsed >= 90) {
    progressColor = "#FF4D4F";
  } else if (percentUsed >= 70) {
    progressColor = "#F6AD55";
  }

  return {
    percentUsed,
    summaryLabel: `${formatBytes(client.used_bytes)} / ${formatBytes(client.traffic_limit_bytes)}`,
    progressLabel: `${formatBytes(remainingBytes)} remaining`,
    progressColor,
  };
}

function buildClientRuntimeStatus(client) {
  if (!client.enabled) {
    return {
      statusLabel: "Disabled",
      statusColor: "#A0AEC0",
      detailLabel: "Manually turned off",
    };
  }

  if (client.traffic_limit_bytes > 0 && client.used_bytes >= client.traffic_limit_bytes) {
    return {
      statusLabel: "Quota reached",
      statusColor: "#FF4D4F",
      detailLabel: "Blocked until quota is increased",
    };
  }

  if (client.expiry_at) {
    const expiryDate = new Date(client.expiry_at);
    if (expiryDate.getTime() <= Date.now()) {
      return {
        statusLabel: "Expired",
        statusColor: "#FF4D4F",
        detailLabel: "Blocked after expiry time",
      };
    }
  }

  return {
    statusLabel: "Active",
    statusColor: "#01B574",
    detailLabel: "Allowed in runtime",
  };
}

function buildExpirySummary(expiryAt) {
  if (!expiryAt) {
    return {
      statusLabel: "No expiry",
      statusColor: "#01B574",
      expiryLabel: "Never",
    };
  }

  const expiryDate = new Date(expiryAt);
  const now = new Date();
  const remainingMilliseconds = expiryDate.getTime() - now.getTime()
  const remainingDays = Math.ceil(remainingMilliseconds / (1000 * 60 * 60 * 24));

  if (remainingMilliseconds <= 0) {
    return {
      statusLabel: "Expired",
      statusColor: "#FF4D4F",
      expiryLabel: formatDateTime(expiryAt),
    };
  }

  if (remainingDays <= 3) {
    return {
      statusLabel: `${remainingDays} day${remainingDays === 1 ? "" : "s"} left`,
      statusColor: "#F6AD55",
      expiryLabel: formatDateTime(expiryAt),
    };
  }

  return {
    statusLabel: "Active",
    statusColor: "#01B574",
    expiryLabel: formatDateTime(expiryAt),
  };
}

function UsageMeter({ client }) {
  const usageSummary = buildUsageSummary(client);

  return (
    <VuiBox>
      <VuiTypography variant="button" color="white" fontWeight="regular">
        {usageSummary.summaryLabel}
      </VuiTypography>
      <VuiBox
        sx={{
          mt: 1,
          height: "8px",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <VuiBox
          sx={{
            width: client.traffic_limit_bytes ? `${usageSummary.percentUsed}%` : "24%",
            height: "100%",
            borderRadius: "999px",
            background: usageSummary.progressColor,
            transition: "width 180ms ease",
          }}
        />
      </VuiBox>
      <VuiTypography variant="caption" color="text" fontWeight="regular" mt={0.75}>
        {usageSummary.progressLabel}
      </VuiTypography>
    </VuiBox>
  );
}

function ExpiryBadge({ expiryAt }) {
  const expirySummary = buildExpirySummary(expiryAt);

  return (
    <VuiBox>
      <VuiBox
        sx={{
          display: "inline-flex",
          alignItems: "center",
          px: 1.25,
          py: 0.5,
          borderRadius: "999px",
          background: `${expirySummary.statusColor}22`,
          border: `1px solid ${expirySummary.statusColor}44`,
        }}
      >
        <VuiTypography variant="caption" sx={{ color: expirySummary.statusColor, fontWeight: 700 }}>
          {expirySummary.statusLabel}
        </VuiTypography>
      </VuiBox>
      <VuiTypography variant="caption" color="text" fontWeight="regular" mt={0.75}>
        {expirySummary.expiryLabel}
      </VuiTypography>
    </VuiBox>
  );
}

function ClientStatusBadge({ client }) {
  const runtimeStatus = buildClientRuntimeStatus(client);

  return (
    <VuiBox>
      <VuiBox
        sx={{
          display: "inline-flex",
          alignItems: "center",
          px: 1.25,
          py: 0.5,
          borderRadius: "999px",
          background: `${runtimeStatus.statusColor}22`,
          border: `1px solid ${runtimeStatus.statusColor}44`,
        }}
      >
        <VuiTypography variant="caption" sx={{ color: runtimeStatus.statusColor, fontWeight: 700 }}>
          {runtimeStatus.statusLabel}
        </VuiTypography>
      </VuiBox>
      <VuiTypography variant="caption" color="text" fontWeight="regular" mt={0.75}>
        {runtimeStatus.detailLabel}
      </VuiTypography>
    </VuiBox>
  );
}

function ConfigurationPreview({ configurationLink }) {
  if (!configurationLink) {
    return (
      <VuiTypography variant="caption" color="text">
        No configuration available
      </VuiTypography>
    );
  }

  return (
    <VuiBox>
      <VuiTypography
        variant="caption"
        color="white"
        fontWeight="regular"
        sx={{
          display: "block",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {configurationLink}
      </VuiTypography>
      <VuiTypography variant="caption" color="text" fontWeight="regular" mt={0.75}>
        Open Share to copy or scan QR code.
      </VuiTypography>
    </VuiBox>
  );
}

function ClientInventoryRow({
  client,
  inboundName,
  configurationLink,
  isSubmitting,
  onEdit,
  onDelete,
  onShare,
}) {
  return (
    <VuiBox
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: "20px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <VuiBox
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 0.8fr 1.1fr 0.9fr 1fr 1.5fr 1fr" },
          gap: 2,
          alignItems: "center",
        }}
      >
        {[
          ["Email", client.email, "white", "button"],
          ["Inbound", inboundName, "text", "caption"],
          ["Usage", null, "text", "caption"],
          ["Expiry", null, "text", "caption"],
          ["Status", null, "text", "caption"],
          ["Configuration", configurationLink, "text", "caption"],
        ].map(([label, value, color, variant]) => (
          <VuiBox key={label} sx={{ minWidth: 0 }}>
            <VuiTypography variant="caption" color="text" display={{ xs: "block", md: "none" }}>
              {label}
            </VuiTypography>
            {label === "Usage" ? <UsageMeter client={client} /> : null}
            {label === "Expiry" ? <ExpiryBadge expiryAt={client.expiry_at} /> : null}
            {label === "Status" ? <ClientStatusBadge client={client} /> : null}
            {label === "Configuration" ? (
              <ConfigurationPreview configurationLink={configurationLink} />
            ) : null}
            {label !== "Usage" && label !== "Expiry" && label !== "Status" && label !== "Configuration" ? (
              <VuiTypography
                variant={variant}
                color={color}
                fontWeight={label === "Email" ? "bold" : "regular"}
                sx={label === "Configuration" ? { wordBreak: "break-word" } : undefined}
              >
                {value}
              </VuiTypography>
            ) : null}
          </VuiBox>
        ))}
        <Stack direction="row" spacing={1} justifyContent={{ xs: "flex-start", md: "flex-end" }}>
          <Button variant="outlined" onClick={onShare} startIcon={<IoQrCodeOutline />}>
            Share
          </Button>
          <Button variant="outlined" onClick={onEdit}>
            Edit
          </Button>
          <Button color="error" variant="outlined" disabled={isSubmitting} onClick={onDelete}>
            Delete
          </Button>
        </Stack>
      </VuiBox>
    </VuiBox>
  );
}

const defaultClientForm = {
  id: null,
  inbound_id: "",
  email: "",
  uuid: generateClientIdentifier(),
  traffic_limit_gigabytes: 0,
  expiry_at: "",
  enabled: true,
};

function generateClientIdentifier() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildDefaultClientForm(firstInboundId = "") {
  return {
    ...defaultClientForm,
    inbound_id: firstInboundId,
    uuid: generateClientIdentifier(),
  };
}

function readInboundSettings(inbound) {
  if (!inbound?.settings_json) {
    return {};
  }

  try {
    return JSON.parse(inbound.settings_json);
  } catch {
    return {};
  }
}

function createConfigurationLink(client, inbound) {
  if (!inbound) {
    return "";
  }

  const hostname = window.location.hostname || "localhost";
  const protocol = (inbound.protocol || "").toLowerCase();
  const inboundSettings = readInboundSettings(inbound);
  const websocketPath = inboundSettings.wsSettings?.path || "/";
  const websocketHost = inboundSettings.wsSettings?.headers?.Host || "";
  const tlsServerName = inboundSettings.tlsSettings?.serverName || "";

  if (protocol === "trojan") {
    return `trojan://${client.uuid}@${hostname}:${inbound.listen_port}#${encodeURIComponent(
      client.email
    )}`;
  }

  if (protocol === "vmess") {
    const vmessPayload = {
      v: "2",
      ps: client.email,
      add: hostname,
      port: String(inbound.listen_port),
      id: client.uuid,
      aid: "0",
      scy: "auto",
      net: inbound.transport || "tcp",
      type: "none",
      host: websocketHost,
      path: inbound.transport === "ws" ? websocketPath : "",
      tls: inbound.security === "tls" ? "tls" : "",
      sni: tlsServerName,
    };
    return `vmess://${window.btoa(JSON.stringify(vmessPayload))}`;
  }

  if (protocol === "http") {
    return "";
  }

  const searchParameters = new URLSearchParams({
    type: inbound.transport,
    security: inbound.security,
  });

  if (inbound.transport === "ws") {
    searchParameters.set("path", websocketPath);
  }
  if (websocketHost) {
    searchParameters.set("host", websocketHost);
  }
  if (tlsServerName) {
    searchParameters.set("sni", tlsServerName);
  }

  return `vless://${client.uuid}@${hostname}:${inbound.listen_port}?${searchParameters.toString()}#${encodeURIComponent(
    client.email
  )}`;
}

function buildShareState(client, inbound) {
  return {
    clientId: client.id,
    clientEmail: client.email,
    inboundName: inbound?.name || String(client.inbound_id),
    configurationLink: createConfigurationLink(client, inbound),
  };
}

function Billing() {
  const [clientList, setClientList] = useState([]);
  const [inboundList, setInboundList] = useState([]);
  const [clientForm, setClientForm] = useState(buildDefaultClientForm());
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shareState, setShareState] = useState(null);

  async function loadPageData() {
    try {
      setIsLoading(true);
      const [clients, inbounds] = await Promise.all([listClients(), listInbounds()]);
      setClientList(clients);
      setInboundList(inbounds);
      setClientForm((currentForm) => ({
        ...currentForm,
        inbound_id: currentForm.inbound_id || inbounds[0]?.id || "",
      }));
    } catch (error) {
      setErrorMessage(error.message || "Unable to load clients.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const isEditingClient = useMemo(() => Boolean(clientForm.id), [clientForm.id]);
  const hasAvailableInbound = inboundList.length > 0;
  const inboundNameById = useMemo(
    () => Object.fromEntries(inboundList.map((inbound) => [inbound.id, inbound.name])),
    [inboundList]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!hasAvailableInbound) {
      setErrorMessage("Create an inbound before creating clients.");
      return;
    }

    setIsSubmitting(true);

    const clientPayload = {
      inbound_id: Number(clientForm.inbound_id),
      email: clientForm.email,
      uuid: clientForm.uuid,
      traffic_limit_bytes: Math.round(Number(clientForm.traffic_limit_gigabytes) * bytesPerGigabyte),
      expiry_at: clientForm.expiry_at ? new Date(clientForm.expiry_at).toISOString() : null,
      enabled: clientForm.enabled,
    };

    try {
      if (isEditingClient) {
        await updateClient(clientForm.id, clientPayload);
        setSuccessMessage("Client updated successfully.");
      } else {
        await createClient(clientPayload);
        setSuccessMessage("Client created successfully.");
      }

      setClientForm(buildDefaultClientForm(inboundList[0]?.id || ""));
      await loadPageData();
    } catch (error) {
      setErrorMessage(error.message || "Unable to save client.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(clientId) {
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await deleteClient(clientId);
      if (clientForm.id === clientId) {
        setClientForm(buildDefaultClientForm(inboundList[0]?.id || ""));
      }
      await loadPageData();
      setSuccessMessage("Client deleted successfully.");
    } catch (error) {
      setErrorMessage(error.message || "Unable to delete client.");
    }
  }

  async function handleCopyConfiguration(configurationLink) {
    if (!configurationLink) {
      setErrorMessage("No configuration available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(configurationLink);
      setSuccessMessage("Configuration link copied.");
      setErrorMessage("");
    } catch {
      setErrorMessage("Unable to copy configuration link.");
    }
  }

  async function handleShareConfiguration(sharePayload) {
    if (!sharePayload?.configurationLink) {
      setErrorMessage("No configuration available to share.");
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: `ProgenUI Access for ${sharePayload.clientEmail}`,
          text: `Inbound: ${sharePayload.inboundName}`,
          url: sharePayload.configurationLink,
        });
        setSuccessMessage("Configuration shared.");
        setErrorMessage("");
        return;
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }
      }
    }

    await handleCopyConfiguration(sharePayload.configurationLink);
  }

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <VuiBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} xl={4}>
            <Card sx={{ p: 3 }}>
              <VuiTypography variant="lg" color="white" fontWeight="bold" mb={2}>
                {isEditingClient ? "Edit Client" : "Create Client"}
              </VuiTypography>
              {errorMessage ? (
                <VuiBox mb={2}>
                  <VuiAlert color="error">{errorMessage}</VuiAlert>
                </VuiBox>
              ) : null}
              {successMessage ? (
                <VuiBox mb={2}>
                  <VuiAlert color="success">{successMessage}</VuiAlert>
                </VuiBox>
              ) : null}
              {isLoading ? <LinearProgress sx={{ mb: 2 }} /> : null}
              {!isLoading && !hasAvailableInbound ? (
                <VuiBox mb={2}>
                  <VuiAlert color="warning">
                    Create at least one inbound before adding clients.
                  </VuiAlert>
                </VuiBox>
              ) : null}
              <VuiBox component="form" onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <VuiBox>
                    <FieldLabel>Inbound</FieldLabel>
                    <SelectField
                      value={clientForm.inbound_id}
                      onChange={(event) =>
                        setClientForm({ ...clientForm, inbound_id: event.target.value })
                      }
                      optionList={inboundList.map((inbound) => ({
                        value: inbound.id,
                        label: inbound.name,
                      }))}
                      disabled={!hasAvailableInbound}
                    />
                  </VuiBox>
                  <VuiBox>
                    <FieldLabel>Email</FieldLabel>
                    <VuiInput
                      value={clientForm.email}
                      placeholder="user@example.com"
                      disabled={!hasAvailableInbound}
                      onChange={(event) =>
                        setClientForm({ ...clientForm, email: event.target.value })
                      }
                    />
                  </VuiBox>
                  <VuiBox>
                    <FieldLabel>UUID</FieldLabel>
                    <VuiInput
                      value={clientForm.uuid}
                      disabled={!hasAvailableInbound}
                      onChange={(event) =>
                        setClientForm({ ...clientForm, uuid: event.target.value })
                      }
                    />
                  </VuiBox>
                  <Button
                    variant="outlined"
                    type="button"
                    disabled={!hasAvailableInbound}
                    onClick={() =>
                      setClientForm({ ...clientForm, uuid: generateClientIdentifier() })
                    }
                  >
                    Generate New UUID
                  </Button>
                  <VuiBox>
                    <FieldLabel>Traffic Limit (GB)</FieldLabel>
                    <VuiInput
                      type="number"
                      value={clientForm.traffic_limit_gigabytes}
                      disabled={!hasAvailableInbound}
                      onChange={(event) =>
                        setClientForm({
                          ...clientForm,
                          traffic_limit_gigabytes: Number(event.target.value),
                        })
                      }
                    />
                    <VuiTypography variant="caption" color="text" fontWeight="regular" mt={0.5}>
                      Use 0 for unlimited traffic.
                    </VuiTypography>
                  </VuiBox>
                  <VuiBox>
                    <FieldLabel>Expiry</FieldLabel>
                    <VuiInput
                      type="datetime-local"
                      value={clientForm.expiry_at}
                      disabled={!hasAvailableInbound}
                      onChange={(event) =>
                        setClientForm({ ...clientForm, expiry_at: event.target.value })
                      }
                    />
                  </VuiBox>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Switch
                      checked={clientForm.enabled}
                      disabled={!hasAvailableInbound}
                      onChange={(event) =>
                        setClientForm({ ...clientForm, enabled: event.target.checked })
                      }
                    />
                    <VuiTypography variant="button" color="white">
                      Enabled
                    </VuiTypography>
                  </Stack>
                  <Stack direction="row" spacing={2}>
                    <Button
                      variant="contained"
                      type="submit"
                      disabled={isSubmitting || !hasAvailableInbound}
                    >
                      {isSubmitting
                        ? "Saving..."
                        : isEditingClient
                          ? "Update Client"
                          : "Create Client"}
                    </Button>
                    <Button
                      variant="outlined"
                      type="button"
                      disabled={isSubmitting}
                      onClick={() =>
                        setClientForm(buildDefaultClientForm(inboundList[0]?.id || ""))
                      }
                    >
                      Reset
                    </Button>
                  </Stack>
                </Stack>
              </VuiBox>
            </Card>
          </Grid>
          <Grid item xs={12} xl={8}>
            <Card sx={{ p: 3 }}>
              <VuiTypography variant="lg" color="white" fontWeight="bold" mb={2}>
                Client Inventory
              </VuiTypography>
              {isLoading ? <LinearProgress sx={{ mb: 2 }} /> : null}
              <ClientInventoryHeader />
              {!clientList.length ? (
                <VuiBox
                  sx={{
                    mt: 1.5,
                    p: 3,
                    borderRadius: "20px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <VuiTypography variant="button" color="text">
                    No clients created yet.
                  </VuiTypography>
                </VuiBox>
              ) : null}
              {clientList.map((client) => {
                const inbound = inboundList.find(
                  (currentInbound) => currentInbound.id === client.inbound_id
                );

                return (
                  <ClientInventoryRow
                    key={client.id}
                    client={client}
                    inboundName={inboundNameById[client.inbound_id] || client.inbound_id}
                    configurationLink={createConfigurationLink(client, inbound)}
                    isSubmitting={isSubmitting}
                    onShare={() => setShareState(buildShareState(client, inbound))}
                    onEdit={() =>
                      setClientForm({
                        id: client.id,
                        inbound_id: client.inbound_id,
                        email: client.email,
                        uuid: client.uuid,
                        traffic_limit_gigabytes: Number(
                          (client.traffic_limit_bytes / bytesPerGigabyte).toFixed(2)
                        ),
                        expiry_at: client.expiry_at
                          ? new Date(client.expiry_at).toISOString().slice(0, 16)
                          : "",
                        enabled: client.enabled,
                      })
                    }
                    onDelete={() => handleDelete(client.id)}
                  />
                );
              })}
            </Card>
          </Grid>
        </Grid>
        <Dialog
          open={Boolean(shareState)}
          onClose={() => setShareState(null)}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: {
              background: "#0b1437",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "24px",
            },
          }}
        >
          <DialogContent sx={{ p: 3 }}>
            <VuiTypography variant="h5" color="white" fontWeight="bold">
              Share Access
            </VuiTypography>
            <VuiTypography variant="button" color="text" fontWeight="regular">
              Copy the link, scan the QR code, or use the native share sheet.
            </VuiTypography>
            <VuiBox
              sx={{
                mt: 3,
                p: 2,
                borderRadius: "20px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <VuiTypography variant="caption" color="text">
                Client
              </VuiTypography>
              <VuiTypography variant="button" color="white" fontWeight="bold">
                {shareState?.clientEmail || "Unknown client"}
              </VuiTypography>
              <VuiTypography variant="caption" color="text" mt={1.5}>
                Inbound
              </VuiTypography>
              <VuiTypography variant="button" color="white" fontWeight="regular">
                {shareState?.inboundName || "Unknown inbound"}
              </VuiTypography>
            </VuiBox>
            <VuiBox
              sx={{
                mt: 3,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <VuiBox
                sx={{
                  p: 2,
                  borderRadius: "24px",
                  background: "#ffffff",
                  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
                }}
              >
                {shareState?.configurationLink ? (
                  <QRCodeSVG value={shareState.configurationLink} size={220} includeMargin />
                ) : null}
              </VuiBox>
            </VuiBox>
            <VuiBox
              sx={{
                mt: 3,
                p: 2,
                borderRadius: "20px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <VuiTypography variant="caption" color="text">
                Configuration link
              </VuiTypography>
              <VuiTypography
                variant="caption"
                color="white"
                fontWeight="regular"
                sx={{ display: "block", mt: 1, wordBreak: "break-all" }}
              >
                {shareState?.configurationLink || "No configuration available"}
              </VuiTypography>
            </VuiBox>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3, pt: 0 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} width="100%">
              <Button
                variant="outlined"
                fullWidth
                startIcon={<IoCopyOutline />}
                onClick={() => handleCopyConfiguration(shareState?.configurationLink)}
              >
                Copy Link
              </Button>
              <Button
                variant="outlined"
                fullWidth
                startIcon={<IoShareSocialOutline />}
                onClick={() => handleShareConfiguration(shareState)}
              >
                Share
              </Button>
              <Button variant="contained" fullWidth onClick={() => setShareState(null)}>
                Close
              </Button>
            </Stack>
          </DialogActions>
        </Dialog>
      </VuiBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Billing;
