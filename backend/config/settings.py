from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    spotify_client_id: str
    spotify_client_secret: str
    redirect_uri: str = "http://127.0.0.1:4200/oauth_callback"

    root_path: str = ""
    db_user: str = "docker"
    db_password: str = "docker"
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_name: str = "docker"

    model_config = SettingsConfigDict(env_file=".env")


@lru_cache()
def get_settings():
    return Settings()
