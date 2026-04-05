from datetime import datetime, timedelta
from enum import StrEnum
from typing import Optional

from pydantic import BaseModel, Field
from tortoise import fields, models
from tortoise.contrib.pydantic import pydantic_model_creator

from spotify_connector.models import SpotifyTrack


def default_session_expiration():
    return datetime.utcnow() + timedelta(hours=1)


class SessionType(StrEnum):
    HOST_ONLY = "host_only"
    EVERYONE = "everyone"


class PlaybackBackend(StrEnum):
    SPOTIFY_HOST = "spotify_host"


class SessionPlaybackSyncState(StrEnum):
    SYNCED = "synced"
    READY = "ready"
    OUT_OF_SYNC = "out_of_sync"
    NO_ACTIVE_DEVICE = "no_active_device"
    RESTRICTED_DEVICE = "restricted_device"
    NO_SPOTIFY_SESSION = "no_spotify_session"
    ANONYMOUS_USER = "anonymous_user"
    PLAYBACK_ERROR = "playback_error"


class QueueItemStatus(StrEnum):
    PENDING_SYNC = "pending_sync"
    SYNC_BLOCKED = "sync_blocked"
    SENT_TO_PROVIDER = "sent_to_provider"
    PLAYING = "playing"
    PLAYED = "played"
    REMOVED = "removed"
    SYNC_FAILED = "sync_failed"


class MemberModerationAction(StrEnum):
    KICK = "kick"
    BAN = "ban"
    UNBAN = "unban"
    TIMEOUT = "timeout"
    UNMUTE = "unmute"


class GroupSession(models.Model):
    token = fields.CharField(max_length=6, unique=True)
    owner = fields.OneToOneField("models.User", related_name="owned_session")
    members = fields.ManyToManyField("models.User", through="groupsession_user")
    expiration_time = fields.DatetimeField(default=default_session_expiration, null=True)


class GroupSessionSettings(models.Model):
    session = fields.OneToOneField(
        "models.GroupSession",
        related_name="settings",
        on_delete=fields.CASCADE,
    )
    session_type = fields.CharEnumField(
        SessionType,
        default=SessionType.HOST_ONLY,
        max_length=32,
    )
    playback_backend = fields.CharEnumField(
        PlaybackBackend,
        default=PlaybackBackend.SPOTIFY_HOST,
        max_length=32,
    )
    disallow_anonymous_users = fields.BooleanField(default=False)
    explicit_filter = fields.BooleanField(default=False)


class SessionQueueItem(models.Model):
    session = fields.ForeignKeyField(
        "models.GroupSession",
        related_name="queue_items",
        on_delete=fields.CASCADE,
    )
    submitted_by = fields.ForeignKeyField(
        "models.User",
        related_name="submitted_queue_items",
        null=True,
        on_delete=fields.SET_NULL,
    )
    spotify_track_id = fields.CharField(max_length=255, null=True)
    spotify_track_uri = fields.CharField(max_length=255)
    name = fields.CharField(max_length=512)
    artists_json = fields.JSONField(default=list)
    album_art_url = fields.CharField(max_length=1024, null=True)
    duration_ms = fields.IntField(null=True)
    status = fields.CharEnumField(
        QueueItemStatus,
        default=QueueItemStatus.PENDING_SYNC,
        max_length=32,
    )
    provider_dispatch_state = fields.CharField(max_length=64, default="pending")
    last_error = fields.TextField(null=True)
    submitted_at = fields.DatetimeField(auto_now_add=True)
    sent_to_provider_at = fields.DatetimeField(null=True)
    played_at = fields.DatetimeField(null=True)
    removed_at = fields.DatetimeField(null=True)


class SessionMemberModeration(models.Model):
    session = fields.ForeignKeyField(
        "models.GroupSession",
        related_name="member_moderations",
        on_delete=fields.CASCADE,
    )
    user = fields.ForeignKeyField(
        "models.User",
        related_name="session_moderations",
        on_delete=fields.CASCADE,
    )
    is_banned = fields.BooleanField(default=False)
    banned_at = fields.DatetimeField(null=True)
    banned_by = fields.ForeignKeyField(
        "models.User",
        related_name="issued_bans",
        null=True,
        on_delete=fields.SET_NULL,
    )
    timeout_until = fields.DatetimeField(null=True)
    timeout_set_at = fields.DatetimeField(null=True)
    timeout_set_by = fields.ForeignKeyField(
        "models.User",
        related_name="issued_timeouts",
        null=True,
        on_delete=fields.SET_NULL,
    )

    class Meta:
        unique_together = ("session", "user")


PGroupSession = pydantic_model_creator(GroupSession, name="Group")


class SessionSummaryResponse(BaseModel):
    id: int
    token: str
    expiration_time: Optional[datetime] = None
    is_owner: bool
    session_type: SessionType
    playback_backend: PlaybackBackend
    disallow_anonymous_users: bool
    explicit_filter: bool


class SessionPlaybackTargetStatusResponse(BaseModel):
    user_id: int
    display_name: str
    auth_mode: str
    is_host: bool
    eligible_for_everyone_playback: bool
    device_available: bool
    device_is_restricted: bool
    is_playing: bool
    sync_state: SessionPlaybackSyncState
    status_message: str


class EveryonePlaybackStatusResponse(BaseModel):
    ready_member_count: int
    unsynced_member_count: int
    eligible_member_count: int
    can_start_everyone_playback: bool
    status_message: str


class SessionSettingsResponse(BaseModel):
    session_type: SessionType
    playback_backend: PlaybackBackend
    disallow_anonymous_users: bool
    explicit_filter: bool
    everyone_playback_status: EveryonePlaybackStatusResponse
    member_sync_status: list[SessionPlaybackTargetStatusResponse] = Field(
        default_factory=list
    )


class SessionSettingsUpdateRequest(BaseModel):
    session_type: Optional[SessionType] = None
    disallow_anonymous_users: Optional[bool] = None
    explicit_filter: Optional[bool] = None


class QueueCapabilitiesResponse(BaseModel):
    can_add_to_queue: bool
    can_play_now: bool
    can_remove_queued_items: bool
    can_control_playback: bool


class QueuePlaybackStatusResponse(BaseModel):
    backend: PlaybackBackend
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    device_available: bool
    device_is_restricted: bool
    is_playing: bool
    context_uri: Optional[str] = None
    progress_ms: Optional[int] = None
    dispatch_block_reason: Optional[str] = None


class QueueTrackProjectionResponse(BaseModel):
    source: str
    queue_item_id: Optional[int] = None
    track: SpotifyTrack


class QueueItemResponse(BaseModel):
    id: int
    status: QueueItemStatus
    provider_dispatch_state: str
    submitted_by: Optional[str] = None
    submitted_at: datetime
    can_remove: bool
    can_play_now: bool
    track: SpotifyTrack


class SessionQueueProjectionResponse(BaseModel):
    now_playing: Optional[QueueTrackProjectionResponse] = None
    playback_status: QueuePlaybackStatusResponse
    capabilities: QueueCapabilitiesResponse
    queue_items: list[QueueItemResponse] = Field(default_factory=list)
    external_items: list[QueueTrackProjectionResponse] = Field(default_factory=list)


class QueueTrackArtistRequest(BaseModel):
    name: str
    uri: Optional[str] = None


class QueueTrackAlbumImageRequest(BaseModel):
    url: str


class QueueTrackAlbumRequest(BaseModel):
    images: list[QueueTrackAlbumImageRequest] = Field(default_factory=list)


class QueueTrackRequest(BaseModel):
    id: Optional[str] = None
    uri: str
    name: str
    artists: list[QueueTrackArtistRequest] = Field(default_factory=list)
    album: Optional[QueueTrackAlbumRequest] = None
    duration_ms: Optional[int] = None
    explicit: Optional[bool] = None


class SessionMemberResponse(BaseModel):
    id: int
    display_name: str
    auth_mode: str
    is_guest: bool
    is_active_member: bool
    is_banned: bool
    is_timed_out: bool
    timeout_until: Optional[datetime] = None
    timeout_remaining_seconds: Optional[int] = None
    can_kick: bool
    can_ban: bool
    can_timeout: bool
    can_unban: bool
    can_unmute: bool


class SessionMemberTimeoutRequest(BaseModel):
    duration_minutes: int
