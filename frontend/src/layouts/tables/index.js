import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";

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

  async function loadInbounds() {
    try {
      const inbounds = await listInbounds();
      setInboundList(inbounds);
    } catch (error) {
      setErrorMessage(error.message || "Unable to load inbounds.");
    }
  }

  useEffect(() => {
    loadInbounds();
  }, []);

  const isEditingInbound = useMemo(() => Boolean(inboundForm.id), [inboundForm.id]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

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
      } else {
        await createInbound(inboundPayload);
      }

      setInboundForm(defaultInboundForm);
      await loadInbounds();
    } catch (error) {
      setErrorMessage(error.message || "Unable to save inbound.");
    }
  }

  async function handleDelete(inboundId) {
    try {
      await deleteInbound(inboundId);
      if (inboundForm.id === inboundId) {
        setInboundForm(defaultInboundForm);
      }
      await loadInbounds();
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
                  {errorMessage ? (
                    <VuiTypography variant="caption" color="error">
                      {errorMessage}
                    </VuiTypography>
                  ) : null}
                  <Stack direction="row" spacing={2}>
                    <Button variant="contained" type="submit">
                      {isEditingInbound ? "Update Inbound" : "Create Inbound"}
                    </Button>
                    <Button variant="outlined" onClick={() => setInboundForm(defaultInboundForm)}>
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
