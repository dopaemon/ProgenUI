from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    app_name: str = "ProgenUI Backend"
    database_url: str = Field(default="sqlite:///./data/progenui.db", alias="DATABASE_URL")
    jwt_secret: str = Field(default="change-me", alias="JWT_SECRET")
    jwt_algorithm: str = "HS256"
    jwt_access_minutes: int = Field(default=30, alias="JWT_ACCESS_MINUTES")
    jwt_refresh_minutes: int = Field(default=60 * 24 * 7, alias="JWT_REFRESH_MINUTES")
    bridge_grpc_target: str = Field(default="bridge:50051", alias="BRIDGE_GRPC_TARGET")
    admin_username: str = Field(default="admin", alias="ADMIN_USERNAME")
    admin_password: str = Field(default="admin123", alias="ADMIN_PASSWORD")
    cors_origins: str = Field(default="http://localhost,http://localhost:3000", alias="CORS_ORIGINS")
    disable_background_poller: bool = Field(default=False, alias="DISABLE_BACKGROUND_POLLER")
    poll_interval_seconds: int = 30


settings = Settings()
