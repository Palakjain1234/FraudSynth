# from motor.motor_asyncio import AsyncIOMotorClient
# from .config import MONGO_URI, DB_NAME

# client = AsyncIOMotorClient(MONGO_URI)
# db = client[DB_NAME]

# users = db["users"]
# predictions = db["predictions"]

# backend/storage.py
from .config import MONGO_URI, DB_NAME

class _NoopColl:
    async def insert_one(self, *_, **__):
        return None

class _NoopDB:
    def __getitem__(self, _): return _NoopColl()

try:
    if MONGO_URI:
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[DB_NAME]
    else:
        db = _NoopDB()
except Exception:
    db = _NoopDB()

users = db["users"]
predictions = db["predictions"]
