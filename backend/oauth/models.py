from pydantic import BaseModel


class AuthorizationResponsse(BaseModel):
    code: str
    state: str
