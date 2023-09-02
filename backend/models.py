from datetime import datetime, timedelta

from tortoise import models, fields


class User(models.Model):
    external_user_id = fields.CharField(max_length=255, unique=True)
    display_name = fields.CharField(max_length=255)
    access_token = fields.CharField(max_length=255)
    refresh_token = fields.CharField(max_length=255)
    deactivated = fields.BooleanField(default=False)

    @property
    def get_session_token(self):
        return self.apitokens.filter(is_session_token=True).first()


class APIToken(models.Model):
    token = fields.CharField(max_length=512, unique=True)
    owner = fields.ForeignKeyField("models.User")

    is_api_token = fields.BooleanField(default=False)
    is_session_token = fields.BooleanField(default=False)

    expiration_time = fields.DatetimeField(
        default=datetime.utcnow() + timedelta(hours=1), null=True
    )

    class Meta:
        # there should only be one session token per user
        unique_together = ("owner", "is_session_token")
