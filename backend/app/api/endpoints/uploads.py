from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.api.deps import get_current_active_admin
from app.core.config import settings
import shutil
import os
import uuid

router = APIRouter()

@router.on_event("startup")
def ensure_upload_dir():
    if not os.path.exists(settings.UPLOAD_DIR):
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


@router.post("/", response_model=dict)
def upload_image(
    file: UploadFile = File(...),
    current_user = Depends(get_current_active_admin)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    file_extension = file.filename.split(".")[-1]
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"url": f"/uploads/{unique_filename}"}
