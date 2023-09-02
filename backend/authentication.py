import binascii
from datetime import datetime

from pytz import UTC
from starlette.authentication import (
    AuthenticationBackend,
    AuthCredentials,
    AuthenticationError,
)
from starlette.requests import HTTPConnection

from models import APIToken

utc = UTC


class BearerAuthBackend(AuthenticationBackend):
    # for some reason when starlet is calling the function
    # it does so from a class object instead of an initialized class
    @classmethod
    async def authenticate(cls, conn: HTTPConnection):
        if "Authorization" not in conn.headers:
            return

        auth = conn.headers["Authorization"]
        try:
            scheme, token = auth.split()
            if scheme.lower() != "bearer":
                return

            if db_token := await APIToken.filter(token=token).first():
                if (
                    db_token.expiration_time is None
                    or db_token.expiration_time > datetime.now(utc)
                ):
                    user = await db_token.owner
                    return AuthCredentials(["authenticated"]), user
                else:
                    await db_token.delete()
            return

        except (ValueError, UnicodeDecodeError, binascii.Error) as exc:
            raise AuthenticationError("Invalid basic auth credentials")
