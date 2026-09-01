# pyrefly: ignore [missing-import]
import pytest
from app.database.database import engine, SessionLocal, Base
import app.models  # Ensure all SQLAlchemy models are imported

@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """
    Ensure all database tables exist and baseline branch is present.
    Crucial for isolated SQLite test runs and CI environments.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        from app.models.branch import Branch
        b1 = db.query(Branch).filter(Branch.id == 1).first()
        if not b1:
            b1 = Branch(id=1, name="Jaipur Main Branch", code="JPR01", address="Jaipur", is_active=True)
            db.add(b1)
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
    yield
