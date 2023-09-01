from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    spotify_client_id: str
    spotify_client_secret: str
    redirect_uri: str = "http://127.0.0.1:8000/oauth_callback"

    model_config = SettingsConfigDict(env_file=".env")
