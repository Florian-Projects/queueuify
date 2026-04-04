from datetime import datetime, timedelta
from enum import StrEnum

from pydantic import BaseModel
from tortoise import models, fields


class UserAuthMode(StrEnum):
    SPOTIFY = "spotify"
    ANONYMOUS = "anonymous"


def default_api_token_expiration():
    return datetime.utcnow() + timedelta(hours=24)


class User(models.Model):
    auth_mode = fields.CharEnumField(
        UserAuthMode,
        default=UserAuthMode.ANONYMOUS,
        max_length=32,
    )
    external_user_id = fields.CharField(max_length=255, unique=True, null=True)
    display_name = fields.CharField(max_length=255)
    access_token = fields.CharField(max_length=255, null=True)
    refresh_token = fields.CharField(max_length=255, null=True)
    deactivated = fields.BooleanField(default=False)

    groupsessions = fields.ReverseRelation["GroupSession"]

    @property
    def get_session_token(self):
        return self.apitokens.filter(is_session_token=True).first()

    @property
    def can_host_sessions(self) -> bool:
        return self.auth_mode == UserAuthMode.SPOTIFY

    @property
    def is_anonymous(self) -> bool:
        return self.auth_mode == UserAuthMode.ANONYMOUS


class APIToken(models.Model):
    token = fields.CharField(max_length=512, unique=True)
    owner = fields.ForeignKeyField("models.User")

    is_api_token = fields.BooleanField(default=False)
    is_session_token = fields.BooleanField(default=False)

    expiration_time = fields.DatetimeField(
        default=default_api_token_expiration, null=True
    )

    class Meta:
        # there should only be one session token per user
        unique_together = ("owner", "is_session_token")


class OAuthCodeRequest(BaseModel):
    code: str
    state: str


class CurrentUserResponse(BaseModel):
    auth_mode: UserAuthMode
    can_host_sessions: bool
    display_name: str


class SessionTokenResponse(CurrentUserResponse):
    api_token: str
