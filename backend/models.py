from datetime import datetime, timedelta

from tortoise import models, fields


class User(models.Model):
    external_user_id = fields.CharField(max_length=255, unique=True)
    display_name = fields.CharField(max_length=255)
    access_token = fields.CharField(max_length=255)
    refresh_token = fields.CharField(max_length=255)
    deactivated = fields.BooleanField(default=False)


class APIToken(models.Model):
    token_type = fields.CharField(max_length=255)
    token = fields.CharField(max_length=255, unique=True)
    expiration_time = fields.DatetimeField(
        default=datetime.utcnow() + timedelta(hours=1), null=True
    )
    owner = fields.ForeignKeyField("models.User")
