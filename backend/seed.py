import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.database import SessionLocal
from app.models.user import User, RoleEnum
from app.core.security import get_password_hash

def seed_admin():
    db = SessionLocal()
    admin_emails = ["admin@medxpharmacy.com", "admin@medicalstore.com"]
    
    for email in admin_emails:
        existing = db.query(User).filter(User.email == email).first()
        if not existing:
            admin_user = User(
                email=email,
                hashed_password=get_password_hash("admin123"),
                full_name="Store Admin",
                role=RoleEnum.ADMIN,
                is_active=True
            )
            db.add(admin_user)
            db.commit()
            print(f"Admin user created: {email} / admin123")
        else:
            existing.hashed_password = get_password_hash("admin123")
            existing.is_active = True
            db.commit()
            print(f"Admin password reset to: {email} / admin123")
    
    db.close()

if __name__ == "__main__":
    seed_admin()
