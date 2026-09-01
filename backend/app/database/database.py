from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI, 
    pool_pre_ping=True, 
    connect_args={"check_same_thread": False} if "sqlite" in settings.SQLALCHEMY_DATABASE_URI else {}
)

@event.listens_for(engine, "connect")
def set_database_timezone(dbapi_con, con_record):
    """
    Ensures PostgreSQL session timezone is strictly set to Asia/Kolkata (IST),
    preventing unintended UTC timezone conversions and ensuring accurate local timestamps.
    """
    if "sqlite" not in settings.SQLALCHEMY_DATABASE_URI:
        try:
            cursor = dbapi_con.cursor()
            cursor.execute("SET TIME ZONE 'Asia/Kolkata';")
            cursor.close()
        except Exception:
            pass

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
