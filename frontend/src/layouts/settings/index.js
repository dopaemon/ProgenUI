import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";

import VuiAlert from "components/VuiAlert";
import VuiBox from "components/VuiBox";
import VuiButton from "components/VuiButton";
import VuiInput from "components/VuiInput";
import VuiTypography from "components/VuiTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useAuthentication } from "context/authentication";
import { changePassword, changeUsername, getAccountProfile } from "services/apiClient";

function FieldLabel({ children }) {
  return (
    <VuiTypography variant="caption" color="text" fontWeight="regular" mb={0.75}>
      {children}
    </VuiTypography>
  );
}

function Settings() {
  const { refreshAuthenticationState, signOut } = useAuthentication();
  const [searchKeyword, setSearchKeyword] = useState("");
  const [username, setUsername] = useState("");
  const [accountErrorMessage, setAccountErrorMessage] = useState("");
  const [accountSuccessMessage, setAccountSuccessMessage] = useState("");
  const [passwordErrorMessage, setPasswordErrorMessage] = useState("");
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [currentPasswordForUsername, setCurrentPasswordForUsername] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [isChangingUsername, setIsChangingUsername] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const isPasswordConfirmationMismatch = useMemo(
    () => Boolean(confirmNewPassword) && newPassword !== confirmNewPassword,
    [confirmNewPassword, newPassword]
  );
  const isUsernameUnchanged = useMemo(
    () => newUsername.trim() === username,
    [newUsername, username]
  );
  const canSubmitUsernameChange = useMemo(
    () =>
      !isLoading &&
      !isChangingUsername &&
      Boolean(currentPasswordForUsername) &&
      Boolean(newUsername.trim()) &&
      !isUsernameUnchanged,
    [currentPasswordForUsername, isChangingUsername, isLoading, isUsernameUnchanged, newUsername]
  );
  const canSubmitPasswordChange = useMemo(
    () =>
      !isChangingPassword &&
      Boolean(currentPassword) &&
      Boolean(newPassword) &&
      newPassword.length >= 8 &&
      !isPasswordConfirmationMismatch,
    [currentPassword, isChangingPassword, isPasswordConfirmationMismatch, newPassword]
  );
  const normalizedSearchKeyword = useMemo(() => searchKeyword.trim().toLowerCase(), [searchKeyword]);
  const shouldShowAccountSection = useMemo(
    () =>
      !normalizedSearchKeyword ||
      "tài khoản account đăng xuất username".includes(normalizedSearchKeyword),
    [normalizedSearchKeyword]
  );
  const shouldShowChangeUsernameSection = useMemo(
    () =>
      !normalizedSearchKeyword ||
      "đổi tài khoản đổi username change account".includes(normalizedSearchKeyword),
    [normalizedSearchKeyword]
  );
  const shouldShowPasswordSection = useMemo(
    () =>
      !normalizedSearchKeyword || "mật khẩu password đổi mật khẩu".includes(normalizedSearchKeyword),
    [normalizedSearchKeyword]
  );
  const hasSearchResults =
    shouldShowAccountSection || shouldShowChangeUsernameSection || shouldShowPasswordSection;

  useEffect(() => {
    let isMounted = true;

    async function loadAccount() {
      try {
        const accountProfile = await getAccountProfile();
        if (!isMounted) {
          return;
        }
        setUsername(accountProfile.username || "");
        setNewUsername(accountProfile.username || "");
      } catch (error) {
        if (isMounted) {
          setAccountErrorMessage(error.message || "Không thể tải thông tin tài khoản.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadAccount();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!accountSuccessMessage && !passwordSuccessMessage) {
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      setAccountSuccessMessage("");
      setPasswordSuccessMessage("");
    }, 3000);
    return () => window.clearTimeout(timerId);
  }, [accountSuccessMessage, passwordSuccessMessage]);

  const handleUsernameChange = useCallback(async (event) => {
    event.preventDefault();
    setAccountErrorMessage("");
    setAccountSuccessMessage("");

    if (!newUsername.trim()) {
      setAccountErrorMessage("Tài khoản mới không được để trống.");
      return;
    }

    if (newUsername.trim() === username) {
      setAccountErrorMessage("Tài khoản mới phải khác tài khoản hiện tại.");
      return;
    }

    setIsChangingUsername(true);
    try {
      await changeUsername(currentPasswordForUsername, newUsername.trim());
      refreshAuthenticationState();
      setUsername(newUsername.trim());
      setCurrentPasswordForUsername("");
      setAccountSuccessMessage("Đã cập nhật tài khoản.");
    } catch (error) {
      setAccountErrorMessage(error.message || "Không thể đổi tài khoản.");
    } finally {
      setIsChangingUsername(false);
    }
  }, [currentPasswordForUsername, newUsername, refreshAuthenticationState, username]);

  const handlePasswordChange = useCallback(async (event) => {
    event.preventDefault();
    setPasswordErrorMessage("");
    setPasswordSuccessMessage("");

    if (newPassword !== confirmNewPassword) {
      setPasswordErrorMessage("Xác nhận mật khẩu mới không khớp.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordErrorMessage("Mật khẩu mới phải từ 8 ký tự trở lên.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordSuccessMessage("Đã cập nhật mật khẩu.");
    } catch (error) {
      setPasswordErrorMessage(error.message || "Không thể đổi mật khẩu.");
    } finally {
      setIsChangingPassword(false);
    }
  }, [confirmNewPassword, currentPassword, newPassword]);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <VuiBox mt={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <VuiBox p={3}>
                <VuiTypography variant="h5" color="white" fontWeight="bold" mb={0.5}>
                  Cài đặt
                </VuiTypography>
                <VuiTypography variant="button" color="text" fontWeight="regular">
                  Quản lý tài khoản quản trị và mật khẩu.
                </VuiTypography>
                <VuiBox mt={2}>
                  <FieldLabel>Tìm kiếm chức năng</FieldLabel>
                  <VuiInput
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder="Ví dụ: tài khoản, mật khẩu..."
                  />
                </VuiBox>
              </VuiBox>
            </Card>
          </Grid>

          {shouldShowAccountSection ? (
          <Grid item xs={12} md={6}>
            <Card sx={{ height: "100%" }}>
              <VuiBox p={3}>
                <VuiTypography variant="h6" color="white" fontWeight="bold" mb={2}>
                  Tài khoản
                </VuiTypography>
                <FieldLabel>Tên tài khoản hiện tại</FieldLabel>
                <VuiTypography variant="button" color="white" fontWeight="regular">
                  {isLoading ? "Đang tải..." : username || "-"}
                </VuiTypography>
                <VuiBox mt={2}>
                  <VuiButton color="error" variant="outlined" onClick={signOut}>
                    Đăng xuất
                  </VuiButton>
                </VuiBox>
              </VuiBox>
            </Card>
          </Grid>
          ) : null}

          {shouldShowChangeUsernameSection ? (
          <Grid item xs={12} md={6}>
            <Card sx={{ height: "100%" }}>
              <VuiBox p={3} component="form" onSubmit={handleUsernameChange}>
                <VuiTypography variant="h6" color="white" fontWeight="bold" mb={2}>
                  Đổi tài khoản
                </VuiTypography>
                <FieldLabel>Tài khoản mới</FieldLabel>
                <VuiInput
                  value={newUsername}
                  onChange={(event) => setNewUsername(event.target.value)}
                  onBlur={() => setNewUsername((previousUsername) => previousUsername.trim())}
                  placeholder="Nhập tài khoản mới"
                  autoComplete="username"
                />
                <VuiBox mt={2}>
                  <FieldLabel>Mật khẩu hiện tại</FieldLabel>
                  <VuiInput
                    type="password"
                    value={currentPasswordForUsername}
                    onChange={(event) => setCurrentPasswordForUsername(event.target.value)}
                    placeholder="Nhập mật khẩu hiện tại"
                    autoComplete="current-password"
                  />
                </VuiBox>
                <VuiBox mt={2.5}>
                  <VuiButton
                    color="info"
                    type="submit"
                    disabled={!canSubmitUsernameChange}
                    fullWidth
                  >
                    {isChangingUsername ? "Đang cập nhật..." : "Đổi tài khoản"}
                  </VuiButton>
                </VuiBox>
                {accountErrorMessage ? (
                  <VuiBox mt={2}>
                    <VuiAlert color="error">{accountErrorMessage}</VuiAlert>
                  </VuiBox>
                ) : null}
                {accountSuccessMessage ? (
                  <VuiBox mt={2}>
                    <VuiAlert color="success">{accountSuccessMessage}</VuiAlert>
                  </VuiBox>
                ) : null}
              </VuiBox>
            </Card>
          </Grid>
          ) : null}

          {shouldShowPasswordSection ? (
          <Grid item xs={12}>
            <Card>
              <VuiBox p={3} component="form" onSubmit={handlePasswordChange}>
                <VuiTypography variant="h6" color="white" fontWeight="bold" mb={2}>
                  Mật khẩu
                </VuiTypography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <FieldLabel>Mật khẩu hiện tại</FieldLabel>
                    <VuiInput
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      placeholder="Nhập mật khẩu hiện tại"
                      autoComplete="current-password"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FieldLabel>Mật khẩu mới</FieldLabel>
                    <VuiInput
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Tối thiểu 8 ký tự"
                      autoComplete="new-password"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FieldLabel>Xác nhận mật khẩu mới</FieldLabel>
                    <VuiInput
                      type="password"
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                      placeholder="Nhập lại mật khẩu mới"
                      autoComplete="new-password"
                    />
                    {isPasswordConfirmationMismatch ? (
                      <VuiTypography variant="caption" color="error" fontWeight="regular" mt={0.75}>
                        Mật khẩu xác nhận chưa khớp.
                      </VuiTypography>
                    ) : null}
                  </Grid>
                </Grid>
                <VuiBox mt={2.5}>
                  <VuiButton color="info" type="submit" disabled={!canSubmitPasswordChange}>
                    {isChangingPassword ? "Đang đổi mật khẩu..." : "Đổi mật khẩu"}
                  </VuiButton>
                </VuiBox>
                {passwordErrorMessage ? (
                  <VuiBox mt={2}>
                    <VuiAlert color="error">{passwordErrorMessage}</VuiAlert>
                  </VuiBox>
                ) : null}
                {passwordSuccessMessage ? (
                  <VuiBox mt={2}>
                    <VuiAlert color="success">{passwordSuccessMessage}</VuiAlert>
                  </VuiBox>
                ) : null}
              </VuiBox>
            </Card>
          </Grid>
          ) : null}
          {!hasSearchResults ? (
            <Grid item xs={12}>
              <Card>
                <VuiBox p={3}>
                  <VuiAlert color="warning">
                    Không tìm thấy mục phù hợp với từ khóa &quot;{searchKeyword}&quot;.
                  </VuiAlert>
                </VuiBox>
              </Card>
            </Grid>
          ) : null}
        </Grid>
      </VuiBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Settings;
