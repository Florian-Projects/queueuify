from pydantic import BaseModel


class UserDetailResponse(BaseModel):
    id: str
    display_name: str
