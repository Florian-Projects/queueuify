from datetime import datetime, timedelta

from tortoise import models, fields
from tortoise.contrib.pydantic import pydantic_model_creator


def default_session_expiration():
    return datetime.utcnow() + timedelta(hours=1)


class GroupSession(models.Model):
    token = fields.CharField(max_length=6, unique=True)
    owner = fields.OneToOneField("models.User", related_name="owned_session")
    members = fields.ManyToManyField("models.User", through="groupsession_user")
    expiration_time = fields.DatetimeField(default=default_session_expiration, null=True)


PGroupSession = pydantic_model_creator(GroupSession, name="Group")
