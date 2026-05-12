import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import { IoChevronDown } from "react-icons/io5";

import VuiAlert from "components/VuiAlert";
import VuiBox from "components/VuiBox";
import VuiInput from "components/VuiInput";
import VuiTypography from "components/VuiTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  createInbound,
  deleteInbound,
  listInbounds,
  updateInbound,
} from "services/apiClient";
import { formatDateTime } from "utils/formatters";

const supportedProtocolOptions = [
  { value: "vless", label: "VLESS" },
  { value: "trojan", label: "Trojan" },
  { value: "vmess", label: "VMess" },
  { value: "http", label: "HTTP" },
];

const supportedTransportOptions = [
  { value: "tcp", label: "TCP" },
  { value: "ws", label: "WebSocket" },
];

const supportedSecurityOptions = [
  { value: "none", label: "None" },
  { value: "tls", label: "TLS" },
];

const fieldTextAreaStyles = {
  width: "100%",
  minHeight: "120px",
  resize: "vertical",
  background: "rgba(15, 21, 53, 0.9)",
  color: "#ffffff",
  border: "1px solid rgba(255, 255, 255, 0.18)",
  borderRadius: "16px",
  padding: "12px 14px",
  fontFamily: "inherit",
  fontSize: "14px",
  outline: "none",
};

function FieldLabel({ children }) {
  return (
    <VuiTypography variant="caption" color="text" fontWeight="regular" mb={0.75}>
      {children}
    </VuiTypography>
  );
}

function SelectField({ value, onChange, optionList }) {
  const [anchorElement, setAnchorElement] = useState(null);
  const selectedOption = optionList.find((optionItem) => optionItem.value === value);

  return (
    <>
      <VuiBox
        component="button"
        type="button"
        onClick={(event) => setAnchorElement(event.currentTarget)}
        sx={{
          width: "100%",
          minHeight: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.75,
          py: 1.25,
          background: "rgba(15, 21, 53, 0.92)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          borderRadius: "16px",
          color: "#ffffff",
          cursor: "pointer",
          transition: "all 150ms ease",
          "&:hover": {
            borderColor: "rgba(255, 255, 255, 0.32)",
            background: "rgba(15, 21, 53, 0.98)",
          },
        }}
      >
        <VuiTypography variant="button" color="white" fontWeight="regular">
          {selectedOption?.label || "Select"}
        </VuiTypography>
        <IoChevronDown size="16px" color="#ffffff" />
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

function InventoryHeader() {
  return (
    <VuiBox
      sx={{
        display: { xs: "none", md: "grid" },
        gridTemplateColumns: "1.4fr 0.8fr 0.6fr 0.8fr 1fr 1fr",
        gap: 2,
        px: 2,
        py: 1.5,
        borderRadius: "18px",
        background: "rgba(255,255,255,0.05)",
      }}
    >
      {["Name", "Protocol", "Port", "Status", "Updated", "Actions"].map((title) => (
        <VuiTypography key={title} variant="caption" color="white" fontWeight="bold">
          {title}
        </VuiTypography>
      ))}
    </VuiBox>
  );
}

function InventoryRow({ inbound, onEdit, onDelete, isSubmitting }) {
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
          gridTemplateColumns: { xs: "1fr", md: "1.4fr 0.8fr 0.6fr 0.8fr 1fr 1fr" },
          gap: 2,
          alignItems: "center",
        }}
      >
        <VuiBox>
          <VuiTypography variant="caption" color="text" display={{ xs: "block", md: "none" }}>
            Name
          </VuiTypography>
          <VuiTypography variant="button" color="white" fontWeight="bold">
            {inbound.name}
          </VuiTypography>
        </VuiBox>
        <VuiBox>
          <VuiTypography variant="caption" color="text" display={{ xs: "block", md: "none" }}>
            Protocol
          </VuiTypography>
          <VuiTypography variant="caption" color="text">
            {inbound.protocol.toUpperCase()}
          </VuiTypography>
        </VuiBox>
        <VuiBox>
          <VuiTypography variant="caption" color="text" display={{ xs: "block", md: "none" }}>
            Port
          </VuiTypography>
          <VuiTypography variant="caption" color="text">
            {inbound.listen_port}
          </VuiTypography>
        </VuiBox>
        <VuiBox>
          <VuiTypography variant="caption" color="text" display={{ xs: "block", md: "none" }}>
            Status
          </VuiTypography>
          <VuiTypography variant="caption" color={inbound.enabled ? "success" : "text"}>
            {inbound.enabled ? "Enabled" : "Disabled"}
          </VuiTypography>
        </VuiBox>
        <VuiBox>
          <VuiTypography variant="caption" color="text" display={{ xs: "block", md: "none" }}>
            Updated
          </VuiTypography>
          <VuiTypography variant="caption" color="text">
            {formatDateTime(inbound.updated_at)}
          </VuiTypography>
        </VuiBox>
        <Stack direction="row" spacing={1} justifyContent={{ xs: "flex-start", md: "flex-end" }}>
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

const defaultInboundForm = {
  id: null,
  name: "",
  protocol: "vless",
  listen_port: 8443,
  transport: "tcp",
  security: "tls",
  server_name: "",
  host: "",
  path: "",
  advanced_settings_json: "{}",
  enabled: true,
};

function buildDefaultInboundForm() {
  return {
    ...defaultInboundForm,
  };
}

function buildSettingsJsonFromInboundForm(inboundForm) {
  const settings = {};

  if (inboundForm.security === "tls") {
    settings.tlsSettings = {};
    if (inboundForm.server_name.trim()) {
      settings.tlsSettings.serverName = inboundForm.server_name.trim();
    }
  }

  if (inboundForm.transport === "ws") {
    settings.wsSettings = {
      path: inboundForm.path.trim() || "/",
      headers: {},
    };

    if (inboundForm.host.trim()) {
      settings.wsSettings.headers.Host = inboundForm.host.trim();
    }
  }

  const advancedSettingsText = inboundForm.advanced_settings_json.trim();
  if (advancedSettingsText && advancedSettingsText !== "{}") {
    const advancedSettings = JSON.parse(advancedSettingsText);
    Object.entries(advancedSettings).forEach(([settingKey, settingValue]) => {
      settings[settingKey] = settingValue;
    });
  }

  return JSON.stringify(settings);
}

function buildInboundFormFromApiResponse(inbound) {
  let parsedSettings = {};

  try {
    parsedSettings = inbound.settings_json ? JSON.parse(inbound.settings_json) : {};
  } catch {
    parsedSettings = {};
  }

  const normalizedSettings = { ...parsedSettings };
  const serverName = normalizedSettings.tlsSettings?.serverName || "";
  const host = normalizedSettings.wsSettings?.headers?.Host || "";
  const path = normalizedSettings.wsSettings?.path || "";

  delete normalizedSettings.tlsSettings;
  delete normalizedSettings.wsSettings;

  return {
    id: inbound.id,
    name: inbound.name,
    protocol: inbound.protocol,
    listen_port: inbound.listen_port,
    transport: inbound.transport,
    security: inbound.security,
    server_name: serverName,
    host,
    path,
    advanced_settings_json: JSON.stringify(normalizedSettings, null, 2),
    enabled: inbound.enabled,
  };
}

function Tables() {
  const [inboundList, setInboundList] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [inboundForm, setInboundForm] = useState(buildDefaultInboundForm());
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadInbounds() {
    try {
      setIsLoading(true);
      const inbounds = await listInbounds();
      setInboundList(inbounds);
    } catch (error) {
      setErrorMessage(error.message || "Unable to load inbounds.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadInbounds();
  }, []);

  const isEditingInbound = useMemo(() => Boolean(inboundForm.id), [inboundForm.id]);
  const filteredInboundList = useMemo(() => {
    const normalizedKeyword = searchKeyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return inboundList;
    }

    return inboundList.filter((inbound) => {
      const searchableText = [
        inbound.name,
        inbound.protocol,
        String(inbound.listen_port),
        inbound.enabled ? "enabled active bật" : "disabled inactive tắt",
      ]
        .join(" ")
        .toLowerCase();
      return searchableText.includes(normalizedKeyword);
    });
  }, [inboundList, searchKeyword]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const inboundPayload = {
        name: inboundForm.name,
        protocol: inboundForm.protocol,
        listen_port: Number(inboundForm.listen_port),
        transport: inboundForm.transport,
        security: inboundForm.security,
        settings_json: buildSettingsJsonFromInboundForm(inboundForm),
        enabled: inboundForm.enabled,
      };

      if (isEditingInbound) {
        await updateInbound(inboundForm.id, inboundPayload);
        setSuccessMessage("Inbound updated successfully.");
      } else {
        await createInbound(inboundPayload);
        setSuccessMessage("Inbound created successfully.");
      }

      setInboundForm(buildDefaultInboundForm());
      await loadInbounds();
    } catch (error) {
      setErrorMessage(error.message || "Unable to save inbound.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(inboundId) {
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await deleteInbound(inboundId);
      if (inboundForm.id === inboundId) {
        setInboundForm(buildDefaultInboundForm());
      }
      await loadInbounds();
      setSuccessMessage("Inbound deleted successfully.");
    } catch (error) {
      setErrorMessage(error.message || "Unable to delete inbound.");
    }
  }

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <VuiBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} xl={4}>
            <Card sx={{ p: 3 }}>
              <VuiTypography variant="lg" color="white" fontWeight="bold" mb={2}>
                {isEditingInbound ? "Edit Inbound" : "Create Inbound"}
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
              <VuiBox component="form" onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <VuiBox>
                    <FieldLabel>Name</FieldLabel>
                    <VuiInput
                      value={inboundForm.name}
                      placeholder="Main inbound"
                      onChange={(event) =>
                        setInboundForm({ ...inboundForm, name: event.target.value })
                      }
                    />
                  </VuiBox>
                  <VuiBox>
                    <FieldLabel>Protocol</FieldLabel>
                    <SelectField
                      value={inboundForm.protocol}
                      onChange={(event) =>
                        setInboundForm({ ...inboundForm, protocol: event.target.value })
                      }
                      optionList={supportedProtocolOptions}
                    />
                  </VuiBox>
                  <VuiBox>
                    <FieldLabel>Listen Port</FieldLabel>
                    <VuiInput
                      type="number"
                      value={inboundForm.listen_port}
                      onChange={(event) =>
                        setInboundForm({
                          ...inboundForm,
                          listen_port: Number(event.target.value),
                        })
                      }
                    />
                  </VuiBox>
                  <VuiBox>
                    <FieldLabel>Transport</FieldLabel>
                    <SelectField
                      value={inboundForm.transport}
                      onChange={(event) =>
                        setInboundForm({
                          ...inboundForm,
                          transport: event.target.value,
                          path: event.target.value === "ws" ? inboundForm.path || "/" : "",
                          host: event.target.value === "ws" ? inboundForm.host : "",
                        })
                      }
                      optionList={supportedTransportOptions}
                    />
                  </VuiBox>
                  <VuiBox>
                    <FieldLabel>Security</FieldLabel>
                    <SelectField
                      value={inboundForm.security}
                      onChange={(event) =>
                        setInboundForm({
                          ...inboundForm,
                          security: event.target.value,
                          server_name: event.target.value === "tls" ? inboundForm.server_name : "",
                        })
                      }
                      optionList={supportedSecurityOptions}
                    />
                  </VuiBox>
                  {inboundForm.security === "tls" ? (
                    <VuiBox>
                      <FieldLabel>TLS Server Name</FieldLabel>
                      <VuiInput
                        value={inboundForm.server_name}
                        placeholder="vpn.example.com"
                        onChange={(event) =>
                          setInboundForm({ ...inboundForm, server_name: event.target.value })
                        }
                      />
                    </VuiBox>
                  ) : null}
                  {inboundForm.transport === "ws" ? (
                    <>
                      <VuiBox>
                        <FieldLabel>WebSocket Path</FieldLabel>
                        <VuiInput
                          value={inboundForm.path}
                          placeholder="/ray"
                          onChange={(event) =>
                            setInboundForm({ ...inboundForm, path: event.target.value })
                          }
                        />
                      </VuiBox>
                      <VuiBox>
                        <FieldLabel>WebSocket Host</FieldLabel>
                        <VuiInput
                          value={inboundForm.host}
                          placeholder="cdn.example.com"
                          onChange={(event) =>
                            setInboundForm({ ...inboundForm, host: event.target.value })
                          }
                        />
                      </VuiBox>
                    </>
                  ) : null}
                  <VuiBox>
                    <FieldLabel>Advanced JSON</FieldLabel>
                    <VuiBox
                      component="textarea"
                      value={inboundForm.advanced_settings_json}
                      onChange={(event) =>
                        setInboundForm({
                          ...inboundForm,
                          advanced_settings_json: event.target.value,
                        })
                      }
                      sx={fieldTextAreaStyles}
                    />
                    <VuiTypography variant="caption" color="text" fontWeight="regular" mt={0.5}>
                      Optional. Most users can leave this as {"{}"}.
                    </VuiTypography>
                  </VuiBox>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Switch
                      checked={inboundForm.enabled}
                      onChange={(event) =>
                        setInboundForm({ ...inboundForm, enabled: event.target.checked })
                      }
                    />
                    <VuiTypography variant="button" color="white">
                      Enabled
                    </VuiTypography>
                  </Stack>
                  <Stack direction="row" spacing={2}>
                    <Button variant="contained" type="submit" disabled={isSubmitting}>
                      {isSubmitting
                        ? "Saving..."
                        : isEditingInbound
                          ? "Update Inbound"
                          : "Create Inbound"}
                    </Button>
                    <Button
                      variant="outlined"
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setInboundForm(buildDefaultInboundForm());
                        setErrorMessage("");
                        setSuccessMessage("");
                      }}
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
                Inbound Inventory
              </VuiTypography>
              <VuiBox mb={2}>
                <VuiInput
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="Tìm inbound theo name, protocol, port, status..."
                />
              </VuiBox>
              {isLoading ? <LinearProgress sx={{ mb: 2 }} /> : null}
              <InventoryHeader />
              {!inboundList.length ? (
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
                    No inbounds created yet.
                  </VuiTypography>
                </VuiBox>
              ) : null}
              {inboundList.length > 0 && !filteredInboundList.length ? (
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
                    Không có inbound khớp từ khóa.
                  </VuiTypography>
                </VuiBox>
              ) : null}
              {filteredInboundList.map((inbound) => (
                <InventoryRow
                  key={inbound.id}
                  inbound={inbound}
                  isSubmitting={isSubmitting}
                  onEdit={() => setInboundForm(buildInboundFormFromApiResponse(inbound))}
                  onDelete={() => handleDelete(inbound.id)}
                />
              ))}
            </Card>
          </Grid>
        </Grid>
      </VuiBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Tables;
