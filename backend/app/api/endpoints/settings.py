from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from app.api import deps
from app.models.settings import StoreSettings
from app.models.user import RoleEnum, User
from app.schemas.settings import StoreSettingsResponse, StoreSettingsUpdate
from app.core.config import settings as app_settings
import os
import shutil
import glob
import json
from decimal import Decimal
from datetime import datetime, date, timezone
from app.core.timezone import IST
from app.database.database import engine
from sqlalchemy import inspect

router = APIRouter()

def get_or_create_settings(db: Session, branch_id: int) -> StoreSettings:
    settings = db.query(StoreSettings).filter(StoreSettings.branch_id == branch_id).first()
    if not settings:
        if branch_id == 2:
            settings = StoreSettings(
                store_name="MedX Pharmacy",
                phone="+91 8307407566",
                email="medxpharmacy7170@gmail.com",
                address="House No. 192-A, Shivpuri, BudhiSingh Pura, Jaipur, Rajasthan",
                gstin="",
                default_tax_rate=12.0,
                print_gstin=False,
                branch_id=2
            )
        else:
            settings = StoreSettings(
                store_name="MedX Pharmacy",
                phone="+91 9145887170",
                email="medxpharmacy7170@gmail.com",
                address="Plot No. 20A, Chandan Vihar, Near Coaching Hub, Jaipur, Rajasthan",
                gstin="08GSFPD9061R1ZY",
                default_tax_rate=12.0,
                print_gstin=True,
                branch_id=branch_id
            )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@router.get("/", response_model=StoreSettingsResponse)
def get_settings(
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    authorized_branch = deps.get_authorized_branch_id(branch_id, current_user)
    bid = authorized_branch or current_user.branch_id or 1
    settings = get_or_create_settings(db, bid)
    return settings

@router.put("/", response_model=StoreSettingsResponse)
def update_settings(
    settings_in: StoreSettingsUpdate,
    branch_id: Optional[int] = None,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_admin)
):
    authorized_branch = deps.get_authorized_branch_id(branch_id, current_user)
    bid = authorized_branch or current_user.branch_id or 1
    settings = get_or_create_settings(db, bid)
    
    update_data = settings_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)
        
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings

# Resolve directory paths for database backups
BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "backups")
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "medical_store.db")

@router.post("/backup")
def create_database_backup(
    db: Session = Depends(deps.get_db),
    current_admin: User = Depends(deps.get_current_active_admin)
):
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = datetime.now(IST).strftime("%Y%m%d-%H%M%S")
        
        # PostgreSQL / Managed Storage: full JSON table data dump
        if "sqlite" not in app_settings.SQLALCHEMY_DATABASE_URI:
            backup_filename = f"backup-{timestamp}.json"
            dest_path = os.path.join(BACKUP_DIR, backup_filename)
            
            insp = inspect(engine)
            backup_payload = {
                "metadata": {
                    "backup_timestamp": datetime.now(IST).isoformat(),
                    "timezone": "Asia/Kolkata (IST)",
                    "created_by": current_admin.email,
                    "database_engine": "PostgreSQL",
                    "version": "1.0"
                },
                "tables": {}
            }
            
            def default_serializer(obj):
                if isinstance(obj, (date, datetime)):
                    return obj.isoformat()
                if isinstance(obj, Decimal):
                    return str(obj)
                return str(obj)

            with engine.connect() as conn:
                for table_name in insp.get_table_names():
                    rows = conn.execute(text(f'SELECT * FROM "{table_name}"')).mappings().all()
                    backup_payload["tables"][table_name] = [dict(r) for r in rows]
            
            with open(dest_path, "w", encoding="utf-8") as f:
                json.dump(backup_payload, f, default=default_serializer, indent=2)
                
            return {
                "message": "Database backup created successfully",
                "filename": backup_filename,
                "size_bytes": os.path.getsize(dest_path)
            }
            
        # Development SQLite fallback
        backup_filename = f"backup-{timestamp}.db"
        dest_path = os.path.join(BACKUP_DIR, backup_filename)
        if os.path.exists(DB_PATH):
            shutil.copy2(DB_PATH, dest_path)
            size = os.path.getsize(dest_path)
        else:
            size = 0
            
        return {
            "message": "Backup created successfully",
            "filename": backup_filename,
            "size_bytes": size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup creation failed: {str(e)}")

@router.get("/backups")
def list_backups(
    current_admin: User = Depends(deps.get_current_active_admin)
):
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        # Search for all backup files (.json, .db, .sql, etc.)
        files = glob.glob(os.path.join(BACKUP_DIR, "backup-*"))
        backups_list = []
        for f in files:
            if not os.path.isfile(f):
                continue
            stat = os.stat(f)
            backups_list.append({
                "filename": os.path.basename(f),
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime, tz=IST).isoformat()
            })
        backups_list.sort(key=lambda x: x["created_at"], reverse=True)
        return backups_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Listing backups failed: {str(e)}")

@router.get("/backups/{filename}/download")
def download_backup_file(
    filename: str,
    current_admin: User = Depends(deps.get_current_active_admin)
):
    file_path = os.path.join(BACKUP_DIR, filename)
    real_path = os.path.abspath(file_path)
    real_backup_dir = os.path.abspath(BACKUP_DIR)
    if not real_path.startswith(real_backup_dir) or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Backup file not found")
        
    return FileResponse(file_path, filename=filename, media_type="application/octet-stream")

@router.delete("/backups/{filename}")
def delete_backup_file(
    filename: str,
    current_admin: User = Depends(deps.get_current_active_admin)
):
    file_path = os.path.join(BACKUP_DIR, filename)
    real_path = os.path.abspath(file_path)
    real_backup_dir = os.path.abspath(BACKUP_DIR)
    if not real_path.startswith(real_backup_dir) or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Backup file not found")
        
    os.remove(file_path)
    return {"message": f"Backup {filename} deleted successfully"}

@router.post("/optimize")
def optimize_database(
    db: Session = Depends(deps.get_db),
    current_admin: User = Depends(deps.get_current_active_admin)
):
    try:
        before_bytes = os.path.getsize(DB_PATH)
        
        db.execute(text("VACUUM"))
        db.commit()
        
        after_bytes = os.path.getsize(DB_PATH)
        saved_bytes = max(0, before_bytes - after_bytes)
        
        return {
            "message": "Database optimized successfully",
            "size_before": before_bytes,
            "size_after": after_bytes,
            "space_saved": saved_bytes
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")
