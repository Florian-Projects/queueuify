from models import User
from session.models import GroupSession


async def get_active_session(user: User):
    if owned_session := await user.owned_session:
        return owned_session

    return await GroupSession.filter(members=user).first()


async def can_create_session(user: User):
    if await get_active_session(user):
        return False

    return True
