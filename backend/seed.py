import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.database import SessionLocal
from app.models.user import User, RoleEnum
from app.core.security import get_password_hash

def seed_admin():
    db = SessionLocal()
    admin_email = "admin@medicalstore.com"
    existing_admin = db.query(User).filter(User.email == admin_email).first()
    
    if not existing_admin:
        admin_user = User(
            email=admin_email,
            hashed_password=get_password_hash("admin123"),
            full_name="Store Admin",
            role=RoleEnum.ADMIN,
            is_active=True
        )
        db.add(admin_user)
        db.commit()
        print("Admin user created: admin@medicalstore.com / admin123")
    else:
        print("Admin user already exists.")
    
    db.close()

if __name__ == "__main__":
    seed_admin()
