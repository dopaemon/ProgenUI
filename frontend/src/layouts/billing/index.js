import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";

import VuiAlert from "components/VuiAlert";
import VuiBox from "components/VuiBox";
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

const defaultClientForm = {
  id: null,
  inbound_id: "",
  email: "",
  uuid: "",
  traffic_limit_bytes: 0,
  expiry_at: "",
  enabled: true,
};

function createConfigurationLink(client, inbound) {
  if (!inbound) {
    return "";
  }

  const hostname = window.location.hostname || "localhost";
  const protocol = inbound.protocol.toLowerCase() === "trojan" ? "trojan" : "vless";

  if (protocol === "trojan") {
    return `trojan://${client.uuid}@${hostname}:${inbound.listen_port}#${encodeURIComponent(
      client.email
    )}`;
  }

  return `vless://${client.uuid}@${hostname}:${inbound.listen_port}?type=${inbound.transport}&security=${inbound.security}#${encodeURIComponent(
    client.email
  )}`;
}

function Billing() {
  const [clientList, setClientList] = useState([]);
  const [inboundList, setInboundList] = useState([]);
  const [clientForm, setClientForm] = useState(defaultClientForm);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const inboundNameById = useMemo(
    () => Object.fromEntries(inboundList.map((inbound) => [inbound.id, inbound.name])),
    [inboundList]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    const clientPayload = {
      inbound_id: Number(clientForm.inbound_id),
      email: clientForm.email,
      uuid: clientForm.uuid,
      traffic_limit_bytes: Number(clientForm.traffic_limit_bytes),
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

      setClientForm({
        ...defaultClientForm,
        inbound_id: inboundList[0]?.id || "",
      });
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
        setClientForm({
          ...defaultClientForm,
          inbound_id: inboundList[0]?.id || "",
        });
      }
      await loadPageData();
      setSuccessMessage("Client deleted successfully.");
    } catch (error) {
      setErrorMessage(error.message || "Unable to delete client.");
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
              <VuiBox component="form" onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <TextField
                    select
                    label="Inbound"
                    value={clientForm.inbound_id}
                    onChange={(event) =>
                      setClientForm({ ...clientForm, inbound_id: event.target.value })
                    }
                  >
                    {inboundList.map((inbound) => (
                      <MenuItem key={inbound.id} value={inbound.id}>
                        {inbound.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Email"
                    value={clientForm.email}
                    onChange={(event) =>
                      setClientForm({ ...clientForm, email: event.target.value })
                    }
                  />
                  <TextField
                    label="UUID"
                    value={clientForm.uuid}
                    onChange={(event) =>
                      setClientForm({ ...clientForm, uuid: event.target.value })
                    }
                  />
                  <TextField
                    label="Traffic Limit Bytes"
                    type="number"
                    value={clientForm.traffic_limit_bytes}
                    onChange={(event) =>
                      setClientForm({
                        ...clientForm,
                        traffic_limit_bytes: Number(event.target.value),
                      })
                    }
                  />
                  <TextField
                    label="Expiry"
                    type="datetime-local"
                    InputLabelProps={{ shrink: true }}
                    value={clientForm.expiry_at}
                    onChange={(event) =>
                      setClientForm({ ...clientForm, expiry_at: event.target.value })
                    }
                  />
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Switch
                      checked={clientForm.enabled}
                      onChange={(event) =>
                        setClientForm({ ...clientForm, enabled: event.target.checked })
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
                        : isEditingClient
                          ? "Update Client"
                          : "Create Client"}
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={isSubmitting}
                      onClick={() =>
                        setClientForm({
                          ...defaultClientForm,
                          inbound_id: inboundList[0]?.id || "",
                        })
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
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Email</TableCell>
                      <TableCell>Inbound</TableCell>
                      <TableCell>Used</TableCell>
                      <TableCell>Limit</TableCell>
                      <TableCell>Expiry</TableCell>
                      <TableCell>Configuration</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {!clientList.length ? (
                      <TableRow>
                        <TableCell colSpan={7}>No clients created yet.</TableCell>
                      </TableRow>
                    ) : null}
                    {clientList.map((client) => {
                      const inbound = inboundList.find(
                        (currentInbound) => currentInbound.id === client.inbound_id
                      );

                      return (
                        <TableRow key={client.id}>
                          <TableCell>{client.email}</TableCell>
                          <TableCell>{inboundNameById[client.inbound_id] || client.inbound_id}</TableCell>
                          <TableCell>{formatBytes(client.used_bytes)}</TableCell>
                          <TableCell>{formatBytes(client.traffic_limit_bytes)}</TableCell>
                          <TableCell>{formatDateTime(client.expiry_at)}</TableCell>
                          <TableCell sx={{ maxWidth: 280, wordBreak: "break-word" }}>
                            {createConfigurationLink(client, inbound)}
                          </TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Button
                                variant="outlined"
                                onClick={() =>
                                  setClientForm({
                                    id: client.id,
                                    inbound_id: client.inbound_id,
                                    email: client.email,
                                    uuid: client.uuid,
                                    traffic_limit_bytes: client.traffic_limit_bytes,
                                    expiry_at: client.expiry_at
                                      ? new Date(client.expiry_at).toISOString().slice(0, 16)
                                      : "",
                                    enabled: client.enabled,
                                  })
                                }
                              >
                                Edit
                              </Button>
                              <Button
                                color="error"
                                variant="outlined"
                                disabled={isSubmitting}
                                onClick={() => handleDelete(client.id)}
                              >
                                Delete
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </Grid>
        </Grid>
      </VuiBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Billing;
