import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.database import SessionLocal
from app.models.branch import Branch
from app.models.settings import StoreSettings
from app.models.user import User, RoleEnum
from app.core.security import get_password_hash

def seed_database():
    db = SessionLocal()
    try:
        # 1. Ensure Branches exist
        branches_data = [
            {
                "id": 1,
                "name": "Main Branch",
                "code": "BR01",
                "address": "Plot No. 20A, Chandan Vihar, Near Coaching Hub, Jaipur, Rajasthan",
                "phone": "+91 9145887170",
                "email": "medxpharmacy7170@gmail.com",
                "is_active": True
            },
            {
                "id": 2,
                "name": "Branch 2",
                "code": "BR02",
                "address": "House No. 192-A, Shivpuri, BudhiSingh Pura, Jaipur, Rajasthan",
                "phone": "+91 8307407566",
                "email": "medxpharmacy7170@gmail.com",
                "is_active": True
            }
        ]

        for b_data in branches_data:
            branch = db.query(Branch).filter(Branch.id == b_data["id"]).first()
            if not branch:
                branch = Branch(**b_data)
                db.add(branch)
                db.commit()
                print(f"Created Branch: {branch.name} (ID: {branch.id}, Code: {branch.code})")
            else:
                branch.name = b_data["name"]
                branch.code = b_data["code"]
                branch.address = b_data["address"]
                branch.phone = b_data["phone"]
                branch.email = b_data["email"]
                branch.is_active = b_data["is_active"]
                db.commit()

        # 2. Ensure Store Settings exist for both branches
        settings_data = [
            {
                "branch_id": 1,
                "store_name": "MedX Pharmacy",
                "phone": "+91 9145887170",
                "email": "medxpharmacy7170@gmail.com",
                "address": "Plot No. 20A, Chandan Vihar, Near Coaching Hub, Jaipur, Rajasthan",
                "gstin": "08GSFPD9061R1ZY",
                "default_tax_rate": 12.0,
                "print_gstin": True
            },
            {
                "branch_id": 2,
                "store_name": "MedX Pharmacy",
                "phone": "+91 8307407566",
                "email": "medxpharmacy7170@gmail.com",
                "address": "House No. 192-A, Shivpuri, BudhiSingh Pura, Jaipur, Rajasthan",
                "gstin": "",
                "default_tax_rate": 12.0,
                "print_gstin": False
            }
        ]

        for s_data in settings_data:
            setting = db.query(StoreSettings).filter(StoreSettings.branch_id == s_data["branch_id"]).first()
            if not setting:
                setting = StoreSettings(**s_data)
                db.add(setting)
                db.commit()
                print(f"Created Store Settings for Branch {setting.branch_id}")

        # 3. Add users (1 Admin, 1 Branch 1 Staff, 1 Branch 2 Staff)
        users_data = [
            {
                "email": "admin@medxpharmacy.com",
                "password": "admin123",
                "full_name": "System Administrator",
                "role": RoleEnum.ADMIN,
                "branch_id": 1,
                "is_active": True
            },
            {
                "email": "staff1@medxpharmacy.com",
                "password": "staff123",
                "full_name": "Branch 1 Staff",
                "role": RoleEnum.STAFF,
                "branch_id": 1,
                "is_active": True
            },
            {
                "email": "staff2@medxpharmacy.com",
                "password": "staff123",
                "full_name": "Branch 2 Staff",
                "role": RoleEnum.STAFF,
                "branch_id": 2,
                "is_active": True
            }
        ]

        for u_data in users_data:
            existing = db.query(User).filter(User.email == u_data["email"]).first()
            if not existing:
                user = User(
                    email=u_data["email"],
                    hashed_password=get_password_hash(u_data["password"]),
                    full_name=u_data["full_name"],
                    role=u_data["role"],
                    branch_id=u_data["branch_id"],
                    is_active=u_data["is_active"]
                )
                db.add(user)
                db.commit()
                print(f"Created user: {user.email} (Role: {user.role.value}, Branch: {user.branch_id})")
            else:
                existing.hashed_password = get_password_hash(u_data["password"])
                existing.full_name = u_data["full_name"]
                existing.role = u_data["role"]
                existing.branch_id = u_data["branch_id"]
                existing.is_active = u_data["is_active"]
                db.commit()
                print(f"Updated user: {existing.email} (Role: {existing.role.value}, Branch: {existing.branch_id})")

    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
