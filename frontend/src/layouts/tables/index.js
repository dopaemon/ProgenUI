import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
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
  createInbound,
  deleteInbound,
  listInbounds,
  updateInbound,
} from "services/apiClient";
import { formatDateTime } from "utils/formatters";

const defaultInboundForm = {
  id: null,
  name: "",
  protocol: "vless",
  listen_port: 8443,
  transport: "tcp",
  security: "tls",
  settings_json: "{}",
  enabled: true,
};

function Tables() {
  const [inboundList, setInboundList] = useState([]);
  const [inboundForm, setInboundForm] = useState(defaultInboundForm);
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

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    const inboundPayload = {
      name: inboundForm.name,
      protocol: inboundForm.protocol,
      listen_port: Number(inboundForm.listen_port),
      transport: inboundForm.transport,
      security: inboundForm.security,
      settings_json: inboundForm.settings_json,
      enabled: inboundForm.enabled,
    };

    try {
      if (isEditingInbound) {
        await updateInbound(inboundForm.id, inboundPayload);
        setSuccessMessage("Inbound updated successfully.");
      } else {
        await createInbound(inboundPayload);
        setSuccessMessage("Inbound created successfully.");
      }

      setInboundForm(defaultInboundForm);
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
        setInboundForm(defaultInboundForm);
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
                  <TextField
                    label="Name"
                    value={inboundForm.name}
                    onChange={(event) =>
                      setInboundForm({ ...inboundForm, name: event.target.value })
                    }
                  />
                  <TextField
                    label="Protocol"
                    value={inboundForm.protocol}
                    onChange={(event) =>
                      setInboundForm({ ...inboundForm, protocol: event.target.value })
                    }
                  />
                  <TextField
                    label="Listen Port"
                    type="number"
                    value={inboundForm.listen_port}
                    onChange={(event) =>
                      setInboundForm({
                        ...inboundForm,
                        listen_port: Number(event.target.value),
                      })
                    }
                  />
                  <TextField
                    label="Transport"
                    value={inboundForm.transport}
                    onChange={(event) =>
                      setInboundForm({ ...inboundForm, transport: event.target.value })
                    }
                  />
                  <TextField
                    label="Security"
                    value={inboundForm.security}
                    onChange={(event) =>
                      setInboundForm({ ...inboundForm, security: event.target.value })
                    }
                  />
                  <TextField
                    label="Settings JSON"
                    multiline
                    minRows={4}
                    value={inboundForm.settings_json}
                    onChange={(event) =>
                      setInboundForm({ ...inboundForm, settings_json: event.target.value })
                    }
                  />
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
                      disabled={isSubmitting}
                      onClick={() => {
                        setInboundForm(defaultInboundForm);
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
              {isLoading ? <LinearProgress sx={{ mb: 2 }} /> : null}
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Protocol</TableCell>
                      <TableCell>Port</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Updated</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {!inboundList.length ? (
                      <TableRow>
                        <TableCell colSpan={6}>No inbounds created yet.</TableCell>
                      </TableRow>
                    ) : null}
                    {inboundList.map((inbound) => (
                      <TableRow key={inbound.id}>
                        <TableCell>{inbound.name}</TableCell>
                        <TableCell>{inbound.protocol}</TableCell>
                        <TableCell>{inbound.listen_port}</TableCell>
                        <TableCell>{inbound.enabled ? "Enabled" : "Disabled"}</TableCell>
                        <TableCell>{formatDateTime(inbound.updated_at)}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button variant="outlined" onClick={() => setInboundForm({ ...inbound })}>
                              Edit
                            </Button>
                            <Button
                              color="error"
                              variant="outlined"
                              disabled={isSubmitting}
                              onClick={() => handleDelete(inbound.id)}
                            >
                              Delete
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
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

export default Tables;
