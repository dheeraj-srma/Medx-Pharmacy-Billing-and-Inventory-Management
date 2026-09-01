from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlalchemy.orm import Session
from app.core.config import settings
from app.database.database import get_db
from app.models.user import User, RoleEnum
from app.models.branch import Branch

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(reusable_oauth2)
) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub: str = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Support both immutable user ID (preferred) and legacy email subject
    if str(sub).isdigit():
        user = db.query(User).filter(User.id == int(sub)).first()
    else:
        user = db.query(User).filter(User.email == sub).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated. Contact administrator.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user

def get_current_active_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if current_user.role not in (RoleEnum.ADMIN, RoleEnum.SUPERADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required."
        )
    return current_user

def get_current_superadmin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if current_user.role != RoleEnum.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin / Owner privileges required."
        )
    return current_user

def get_authorized_branch_id(
    branch_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user)
) -> Optional[int]:
    """
    Centralized Branch Authorization Dependency.
    - Superadmin / Owner: can query a specific branch_id or query None (all branches).
    - Staff / Admin: STRICTLY bound to current_user.branch_id. If a client attempts
      to supply a different branch_id, access is rejected with 403 Forbidden.
    """
    if current_user.role == RoleEnum.SUPERADMIN:
        return branch_id
    
    # Regular users cannot cross-query branches
    if branch_id is not None and branch_id != current_user.branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cross-branch access denied. You are only authorized for Branch {current_user.branch_id}."
        )
    return current_user.branch_id

def require_user_branch_id(
    current_user: User = Depends(get_current_active_user)
) -> int:
    """
    Ensures transactional mutations (sales, purchases, adjustments) occur strictly
    within the authenticated user's assigned branch.
    """
    if not current_user.branch_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not assigned to any pharmacy branch."
        )
    return current_user.branch_id

def get_current_branch(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> Optional[Branch]:
    if not current_user.branch_id:
        return None
    return db.query(Branch).filter(Branch.id == current_user.branch_id).first()
