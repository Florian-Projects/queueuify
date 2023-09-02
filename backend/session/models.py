from datetime import datetime, timedelta

from tortoise import models, fields
from tortoise.contrib.pydantic import pydantic_model_creator


class GroupSession(models.Model):
    token = fields.CharField(max_length=6, unique=True)
    owner = fields.OneToOneField("models.User", related_name="owned_session")
    members = fields.ManyToManyField("models.User")
    expiration_time = fields.DatetimeField(
        default=datetime.utcnow() + timedelta(hours=1), null=True
    )


PGroupSession = pydantic_model_creator(GroupSession, name="Group")
