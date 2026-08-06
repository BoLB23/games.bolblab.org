from datetime import datetime

from pydantic import BaseModel


class PresenceResponse(BaseModel):
    online: bool
    last_seen_at: datetime
