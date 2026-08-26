from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.settings import StoreSettings
from app.schemas.settings import StoreSettingsResponse, StoreSettingsUpdate

router = APIRouter()

def get_or_create_settings(db: Session) -> StoreSettings:
    settings = db.query(StoreSettings).first()
    if not settings:
        settings = StoreSettings(
            store_name="MedEx Pharmacy",
            phone="+91 9145887170",
            email="contact@medex.com",
            address="Mumbai, India",
            gstin="",
            default_tax_rate=12.0
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
