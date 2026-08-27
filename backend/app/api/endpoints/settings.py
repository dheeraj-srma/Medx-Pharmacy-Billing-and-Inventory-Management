from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api import deps
from app.models.settings import StoreSettings
from app.schemas.settings import StoreSettingsResponse, StoreSettingsUpdate
from app.models.user import User
import os
import shutil
import glob
from datetime import datetime, timezone

router = APIRouter()

def get_or_create_settings(db: Session) -> StoreSettings:
    settings = db.query(StoreSettings).first()
    if not settings:
        settings = StoreSettings(
            store_name="MedX Pharmacy",
            phone="+91 9145887170",
            email="medxpharmacy7170@gmail.com",
            address="Plot No. 20A, Chandan Vihar, Near Coaching Hub, Jaipur, Rajasthan",
            gstin="08GSFPD9061R1ZY",
            default_tax_rate=12.0,
            print_gstin=True
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@router.get("/", response_model=StoreSettingsResponse)
def get_settings(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    settings = get_or_create_settings(db)
    return settings

@router.put("/", response_model=StoreSettingsResponse)
def update_settings(
    settings_in: StoreSettingsUpdate,
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_active_user)
):
    settings = get_or_create_settings(db)
    
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
    current_admin: User = Depends(deps.get_current_active_admin)
):
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_filename = f"backup-{timestamp}.db"
        dest_path = os.path.join(BACKUP_DIR, backup_filename)
        
        shutil.copy2(DB_PATH, dest_path)
        
        return {
            "message": "Backup created successfully",
            "filename": backup_filename,
            "size_bytes": os.path.getsize(dest_path)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup creation failed: {str(e)}")

@router.get("/backups")
def list_backups(
    current_admin: User = Depends(deps.get_current_active_admin)
):
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        files = glob.glob(os.path.join(BACKUP_DIR, "backup-*.db"))
        backups_list = []
        for f in files:
            stat = os.stat(f)
            backups_list.append({
                "filename": os.path.basename(f),
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
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
