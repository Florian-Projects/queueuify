from models import User
from session.models import GroupSession


async def can_create_session(user: User):
    if await user.owned_session.exists():
        return False

    if await GroupSession.filter(members=user).exists():
        return False

    return True
